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
 * `globalThis[Symbol.for('@oblivion/core/mcp')]` 上一个 `Map<owner, slot>`：
 *   - `Symbol.for` 是**跨 realm / 跨模块副本**的全局注册表键，同一进程内谁调都拿到同一个；
 *   - 槽里放的是**端点对象**（函数），不是快照数据，所以 core 重新装载后
 *     bridge 下一次请求就会拿到新端点，不会拿着旧门面写盘；
 *   - 可注销（`publishMcp()` 返回 disposer）：卸载/重挂不会留下僵尸端点。
 *
 * ## 契约
 *
 * 传输层只认 `apiVersion`（见 `MCP_API_VERSION`）与 `handle()`；不匹配就拒绝服务
 * 并说明原因，绝不「猜着调」。`@oblivion/http-bridge` 那一侧按同样的键与版本读，
 * 两边的自检各自断言这条字面量，见 `oblivion-http-bridge/src/channel.ts`。
 */

import type { McpEndpoint } from './types.js';

/** 通道键的**字面量**：传输层按同一个字符串 `Symbol.for(...)`。别改。 */
export const MCP_CHANNEL = '@oblivion/core/mcp';

/** 通道契约版本。加字段不算破坏（传输层只读它认识的），语义变更才 +1。 */
export const MCP_API_VERSION = 1;

/** 当前发布者标识。 */
export const MCP_OWNER = '@oblivion/core';

interface ChannelSlot {
  apiVersion: number;
  owner: string;
  endpoint: McpEndpoint;
  at: number;
}

/** 通道键（每次重算，避免持有 symbol 的模块级缓存与 HMR 打架）。 */
export function channelKey(): symbol {
  return Symbol.for(MCP_CHANNEL);
}

/**
 * 取（必要时创建）全局注册表。
 *
 * 属性设为不可枚举：`JSON.stringify(globalThis)` 之类不该把它带出去。
 */
function registry(): Map<string, ChannelSlot> {
  const key = channelKey();
  const scope = globalThis as unknown as Record<symbol, unknown>;
  const existing = scope[key];
  if (existing instanceof Map) return existing as Map<string, ChannelSlot>;

  const created = new Map<string, ChannelSlot>();
  Object.defineProperty(scope, key, {
    value: created,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return created;
}

/**
 * 发布端点，返回注销函数（放进 `ctx.effect`）。
 *
 * 同 owner 再发布 = **顶替**（重新装载后新端点接管，旧端点自动作废）。
 */
export function publishMcp(endpoint: McpEndpoint): () => void {
  const slot: ChannelSlot = {
    apiVersion: endpoint.apiVersion,
    owner: endpoint.owner,
    endpoint,
    at: Date.now(),
  };
  registry().set(endpoint.owner, slot);

  return () => {
    const current = registry().get(endpoint.owner);
    // 只清掉「还是我」那一个；已经被新端点顶替时不许误删。
    if (current !== undefined && current.endpoint === endpoint) registry().delete(endpoint.owner);
  };
}

/**
 * 取当前端点。
 *
 * 优先「认得出版本 且 已拿到门面」的；都没有就退而取版本认得的（装载早期门面可能还没建好，
 * 此时 `handle()` 会如实回 `-32603`，比让传输层回 503 更接近真相）。
 */
export function resolveMcp(): McpEndpoint | null {
  const slots = [...registry().values()].filter((slot) => slot.apiVersion === MCP_API_VERSION);
  if (slots.length === 0) return null;
  const ready = slots.filter((slot) => slot.endpoint.describe().ready);
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
  const slots = [...registry().values()];
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
  registry().clear();
}
