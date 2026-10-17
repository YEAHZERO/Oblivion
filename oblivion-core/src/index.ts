/**
 * @oblivion/core — Oblivion 认知插件组内核。
 *
 * 设计要点（与设计书一致）：
 *   - 一个包，六个模块：knowledge / qa-loop / perspective / feedback / graph / profile
 *   - JSON 文件存储（无 SQLite、无向量切分）
 *   - `turn/end` 单触发，全程不 await 主链路
 *   - 防回灌：插件自己产生的条目不再被捕获
 *   - 无 cron / Worker / setInterval：时间逻辑（图衰减）在读取时惰性计算
 *
 * 与设计书的三处**必要偏离**（都经过真实 API 核对，见 README「已知边界」）：
 *   ① systemPrompt.section 的真实字段是 { name, order, text }，不是 { order, content }，
 *      且必须包在 ctx.effect() 里；
 *   ② turn 标识在 event.data.turn，事件里没有 turnId；
 *   ③ 语义去重/价值评估先做确定性实现，LLM 判定留成显式注入点（能力缺口）。
 */

import type { AppContext } from './core-types.js';
import { DEFAULT_CONFIG, resolveConfig, type Config } from './config.js';
import { registerFeedback } from './feedback/index.js';
import { registerGraph } from './graph/index.js';
import { registerDigest } from './digest/index.js';
import { registerKnowledge } from './knowledge/index.js';
import { llmRuntimeOf, type LlmRuntimeLike } from './llm/client.js';
import { buildChannelDiag, createMcpEndpoint, publishMcp, writeChannelDiag } from './mcp/index.js';
import type { ChannelReport } from './mcp/index.js';
import { createOrganizeService } from './organize/index.js';
import { DIGEST_EXCERPT_CHARS, DIGEST_ITEMS_MAX, type DigestSourceItem } from './organize/digest-scope.js';
import { createRetitleService } from './knowledge/retitle.js';
import { createWikiService } from './knowledge/wiki.js';
import { configSources, createSettingsService, mergeSettingsConfig, readSettingsSync } from './settings-file.js';
import { installSettingsRoute } from './settings-route.js';
import { registerPerspective } from './perspective/index.js';
import { OBLIVION_SYSTEM_PROMPT, resolveSectionOrder } from './prompt.js';
import { attachAgentFromPayload, readRelatedHint, setAgentInstaller } from './prompt-inject.js';
import { registerProfile } from './profile/index.js';
import { registerQaLoop } from './qa-loop/index.js';
import { registerStats } from './stats/index.js';
import { registerTools } from './tools.js';

/** Cordis 插件名。与 dshx.yml 的 id、package.json 的 name 对齐。 */
export const name = '@oblivion/core';

/**
 * 声明真正用到的服务。
 *
 * ⚠️ **`agents` 必须在里面**（2026-10-06 实测的根因）：DSH 的事件派发是**作用域过滤**的，
 * 没声明 `agents` 的监听者在根上下文上 `ctx.on('agent/created')` / `ctx.on('session/event')`
 * **一个事件都收不到**（`lifecycleSeen` 为空、`rootSeen: 0` 就是这么来的）。
 * 官方样例 `context/file-reference-local` 的 `static inject = ['agents']` 正是这个原因。
 */
export const inject = ['tools', 'systemPrompt', 'agents'];

/**
 * 对外提供的服务名。
 *
 * 认知层的六个模块原本只在 `apply` 的闭包里传递（`knowledge` 直接传给
 * `registerQaLoop` / `registerTools`）。这对插件自身够了，但**外部消费者**
 * （HTTP 桥接、侧栏面板、未来的其他宿主）拿不到它们——DSH 的 ctx 上
 * 没有 `oblivion` 这个名字，`ctx.get('oblivion')` 会是 undefined。
 *
 * 所以这里把已有引用**再暴露一份**成名为 `oblivion` 的服务：
 *   - 不新增代理、不包装、不改任何既有调用路径（零性能影响）
 *   - 桥接层 `inject: ['oblivion']` 后 `ctx.get('oblivion')` 拿到同一批对象
 *   - 与 `inject` 对称：本包 inject 别人的服务，也 provide 自己的
 */
export const provides = ['oblivion'];

export const VERSION = __OBLIVION_CORE_VERSION__;

/**
 * systemPrompt 段落标识。
 *
 * 排序位**不能**直接问宿主（见 `resolveSectionOrder`：宿主只认识自己的段落名，
 * 未知名回 `undefined`，而 `section()` 对非有限数直接抛错 —— 2026-10-17 的装载全灭根因）。
 */
export const OBLIVION_SECTION = 'OBLIVION_COGNITION';

/** 构建时注入的全局（见 src/globals.d.ts）。 */
declare const __OBLIVION_CORE_VERSION__: string;

/**
 * `apply` 的**外壳**：只做两件事 —— 记下「进来了」，以及「为什么没走完」。
 *
 * 为什么需要它：本机（DSH desktop 的 utility process 插件宿主）里读不到任何 `console` 输出，
 * 而 `apply()` 半路抛错时，症状只是「core 的工具/段落/通道都没了」，看不见抛在哪、抛了什么。
 * 2026-10-17 就是靠这条记录才发现：桥接一直 `present:false`，根因是 `apply()` 在发布
 * MCP 通道**之前**就抛了（而不是通道本身写不进去）。
 *
 * `error` **照旧向上抛**：宿主必须知道这次装载失败了，不能吞成「装着好好的」。
 */
export function apply(rawCtx: unknown, rawConfig?: Partial<Config>): void {
  /**
   * **三层配置**（DEC-030）：`DEFAULT_CONFIG` < **插件 config** < **`<dataRoot>/settings.json`**。
   *
   * 第三层是设置页写的（点一下即生效、且压过 profile），
   * 理由与「为什么住址不能由住址自己决定」见 `settings-file.ts` 的模块注释。
   */
  const pluginConfig = (rawConfig ?? {}) as Record<string, unknown>;
  const bootDataRoot =
    typeof pluginConfig.dataRoot === 'string' && pluginConfig.dataRoot !== ''
      ? pluginConfig.dataRoot
      : DEFAULT_CONFIG.dataRoot;
  const settings = readSettingsSync(bootDataRoot);
  const config: Config = resolveConfig(
    mergeSettingsConfig(pluginConfig, settings) as Partial<Config>,
  );
  void writeChannelDiag(config.dataRoot, buildChannelDiag(VERSION, null, 'apply:enter'));
  try {
    applyInner(rawCtx, config, pluginConfig, settings);
  } catch (error: unknown) {
    void writeChannelDiag(config.dataRoot, buildChannelDiag(VERSION, null, 'apply:failed', error));
    throw error;
  }
}

function applyInner(
  rawCtx: unknown,
  config: Config,
  pluginConfig: Record<string, unknown>,
  settings: Record<string, unknown>,
): void {
  // Cordis 传入的 ctx 是框架自己的 Context；这里按实际用到的成员收敛成结构化类型，
  // 因此不需要把 @deepseek-ai/cordis 放进依赖。
  const ctx = rawCtx as AppContext;
  /** 最近一次发布报告：`apply:done` 那条记录带上它，一次读文件就能看全。 */
  let channelReport: ChannelReport | null = null;

  /**
   * **面朝宿主的那一面一律走根上下文**（`0.1.19` 的关键修正）。
   *
   * DSH 的事件派发是**按作用域过滤**的（`@deepseek-ai/dsh-scope` 的 `scopeTarget`）：
   * 监听者所在 ctx 若带作用域标签（`kScope`），只有它的标签在**派发键的祖先链**上才收得到；
   * 而**未带标签的监听者是全局放行的**（`const tag = scopeOf(ctx); if (tag === undefined) return true`）。
   *
   * 实测后果：本插件挂在 profile 补丁的插入行下，位置**不在任何 agent 的链上**，
   * 于是 `agent/created`、`session/event`、`turn/start` 一个都收不到（`lifecycleSeen: {}`、
   * `rootSeen: 0`），注册的段落与工具也进不了 agent 的分层视图。
   *
   * 根上下文既无作用域标签、又是所有 agent 链的共同祖先 —— 事件收得到，分层视图也继承得到，
   * 两个问题一次解决。`fallback` 分支保证在没有 `root` 的宿主里行为不变。
   */
  const rootCtx = (ctx as { root?: AppContext }).root;
  /**
   * **只有在根上下文确实长得像 Context 时才用它**。
   *
   * 教训来源：`0.1.12` 那次「裸读未声明服务」把整个 App 打崩（`cannot get property "agents" without inject`）。
   * `ctx.root` 在 Cordis 里可能指向内部 Root 对象而不是 Context —— 直接拿它取 `systemPrompt` 就是同类风险。
   * 所以这里逐项验证：`on` / `systemPrompt.section` / `tools.register` 三者齐备才切换，否则保持原 ctx。
   */
  const usableHost = (value: unknown): value is AppContext => {
    if (value === null || typeof value !== 'object') return false;
    const candidate = value as AppContext;
    return typeof candidate.on === 'function'
      && typeof (candidate.systemPrompt as { section?: unknown } | undefined)?.section === 'function'
      && typeof (candidate.tools as { register?: unknown } | undefined)?.register === 'function';
  };
  const host: AppContext = usableHost(rootCtx) ? rootCtx : ctx;

  /**
   * **裸读**一个服务：读得到就返回，读不到（或 Cordis 守卫抛错）回 `null`。
   *
   * 注意这只对**已声明**的服务成立 —— 见下面 `lazyService` 的说明。
   */
  const directService = (target: unknown, key: string): unknown => {
    try {
      return (target as Record<string, unknown>)[key] ?? null;
    } catch {
      return null;
    }
  };

  /**
   * **懒取一个可选服务**（`llm` / `agentDefaultModel`）。
   *
   * 为什么不能像原来那样「装载时裸读一份」——三条证据（2026-10-17）：
   *   ① `mount-diag.json`：直接读 `ctx.webServer` **抛**「cannot get property … without inject」，
   *      而 `inject` 本身是 function ⇒ **未在 `inject` 里声明过的服务，裸读就是抛**；
   *   ② 上游 `vendor/cordis/src/reflect.ts` 的 get 代理逐级向上找 `fiber.store[prop]`，
   *      isolate key 对不上就直接抛；声明过的才走 accessor 那条路；
   *   ③ 宿主自己的插件**无一例外**把 `llm` 写进 `inject`（`llm-pi-ai`：`inject = ['llm']`）。
   *
   * ⇒ 真宿主上必须经 `ctx.inject([key])` 拿一个**声明过它的 scope**；而那个回调
   * **可能在装载之后才兑现**，所以这里返回的是「每次现取」的取值函数，而不是一份快照。
   * 原来的写法（裸读 + `?? null`）在真宿主里会静默拿到 `null`：整条自动整理路死掉，
   * 而单测（桩 ctx 直接把服务挂在 ctx 上）全绿 —— 这正是「桩比宿主宽松」的典型坑。
   */
  const lazyService = (key: string): (() => unknown) => {
    let cached: unknown = null;
    let registered = false;
    return () => {
      if (cached !== null) return cached;
      cached = directService(host, key) ?? directService(ctx, key);
      if (cached !== null) return cached;
      if (!registered) {
        registered = true;
        try {
          ctx.inject?.([key], (scope) => {
            cached = directService(scope, key);
          });
        } catch (error: unknown) {
          ctx.logger?.debug?.(config.logPrefix + ' inject(' + key + ') 失败（降级）：%o', error);
        }
      }
      return cached;
    };
  };
  const llmService = lazyService('llm');
  const defaultModelService = lazyService('agentDefaultModel');

  const knowledge = registerKnowledge(ctx, config);
  const profile = registerProfile(ctx, config);
  const graph = registerGraph(ctx, config);
  const stats = config.enableStats ? registerStats(ctx, config, { version: VERSION }) : null;

  const feedback = config.enableFeedback ? registerFeedback(ctx, config, profile) : null;
  const perspective = config.enablePerspective
    ? registerPerspective(ctx, config, { profile })
    : null;
  const digest = registerDigest(ctx, config, { knowledge, graph });
  // 笔记改名 / 打标签（`oblivion_retitle`）：模型起名，插件落盘 + 同步条目 + 重建索引。
  const retitle = createRetitleService({
    mdRoot: config.mdRoot,
    dataRoot: config.dataRoot,
    classify: config.mdClassify,
    host: knowledge,
  });
  // 主题页（`oblivion_wiki`）：模型判「哪些笔记是同一个主题」并写概述，插件落盘 + 回链 + 重建索引。
  const wiki = createWikiService({
    mdRoot: config.mdRoot,
    dataRoot: config.dataRoot,
    classify: config.mdClassify,
    host: knowledge,
  });
  /**
   * 作用域一的输入：**本会话已沉淀的问答**。
   *
   * 「这一场会话沉淀了什么」在条目里是**自证**的，不需要另建会话索引表：捕获时
   * `ref = <sessionId>#turn-<n>`（`qa-loop/extract.ts`），所以按 `sources[].ref` 前缀筛即可。
   * 整理件自己的来源是 `#digest-`，天然不会被当成输入（不会自我循环）。
   *
   * `sessionId` 传空串 = 挑「最近沉淀过的那一场」：工具路径（模型调 `oblivion_organize`）
   * 拿不到会话 id，但「把最近这场整理一页」仍然是它想要的那件事。
   */
  const sessionItemsOf = async (
    sessionId: string,
  ): Promise<{ sessionId: string; items: DigestSourceItem[] }> => {
    const all = knowledge.index.all();
    const prefix = (sid: string): string => sid + '#turn-';
    const hasTurnRef = (item: { sources: ReadonlyArray<{ type: string; ref: string }> }, sid: string): boolean =>
      item.sources.some((source) => source.type === 'session' && source.ref.startsWith(prefix(sid)));

    let wanted = sessionId;
    if (wanted === '') {
      const withTurns = all.filter((item) =>
        item.sources.some((source) => source.type === 'session' && source.ref.includes('#turn-')),
      );
      if (withTurns.length === 0) return { sessionId: '', items: [] };
      // 「最近」按条目的 updated_at（`appended` 也会刷新它），不看 created_at ——
      // 一场老会话刚追加了新内容时，它才是「最近沉淀过的那一场」。
      const newest = withTurns.reduce((best, item) => (item.updated_at > best.updated_at ? item : best));
      const ref = newest.sources.find((source) => source.type === 'session' && source.ref.includes('#turn-'))?.ref ?? '';
      wanted = ref.slice(0, ref.indexOf('#turn-'));
      if (wanted === '') return { sessionId: '', items: [] };
    }

    const items = all
      .filter((item) => hasTurnRef(item, wanted))
      .sort((a, b) => a.created_at - b.created_at)
      .slice(-DIGEST_ITEMS_MAX)
      .map((item) => ({
        id: item.id,
        title: item.title,
        topic: item.topic,
        // 捕获条目的 `content` 就是答案正文（`knowledge/index.ts` 的 created 分支），
        // 所以这里不必读盘 —— 索引里的内容已经够拼 prompt。
        text: item.content.replace(/\s+/g, ' ').trim().slice(0, DIGEST_EXCERPT_CHARS),
      }));
    return { sessionId: wanted, items };
  };

  /**
   * 自动整理（DEC-030）：**默认全关**，开了才经 `ctx.llm` 调模型。
   *
   * `llm` / `agentDefaultModel` 都**不**写进 `inject`（那里列的是**必需**服务，缺了插件就不装载），
   * 而是经 `lazyService()` **懒取 + 优雅降级**（缺了只让自动整理不可用）。
   * 模型选路优先级：`organize.provider/model` > 宿主默认选路（`currentSelection`）> 无（`preview` 会回「没选出模型」）。
   *
   * 两个作用域各自独立跑与报（见 `organize/index.ts` 的 `onTurn`）：
   * `digest` 管「本会话的沉淀 → 一页会话整理」，`retitle` 管「存量笔记 → 内容名 + 标签」。
   */
  const organize = createOrganizeService({
    config,
    retitle,
    digest,
    sessionItems: sessionItemsOf,
    runtime: () => llmRuntimeOf({ llm: llmService() }),
    defaultRoute: () =>
      (defaultModelService() as { currentSelection?: () => unknown } | null)?.currentSelection?.(),
    logger: ctx.logger,
  });

  /**
   * **设置页的服务面**（读生效值 + 来源、写 `settings.json`）。
   *
   * 由 core 自己拥有（面板是只读数据面、且跨插件服务表取不到，见 `settings-route.ts` 的说明），
   * 并通过 `GET|POST /oblivion-core/settings` 暴露给面板 —— 那条路由在下面装。
   *
   * 变量名刻意不叫 `settings`：本函数的入参 `settings` 是**读到的那层原始值**（第三层配置），
   * 两者是两码事，重名会在这里埋一个「到底改的是哪个 settings」的坑。
   */
  const settingsService = createSettingsService({
    pluginConfig,
    dataRoot: config.dataRoot,
    effective: config as unknown as Record<string, unknown>,
  });

  registerQaLoop(ctx, config, {
    knowledge,
    graph,
    profile,
    stats: stats ?? undefined,
    onCaptured: (info) => {
      // 覆盖记账与陪伴生成都在 fire-and-forget 链路里，不阻塞捕获本身。
      void perspective?.onTurn(info);
    },
    // 自动整理的节拍：到点才跑；**全程 fire-and-forget**，模型再慢也不拖住问答链路。
    onTurnEnd: (info) => {
      void organize.onTurn(info).catch((error: unknown) => {
        ctx.logger?.warn?.(config.logPrefix + ' 自动整理失败：%o', error);
      });
    },
  });

  // 认知规则常驻；陪伴内容只在队列里有时才追加，且下一轮才生效。
  ctx.effect(
    () =>
      host.systemPrompt.section({
        name: OBLIVION_SECTION,
        order: resolveSectionOrder(OBLIVION_SECTION, host.systemPrompt),
        text: (context: { agent?: unknown }) => {
          // **先记录形状再判断**：上一版把记录写在 `context.agent === undefined` 的守卫之后，
          // 于是"section 到底有没有被调用、context 里有什么"完全看不出来（diag 里 lifecycleSeen 一直是空的）。
          // 诊断的第一原则：先留痕，再分支。
          attachAgentFromPayload(context);
          if (context?.agent === undefined) return '';
          // 陪伴内容（有队列时才追加）+ 上一轮捕获检索到的相关既有知识（③ 检索注入）
          const extra = perspective?.takePending() ?? '';
          const related = readRelatedHint();
          return [OBLIVION_SYSTEM_PROMPT, extra, related].filter((part) => part !== '').join('\n\n');
        },
      }),
    'oblivion-core: system prompt section',
  );

  /**
   * **工具执行入口（第二张网）**：工具调用必然发生在某个 agent 会话内，`exec` 里带 caller agent。
   *
   * 为什么必须挂它：实测 `systemPrompt.section` 的回调在**已存在的会话**里没有被调用
   * （`lifecycleSeen` 为空）—— 提示词段看起来是**会话建立时**构建的。所以链路不能只依赖那一个入口：
   * 新会话走 section，老会话走工具调用，两条路各自补挂、各自留痕。
   *
   * 实现用**原型代理**包住 `tools.register`，把 `exec` 交给补挂逻辑 —— 7 个工具一行都不用改。
   */
  const toolsCtx = Object.create(ctx) as typeof ctx;
  const wrappedRegister = ((definition: { execute?: unknown }) =>
    host.tools.register({
      ...(definition as object),
      execute: (args: unknown, exec: unknown) => {
        attachAgentFromPayload(exec ?? args);
        return (definition.execute as (a: unknown, e: unknown) => unknown)(args, exec);
      },
    })) as typeof ctx.tools.register;
  Object.defineProperty(toolsCtx, 'tools', { value: { register: wrappedRegister } });

  /**
   * **按 agent 注册段落与工具**（官方 `file-reference-local` 的写法）：
   * `agent.ctx.inject(['systemPrompt', 'tools'], scope => { scope.systemPrompt.section(...); scope.tools.register(...) })`。
   *
   * 为什么不能只在根上下文注册：根上的注册**到不了 agent 的作用域**（实测：新会话里既没有
   * `oblivion_*` 工具、提示词里也没有 Oblivion 段落）。DSH 的 tools / systemPrompt 都是
   * **分层（scoped layers）**的：每一层按作用域合并，agent 只合并自己那条链上的层。
   *
   * 与根注册并存是刻意的：分层是**覆盖**语义（不是重复报错），根层当兜底。
   */
  const agentFibers = new Map<unknown, unknown>();
  /**
   * **本 fiber 卸下时，把每个 agent 的注册 fiber 也拆掉**（2026-10-17 真机现场）。
   *
   * 这些注册绑在 `agentCtx.inject(...)` 造出来的 fiber 上，**不属于本插件 fiber 的作用域**。
   * 不拆的话，重新装载时 `installForAgent` 会在**同一个 agent 作用域**里再注册一遍
   * `oblivion_*` ⇒ 撞「already registered」。而那条路径被下面的 `try/catch` 吞成一条 warn，
   * 所以症状是**静默退化**：agent 里既没有 Oblivion 段落、也没有 `oblivion_*` 工具，
   * 而日志看起来「装好了」。
   */
  ctx.effect(
    () => () => {
      for (const fiber of agentFibers.values()) {
        try {
          (fiber as { dispose?: () => void } | undefined)?.dispose?.();
        } catch {
          // 卸载期一律不抛：宿主可能已经先一步把这一层清掉了。
        }
      }
      agentFibers.clear();
    },
    'oblivion-core: agent fibers',
  );

  function installForAgent(agentLike: unknown): void {
    const agentCtx = (agentLike as { ctx?: AppContext } | undefined)?.ctx;
    if (!agentCtx || typeof agentCtx.inject !== 'function' || agentFibers.has(agentCtx)) return;
    try {
      const fiber = agentCtx.inject(['systemPrompt', 'tools'], (scope: AppContext) => {
        const scopeAny = scope as unknown as {
          systemPrompt: { section: (d: Record<string, unknown>) => unknown; getSectionOrder: (name: string) => unknown };
          tools: { register: (d: unknown) => unknown };
        };
        scopeAny.systemPrompt.section({
          name: OBLIVION_SECTION,
          order: resolveSectionOrder(OBLIVION_SECTION, scopeAny.systemPrompt),
          text: (context: { agent?: unknown }) => {
            attachAgentFromPayload(context?.agent ?? context);
            const extra = perspective?.takePending() ?? '';
            const related = readRelatedHint();
            return [OBLIVION_SYSTEM_PROMPT, extra, related].filter((part) => part !== '').join('\n\n');
          },
        });
        // 工具也注册进这个 agent 的作用域；执行时同样先把 exec 交给补挂逻辑。
        const scopedCtx = Object.create(scope) as AppContext;
        const wrappedScopeRegister = ((definition: { execute?: unknown }) =>
          scopeAny.tools.register({
            ...(definition as object),
            execute: (args: unknown, exec: unknown) => {
              attachAgentFromPayload(exec ?? args);
              return (definition.execute as (a: unknown, e: unknown) => unknown)(args, exec);
            },
          })) as typeof scopedCtx.tools.register;
        Object.defineProperty(scopedCtx, 'tools', { value: { register: wrappedScopeRegister } });
        registerTools(scopedCtx, {
          knowledge,
          profile,
          feedback,
          graph,
          stats,
          digest,
          retitle,
          wiki,
          organize,
          perspectiveStats: () => perspective?.stats() ?? null,
        });
      });
      agentFibers.set(agentCtx, fiber);
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' 为 agent 注册段落/工具失败：%o', error);
    }
  }

  // ① 已经在跑的 agent（根上 `ctx.agents` 现在可读 —— `agents` 已声明）
  try {
    const registry = (host as unknown as { agents?: { list?: () => unknown[] } }).agents;
    for (const agent of registry?.list?.() ?? []) installForAgent(agent);
  } catch {
    // 服务还没就绪：交给 ② ③
  }
  // ② 以后创建的 agent —— 必须听**根**上的事件（未带作用域标签才全局放行）
  host.on('agent/created', (...args: never[]) => {
    installForAgent(args[0]);
    attachAgentFromPayload(args[0]);
  });
  // ③ 宿主回调载荷（section / 工具 exec）——由 prompt-inject 转交
  setAgentInstaller(installForAgent);

  /**
   * **工具注册必须可注销**（2026-10-17 真机现场）。
   *
   * `registerTools` 走的是根上下文 `host.tools`，而**根比本 fiber 活得久** —— 不注销的话，
   * 重新装载（改 profile 配置就会触发）时第二遍注册会撞
   * `tool "oblivion_capture" is already registered`，于是整个 `apply()` 失败、
   * MCP 通道从桥接里消失（`/oblivion/mcp/health` 变 `present:false` / `slots: 0`）。
   *
   * 宿主 `dsh-tools` 的 `register()` 文档原话是「returns the exact disposer that unregisters
   * the tool」，所以这里把 disposer 包进 `ctx.effect`，由 Cordis 在本 fiber 卸下时调用。
   */
  ctx.effect(
    () => {
      const disposers = registerTools(toolsCtx, {
        knowledge,
        profile,
        feedback,
        graph,
        stats,
        digest,
        retitle,
        wiki,
        organize,
        perspectiveStats: () => perspective?.stats() ?? null,
      });
      return () => {
        for (const dispose of disposers) {
          try {
            dispose();
          } catch {
            // 同上：卸载期不抛。
          }
        }
      };
    },
    'oblivion-core: tools',
  );

  // 首次装载索引与目录；失败只记日志，不阻塞装载（此刻缓存与磁盘都可能还不存在）。
  void knowledge.init().catch((error: unknown) => {
    ctx.logger?.warn?.(config.logPrefix + ' init failed: %o', error);
  });

  // 装载时落一份 status.json：生效配置 + 现有统计 + 调参建议（「该改哪个键」一眼可见）。
  void stats
    ?.writeBootSnapshot({
      perspective: perspective?.stats() ?? null,
      feedback: config.enableFeedback ? 'enabled' : 'disabled',
    })
    .catch(() => undefined);

  /**
   * **对外门面**（`provides = ['oblivion']` 的实际内容）。
   *
   * 只暴露外部消费者真正需要的能力，不是把内部实现全抛出去：
   *   - `knowledge` / `profile` / `graph` / `feedback` / `perspective` / `digest`
   *     是六个模块的服务对象（方法齐全，桥接层据此把 MCP 工具映射过来）
   *   - `stats.status()` 是观测面快照
   *   - `config` 让消费者知道自己面对的参数口径
   *   - `version` 便于桥接层在响应里标注来源版本
   *
   * 刻意**不提供** `registerQaLoop` 之类的注册函数：门面是「读/写知识」的能力面，
   * 不是「再装一遍插件」的装配面。
   */
  const facade = {
    version: VERSION,
    config,
    knowledge,
    profile,
    graph,
    feedback,
    perspective,
    digest,
    retitle,
    wiki,
    organize,
    /**
     * 设置页的读/写面（生效值 + 来源 + 写 `settings.json`）。
     *
     * 面板拿不到 Cordis 服务表里的它（跨插件取不到），实际走的是 core 自己挂的
     * `GET|POST /oblivion-core/settings`；门面这里留着，便于同作用域的消费者与自检直接用。
     */
    settings: settingsService,
    /**
     * 每个键最终是谁定的（`settings` / `plugin` / `default`）。
     *
     * 面板/桥接据此显示「生效值 + 来源」—— 没有这一层，
     * 「我明明在界面里改了怎么没生效」只能靠人猜三层配置的先后。
     */
    configSources: configSources(pluginConfig, settings),
    stats,
  } as const;

  /**
   * 注册到 Cordis 服务表。
   *
   * 用 `host`（根上下文优先）而非 `ctx`：与事件监听、提示词段落、工具注册保持一致——
   * 本插件挂在 profile 补丁的插入行下，位置不在任何 agent 链上；服务若只注册到带作用域的
   * ctx，别的插件同样取不到（实测 `agents` 那次的教训）。`fallback` 保证无 `root` 的宿主行为不变。
   */
  try {
    (host as { provide?: (n: string, v: unknown) => unknown }).provide?.('oblivion', facade);
  } catch (error: unknown) {
    ctx.logger?.warn?.(config.logPrefix + ' provide(oblivion) failed: %o', error);
  }

  /**
   * **MCP 端点**（C 方案：MCP 是 core 的内部模块，传输由 `@oblivion/http-bridge` 负责）。
   *
   * 走进程内通道（`globalThis` / `process` 上的 `Symbol.for('@oblivion/core/mcp')`）
   * 而不是 Cordis 服务表：服务可见性随作用域而变（bridge 因 `inject: ['oblivion']`
   * 恒取不到而**从未激活**），通道则与「谁挂在谁下面」无关，且端点带 disposer
   * ⇒ 重挂/卸载不留僵尸。
   *
   * `onReport` 是 2026-10-17 补的**证据位**：宿主把 `globalThis` 变成只读/代理时，
   * 旧实现会在这一行 `defineProperty` 抛错 —— 插件其余部分都装好了，只有通道没发布，
   * 而宿主里根本读不到那行 `console.log`。现在发布**永不抛**、结果落
   * `<dataRoot>/mcp-channel-diag.json`（与桥接 `/health` 两侧对照，一次重启就能定位）。
   */
  const mcpDispose = publishMcp(
    createMcpEndpoint({ facade, log: (message: string) => ctx.logger?.debug?.(config.logPrefix + ' ' + message) }),
    {
      onReport: (report) => {
        channelReport = report;
        void writeChannelDiag(config.dataRoot, buildChannelDiag(VERSION, report, 'apply:mcp'));
        if (report.active === null) {
          ctx.logger?.warn?.(config.logPrefix + ' mcp channel unavailable: %o', report.scopes);
        }
      },
    },
  );
  ctx.effect(() => mcpDispose, 'oblivion-core: mcp channel');

  /**
   * **设置页的 HTTP 通路**（`GET|POST /oblivion-core/settings`）。
   *
   * 为什么不走 Cordis 服务表让面板来取：跨插件取不到（实测桥接 `inject: ['oblivion']` 从未激活）。
   * 路由本身**永不抛**、缺 `webServer` 只记 warn —— 可选功能不该把装载弄崩。
   */
  installSettingsRoute(ctx, {
    settings: settingsService,
    catalog: () => organize.catalog(),
    version: VERSION,
    log: (message) => ctx.logger?.info?.(config.logPrefix + ' ' + message),
    warn: (message) => ctx.logger?.warn?.(config.logPrefix + ' ' + message),
  });


  console.log('[oblivion-core] loaded');
  void writeChannelDiag(config.dataRoot, buildChannelDiag(VERSION, channelReport, 'apply:done'));
}

export default { name, inject, provides, apply };