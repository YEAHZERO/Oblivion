/**
 * `@oblivion/core` · MCP 模块的类型。
 *
 * MCP 端点**住在 core 里**（C 方案 §一 的落点）：协议分发与工具面属于「认知能力」，
 * 传输（HTTP / 鉴权 / CORS / 端口）属于外部插件 `@oblivion/http-bridge`。
 *
 * 与 core-types.ts 同策略：**不 import** `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-*`；
 * 用结构化类型描述真正用到的成员，typecheck 独立通过，也不假装拥有更多契约。
 */

/** core 门面里 MCP 工具真正用到的那部分（结构化，不 import 门面的实型）。 */
export interface McpFacade {
  /** core 的版本号，`initialize` 的 `serverInfo.version` 用它。 */
  version: string;
  knowledge: McpKnowledge;
}

/** MCP 工具用到的 knowledge 方法（与 core 的 knowledge 模块结构兼容）。 */
export interface McpKnowledge {
  query(input: { query: string; limit?: number }): Promise<unknown>;
  capture(input: {
    question: string;
    answer: string;
    sources?: Array<{ type: string; ref: string; hash?: string }>;
    topicHint?: string;
    /** 调用方显式给的标签（仍过 `tagsFromQA()` 的形状归一化）。 */
    tagsHint?: string[];
    sessionId?: string;
    turn?: number;
    capturedAt?: number;
  }): Promise<unknown>;
}

/** 一条 MCP 工具。 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(facade: McpFacade, args: Record<string, unknown>): Promise<unknown>;
}

/** 日志出口：宿主给什么用什么，缺省静默（MCP 是请求驱动的，不该刷屏）。 */
export type McpLog = (message: string) => void;

/**
 * 一个可被传输层调用的 MCP 端点。
 *
 * `handle()` 是**传输无关**的：入参是一条 MCP 消息的原始文本，出参是响应对象，
 * 通知返回 `null`（HTTP 层回 204）。因此同一个端点可以挂在
 * `@oblivion/http-bridge` 的 `node:http` 上，也可以将来挂到别的传输上。
 */
export interface McpEndpoint {
  /** 契约版本：传输层据此判断「对面是不是我认识的 core」。 */
  readonly apiVersion: number;
  /** 端点发布者标识，出问题时一眼看出是谁占了这个槽。 */
  readonly owner: string;
  /** 当前门面版本（core 装载后即固定；门面缺席时为 `''`）。 */
  version(): string;
  /** 结构化健康信息，供心跳/诊断文件使用。 */
  describe(): McpEndpointInfo;
  handle(rawBody: string, log?: McpLog): Promise<unknown>;
}

export interface McpEndpointInfo {
  apiVersion: number;
  owner: string;
  version: string;
  /** 工具名列表（`tools/list` 会给出的那批）。 */
  tools: string[];
  /** 端点是否已经拿到 core 门面（装载早期可能还没有）。 */
  ready: boolean;
}
