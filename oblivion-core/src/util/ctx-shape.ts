/**
 * **ctx 形状全量 dump**（诊断用，不是业务逻辑）。
 *
 * 起因：`mount-diag.json` 实测 `hasInject:false`，但 `@oblivion/panel` 的 Host 半边却成功用了
 * `ctx.inject(['webServer'])` —— 两者都是用户层挂载，形状必然不同。继续猜没意义，
 * 这里把「可见成员名 / 原型链 / 每个成员的 typeof / 常见成员探测」一次落盘。
 */
export interface CtxShape {
  keys: string[];
  prototypes: string[];
  typeofs: Record<string, string>;
  /** 逐个探测常见成员，避免"只 dump 自有键"漏掉原型上的方法。 */
  probes: Record<string, string>;
  ownKeyCount: number;
  isFunction: boolean;
  constructor: string;
}

/** 常见成员探测表：覆盖 Cordis 上下文与 DSH 宿主服务。 */
const PROBE_NAMES = [
  'on', 'off', 'once', 'emit', 'parallel', 'serial', 'bail', 'waterfall',
  'inject', 'get', 'set', 'provide', 'effect', 'plugin', 'scope', 'fiber',
  'logger', 'reflect', 'root', 'ctx', 'registry',
  'agents', 'sessions', 'sessionProjections', 'tools', 'systemPrompt', 'webServer',
  'slots', 'locale', 'shortcuts', 'remote', 'layout',
] as const;

/** 安全取 typeof（getter 抛错时记 '(throws)' 而不是让诊断本身崩掉）。 */
function typeOf(target: Record<string, unknown>, key: string): string {
  try {
    return typeof target[key];
  } catch {
    return '(throws)';
  }
}

export function describeCtx(ctx: unknown): CtxShape {
  const target = (ctx ?? {}) as Record<string, unknown>;
  const keys = Object.keys(target);
  const prototypes: string[] = [];
  let cursor: unknown = Object.getPrototypeOf(target);
  for (let depth = 0; depth < 5 && cursor; depth += 1) {
    prototypes.push((cursor as { constructor?: { name?: string } }).constructor?.name ?? '(anonymous)');
    cursor = Object.getPrototypeOf(cursor);
  }
  const typeofs: Record<string, string> = {};
  for (const key of keys) typeofs[key] = typeOf(target, key);
  const probes: Record<string, string> = {};
  for (const name of PROBE_NAMES) {
    const value = typeOf(target, name);
    if (value !== 'undefined') probes[name] = value;
  }
  return {
    keys: keys.slice(0, 80),
    prototypes,
    typeofs,
    probes,
    ownKeyCount: keys.length,
    isFunction: typeof ctx === 'function',
    constructor: (target.constructor as { name?: string } | undefined)?.name ?? '(none)',
  };
}
