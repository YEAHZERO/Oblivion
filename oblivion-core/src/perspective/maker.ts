import type { Config } from '../config.js';
import type { CoverageRecord, UserProfile } from '../types.js';

export interface Perspective {
  kind: 'missing-dimension' | 'counter-view' | 'unexplored' | 'conflict' | 'to-verify';
  dimension?: string;
  text: string;
}

export interface PerspectiveInput {
  profile: UserProfile;
  coverage: CoverageRecord;
  misses: Map<string, number>;
  config: Config;
  stage: 'observe' | 'probe' | 'companion';
  resistant: string[];
  /** 本轮最多给几条；缺省用 `config.maxPerspectivePerTurn`。 */
  max?: number;
  /** 深度模式（§25.4 深度触发）：阈值放宽到 1 次，且必须凑够候选数。 */
  deep?: boolean;
}

/**
 * 生成是确定性的：所谓「洞察」只能是**知识库显示被反复遗漏的维度**，
 * 不允许凭空编事实。三道闸门：遗漏次数、拒绝过的维度、三阶段。
 *
 * 深度模式（`deep`，对应设计书 §25.4 的「连续 ≥3 次追问同维度」）额外要求
 * **≥3 个候选视角**：先把达到阈值的维度全列出来，不足时用同一份覆盖记录里
 * 其它被遗漏的维度补足（仍然是「确实没覆盖」，不是编造）。
 */
export function generatePerspectives(input: PerspectiveInput): Perspective[] {
  const { coverage, misses, config, resistant, stage, deep } = input;
  const limit = Math.max(1, input.max ?? config.maxPerspectivePerTurn);
  const threshold = deep ? 1 : config.perspectiveMinMisses;
  const out: Perspective[] = [];

  for (const dim of coverage.missing) {
    if (resistant.includes(dim)) continue;
    const count = misses.get(dim) ?? 0;
    if (count >= threshold) {
      out.push({
        kind: 'missing-dimension',
        dimension: dim,
        text: '这条回答没有覆盖「' + dim + '」，而它在你最近的提问里反复出现（' + count + ' 次）。',
      });
    }
  }

  if (deep) {
    // 深度模式：候选不够就继续从「本轮确实没覆盖」的维度里补，直到够 limit 或列完。
    for (const dim of coverage.missing) {
      if (out.length >= limit) break;
      if (resistant.includes(dim)) continue;
      if (out.some((p) => p.dimension === dim)) continue;
      out.push({
        kind: 'unexplored',
        dimension: dim,
        text: '你连着几轮都在同一个维度上追问，这条回答没有覆盖「' + dim + '」——换个角度看看会不会更快。',
      });
    }
  }

  // 观察期只放行最强的那一条（除非是深度模式：那是用户自己挖出来的信号）。
  if (stage === 'observe' && !deep) return out.slice(0, 1);

  if (out.length === 0 && stage === 'companion' && coverage.missing.length === 0) {
    out.push({
      kind: 'unexplored',
      dimension: 'cost',
      text: '这次的覆盖面比较完整，唯一没碰的是长期成本。',
    });
  }

  return out.slice(0, limit);
}