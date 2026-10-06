import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { dirname, join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { FeedbackEntry } from '../types.js';
import { expandHome } from '../util/paths.js';
import { newId, now } from '../util/time.js';
import type { ProfileService } from '../profile/index.js';
import { tune } from './tuner.js';

export interface FeedbackService {
  record(args: { target: string; signal: -1 | 0 | 1; context?: string }): Promise<{
    recorded: FeedbackEntry;
    tuned: boolean;
  }>;
  all(): Promise<FeedbackEntry[]>;
  reset(): Promise<void>;
  /** 自证用：总量与因保留期被裁掉的数量。 */
  stats(): Promise<{ total: number; pruned: number; retentionDays: number }>;
}

/** 一天的毫秒数。 */
const MS_PER_DAY = 86_400_000;

export function registerFeedback(ctx: AppContext, config: Config, profile: ProfileService): FeedbackService {
  const path = join(expandHome(config.dataRoot), 'feedback.json');
  let prunedTotal = 0;

  async function load(): Promise<FeedbackEntry[]> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as FeedbackEntry[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function save(entries: FeedbackEntry[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  }

  /**
   * 读取并**惰性裁剪**（设计书 §25.7「保留期 90 天 + 定时清理」）。
   *
   * 「无定时任务」是本插件的硬约束（DEC：不跑 cron / Worker / setInterval），
   * 所以清理放在**读取时**：与图权重的惰性衰减同一招 —— 效果一样，但不需要常驻定时器，
   * 也不会在卸载后留下副作用。裁剪命中时顺手落盘，所以磁盘上不会无限增长。
   */
  async function loadPruned(): Promise<FeedbackEntry[]> {
    const entries = await load();
    const cutoff = now() - config.feedbackRetentionDays * MS_PER_DAY;
    const kept = entries.filter((e) => typeof e.created_at === 'number' && e.created_at >= cutoff);
    const dropped = entries.length - kept.length;
    if (dropped > 0) {
      prunedTotal += dropped;
      await save(kept);
      ctx.logger?.info?.(
        config.logPrefix + ' feedback 保留期裁剪：%d 条超过 %d 天',
        dropped,
        config.feedbackRetentionDays,
      );
    }
    return kept;
  }

  ctx.effect(() => () => {
    // 反馈是纯文件状态；不需要清理句柄。
  }, 'oblivion-core: feedback teardown');

  return {
    async record(args) {
      const entries = await loadPruned();
      const recorded: FeedbackEntry = {
        id: newId(),
        target: args.target,
        signal: args.signal,
        context: args.context ?? '',
        created_at: now(),
      };
      entries.push(recorded);
      await save(entries);

      // 中性信号只记录，永不触发微调。
      const tuned = args.signal !== 0
        ? await tune(entries, args.target, profile, config.feedbackTuneThreshold)
        : false;
      return { recorded, tuned };
    },
    all: loadPruned,
    reset: () => save([]),
    stats: async () => ({
      total: (await loadPruned()).length,
      pruned: prunedTotal,
      retentionDays: config.feedbackRetentionDays,
    }),
  };
}