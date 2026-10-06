/**
 * 有数（@oblivion/daily-life）· Node 半边（宿主侧）。
 *
 * 三件事，都不碰认知逻辑：
 *
 *   ① **留座与自证**：写启动标记 `console.log('[oblivion-daily-life] loaded')`
 *      （与 dshx.yml 的 marker 逐字相同），并落一份
 *      `%TEMP%\oblivion-daily-life\host-mount.json` 自证据文件。
 *   ② **两条路由**（冻结规格）：
 *        GET  /daily-life/status   读：账本全量 + 每条的派生指标 + 汇总
 *        POST /daily-life/items    写：add / update / sell / use / remove
 *   ③ **口径唯一**：所有数字都来自 `src/metrics.ts` 的纯函数，Node 半边不自己算账。
 *
 * ## HTTP 行为（冻结规格）
 *
 *   | 状态 | 何时 |
 *   | 405 | 方法不对（读路由只认 GET、写路由只认 POST），响应带 `allow` |
 *   | 403 | 跨源：带了 `Origin` 且它的 host 与 `Host` 不一致 |
 *   | 400 | 请求体不是合法 JSON；字段校验没过（响应里给 `errors` 数组） |
 *   | 404 | 动作指向的 id 不在账本里 |
 *   | 413 | 请求体超过 128 KiB |
 *   | 409 | 新增会突破 `maxItems` |
 *   | 500 | 内部异常（只回一句 `internal error`，细节进宿主日志） |
 *
 * ## 安全边界
 *
 *   - 只监听回环由宿主 `webServer` 保证；这里再加一条同源检查（403）；
 *   - **不接受任何路径输入**：账本文件路径只来自 config；
 *   - 写动作一律先过 `validateItem()`，不落脏数据；
 *   - 响应 `cache-control: no-store`。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { asConfig, expandHome, type Config } from './config.js';
import { formatDay, rowOf, summarize, todayStart, validateItem, type Item, type ItemRow, type LedgerStats } from './metrics.js';
import { applyChecked, createLedgerStore, isSafeId, type LedgerStore } from './store.js';

/** 与 dshx.yml 的 marker 逐字相同。 */
export const name = '@oblivion/daily-life';

/** 浏览器半边不需要宿主服务；Node 半边用 webServer 挂路由。 */
export const inject: string[] = [];

/** 版本号**只有一处来源**：包根的 `VERSION`（`scripts/bump-version.mjs` 改的就是它）。 */
export const VERSION: string = readVersion();

function readVersion(): string {
  for (const relative of ['../VERSION', './VERSION', '../../VERSION']) {
    try {
      const text = readFileSync(new URL(relative, import.meta.url), 'utf8').trim();
      if (text !== '') return text;
    } catch {
      // 换下一个候选位置（打包层级不同时相对路径会变）
    }
  }
  return '0.0.0';
}

const BODY_LIMIT = 128 * 1024;

export interface LedgerState {
  items: ItemRow[];
  stats: LedgerStats;
  /** 账本文件在磁盘上的位置。 */
  dataFile: string;
  loadError: string | null;
  skipped: number;
}

/** 把账本装配成看板要的形状（路由与自检共用这一条路径）。 */
export function buildState(
  items: Item[],
  today: number,
  options: { idleWarnDays: number; top?: number },
  extra: { dataFile: string; loadError?: string | null; skipped?: number } = { dataFile: '' },
): LedgerState {
  const rows = items.map((item) => rowOf(item, today, options));
  return {
    items: rows,
    stats: summarize(rows, options),
    dataFile: extra.dataFile,
    loadError: extra.loadError ?? null,
    skipped: extra.skipped ?? 0,
  };
}

export type ActionName = 'add' | 'update' | 'sell' | 'use' | 'remove';

export interface ActionResult {
  status: number;
  payload: Record<string, unknown>;
}

export interface ActionOptions {
  idleWarnDays: number;
  maxItems: number;
  now?: number;
}

/**
 * 执行一个写动作。
 *
 * **路由与自检共用这一条路径** —— selfcheck 直接调它，于是「自检全绿」与
 * 「HTTP 真能写」是同一件事，而不是两套代码各自看起来没问题。
 */
export async function runAction(store: LedgerStore, body: unknown, options: ActionOptions): Promise<ActionResult> {
  const now = options.now ?? Date.now();
  const source = (body ?? {}) as Record<string, unknown>;
  const action = typeof source.action === 'string' ? source.action : '';
  const today = todayStart(now);

  const { items, loadError, skipped } = await store.load();

  if (action === 'remove') {
    const id = typeof source.id === 'string' ? source.id : '';
    if (!isSafeId(id)) return { status: 400, payload: { ok: false, error: 'invalid id', errors: ['id 形状不对'] } };
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return { status: 404, payload: { ok: false, error: 'not found' } };
    await store.save(next);
    return { status: 200, payload: { ok: true, removed: id, count: next.length } };
  }

  if (action === 'use') {
    const id = typeof source.id === 'string' ? source.id : '';
    const existing = items.find((item) => item.id === id);
    if (existing === undefined) return { status: 404, payload: { ok: false, error: 'not found' } };
    const usedAt = typeof source.lastUsedAt === 'string' && source.lastUsedAt.trim() !== '' ? source.lastUsedAt.trim() : formatDay(now);
    const checked = validateItem({ ...existing, lastUsedAt: usedAt }, now);
    if (!checked.ok) return { status: 400, payload: { ok: false, error: 'invalid fields', errors: checked.errors } };
    const next = applyChecked(existing, { ...checked.value, useCount: (existing.useCount ?? 0) + 1 }, now);
    await store.save(items.map((item) => (item.id === id ? next : item)));
    return { status: 200, payload: { ok: true, item: rowOf(next, today, options) } };
  }

  if (action !== 'add' && action !== 'update' && action !== 'sell') {
    return {
      status: 400,
      payload: { ok: false, error: 'unknown action', allowed: ['add', 'update', 'sell', 'use', 'remove'] satisfies ActionName[] },
    };
  }

  // 局部更新：update / sell 只传要改的字段，其余沿用原记录。
  const incoming = (source.item ?? {}) as Record<string, unknown>;
  let existing: Item | undefined;
  if (action === 'add') {
    if (Object.keys(incoming).length === 0) {
      return { status: 400, payload: { ok: false, error: 'missing item', errors: ['add 要带 item'] } };
    }
  } else {
    const id = typeof incoming.id === 'string' ? incoming.id : typeof source.id === 'string' ? source.id : '';
    existing = items.find((item) => item.id === id);
    if (existing === undefined) return { status: 404, payload: { ok: false, error: 'not found' } };
  }

  const merged: Record<string, unknown> = existing === undefined ? { ...incoming } : { ...existing, ...incoming };
  if (action === 'sell') {
    if (typeof merged.soldDate !== 'string' || merged.soldDate.trim() === '') merged.soldDate = formatDay(now);
    merged.soldPrice = merged.soldPrice ?? incoming.soldPrice;
  }

  const checked = validateItem(merged, now);
  if (!checked.ok) return { status: 400, payload: { ok: false, error: 'invalid fields', errors: checked.errors } };

  if (action === 'add' && items.length >= options.maxItems) {
    return { status: 409, payload: { ok: false, error: 'ledger is full', maxItems: options.maxItems } };
  }

  const next = applyChecked(existing, checked.value, now);
  const list = existing === undefined ? [next, ...items] : items.map((item) => (item.id === next.id ? next : item));
  await store.save(list);
  return {
    status: 200,
    payload: { ok: true, item: rowOf(next, today, options), count: list.length, loadError, skipped },
  };
}

function readBody(request: IncomingMessage, limit = BODY_LIMIT): Promise<{ body: string; overflow: boolean }> {
  return new Promise((resolvePromise) => {
    let body = '';
    let overflow = false;
    request.on('data', (chunk: Buffer) => {
      if (overflow) return;
      body += chunk.toString('utf8');
      if (body.length > limit) overflow = true;
    });
    request.on('end', () => resolvePromise({ body, overflow }));
    request.on('error', () => resolvePromise({ body: '', overflow: false }));
  });
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

/**
 * 同源检查：带了 `Origin` 且 host 与 `Host` 不一致 ⇒ 403。
 *
 * 为什么需要它：宿主 `webServer` 只监听 127.0.0.1，但页面里的任意脚本都能
 * 往本机端口发请求 —— 账本是可写数据面，必须挡住「别的站点借浏览器的手改账」。
 */
export function isSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (origin === undefined || origin === '') return true;
  const host = request.headers.host;
  if (host === undefined || host === '') return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

interface RouteScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: IncomingMessage, response: ServerResponse) => void;
    }): unknown;
  };
}

interface HostCtx {
  inject?(deps: readonly string[], callback: (scope: RouteScope) => void): unknown;
  logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };
}

function installRoutes(ctx: HostCtx, config: Config, warn: (message: string) => void): void {
  if (typeof ctx.inject !== 'function') {
    warn('上下文没有 inject：读写数据面未挂载（浏览器半边仍会尝试注册 tab）');
    return;
  }
  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用：读写数据面未挂载');
      return;
    }
    const dataFile = expandHome(config.dataFile);
    const store = createLedgerStore(dataFile);
    const options = { idleWarnDays: config.idleWarnDays, maxItems: config.maxItems };

    // ---- 读：账本全量 + 指标 + 汇总 ----
    server.register({
      kind: 'exact',
      path: config.statusPath,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
          return;
        }
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'cross-origin forbidden' });
          return;
        }
        void store
          .load()
          .then(({ items, loadError, skipped }) => {
            const now = Date.now();
            const state = buildState(items, todayStart(now), options, { dataFile, loadError, skipped });
            sendJson(response, 200, {
              ok: true,
              plugin: name,
              version: VERSION,
              generatedAt: new Date(now).toISOString(),
              ...state,
            });
          })
          .catch((error: unknown) => {
            warn(`状态装配失败：${String(error)}`);
            sendJson(response, 500, { ok: false, error: 'internal error' });
          });
      },
    });

    // ---- 写：动作 ----
    server.register({
      kind: 'exact',
      path: config.itemsPath,
      handler: (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST', 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
          return;
        }
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: 'cross-origin forbidden' });
          return;
        }
        void readBody(request)
          .then(async ({ body, overflow }) => {
            if (overflow) {
              sendJson(response, 413, { ok: false, error: 'body too large' });
              return;
            }
            let parsed: unknown;
            try {
              parsed = JSON.parse(body === '' ? '{}' : body);
            } catch {
              sendJson(response, 400, { ok: false, error: 'invalid json' });
              return;
            }
            const result = await runAction(store, parsed, options);
            sendJson(response, result.status, result.payload);
          })
          .catch((error: unknown) => {
            warn(`动作执行失败：${String(error)}`);
            sendJson(response, 500, { ok: false, error: 'internal error' });
          });
      },
    });

    ctx.logger?.info?.(config.logPrefix + ' 数据面：GET %s（读）/ POST %s（写），账本=%s', config.statusPath, config.itemsPath, dataFile);
  });
}

/** 自证据文件：证明 Node 半边真的被装载过（dshx 验证面在本机不可用）。 */
function writeMountEvidence(warn: (message: string) => void): void {
  try {
    const dir = process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR || join(process.env.TEMP || process.env.TMP || '.', 'oblivion-daily-life');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'host-mount.json'),
      JSON.stringify({ plugin: name, version: VERSION, mountedAt: new Date().toISOString(), pid: process.pid }, null, 2) + '\n',
      'utf8',
    );
  } catch (error) {
    warn(`自证据文件写入失败：${String(error)}`);
  }
}

export function apply(rawCtx: unknown, rawConfig?: Partial<Config>): void {
  const ctx = rawCtx as HostCtx;
  const config = asConfig(rawConfig);
  const warn = (message: string): void => {
    ctx.logger?.warn?.(config.logPrefix + ' ' + message);
  };

  installRoutes(ctx, config, warn);
  writeMountEvidence(warn);

  console.log('[oblivion-daily-life] loaded');
}
