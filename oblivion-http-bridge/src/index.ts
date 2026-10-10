/**
 * @oblivion/http-bridge · 插件入口。
 *
 * 只做一件事：把 `@oblivion/core` 已经**装好**的 MCP 端点挂到一个固定的本机
 * HTTP 地址上，供 DeepSeek++ 浏览器扩展以 `streamable_http` 传输接入。
 *
 * ## 职责边界（2026-10-06 裁定）
 *
 * MCP 的**协议分发与工具面属于 core 的内部模块**（`oblivion-core/src/mcp/`）：
 * `initialize` / `tools/list` / `tools/call`、两个 `oblivion_*` 工具、错误码，
 * 全都在那边。本包只负责**传输**：
 *
 *   路由 → CORS → 鉴权 → 读体（有界）→ 交给端点 → 落 HTTP 状态码
 *
 * 所以本包不再认识「门面」（`OblivionFacade`），也不 import core 的任何模块；
 * 它只按 `src/channel.ts` 的契约从进程内通道取一个 `handle(rawBody)`。
 *
 * ## 为什么是 `inject: []`（根因修复）
 *
 * 旧版写 `inject = ['oblivion']`，Cordis 的 `fiber._refresh()` 会遍历
 * `Object.keys(this.inject)`，任一服务取不到就把 epoch 置 INACTIVE ——
 * 插件停在 pending，**`apply()` 一次都不跑**。实测证据：
 *
 *   - `C:\Users\liveu\.oblivion\bridge-heartbeat.json` 不存在；
 *   - 42081 从未被监听；
 *   - 日志里没有任何 bridge 记录。
 *
 * 服务可见性依作用域而变（core provide 到自己的上下文，bridge 在自己的 fiber
 * 里 `get()` 拿不到），改组合层也治不了「任何一处组合变化就整包不激活」。
 * 改成空 inject 后 bridge **永远能激活**：拿不到端点时如实回 503 并写明原因，
 * 而不是静默不启动 —— 一个「必须稳定监听固定端口」的服务不该把启动条件
 * 押在别人的装载顺序上。
 *
 * ## 为什么自带 `node:http` 而不是用 `ctx.webServer`
 *
 * 初版 inject `['webServer', 'credentials']`，实测在 desktop profile **起不来**：
 * `webServer` 由 `@deepseek-ai/dsh-web-app` 提供，而 desktop 的
 * `dsh.profile.bundles` 只有 `dsh-base` + 第三方插件，没有 web-app。
 * 用 `node:http` 后两个 profile 都能跑，且端口可以**固定**（42081）——
 * DSH 默认每次启动分配随机端口，扩展里填的 URL 下次就失效。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkAuth, readToken } from './auth.js';
import { HttpError, readBody } from './body.js';
import { describeOblivionChannel, resolveOblivionEndpoint } from './channel.js';
import { resolveConfig } from './config.js';
import type { AppContext, ResolvedConfig } from './types.js';

export const name = '@oblivion/http-bridge';

/**
 * **空数组是刻意的**，理由见文件头「为什么是 inject: []」。
 *
 * 空的另一个好处：本包可以在任何 profile、任何装载顺序下激活，
 * 「端点还没就绪」于是变成一个**可诊断的 503**，而不是一次静默的 pending。
 */
export const inject = [];

/** DSHX 的 boot marker 必须与 dshx.yml 逐字一致。 */
const MARKER = '[oblivion-http-bridge] loaded';

/** 构建时由 esbuild 注入；未注入（直接跑源码）时退化为未知。 */
const VERSION = typeof __OBLIVION_BRIDGE_VERSION__ === 'string' ? __OBLIVION_BRIDGE_VERSION__ : '0.0.0-unknown';

/** 进程内通道读取口的**中文原因**，直接进 503 的 message 与日志。 */
type UnavailableReason = string;

/**
 * 凭据来源的**人类可读描述**（只写来源名，绝不写密钥本身）。
 *
 * 启动日志里打这个而不是打 token：日志会被导出/分享，密钥不能进去。
 */
function credentialSource(config: ResolvedConfig): string {
  if (config.token !== '') return 'config.token';
  if (config.tokenFile !== '') return `file:${config.tokenFile}`;
  return `env:${config.tokenEnv}`;
}

function corsHeaders(origin: string, allowedOrigins: string[]): Record<string, string> {
  if (origin === '' || !allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

/** 一次性探针的写入（失败只 warn，绝不影响主流程）。 */
function writeHeartbeat(
  ctx: AppContext,
  path: string,
  config: ResolvedConfig,
  gotConfig: Partial<ResolvedConfig> | undefined,
): void {
  try {
    const heartbeat = {
      writtenBy: '@oblivion/http-bridge',
      at: new Date().toISOString(),
      pid: process.pid,
      version: VERSION,
      // apply 收到的什么
      gotConfig: gotConfig === undefined ? 'undefined' : Object.keys(gotConfig).join(','),
      resolvedPort: config.port,
      credentialSource: credentialSource(config),
      tokenEnvValue:
        process.env[config.tokenEnv] === undefined
          ? 'undefined'
          : `len:${String(process.env[config.tokenEnv]).length}`,
      // 依赖面：空 inject 是「永远能激活」的保证（见文件头）
      inject: [] as string[],
      // 通道现状：端点缺席时这里是 present:false + 中文原因
      mcpEndpoint: describeOblivionChannel(),
      ctxKeys: ((): string => {
        try {
          return Object.keys(ctx as object).join(',');
        } catch {
          return '(throws)';
        }
      })(),
    };
    const dir = join(homedir(), '.oblivion');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(heartbeat, null, 2), 'utf8');
  } catch (error: unknown) {
    ctx.logger?.warn?.(
      `[oblivion-bridge] heartbeat 写入失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function apply(rawCtx: unknown, rawConfig?: Partial<ResolvedConfig>): void {
  const ctx = rawCtx as AppContext;
  const config = resolveConfig(rawConfig);
  const heartbeatPath = join(homedir(), '.oblivion', 'bridge-heartbeat.json');
  /** 端点**首次**成功解析过没有：只在第一次解析成功时再刷心跳。 */
  let endpointSeen = false;

  const log = (message: string): void => {
    if (config.debug) ctx.logger?.info?.(`[oblivion-bridge] ${message}`);
  };

  // ══════════════════════════════════════════════════════════════════
  // 心跳探针
  //
  // 为什么必须放在**最前面**、早于任何 return：
  //
  // 症状「端口 42081 不开、无 error 日志、无本次启动日志」有四种可能：
  //   ① 本包根本没被加载器激活（依赖判定挡下）
  //   ② 激活了但走到下面的凭据判断 return（只留一行 info）
  //   ③ 激活了、监听了、但 listen 失败（有 warn 日志）
  //   ④ 激活了但 apply 抛异常（宿主会记错）
  //
  // 心跳文件的存在与时间戳一次就能区分 ①② 与 ③④：
  //   文件不存在/时间旧 → ①（问题在加载器层）
  //   文件新但端口不开 → ②③④（问题在 apply 内部）
  //
  // 字段 `inject` 与 `mcpEndpoint` 是本次新加的：前者证明依赖面是空的，
  // 后者让文件能反映「传输起来了但端点缺席」→「端点就绪」的转变
  // （首次解析成功时**重刷**一次，见下面 handleRequest）。
  writeHeartbeat(ctx, heartbeatPath, config, rawConfig);

  // 凭据来源全空 ⇒ 不启动服务器。插件其余部分（若有）不受影响。
  //
  // 注意判据是「三条来源都没配置」，不是「tokenEnv 为空」——
  // 直给与文件是 2026-10-06 加的绕开环境继承的路径，只配了它们时
  // tokenEnv 仍是默认值（非空），但真正能用的是前者。
  if (config.token === '' && config.tokenFile === '' && config.tokenEnv === '') {
    ctx.logger?.info?.('[oblivion-bridge] 未配置任何凭据来源，桥接端点已禁用');
    return;
  }

  const server: Server = createServer((request, response) => {
    void handleRequest(ctx, config, request, response, log, {
      refreshHeartbeat: (): void => {
        if (endpointSeen) return;
        endpointSeen = true;
        writeHeartbeat(ctx, heartbeatPath, config, rawConfig);
        log(`endpoint ready · ${JSON.stringify(describeOblivionChannel())}`);
      },
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      ctx.logger?.warn?.(`[oblivion-bridge] unhandled: ${reason}`);
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      }
      response.end('internal error');
    });
  });

  // 监听失败（端口占用等）：记日志但不抛，避免拖垮整个 App 启动
  server.on('error', (error: Error) => {
    ctx.logger?.warn?.(`[oblivion-bridge] server error: ${error.message}`);
  });

  server.listen(config.port, config.host, () => {
    ctx.logger?.info?.(
      `[oblivion-bridge] listening · http://${config.host}:${config.port}${config.path} · 凭据来源=${credentialSource(config)}`,
    );
    // 「传输起来了但没有端点」这一态写进日志（心跳文件里也有）：
    // 端点缺席不再是静默的，而是一行能指认的证据。
    const channel = describeOblivionChannel();
    if (!channel.present) {
      ctx.logger?.info?.(`[oblivion-bridge] MCP 端点尚未就绪：${channel.reason}（请求会如实回 503）`);
    }
  });

  // 用 ctx.effect 注册清理：HMR 重载 / 卸载时必须关掉监听，否则端口泄漏
  ctx.effect(
    () => () => {
      server.close();
    },
    'oblivion-http-bridge: http server',
  );

  console.log(MARKER);
}

/** 单请求处理：路由 → 健康路由/CORS → 鉴权 → 读体 → 交给端点。 */
async function handleRequest(
  ctx: AppContext,
  config: ResolvedConfig,
  request: IncomingMessage,
  response: ServerResponse,
  log: (message: string) => void,
  hooks: { refreshHeartbeat(): void },
): Promise<void> {
  const url = request.url ?? '';
  const pathname = url.split('?')[0] ?? '';
  const healthPath = `${config.path}/health`;

  // 只有两个路径存在，都用**精确匹配**：桥接只暴露一个端点 + 一个只读健康
  // 路由，多一个路径就多一份攻击面。
  if (pathname !== config.path && pathname !== healthPath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'content-length': '9' });
    response.end('not found');
    return;
  }

  const origin = String(request.headers.origin ?? '');
  const cors = corsHeaders(origin, config.allowedOrigins);

  const send = (status: number, body: string | unknown, extra: Record<string, string> = {}): void => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    response.writeHead(status, {
      'content-type':
        typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(payload)),
      'cache-control': 'no-store',
      ...cors,
      ...extra,
    });
    response.end(payload);
  };

  // CORS 预检：不必鉴权（预检不带 Authorization）
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { ...cors, 'content-length': '0' });
    response.end();
    return;
  }

  // ── 健康路由：GET <path>/health ──
  //
  // **不需要 token**：它只回「桥接有没有起来、端点有没有就绪」，不含任何
  // 敏感信息；而它最有用的时刻恰恰是「token 配错了，扩展连不上」的时候。
  // 服务器本身只监听回环（config.host 固定 127.0.0.1），所以它不构成泄漏面。
  if (pathname === healthPath) {
    if (request.method !== 'GET') {
      send(405, 'method not allowed', { allow: 'GET' });
      return;
    }
    send(200, {
      ok: true,
      version: VERSION,
      port: config.port,
      path: config.path,
      uptimeMs: Math.round(performance.now()),
      endpoint: describeOblivionChannel(),
    });
    return;
  }

  if (request.method !== 'POST') {
    send(405, 'method not allowed', { allow: 'POST, OPTIONS' });
    return;
  }

  const token = readToken(config.token, config.tokenFile, config.tokenEnv);
  const verdict = checkAuth(request, token, config.requireLoopback);
  if (!verdict.ok) {
    log(`auth: rejected (${verdict.reason})`);
    send(verdict.status, 'unauthorized');
    return;
  }

  // 端点**每个请求**惰性解析一次：core 可能刚 HMR 重载换了实例，
  // 缓存端点等于拿着旧门面写盘。解析不到 → 503 + 中文原因（不是 500、不是静默）。
  const endpoint = resolveOblivionEndpoint();
  if (endpoint === null) {
    const reason: UnavailableReason = describeOblivionChannel().reason;
    log(`endpoint unavailable: ${reason}`);
    send(503, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32603, message: `oblivion core endpoint unavailable: ${reason}` },
    });
    return;
  }
  // 「端点缺席 → 端点就绪」的转变只在这一刻发生（每个 apply 实例一次）
  hooks.refreshHeartbeat();

  let rawBody: string;
  try {
    rawBody = await readBody(request, config.maxBodyBytes);
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      send(error.status, error.message);
      return;
    }
    log(`body: ${error instanceof Error ? error.message : String(error)}`);
    send(400, 'bad request body');
    return;
  }

  try {
    const result = await endpoint.handle(rawBody, log);
    if (result === undefined || result === null) {
      // 通知：MCP 规范要求回 204 而不是 200
      response.writeHead(204, { ...cors, 'content-length': '0' });
      response.end();
      return;
    }
    send(200, result);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    log(`mcp: unhandled ${reason}`);
    // 协议层兜底：即使内部炸了，也返回合法 JSON-RPC 错误而不是 500
    send(200, { jsonrpc: '2.0', id: null, error: { code: -32603, message: reason } });
  }
}

export default { name, inject, apply };
