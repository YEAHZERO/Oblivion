import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import { expandHome } from '../util/paths.js';
import { now } from '../util/time.js';
import { suggest, summarize, type StatsSummary, type TuningHint } from './summary.js';
import { createTraceStore, type DecisionRecord, type TraceStore } from './trace.js';

export type { DecisionRecord } from './trace.js';
export type { StatsSummary, TuningHint } from './summary.js';
export { summarize, suggest } from './summary.js';

export interface StatusSnapshot {
  version: string;
  generatedAt: number;
  dataRoot: string;
  mdRoot: string;
  /** 生效中的配置（这就是「需要修改的参数」的完整清单）。 */
  config: Record<string, unknown>;
  /** 该改哪个键：由数据算出的建议。 */
  hints: TuningHint[];
  stats: StatsSummary;
  /** 最近若干条判定（便于直接看「谁被拦下了、为什么」）。 */
  recent: DecisionRecord[];
  perspective: Record<string, unknown>;
  tracePath: string;
}

export interface StatsService {
  record(entry: DecisionRecord): Promise<void>;
  read(limit?: number): Promise<DecisionRecord[]>;
  summary(): Promise<StatsSummary>;
  status(options?: { recentLimit?: number; perspective?: Record<string, unknown> }): Promise<StatusSnapshot>;
  /** 装载时把生效配置与落盘位置写成一个可读文件。 */
  writeBootSnapshot(extra: Record<string, unknown>): Promise<void>;
  tracePath: string;
}

/**
 * 观测面：判定留痕 + 聚合 + 调参建议。
 *
 * 为什么这是内核最该先补的东西：阈值合不合适、陪伴频率吵不吵，
 * **只有跑够几天的真实数据才知道**。没有留痕，那些参数只能靠猜；
 * 有了留痕，`oblivion_status` 会直接告诉你「该改哪个键、现在多少、建议多少、依据是什么」。
 *
 * 三条约束与插件其余部分一致：无定时任务（读取时惰性裁剪）、不阻塞主链路
 * （`record()` 是 fire-and-forget）、所有副作用走 `ctx.effect()`。
 */
export function registerStats(
  ctx: AppContext,
  config: Config,
  meta: { version: string },
): StatsService {
  const dataRoot = expandHome(config.dataRoot);
  const trace: TraceStore = createTraceStore(dataRoot, {
    retentionDays: config.statsRetentionDays,
    maxEntries: config.statsMaxEntries,
    logger: ctx.logger,
    logPrefix: config.logPrefix,
  });

  ctx.effect(() => () => {
    // 留痕是纯文件状态：没有句柄、没有定时器需要清理。
  }, 'oblivion-core: stats teardown');

  async function summary(): Promise<StatsSummary> {
    const records = await trace.read();
    return summarize(records, config, config.statsRetentionDays);
  }

  return {
    tracePath: trace.path,
    record: (entry) => trace.record(entry),
    read: (limit) => trace.read(limit),
    summary,

    async status(options = {}) {
      const records = await trace.read();
      const stats = summarize(records, config, config.statsRetentionDays);
      const perspective = options.perspective ?? {};
      return {
        version: meta.version,
        generatedAt: now(),
        dataRoot,
        mdRoot: expandHome(config.mdRoot),
        config: config as unknown as Record<string, unknown>,
        hints: suggest(stats, config, {
          perspectiveQueued: typeof perspective.queued === 'number' ? perspective.queued : undefined,
        }),
        stats,
        recent: records.slice(-(options.recentLimit ?? 20)),
        perspective,
        tracePath: trace.path,
      };
    },

    async writeBootSnapshot(extra) {
      try {
        const path = join(dataRoot, 'status.json');
        await mkdir(dirname(path), { recursive: true });
        const stats = await summary();
        const payload = {
          version: meta.version,
          generatedAt: now(),
          dataRoot,
          mdRoot: expandHome(config.mdRoot),
          config: config as unknown as Record<string, unknown>,
          stats,
          hints: suggest(stats, config),
          tracePath: trace.path,
          ...extra,
        };
        await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
        return;
      } catch (error) {
        ctx.logger?.warn?.(config.logPrefix + ' status.json 写入失败：%o', error);
      }
    },
  };
}
