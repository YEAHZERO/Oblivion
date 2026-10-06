import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { GraphService } from '../graph/index.js';
import type { KnowledgeService } from '../knowledge/index.js';
import type { ProfileService } from '../profile/index.js';
import { expandHome } from '../util/paths.js';
import { describeCtx } from '../util/ctx-shape.js';
import type { DecisionRecord } from '../stats/trace.js';
import { extractQAPair, type TurnEventLike } from './extract.js';
import { appendRelatedLinks, ensureMdDirs, notePathFor, writeIndexNote, writeMD, type MdAction } from './md-writer.js';
import { findRelatedItems } from '../graph/backlink.js';

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
   * **ctx 形状 dump**（所有者要求：core 与 panel 各一份做对照）。
   *
   * 起因：`hasInject:false`，但 panel 的 Host 半边却成功用了 `ctx.inject(['webServer'])` ——
   * 同样是用户层挂载，形状必然不同。布尔值不够，这里落全量形状。
   */
  const ctxShape = describeCtx(ctx);

  /**
   * 安全读取可能被宿主守卫拦下的成员。
   *
   * 实测教训：Cordis 对「未在 `inject` 里声明的服务」的属性访问会**在读取那一刻抛错**
   * （`cannot get property "agents" without inject`）。我原先把 `ctx.agents` 的读取
   * 直接写在对象字面量里（无 try/catch）→ **整个插件装载失败、App 起不来**。
   * 诊断代码永远不能有这种杀伤力：一律走 `safeRead`。
   */
  function safeRead<T>(read: () => T): T | undefined {
    try {
      return read();
    } catch {
      return undefined;
    }
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

      if (!result.pass || !result.item) {
        // 冲突：筛选没放行，但**必须留一份不合并的对照页**（设计铁律：冲突不合并）
        if (result.action === 'conflict' && result.existing) {
          await writeMD(
            mdRoot,
            {
              action: 'conflict',
              conflict: {
                question: qa.question,
                answer: qa.answer,
                existingId: result.existing.id,
                existingTitle: result.existing.title,
                reason: result.reason,
                topic: result.existing.topic,
              },
            },
            config.mdClassify,
          );
        }
        return;
      }

      const notePath = await writeMD(
        mdRoot,
        {
          action: result.action as MdAction,
          item: result.item,
        },
        config.mdClassify,
      );
      await deps.graph.recordCooccurrence(qa);
      await deps.profile.updateFromQA(qa);

      // 双链写回 + 索引重建：都是"锦上添花"，失败只记日志，不影响捕获本身。
      try {
        const related = findRelatedItems(result.item, deps.knowledge.index.all(), { limit: 5 });
        // 正向：新笔记里指向相关条目
        if (related.length > 0 && notePath !== '') {
          await appendRelatedLinks(notePath, related.map((item) => item.title));
        }
        // 反向（①：双链反向回填既有笔记）：相关条目的笔记里也指向这条新笔记，
        // 否则链接是单向的 —— 在 Obsidian 里读旧笔记永远看不到新沉淀。
        // 安全前提：`appendRelatedLinks` 只写含 `oblivion:` 标记的笔记，
        // 用户自有笔记一个字都不动；`notePathFor` 找不到文件时返回 ''（绝不新建）。
        for (const item of related) {
          const existingItem = deps.knowledge.index.all().find((candidate) => candidate.id === item.id);
          if (!existingItem) continue;
          const path = await notePathFor(mdRoot, existingItem, config.mdClassify);
          if (path === '') continue;
          await appendRelatedLinks(path, [result.item.title]);
        }
        await writeIndexNote(mdRoot, deps.knowledge.index.all());
      } catch (error) {
        ctx.logger?.warn?.(config.logPrefix + ' 双链/索引写回失败：%o', error);
      }

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
  /**
   * **临时挂载自诊断**（`enableEventProbe` 同时控制）：写 `<dataRoot>/mount-diag.json`。
   *
   * 为什么需要它：`console` 日志在本机读不到，而「事件收不到」这件事有四种可能
   * （没有 inject / agents 服务不存在 / 列表为空 / 订阅上了但派发被过滤），
   * 光看探针文件是空的无法区分。这里把**挂载那一刻的上下文事实**落盘，一次就能定位。
   */
  const diagPath = join(expandHome(config.dataRoot), 'mount-diag.json');
  const diag = {
    version: __OBLIVION_CORE_VERSION__,
    mountedAt: Date.now(),
    hasOn: typeof ctx.on === 'function',
    hasInject: typeof ctx.inject === 'function',
    hasGet: typeof (ctx as { get?: unknown }).get === 'function',
    /** ctx 形状全量 dump（core 侧） */
    ctxShape,
    /**
     * 直接读 `ctx.agents` 的结果 —— **必须 safeRead**。
     *
     * 实测事故：这两个字段原本直接写在对象字面量里（无 try/catch），而 Cordis 对
     * 「未在 `inject` 里声明的服务」的属性访问**在读取那一刻就抛错**
     * （`cannot get property "agents" without inject`）→ **整个插件装载失败、App 起不来**。
     * 诊断代码永远不能有这种杀伤力。
     */
    agentsDirect: safeRead(() => {
      const value = (ctx as { agents?: unknown }).agents;
      return value !== null && typeof value === 'object';
    }) ?? false,
    agentsDirectCount: -1,
    /** `ctx.inject(['agents'], …)` 的回调是否触发 */
    injectFired: false,
    injectAgentCount: -1,
    /** 两条订阅各自收到的事件计数 */
    rootSeen: 0,
    agentSeen: 0,
    mountedAgents: 0,
    /** 生命周期事件到达计数 + 载荷键名（判断「事件到没到、形状对不对」） */
    lifecycleSeen: {} as Record<string, number>,
    lifecycleShapes: {} as Record<string, string>,
  };
  let diagDirty = false;
  async function flushDiag(): Promise<void> {
    try {
      await mkdir(dirname(diagPath), { recursive: true });
      await writeFile(diagPath, JSON.stringify(diag, null, 2) + '\n', 'utf8');
    } catch {
      // 诊断本身绝不影响主链路
    }
  }
  async function diagOnce(): Promise<void> {
    if (!config.enableEventProbe || !diagDirty) return;
    diagDirty = false;
    await flushDiag();
  }

  // 挂载即落一次诊断（此刻还没有任何事件）
  const initialAgents = safeRead(() => {
    const direct = (ctx as { agents?: { list?: () => unknown[] } }).agents;
    return direct && typeof direct.list === 'function' ? direct.list().length : -1;
  });
  if (typeof initialAgents === 'number' && initialAgents >= 0) diag.agentsDirectCount = initialAgents;
  diagDirty = true;
  void diagOnce();

  const agentDisposers = new Map<unknown, () => void>();

  /** 给一个 agent 的作用域挂订阅（已挂过就跳过）。 */
  function attachAgent(agent: { ctx?: AppContext } | undefined): void {
    const agentCtx = agent?.ctx;
    if (!agent || !agentCtx || typeof agentCtx.on !== 'function') return;
    if (agentDisposers.has(agent)) return;
    try {
      const dispose = agentCtx.on('session/event', (...inner: never[]) => {
        diag.agentSeen += 1;
        diagDirty = true;
        void diagOnce();
        onSessionEvent(inner[0] as SessionLike, inner[1] as TurnEventLike, 'agent');
      });
      agentDisposers.set(agent, typeof dispose === 'function' ? (dispose as () => void) : () => undefined);
      diag.mountedAgents = agentDisposers.size;
      diagDirty = true;
      void diagOnce();
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' agent 作用域订阅失败：%o', error);
    }
  }

  /**
   * 容错提取 agent —— **这是上一版收不到事件的真凶之一**。
   *
   * 原来只认 `args[0].agent`。但 `agent/created` 的载荷形状在不同版本里可能是：
   * ① `{ agent }` ② agent 本体 ③ `{ agent: { agent } }`（包装一层）④ `{ agentId }`。
   * 校验失败时**症状是静默的**：订阅永远挂不上，一个事件都收不到，而日志里什么也没有。
   * 所以这里改成「在载荷里浅层找一个带 `ctx` 的对象」，并把载荷键名记进诊断。
   */
  function pickAgent(payload: unknown): { ctx?: AppContext } | undefined {
    const seen = new Set<unknown>();
    const walk = (value: unknown, depth: number): { ctx?: AppContext } | undefined => {
      if (depth > 3 || value === null || typeof value !== 'object' || seen.has(value)) return undefined;
      seen.add(value);
      const record = value as Record<string, unknown> & { ctx?: AppContext };
      if (record.ctx !== undefined) return record;
      for (const key of ['agent', 'agents', 'target', 'value', 'payload']) {
        const found = walk(record[key], depth + 1);
        if (found) return found;
      }
      return undefined;
    };
    return walk(payload, 0);
  }

  /** 记录一次生命周期事件的形状（键名），供诊断判断「事件到底到没到」。 */
  function noteLifecycle(event: string, payload: unknown): void {
    const keys = payload !== null && typeof payload === 'object' ? Object.keys(payload as object).join(',') : typeof payload;
    diag.lifecycleSeen[event] = (diag.lifecycleSeen[event] ?? 0) + 1;
    diag.lifecycleShapes[event] = keys.slice(0, 120);
    diagDirty = true;
    void diagOnce();
  }

  // ① 以后新建的 agent：听 `agent/created`（官方 `file-reference-local` 的写法）。
  ctx.on('agent/created', (...args: never[]) => {
    noteLifecycle('agent/created', args[0]);
    attachAgent(pickAgent(args[0]));
  });

  // ①' 另两条生命周期兜底：只要有一条到，就能把「已在跑的 agent」补挂上。
  //     实测动机：agent 在 App 启动之后才创建，装载时 `agents.list()` 是空的（injectAgentCount=0），
  //     而根上下文的 `session/event` 又收不到任何东西 —— 必须有别的入口把订阅补上。
  for (const event of ['session/created', 'turn/start'] as const) {
    ctx.on(event, (...args: never[]) => {
      noteLifecycle(event, args[0]);
      reconcileAgents();
    });
  }

  /**
   * **惰性补挂**：把当前活着的 agent 都挂上订阅。
   *
   * 刻意不用定时器（设计红线）：只由「生命周期事件」或「已有订阅真的收到事件」触发。
   */
  let agentsScope: unknown;
  function reconcileAgents(): void {
    const registry = (agentsScope as { agents?: { list?: () => Array<{ ctx?: AppContext }> } } | undefined)?.agents;
    const live = registry?.list?.() ?? [];
    diag.injectAgentCount = live.length;
    for (const agent of live) attachAgent(agent);
    diagDirty = true;
    void diagOnce();
  }

  // ② **已经**在跑的 agent：装载时补挂一次（此刻通常为空，靠上面的生命周期兜底）。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['agents'], (scope: unknown) => {
      diag.injectFired = true;
      agentsScope = scope;
      reconcileAgents();
      const count = diag.injectAgentCount;
      ctx.logger?.info?.(config.logPrefix + ' 装载时已给 %d 个在跑的 agent 挂上会话事件订阅', count);
    });
  }

  ctx.on('session/event', (...args: never[]) => {
    diag.rootSeen += 1;
    diagDirty = true;
    void diagOnce();
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
