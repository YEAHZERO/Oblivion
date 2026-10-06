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
import { DEFAULT_CONFIG, type Config } from './config.js';
import { registerFeedback } from './feedback/index.js';
import { registerGraph } from './graph/index.js';
import { registerDigest } from './digest/index.js';
import { registerKnowledge } from './knowledge/index.js';
import { registerPerspective } from './perspective/index.js';
import { OBLIVION_SYSTEM_PROMPT } from './prompt.js';
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

export const VERSION = __OBLIVION_CORE_VERSION__;

/** systemPrompt 段落标识；order 由 getSectionOrder 映射到真实槽位。 */
export const OBLIVION_SECTION = 'OBLIVION_COGNITION';

/** 构建时注入的全局（见 src/globals.d.ts）。 */
declare const __OBLIVION_CORE_VERSION__: string;

export function apply(rawCtx: unknown, rawConfig?: Partial<Config>): void {
  // Cordis 传入的 ctx 是框架自己的 Context；这里按实际用到的成员收敛成结构化类型，
  // 因此不需要把 @deepseek-ai/cordis 放进依赖。
  const ctx = rawCtx as AppContext;
  const config: Config = { ...DEFAULT_CONFIG, ...(rawConfig ?? {}) };

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

  const knowledge = registerKnowledge(ctx, config);
  const profile = registerProfile(ctx, config);
  const graph = registerGraph(ctx, config);
  const stats = config.enableStats ? registerStats(ctx, config, { version: VERSION }) : null;

  const feedback = config.enableFeedback ? registerFeedback(ctx, config, profile) : null;
  const perspective = config.enablePerspective
    ? registerPerspective(ctx, config, { profile })
    : null;
  const digest = registerDigest(ctx, config, { knowledge, graph });

  registerQaLoop(ctx, config, {
    knowledge,
    graph,
    profile,
    stats: stats ?? undefined,
    onCaptured: (info) => {
      // 覆盖记账与陪伴生成都在 fire-and-forget 链路里，不阻塞捕获本身。
      void perspective?.onTurn(info);
    },
  });

  // 认知规则常驻；陪伴内容只在队列里有时才追加，且下一轮才生效。
  ctx.effect(
    () =>
      host.systemPrompt.section({
        name: OBLIVION_SECTION,
        order: host.systemPrompt.getSectionOrder(OBLIVION_SECTION),
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
          order: scopeAny.systemPrompt.getSectionOrder(OBLIVION_SECTION),
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

  registerTools(toolsCtx, { knowledge, profile, feedback, graph, stats, digest, perspectiveStats: () => perspective?.stats() ?? null });

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

  console.log('[oblivion-core] loaded');
}

export default { name, inject, apply };