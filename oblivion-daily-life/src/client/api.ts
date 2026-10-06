/**
 * 有数（@oblivion/daily-life）· 客户端 API（**纯函数 + 可注入 fetch**）。
 *
 * 浏览器半边只跟两条路由说话（都是相对路径，因此天然同源）：
 *   GET  /daily-life/status   读全量状态
 *   POST /daily-life/items    写一个动作
 *
 * 为什么用相对路径：宿主 `webServer` 会在**当前页面同一个 origin** 上挂路由，
 * 写死 `http://127.0.0.1:<port>` 反而会在端口漂移时断掉；同源还顺带满足了
 * Node 半边那条 403 同源检查。
 *
 * 为什么 fetch 可注入：单测与自检不该起服务器 —— 注入一个假的 fetch，
 * 就能把「非 200 / 坏 JSON / 校验失败 / 网络抛错」这些路径全钉住。
 */

import type { ItemRow, LedgerStats } from '../metrics.js';

export const DEFAULT_STATUS_PATH = '/daily-life/status';
export const DEFAULT_ITEMS_PATH = '/daily-life/items';

/** 宿主下发的一份完整状态（形状与 `GET /daily-life/status` 的响应一致）。 */
export interface DailyLifeState {
  ok: true;
  plugin: string;
  version: string;
  generatedAt: string;
  dataFile: string;
  loadError: string | null;
  skipped: number;
  items: ItemRow[];
  stats: LedgerStats;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResponseLike>;

export interface ApiOptions {
  statusPath?: string;
  itemsPath?: string;
  fetchImpl?: FetchLike;
}

export type ActionName = 'add' | 'update' | 'sell' | 'use' | 'remove';

export interface ActionRequest {
  action: ActionName;
  /** `update` / `sell` / `use` / `remove` 用。 */
  id?: string;
  /** `add` / `update` / `sell` 的字段（camelCase，与 Node 半边同形）。 */
  item?: Record<string, unknown>;
}

export type StateResult =
  | { ok: true; state: DailyLifeState }
  | { ok: false; error: string; status: number };

export type ActionResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string; status: number; errors?: string[] };

/** 解析 fetch 实现：优先注入的，其次全局 `fetch`。 */
function pickFetch(options: ApiOptions): FetchLike | null {
  if (typeof options.fetchImpl === 'function') return options.fetchImpl;
  const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
  return typeof globalFetch === 'function' ? globalFetch.bind(globalThis) : null;
}

/** 形状校验：以 `ok === true` + `items`/`stats` 为准，不信任 content-type。 */
export function isState(value: unknown): value is DailyLifeState {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && Array.isArray(record.items) && record.stats !== null && typeof record.stats === 'object';
}

/** 读全量状态；网络异常 / 非 200 / 坏 JSON 都折成 `{ ok: false, error }`，不抛。 */
export async function fetchState(options: ApiOptions = {}): Promise<StateResult> {
  const impl = pickFetch(options);
  if (impl === null) return { ok: false, error: '这个环境没有 fetch', status: 0 };
  const path = options.statusPath ?? DEFAULT_STATUS_PATH;
  let response: FetchResponseLike;
  try {
    response = await impl(path, { method: 'GET', headers: { accept: 'application/json' } });
  } catch (error) {
    return { ok: false, error: '请求没有发出去：' + describe(error), status: 0 };
  }
  if (!response.ok) {
    const body = await safeJson(response);
    return { ok: false, error: errorOf(body) ?? httpTextOf(response.status), status: response.status };
  }
  const body = await safeJson(response);
  if (!isState(body)) return { ok: false, error: '服务回了非预期形状的 JSON', status: response.status };
  return { ok: true, state: body };
}

/** 写一个动作；成功时回原始 payload（界面只关心 `item` / `removed`）。 */
export async function sendAction(request: ActionRequest, options: ApiOptions = {}): Promise<ActionResult> {
  const impl = pickFetch(options);
  if (impl === null) return { ok: false, error: '这个环境没有 fetch', status: 0 };
  const path = options.itemsPath ?? DEFAULT_ITEMS_PATH;
  let response: FetchResponseLike;
  try {
    response = await impl(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (error) {
    return { ok: false, error: '请求没有发出去：' + describe(error), status: 0 };
  }
  const body = await safeJson(response);
  if (!response.ok) {
    return { ok: false, error: errorOf(body) ?? httpTextOf(response.status), status: response.status, errors: errorsOf(body) };
  }
  if (body === null || typeof body !== 'object' || (body as Record<string, unknown>).ok !== true) {
    return { ok: false, error: '服务回了非预期形状的 JSON', status: response.status };
  }
  return { ok: true, payload: body as Record<string, unknown> };
}

/** 从 payload 里取回一条（`add` / `update` / `sell` / `use` 都会带 `item`）。 */
export function itemOf(payload: Record<string, unknown>): ItemRow | null {
  const item = payload.item;
  return item !== null && typeof item === 'object' ? (item as ItemRow) : null;
}

async function safeJson(response: FetchResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorOf(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const base = typeof record.error === 'string' ? record.error : null;
  const errors = errorsOf(body);
  if (base === null && errors === undefined) return null;
  return [base, errors?.join('；')].filter((part) => part !== null && part !== undefined && part !== '').join('：');
}

function errorsOf(body: unknown): string[] | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const raw = (body as Record<string, unknown>).errors;
  return Array.isArray(raw) && raw.every((entry) => typeof entry === 'string') && raw.length > 0 ? (raw as string[]) : undefined;
}

/** 兜底文案与 `format.ts` 的 `httpText` 同口径（这里不 import 它，避免循环依赖）。 */
function httpTextOf(status: number): string {
  switch (status) {
    case 400:
      return '字段没填对';
    case 403:
      return '跨源请求被拒绝';
    case 404:
      return '账本里没有这件物品（可能已被删除）';
    case 405:
      return '请求方式不对';
    case 409:
      return '账本已满（上限 2000 件）';
    case 413:
      return '请求体太大';
    case 500:
      return '有数服务内部异常，详见宿主日志';
    default:
      return '请求失败（HTTP ' + String(status) + '）';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 空表单的默认值（今天买入 —— 用户在「刚买的东西」这个场景里占绝大多数）。 */
export function defaultDraft(today: string): { name: string; buyPrice: string; buyDate: string; category: string; serviceDaysTarget: string; note: string } {
  return { name: '', buyPrice: '', buyDate: today, category: '', serviceDaysTarget: '', note: '' };
}

/**
 * 表单草稿 → 请求字段（**客户端先归一，服务端仍然会再校验一次**）。
 *
 * 规则：空串一律变 `null`（不是 `''`，也不是 `0`）—— 这正对应规格里
 * 「可空字段统一 `null`，别用空串」那条反面教训。
 */
export function draftToItem(draft: Record<string, string>): Record<string, unknown> {
  const text = (value: string | undefined): string | null => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  };
  const numeric = (value: string | undefined): number | null => {
    const trimmed = (value ?? '').trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  return {
    name: (draft.name ?? '').trim(),
    buyPrice: numeric(draft.buyPrice),
    buyDate: text(draft.buyDate),
    category: text(draft.category),
    serviceDaysTarget: numeric(draft.serviceDaysTarget),
    note: text(draft.note),
  };
}
