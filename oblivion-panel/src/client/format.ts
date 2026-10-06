/**
 * 展示层纯函数（不碰 DOM、不碰 React，便于 node --test 直接测）。
 */

/** `0.0312 → '3.1%'`；分母为 0 时返回 `'—'`（没有分母和 0% 是两件事）。 */
export function percent(ratio: unknown): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '—';
  return (ratio * 100).toFixed(1) + '%';
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
export function relativeTime(at: unknown, now: number = Date.now()): string {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return '—';
  const delta = now - at;
  if (delta < 0) return '刚刚';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + ' 分钟前';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' 小时前';
  return Math.floor(hours / 24) + ' 天前';
}

/** 判定动作的中文标签（与 core 的 `DecisionRecord.action` 一一对应）。 */
export function actionLabel(action: unknown): string {
  switch (action) {
    case 'created':
      return '已沉淀';
    case 'appended':
      return '追加';
    case 'duplicate':
      return '重复';
    case 'conflict':
      return '冲突';
    case 'ignored':
      return '被拦下';
    case 'no-qa':
      return '无问答';
    default:
      return String(action ?? '未知');
  }
}

export interface HintLike {
  key?: string;
  current?: unknown;
  suggested?: unknown;
  why?: string;
}

/** 一条调参建议压成一行可读文本：`键：现值 → 建议值（依据）`。 */
export function hintLine(hint: HintLike): string {
  const key = hint.key ?? '(未知键)';
  const current = hint.current === undefined ? '—' : formatValue(hint.current);
  const suggested = hint.suggested === undefined ? '' : ' → ' + formatValue(hint.suggested);
  const why = hint.why ? '　' + hint.why : '';
  return key + '：' + current + suggested + why;
}

/** 值渲染：对象走紧凑 JSON，其余走 String。 */
export function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/** 从 core 的 `status.json` 里取一个统计数字（缺字段时返回 undefined，不抛）。 */
export function statNumber(core: unknown, field: string): number | undefined {
  if (!core || typeof core !== 'object') return undefined;
  const stats = (core as { stats?: unknown }).stats;
  if (!stats || typeof stats !== 'object') return undefined;
  const value = (stats as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 分值渲染：core 的 `score` 是 0..1 的浮点，直接 `String()` 会露出 `0.7000000000000001`
 * （面板实测过），所以按千分位取整后再显示 —— 判定阈值最小步长是 0.05，三位足够。
 */
export function scoreText(score: unknown): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return '—';
  return String(Math.round(score * 1000) / 1000);
}

/**
 * 判定原因的中文标签。
 *
 * 键是 `@oblivion/core` 真实写出的 reason 字符串（`src/knowledge/filter.ts`、
 * `src/qa-loop/index.ts`）—— 那边改了这里就要同步；**未知键原样返回**，
 * 宁可露出英文，也不要在这里编一个不存在的解释。
 */
export function reasonLabel(reason: unknown): string {
  const text = typeof reason === 'string' ? reason : String(reason ?? '');
  if (text.startsWith('exception:')) return '判定异常' + text.slice('exception:'.length);
  if (text.startsWith('本轮没有')) return '无问答轮（工具轮 / 注入轮 / 无回答）';
  const map: Record<string, string> = {
    captured: '通过：已沉淀',
    rejected: '已拦截',
    'no-source': '无来源（模型没引用任何文件或工具）',
    'oblivion-originated': '来自本插件自身（防自噬）',
    'answer-too-short': '回答太短',
    'meaningless-only': '没有实质内容',
    'contains-unknown': '回答是「不知道」',
    'pleasantry-only': '只有客套话',
    'exact hash match': '与既有条目完全相同',
    'semantic duplicate': '与既有条目语义重复',
    'conflicts with existing item': '与既有条目冲突',
    'below value threshold': '低于价值阈值',
  };
  return map[text] ?? text;
}

/** 主拦截原因（`byReason` 里计数最大的那个）。 */
export function topReason(core: unknown): { reason: string; count: number } | null {
  if (!core || typeof core !== 'object') return null;
  const stats = (core as { stats?: unknown }).stats;
  if (!stats || typeof stats !== 'object') return null;
  const byReason = (stats as { byReason?: unknown }).byReason;
  if (!byReason || typeof byReason !== 'object') return null;
  const entries = Object.entries(byReason as Record<string, unknown>)
    .filter(([, count]) => typeof count === 'number')
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) return null;
  return { reason: entries[0][0], count: Number(entries[0][1]) };
}
