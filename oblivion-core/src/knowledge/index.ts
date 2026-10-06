import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { FilterResult, ImplStatus, ItemStatus, KnowledgeItem, QAPair, Source } from '../types.js';
import { normalizeForHash, sha1 } from '../util/hash.js';
import { expandHome } from '../util/paths.js';
import { newId, now } from '../util/time.js';
import { compareByOverlap, fourLayerFilter, type SimilarVerdict } from './filter.js';
import { tagsFromQA, titleFromQA } from './naming.js';
import { KnowledgeIndex } from './search.js';
import { KnowledgeStore } from './store.js';

export interface CaptureResult extends FilterResult {
  item?: KnowledgeItem;
}

export interface KnowledgeQueryResult {
  count: number;
  results: Array<{
    id: string;
    title: string;
    topic: string;
    score: number;
    matched: string[];
    sources: string[];
    excerpt: string;
  }>;
}

export interface StructuredInput {
  title: string;
  topic: string;
  content: string;
  tags?: string[];
  sources: Source[];
  /** 落地状态（盲区规格：implemented / designed / placeholder）。 */
  impl?: ImplStatus;
  /** 版本状态（默认 active）。 */
  status?: ItemStatus;
}

export interface KnowledgeService {
  init(): Promise<void>;
  capture(qa: QAPair): Promise<CaptureResult>;
  /**
   * **直写一条结构化条目**（绕过四层筛选）。
   *
   * 用途：用户显式要求的动作（如「整理当前对话」）—— 四层筛选是给自动捕获防噪声用的，
   * 不该把用户点名要沉淀的内容挡在门外。仍然照常进索引、因而可被 `oblivion_query` 检索。
   */
  saveStructured(input: StructuredInput): Promise<KnowledgeItem>;
  query(args: { query: string; limit?: number }): Promise<KnowledgeQueryResult>;
  exactDuplicate(qa: QAPair): Promise<boolean>;
  semanticSimilar(qa: QAPair, threshold: number): Promise<SimilarVerdict>;
  recordConflict(qa: QAPair, existing: KnowledgeItem): Promise<string>;
  store: KnowledgeStore;
  index: KnowledgeIndex;
  lastTouched(): string[];
}

/**
 * 条目指纹。来源参与指纹，因此「同内容不同来源」也会命中 exactDuplicate；
 * 上层据此走 duplicate 分支去补来源，而不是新建条目。
 */
function fingerprint(qa: QAPair): string {
  const sourceKey = qa.sources
    .map((s) => s.type + ':' + s.ref)
    .sort()
    .join('|');
  return sha1(normalizeForHash(qa.question) + '::' + normalizeForHash(qa.answer) + '::' + sourceKey);
}

function contentFingerprint(question: string, answer: string): string {
  return sha1(normalizeForHash(question) + '::' + normalizeForHash(answer));
}

export function registerKnowledge(ctx: AppContext, config: Config): KnowledgeService {
  const store = new KnowledgeStore(expandHome(config.dataRoot));
  const index = new KnowledgeIndex();
  let touched: string[] = [];

  /**
   * 装载索引。
   *
   * **必须先 init() 再 loadAll()**：首跑时 dataRoot 还不存在，`readdir` 会失败，
   * 而 loadAll 的读取失败是被吞掉的（单文件损坏不该拖垮整个索引），
   * 于是「目录不存在」会被静默当成「索引为空」—— 症状是首跑时装载看似成功，
   * 但后续 capture 落盘前的读取路径状态不一致。
   * 这是自检脚本端到端用例抓出来的真实 bug，不要改成先读后建。
   */
  async function loadIndex(): Promise<KnowledgeItem[]> {
    await store.init();
    const items = await store.loadAll();
    index.rebuild(items);
    return items;
  }

  async function ensureLoaded(): Promise<void> {
    if (index.size === 0) await loadIndex();
  }

  async function exactDuplicate(qa: QAPair): Promise<boolean> {
    const items = index.size > 0 ? index.all() : await loadIndex();
    const fp = fingerprint(qa);
    const contentFp = contentFingerprint(qa.question, qa.answer);
    return items.some((i) => {
      if (i.sources.some((s) => s.hash === fp)) return true;
      return contentFingerprint(i.title, i.content) === contentFp;
    });
  }

  async function semanticSimilar(qa: QAPair, threshold: number): Promise<SimilarVerdict> {
    const items = index.size > 0 ? index.all() : await loadIndex();
    return compareByOverlap(qa, items.filter((i) => i.status === 'active'), threshold);
  }

  async function recordConflict(qa: QAPair, existing: KnowledgeItem): Promise<string> {
    return store.saveConflict({
      detected_at: now(),
      incoming: { question: qa.question, answer: qa.answer, sources: qa.sources },
      existing: { id: existing.id, title: existing.title, content: existing.content },
      policy: 'both versions retained; no silent merge',
    });
  }

  async function capture(qa: QAPair): Promise<CaptureResult> {
    const result = await fourLayerFilter(qa, config, { exactDuplicate, semanticSimilar });

    if (!result.pass) {
      if (result.action === 'conflict' && result.existing) {
        await recordConflict(qa, result.existing);
      }
      touched = [];
      return result;
    }

    const at = now();
    const fp = fingerprint(qa);

    if (result.action === 'appended' && result.existing) {
      const existing = result.existing;
      const updated: KnowledgeItem = {
        ...existing,
        content: existing.content + '\n\n---\n\n' + qa.answer,
        sources: mergeSources(existing.sources, qa, fp),
        updated_at: at,
        version: existing.version + 1,
      };
      await store.save(updated);
      await loadIndex();
      touched = [updated.id];
      return { ...result, item: updated };
    }

    const item: KnowledgeItem = {
      id: newId(at),
      topic: qa.topicHint ?? deriveTopic(qa),
      title: deriveTitle(qa),
      content: qa.answer,
      sources: mergeSources([], qa, fp),
      tags: deriveTags(qa),
      status: 'active',
      impl: 'implemented',
      created_at: at,
      updated_at: at,
      version: 1,
    };
    await store.save(item);
    await loadIndex();
    touched = [item.id];
    if (config.autoSupersede) await supersedeOlder(item.topic, item.id);
    return { ...result, item };
  }

  /**
   * **自动降级同主题旧版本**（盲区规格里的「检测到同一主题多版本 → 给旧版打 `superseded`」）。
   *
   * 只降级**同一 topic 且仍为 active** 的旧条目，并把 `supersededBy` 指向新条目 ——
   * 旧版**不删**（口径漂移的教训：删掉就再也说不清当初为什么改成这样）。
   */
  async function supersedeOlder(topic: string, keepId: string): Promise<string[]> {
    const older = index
      .all()
      .filter((item) => item.topic === topic && item.id !== keepId && item.status === 'active');
    const demoted: string[] = [];
    for (const item of older) {
      const next: KnowledgeItem = { ...item, status: 'superseded', supersededBy: keepId, updated_at: now(), version: item.version + 1 };
      await store.save(next);
      demoted.push(item.id);
    }
    if (demoted.length) await loadIndex();
    return demoted;
  }

  /**
   * 直写一条结构化条目（见 `KnowledgeService.saveStructured` 的说明）。
   * 与 `capture` 的 created 分支同一套落盘 + 索引刷新，只是**不问筛选**。
   */
  async function saveStructured(input: StructuredInput): Promise<KnowledgeItem> {
    const at = now();
    const item: KnowledgeItem = {
      id: newId(at),
      topic: input.topic || 'untitled',
      title: input.title || 'untitled',
      content: input.content,
      sources: input.sources,
      tags: input.tags ?? [],
      status: input.status ?? 'active',
      impl: input.impl ?? 'implemented',
      created_at: at,
      updated_at: at,
      version: 1,
    };
    await store.save(item);
    await loadIndex();
    touched = [item.id];
    if (item.status === 'active' && config.autoSupersede) await supersedeOlder(item.topic, item.id);
    return item;
  }

  async function query(args: { query: string; limit?: number }): Promise<KnowledgeQueryResult> {
    await ensureLoaded();
    const hits = index.search(args.query, args.limit ?? 10);
    return {
      count: hits.length,
      results: hits.map((h) => ({
        id: h.item.id,
        title: h.item.title,
        topic: h.item.topic,
        score: Number(h.score.toFixed(3)),
        matched: h.matched,
        sources: h.item.sources.map((s) => s.type + ':' + s.ref),
        excerpt: h.item.content.slice(0, 240),
      })),
    };
  }

  // 注册即 effect：卸载时释放索引引用，不留后台句柄。
  ctx.effect(() => {
    void loadIndex().catch(() => {
      // 首跑磁盘异常不该让插件装载失败；后续 capture 会再尝试。
    });
    return () => {
      index.rebuild([]);
      touched = [];
    };
  }, 'oblivion-core: initial index load');

  return {
    init: async () => {
      await loadIndex();
    },
    capture,
    saveStructured,
    query,
    exactDuplicate,
    semanticSimilar,
    recordConflict,
    store,
    index,
    lastTouched: () => touched,
  };
}

/**
 * 沉淀件的名字 —— **由内容决定**，不再是「我问了什么」的简写。
 *
 * 所有者 2026-10-06：「命名上看不出是什么内容，单纯只是我的问题的简写而已」。
 * 具体口径（确定性、不调模型）见 `naming.ts`：答案里第一个不像套话的小标题优先，
 * 否则把问句去掉水词、截到第一个标点，最后才退回问句原文。
 */
export function deriveTitle(qa: QAPair): string {
  return titleFromQA(qa.question, qa.answer);
}

/** 主题桶：显式 hint 优先，否则取问句里第一个实词串。 */
export function deriveTopic(qa: QAPair): string {
  if (qa.topicHint) return qa.topicHint;
  const m = qa.question.match(/[\p{L}\p{N}_-]{3,20}/gu);
  return m?.[0] ?? 'untitled';
}

function mergeSources(existing: KnowledgeItem['sources'], qa: QAPair, fp: string) {
  const all = [...existing, ...qa.sources];
  const seen = new Set<string>();
  const out: KnowledgeItem['sources'] = [];
  for (const s of all) {
    const key = s.type + ':' + s.ref;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: s.type, ref: s.ref, hash: s.hash || fp });
  }
  return out;
}

/** 标签：技术词 + 包名 + `#tag` + 中文词表（细则见 `naming.ts`，扫的是问句 + 答案）。 */
function deriveTags(qa: QAPair): string[] {
  return tagsFromQA(qa.question, qa.answer, qa.topicHint ? [qa.topicHint] : []);
}