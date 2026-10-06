import type { QAPair } from '../types.js';
import { tokenize } from './search.js';

export interface EvaluateContext {
  /** 可选注入点：等 @deepseek-ai/dsh-llm 的公开调用面确认后再接。 */
  llmScore?: (qa: QAPair) => Promise<number | undefined>;
}

/**
 * 确定性的价值评估基线（0..1）。
 *
 * 信号刻意选得无聊：长、有来源、含数字与结构的回答更可能是可复用知识，
 * 而不是一句闲聊。R-203「累积触发、防过拟合」依赖它保持便宜且稳定。
 */
export function heuristicScore(qa: QAPair): number {
  const answer = qa.answer;
  const lengthScore = Math.min(1, answer.length / 800);
  const richnessScore = Math.min(1, new Set(tokenize(answer)).size / 160);
  const sourceScore = Math.min(1, qa.sources.length / 2);
  const hasCode = /```|\b(function|class|const|let|SELECT|FROM|npm|pnpm|dshx|docker)\b/i.test(answer) ? 1 : 0;
  const hasNumber = /\d/.test(answer) ? 1 : 0;
  const hasStructure = /(^|\n)\s*(#{2,4}\s|[-*]\s|\d+[.)]\s|\|)/.test(answer) ? 1 : 0;
  const hasTopic = qa.topicHint ? 1 : 0;

  return (
    lengthScore * 0.25 +
    richnessScore * 0.2 +
    sourceScore * 0.2 +
    hasCode * 0.1 +
    hasNumber * 0.1 +
    hasStructure * 0.05 +
    hasTopic * 0.1
  );
}

/**
 * LLM 只能**精修**基线，不能整体替换：这样在 LLM 不可用时会退化成确定性结果，
 * 而不是变成随机值。
 */
export async function evaluate(qa: QAPair, ctx: EvaluateContext = {}): Promise<number> {
  const base = heuristicScore(qa);
  if (!ctx.llmScore) return base;
  const llm = await ctx.llmScore(qa).catch(() => undefined);
  if (typeof llm !== 'number' || Number.isNaN(llm)) return base;
  return Math.min(1, Math.max(0, Math.min(1, Math.max(0, llm)) * 0.7 + base * 0.3));
}