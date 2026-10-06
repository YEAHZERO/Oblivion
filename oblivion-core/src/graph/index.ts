import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { CooccurrenceEdge, EdgeEvent, QAPair } from '../types.js';
import { expandHome } from '../util/paths.js';
import { now } from '../util/time.js';
import { effectiveWeight, reinforce } from './decay.js';

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

  async function persist(): Promise<void> {
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