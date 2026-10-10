/**
 * @oblivion/http-bridge · 类型定义。
 *
 * 刻意不 import `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-*` 的类型：
 * 与 @oblivion/core 的 core-types.ts 同策略 —— 用结构化类型描述实际用到的成员，
 * 让 typecheck 独立通过，也不假装拥有比实际更多的契约。
 *
 * ## 0.1.1 删除的类型（以及为什么）
 *
 * MCP 的协议分发与工具面搬进 `@oblivion/core` 之后，传输层**不再认识门面**：
 *
 *   - `OblivionFacade` / `KnowledgeLike` —— 桥接不再 `ctx.get('oblivion')`，
 *     也不调 `knowledge.query/capture`（那是 core 的 `src/mcp/tools.ts` 干的事）；
 *   - `McpTool` —— 工具目录同样归 core。
 *
 * 端点形状（`McpEndpointLike`）与通道描述（`ChannelDescription`）在
 * `src/channel.ts` 里，紧挨着它们所依赖的通道契约常量。
 * `AppContext` 里的 `get` / `provide` / `inject` 也已删除：本包 `inject: []`，
 * 一次都不取服务 —— 这正是「永远能激活」的保证。
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LoggerLike {
  warn?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

/**
 * Cordis 上下文（本包实际用到的成员）。
 *
 * 只有 `logger` 与 `effect` —— 没有 `get`/`provide`/`inject`/`root`。
 * 少即是准：本包不依赖任何服务，取不到端点时回 503，而不是不激活。
 */
export interface AppContext {
  logger?: LoggerLike;
  effect(fn: () => unknown, label?: string): unknown;
}

/** 桥接层解析后的配置。 */
export interface ResolvedConfig {
  /** 监听端口。固定 42081，避免每次启动换端口导致扩展配置失效。 */
  port: number;
  /** 监听地址。默认仅回环，绝不监听 0.0.0.0。 */
  host: string;
  /** MCP 端点路径（只读健康路由是 `<path>/health`）。 */
  path: string;
  /**
   * 凭据**直接值**（不是变量名）。
   *
   * 优先级最高。存在的理由：宿主的进程环境是**启动那一刻的快照**，
   * 用户级环境变量在宿主启动后才设、或宿主从旧环境启动时，
   * `tokenEnv` 路径会读空 —— 而 bridge 是个必须稳定监听端口的服务，
   * 不该把启动条件押在环境继承上（2026-10-06 实测踩到）。
   *
   * 留空表示不用这条路径。
   */
  token: string;
  /**
   * 凭据文件路径（读整个文件，去首尾空白）。
   *
   * 优先级次于 `token`、高于 `tokenEnv`。
   * 适合「不想把密钥写进 patch 文件，但也不想依赖进程环境」的场景：
   * 文件放在用户目录（如 `~/.oblivion/bridge-token`），权限自理。
   *
   * 留空表示不用这条路径。
   */
  tokenFile: string;
  /** 凭据变量名（不是密钥本身）。优先级最低，作为回退保留。 */
  tokenEnv: string;
  /** 是否强制要求回环来源。 */
  requireLoopback: boolean;
  /** 请求体上限（字节）。 */
  maxBodyBytes: number;
  /** 允许的浏览器扩展 Origin 白名单（CORS 用）。 */
  allowedOrigins: string[];
  /** 详细日志。 */
  debug: boolean;
}

/** 请求处理器的收发封装。 */
export type RouteHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;
