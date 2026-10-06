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
 * 从消息事件里取纯文本。
 *
 * 形状刻意写得宽容：DSH 的 assistant/message 带 content blocks，user/message
 * 可能是字符串或带 text 的对象；这里只做「取文本」一件事，不解析附件。
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