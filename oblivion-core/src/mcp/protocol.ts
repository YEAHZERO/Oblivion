/**
 * `@oblivion/core` · MCP 协议的传输无关分发。
 *
 * 从 `@oblivion/http-bridge/src/mcp.ts` 搬进来的（v0.2.8 起 MCP 属于 core 的内部模块），
 * 行为逐条保留，只把「门面从哪来」换成了入参：
 *
 *   - `initialize` / `tools/list` / `tools/call` 三分支；
 *   - 无 `id` 视为通知，不回复（返回 `null`，调用方回 204）；
 *   - `tools/call` 的 `result` 形状必须是 `{ content: [{ type: 'text', text }] }`；
 *   - 未知工具 **-32602**（invalid params）、未知方法 **-32601**，与现役 deepseek-pp host 对齐；
 *   - 工具执行异常包成 `isError: true` 的**正常响应**（MCP 规范：工具失败是业务结果，不是协议错误）。
 *
 * 新增一条：门面还没就绪时回 `-32603` 并说明原因 —— 端点先于门面存在是**正常装载顺序**
 * （core 的 `apply()` 里先起端点、后建门面），不能当成「core 没装」。
 */

import { TOOLS } from './tools.js';
import type { McpEndpointInfo, McpFacade, McpLog } from './types.js';

/** 与现役 shell host 对齐，避免扩展收紧校验时被打回。 */
export const PROTOCOL_VERSION = '2025-06-18';

const INSTRUCTIONS = [
  'Oblivion 本地知识库端点。',
  '提供 oblivion_capture_page（把当前网页加入知识库）与 oblivion_search（检索已存知识）。',
  '所有数据保存在用户本机，不上传。',
].join('');

interface JsonRpcMessage {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: { name?: unknown; arguments?: unknown };
}

const ok = (id: unknown, result: unknown): unknown => ({ jsonrpc: '2.0', id, result });
const fail = (id: unknown, code: number, message: string): unknown => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

/** `tools/list` 的内容（也是端点自检里列的 `tools`）。 */
export function toolSchemas(): unknown[] {
  return TOOLS.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

/** 工具名列表，供心跳/诊断使用。 */
export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}

/** 端点信息（`describe()` 用）。 */
export function describeEndpoint(facade: McpFacade | null, apiVersion: number, owner: string): McpEndpointInfo {
  return {
    apiVersion,
    owner,
    version: facade?.version ?? '',
    tools: toolNames(),
    ready: facade !== null,
  };
}

export interface HandleOptions {
  /** 当前门面；装载早期可以是 `null`。 */
  facade: McpFacade | null;
  /** 一条 MCP 消息的原始文本。 */
  rawBody: string;
  /** 日志出口，缺省静默。 */
  log?: McpLog;
}

/**
 * 处理一条 MCP 消息。
 *
 * @returns 响应对象；通知返回 `null`（HTTP 层回 204）。
 */
export async function handleMcpMessage(options: HandleOptions): Promise<unknown> {
  const log = options.log ?? ((): void => undefined);

  let message: JsonRpcMessage;
  try {
    const parsed: unknown = JSON.parse(options.rawBody);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail(null, -32600, 'invalid request');
    }
    message = parsed as JsonRpcMessage;
  } catch {
    return fail(null, -32700, 'parse error');
  }

  // 通知：无 id，不回复
  if (message.id === undefined) {
    log(`mcp: notification ${String(message.method)}`);
    return null;
  }

  if (message.jsonrpc !== '2.0') return fail(message.id, -32600, 'invalid request');

  switch (message.method) {
    case 'initialize': {
      const facade = options.facade;
      return ok(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'oblivion', version: facade?.version ?? 'unknown' },
        instructions: INSTRUCTIONS,
      });
    }

    case 'notifications/initialized':
      return null;

    case 'ping':
      return ok(message.id, {});

    case 'tools/list':
      return ok(message.id, { tools: toolSchemas() });

    case 'tools/call': {
      const name = message.params?.name;
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (tool === undefined) return fail(message.id, -32602, `Unknown tool: ${String(name)}`);

      const facade = options.facade;
      if (facade === null) {
        return fail(message.id, -32603, 'oblivion core facade not ready');
      }

      const args =
        message.params?.arguments !== null && typeof message.params?.arguments === 'object'
          ? (message.params.arguments as Record<string, unknown>)
          : {};

      try {
        const value = await tool.run(facade, args);
        return ok(message.id, {
          content: [
            {
              type: 'text',
              text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
            },
          ],
          isError: false,
        });
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        log(`mcp: tool ${String(name)} failed: ${reason}`);
        return ok(message.id, {
          content: [{ type: 'text', text: `工具执行失败：${reason}` }],
          isError: true,
        });
      }
    }

    default:
      return fail(message.id, -32601, `Unsupported method: ${String(message.method)}`);
  }
}
