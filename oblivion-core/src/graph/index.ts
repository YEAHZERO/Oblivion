import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { CooccurrenceEdge, EdgeEvent, QAPair } from '../types.js';
import { expandHome } from '../util/paths.js';
import { now } from '../util/time.js';
import { effectiveWeight, reinforce } from './decay.js';
import { pruneGraph } from './prune.js';

export interface GraphService {
  recordCooccurrence(qa: QAPair): Promise<number>;
  neighbors(id: string, limit?: number): Promise<Array<CooccurrenceEdge & { effective: number }>>;
  edges(): CooccurrenceEdge[];
  events(): EdgeEvent[];
  neighborsOf(id: string, limit: number): Array<{ id: string; effective: number }>;
}

/** 实体抽取：latin 标识符 + CJK 2..8 字串。刻意便宜、确定、可预期。 */
export function extractEntities(text: string, cap = 24): string[] {
  const out = new Set<string>();
  const re = /[A-Za-z][\w.-]{2,}|[\u4e00-\u9fff]{2,8}/g;
  for (const m of text.matchAll(re)) {
    const t = m[0].toLowerCase();
    if (t.length < 2 || t.length > 32) continue;
    out.add(t);
    if (out.size >= cap) break;
  }
  return [...out];
}

function edgeKey(a: string, b: string): string {
  return a < b ? a + '\u0000' + b : b + '\u0000' + a;
}

/**
 * 局部共现图：同一次问答里出现的实体两两建边，重复出现即强化。
 * 状态表 + 事件表分开落盘，事件表限长（它是溯源证据，不是事件存储）。
 */
export function registerGraph(ctx: AppContext, config: Config): GraphService {
  const root = expandHome(config.dataRoot);
  const statePath = join(root, 'graph.json');
  const eventPath = join(root, 'graph-events.json');

  let edges = new Map<string, CooccurrenceEdge>();
  let log: EdgeEvent[] = [];

  const loaded = (async () => {
    try {
      const raw = JSON.parse(await readFile(statePath, 'utf8')) as CooccurrenceEdge[];
      edges = new Map(raw.map((e) => [edgeKey(e.source_id, e.target_id), e]));
    } catch {
      edges = new Map();
    }
    try {
      log = JSON.parse(await readFile(eventPath, 'utf8')) as EdgeEvent[];
    } catch {
      log = [];
    }
  })();

  /**
   * 装载即瘦身：老库可能早就超限（本机实测 23,253 条边 / 3.64 MB），
   * 不能等到「下一次正好有新共现」才裁。失败只记日志 —— 图是辅助面，绝不能因此挡住装载。
   */
  void loaded
    .then(async () => {
      const trimmed = trim(now());
      if (trimmed.droppedEdges > 0 || trimmed.droppedNodes > 0) await persist();
    })
    .catch((error: unknown) => {
      ctx.logger?.warn?.(config.logPrefix + ' 装载时裁剪共现图失败（不影响使用）：%o', error);
    });

  /**
   * 把图裁到上限内。**内存与磁盘必须一起裁**：只裁磁盘的话，刚裁掉的边会在下一次
   * `recordCooccurrence()` 的循环里被重新建回来（等于白裁）。
   *
   * 裁剪是唯一会删数据的图操作，所以每次都往事件表推一条 `prune` 账（丢了几条边/几个节点）。
   */
  function trim(at: number): { droppedEdges: number; droppedNodes: number; nodes: number } {
    const outcome = pruneGraph(
      edges.values(),
      { maxEdges: config.graphMaxEdges, maxNodes: config.graphMaxNodes },
      { base: config.graphDecayBase, periodDays: config.graphDecayPeriodDays },
      at,
    );
    if (outcome.droppedEdges === 0 && outcome.droppedNodes === 0) {
      return { droppedEdges: 0, droppedNodes: 0, nodes: outcome.nodes };
    }
    edges = new Map(outcome.kept.map((e) => [edgeKey(e.source_id, e.target_id), e]));
    log.push({
      edge_id: '',
      event_type: 'prune',
      weight_delta: 0,
      created_at: at,
      dropped_edges: outcome.droppedEdges,
      dropped_nodes: outcome.droppedNodes,
    });
    ctx.logger?.info?.(
      config.logPrefix + ' 共现图超上限：按有效权重裁掉 %d 条边 / %d 个节点（现存 %d 条边 / %d 个节点，上限 %d / %d）',
      outcome.droppedEdges,
      outcome.droppedNodes,
      edges.size,
      outcome.nodes,
      config.graphMaxEdges,
      config.graphMaxNodes,
    );
    return { droppedEdges: outcome.droppedEdges, droppedNodes: outcome.droppedNodes, nodes: outcome.nodes };
  }

  async function persist(): Promise<void> {
    trim(now());
    await mkdir(root, { recursive: true });
    await writeFile(statePath, JSON.stringify([...edges.values()], null, 2) + '\n', 'utf8');
    await writeFile(eventPath, JSON.stringify(log.slice(-2000), null, 2) + '\n', 'utf8');
  }

  function neighborsOf(id: string, limit: number): Array<{ id: string; effective: number }> {
    const at = now();
    const cfg = { base: config.graphDecayBase, periodDays: config.graphDecayPeriodDays };
    return [...edges.values()]
      .filter((e) => e.source_id === id || e.target_id === id)
      .map((e) => ({
        id: e.source_id === id ? e.target_id : e.source_id,
        effective: effectiveWeight(e, cfg, at),
      }))
      .sort((a, b) => b.effective - a.effective)
      .slice(0, limit);
  }

  ctx.effect(() => () => {
    edges.clear();
    log = [];
  }, 'oblivion-core: graph teardown');

  return {
    async recordCooccurrence(qa: QAPair): Promise<number> {
      await loaded;
      const entities = extractEntities(qa.question + '\n' + qa.answer);
      if (entities.length < 2) return 0;
      const at = now();
      let changed = 0;

      for (let i = 0; i < entities.length; i += 1) {
        for (let j = i + 1; j < entities.length; j += 1) {
          const a = entities[i];
          const b = entities[j];
          const key = edgeKey(a, b);
          const existing = edges.get(key);
          if (existing) {
            const next = reinforce(existing, {
              delta: config.graphReinforceDelta,
              cap: config.graphWeightCap,
            }, at);
            edges.set(key, next);
            log.push({
              edge_id: key,
              event_type: 'reinforce',
              weight_delta: next.weight - existing.weight,
              created_at: at,
            });
          } else {
            edges.set(key, {
              source_id: a < b ? a : b,
              target_id: a < b ? b : a,
              weight: config.graphInitialWeight,
              last_reinforced_at: at,
              reinforce_count: 0,
            });
            log.push({
              edge_id: key,
              event_type: 'create',
              weight_delta: config.graphInitialWeight,
              created_at: at,
            });
          }
          changed += 1;
        }
      }

      if (changed > 0) await persist();
      return changed;
    },

    async neighbors(id: string, limit = 20) {
      await loaded;
      const at = now();
      const cfg = { base: config.graphDecayBase, periodDays: config.graphDecayPeriodDays };
      return [...edges.values()]
        .filter((e) => e.source_id === id || e.target_id === id)
        .map((e) => ({ ...e, effective: effectiveWeight(e, cfg, at) }))
        .sort((a, b) => b.effective - a.effective)
        .slice(0, limit);
    },

    edges: () => [...edges.values()],
    events: () => [...log],
    neighborsOf,
  };
}