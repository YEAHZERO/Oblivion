/**
 * 共现图裁剪（core 0.2.10）。
 *
 * 起因（所有者 2026-10-07，审计结论）：`graph.json` 长到 **3.64 MB / 23,253 条边 / 1,437 个节点**，
 * 而它**没有任何上限、没有裁剪** —— 单次捕获最多抽 24 个实体 ⇒ 一次就是 `C(24,2)=276` 条边，
 * 绝大多数是「只共现过一次」的弱边（权重 0.3、`reinforce_count` 0）。每轮捕获都要整份读盘 +
 * `JSON.parse`（`knowledge/store.ts` 的 `loadAll()` 也顺带白读一遍），代价随历史线性增长，
 * 而收益由少数强边决定。
 *
 * 裁法是**按有效权重留强边**，不是先进先出：`effectiveWeight()` 已含时间衰减，
 * 「最近反复共现」的边自然排前；同权重再按 `last_reinforced_at`、`reinforce_count` 排。
 * 节点上限用**节点强度**（该节点所有保留边的有效权重之和）判：先丢最弱的节点，连带它的边。
 *
 * 不变量：**裁掉的东西要留痕**。调用方按 `droppedEdges/droppedNodes` 推一条 `prune` 事件，
 * `graph-events.json` 是溯源证据 —— 静默丢数据是知识库最不可逆的一种损坏。
 */
import type { CooccurrenceEdge } from '../types.js';
import { effectiveWeight } from './decay.js';

export interface PruneLimits {
  /** 最多保留多少条边；`<= 0` 表示不限制。 */
  maxEdges: number;
  /** 最多保留多少个节点；`<= 0` 表示不限制。 */
  maxNodes: number;
}

export interface PruneOutcome {
  /** 保留的边（按强度降序）。 */
  kept: CooccurrenceEdge[];
  droppedEdges: number;
  droppedNodes: number;
  /** 裁剪后还剩多少个节点。 */
  nodes: number;
}

/**
 * 纯函数：给定一批边与上限，算出去留。**不改入参**，调用方决定何时落盘。
 *
 * 上限都 `<= 0` 时原样返回（保留输入顺序），`dropped*` 全 0 —— 「不限制」是合法配置。
 */
export function pruneGraph(
  edges: Iterable<CooccurrenceEdge>,
  limits: PruneLimits,
  decay: { base: number; periodDays: number },
  at: number,
): PruneOutcome {
  const all = [...edges];
  const scored = all.map((edge) => ({ edge, weight: effectiveWeight(edge, decay, at) }));
  const total = all.length;

  const ranked = scored
    .slice()
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.edge.last_reinforced_at - a.edge.last_reinforced_at ||
        b.edge.reinforce_count - a.edge.reinforce_count,
    );
  let kept = limits.maxEdges > 0 ? ranked.slice(0, limits.maxEdges) : ranked;

  let droppedNodes = 0;
  if (limits.maxNodes > 0) {
    const strength = new Map<string, number>();
    for (const s of kept) {
      strength.set(s.edge.source_id, (strength.get(s.edge.source_id) ?? 0) + s.weight);
      strength.set(s.edge.target_id, (strength.get(s.edge.target_id) ?? 0) + s.weight);
    }
    if (strength.size > limits.maxNodes) {
      const allowed = new Set(
        [...strength.entries()]
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
          .slice(0, limits.maxNodes)
          .map(([id]) => id),
      );
      droppedNodes = strength.size - allowed.size;
      kept = kept.filter((s) => allowed.has(s.edge.source_id) && allowed.has(s.edge.target_id));
    }
  }

  const nodes = new Set<string>();
  for (const s of kept) {
    nodes.add(s.edge.source_id);
    nodes.add(s.edge.target_id);
  }
  return {
    kept: kept.map((s) => s.edge),
    droppedEdges: total - kept.length,
    droppedNodes,
    nodes: nodes.size,
  };
}
