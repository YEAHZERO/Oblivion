/**
 * @oblivion/http-bridge · 进程内 MCP 通道的**读侧**。
 *
 * ## 与 `oblivion-core/src/mcp/channel.ts` 是一份契约
 *
 * 通道键、契约版本、**候选作用域清单**在这里**各自声明一次字面量**，不 import core
 * （本包不依赖 core 的任何模块，见 `src/types.ts` 的说明）。两条防线的分工是：
 *
 *   - 本文件：给传输层一个**永不抛**的读取口，读不到就说清原因；
 *   - `scripts/selfcheck.mjs`：同时读本文件与 core 那一侧的源码，逐字比对
 *     `MCP_CHANNEL` / `MCP_API_VERSION` / `CHANNEL_SCOPES` —— 改一处而忘了另一处会当场红。
 *
 * 改这几个常量必须**同时**改两处；版本不匹配时传输层一律回 503 并说明原因，
 * 绝不「猜着调」对面（协议语义变了还硬调，比不服务更糟）。
 *
 * ## 通道形态
 *
 * 一个 `Map<owner, slot>`，挂在候选作用域的同一把键上：core 用 `publishMcp()` 放槽、
 * `disposer` 注销；同一 owner 再发布 = 顶替。这里只读，不发布、不注销。
 *
 * ## 为什么不止 `globalThis`（2026-10-17 上机修复）
 *
 * `Symbol.for` 跨 realm 相同，**键不是问题**；问题是槽挂在 `globalThis` 上，而
 * `globalThis` 是**每个 realm 各一份**。宿主若把插件放进各自的作用域对象、或对
 * `globalThis` 加只读/代理，就会出现「core 说发布了、这里说未找到通道」。
 * 所以读侧按**同一份清单**逐个找（`globalThis` → `process`），并把**每个作用域的
 * 探测结果**放进健康路由：`hasKey` / `valueTag` / `mapLike` / `slots`。
 * 出问题时一眼能分清是「没发布」「键被别的东西占了」还是「两侧不在同一进程」
 * （对照 `pid` 与 core 的 `<dataRoot>/mcp-channel-diag.json`）。
 *
 * 认表**不看 `instanceof Map`**：跨 realm 的 Map 原型不同，会假阴性。
 */

/** 通道键的**字面量**。与 `oblivion-core/src/mcp/channel.ts` 逐字相同。 */
export const MCP_CHANNEL = '@oblivion/core/mcp';

/**
 * 通道契约版本。与 core 那边逐字相同。
 *
 * 加字段不算破坏（本层只读它认识的字段），语义变更才 +1。
 */
export const MCP_API_VERSION = 1;

/**
 * 候选作用域清单。与 `oblivion-core/src/mcp/channel.ts` 逐字相同，**同序**。
 *
 * 发布侧逐个尝试、读侧逐个找；任何一侧加了而另一侧没加，自检当场红。
 */
export const CHANNEL_SCOPES = ['globalThis', 'process'] as const;

/** 候选作用域名。 */
export type ChannelScopeName = (typeof CHANNEL_SCOPES)[number];

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

/** 单个候选作用域的探测结果（健康路由原样回出去）。 */
export interface ChannelScopeProbe {
  scope: string;
  /** 本进程里这个作用域对象存在吗（沙箱里可能没有 `process`）。 */
  available: boolean;
  /** 键上有没有东西（哪怕不是一张表）。 */
  hasKey: boolean;
  /** `Object.prototype.toString.call(值)`：`[object Map]` / `[object Object]` … */
  valueTag: string;
  /** 结构上认不认得成一张通道表（**不看 `instanceof`**，跨 realm 的 Map 也认）。 */
  mapLike: boolean;
  /** 表里槽的个数；不是表时 -1。 */
  slots: number;
  /** 这个作用域读取失败时的原文。 */
  error?: string;
}

/** 通道现状：健康路由与 503 的 message 都用它。 */
export interface ChannelDescription {
  present: boolean;
  apiVersion: number;
  owner: string;
  version: string;
  tools: string[];
  ready: boolean;
  /** 中文说明「为什么没有端点」，给 503 的 message 与诊断用。 */
  reason: string;
  /** 本进程 pid：与 core 的 `mcp-channel-diag.json` 对照（不一样 = 两个进程）。 */
  pid: number;
  /** 每个候选作用域各一条，顺序与 `CHANNEL_SCOPES` 一致。 */
  scopes: ChannelScopeProbe[];
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

/** 取候选作用域对象；本进程里不存在就返回 `undefined`。 */
function scopeOf(name: ChannelScopeName): Record<PropertyKey, unknown> | undefined {
  if (name === 'globalThis') return globalThis as unknown as Record<PropertyKey, unknown>;
  const processLike = typeof process === 'undefined' ? undefined : (process as unknown);
  return processLike !== null && typeof processLike === 'object'
    ? (processLike as Record<PropertyKey, unknown>)
    : undefined;
}

/**
 * 认不认得出「这是一张通道表」。
 *
 * **刻意不用 `instanceof Map`**：跨 realm 的 Map 原型不同，`instanceof` 会假阴性 ——
 * 一张真表被当成「没有通道」，症状与「core 没发布」完全一样。
 */
function isRegistryLike(value: unknown): value is Map<string, ChannelSlotLike> {
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

function tagOf(value: unknown): string {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '(tag throws)';
  }
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 200 ? text.slice(0, 200) : text;
}

/** 空描述：任何「读不出来」的分支都用它兜底。 */
function emptyDescription(reason: string, scopes: ChannelScopeProbe[]): ChannelDescription {
  return {
    present: false,
    apiVersion: MCP_API_VERSION,
    owner: '',
    version: '',
    tools: [],
    ready: false,
    reason,
    pid: typeof process === 'undefined' ? -1 : process.pid,
    scopes,
  };
}

/**
 * 候选作用域的**缺席原因**：分得清「键上没有东西」「键被别的东西占了」「读都读不动」。
 *
 * 这条区分是 2026-10-17 那次定位的关键：`未找到通道` 把三种完全不同的故障
 * （没发布 / 键被占 / 只读代理）说成了同一句。
 */
function absentReason(scopes: ChannelScopeProbe[]): string {
  const occupied = scopes.find((probe) => probe.hasKey && !probe.mapLike);
  if (occupied) return `通道键被 ${occupied.valueTag || '未知值'} 占用（不是通道表）`;
  const failed = scopes.find((probe) => probe.error !== undefined);
  if (failed) return `读取通道失败：${failed.error}`;
  return '未找到通道';
}

interface ProbedScope {
  probe: ChannelScopeProbe;
  slots: ChannelSlotLike[];
}

/** 探一个候选作用域：只读，**永不抛**。 */
function probeScope(name: ChannelScopeName): ProbedScope {
  const probe: ChannelScopeProbe = {
    scope: name,
    available: false,
    hasKey: false,
    valueTag: '',
    mapLike: false,
    slots: -1,
  };

  const scope = scopeOf(name);
  if (scope === undefined) return { probe, slots: [] };
  probe.available = true;

  let raw: unknown;
  try {
    raw = scope[channelKey()];
  } catch (error: unknown) {
    probe.error = errorText(error);
    return { probe, slots: [] };
  }
  if (raw === undefined) return { probe, slots: [] };

  probe.hasKey = true;
  probe.valueTag = tagOf(raw);
  if (!isRegistryLike(raw)) return { probe, slots: [] };
  probe.mapLike = true;

  const slots: ChannelSlotLike[] = [];
  try {
    for (const value of raw.values()) {
      if (value === null || typeof value !== 'object') continue;
      slots.push(value as ChannelSlotLike);
    }
  } catch (error: unknown) {
    probe.error = errorText(error);
    return { probe, slots: [] };
  }
  probe.slots = slots.length;
  return { probe, slots };
}

/**
 * 端点是否自称 ready；`describe()` 抛异常时按「不 ready」算，绝不把异常带出去。
 */
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

/** 候选作用域里的槽（同一个端点会在多个作用域各有一份，按对象身份去重）。 */
function readSlots(): ChannelSlotLike[] {
  const slots: ChannelSlotLike[] = [];
  const seen = new Set<unknown>();
  for (const name of CHANNEL_SCOPES) {
    for (const slot of probeScope(name).slots) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      slots.push(slot);
    }
  }
  return slots;
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
 * 通道现状（含中文原因 + 逐作用域探测）。**永不抛** —— 它要在 503 与健康路由的路径上跑。
 */
export function describeOblivionChannel(): ChannelDescription {
  const scopes: ChannelScopeProbe[] = [];
  const slots: ChannelSlotLike[] = [];
  try {
    const seen = new Set<unknown>();
    for (const name of CHANNEL_SCOPES) {
      const probed = probeScope(name);
      scopes.push(probed.probe);
      for (const slot of probed.slots) {
        if (seen.has(slot)) continue;
        seen.add(slot);
        slots.push(slot);
      }
    }

    if (slots.length === 0) return emptyDescription(absentReason(scopes), scopes);

    const { slot, reason } = pickSlot(slots);
    if (slot === null) return emptyDescription(reason, scopes);

    const info = slot.endpoint.describe();
    return {
      present: true,
      apiVersion: info.apiVersion,
      owner: info.owner,
      version: info.version,
      tools: Array.isArray(info.tools) ? info.tools : [],
      ready: info.ready === true,
      reason: '',
      pid: typeof process === 'undefined' ? -1 : process.pid,
      scopes,
    };
  } catch (error: unknown) {
    return emptyDescription(`读取通道失败：${errorText(error)}`, scopes);
  }
}
