/**
 * 有数（@oblivion/daily-life）· 指标层（纯函数）。
 *
 * 不碰 IO、不 import `node:`、不知道 HTTP 与 React 的存在 —— 于是 Node 半边、
 * 浏览器半边、`node --test` 与 selfcheck 用的是**同一份口径**：
 * 日均成本、服役进度、闲置天数、保值率在这台机器上只有一个定义。
 *
 * ## 立场
 *
 * > 物品的价值不是它标价多少，而是它为你服务了多少天。
 *
 * 所以核心指标不是「花了多少钱」，而是 **真实日均成本**
 * `(buyPrice - 已回收) / holdingDays`，配套两个反问：
 * 「离目标服役期还有多远」（`usageProgress` / `overdueDays`）与
 * 「它多少天没被用过了」（`idleDays`）。
 *
 * ## 与参考项目（youshu-master，MIT）的关系
 *
 * 只**借鉴思路**、不复制代码。参考是一个「家庭物品 / 有效期库存」App
 * （`app/src/main/java/com/youshu/app/**`），全仓 grep
 * `dailyCost|日均|每日成本|折旧|soldPrice|buyDate|使用寿命|服役` **零命中** ——
 * 也就是说：日耗、持有天数、服役进度、保值率、闲置损耗**全是本项目的口径**，
 * 没有任何参考先例可援引；下面的注释只在**参考确实给出正/反佐证**时才引用它，
 * 并写清行号。README 的「与参考项目的差异」一节列了全部对照点。
 */

/** 目标服役天数默认值：1095 天 ≈ 3 年（数码/家电的常见心理账期）。 */
export const DEFAULT_SERVICE_DAYS = 1095;

/** 多少天没用过算「闲置」。**只此一处**定义，UI 不许再写字面量。 */
export const IDLE_WARN_DAYS = 90;

/** 榜单/明细节数（日均成本榜、闲置榜）。 */
export const TOP_N = 5;

/** 金额小数位：一律 HALF_UP 到 2 位。 */
export const MONEY_DECIMALS = 2;

/** 分类种子集（资产口径；与参考那套「食品/药品/日用品」的消耗品口径不同）。 */
export const CATEGORY_SEED = ['数码', '家电', '家居', '交通', '服饰', '工具', '文娱', '其他'] as const;

export type Category = (typeof CATEGORY_SEED)[number] | (string & {});

/**
 * 物品状态。
 *
 * **刻意用字符串枚举**：参考用的是 Int 魔术值
 * （`data/local/entity/Item.kt:62-64`：`STATUS_IN_USE = 0 / STATUS_USED_UP = 1 /
 * STATUS_DISCARDED = 2`），读日志、读 JSON、读数据库都得回查常量表。
 * 我们落盘的账本是给人看的，状态写成 `serving|idle|sold` 自解释，
 * 而且字符串枚举在 TS 里能被穷尽检查。README 把这条列为**反面教训**。
 */
export type ItemStatus = 'serving' | 'idle' | 'sold';

/** 一件物品的落盘字段。可空字段统一 `null`（**不用空串**，见文件尾的说明）。 */
export interface Item {
  id: string;
  name: string;
  /** 买入价（元）。**必填**：有限数且 ≥ 0 —— 于是 `dailyCost` 恒为数字，没有「未记账」双态。 */
  buyPrice: number;
  /** 买入日 `YYYY-MM-DD`（本地日历日字符串，不是 epoch millis）。 */
  buyDate: string;
  category: Category | null;
  /** 目标服役天数；`null` 表示用 `DEFAULT_SERVICE_DAYS`。 */
  serviceDaysTarget: number | null;
  /** 卖出日 `YYYY-MM-DD`；非 `null` 即已卖出。 */
  soldDate: string | null;
  /** 卖出价（元）= 已回收金额；未卖出为 `null`。 */
  soldPrice: number | null;
  /** 最近一次使用日 `YYYY-MM-DD`；`null` 表示「买了就没用过」。 */
  lastUsedAt: string | null;
  useCount: number | null;
  note: string | null;
  imagePath: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 由 `Item` 现算的派生指标 —— **不落盘**（改口径不需要数据迁移）。 */
export interface ItemDerived {
  /** 持有天数：`buyDate → (soldDate ?? today)`，**含首日、最小 1**。 */
  holdingDays: number;
  /** 已回收金额（未卖出为 0）。 */
  recovered: number;
  /** 真实日均成本 = `(buyPrice - recovered) / holdingDays`，HALF_UP 到 2 位。 */
  dailyCost: number;
  /** 生效的目标服役天数（`serviceDaysTarget ?? DEFAULT_SERVICE_DAYS`）。 */
  serviceDaysTarget: number;
  /** 进度条用：`clamp(holdingDays / serviceDaysTarget, 0, 1)`。 */
  usageProgress: number;
  /** 未截断的服役比 `holdingDays / serviceDaysTarget`（可以 > 1）。 */
  usageRatio: number;
  /** 超额服役天数 = `max(0, holdingDays - serviceDaysTarget)`。 */
  overdueDays: number;
  /** 保值率 = `soldPrice / buyPrice`；仅已卖出且 `buyPrice > 0` 时给数字，否则 `null`。 */
  retentionRate: number | null;
  /** 距今多少天没用过（最近使用当天为 0；从未用过则从买入日起算）。 */
  idleDays: number;
  status: ItemStatus;
  /** 卖出盈亏 = `soldPrice - buyPrice`；未卖出为 `null`。 */
  soldDelta: number | null;
}

/** 「带派生指标的一行」—— 路由、UI、自检都发这个形状。 */
export interface ItemRow extends Item {
  derived: ItemDerived;
}

export interface LedgerStats {
  count: number;
  servingCount: number;
  idleCount: number;
  soldCount: number;
  /** 服役中 + 闲置的买入价合计（「这些东西一共压了多少钱」）。 */
  servingValue: number;
  /** 已卖出的回收金额合计。 */
  soldValue: number;
  /** 净投入 = Σ买入价 − Σ卖出价（钱真正出去了多少）。 */
  netSpend: number;
  /** 服役中 + 闲置的日均成本合计（「每天的总持有成本」）。 */
  dailyTotal: number;
  /** 闲置那部分的日均成本合计（「每天正在白白烧掉多少」）。 */
  idleBurn: number;
  /** 已卖出的盈亏合计。 */
  soldPnl: number;
  /** 全局保值率 = Σ卖出价 / Σ买入价（已卖出那批）；没有卖出记录时为 `null`。 */
  retentionRate: number | null;
  /** 超额服役（`overdueDays > 0`）的件数。 */
  overdueCount: number;
  statusMix: Array<{ status: ItemStatus; count: number; value: number }>;
  byCategory: Array<{ category: string; count: number; value: number }>;
  topDaily: ItemRow[];
  idleTop: ItemRow[];
}

export interface MetricsOptions {
  /** 闲置阈值（天）。默认 `IDLE_WARN_DAYS`。 */
  idleWarnDays?: number;
  /** 榜单条数。默认 `TOP_N`。 */
  top?: number;
}

const MS_PER_DAY = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 金额圆整：**显式 HALF_UP 到 2 位**。
 *
 * 参考侧是风险点：`util/DateUtil.kt:16` 用 `NumberFormat.getCurrencyInstance(Locale.CHINA)`
 * 且**未指定舍入模式**（Java 默认 HALF_EVEN），金额边界上会给出让人意外的结果。
 * 我们显式定义 HALF_UP，并先用 `toFixed(9)` 抹掉二进制表示误差
 * （`1.005 * 100 = 100.49999999999999`，裸 `Math.round` 会得到 1.00 而不是 1.01），
 * 单测钉住 `0.005 / 1.005 / 2.675` 三位边界。
 *
 * 非有限数（NaN / Infinity）一律返回 0 —— 账本里出现 NaN 比出现 0 更糟。
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const scaled = Number((Math.abs(value) * 100).toFixed(9));
  return (sign * Math.round(scaled)) / 100;
}

/**
 * `YYYY-MM-DD` → **本地**零点毫秒；非法返回 `null`。
 *
 * 不用 `new Date('2025-08-12')`：它按 **UTC** 解析，在东八区会落到 08:00，
 * 与「今天」相减就可能少一天。这里逐段校验 + 本地构造 + 回读校验
 * （`2025-02-30` 被 Date 归一成 3 月 2 日，必须判非法）。
 */
export function parseDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const matched = DAY_RE.exec(value.trim());
  if (matched === null) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at.getTime();
}

/** 本地零点毫秒。 */
export function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** 今天（本地零点毫秒）。 */
export function todayStart(now: number = Date.now()): number {
  return startOfDay(now);
}

/** 时间戳 → `YYYY-MM-DD`（本地日历日，全项目唯一的日期显示口径）。 */
export function formatDay(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/** 两个时间戳隔了几个日历日（同一天 0，跨一天 1）。 */
export function daysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}

/** 求和时一律过这一层：NaN / Infinity 当 0（参考侧用 SQL `COALESCE(SUM(...), 0.0)` 表达同一用意）。 */
function safeSum(values: number[]): number {
  let total = 0;
  for (const value of values) {
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 算一件物品的全部派生指标。
 *
 * `today` 由调用方传入（不内部 `Date.now()`）：测试与自检必须能钉住「今天是哪天」，
 * 否则用例会随真实日期漂移 —— 那种测试第二天就红。
 *
 * **持有天数刻意与参考不同**：参考 `util/DateUtil.kt:27-31` 的 `daysUntil()` 走
 * `ChronoUnit.DAYS.between(today, target)`（自然日差、**不含当天**，且没有下界），
 * 我们**含首日并兜底 1** —— 当天买入的一件物品持有天数是 1 而不是 0，
 * 避免除零，也更符合「用了 1 天」的直觉。README 记了这条差异。
 */
export function deriveItem(item: Item, today: number, options: MetricsOptions = {}): ItemDerived {
  const idleWarnDays = options.idleWarnDays ?? IDLE_WARN_DAYS;
  const boughtAt = parseDay(item.buyDate) ?? today;
  const soldAt = item.soldDate === null || item.soldDate === '' ? null : parseDay(item.soldDate);
  const endAt = soldAt ?? today;

  // ① 持有天数：含首日、最小 1 天。
  const holdingDays = Math.max(1, daysBetween(boughtAt, endAt) + 1);

  // ② 已回收与真实日均成本。
  const buyPrice = Number.isFinite(item.buyPrice) ? item.buyPrice : 0;
  const recovered = soldAt !== null ? (Number.isFinite(item.soldPrice ?? NaN) ? Number(item.soldPrice) : 0) : 0;
  const dailyCost = roundMoney((buyPrice - recovered) / holdingDays);

  // ③ 服役进度：进度条截断到 1，同时给出未截断比与超额天数。
  const serviceDaysTarget =
    Number.isFinite(item.serviceDaysTarget ?? NaN) && Number(item.serviceDaysTarget) > 0
      ? Number(item.serviceDaysTarget)
      : DEFAULT_SERVICE_DAYS;
  const usageRatio = holdingDays / serviceDaysTarget;
  const usageProgress = clamp(usageRatio, 0, 1);
  const overdueDays = Math.max(0, holdingDays - serviceDaysTarget);

  // ④ 保值率：只有真卖出去了才有意义，否则 null（不要用 0 冒充「没算」）。
  const retentionRate = soldAt !== null && buyPrice > 0 ? recovered / buyPrice : null;

  // ⑤ 闲置天数：最近一次使用（null 表示从没记过，退回买入日）。
  const lastUsedAt = item.lastUsedAt === null || item.lastUsedAt === '' ? boughtAt : (parseDay(item.lastUsedAt) ?? boughtAt);
  const idleDays = Math.max(0, daysBetween(lastUsedAt, today));

  const status: ItemStatus = soldAt !== null ? 'sold' : idleDays >= idleWarnDays ? 'idle' : 'serving';

  return {
    holdingDays,
    recovered,
    dailyCost,
    serviceDaysTarget,
    usageProgress,
    usageRatio,
    overdueDays,
    retentionRate,
    idleDays,
    status,
    soldDelta: soldAt !== null ? recovered - buyPrice : null,
  };
}

/** 一项物品 → 带指标的一行。 */
export function rowOf(item: Item, today: number, options: MetricsOptions = {}): ItemRow {
  return { ...item, derived: deriveItem(item, today, options) };
}

/** 汇总成看板要的那几个数。 */
export function summarize(rows: ItemRow[], options: MetricsOptions = {}): LedgerStats {
  const top = Math.max(0, Math.floor(options.top ?? TOP_N));
  const serving = rows.filter((row) => row.derived.status === 'serving');
  const idle = rows.filter((row) => row.derived.status === 'idle');
  const sold = rows.filter((row) => row.derived.status === 'sold');
  const inService = rows.filter((row) => row.derived.status !== 'sold');

  const inServiceValue = safeSum(inService.map((row) => row.buyPrice));
  const soldValue = safeSum(sold.map((row) => row.derived.recovered));
  const soldCost = safeSum(sold.map((row) => row.buyPrice));

  const categories = new Map<string, { count: number; value: number }>();
  for (const row of rows) {
    const category = row.category === null || String(row.category).trim() === '' ? '其他' : String(row.category).trim();
    const bucket = categories.get(category) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += row.derived.status === 'sold' ? row.derived.recovered : row.buyPrice;
    categories.set(category, bucket);
  }

  return {
    count: rows.length,
    servingCount: serving.length,
    idleCount: idle.length,
    soldCount: sold.length,
    servingValue: roundMoney(inServiceValue),
    soldValue: roundMoney(soldValue),
    netSpend: roundMoney(inServiceValue + soldCost - soldValue),
    dailyTotal: roundMoney(safeSum(inService.map((row) => row.derived.dailyCost))),
    idleBurn: roundMoney(safeSum(idle.map((row) => row.derived.dailyCost))),
    soldPnl: roundMoney(safeSum(sold.map((row) => row.derived.soldDelta ?? 0))),
    retentionRate: soldCost > 0 ? soldValue / soldCost : null,
    overdueCount: rows.filter((row) => row.derived.overdueDays > 0).length,
    statusMix: (['serving', 'idle', 'sold'] as ItemStatus[]).map((status) => {
      const list = rows.filter((row) => row.derived.status === status);
      return {
        status,
        count: list.length,
        value: roundMoney(safeSum(list.map((row) => (status === 'sold' ? row.derived.recovered : row.buyPrice)))),
      };
    }),
    byCategory: [...categories.entries()]
      .map(([category, bucket]) => ({ category, count: bucket.count, value: roundMoney(bucket.value) }))
      .sort((left, right) => right.value - left.value),
    topDaily: [...inService].sort((left, right) => right.derived.dailyCost - left.derived.dailyCost).slice(0, top),
    idleTop: [...idle].sort((left, right) => right.derived.idleDays - left.derived.idleDays).slice(0, top),
  };
}

/** 校验结果。 */
export interface CheckResult {
  ok: boolean;
  errors: string[];
  /** 归一化后的字段（`ok === false` 时是尽量修好的部分结果）。 */
  value: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 可空字符串字段：空 / 缺 / 非法一律归一成 **`null`**。
 *
 * 参考侧是反面教训：`data/local/entity/Item.kt:40-41` 用 `note: String = ""` 与
 * `imagePath: String = ""` 表示「没有」，于是下游永远要同时判 `null` 与空串
 * （`primaryImagePath()` 还得 `orEmpty()` 兜一层）。我们只留一种「空」：`null`。
 */
function nullableText(value: unknown): string | null {
  const raw = text(value);
  return raw === '' ? null : raw;
}

/**
 * 校验并归一化一件物品（**所有写路径都必须过这里**）。
 *
 * 放成纯函数而不是塞进路由：入口有三个（HTTP、将来的导入、模型工具），
 * 口径只要漏一处就会出现「某条路能写进脏数据」。可测、必过。
 */
export function validateItem(raw: unknown, today: number = Date.now()): CheckResult {
  const errors: string[] = [];
  const source = (raw ?? {}) as Record<string, unknown>;

  const name = text(source.name);
  if (name === '') errors.push('name 不能为空');
  else if (name.length > 40) errors.push('name 不能超过 40 字');

  // buyPrice **必填**：缺 / 空串都要报错，绝不能因为 `Number('') === 0` 就被静默当成 0
  // （规格：不做「未记账 ⇒ null」的双态，`dailyCost` 因此恒为数字）。
  const priceRaw = source.buyPrice;
  const priceText = typeof priceRaw === 'number' ? null : text(priceRaw);
  const buyPrice = typeof priceRaw === 'number' ? priceRaw : priceText === '' ? Number.NaN : Number(priceText);
  if (!Number.isFinite(buyPrice) || buyPrice < 0) errors.push('buyPrice 必须是不小于 0 的数字');

  const buyDate = text(source.buyDate);
  if (buyDate === '') errors.push('buyDate 不能为空');
  else if (parseDay(buyDate) === null) errors.push('buyDate 必须是 YYYY-MM-DD');

  const soldDateRaw = nullableText(source.soldDate);
  if (soldDateRaw !== null && parseDay(soldDateRaw) === null) errors.push('soldDate 必须是 YYYY-MM-DD');

  const soldPriceRaw = source.soldPrice;
  const soldPrice =
    soldPriceRaw === undefined || soldPriceRaw === null || soldPriceRaw === '' ? null : Number(soldPriceRaw);
  if (soldPrice !== null && (!Number.isFinite(soldPrice) || soldPrice < 0)) errors.push('soldPrice 必须是不小于 0 的数字');
  if (soldDateRaw !== null && soldPrice === null) errors.push('填了 soldDate 就要填 soldPrice（卖了多少钱）');
  if (soldDateRaw === null && soldPrice !== null) errors.push('填了 soldPrice 就要填 soldDate（哪天卖的）');

  const lastUsedRaw = nullableText(source.lastUsedAt);
  if (lastUsedRaw !== null && parseDay(lastUsedRaw) === null) errors.push('lastUsedAt 必须是 YYYY-MM-DD');

  const boughtAt = parseDay(buyDate);
  const soldAt = soldDateRaw === null ? null : parseDay(soldDateRaw);
  const lastUsedAt = lastUsedRaw === null ? null : parseDay(lastUsedRaw);
  const todayAt = startOfDay(today);
  if (boughtAt !== null && soldAt !== null && soldAt < boughtAt) errors.push('soldDate 不能早于 buyDate');
  if (soldAt !== null && soldAt > todayAt) errors.push('soldDate 不能是未来');
  if (boughtAt !== null && boughtAt > todayAt) errors.push('buyDate 不能是未来');
  if (lastUsedAt !== null && lastUsedAt > todayAt) errors.push('lastUsedAt 不能是未来');
  if (lastUsedAt !== null && boughtAt !== null && lastUsedAt < boughtAt) errors.push('lastUsedAt 不能早于 buyDate');

  const targetRaw = source.serviceDaysTarget;
  const target = targetRaw === undefined || targetRaw === null || targetRaw === '' ? null : Number(targetRaw);
  if (target !== null && (!Number.isFinite(target) || target <= 0)) errors.push('serviceDaysTarget 必须是正数');

  const useCountRaw = source.useCount;
  const useCount = useCountRaw === undefined || useCountRaw === null || useCountRaw === '' ? null : Number(useCountRaw);
  if (useCount !== null && (!Number.isFinite(useCount) || useCount < 0)) errors.push('useCount 必须是不小于 0 的数字');

  const value = {
    name,
    buyPrice: Number.isFinite(buyPrice) ? roundMoney(Math.max(0, buyPrice)) : 0,
    buyDate,
    category: nullableText(source.category),
    serviceDaysTarget: target,
    soldDate: soldDateRaw,
    soldPrice: soldDateRaw === null ? null : soldPrice,
    lastUsedAt: lastUsedRaw,
    useCount,
    note: nullableText(source.note),
    imagePath: nullableText(source.imagePath),
  };

  return { ok: errors.length === 0, errors, value };
}
