/**
 * Cordis 的最小结构化类型。
 *
 * 刻意不从 `@deepseek-ai/cordis` import 类型：那会让 tsc 需要框架包的
 * 类型入口（本机 profile 里没有），而本插件实际只使用 ctx 上这四个成员。
 * 用结构化类型既能让 typecheck 独立通过，也不假装拥有比实际更多的契约。
 */

export interface Disposable {
  (): void;
}

export interface LoggerLike {
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export interface SystemPromptSection {
  name: string;
  order?: number;
  text: string | ((context: { agent?: unknown }) => string);
  complete?: boolean;
}

export interface SystemPromptService {
  section(definition: SystemPromptSection): unknown;
  getSectionOrder(name: string): number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output?: { schema: unknown; render?: (args: unknown, value: unknown) => unknown };
  execute: (args: Record<string, never> | never, exec: { signal: AbortSignal }) => unknown;
}

export interface ToolsService {
  register(definition: unknown): unknown;
  defineTool?: unknown;
}

export interface AppContext {
  tools: ToolsService;
  systemPrompt: SystemPromptService;
  logger?: LoggerLike;
  effect(fn: () => unknown, label?: string): unknown;
  on(event: string, handler: (...args: never[]) => void): unknown;
  inject?(services: string[], fn: (ctx: AppContext) => void): unknown;
  /**
   * 根上下文：Cordis 的 `ctx.root`（未带 DSH 作用域标签，是所有 agent 链的共同祖先）。
   *
   * 为什么必须用它：DSH 按作用域过滤事件派发，挂在插件自身 ctx 上的监听者若带作用域标签、
   * 且标签不在派发键的祖先链上，就一个事件都收不到（实测 `lifecycleSeen: {}`）。
   * 根上下文无标签 ⇒ 全局放行；同时它的分层视图被所有 agent 继承。
   */
  root?: AppContext;
  /** 装载器（仅用于诊断：列出同一应用里的条目名）。 */
  loader?: { entries?(): Iterable<{ options?: { name?: unknown } }> };
  agents?: { list?(): unknown[] };
}