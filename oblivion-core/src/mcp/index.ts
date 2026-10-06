/**
 * `@oblivion/core` · MCP 模块入口。
 *
 * 对外只做两件事：
 *   1. `createMcpEndpoint()` —— 把门面 + 协议分发包成一个**传输无关**的端点；
 *   2. `publishMcp()`（来自 `./channel.js`）—— 把端点放进进程内通道，等传输层来取。
 *
 * 传输（HTTP、鉴权、CORS、端口 42081）属于 `@oblivion/http-bridge`：它 `inject: []`，
 * 因此**永远能激活**；端点缺席时它如实回 503 并写明原因，而不是静默不启动。
 */

import {
  MCP_API_VERSION,
  MCP_CHANNEL,
  MCP_OWNER,
  channelKey,
  clearMcpChannel,
  describeMcpChannel,
  publishMcp,
  resolveMcp,
} from './channel.js';
import { describeEndpoint, handleMcpMessage, toolNames, toolSchemas, PROTOCOL_VERSION } from './protocol.js';
import { TOOLS } from './tools.js';
import type { McpEndpoint, McpFacade, McpLog } from './types.js';

export interface McpEndpointOptions {
  /** 当前门面；装载早期给 `null`（`initialize` 照常应答，工具调用回 -32603）。 */
  facade?: McpFacade | null;
  /** 门面带宽限期时的取用函数（优先于 `facade`）。 */
  facadeOf?: () => McpFacade | null;
  /** 发布者标识，默认 `@oblivion/core`。 */
  owner?: string;
  /** 日志出口，缺省静默。 */
  log?: McpLog;
}

/**
 * 造一个 MCP 端点。
 *
 * **不发布**：要放进通道请调用 `publishMcp(endpoint)`（或 `registerMcp()`），
 * 这样测试可以在不污染全局的情况下单独测协议。
 */
export function createMcpEndpoint(options: McpEndpointOptions = {}): McpEndpoint {
  const owner = options.owner ?? MCP_OWNER;
  const current = options.facadeOf ?? ((): McpFacade | null => options.facade ?? null);

  return {
    apiVersion: MCP_API_VERSION,
    owner,
    version: () => current()?.version ?? '',
    describe: () => describeEndpoint(current(), MCP_API_VERSION, owner),
    handle: (rawBody: string, log?: McpLog): Promise<unknown> =>
      handleMcpMessage({ facade: current(), rawBody, log: log ?? options.log }),
  };
}

/** 造端点并发布，返回 `{ endpoint, dispose }` —— 宿主把 `dispose` 挂进 `ctx.effect`。 */
export function registerMcp(options: McpEndpointOptions = {}): { endpoint: McpEndpoint; dispose: () => void } {
  const endpoint = createMcpEndpoint(options);
  return { endpoint, dispose: publishMcp(endpoint) };
}

export {
  MCP_API_VERSION,
  MCP_CHANNEL,
  MCP_OWNER,
  TOOLS,
  PROTOCOL_VERSION,
  channelKey,
  clearMcpChannel,
  describeMcpChannel,
  handleMcpMessage,
  publishMcp,
  resolveMcp,
  toolNames,
  toolSchemas,
};
export type { McpEndpoint, McpEndpointInfo, McpFacade, McpKnowledge, McpLog, McpTool } from './types.js';
