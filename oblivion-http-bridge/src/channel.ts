/**
 * @oblivion/http-bridge · 进程内 MCP 通道的**读侧**。
 *
 * ## 与 `oblivion-core/src/mcp/channel.ts` 是一份契约
 *
 * 通道键与契约版本在这里**各自声明一次字面量**，不 import core（本包不依赖 core
 * 的任何模块，见 `src/types.ts` 的说明）。两条防线的分工是：
 *
 *   - 本文件：给传输层一个**永不抛**的读取口，读不到就说清原因；
 *   - `scripts/selfcheck.mjs`：同时读本文件与 core 那一侧的源码，逐字比对
 *     `MCP_CHANNEL` / `MCP_API_VERSION` 的字面量 —— 改一处而忘了另一处会当场红。
 *
 * 改这两个常量必须**同时**改两处；版本不匹配时传输层一律回 503 并说明原因，
 * 绝不「猜着调」对面（协议语义变了还硬调，比不服务更糟）。
 *
 * ## 通道形态
 *
 * `globalThis[Symbol.for('@oblivion/core/mcp')]` 上一个 `Map<owner, slot>`：
 * core 用 `publishMcp()` 放槽、`disposer` 注销；同一 owner 再发布 = 顶替。
 * 这里只读，不发布、不注销。
 */

/** 通道键的**字面量**。与 `oblivion-core/src/mcp/channel.ts` 逐字相同。 */
export const MCP_CHANNEL = '@oblivion/core/mcp';

/**
 * 通道契约版本。与 core 那边逐字相同。
 *
 * 加字段不算破坏（本层只读它认识的字段），语义变更才 +1。
 */
export const MCP_API_VERSION = 1;

/** 通道里一个槽的端点形状（结构性描述，不 import core 的类型）。 */
export interface McpEndpointLike {
  apiVersion: number;
  owner: string;
  version(): string;
  describe(): {
    apiVersion: number;
    owner: string;
    version: string;
    tools: string[];
    ready: boolean;
  };
  handle(rawBody: string, log?: (message: string) => void): Promise<unknown>;
}

/** 通道现状：心跳文件与健康路由都用这个形状。 */
export interface ChannelDescription {
  present: boolean;
  apiVersion: number;
  owner: string;
  version: string;
  tools: string[];
  ready: boolean;
  /** 中文说明「为什么没有端点」，给 503 的 message 与诊断用。 */
  reason: string;
}

/** 槽的原始形状（结构性描述，不 import core 的私有接口）。 */
interface ChannelSlotLike {
  apiVersion: number;
  owner: string;
  endpoint: McpEndpointLike;
  at: number;
}

/** 通道键（每次重算，避免模块级缓存与 HMR 重载打架）。 */
export function channelKey(): symbol {
  return Symbol.for(MCP_CHANNEL);
}

/** 空描述：任何「读不出来」的分支都用它兜底。 */
function emptyDescription(reason: string): ChannelDescription {
  return {
    present: false,
    apiVersion: MCP_API_VERSION,
    owner: '',
    version: '',
    tools: [],
    ready: false,
    reason,
  };
}

/**
 * 读全局注册表；不是 Map（或压根没有，或宿主对 globalThis 做了会抛的代理）
 * 就当通道是空的。**永不抛**。
 */
function readSlots(): ChannelSlotLike[] {
  try {
    const scope = globalThis as unknown as Record<symbol, unknown>;
    const raw = scope[channelKey()];
    if (!(raw instanceof Map)) return [];
    const slots: ChannelSlotLike[] = [];
    for (const value of raw.values()) {
      if (value === null || typeof value !== 'object') continue;
      slots.push(value as ChannelSlotLike);
    }
    return slots;
  } catch {
    return [];
  }
}

/** 端点是否自称 ready；`describe()` 抛异常时按「不 ready」算，绝不把异常带出去。 */
function isReady(slot: ChannelSlotLike): boolean {
  try {
    return slot.endpoint?.describe?.()?.ready === true;
  } catch {
    return false;
  }
}

/**
 * 从一堆槽里挑端点：**优先 ready 的，否则最新**；版本不认识的一律不用。
 *
 * 返回 `reason` 说明为什么挑不出来（中文，直接进 503 的 message）。
 */
function pickSlot(slots: ChannelSlotLike[]): { slot: ChannelSlotLike | null; reason: string } {
  if (slots.length === 0) return { slot: null, reason: '未找到通道' };

  const compatible = slots.filter((slot) => slot.apiVersion === MCP_API_VERSION);
  if (compatible.length === 0) {
    const actual = slots.map((slot) => String(slot.apiVersion)).join(', ');
    return {
      slot: null,
      reason: `契约版本不匹配：期望 ${MCP_API_VERSION}，实际 ${actual}`,
    };
  }

  const ready = compatible.filter((slot) => isReady(slot));
  const pool = ready.length > 0 ? ready : compatible;
  let newest = pool[0];
  for (const slot of pool) {
    if (typeof slot.at === 'number' && slot.at >= newest.at) newest = slot;
  }
  return { slot: newest, reason: '' };
}

/**
 * 取当前端点；取不到返回 `null`（**永不抛**）。
 *
 * 每次请求现取：core 可能刚 HMR 重载过，缓存端点会拿着旧门面写盘。
 */
export function resolveOblivionEndpoint(): McpEndpointLike | null {
  try {
    const slot = pickSlot(readSlots()).slot;
    return slot === null ? null : slot.endpoint;
  } catch {
    return null;
  }
}

/**
 * 通道现状（含中文原因）。**永不抛** —— 它要在 503 与健康路由的路径上跑。
 */
export function describeOblivionChannel(): ChannelDescription {
  try {
    const slots = readSlots();
    if (slots.length === 0) return emptyDescription('未找到通道');

    const { slot, reason } = pickSlot(slots);
    if (slot === null) return emptyDescription(reason);

    const info = slot.endpoint.describe();
    return {
      present: true,
      apiVersion: info.apiVersion,
      owner: info.owner,
      version: info.version,
      tools: Array.isArray(info.tools) ? info.tools : [],
      ready: info.ready === true,
      reason: '',
    };
  } catch (error: unknown) {
    return emptyDescription(`读取通道失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
