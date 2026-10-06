import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { CoverageRecord } from '../types.js';
import { adaptStyle } from './adapter.js';
import { generatePerspectives, type Perspective } from './maker.js';
import { analyzeCoverage } from './tracker.js';
import type { ProfileService } from '../profile/index.js';

export interface PerspectiveService {
  /** 队列里待注入的文本（下一轮 systemPrompt 生效）。 */
  pending(): string;
  /** 取走并清空队列。 */
  takePending(): string;
  onTurn(info: {
    question: string;
    answer: string;
    topic: string;
    sessionId: string;
    /** 本轮问答带了几条来源（§25.4 主动触发闸门要求「必须有引用」）。 */
    sources?: number;
  }): Promise<void>;
  /** 用户拒绝某维度 → 之后不再提示它。 */
  recordResistance(dimension: string): void;
  coverage(): CoverageRecord[];
  /** 自证用：各类闸门的命中计数。 */
  stats(): {
    turns: number;
    queued: number;
    activeGateHits: number;
    deepGateHits: number;
    companionGateHits: number;
    blockedByConfidence: number;
  };
}

/**
 * 认知陪伴。**只观察、只排队**，不产生任何会话输出：
 * 生成的内容走 systemPrompt 的下一轮注入，因此不会打断当前回答。
 *
 * 三条触发通道（对应设计书 §25.4 双模式 + 既有陪伴期行为）：
 *
 * | 通道 | 条件 | 产出上限 |
 * | --- | --- | --- |
 * | **主动触发（F2）** | 会话 ≤ `perspectiveActiveSessionMax`（3）**且** 问题 ≥ `perspectiveMinQuestionLength`（10 字）**且** 本轮有来源 | `maxPerspectivePerTurn` |
 * | **深度触发（F3）** | **连续** ≥ `perspectiveDeepTriggerRepeats`（3）次追问**同一维度**；闸门：单会话总次数 ≤ `perspectiveDeepSessionMax`（5） | **≥ `perspectiveDeepMinCandidates`（3）** |
 * | 陪伴期（既有） | 会话 > 10 且某维度遗漏 ≥ `perspectiveMinMisses`（3）次 | `maxPerspectivePerTurn` |
 *
 * 三通道共用两道安全闸门：**档案置信度 ≥ `perspectiveMinConfidence`**（<0.3 一律不发）、
 * 被拒绝 ≥2 次的维度永不再提。观察期（<4 会话）非深度模式下只放行 1 条。
 *
 * 设计书要求「异步、不阻塞」：这里全部是同步计算 + 内存记账，
 * 唯一的 await 是读档案，且它在 qa-loop 的 fire-and-forget 链路里。
 */
export function registerPerspective(
  ctx: AppContext,
  config: Config,
  deps: { profile: ProfileService },
): PerspectiveService {
  let queued = '';
  const misses = new Map<string, number>();
  const resistance = new Map<string, number>();
  const records: CoverageRecord[] = [];
  let consecutiveDeepDives = 0;
  /** F3：上一轮「主要遗漏维度」与连续同维度次数。 */
  let lastPrimaryDimension: string | undefined;
  let sameDimensionStreak = 0;
  /** §25.4 深度触发闸门：本会话已激荡次数（达到上限后不再触发深度通道）。 */
  let sessionQueued = 0;
  const counters = {
    turns: 0,
    queued: 0,
    activeGateHits: 0,
    deepGateHits: 0,
    companionGateHits: 0,
    blockedByConfidence: 0,
  };

  function stageOf(n: number): 'observe' | 'probe' | 'companion' {
    if (n < config.perspectiveMinSessions) return 'observe';
    if (n <= 10) return 'probe';
    return 'companion';
  }

  function dominantMissing(coverage: CoverageRecord, resistant: string[]): string | undefined {
    return coverage.missing.find((d) => !resistant.includes(d));
  }

  ctx.effect(() => () => {
    queued = '';
    misses.clear();
    resistance.clear();
    records.length = 0;
    consecutiveDeepDives = 0;
    lastPrimaryDimension = undefined;
    sameDimensionStreak = 0;
    sessionQueued = 0;
  }, 'oblivion-core: perspective teardown');

  return {
    pending: () => queued,
    takePending: () => {
      const t = queued;
      queued = '';
      return t;
    },

    async onTurn(info) {
      if (!config.enablePerspective) return;
      counters.turns += 1;

      const profile = await deps.profile.read();

      // 安全闸门①：档案置信度不足时一律不发（设计书：< 0.3 不用）。
      if (profile.inquiry_style.confidence < config.perspectiveMinConfidence) {
        counters.blockedByConfidence += 1;
        return;
      }

      const coverage = analyzeCoverage(info.question, info.answer, info.topic, info.sessionId);
      records.push(coverage);
      if (records.length > 200) records.shift();

      for (const dim of coverage.missing) {
        misses.set(dim, (misses.get(dim) ?? 0) + 1);
      }

      const resistant = [...resistance.entries()].filter(([, n]) => n >= 2).map(([d]) => d);

      // ---- F3：连续同维度追问计数（§25.4 深度触发）----
      const primary = dominantMissing(coverage, resistant);
      if (primary !== undefined && primary === lastPrimaryDimension) {
        sameDimensionStreak += 1;
      } else {
        lastPrimaryDimension = primary;
        sameDimensionStreak = primary === undefined ? 0 : 1;
      }
      // 既有的「本轮提问本身很长/带列表 → 视为深挖」信号保留，与维度连击取较大者。
      const deepSignals = (info.question.match(/\n[-*\d]/g) ?? []).length + (info.question.length > 400 ? 1 : 0);
      consecutiveDeepDives = deepSignals >= 2 ? consecutiveDeepDives + 1 : 0;

      const deepGate =
        (sameDimensionStreak >= config.perspectiveDeepTriggerRepeats
          || consecutiveDeepDives >= config.perspectiveDeepDiveTurns)
        && sessionQueued < config.perspectiveDeepSessionMax;

      const activeGate =
        profile.sessions_observed <= config.perspectiveActiveSessionMax
        && info.question.trim().length >= config.perspectiveMinQuestionLength
        && (info.sources ?? 1) >= 1;

      const stage = stageOf(profile.sessions_observed);
      const companionGate =
        stage === 'companion'
        && [...misses.values()].some((n) => n >= config.perspectiveMinMisses);

      if (!deepGate && !activeGate && !companionGate) return;

      if (deepGate) counters.deepGateHits += 1;
      else if (activeGate) counters.activeGateHits += 1;
      else counters.companionGateHits += 1;

      const wantCandidates = deepGate
        ? Math.max(config.perspectiveDeepMinCandidates, config.maxPerspectivePerTurn)
        : config.maxPerspectivePerTurn;

      const perspectives: Perspective[] = generatePerspectives({
        profile,
        coverage,
        misses,
        config,
        stage,
        resistant,
        max: wantCandidates,
        deep: deepGate,
      });

      if (perspectives.length === 0 && consecutiveDeepDives >= config.perspectiveDeepDiveTurns) {
        perspectives.push({
          kind: 'to-verify',
          dimension: 'assumption',
          text: '连续深挖若干轮了，是否该回头验证一个前置假设？',
        });
      }

      const text = adaptStyle(perspectives, profile);
      if (text) {
        queued = text;
        sessionQueued += 1;
        counters.queued += 1;
      }
    },

    recordResistance: (dimension: string) => {
      resistance.set(dimension, (resistance.get(dimension) ?? 0) + 1);
    },

    coverage: () => [...records],

    stats: () => ({ ...counters }),
  };
}