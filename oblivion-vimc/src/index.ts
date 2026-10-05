/**
 * @oblivion/vimc — Node 半边（宿主侧）。
 *
 * 只做两件事，都不碰业务逻辑：
 *
 *   ① **留座与自证**：给 Cordis Loader 一个真实可挂载的入口，写启动标记
 *      `console.log('[oblivion-vimc] loaded')`（dshx.yml 的 marker 与它逐字相同），
 *      并落一份 `%TEMP%\oblivion-vimc\host-mount.json` 自证据文件。
 *   ② **诊断接收**：注册 `POST /oblivion-vimc/beat`，把浏览器半边的
 *      「已挂载 / 处理了哪些键」写成 `client-beat.json`。
 *
 * ## 为什么需要 ② 这条自建证据链
 *
 * 本机 DSHX 的验证面全废：`dshx check` / `activate-new-client` / `verify-boot` /
 * `browser open` 都先跑 `dshx creator claim`，而 claim 依赖 POSIX
 * `ps -o lstart=`，Windows 上恒报 `Creator+ Host identity is incomplete`
 * （WORKSPACE.md「已知限制 1」已记录，本插件实测复现）。同时
 * `http://127.0.0.1:19387/` 需要认证，Agent 侧无法直接读 `__DSH_BOOT__`。
 *
 * 于是「客户端半边到底有没有在真实页面里跑起来」只剩一条可自查的路：
 * 插件自己写证据。这两个文件就是验收证据（见 README「验证」节），
 * 不含任何会话内容或凭据。
 *
 * ## 安全边界
 *
 * 路由只接受 POST，且校验来源（桌面端转发会**删掉 Origin**，所以缺省视为可信，
 * 与 @oblivion/brand 的重启路由同一判据）；请求体限长 8 KiB；
 * 落盘内容只有版本、命令名、计数器、UA 与配置快照。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * 自证据文件目录。
 *
 * 可用 `OBLIVION_VIMC_EVIDENCE_DIR` 覆盖 —— 单元测试必须用它把证据写到**沙箱目录**，
 * 否则跑一次 `npm test` 就会覆盖掉真实 Host 写下的运行证据（这一条是被实测坑出来的：
 * 测试用本机 node 覆盖了宿主进程的 host-mount.json）。
 */
const EVIDENCE_DIR = process.env.OBLIVION_VIMC_EVIDENCE_DIR?.trim() || join(tmpdir(), 'oblivion-vimc');

/** 心跳路由（必须与浏览器半边 beat.ts 的 endpoint 一致）。 */
const BEAT_PATH = '/oblivion-vimc/beat';

/** 请求体上限。 */
const MAX_BODY_BYTES = 8192;

/** 进程内的心跳汇总（重启 Host 后重新开始，文件里保留最后一次快照）。 */
interface BeatSummary {
  count: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastCommand?: string;
  userAgent?: string;
  clientVersion?: string;
  commands: Record<string, number>;
  config?: unknown;
  /** 客户端挂载/自检时的只读自检（锚点解析 + 插件自身开销）。 */
  probe?: unknown;
  /** 最近一次上报的按键处理开销（真实页面里的实测延迟）。 */
  perf?: unknown;
  /** 最近一条心跳的原始负载（排错时最有用的一栏）。 */
  lastPayload?: unknown;
}

/** 心跳落盘的合并窗口：心跳到达很频繁，但**没必要每来一条就同步写一次盘**。 */
const EVIDENCE_FLUSH_MS = 750;

const summary: BeatSummary = { count: 0, commands: {} };

/** 宿主侧最小上下文面（不 import 宿主包，避免与 checkout 版本耦合）。 */
interface RouteScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: IncomingMessage, response: ServerResponse) => void;
    }): () => void;
  };
}

interface HostCtx {
  inject?(deps: readonly string[], callback: (scope: RouteScope) => void): void;
  effect?(callback: () => (() => void) | void, label?: string): void;
  logger?(name: string): { info(message: string): void; warn(message: string): void };
  provide?(name: string, value: unknown): unknown;
}

function writeEvidence(file: string, payload: unknown): string | null {
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const path = join(EVIDENCE_DIR, file);
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return path;
  } catch {
    return null;
  }
}

/** 桌面端转发会删掉 `Origin`，所以缺省视为可信；其余只放行本机与 dsh-app:// 来源。 */
function isTrustedCaller(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined || origin === '') return true;
  if (origin === 'null' || origin.startsWith('dsh-app://')) return true;
  try {
    const url = new URL(origin);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]' || url.hostname === '::1';
  } catch {
    return false;
  }
}

/** 读取请求体；超出上限时明确标记，而不是当成空体（空体会污染汇总计数）。 */
function readBody(request: IncomingMessage): Promise<{ body: string; overflow: boolean }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflow = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      resolve({ body: overflow ? '' : Buffer.concat(chunks).toString('utf8'), overflow });
    });
    request.on('error', () => {
      resolve({ body: '', overflow: false });
    });
  });
}

function recordBeat(payload: Record<string, unknown>): BeatSummary {
  const now = new Date().toISOString();
  const command = typeof payload.command === 'string' ? payload.command : 'unknown';
  summary.count += 1;
  summary.firstSeenAt ??= now;
  summary.lastSeenAt = now;
  summary.lastCommand = command;
  summary.commands[command] = (summary.commands[command] ?? 0) + 1;
  if (typeof payload.userAgent === 'string' && payload.userAgent !== '') summary.userAgent = payload.userAgent;
  if (typeof payload.version === 'string' && payload.version !== '') summary.clientVersion = payload.version;
  if (payload.config !== undefined) summary.config = payload.config;
  if (payload.probe !== undefined) summary.probe = payload.probe;
  if (payload.perf !== undefined) summary.perf = payload.perf;
  summary.lastPayload = payload;
  scheduleEvidenceFlush();
  return summary;
}

let flushTimer: NodeJS.Timeout | null = null;

/**
 * 合并窗口内的心跳只写一次盘（尾部必写，所以最终快照不会丢）。
 *
 * `writeFileSync` 是同步 IO：每个按键都写一次会把这个「诊断功能」变成真实开销。
 * 750ms 的合并窗口让「长按 s」这类连发最多每 750ms 落一次盘。
 */
function scheduleEvidenceFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeEvidence('client-beat.json', {
      plugin: '@oblivion/vimc',
      hostVersion: __OBLIVION_VIMC_VERSION__,
      hostPid: process.pid,
      ...summary,
    });
  }, EVIDENCE_FLUSH_MS);
  // 不阻止进程退出（Host 关闭时丢掉最后一条心跳是可以接受的）。
  flushTimer.unref?.();
}

function installBeatRoute(ctx: HostCtx, warn: (message: string) => void): void {
  if (typeof ctx.inject !== 'function') {
    warn('上下文没有 inject：诊断路由未挂载（浏览器半边仍会装按键引擎）');
    return;
  }
  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用：诊断路由未挂载');
      return;
    }
    const dispose = server.register({
      kind: 'exact',
      path: BEAT_PATH,
      handler: (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        if (!isTrustedCaller(request)) {
          response.writeHead(403, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'untrusted origin' }));
          return;
        }
        void readBody(request).then(({ body, overflow }) => {
          if (overflow) {
            response.writeHead(413, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: false, error: 'body too large' }));
            return;
          }
          let payload: Record<string, unknown> = {};
          try {
            const parsed: unknown = body === '' ? {} : JSON.parse(body);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
              payload = parsed as Record<string, unknown>;
            }
          } catch {
            response.writeHead(400, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: false, error: 'invalid json' }));
            return;
          }
          const recorded = recordBeat(payload);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, count: recorded.count }));
        });
      },
    });
    ctx.effect?.(() => dispose, 'oblivion-vimc: 诊断路由');
    ctx.logger?.('@oblivion/vimc').info(`诊断路由已挂载：POST ${BEAT_PATH}`);
  });
}

/** Cordis 插件入口（函数式插件：具名导出 apply，不默认导出）。 */
export function apply(ctx: HostCtx): void {
  // ⚠️ 这一行是 dshx.yml 的 marker，**逐字**不能改（dshx verify-boot 靠它证明
  // apply() 真的跑过）。
  console.log('[oblivion-vimc] loaded');

  const logger = ctx.logger?.('@oblivion/vimc');
  const warn = (message: string): void => {
    logger?.warn(message);
  };

  writeEvidence('host-mount.json', {
    plugin: '@oblivion/vimc',
    version: __OBLIVION_VIMC_VERSION__,
    // 载入的模块 URL：用于回答「现在跑的是不是最新构建」（Host 可能按修订号
    // 追加查询串，或复用 ESM 缓存里的旧模块 —— 见 README「迭代」节）。
    moduleUrl: import.meta.url,
    pid: process.pid,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    mountedAt: new Date().toISOString(),
    evidenceDir: EVIDENCE_DIR,
    beatPath: BEAT_PATH,
  });

  // 卸载自证：等价于 dshx 的「cleanup proved」。禁用/卸载本行时（profile 补丁里给
  // 本 id 加 `disabled: true`，或插件被移除）写出这份文件 —— 说明效果是被**摘掉**
  // 而不是残留。宿主半边没有全局副作用，唯一需要清掉的是诊断路由的 dispose。
  ctx.effect?.(() => () => {
    writeEvidence('host-unmount.json', {
      plugin: '@oblivion/vimc',
      version: __OBLIVION_VIMC_VERSION__,
      pid: process.pid,
      unmountedAt: new Date().toISOString(),
    });
  }, 'oblivion-vimc: 卸载自证');

  // 给 Host 侧一个可检出的身份（`cordis_inspect_query` 的 Service 目录会列出它）。
  try {
    ctx.provide?.('oblivionVimc', {
      version: __OBLIVION_VIMC_VERSION__,
      describe: () => 'Oblivion 键盘导航插件（宿主半边：启动标记 + 诊断路由）',
    });
  } catch (error) {
    warn(`provide 失败：${error instanceof Error ? error.message : String(error)}`);
  }

  installBeatRoute(ctx, warn);
}
