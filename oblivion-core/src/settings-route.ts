/**
 * 设置页的 **HTTP 通路**：`GET|POST /oblivion-core/settings`（DEC-030）。
 *
 * ## 为什么这条路由必须由 core 自己挂
 *
 * 设置页要的两样东西只有 core 有：
 *   ① **生效值 + 来源**（三层配置的合并结果与 `configSources()`）；
 *   ② **写 `<dataRoot>/settings.json`** 的语义（sanitize + 深合并 + 原子写）。
 *
 * 而面板拿不到这些：
 *   - 面板的定位是「**只读**数据面，绝不重写别人的文件」（`oblivion-panel/README.md`）——
 *     把写语义复制过去只会变成两份迟早分叉的 `sanitize`；
 *   - Cordis 服务表**跨插件取不到**（2026-10-17 实测：桥接 `inject: ['oblivion']` 恒取不到、
 *     从未激活）⇒ 面板也不能 `ctx.get('oblivion')` 反过来调 core。
 *
 * 所以：**core 挂路由、面板只 `fetch` 同源的它**。面板那条「只读」的自我约束也就保住了。
 *
 * ## 三处边界
 *
 *   ① **`webServer` 只能经 `ctx.inject(['webServer'])` 拿**。实测（`mount-diag.json`）：
 *      直接读 `ctx.webServer` 会**抛错**（Cordis 对未声明服务的守卫），而 `inject` 是 function。
 *      缺 `webServer` 时**只记一条 warn**，插件其余部分照常 —— 与 `llm` 同一条降级原则。
 *   ② **POST 校验来源**（沿用 `@oblivion/vimc` 已验证的那套）：桌面端转发会**删掉 `Origin`**，
 *      所以缺省视为可信；给了 `Origin` 就必须是本机 / `dsh-app://`。写配置的路由值得这道 CSRF 闸。
 *   ③ **写的东西只能落在 `<dataRoot>/settings.json`**：`sanitizeSettings()` 只收已知键、
 *      `dataRoot` 不可覆盖（住址不能由住址自己决定），被丢掉的键名**如实回报**（`rejected`）。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppContext } from './core-types.js';
import type { OrganizeCatalog } from './organize/index.js';
import type { SettingsService } from './settings-file.js';

/** 路由路径：与本仓其余插件同一套命名（`/oblivion-vimc/beat` / `/oblivion-panel/status`）。 */
export const SETTINGS_ROUTE = '/oblivion-core/settings';

/** 请求体上限：设置补丁是个小对象，64 KiB 已经很宽松。 */
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

export interface SettingsRouteDeps {
  settings: SettingsService;
  /** 可选模型清单（设置页下拉框）——`organize.catalog()`。 */
  catalog: () => Promise<OrganizeCatalog>;
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

/**
 * 装路由。**永不抛**（与 `publishMcp` 同一条原则：可选功能出问题不该把整个 `apply()` 弄崩）。
 *
 * 回 `true` 表示挂上了 —— 便于自检/面板在启动日志里对一眼。
 */
export function installSettingsRoute(ctx: AppContext, deps: SettingsRouteDeps): boolean {
  const warn = deps.warn ?? (() => {});
  try {
    if (typeof ctx.inject !== 'function') {
      warn('上下文没有 inject：设置路由未挂载（设置页会拿不到数据，插件其余部分照常）');
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
        warn('webServer 不可用：设置路由未挂载');
        return;
      }

      const handler = (request: IncomingMessage, response: ServerResponse): void => {
        const method = (request.method ?? 'GET').toUpperCase();

        // ---- 读：生效值 + 来源 + 可选模型清单（一次给全，设置页只发一个请求）----
        if (method === 'GET') {
          void (async () => {
            const describe = deps.settings.describe();
            // 清单读的是宿主注册表（不发模型请求）；宿主没有 `llm` 服务时回空清单，不报错。
            const catalog = await deps.catalog().catch(() => null);
            send(response, 200, { ok: true, version: deps.version, ...describe, catalog });
          })().catch((error: unknown) => {
            warn('设置快照失败：' + String(error));
            send(response, 500, { ok: false, error: 'describe failed' });
          });
          return;
        }

        // ---- 写：补丁（只落在 settings.json；`dataRoot` 不可覆盖）----
        if (method === 'POST') {
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
              // 两种写法都收：`{patch:{…}}`（显式）与裸对象（`curl` 手测方便）。
              const patch = rec.patch !== undefined && rec.patch !== null && typeof rec.patch === 'object'
                ? (rec.patch as Record<string, unknown>)
                : rec;
              const result = await deps.settings.patch(patch);
              const catalog = await deps.catalog().catch(() => null);
              deps.log?.(
                '设置已写：changed=[' + result.changed.join(',') + '] rejected=[' + result.rejected.join(',') + ']'
                  + ' 待重启=[' + result.pending.join(',') + ']',
              );
              send(response, 200, { ok: true, version: deps.version, ...result, catalog });
            })
            .catch((error: unknown) => {
              warn('设置写入失败：' + String(error));
              send(response, 500, { ok: false, error: 'patch failed' });
            });
          return;
        }

        response.writeHead(405, { allow: 'GET, POST', 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
      };

      const dispose = server.register({ kind: 'exact', path: SETTINGS_ROUTE, handler });
      if (typeof dispose === 'function') {
        ctx.effect(() => dispose as () => void, 'oblivion-core: 设置路由');
      }
      deps.log?.('设置路由已挂载：GET|POST ' + SETTINGS_ROUTE);
    });
    return true;
  } catch (error: unknown) {
    warn('设置路由装载失败（不影响其余功能）：' + String(error));
    return false;
  }
}
