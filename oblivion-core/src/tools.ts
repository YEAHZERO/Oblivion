import { defineTool } from '@deepseek-ai/dsh-tools';
import type { AppContext } from './core-types.js';
import type { FeedbackService } from './feedback/index.js';
import type { GraphService } from './graph/index.js';
import type { KnowledgeService } from './knowledge/index.js';
import type { ProfileService } from './profile/index.js';
import type { DigestService } from './digest/index.js';
import type { RetitleService } from './knowledge/retitle.js';
import type { WikiService } from './knowledge/wiki.js';
import type { StatsService } from './stats/index.js';
import type { Source, UserProfile } from './types.js';
import { sha1 } from './util/hash.js';

/**
 * 模型面工具。
 *
 * 三条来自官方 dsh-tools 类型定义的硬约束（都是实测撞出来的，不是风格选择）：
 *
 *   ① `defineTool` 必须从 `@deepseek-ai/dsh-tools` 真实导入：它负责把
 *      `parameters` 编译成 JSON Schema 并在 execute 前校验参数。
 *   ② **每个 object schema 必须显式声明 `additionalProperties`** ——
 *      `ObjectValueSchemaSpec.additionalProperties: boolean` 是必填的，
 *      漏了它连 `{ type: 'object' }` 都编译不过。
 *   ③ `execute` 的返回类型是 `Promise<InferValue<O>>`，即**由 output.schema 推断**。
 *      所以 output 用 `{ type: 'object', additionalProperties: true }`
 *      得到 `Record<string, JsonValue>`；返回结构化对象必须过一层 `asCanonical()`。
 *
 * 参数类型不需要手写接口：`InferArgs<S>` 会从 `parameters` 字面量推断出来，
 * 手写 interface 反而会与推断结果冲突。
 */

/** 把返回的领域对象收敛成 canonical JSON，满足 InferValue<O>。 */
function asCanonical(value: unknown): never {
  return value as never;
}

function asText(value: unknown): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

const OBJECT_OUTPUT = { type: 'object', additionalProperties: true } as const;

export interface ToolDeps {
  knowledge: KnowledgeService;
  profile: ProfileService;
  feedback: FeedbackService | null;
  graph: GraphService;
  /** 观测面（判定留痕 + 统计 + 调参建议）。 */
  stats?: StatsService | null;
  /** 会话整理（`oblivion_digest`）。 */
  digest?: DigestService | null;
  /** 笔记改名 / 打标签（`oblivion_retitle`）。 */
  retitle?: RetitleService | null;
  /** 主题页（Wiki）归并（`oblivion_wiki`）。 */
  wiki?: WikiService | null;
  /** 陪伴模块的运行计数（触发闸门命中情况）。 */
  perspectiveStats?: () => Record<string, number> | null;
}

export function registerTools(ctx: AppContext, deps: ToolDeps): void {
  ctx.tools.register(defineTool({
    name: 'oblivion_capture',
    description:
      'Capture one Q/A pair into the Oblivion knowledge base: dedup, evaluate, persist as JSON plus a topic note, and build co-occurrence edges. Returns the decided action with a reason.',
    parameters: {
      question: { type: 'string', required: true, description: 'The user question.' },
      answer: { type: 'string', required: true, description: 'The answer to persist.' },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Source refs; http(s) URLs become url sources, everything else becomes doc sources.',
      },
      topic_hint: { type: 'string', description: 'Topic bucket name for the generated markdown note.' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const sources: Source[] = (args.sources ?? []).map((ref: string) => ({
        type: /^https?:/i.test(ref) ? ('url' as const) : ('doc' as const),
        ref,
        hash: sha1(ref),
      }));
      const at = Date.now();
      const result = await deps.knowledge.capture({
        question: args.question,
        answer: args.answer,
        sources,
        topicHint: args.topic_hint,
        sessionId: 'tool',
        turn: at,
        capturedAt: at,
      });
      return asCanonical({
        pass: result.pass,
        action: result.action,
        score: result.score === undefined ? null : Number(result.score.toFixed(3)),
        reason: result.reason ?? null,
        item_id: result.item?.id ?? null,
        topic: result.item?.topic ?? null,
      });
    },
  }));

  ctx.tools.register(defineTool({
    name: 'oblivion_query',
    description:
      'Search the Oblivion knowledge base by keywords. Returns matching items ranked by inverted-index score, each with its sources.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search terms.' },
      limit: { type: 'number', description: 'Max results (default 10).' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      return asCanonical(await deps.knowledge.query({ query: args.query, limit: args.limit ?? 10 }));
    },
  }));

  ctx.tools.register(defineTool({
    name: 'oblivion_profile',
    description:
      'Read or update the user thinking profile: inquiry style, blind spots, receptive and resistant dimensions. The raw profile is only returned by this explicit call.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['read', 'update'],
        description: 'read returns the merged profile; update applies a partial patch.',
      },
      signal: {
        type: 'object',
        additionalProperties: true,
        description: 'Partial profile patch; only used when action=update.',
      },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (args.action === 'read') return asCanonical(await deps.profile.read());
      const patch = (args.signal ?? {}) as Partial<UserProfile>;
      return asCanonical(await deps.profile.update(patch));
    },
  }));

  ctx.tools.register(defineTool({
    name: 'oblivion_feedback',
    description:
      'Record feedback on one perspective or dimension: 1 useful, -1 not useful, 0 neutral. Neutral is recorded but never tunes the profile; tuning needs N same-direction signals on the same target.',
    parameters: {
      target: { type: 'string', required: true, description: 'The dimension or perspective id.' },
      signal: {
        type: 'number',
        required: true,
        enum: [-1, 0, 1],
        description: '1 up, -1 down, 0 neutral.',
      },
      context: { type: 'string', description: 'What was being shown when the feedback was given.' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (!deps.feedback) {
        return asCanonical({ skipped: true, reason: 'enableFeedback is false' });
      }
      return asCanonical(await deps.feedback.record({
        target: args.target,
        signal: args.signal as -1 | 0 | 1,
        context: args.context,
      }));
    },
  }));

  ctx.tools.register(defineTool({
    name: 'oblivion_graph_neighbors',
    description:
      'Query co-occurrence neighbors of one entity id. Weights decay lazily at read time, so older edges rank lower without any background job.',
    parameters: {
      id: { type: 'string', required: true, description: 'Entity id, lowercased, e.g. "cordis".' },
      limit: { type: 'number', description: 'Max neighbors (default 20).' },
    },
    output: {
      schema: { type: 'array', items: OBJECT_OUTPUT },
      render: (_args, value) => asText(value),
    },
    async execute(args) {
      const rows = await deps.graph.neighbors(args.id, args.limit ?? 20);
      return asCanonical(rows.map((row) => ({
        id: row.source_id === args.id ? row.target_id : row.source_id,
        weight: Number(row.weight.toFixed(4)),
        effective: Number(row.effective.toFixed(4)),
        reinforce_count: row.reinforce_count,
        last_reinforced_at: row.last_reinforced_at,
      })));
    },
  }));

  /**
   * **整理当前对话**（用户显式要求时用）。
   *
   * 分工：**模型负责读懂并产出结构**（它本来就把整场对话握在上下文里），
   * 本工具负责落成两样东西 —— 一篇人读的整理笔记 + 一条可检索的知识条目（并建共现边）。
   * 所以它**不需要**把历史重放给插件，也**不走四层筛选**（用户点名要沉淀的内容不该被拦）。
   */
  ctx.tools.register(defineTool({
    name: 'oblivion_digest',
    description:
      'Organize the current conversation into a structured digest note plus one searchable knowledge item. ' +
      'Use it when the user asks to tidy up / summarize / organize this conversation. ' +
      'YOU produce the structure (you already hold the conversation): sections with headings and bodies, ' +
      'key decisions, todos, open questions, and links to related entries. ' +
      'The plugin writes <mdRoot>/04_会话整理/<date>-<title>.md, stores one item, and builds co-occurrence edges.',
    parameters: {
      title: { type: 'string', required: true, description: 'Digest title, e.g. "DSH 插件开发 · 会话整理".' },
      topic: { type: 'string', description: 'Topic bucket for the note file and the item topic; derived from the title when omitted.' },
      sections: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            heading: { type: 'string', required: true },
            body: { type: 'string', required: true },
          },
        },
        description: 'Main body of the digest: 2-6 sections, each a heading plus the distilled content.',
      },
      decisions: { type: 'array', items: { type: 'string' }, description: 'Key decisions reached in this conversation.' },
      todos: { type: 'array', items: { type: 'string' }, description: 'Action items that follow from this conversation.' },
      open_questions: { type: 'array', items: { type: 'string' }, description: 'Questions left unresolved.' },
      links: { type: 'array', items: { type: 'string' }, description: 'Related item ids or note names, written as [[...]] wikilinks.' },
      session_id: { type: 'string', description: 'Optional session id recorded in the note and item sources.' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (!deps.digest) {
        return asCanonical({ skipped: true, reason: 'digest service unavailable' });
      }
      const result = await deps.digest.save({
        title: args.title,
        topic: args.topic,
        sections: (args.sections ?? []) as Array<{ heading: string; body: string }>,
        decisions: args.decisions,
        todos: args.todos,
        openQuestions: args.open_questions,
        links: args.links,
        sessionId: args.session_id,
      });
      return asCanonical({
        id: result.id,
        title: result.title,
        topic: result.topic,
        sections: result.sections,
        note: result.notePath,
        item: result.itemId,
        edges: result.entities,
      });
    },
  }));

  /**
   * 笔记改名 / 打标签：**模型负责起名，插件只负责落盘与同步**（与 `oblivion_digest` 同一种分工）。
   *
   * 为什么合成一个工具的两段式，而不是「列表」+「改名」两个工具：起名这件事**必须先看内容**，
   * 而看哪几篇是模型自己决定的（它知道刚才在聊什么）。所以不带 `items` 时先给候选，
   * 带 `items` 时才落地 —— 一次调用就能自洽，不需要模型记住另一套 id 清单。
   */
  ctx.tools.register(defineTool({
    name: 'oblivion_retitle',
    description:
      'Rename / re-tag Oblivion notes so the file name says what is actually inside. ' +
      'Call it with NO `items` first: it returns candidate notes (id, current file name, topic, the original question, an answer excerpt). ' +
      'Then call it again with `items` giving each note a content-based title (<= 32 chars) and 2-8 tags. ' +
      'The plugin renames the file, rewrites the note header/frontmatter (the original question is preserved in `ask:` / `>Ask：`), ' +
      'syncs the knowledge item, and rebuilds <mdRoot>/00-Index/索引.md.',
    parameters: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Note id from the candidate list (the value inside <!-- oblivion:id=… -->).' },
            title: { type: 'string', required: true, description: 'New content-based name, e.g. "Exa/Tavily 密钥读取与直连检索".' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tags (2-8, lowercase, no #).' },
          },
        },
        description: 'Notes to rename. Omit (or pass an empty array) to get the candidate list instead.',
      },
      limit: { type: 'number', description: 'How many candidates to return in list mode (default 10, max 50).' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (!deps.retitle) {
        return asCanonical({ skipped: true, reason: 'retitle service unavailable' });
      }
      const items = (args.items ?? []) as Array<{ id: string; title: string; tags?: string[] }>;
      if (items.length === 0) {
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(50, Math.floor(args.limit)) : 10;
        const notes = await deps.retitle.list(limit);
        return asCanonical({
          mode: 'list',
          count: notes.length,
          hint: '给每篇一个内容名（<= 32 字）与 2-8 个标签，再调一次本工具并在 items 里带上 id/title/tags。',
          notes: notes.map((n) => ({
            id: n.id,
            file: n.file,
            title: n.title,
            topic: n.topic,
            tags: n.tags,
            ask: n.ask,
            excerpt: n.excerpt,
          })),
        });
      }
      // 走这条路的名字都记成 `named_by: "model"`：字符串命名管线（回填脚本）看到标记就让路，
      // 免得下一次回填把模型起的内容名重新算回「去水词后的整句问句」。
      const { results, index } = await deps.retitle.apply(items.map((it) => ({ ...it, namedBy: 'model' })));
      const ok = results.filter((r) => r.ok);
      return asCanonical({
        mode: 'apply',
        total: results.length,
        renamed: ok.filter((r) => r.from !== r.to).length,
        retagged: ok.filter((r) => r.from === r.to).length,
        failed: results.filter((r) => !r.ok),
        results,
        index,
      });
    },
  }));

  /**
   * 主题页（Wiki）：**把「差不多主题」的笔记合成一页**——同样是模型判、插件落盘。
   *
   * 为什么必须模型判：`topic` 是「问句里第一个词串」（实测 56 篇落在 55 个 topic 上，
   * 只有 1 个 topic 有 2 版），按它自动合并等于合不出东西；而「这两篇讲的是不是一回事」
   * 是语义判断，只有模型能做。插件负责的是它擅长的那半：frontmatter、双链、回链、索引、幂等。
   */
  ctx.tools.register(defineTool({
    name: 'oblivion_wiki',
    description:
      'Merge notes that are really about the SAME topic into one wiki page under <mdRoot>/02_Wiki页面/. ' +
      'Call it with NO `clusters` first: it returns candidate notes (id, file name, the original question, tags, excerpt) ' +
      'plus the wiki pages that already exist. Then call it again with `clusters` = [{ title, summary, members: [note id], tags }] — ' +
      'group by meaning, not by the `topic` field (that field is only the first word of the question). ' +
      'The plugin writes one page per cluster (your summary + source-note links + shared tags), ' +
      'adds a `> Wiki：[[title]]` backlink line to every member note, and rebuilds <mdRoot>/00-Index/索引.md. ' +
      'It never edits note bodies and never deletes anything; re-running a cluster updates that same page.',
    parameters: {
      clusters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', required: true, description: 'Wiki page title (also the file name), e.g. "认知插件组 · 事件作用域与注入".' },
            summary: { type: 'string', required: true, description: 'The merged write-up: what the notes together say, where they disagree, what is still open. This is the reason the page exists.' },
            members: {
              type: 'array',
              items: { type: 'string' },
              required: true,
              description: 'Note ids from the candidate list (the value inside <!-- oblivion:id=… -->).',
            },
            tags: { type: 'array', items: { type: 'string' }, description: 'Extra page tags (lowercase, no #); member tags are merged in automatically.' },
          },
        },
        description: 'Topic clusters to write. Omit (or pass an empty array) to get the candidate list instead.',
      },
      limit: { type: 'number', description: 'How many candidate notes to return in list mode (default 20, max 80).' },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (!deps.wiki) {
        return asCanonical({ skipped: true, reason: 'wiki service unavailable' });
      }
      const clusters = (args.clusters ?? []) as Array<{
        title: string;
        summary: string;
        members: string[];
        tags?: string[];
      }>;
      if (clusters.length === 0) {
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(80, Math.floor(args.limit)) : 20;
        const { notes, pages } = await deps.wiki.list(limit);
        return asCanonical({
          mode: 'list',
          count: notes.length,
          hint:
            '按**含义**分簇（不要按 topic 字段：那只是问句的第一个词串），每簇给 title + summary + members(笔记 id)。' +
            '再调一次本工具并带上 clusters 落地；summary 是主题页的核心（合并后的口径/分歧/未决）。',
          pages,
          notes: notes.map((n) => ({
            id: n.id,
            file: n.file,
            title: n.title,
            ask: n.ask,
            status: n.status,
            tags: n.tags,
            wiki: n.wiki || null,
            excerpt: n.excerpt,
          })),
        });
      }
      const { results, linked, index } = await deps.wiki.apply(clusters);
      const ok = results.filter((r) => r.ok);
      return asCanonical({
        mode: 'apply',
        total: results.length,
        pages: ok.length,
        linked,
        failed: results.filter((r) => !r.ok),
        results,
        index,
      });
    },
  }));

  /**
   * 观测面入口：**回答「怎么感知 / 该调哪个参数」**。
   *
   * 返回三样东西：① 生效中的完整配置（这就是可调参数清单）；
   * ② 由真实留痕算出的统计（捕获率、被谁拦下、价值分分布）；
   * ③ 最近若干条判定（含 `no-qa` 与各条 reason）。
   */
  ctx.tools.register(defineTool({
    name: 'oblivion_status',
    description:
      'Inspect the Oblivion cognition layer: effective config, capture stats from real decision traces (capture rate, rejection reasons, value-score distribution), tuning hints (which key to change and why), and the most recent per-turn decisions.',
    parameters: {
      recent: {
        type: 'number',
        description: 'How many recent decisions to include (default from config, max 100).',
      },
      include_config: {
        type: 'boolean',
        description: 'Include the full effective config (default true).',
      },
    },
    output: { schema: OBJECT_OUTPUT, render: (_args, value) => asText(value) },
    async execute(args) {
      if (!deps.stats) {
        return asCanonical({ enabled: false, reason: 'enableStats is false —— 判定留痕被关闭' });
      }
      const recentLimit =
        typeof args.recent === 'number' && args.recent > 0 ? Math.min(100, Math.floor(args.recent)) : undefined;
      const snapshot = await deps.stats.status({
        recentLimit,
        perspective: deps.perspectiveStats?.() ?? undefined,
      });
      const { config, ...rest } = snapshot;
      return asCanonical(args.include_config === false ? rest : { ...rest, config });
    },
  }));
}