import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { dirname, join } from 'node:path';
import { now } from '../util/time.js';

/**
 * 一轮问答的**判定留痕**。
 *
 * 设计书里对应 AC-008「命中低价值规则的不注入且**留痕**」与 REQ-011「健康度告警」。
 * 没有它，「阈值该不该调」只能靠感觉；有了它，几天的真实数据就能回答：
 * 捕获率多少、被谁拦下、分数分布落在哪里。
 */
export interface DecisionRecord {
  /** 判定发生的时刻（epoch ms）。 */
  at: number;
  /** 会话 id（截断保存，够区分即可）。 */
  session: string;
  turn: number;
  /** 处置动作；`no-qa` = 本轮没有「真人提问 + 回答」，压根没进筛选。 */
  action: 'created' | 'appended' | 'duplicate' | 'conflict' | 'ignored' | 'no-qa';
  /** 通过与否（no-qa 为 false）。 */
  pass: boolean;
  /** 打回/通过的原因，逐条可读。 */
  reason: string;
  /** L4 价值分（走到那一步才有）。 */
  score?: number;
  questionChars: number;
  answerChars: number;
  sources: number;
  /** 本条判定的耗时（ms）。 */
  ms: number;
}

export interface TraceStore {
  /** 追加一条判定（fire-and-forget；失败静默，不影响问答链路）。 */
  record(entry: DecisionRecord): Promise<void>;
  /** 读取留痕（惰性裁剪：超期/超量的旧记录会被丢掉并落盘）。 */
  read(limit?: number): Promise<DecisionRecord[]>;
  path: string;
}

/**
 * 留痕存储：`<dataRoot>/decisions.jsonl`（一行一条 JSON）。
 *
 * 为什么用 jsonl 而不是一个 JSON 数组：追加是 O(1)，中途被杀也不会毁掉整个文件。
 * 裁剪与反馈保留期同一招 —— **读取时惰性裁剪**，不跑定时任务。
 */
export function createTraceStore(
  dataRoot: string,
  options: { retentionDays: number; maxEntries: number; logger?: { warn?: (...a: unknown[]) => void }; logPrefix?: string },
): TraceStore {
  const path = join(dataRoot, 'decisions.jsonl');
  const MS_PER_DAY = 86_400_000;

  async function readRaw(): Promise<DecisionRecord[]> {
    try {
      const raw = await readFile(path, 'utf8');
      const out: DecisionRecord[] = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        try {
          out.push(JSON.parse(trimmed) as DecisionRecord);
        } catch {
          // 单行损坏不该让整段留痕不可读（比如写到一半被杀）。
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  return {
    path,

    async record(entry) {
      try {
        await mkdir(dirname(path), { recursive: true });
        await appendFile(path, JSON.stringify(entry) + '\n', 'utf8');
      } catch (error) {
        options.logger?.warn?.(String(options.logPrefix ?? '') + ' 判定留痕写入失败：%o', error);
      }
    },

    async read(limit) {
      const all = await readRaw();
      const cutoff = now() - options.retentionDays * MS_PER_DAY;
      const fresh = all.filter((entry) => typeof entry.at === 'number' && entry.at >= cutoff);
      const kept = fresh.length > options.maxEntries ? fresh.slice(fresh.length - options.maxEntries) : fresh;

      // 只有真的裁掉了东西才重写文件（避免每次读都落盘）。
      if (kept.length !== all.length) {
        try {
          await writeFile(path, kept.map((entry) => JSON.stringify(entry)).join('\n') + (kept.length ? '\n' : ''), 'utf8');
        } catch (error) {
          options.logger?.warn?.(String(options.logPrefix ?? '') + ' 判定留痕裁剪落盘失败：%o', error);
        }
      }
      return typeof limit === 'number' && limit > 0 ? kept.slice(kept.length - limit) : kept;
    },
  };
}
