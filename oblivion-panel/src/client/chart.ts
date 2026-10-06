/**
 * 判定曲线（分值随时间的位置）—— 纯几何，不引 React、不引 `node:`。
 *
 * 为什么要有曲线：所有者 2026-10-06 看了「最近判定」列表（一次列 10 行，
 * 每行都是「已沉淀 · 分值 0.8」）说「不需要这么多，可以给个图表曲线看看」。
 * 于是列表缩到最近几条（可展开），趋势交给这条曲线：分值点位 + 阈值虚线 + 均值趋势线。
 *
 * 几何口径（刻意固定，不是随手写的）：
 *   - 纵轴**恒为 0..1**（core 的价值分是 0..1 的加权分），不按数据自适应 ——
 *     这样两次刷新之间、两条曲线之间能直接比，阈值线也才有意义；
 *   - 横轴按**行序**等距，不是按时间：留痕里有的行没有 `at`（`no-qa` 也占一行），
 *     按时间排会把长空闲挤成一堆，行序才是「第几次判定」；
 *   - 没有分值的行（`no-qa`）**不落点**，只计入 `skipped` —— 不编造 0 分。
 */

/** 曲线只需要留痕里的这几个字段（与 `snapshot.ts` 的 `DecisionRow` 同形，这里只取用到的）。 */
export interface CurveRow {
  at?: number;
  score?: number;
  pass?: boolean;
  action?: string;
}

export interface CurveOptions {
  width?: number;
  height?: number;
  /** 阈值线位置（0..1）；超出范围或非数字 = 不画。 */
  threshold?: number | null;
  /** 趋势线的滑动窗口（点数），默认 5；小于 2 按 2 算。 */
  trendWindow?: number;
}

export interface CurveDot {
  at: number;
  score: number;
  pass: boolean;
  action: string;
  x: number;
  y: number;
}

export interface CurveGeometry {
  width: number;
  height: number;
  padX: number;
  padY: number;
  /** 落点的判定数（有分值的行）。 */
  points: number;
  /** 被跳过的行数（没有分值：`no-qa` 等）。 */
  skipped: number;
  min: number | null;
  max: number | null;
  /** 折线路径（`M x y L x y …`）；没有点是空串。 */
  line: string;
  /** 折线下方的填充（到 y=0 的基线）；点少于 2 个是空串。 */
  area: string;
  /** 滑动均值趋势线；点少于 3 个是空串（两个点「趋势」是假的）。 */
  trend: string;
  dots: CurveDot[];
  threshold: number | null;
  /** 阈值线的 y；没给阈值时不画（null）。 */
  thresholdY: number | null;
  /** 纵轴刻度（1.0 / 0.5 / 0.0），横线由展示层画。 */
  ticks: Array<{ y: number; label: string }>;
  /** 点太少（< 2）：曲线还说明不了趋势，展示层要照实说。 */
  thin: boolean;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 76;
const DEFAULT_PAD_X = 6;
const DEFAULT_PAD_Y = 8;
const DEFAULT_TREND_WINDOW = 5;

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** 坐标保留两位小数：SVG 里的 0.30000000000000004 只会让产物变大。 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratioIn01(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/**
 * core 把**整份 config** 写进了 `status.json`，所以阈值可以从宿主快照里读出来
 * （`valueThreshold`，owner 2026-10-06 从设计书的 0.5 调到 0.30）。
 * 读不到 / 不在 0..1 内就返回 null —— 宁可不画那条线，也不画一条假的。
 */
export function thresholdOf(config: unknown): number | null {
  const record = config as { valueThreshold?: unknown } | null | undefined;
  return ratioIn01(record?.valueThreshold);
}

export function buildScoreCurve(rows: CurveRow[] | undefined, options: CurveOptions = {}): CurveGeometry {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padX = DEFAULT_PAD_X;
  const padY = DEFAULT_PAD_Y;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);
  const trendWindow = Math.max(2, Math.floor(options.trendWindow ?? DEFAULT_TREND_WINDOW));
  const threshold = ratioIn01(options.threshold);

  const input = Array.isArray(rows) ? rows : [];
  const scored: Array<{ at: number; score: number; pass: boolean; action: string }> = [];
  let skipped = 0;
  for (const row of input) {
    if (row === null || typeof row !== 'object' || typeof row.score !== 'number' || !Number.isFinite(row.score)) {
      skipped += 1;
      continue;
    }
    scored.push({
      at: typeof row.at === 'number' ? row.at : 0,
      score: clamp01(row.score),
      pass: row.pass === true,
      action: typeof row.action === 'string' ? row.action : '',
    });
  }

  const xAt = (index: number): number =>
    scored.length <= 1 ? padX + innerW / 2 : padX + (index / (scored.length - 1)) * innerW;
  const yAt = (score: number): number => padY + (1 - score) * innerH;

  const dots: CurveDot[] = scored.map((point, index) => ({
    ...point,
    x: round(xAt(index)),
    y: round(yAt(point.score)),
  }));

  const line = dots.map((dot, index) => (index === 0 ? 'M' : 'L') + dot.x + ' ' + dot.y).join(' ');

  const baseline = round(padY + innerH);
  const area =
    dots.length >= 2
      ? line +
        ' L' +
        dots[dots.length - 1].x +
        ' ' +
        baseline +
        ' L' +
        dots[0].x +
        ' ' +
        baseline +
        ' Z'
      : '';

  let trend = '';
  if (dots.length >= 3) {
    trend = dots
      .map((dot, index) => {
        const from = Math.max(0, index - trendWindow + 1);
        let sum = 0;
        for (let cursor = from; cursor <= index; cursor += 1) sum += scored[cursor].score;
        const mean = sum / (index - from + 1);
        return (index === 0 ? 'M' : 'L') + dot.x + ' ' + round(yAt(mean));
      })
      .join(' ');
  }

  const scores = scored.map((point) => point.score);
  const ticks = [1, 0.5, 0].map((value) => ({ y: round(yAt(value)), label: value.toFixed(1) }));

  return {
    width,
    height,
    padX,
    padY,
    points: dots.length,
    skipped,
    min: scores.length > 0 ? Math.min(...scores) : null,
    max: scores.length > 0 ? Math.max(...scores) : null,
    line,
    area,
    trend,
    dots,
    threshold,
    thresholdY: threshold === null ? null : round(yAt(threshold)),
    ticks,
    thin: dots.length < 2,
  };
}

/**
 * 曲线下面那行小字（做成纯函数是为了能测：文案里的数字全部来自几何，不另算一遍）。
 * 例：`最近 24 条判定 · 有效分值 22 个 · 阈值 0.30 · 区间 0.21–0.80`。
 */
export function curveCaption(rows: CurveRow[] | undefined, curve: CurveGeometry): string {
  const total = Array.isArray(rows) ? rows.length : 0;
  const parts = ['最近 ' + total + ' 条判定', '有效分值 ' + curve.points + ' 个'];
  if (curve.skipped > 0) parts.push('无分值 ' + curve.skipped + ' 条');
  if (curve.threshold !== null) parts.push('阈值 ' + curve.threshold.toFixed(2));
  if (curve.min !== null && curve.max !== null) {
    parts.push('区间 ' + curve.min.toFixed(2) + '–' + curve.max.toFixed(2));
  }
  if (curve.points === 0) parts.push('还没有带分值的判断');
  else if (curve.thin) parts.push('点太少（' + curve.points + ' 个），还看不出趋势');
  return parts.join(' · ');
}
