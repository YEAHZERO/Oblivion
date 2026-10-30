/**
 * DSH 会话导入的 **HTTP 通路**：`GET|POST /oblivion-core/sessions[/import]`（DEC-034）。
 *
 * ## 为什么这条路由必须由 core 自己挂
 *
 * 与 `settings-route.ts` 同一条纪律：面板是**只读数据面**，拿不到跨插件的
 * Cordis 服务（桥接 `inject: ['oblivion']` 实测从未激活）⇒ 凡是带写语义的
 * （导入 = 写知识库）都只能由 core 挂路由、面板 `fetch` 同源。
 *
 * ## 三处边界
 *
 *   ① **GET 只读、开放**：扫描 `~/.dsh/sessions` 拿摘要，与 `oblivion_session_scan`
 *      工具同口径。无信任来源校验（与会话读回路由一致：只回摘要，不含正文）。
 *   ② **POST 写语义、校验来源**：`isTrustedCaller`（桌面端转发删 `Origin` ⇒ 缺省可信；
 *      给了就必须是本机 / `dsh-app://`）+ **confirm 双门**（`confirm !== true` 一律按
 *      dry-run 处理，只返回预览不落盘）——与模型工具 `oblivion_session_import` 同一道闸。
 *   ③ **装的失败永不抛**：`webServer` 缺席只记一条 warn（插件其余部分照常），
 *      与 `installSettingsRoute` / `publishMcp` 同一条降级原则。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppContext } from './core-types.js';
import type { KnowledgeService, StructuredInput } from './knowledge/index.js';
import { importSessions, scanSessions } from './knowledge/session-import.js';

/** 路由路径：与本仓其余插件同一套命名（`/oblivion-core/settings` / `/oblivion-panel/status`）。 */
export const SESSIONS_ROUTE = '/oblivion-core/sessions';
export const SESSIONS_IMPORT_ROUTE = '/oblivion-core/sessions/import';

/** 请求体上限：导入参数是个小对象（ids + 选项），64 KiB 已经很宽松。 */
const MAX_BODY_BYTES = 64 * 1024;

interface RouteScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: IncomingMessage, response: ServerResponse) => void;
    }): unknown;
  };
}

export interface SessionRouteDeps {
  knowledge: KnowledgeService;
  version: string;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

/** 桌面端转发会删掉 `Origin`，所以缺省视为可信；其余只放行本机与 `dsh-app://` 来源。 */
function isTrustedCaller(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined || origin === '') return true;
  if (origin === 'null' || origin.startsWith('dsh-app://')) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/** 读请求体；超限时明确标记（别把「太大」当成「空体」，那会把一次误操作记成一次成功）。 */
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

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

/** 已有条目的 session 来源 ref（`<sessionId>#turn-<n>`），去重用。 */
function knownSessionRefs(knowledge: KnowledgeService): Set<string> {
  const refs = new Set<string>();
  for (const item of knowledge.index.all()) {
    for (const source of item.sources) {
      if (source.type === 'session') refs.add(source.ref);
    }
  }
  return refs;
}

/**
 * 装路由。**永不抛**（与 `installSettingsRoute` 同一条原则：可选功能出问题不该把整个
 * `apply()` 弄崩）。回 `true` 表示挂上了 —— 便于自检/面板在启动日志里对一眼。
 */
export function installSessionRoutes(ctx: AppContext, deps: SessionRouteDeps): boolean {
  const warn = deps.warn ?? (() => {});
  try {
    if (typeof ctx.inject !== 'function') {
      warn('上下文没有 inject：会话路由未挂载（插件其余部分照常）');
      return false;
    }
    // `AppContext.inject` 的签名收的是 `AppContext` 回调；这里要的是**注入后的 scope**
    // （`webServer` 只在那上面可读），所以显式收窄一次回调参数类型。
    const inject = ctx.inject as unknown as (
      services: readonly string[],
      fn: (scope: RouteScope) => void,
    ) => unknown;
    inject(['webServer'], (scope) => {
      const server = scope.webServer;
      if (server === undefined || typeof server.register !== 'function') {
        warn('webServer 不可用：会话路由未挂载');
        return;
      }

      // ---- GET /oblivion-core/sessions?limit=N —— 只读扫描 ----
      const scanHandler = (request: IncomingMessage, response: ServerResponse): void => {
        if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
          send(response, 405, { ok: false, error: 'method not allowed', allow: 'GET' });
          return;
        }
        void (async () => {
          let limit: number | undefined;
          try {
            const url = new URL(request.url ?? '', 'http://127.0.0.1');
            const raw = url.searchParams.get('limit');
            if (raw !== null && raw !== '') limit = Math.min(200, Math.max(1, Number(raw) || 20));
          } catch {
            // base 只为了相对 URL 可解析；解析失败就用默认。
          }
          const sessions = await scanSessions(limit);
          deps.log?.(`sessions scan: ${String(sessions.length)} session(s)`);
          send(response, 200, { ok: true, version: deps.version, count: sessions.length, sessions });
        })().catch((error: unknown) => {
          warn('会话扫描失败：' + String(error));
          send(response, 500, { ok: false, error: 'scan failed' });
        });
      };

      // ---- POST /oblivion-core/sessions/import —— 写导入（confirm 双门）----
      const importHandler = (request: IncomingMessage, response: ServerResponse): void => {
        if ((request.method ?? 'POST').toUpperCase() !== 'POST') {
          send(response, 405, { ok: false, error: 'method not allowed', allow: 'POST' });
          return;
        }
        if (!isTrustedCaller(request)) {
          send(response, 403, { ok: false, error: 'untrusted origin' });
          return;
        }
        void readBody(request)
          .then(async ({ body, overflow }) => {
            if (overflow) {
              send(response, 413, { ok: false, error: 'body too large' });
              return;
            }
            let payload: unknown = {};
            try {
              payload = body === '' ? {} : (JSON.parse(body) as unknown);
            } catch {
              send(response, 400, { ok: false, error: 'invalid json' });
              return;
            }
            if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
              send(response, 400, { ok: false, error: 'body must be a JSON object' });
              return;
            }
            const rec = payload as Record<string, unknown>;
            const ids = Array.isArray(rec.sessionIds)
              ? rec.sessionIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
              : [];
            // 显式 `patch` 包一层也收（与 settings 路由同一套宽容）。
            const inner =
              rec.patch !== undefined && rec.patch !== null && typeof rec.patch === 'object'
                ? (rec.patch as Record<string, unknown>)
                : rec;
            const maxRaw = Number(inner.maxPerSession ?? 20);
            const maxPerSession = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(100, Math.floor(maxRaw)) : 20;
            const mode = inner.mode === 'digest' ? 'digest' : 'qa';
            // **双门**：`dry_run` 缺省 true；只有 `confirm === true` 才真正落盘。
            // 与模型工具 `oblivion_session_import` 同一口径（防面板误点 = 防模型误调）。
            const confirm = inner.confirm === true;
            const dryRun = inner.dry_run !== false && !confirm;

            if (dryRun) {
              const sessions = await scanSessions(ids.length > 0 ? ids.length : 20);
              send(response, 200, {
                ok: true,
                version: deps.version,
                mode: 'preview',
                dryRun: true,
                sessions: ids.length > 0 ? sessions.filter((s) => ids.includes(s.sessionId)) : sessions,
                hint: 'Pass confirm=true to actually write.',
              });
              return;
            }

            const knownRefs = knownSessionRefs(deps.knowledge);
            const result = await importSessions(
              { sessionIds: ids, maxPerSession, mode, dryRun: false, knownRefs },
              (input: StructuredInput) => deps.knowledge.saveStructured(input),
            );
            deps.log?.(
              `sessions import: imported=${String(result.imported)} skipped=${String(result.skipped)} `
                + `failures=${String(result.failures.length)}`,
            );
            send(response, 200, { ok: true, version: deps.version, ...result });
          })
          .catch((error: unknown) => {
            warn('会话导入失败：' + String(error));
            send(response, 500, { ok: false, error: 'import failed' });
          });
      };

      const disposers: Array<unknown> = [];
      disposers.push(server.register({ kind: 'exact', path: SESSIONS_ROUTE, handler: scanHandler }));
      disposers.push(server.register({ kind: 'exact', path: SESSIONS_IMPORT_ROUTE, handler: importHandler }));
      for (const dispose of disposers) {
        if (typeof dispose === 'function') {
          ctx.effect(() => dispose as () => void, 'oblivion-core: session routes');
        }
      }
      deps.log?.('会话路由已挂载：GET ' + SESSIONS_ROUTE + ' / POST ' + SESSIONS_IMPORT_ROUTE);
    });
    return true;
  } catch (error: unknown) {
    warn('会话路由装载失败（不影响其余功能）：' + String(error));
    return false;
  }
}
