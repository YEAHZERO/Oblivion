/**
 * `@oblivion/core` · MCP 端点的**进程内通道**（C 方案的实施选择：改良 A）。
 *
 * ## 为什么要这条通道
 *
 * 原计划让 bridge 用 `inject: ['oblivion']` 直接取 core 的服务。实测它**从来没激活过**：
 * Cordis 的 `fiber._refresh()` 会遍历 `Object.keys(this.inject)`，任何一个取不到就把
 * epoch 置为 INACTIVE —— 插件停在 pending，`apply()` 一次不跑。于是既没监听端口，
 * 也没有任何日志（`~/.oblivion/bridge-heartbeat.json` 至今不存在、42081 从未监听）。
 *
 * 失败根因是**服务可见性依作用域而变**：core 把门面 provide 到自己所在的上下文，
 * 而 bridge 在自己的 fiber 里 `get()` 拿不到。这条通道让 bridge **不再需要那个服务**，
 * 也就不再依赖「谁挂在谁的下面」「bundle 层还是用户层」「isolate 遮蔽了几层」。
 *
 * ## 通道形态
 *
 * 一个 `Map<owner, slot>`，挂在**候选作用域**的同一把键上（键是
 * `Symbol.for('@oblivion/core/mcp')`）：
 *   - `Symbol.for` 是**跨 realm / 跨模块副本**的全局注册表键，同一进程内谁调都拿到同一个；
 *   - 槽里放的是**端点对象**（函数），不是快照数据，所以 core 重新装载后
 *     bridge 下一次请求就会拿到新端点，不会拿着旧门面写盘；
 *   - 可注销（`publishMcp()` 返回 disposer）：卸载/重挂不会留下僵尸端点。
 *
 * ## 为什么不止 `globalThis`（2026-10-17 上机修复）
 *
 * `Symbol.for` 跨 realm 相同，**键不是问题**；问题是槽挂在 `globalThis` 上，而
 * `globalThis` 是**每个 realm 各一份**。宿主若把插件放进各自的作用域对象、或对
 * `globalThis` 加只读/代理（发布时 `defineProperty` 抛错），就会出现：
 * core 这边发布了、传输层那边永远 `present:false`「未找到通道」——
 * 而 core 的 `apply()` 还在这一行上直接抛掉，连自己「装载完了」那行日志都打不出来。
 *
 * 所以现在：**候选作用域逐个尝试**（`globalThis` → `process`），
 * `process` 是**每个进程一份**的对象，跨 realm/跨插件拿到的是同一个；
 * 读侧（`@oblivion/http-bridge/src/channel.ts`）按**同一份清单**逐个找。
 * 另外两条修正：
 *   - 认表**不看 `instanceof Map`**（跨 realm 的 Map 原型不同，会假阴性）；
 *   - `publishMcp()` **永不抛**：通道是可选旁路，坏掉只该留痕，不该带走整个插件装载。
 *
 * ## 契约
 *
 * 传输层只认 `apiVersion`（见 `MCP_API_VERSION`）与 `handle()`；不匹配就拒绝服务
 * 并说明原因，绝不「猜着调」。`@oblivion/http-bridge` 那一侧按同样的键、同样的
 * 作用域清单与版本读，两边的自检各自断言这些字面量，
 * 见 `oblivion-http-bridge/src/channel.ts`。
 */

import type { McpEndpoint } from './types.js';

/** 通道键的**字面量**：传输层按同一个字符串 `Symbol.for(...)`。别改。 */
export const MCP_CHANNEL = '@oblivion/core/mcp';

/** 通道契约版本。加字段不算破坏（传输层只读它认识的），语义变更才 +1。 */
export const MCP_API_VERSION = 1;

/** 当前发布者标识。 */
export const MCP_OWNER = '@oblivion/core';

/**
 * 通道作用域的**候选清单**：发布侧逐个尝试，读侧逐个找。
 *
 * 两个包各写一份字面量（谁都不 import 谁），由 `oblivion-http-bridge/scripts/selfcheck.mjs`
 * 逐字比对 —— 加一项忘另一项会当场红。清单变了 = 契约变了。
 */
export const CHANNEL_SCOPES = ['globalThis', 'process'] as const;

/** 候选作用域名。 */
export type ChannelScopeName = (typeof CHANNEL_SCOPES)[number];

/** 单个作用域的发布结果（诊断用，直接落 `mcp-channel-diag.json`）。 */
export interface ChannelScopeReport {
  scope: ChannelScopeName;
  /**
   * `created` 新建表 · `reused` 复用已有的同形表 · `assigned` 键被占/只读，退回直接赋值 ·
   * `occupied` 键被别的东西占着且写不动 · `unavailable` 该作用域在本进程不存在 ·
   * `failed` 读/写都失败（`error` 里有原文）。
   */
  outcome: 'created' | 'reused' | 'assigned' | 'occupied' | 'unavailable' | 'failed';
  /** 失败原文（截断到 200 字符），成功时缺席。 */
  error?: string;
  /** 落到键上的是什么东西（`occupied`/`assigned` 时最有信息量）。 */
  valueTag?: string;
}

/** 一次 `publishMcp()` 的完整报告。 */
export interface ChannelReport {
  at: number;
  owner: string;
  /** 每个候选作用域各一条，顺序与 `CHANNEL_SCOPES` 一致。 */
  scopes: ChannelScopeReport[];
  /** 真正写进槽里的作用域个数（0 = 这次发布哪儿都没落上）。 */
  written: number;
  /** 第一个写成功的候选作用域；`null` = 全败。 */
  active: ChannelScopeName | null;
}

interface ChannelSlot {
  apiVersion: number;
  owner: string;
  endpoint: McpEndpoint;
  at: number;
}

/** 发布选项：诊断回调（core 的 `apply` 用它将报告落盘）。 */
export interface PublishMcpOptions {
  onReport?: (report: ChannelReport) => void;
}

/** 通道键（每次重算，避免持有 symbol 的模块级缓存与 HMR 打架）。 */
export function channelKey(): symbol {
  return Symbol.for(MCP_CHANNEL);
}

/** 取候选作用域对象；本进程里不存在就返回 `undefined`。 */
function scopeOf(name: ChannelScopeName): Record<PropertyKey, unknown> | undefined {
  if (name === 'globalThis') return globalThis as unknown as Record<PropertyKey, unknown>;
  // `process` 是每个进程一份的对象：跨 realm / 跨插件副本拿到的是同一个。
  const processLike = typeof process === 'undefined' ? undefined : (process as unknown);
  return processLike !== null && typeof processLike === 'object'
    ? (processLike as Record<PropertyKey, unknown>)
    : undefined;
}

/**
 * 认不认得出「这是一张通道表」。
 *
 * **刻意不用 `instanceof Map`**：跨 realm 的 Map 原型不同，`instanceof` 会假阴性，
 * 把一张真表当成「没有通道」（历史故障的第二个候选解释）。这里只认结构：
 * 干得了 `get/set/values/delete` 且拿得出 `size`。
 */
function isRegistryLike(value: unknown): value is Map<string, ChannelSlot> {
  if (value instanceof Map) return true;
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as {
    get?: unknown;
    set?: unknown;
    values?: unknown;
    delete?: unknown;
    size?: unknown;
  };
  return (
    typeof candidate.get === 'function' &&
    typeof candidate.set === 'function' &&
    typeof candidate.values === 'function' &&
    typeof candidate.delete === 'function' &&
    typeof candidate.size === 'number'
  );
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 200 ? text.slice(0, 200) : text;
}

function tagOf(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '(tag throws)';
  }
}

/**
 * 取某个候选作用域里的表；不可用/被占/写不动都返回 `null` 并把原因写进 `report`。
 *
 * **绝不抛**：调用方是插件的 `apply()`，通道坏了不该连带整包装载失败。
 */
function registryAt(scopeName: ChannelScopeName, report: ChannelScopeReport[]): Map<string, ChannelSlot> | null {
  const scope = scopeOf(scopeName);
  if (scope === undefined) {
    report.push({ scope: scopeName, outcome: 'unavailable' });
    return null;
  }
  const key = channelKey();

  let existing: unknown;
  try {
    existing = scope[key];
  } catch (error: unknown) {
    report.push({ scope: scopeName, outcome: 'failed', error: errorText(error) });
    return null;
  }
  if (isRegistryLike(existing)) {
    report.push({ scope: scopeName, outcome: 'reused' });
    return existing;
  }

  const created = new Map<string, ChannelSlot>();
  try {
    // 不可枚举：`JSON.stringify(globalThis)` 之类不该把它带出去。
    Object.defineProperty(scope, key, {
      value: created,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    report.push(
      existing === undefined
        ? { scope: scopeName, outcome: 'created' }
        : { scope: scopeName, outcome: 'assigned', valueTag: tagOf(existing) },
    );
    return created;
  } catch (error: unknown) {
    // 键已经存在且不可配置 / 作用域只读时 defineProperty 会抛：退一步直接赋值。
    try {
      scope[key] = created;
      report.push({ scope: scopeName, outcome: 'assigned', error: errorText(error), valueTag: tagOf(existing) });
      return created;
    } catch (assignError: unknown) {
      report.push({
        scope: scopeName,
        outcome: existing === undefined ? 'failed' : 'occupied',
        error: errorText(assignError),
        valueTag: tagOf(existing),
      });
      return null;
    }
  }
}

/** 所有候选作用域里现存的表（读侧共用：合并 + 按槽去重）。 */
function allRegistries(): Map<string, ChannelSlot>[] {
  const found: Map<string, ChannelSlot>[] = [];
  for (const scopeName of CHANNEL_SCOPES) {
    const scope = scopeOf(scopeName);
    if (scope === undefined) continue;
    try {
      const raw = scope[channelKey()];
      if (isRegistryLike(raw)) found.push(raw);
    } catch {
      // 读不到就当这个作用域没有；另一个候选可能还在。
    }
  }
  return found;
}

/** 所有候选作用域里的槽（同一个端点会在多个作用域里各有一份，按对象身份去重）。 */
function slotList(): ChannelSlot[] {
  const slots: ChannelSlot[] = [];
  const seen = new Set<unknown>();
  for (const registry of allRegistries()) {
    let values: Iterable<unknown>;
    try {
      values = registry.values();
    } catch {
      continue;
    }
    for (const value of values) {
      if (value === null || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      slots.push(value as ChannelSlot);
    }
  }
  return slots;
}

/**
 * 发布端点，返回注销函数（放进 `ctx.effect`）。
 *
 * 同 owner 再发布 = **顶替**（重新装载后新端点接管，旧端点自动作废）。
 * 候选作用域**逐个尝试、能写几个写几个**（读侧逐个找，落哪个都能被读到）；
 * 全程不抛，结果通过 `options.onReport` 交给调用方留痕。
 */
export function publishMcp(endpoint: McpEndpoint, options: PublishMcpOptions = {}): () => void {
  const scopes: ChannelScopeReport[] = [];
  const written: { registry: Map<string, ChannelSlot>; slot: ChannelSlot }[] = [];

  const slot: ChannelSlot = {
    apiVersion: endpoint.apiVersion,
    owner: endpoint.owner,
    endpoint,
    at: Date.now(),
  };

  let active: ChannelScopeName | null = null;
  for (const scopeName of CHANNEL_SCOPES) {
    const registry = registryAt(scopeName, scopes);
    if (registry === null) continue;
    try {
      registry.set(endpoint.owner, slot);
      written.push({ registry, slot });
      if (active === null) active = scopeName;
    } catch (error: unknown) {
      scopes.push({ scope: scopeName, outcome: 'failed', error: errorText(error) });
    }
  }

  const report: ChannelReport = { at: Date.now(), owner: endpoint.owner, scopes, written: written.length, active };
  try {
    options.onReport?.(report);
  } catch {
    // 诊断回调自己炸了不许反过来打断装载。
  }

  return () => {
    for (const item of written) {
      try {
        const current = item.registry.get(endpoint.owner);
        // 只清掉「还是我」那一个；已经被新端点顶替时不许误删。
        if (current !== undefined && current.endpoint === endpoint) item.registry.delete(endpoint.owner);
      } catch {
        // 注销失败不影响别的落点。
      }
    }
  };
}

/**
 * 取当前端点。
 *
 * 优先「认得出版本 且 已拿到门面」的；都没有就退而取版本认得的（装载早期门面可能还没建好，
 * 此时 `handle()` 会如实回 `-32603`，比让传输层回 503 更接近真相）。
 */
export function resolveMcp(): McpEndpoint | null {
  const slots = slotList().filter((slot) => slot.apiVersion === MCP_API_VERSION);
  if (slots.length === 0) return null;
  const ready = slots.filter((slot) => {
    try {
      return slot.endpoint.describe().ready;
    } catch {
      return false;
    }
  });
  const pool = ready.length > 0 ? ready : slots;
  return pool.reduce((newest, slot) => (slot.at >= newest.at ? slot : newest)).endpoint;
}

/** 通道现状：给心跳 / 诊断文件与传输层的拒绝理由用。 */
export function describeMcpChannel(): {
  present: boolean;
  apiVersion: number;
  owner: string;
  at: number;
  version: string;
  tools: string[];
  ready: boolean;
} {
  const slots = slotList();
  const fresh = slots.filter((slot) => slot.apiVersion === MCP_API_VERSION);
  if (fresh.length === 0) {
    return {
      present: false,
      apiVersion: MCP_API_VERSION,
      owner: fresh.length === 0 && slots.length > 0 ? slots[0].owner : '',
      at: 0,
      version: '',
      tools: [],
      ready: false,
    };
  }
  const newest = fresh.reduce((a, b) => (b.at >= a.at ? b : a));
  const info = newest.endpoint.describe();
  return { present: true, apiVersion: info.apiVersion, owner: info.owner, at: newest.at, version: info.version, tools: info.tools, ready: info.ready };
}

/** 清空通道。仅供测试与诊断使用（正常运行由 disposer 负责）。 */
export function clearMcpChannel(): void {
  for (const registry of allRegistries()) {
    try {
      registry.clear();
    } catch {
      // 清不动就算了：它是别人的表。
    }
  }
}
