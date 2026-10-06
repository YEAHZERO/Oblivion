/**
 * 有数（@oblivion/daily-life）· 客户端格式化（**纯函数，无 DOM、无 React**）。
 *
 * 拆出来的理由与 panel 那边一样：这些是「口径的最后一公里」，必须能在 Node 里直接测
 * —— 界面里最容易悄悄出错的就是金额与日期的显示（多一位小数、少一个零、把 null 显示成 ¥0）。
 *
 * 三条显示规则（对应规格）：
 *   ① **null 一律显示 `—`**，绝不显示成 0 —— 「不知道」和「是零」是两件事；
 *   ② 日期一律 `YYYY-MM-DD`（后端给的就是这个形状，这里不重新解析、不换格式）；
 *   ③ 金额两位小数 + 千分位；日耗按天给一位小数（`¥9.9/天`）。
 */

import { CATEGORY_SEED, type ItemRow, type ItemStatus, type LedgerStats, type MetricsOptions } from '../metrics.js';

/** 数值兜底：非有限一律 `—`。 */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 千分位（只处理整数部分的字符串）。 */
function group(intPart: string): string {
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  let out = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ',';
    out += digits[index];
  }
  return (negative ? '-' : '') + out;
}

/** `¥8,999.00`；null 或非有限 → `—`。 */
export function money(value: number | null | undefined): string {
  const number = finite(value);
  if (number === null) return '—';
  const fixed = Math.abs(number).toFixed(2).split('.');
  return (number < 0 ? '-¥' : '¥') + group(fixed[0]) + '.' + fixed[1];
}

/** 带正负号的差额：`+¥120.00` / `-¥80.00`。 */
export function signedMoney(value: number | null | undefined): string {
  const number = finite(value);
  if (number === null) return '—';
  return (number > 0 ? '+' : '') + money(number);
}

/** 日耗：`¥9.9/天`（一位小数，`.0` 收掉）；null → `—`。 */
export function moneyPerDay(value: number | null | undefined): string {
  const number = finite(value);
  if (number === null) return '—';
  const text = number.toFixed(1).replace(/\.0$/, '');
  return '¥' + group(text.split('.')[0]) + (text.includes('.') ? '.' + text.split('.')[1] : '') + '/天';
}

/** 比率 → `83%`（0 位小数）；null → `—`。 */
export function percentText(ratio: number | null | undefined): string {
  const number = finite(ratio);
  if (number === null) return '—';
  return Math.round(number * 100) + '%';
}

/** 日期原样露出（形状不对就说 `—`，不猜）。 */
export function dayText(day: string | null | undefined): string {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '—';
}

/** 单位换算：只做「天」这一档（规格里的持有/闲置时长都是天）。 */
export function daysText(days: number | null | undefined): string {
  const number = finite(days);
  return number === null ? '—' : number + ' 天';
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  serving: '服役中',
  idle: '闲置中',
  sold: '已卖出',
};

/** 状态中文标签；未知状态原样露出（后端以后新增状态时不能编解释）。 */
export function statusLabel(status: string): string {
  return (STATUS_LABEL as Record<string, string>)[status] ?? status;
}

/** 语义色档：好 / 提醒 / 已退役（界面用它上色，不写字面量）。 */
export type Tone = 'good' | 'warn' | 'muted';

export function statusTone(status: string): Tone {
  if (status === 'serving') return 'good';
  if (status === 'idle') return 'warn';
  return 'muted';
}

export interface KpiCell {
  label: string;
  value: string;
  hint: string;
}

/**
 * 顶部 KPI —— **最多 3 个数字**（参考项目「我的」页就是三格纯文本）。
 *
 * 选这三个的理由：账面投入（我到底花了多少）、日耗合计（此刻每天在为这些东西付多少）、
 * 闲置损耗（其中有多少是白白烧掉的）。其余统计都下沉到列表与状态行。
 */
export function kpiRow(stats: LedgerStats): KpiCell[] {
  return [
    { label: '账面投入', value: money(stats.netSpend), hint: '买入合计 - 卖出回收' },
    { label: '日耗合计', value: moneyPerDay(stats.dailyTotal), hint: '所有服役/闲置物品的日均成本之和' },
    { label: '闲置损耗', value: moneyPerDay(stats.idleBurn), hint: '闲置物品贡献的那部分日耗' },
  ];
}

/** 一行状态概览：`共 72 件 · 服役中 43 · 闲置 18 · 已卖出 11`。 */
export function countLine(stats: LedgerStats): string {
  return `共 ${String(stats.count)} 件 · 服役中 ${String(stats.servingCount)} · 闲置 ${String(stats.idleCount)} · 已卖出 ${String(stats.soldCount)}`;
}

/** 服役进度文案：`服役 83% · 超标 42 天` / `服役 30%`（未达标时不吹「还差多少」，那会像催债）。 */
export function progressText(row: ItemRow): string {
  const percent = percentText(row.derived.usageProgress);
  const overdue = finite(row.derived.overdueDays);
  if (overdue !== null && overdue > 0) return `服役 ${percent} · 超标 ${String(overdue)} 天`;
  return `服役 ${percent}`;
}

/** 副标题那一行：总价 / 已用 / 闲置或保值 —— 全部走 `—` 兜底。 */
export function metaText(row: ItemRow): string {
  const parts = [`总价 ${money(row.buyPrice)}`, `已用 ${daysText(row.derived.holdingDays)}`];
  if (row.derived.status === 'sold') {
    parts.push(`保值 ${percentText(row.derived.retentionRate)}`);
    parts.push(`差额 ${signedMoney(row.derived.soldDelta)}`);
  } else {
    parts.push(`闲置 ${daysText(row.derived.idleDays)}`);
  }
  return parts.join(' · ');
}

/** 「用过一次」按钮的提示：最后使用日 / 次数。 */
export function useHintText(row: ItemRow): string {
  const count = finite(row.useCount);
  const last = dayText(row.lastUsedAt);
  return `用过 ${count === null ? '—' : String(count)} 次 · 最后一次 ${last}`;
}

/** 数值展示：`9.9`（一位小数，去尾）—— 图表缺席时用它给纯文本数字。 */
export function numberText(value: number | null | undefined, digits = 1): string {
  const number = finite(value);
  return number === null ? '—' : number.toFixed(digits).replace(/\.0+$/, '');
}

export { CATEGORY_SEED };
export type { ItemRow, ItemStatus, LedgerStats, MetricsOptions };

/**
 * HTTP 状态 → 人话。未知状态不编解释，只报状态码。
 *
 * 这几条与 `src/index.ts` 的行为表一一对应：405 方法不对、403 跨源、400 字段校验、
 * 404 找不到、409 满了、413 太大、500 内部异常。
 */
export function httpText(status: number, errors?: readonly string[]): string {
  const detail = errors !== undefined && errors.length > 0 ? '：' + errors.join('；') : '';
  switch (status) {
    case 400:
      return '字段没填对' + detail;
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
      return '请求失败（HTTP ' + String(status) + '）' + detail;
  }
}
