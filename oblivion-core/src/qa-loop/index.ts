import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { GraphService } from '../graph/index.js';
import type { KnowledgeService } from '../knowledge/index.js';
import type { ProfileService } from '../profile/index.js';
import { expandHome } from '../util/paths.js';
import { extractQAPair, type TurnEventLike } from './extract.js';
import { writeMD, type MdAction } from './md-writer.js';

interface SessionLike {
  id: string;
  /**
   * 已废弃的同步快照（`dsh-session` 里只在 `snapshotEvents()` 被调用时才物化，
   * 而那个方法是 deprecated）。**只在自累积为空时兜底用**，正常路径不依赖它。
   */
  eventsSnapshot?: ReadonlyArray<TurnEventLike>;
}

interface TurnBuffer {
  turn: number;
  events: TurnEventLike[];
}

/** 单轮最多缓存多少条消息事件（防长轮把内存拖大）。 */
const MAX_EVENTS_PER_TURN = 400;
/** 同时跟踪多少个会话（超出按插入顺序淘汰最旧的）。 */
const MAX_TRACKED_SESSIONS = 32;
/** 幂等键上限（同一 Host 长跑时不让 Set 无限增长）。 */
const MAX_PROCESSED_KEYS = 2000;

export interface QaLoopDeps {
  knowledge: KnowledgeService;
  graph: GraphService;
  profile: ProfileService;
  /** 捕获成功后通知上层（perspective 用它做维度覆盖记账）。 */
  onCaptured?(info: {
    question: string;
    answer: string;
    topic: string;
    sessionId: string;
    sources: number;
  }): void;
}

/**
 * 单触发捕获钩子（`turn/end`）。
 *
 * ## 为什么自己累积事件，而不是读 `session.eventsSnapshot`
 *
 * 实测（`@deepseek-ai/dsh-session` 的产物）：
 *   - `eventsSnapshot` 是 **private** 字段，且只在 `snapshotEvents()` 里 `??=` 物化；
 *   - `snapshotEvents()` / `eventAt()` 都标着 **deprecated**（"new calls are prohibited"）。
 * 于是「直接读 `subject.eventsSnapshot`」在真实 Host 里恒为 `undefined`
 * → 每轮提取不到问答 → 知识库永远为空（这正是本插件首版落盘为空的原因）。
 *
 * 现在的做法：订阅公开的 `session/event` 流，**按会话累积本轮事件**，
 * 在 `turn/end` 时用自己缓存的那些事件提取问答。不碰私有字段、不调用废弃 API，
 * 也不需要在 turn 结束时同步回读会话日志。
 *
 * 事件形状（实测 `dsh-session/lib/types/types.d.ts`）：
 *   `session/event(session, event)`；`event = { type, seq, time, data }`；
 *   `turn/start` / `turn/end` 的 `data.turn` 是轮次号（**没有** `event.turnId`）。
 *
 * 全程 fire-and-forget：任何异常只进 logger，绝不冒泡到会话流程。
 */
export function registerQaLoop(ctx: AppContext, config: Config, deps: QaLoopDeps): void {
  const processed = new Set<string>();
  const buffers = new Map<string, TurnBuffer>();
  const mdRoot = expandHome(config.mdRoot);
  let warnedNoEvents = false;

  function remember(key: string): void {
    processed.add(key);
    if (processed.size > MAX_PROCESSED_KEYS) {
      // Set 保持插入顺序：删掉最早的一批即可。
      const drop = processed.size - MAX_PROCESSED_KEYS;
      let i = 0;
      for (const k of processed) {
        processed.delete(k);
        if (++i >= drop) break;
      }
    }
  }

  function bufferOf(sessionId: string): TurnBuffer {
    const existing = buffers.get(sessionId);
    if (existing) return existing;
    const created: TurnBuffer = { turn: -1, events: [] };
    buffers.set(sessionId, created);
    if (buffers.size > MAX_TRACKED_SESSIONS) {
      const oldest = buffers.keys().next().value;
      if (typeof oldest === 'string' && oldest !== sessionId) buffers.delete(oldest);
    }
    return created;
  }

  function turnNumberOf(event: TurnEventLike, fallback: number): number {
    const data = event.data as { turn?: unknown } | undefined;
    return typeof data?.turn === 'number' ? data.turn : fallback;
  }

  async function handle(sessionId: string, turn: number, events: readonly TurnEventLike[]): Promise<void> {
    const qa = extractQAPair({ sessionId, turn, events: [...events] });
    if (!qa) return;

    try {
      const result = await deps.knowledge.capture(qa);
      if (!result.pass || !result.item) return;

      await writeMD(
        mdRoot,
        {
          action: result.action as MdAction,
          item: result.item,
        },
        config.mdClassify,
      );
      await deps.graph.recordCooccurrence(qa);
      await deps.profile.updateFromQA(qa);

      deps.onCaptured?.({
        question: qa.question,
        answer: qa.answer,
        topic: result.item.topic,
        sessionId: qa.sessionId,
        sources: qa.sources.length,
      });
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' qa-loop failed: %o', error);
    }
  }

  ctx.on('session/event', (subject: SessionLike, event: TurnEventLike) => {
    const sessionId = subject && typeof subject.id === 'string' ? subject.id : '';
    if (!sessionId || !event || typeof event.type !== 'string') return;

    if (event.type === 'turn/start') {
      // 新的一轮：清掉上一轮的残余，重新开始累积。
      const buffer = bufferOf(sessionId);
      buffer.turn = turnNumberOf(event, -1);
      buffer.events.length = 0;
      return;
    }

    if (event.type === 'turn/end') {
      const buffer = buffers.get(sessionId);
      buffers.delete(sessionId);
      const turn = turnNumberOf(event, buffer?.turn ?? event.seq);
      const key = sessionId + '#' + String(turn);
      if (processed.has(key)) return;
      remember(key);

      let events: readonly TurnEventLike[] = buffer?.events ?? [];
      if (events.length === 0) {
        // 兜底：自累积拿不到（例如插件在本轮中途才装载）时才摸一次已废弃的同步快照。
        events = subject.eventsSnapshot ?? [];
        if (events.length === 0 && !warnedNoEvents) {
          warnedNoEvents = true;
          ctx.logger?.warn?.(
            config.logPrefix + ' turn/end 时没有任何可读事件（自累积为空且 eventsSnapshot 不可用）',
          );
        }
      }
      void handle(sessionId, turn, events);
      return;
    }

    if (event.type === 'user/message' || event.type === 'assistant/message') {
      const buffer = bufferOf(sessionId);
      if (buffer.events.length < MAX_EVENTS_PER_TURN) buffer.events.push(event);
    }
  });

  // 卸载即清所有内存状态：不留常驻集合，也不需要 timer。
  ctx.effect(() => () => {
    processed.clear();
    buffers.clear();
  }, 'oblivion-core: qa-loop teardown');
}
