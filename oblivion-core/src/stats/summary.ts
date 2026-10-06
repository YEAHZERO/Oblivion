import type { Config } from '../config.js';
import type { DecisionRecord } from './trace.js';

/** 阈值调参所需的聚合视图（全部由留痕算出，不额外存状态）。 */
export interface StatsSummary {
  windowDays: number;
  firstAt: number | null;
  lastAt: number | null;
  /** 决策条数（含 `no-qa` 的空轮）。 */
  turns: number;
  /** 真的进了四层筛选的轮数（= turns - noQa）。 */
  evaluated: number;
  noQa: number;
  captured: number;
  rejected: number;
  /** 捕获率 = captured / evaluated（没有可评估轮次时为 0）。 */
  captureRate: number;
  byAction: Record<string, number>;
  byReason: Record<string, number>;
  /** 价值分分布（走到 L4 的那些）。 */
  score: { min: number; p50: number; p90: number; max: number; belowThreshold: number } | null;
  thresholds: {
    valueThreshold: number;
    semanticThreshold: number;
    minAnswerLength: number;
  };
}

function ratio(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 1000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 1000) / 1000;
}

/** 把留痕聚合成调参视图。纯函数，便于测试与自证。 */
export function summarize(records: DecisionRecord[], config: Config, windowDays = 0): StatsSummary {
  const byAction: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const scores: number[] = [];
  let captured = 0;
  let noQa = 0;
  let belowThreshold = 0;

  for (const record of records) {
    byAction[record.action] = (byAction[record.action] ?? 0) + 1;
    const reason = record.reason || '(none)';
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (record.action === 'no-qa') {
      noQa += 1;
      continue;
    }
    if (record.pass) captured += 1;
    if (typeof record.score === 'number') {
      scores.push(record.score);
      if (!record.pass) belowThreshold += 1;
    }
  }

  const evaluated = records.length - noQa;
  scores.sort((a, b) => a - b);
  const ats = records.map((r) => r.at).filter((v) => typeof v === 'number');

  return {
    windowDays,
    firstAt: ats.length ? Math.min(...ats) : null,
    lastAt: ats.length ? Math.max(...ats) : null,
    turns: records.length,
    evaluated,
    noQa,
    captured,
    rejected: evaluated - captured,
    captureRate: ratio(captured, evaluated),
    byAction,
    byReason,
    score: scores.length
      ? {
          min: Math.round(scores[0] * 1000) / 1000,
          p50: percentile(scores, 50),
          p90: percentile(scores, 90),
          max: Math.round(scores[scores.length - 1] * 1000) / 1000,
          belowThreshold,
        }
      : null,
    thresholds: {
      valueThreshold: config.valueThreshold,
      semanticThreshold: config.semanticThreshold,
      minAnswerLength: config.minAnswerLength,
    },
  };
}

/** 一条可执行的调参建议：说清「哪个键、现在多少、建议多少、依据是什么」。 */
export interface TuningHint {
  key: string;
  current: unknown;
  suggested?: unknown;
  why: string;
}

function topReason(summary: StatsSummary): [string, number] | null {
  const entries = Object.entries(summary.byReason).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0] : null;
}

function round(value: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

/**
 * 由统计数据给出**调参建议**。
 *
 * 刻意保守：只有样本足够（默认 ≥ 20 个可评估轮）且偏离明显时才开口，
 * 否则返回空数组 —— 宁可不说，也不要拿三四轮数据指挥用户改阈值。
 */
export function suggest(
  summary: StatsSummary,
  config: Config,
  extra: { perspectiveQueued?: number; minSample?: number } = {},
): TuningHint[] {
  const minSample = extra.minSample ?? 20;
  const hints: TuningHint[] = [];
  if (summary.evaluated < minSample) return hints;

  const top = topReason(summary);
  const share = (reason: string) => Math.round(((summary.byReason[reason] ?? 0) / summary.evaluated) * 1000) / 1000;

  // ① 捕获率过低：先说清是被哪一层拦下的，再给最小改动建议。
  if (summary.captureRate < 0.05) {
    if (top && top[0].includes('below value threshold')) {
      hints.push({
        key: 'valueThreshold',
        current: config.valueThreshold,
        suggested: round(Math.max(0.15, config.valueThreshold - 0.05)),
        why:
          '捕获率 ' + summary.captureRate + '，且大多被价值层拦下（' + share(top[0]) + '）。' +
          '当前阈值 ' + config.valueThreshold + ' 偏高，可先降 0.05 观察几天。',
      });
    } else if (top && top[0] === 'answer-too-short') {
      hints.push({
        key: 'minAnswerLength',
        current: config.minAnswerLength,
        suggested: 1,
        why:
          '捕获率 ' + summary.captureRate + '，且大多因「答案太短」被 L3 拦下（' + share(top[0]) + '）。' +
          '若你常问「是/否」型短问题，把 minAnswerLength 调到 1（交给价值层判断）。',
      });
    } else if (top && top[0] === 'exact hash match') {
      hints.push({
        key: 'semanticThreshold',
        current: config.semanticThreshold,
        why: '捕获率低主要是**完全重复**提问（' + share(top[0]) + '）—— 这是正常现象，不必调参。',
      });
    }
  }

  // ② 分数分布贴着阈值：说明阈值刚好卡在人群中间，最值得动。
  if (summary.score && summary.score.p50 > 0) {
    const gap = config.valueThreshold - summary.score.p50;
    if (Math.abs(gap) <= 0.05) {
      hints.push({
        key: 'valueThreshold',
        current: config.valueThreshold,
        suggested: round(round(config.valueThreshold + (gap >= 0 ? -0.05 : 0.05))),
        why:
          '价值分中位数 ' + summary.score.p50 + ' 紧贴阈值 ' + config.valueThreshold +
          '（p90=' + summary.score.p90 + '）——阈值正落在分布中央，±0.05 就会明显改变捕获量。',
      });
    }
  }

  // ③ 陪伴频率：只在真的没触发过 / 触发过多时提示。
  if (typeof extra.perspectiveQueued === 'number' && summary.evaluated >= minSample) {
    const perTurn = extra.perspectiveQueued / summary.evaluated;
    if (extra.perspectiveQueued === 0) {
      hints.push({
        key: 'perspectiveActiveSessionMax / perspectiveMinConfidence',
        current: {
          perspectiveActiveSessionMax: config.perspectiveActiveSessionMax,
          perspectiveMinConfidence: config.perspectiveMinConfidence,
        },
        why:
          summary.evaluated + ' 个可评估轮里陪伴一次都没触发。若你希望它开口，'
          + '先看档案置信度是否 ≥ ' + config.perspectiveMinConfidence + '（新库通常不够），'
          + '或把 perspectiveActiveSessionMax 调大（主动通道只在最早几次会话开门）。',
      });
    } else if (perTurn > 0.3) {
      hints.push({
        key: 'maxPerspectivePerTurn / perspectiveMinMisses',
        current: { maxPerspectivePerTurn: config.maxPerspectivePerTurn, perspectiveMinMisses: config.perspectiveMinMisses },
        why:
          '陪伴触发率 ' + round(perTurn) + '（每次可评估轮），偏高。'
          + '可把 perspectiveMinMisses 调大或 maxPerspectivePerTurn 调到 1。',
      });
    }
  }

  return hints;
}
