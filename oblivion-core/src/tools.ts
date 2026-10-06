import { defineTool } from '@deepseek-ai/dsh-tools';
import type { AppContext } from './core-types.js';
import type { FeedbackService } from './feedback/index.js';
import type { GraphService } from './graph/index.js';
import type { KnowledgeService } from './knowledge/index.js';
import type { ProfileService } from './profile/index.js';
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
}