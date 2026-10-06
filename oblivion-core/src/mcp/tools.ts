/**
 * `@oblivion/core` · MCP 工具面（浏览器场景）。
 *
 * 只暴露**浏览器扩展真正需要**的两个工具：把网页存进知识库、检索知识库。
 * core 自己给 DSH agent 的那 9 个工具（capture/query/profile/feedback/
 * graph_neighbors/digest/retitle/wiki/status）语义更重，浏览器扩展不需要。
 *
 * 两个工具都直接调门面上的 `knowledge` —— 与 qa-loop、`registerTools` 用的是同一个对象，
 * 所以经 MCP 写进来的知识照常参与去重、建图、画像。
 */

import type { McpFacade, McpTool } from './types.js';

/** 把 http(s) URL 判为 url 源，其余判 doc 源（与 core 的 tools.ts 同规则）。 */
function toSources(urls: string[] | undefined): Array<{ type: string; ref: string }> {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map((ref) => ({ type: /^https?:/i.test(ref) ? 'url' : 'doc', ref }));
}

/** 标签：只传非空字符串；形状归一化交给 core 的 `tagsFromQA`（ASCII、≤40 字）。 */
function toTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '').map((tag) => tag.trim());
  return tags.length > 0 ? tags : undefined;
}

export const TOOLS: McpTool[] = [
  {
    name: 'oblivion_capture_page',
    description:
      '把当前网页（正文或用户选中的片段）加入本地 Oblivion 知识库。' +
      '会经过去重与价值评估，返回实际处置结果（created/appended/duplicate/ignored）与原因。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '页面 URL。' },
        title: { type: 'string', description: '页面标题。' },
        content: { type: 'string', description: '页面正文文本。' },
        selection: { type: 'string', description: '用户选中的片段；提供时优先于 content。' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签。归一化后写入（只留 ASCII 技术词形状、单项 ≤40 字）。',
        },
      },
      required: ['url', 'title', 'content'],
      additionalProperties: false,
    },
    async run(facade: McpFacade, args: Record<string, unknown>): Promise<unknown> {
      const url = String(args.url ?? '');
      const title = String(args.title ?? '');
      const selection = typeof args.selection === 'string' ? args.selection.trim() : '';
      const body = selection !== '' ? selection : String(args.content ?? '');
      if (body.trim() === '') throw new Error('内容为空，未写入知识库。');

      const at = Date.now();
      return facade.knowledge.capture({
        question: title === '' ? url : title,
        answer: body,
        sources: toSources([url]),
        tagsHint: toTags(args.tags),
        sessionId: 'http-bridge',
        turn: at,
        capturedAt: at,
      });
    },
  },
  {
    name: 'oblivion_search',
    description: '检索本地 Oblivion 知识库，返回最相关的若干条记录（含来源 URL）。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词或自然语言问题。' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: '返回条数上限，默认 10。' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async run(facade: McpFacade, args: Record<string, unknown>): Promise<unknown> {
      const query = String(args.query ?? '').trim();
      if (query === '') throw new Error('query 不能为空。');
      const rawLimit = Number(args.limit ?? 10);
      const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 50 ? rawLimit : 10;
      return facade.knowledge.query({ query, limit });
    },
  },
];
