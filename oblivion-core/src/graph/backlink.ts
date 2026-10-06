import type { KnowledgeItem } from '../types.js';
import { jaccard, tokenize } from '../knowledge/search.js';
import { isWeakTitle } from '../knowledge/naming.js';

/**
 * 图谱生长的**双链写回**（设计书 §25.6/§12.4 里那条一直缺的「写入 MD：`[[相关条目]]`」）。
 *
 * 做法刻意保持确定性（不调 LLM、不做向量）：
 *   ① 只跟**最近的若干条 active 条目**比（默认 60 条），把开销钉死；
 *   ② 相似度 = 标题 + 正文前若干字符的 **token Jaccard**（与语义去重同一把尺子）；
 *   ③ 超过阈值才连边，最多 `limit` 条 —— 宁可少连，也不要把每篇笔记都变成链接墙。
 *
 * 只读、纯函数，便于自检与单测（写回动作在 md-writer 的 `appendRelatedLinks`）。
 */
export interface RelatedItem {
  id: string;
  title: string;
  topic: string;
  score: number;
}

const CONTENT_PREFIX = 600;

export function findRelatedItems(
  current: Pick<KnowledgeItem, 'id' | 'title' | 'content'>,
  candidates: readonly KnowledgeItem[],
  options: { limit?: number; minScore?: number; recent?: number } = {},
): RelatedItem[] {
  const limit = Math.max(0, options.limit ?? 5);
  if (limit === 0) return [];
  const minScore = options.minScore ?? 0.05;
  const recent = Math.max(1, options.recent ?? 60);

  const base = new Set(tokenize(current.title + '\n' + current.content.slice(0, CONTENT_PREFIX)));

  const pool = candidates
    .filter((item) => item.id !== current.id && item.status === 'active')
    // 弱标题（`OK`、`继续`、`已重启`）不配当双链目标：拿它连过去等于什么都没说。
    // 现场实测老笔记里就有 `[[OK]]`、`[[继续]]` 这类链接，源头正是这里没筛。
    .filter((item) => typeof item.title === 'string' && item.title.trim() !== '' && !isWeakTitle(item.title))
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, recent);

  const scored: RelatedItem[] = [];
  for (const item of pool) {
    const other = new Set(tokenize(item.title + '\n' + item.content.slice(0, CONTENT_PREFIX)));
    const score = jaccard(base, other);
    if (score >= minScore) scored.push({ id: item.id, title: item.title, topic: item.topic, score });
  }

  return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
