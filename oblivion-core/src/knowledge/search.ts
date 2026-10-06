import type { KnowledgeItem } from '../types.js';

/** 停用词只列高频的，宁可漏也不要过度过滤掉技术词。 */
const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  '你', '我', '他', '她', '的', '了', '是', '在', '和', '就', '都', '而', '及',
  '与', '或', '一个', '这个', '那个', '什么', '怎么', '如何', '可以', '需要',
]);

/**
 * CJK 走单字 + 整串双写，latin/数字走整词。确定性、无分词依赖。
 * 单字让「共现」类查询有召回，整串让专有名词能被精确命中。
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!chunk) continue;
    if (/[\u3040-\u30ff\u3400-\u9fff]/.test(chunk)) {
      for (const ch of chunk) if (!STOP.has(ch)) out.push(ch);
      if (chunk.length >= 2) out.push(chunk);
      continue;
    }
    if (chunk.length >= 2 && !STOP.has(chunk)) out.push(chunk);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export interface SearchHit {
  item: KnowledgeItem;
  score: number;
  matched: string[];
}

/**
 * 内存倒排索引。按需重建，不做失效管理 —— 重建成本远低于维护正确性的成本。
 * 共现扩展是可选增强：`expandByGraph` 接收 graph 服务的邻居表，避免互相 import。
 */
export class KnowledgeIndex {
  private items: KnowledgeItem[] = [];
  private postings = new Map<string, Set<number>>();

  rebuild(items: KnowledgeItem[]): void {
    this.items = items.filter((i) => i.status !== 'archived');
    this.postings.clear();
    this.items.forEach((item, idx) => {
      const tokens = new Set([
        ...tokenize(item.title),
        ...tokenize(item.content),
        ...item.tags.flatMap((t) => tokenize(t)),
      ]);
      for (const t of tokens) {
        let set = this.postings.get(t);
        if (!set) this.postings.set(t, (set = new Set()));
        set.add(idx);
      }
    });
  }

  get size(): number {
    return this.items.length;
  }

  all(): KnowledgeItem[] {
    return this.items;
  }

  byId(id: string): KnowledgeItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  search(query: string, limit = 10): SearchHit[] {
    const tokens = [...new Set(tokenize(query))];
    if (tokens.length === 0) return [];
    const candidateHits = new Map<number, Set<string>>();
    for (const t of tokens) {
      for (const idx of this.postings.get(t) ?? []) {
        let set = candidateHits.get(idx);
        if (!set) candidateHits.set(idx, (set = new Set()));
        set.add(t);
      }
    }
    const hits: SearchHit[] = [];
    for (const [idx, matched] of candidateHits) {
      const item = this.items[idx];
      let score = matched.size / tokens.length;
      const titleTokens = new Set(tokenize(item.title));
      for (const t of matched) {
        if (titleTokens.has(t)) score += 0.2;
        if (item.tags.some((tag) => tag.toLowerCase().includes(t))) score += 0.2;
      }
      hits.push({ item, score, matched: [...matched] });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** 共现扩展：检索之后把强邻居也带出来，这是「关键词 + 共现图」的图那一半。 */
  expandByGraph(
    seedIds: string[],
    neighborsOf: (id: string, limit: number) => Array<{ id: string; effective: number }>,
    limit = 3,
  ): KnowledgeItem[] {
    const out: KnowledgeItem[] = [];
    const seen = new Set(seedIds);
    for (const id of seedIds) {
      for (const n of neighborsOf(id, limit)) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const item = this.byId(n.id);
        if (item) out.push(item);
      }
    }
    return out;
  }
}