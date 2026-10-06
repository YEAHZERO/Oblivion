import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { GraphService } from '../graph/index.js';
import type { KnowledgeService } from '../knowledge/index.js';
import type { ProfileService } from '../profile/index.js';
import { expandHome } from '../util/paths.js';
import type { DecisionRecord } from '../stats/trace.js';
import { extractQAPair, type TurnEventLike } from './extract.js';
import { ensureMdDirs, writeMD, type MdAction } from './md-writer.js';

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
  /** 判定留痕（可选）：每一轮都记一条 —— 包括「本轮没有问答」与「被拦下」。 */
  stats?: { record(entry: DecisionRecord): Promise<void> };
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

  /**
   * 装载即建目录（所有者要求）：`mdRoot` 一经配置，`01_问答沉淀\` 等分类目录立即就位。
   * 非阻塞：失败只记日志（知识库可能在不可写的盘/需要权限），不影响插件装载与问答链路。
   */
  void ensureMdDirs(mdRoot, config.mdClassify)
    .then((dirs) => {
      ctx.logger?.info?.(config.logPrefix + ' 知识库目录就位：%s（%d 个分类）', mdRoot, dirs.length);
    })
    .catch((error: unknown) => {
      ctx.logger?.warn?.(config.logPrefix + ' 知识库目录创建失败（不影响捕获）：%o', error);
    });

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

  /**
   * **临时事件探针**（`enableEventProbe`，链路验证通过后关掉）。
   *
   * 一行一个事件，写 `<dataRoot>/events-probe.jsonl`；超出 `eventProbeMax` 行时重写尾部。
   * 记录的是：类型、seq、`subject.id` 的类型与截断值、data 的键名（**不含消息正文**）。
   * 目的只有一个：判断 `turn/end` 到底有没有到我们这里。
   */
  const probePath = join(expandHome(config.dataRoot), 'events-probe.jsonl');
  async function probe(
    subject: SessionLike | undefined,
    event: TurnEventLike | undefined,
    sessionId: string,
    origin: string,
  ): Promise<void> {
    if (!config.enableEventProbe) return;
    try {
      const data = event?.data as Record<string, unknown> | undefined;
      const line = JSON.stringify({
        at: Date.now(),
        origin,
        type: event?.type ?? null,
        seq: typeof event?.seq === 'number' ? event.seq : null,
        sessionIdOk: sessionId !== '',
        subjectKeys: subject && typeof subject === 'object' ? Object.keys(subject).slice(0, 8) : null,
        dataKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : null,
      });
      await mkdir(dirname(probePath), { recursive: true });
      await appendFile(probePath, line + '\n', 'utf8');
      // 超量就把尾部留下（简单粗暴，但探针本来就是临时的）
      const raw = await readFile(probePath, 'utf8');
      const lines = raw.split('\n').filter((l) => l.trim() !== '');
      if (lines.length > config.eventProbeMax) {
        await writeFile(probePath, lines.slice(-config.eventProbeMax).join('\n') + '\n', 'utf8');
      }
    } catch {
      // 探针绝不影响主链路
    }
  }

  /**
   * 记一条判定留痕。**每一轮都记**，包括：
   *   - `no-qa`：本轮没有「真人提问 + 回答」（纯工具轮、纯注入轮、定时唤醒）；
   *   - 被拦下的：`ignored` / `duplicate` / `conflict` —— 设计书 AC-008 要求「不注入但留痕」。
   * 失败只静默（留痕不该影响问答链路）。
   */
  async function trace(entry: {
    sessionId: string;
    turn: number;
    action: DecisionRecord['action'];
    pass: boolean;
    reason: string;
    score?: number;
    questionChars?: number;
    answerChars?: number;
    sources?: number;
    startedAt: number;
  }): Promise<void> {
    if (!deps.stats) return;
    await deps.stats.record({
      at: Date.now(),
      session: entry.sessionId.slice(0, 12),
      turn: entry.turn,
      action: entry.action,
      pass: entry.pass,
      reason: entry.reason,
      score: entry.score,
      questionChars: entry.questionChars ?? 0,
      answerChars: entry.answerChars ?? 0,
      sources: entry.sources ?? 0,
      ms: Math.max(0, Date.now() - entry.startedAt),
    });
  }

  async function handle(sessionId: string, turn: number, events: readonly TurnEventLike[]): Promise<void> {
    const startedAt = Date.now();
    const qa = extractQAPair({ sessionId, turn, events: [...events] });
    if (!qa) {
      await trace({
        sessionId,
        turn,
        action: 'no-qa',
        pass: false,
        reason: '本轮没有「真人提问 + 回答」（工具轮/注入轮/无回答）',
        startedAt,
      });
      return;
    }

    try {
      const result = await deps.knowledge.capture(qa);

      await trace({
        sessionId,
        turn,
        action: result.action,
        pass: Boolean(result.pass && result.item),
        reason: result.reason ?? (result.pass ? 'captured' : 'rejected'),
        score: result.score,
        questionChars: qa.question.length,
        answerChars: qa.answer.length,
        sources: qa.sources.length,
        startedAt,
      });

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
      await trace({
        sessionId,
        turn,
        action: 'ignored',
        pass: false,
        reason: 'exception: ' + String(error),
        questionChars: qa.question.length,
        answerChars: qa.answer.length,
        sources: qa.sources.length,
        startedAt,
      });
    }
  }

  /**
   * 事件处理体。**同时挂在根上下文与每个 agent 上下文上**（见下面的订阅段）。
   *
   * @param origin - 哪条订阅收到的（探针用；`root` 或 `agent:<id>`）。
   */
  function onSessionEvent(subject: SessionLike, event: TurnEventLike, origin: string): void {
    const sessionId = subject && typeof subject.id === 'string' ? subject.id : '';
    // 临时事件探针：**在守卫之前**记，才能区分「事件没到」与「到了但被我们丢掉」。
    void probe(subject, event, sessionId, origin);
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
  }

  /**
   * ## 为什么要在 agent 上下文里再订阅一次（2026-10-06 实测）
   *
   * `session/event` 是**作用域过滤派发**（`packages/core/session/src/index.ts:70`）：
   *   > Scope-filtered dispatch（`@deepseek-ai/dsh-scope`）：agent-scoped listeners receive only
   *   > events from sessions entered through that agent's context.
   *
   * 结果：挂在**根上下文**上的订阅收不到任何会话事件 —— 症状是「插件装载正常、路由 200，
   * 但 `decisions.jsonl` 永远是空的」。官方同类插件的写法是**先听 `agent/created`，
   * 再在 `agent.ctx` 里订阅**（`context/file-reference-local/src/index.ts:92`），
   * 因为 `Agent` 暴露 `ctx`（`core/agent/src/runtime-types.ts:174`）且它就在该 agent 的作用域里。
   *
   * 两条订阅都保留：根订阅是兜底（万一作用域规则变了），agent 订阅是**真正生效的那条**；
   * 探针里的 `origin` 字段会把「到底是谁收到了」写下来，便于以后一眼看清。
   */
  const agentDisposers = new Map<unknown, () => void>();

  /** 给一个 agent 的作用域挂订阅（已挂过就跳过）。 */
  function attachAgent(agent: { ctx?: AppContext } | undefined): void {
    const agentCtx = agent?.ctx;
    if (!agent || !agentCtx || typeof agentCtx.on !== 'function') return;
    if (agentDisposers.has(agent)) return;
    try {
      const dispose = agentCtx.on('session/event', (...inner: never[]) => {
        onSessionEvent(inner[0] as SessionLike, inner[1] as TurnEventLike, 'agent');
      });
      agentDisposers.set(agent, typeof dispose === 'function' ? (dispose as () => void) : () => undefined);
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' agent 作用域订阅失败：%o', error);
    }
  }

  // ① 以后新建的 agent：听 `agent/created`（官方 `file-reference-local` 的写法）。
  ctx.on('agent/created', (...args: never[]) => {
    attachAgent((args[0] as { agent?: { ctx?: AppContext } } | undefined)?.agent);
  });

  // ② **已经**在跑的 agent：装载时补挂一次。
  //    这一条是实测补上的 —— profile 补丁热重挂时，当前会话的 agent 早已创建，
  //    只听 `agent/created` 会漏掉它，症状是「改完代码重挂后依然一个事件都收不到」。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['agents'], (scope: unknown) => {
      const registry = (scope as { agents?: { list?: () => Array<{ ctx?: AppContext }> } }).agents;
      const live = registry?.list?.() ?? [];
      for (const agent of live) attachAgent(agent);
      ctx.logger?.info?.(config.logPrefix + ' 已给 %d 个在跑的 agent 挂上会话事件订阅', live.length);
    });
  }

  ctx.on('session/event', (...args: never[]) => {
    onSessionEvent(args[0] as SessionLike, args[1] as TurnEventLike, 'root');
  });

  // 卸载即清所有内存状态：不留常驻集合，也不需要 timer。
  ctx.effect(() => () => {
    processed.clear();
    buffers.clear();
    for (const dispose of agentDisposers.values()) {
      try {
        dispose();
      } catch {
        // 上下文可能已随 agent 一起销毁
      }
    }
    agentDisposers.clear();
  }, 'oblivion-core: qa-loop teardown');
}
