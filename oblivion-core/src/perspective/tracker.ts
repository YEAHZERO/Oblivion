import type { CoverageRecord } from '../types.js';

/** 受监视的维度集合：刻意小而固定，避免生成空洞的「洞察」。 */
export const DIMENSIONS = [
  'mechanism',
  'procedure',
  'decision',
  'risk',
  'design',
  'cost',
  'maintenance',
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

function pattern(dim: Dimension): RegExp {
  switch (dim) {
    case 'mechanism':
      return /原理|机制|因为|所以|根因|mechanism|because/i;
    case 'procedure':
      return /步骤|流程|先.*然后|最后|step|first|then/i;
    case 'decision':
      return /对比|取舍|权衡|优缺|trade-?off|\bvs\b/i;
    case 'risk':
      return /风险|隐患|会失败|坑|risk|danger|failure/i;
    case 'design':
      return /架构|分层|模块|接口|design|architect|module/i;
    case 'cost':
      return /成本|开销|费用|性能|代价|cost|overhead|latency/i;
    case 'maintenance':
      return /维护|升级|迁移|兼容|maintain|upgrade|migrat/i;
  }
}

export function analyzeCoverage(
  question: string,
  answer: string,
  topic: string,
  sessionId: string,
): CoverageRecord {
  const blob = question + '\n' + answer;
  const covered: string[] = [];
  const missing: string[] = [];
  for (const dim of DIMENSIONS) {
    if (pattern(dim).test(blob)) covered.push(dim);
    else missing.push(dim);
  }
  return { topic, session_id: sessionId, covered, missing, created_at: Date.now() };
}