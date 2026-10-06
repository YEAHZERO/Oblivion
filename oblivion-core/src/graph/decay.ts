import type { CooccurrenceEdge } from '../types.js';
import { ageDays, now as clockNow } from '../util/time.js';

export interface DecayConfig {
  base: number;
  periodDays: number;
}

export interface ReinforceConfig {
  delta: number;
  cap: number;
}

/**
 * 读取时惰性衰减：weight × base^(ageDays / periodDays)。
 *
 * 两道时钟保护（R-202）：
 *   ① age 由 ageDays 钳到 ≥ 0，时钟回退不会产生负年龄；
 *   ② 结果对 stored weight 取 min —— 即使公式因浮点或参数异常变大，
 *      也不可能凭空强化一条边。
 */
export function effectiveWeight(
  edge: CooccurrenceEdge,
  cfg: DecayConfig,
  at: number = clockNow(),
): number {
  const age = ageDays(edge.last_reinforced_at, at);
  const decayed = edge.weight * Math.pow(cfg.base, age / Math.max(1, cfg.periodDays));
  return Math.min(edge.weight, Math.max(0, decayed));
}

/** 强化：+delta，封顶 cap，刷新 last_reinforced_at，计数 +1。 */
export function reinforce(
  edge: CooccurrenceEdge,
  cfg: ReinforceConfig,
  at: number = clockNow(),
): CooccurrenceEdge {
  return {
    ...edge,
    weight: Math.min(cfg.cap, edge.weight + cfg.delta),
    last_reinforced_at: at,
    reinforce_count: edge.reinforce_count + 1,
  };
}