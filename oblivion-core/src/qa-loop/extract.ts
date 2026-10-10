import type { QAPair, Source } from '../types.js';
import { shortHash } from '../util/hash.js';

export interface TurnEventLike {
  type: string;
  seq: number;
  data?: unknown;
}

export interface RawTurn {
  sessionId: string;
  turn: number;
  events: TurnEventLike[];
}

/**
 * 模型的工作笔记（推理/思考）与工具调用**不是回答**，绝不能被拼进答案。
 *
 * 为什么单列一张表：推理块与可见文本块的形状**一模一样**（都是 `{ type, text }`），
 * 只有 `type` 不同 —— 旧实现「把所有带 text 的块拼起来」，于是英文 CoT 跟着答案一起
 * 被沉淀（2026-10-06 清库时 76 篇里有 40 篇的 `>Note：` 是推理碎片）。
 *
 * 实测（2026-10-07，本机 `~/.dsh/sessions/…/session.v4.jsonl.zstd`，2507 条 `assistant/message`）：
 * 块的 `type` 取值 `tool-call`(3264) / `reasoning`(2489) / `text`(356)，键形状只有
 * `{arguments,id,name,type}` 与 `{text,type}` 两种；**没有任何一条消息带两个 text 块**
 * ⇒ 「取最后一个 text 块」与「拼所有 text 块」在真实数据上等价，这里继续用拼接（更宽容）。
 */
const NON_VISIBLE_BLOCK_TYPES = new Set([
  'reasoning',
  'thinking',
  'analysis',
  'redacted-reasoning',
  'tool-call',
  'tool-result',
  'tool-addition',
  'tool-removal',
  'image',
  'file',
]);

/**
 * 块的种类：DSH 的**持久日志**用 `type`（`dsh-llm` 的 `ContentBlockMap`），
 * 客户端 UI 的节点用 `kind`（`assistant-content.ts` 过滤 `kind === 'reasoning'`）——
 * 两边都认，免得换一条通道推理就漏出来。
 */
function blockKind(block: object): string {
  const b = block as { type?: unknown; kind?: unknown };
  if (typeof b.type === 'string') return b.type.toLowerCase();
  if (typeof b.kind === 'string') return b.kind.toLowerCase();
  return '';
}

/**
 * 从消息事件里取**可见文本**。
 *
 * 形状刻意写得宽容：DSH 的 assistant/message 带 content blocks，user/message
 * 可能是字符串或带 text 的对象；这里只做「取文本」一件事，不解析附件 ——
 * 但推理块一律丢掉（见 `NON_VISIBLE_BLOCK_TYPES`）。
 */
export function textOfMessage(data: unknown): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const d = data as {
    text?: unknown;
    message?: { content?: unknown };
    content?: unknown;
  };
  if (typeof d.text === 'string') return d.text;
  const content = d.message?.content ?? d.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (!block || typeof block !== 'object') return '';
        if (NON_VISIBLE_BLOCK_TYPES.has(blockKind(block))) return '';
        const b = block as { text?: unknown; content?: unknown };
        if (typeof b.text === 'string') return b.text;
        if (typeof b.content === 'string') return b.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * 取 `user/message` 的来源种类。
 *
 * 实测（`dsh-llm/lib/types/message.d.ts`）：`MessageSource` 是可合并扩展的联合，
 * `MessageSourceMap['user'] = { kind: 'user' }`；而 `agent.inject()` 注入的上下文、
 * 目标续跑轮等也走 `user/message`，只是 `kind` 不同 —— 「`source` 用来区分它们」。
 */
export function userMessageSourceKind(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const source = (data as { source?: unknown }).source;
  if (!source || typeof source !== 'object') return undefined;
  const kind = (source as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : undefined;
}

/**
 * 是不是**真人提问**。
 *
 * 为什么要判：`user/message` 里混着 `agent.inject()` 的上下文（文件变更通知、子目录 AGENTS.md、
 * 技能内容、cron 通知…）。把这些当成「用户的问题」沉淀，会把一堆机器上下文写进知识库。
 *
 * 宽容策略：形状不认识（`source` 缺失）时**按真人处理** —— 宁可偶有多收，
 * 也不要因为上游改形状而变成「一声不响什么都不收」（那正是本插件首版的故障模式）。
 */
export function isHumanUserMessage(data: unknown): boolean {
  const kind = userMessageSourceKind(data);
  return kind === undefined || kind === 'user';
}

/**
 * 取本轮最后一个**真人**提问与最后一个回答。
 *
 * 没有真人提问的 turn（定时唤醒、纯工具轮、纯注入上下文）返回 undefined —— 这是刻意的：
 * 没有提问就没有「问答对」，不该被沉淀。
 */
export function extractQAPair(turn: RawTurn): QAPair | undefined {
  let question = '';
  let answer = '';

  for (const event of turn.events) {
    if (event.type === 'user/message') {
      if (!isHumanUserMessage(event.data)) continue;
      const t = textOfMessage(event.data).trim();
      if (t) question = t;
      continue;
    }
    if (event.type === 'assistant/message') {
      const t = textOfMessage(event.data).trim();
      if (t) answer = t;
    }
  }

  if (!question || !answer) return undefined;

  const ref = turn.sessionId + '#turn-' + turn.turn;
  const sources: Source[] = [{ type: 'session', ref, hash: shortHash(ref) }];

  return {
    question,
    answer,
    sources,
    sessionId: turn.sessionId,
    turn: turn.turn,
    capturedAt: Date.now(),
  };
}