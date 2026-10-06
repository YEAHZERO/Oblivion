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
import { registerKnowledge } from './knowledge/index.js';
import { registerPerspective } from './perspective/index.js';
import { OBLIVION_SYSTEM_PROMPT } from './prompt.js';
import { registerProfile } from './profile/index.js';
import { registerQaLoop } from './qa-loop/index.js';
import { registerTools } from './tools.js';

/** Cordis 插件名。与 dshx.yml 的 id、package.json 的 name 对齐。 */
export const name = '@oblivion/core';

/** 只声明真正用到的服务；`session` 通过 session/event 事件面使用。 */
export const inject = ['tools', 'systemPrompt'];

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

  const knowledge = registerKnowledge(ctx, config);
  const profile = registerProfile(ctx, config);
  const graph = registerGraph(ctx, config);

  const feedback = config.enableFeedback ? registerFeedback(ctx, config, profile) : null;
  const perspective = config.enablePerspective
    ? registerPerspective(ctx, config, { profile })
    : null;

  registerQaLoop(ctx, config, {
    knowledge,
    graph,
    profile,
    onCaptured: (info) => {
      // 覆盖记账与陪伴生成都在 fire-and-forget 链路里，不阻塞捕获本身。
      void perspective?.onTurn(info);
    },  });

  // 认知规则常驻；陪伴内容只在队列里有时才追加，且下一轮才生效。
  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: OBLIVION_SECTION,
        order: ctx.systemPrompt.getSectionOrder(OBLIVION_SECTION),
        text: (context: { agent?: unknown }) => {
          if (context?.agent === undefined) return '';
          const extra = perspective?.takePending() ?? '';
          return extra ? OBLIVION_SYSTEM_PROMPT + '\n\n' + extra : OBLIVION_SYSTEM_PROMPT;
        },
      }),
    'oblivion-core: system prompt section',
  );

  registerTools(ctx, { knowledge, profile, feedback, graph });

  // 首次装载索引与目录；失败只记日志，不阻塞装载（此刻缓存与磁盘都可能还不存在）。
  void knowledge.init().catch((error: unknown) => {
    ctx.logger?.warn?.(config.logPrefix + ' init failed: %o', error);
  });

  console.log('[oblivion-core] loaded');
}

export default { name, inject, apply };