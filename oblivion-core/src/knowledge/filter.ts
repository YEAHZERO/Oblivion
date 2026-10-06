import type { Config } from '../config.js';
import type { FilterResult, KnowledgeItem, QAPair } from '../types.js';
import { evaluate, type EvaluateContext } from './evaluate.js';
import { jaccard, tokenize } from './search.js';

/**
 * 防回灌判据（设计书里的 `source_type === 'qa_loop'` 在真实事件里不存在，
 * 因此改为来源类型判定）。插件自己写进库的内容永远不能再被当成新知识收一遍。
 */
export function isOblivionOriginated(qa: QAPair): boolean {
  return qa.sources.some((s) => s.type === 'qa_loop' || s.ref.startsWith('oblivion:'));
}

function passesRules(qa: QAPair, config: Config): RuleVerdict {
  if (isOblivionOriginated(qa)) return { pass: false, reason: 'oblivion-originated' };
  if (qa.sources.length === 0) return { pass: false, reason: 'no-source' };
  return checkL3Rules(qa, config);
}

/** L3 的失败原因（设计书 §25.1 的四条规则 + 两条基础规则）。 */
export type L3Reason =
  | 'answer-too-short'
  | 'meaningless-only'
  | 'contains-unknown'
  | 'pleasantry-only';

export type RuleVerdict =
  | { pass: true }
  | { pass: false; reason: L3Reason | 'no-source' | 'oblivion-originated' };

/**
 * 无意义词：整条回答**只由这些词 + 标点**组成时才算命中。
 * 设计书原文是「仅含无意义词」，逐字实现就是「去掉标点后每个词都在表里」。
 */
const MEANINGLESS_TOKENS = new Set([
  '无', '没有', '暂无', '不知道', '不清楚', '测试', '试试', '占位', '略', '同上',
  'test', 'testing', 'asdf', 'qwer', 'aaa', 'zzz', 'todo', 'tbd', 'na', 'n/a',
]);

/**
 * 纯寒暄：整条回答就是客套话（可以带标点、表情、语气助词）。
 *
 * 设计书原文「纯寒暄 → 丢弃」。实现口径：**去掉标点/符号后，剩下的每个片段都是客套词或语气助词**，
 * 且长度不超过 24 字（超过就不是寒暄，而是一段正常回答里碰巧有客套词）。
 * 逐字实现「含客套词即丢弃」会误杀正文（例：「感谢你的方案，但风险在于…」是正常回答）。
 */
const PLEASANTRY_TOKENS =
  /(?:辛苦了|太感谢|感谢你|谢谢你|多谢|谢谢|感谢|好的|好嘞|行吧|可以|收到|明白|了解|懂了|辛苦了|thanks|thank you|thx|okay|ok|got it|nice|cool|嗯+|哦+|啊+|哈哈+|呵呵)/gi;
/** 语气助词/填充词：单独出现不算信息，但出现在寒暄里也允许。 */
const FILLER_TOKENS = /(?:你|您|啦|了|的|呀|啊|哦|咯|喽|哈|吧|呢|嘛|~)/g;
const PLEASANTRY_MAX_CHARS = 24;

function isPleasantryOnly(answer: string): boolean {
  const trimmed = answer.trim();
  if (trimmed === '' || trimmed.length > PLEASANTRY_MAX_CHARS) return false;
  const stripped = trimmed.replace(/[\s\p{P}\p{S}]/gu, '');
  if (stripped === '') return false; // 全是标点 → 交给「无意义」那条规则
  const leftover = stripped.replace(PLEASANTRY_TOKENS, '').replace(FILLER_TOKENS, '');
  return leftover === '';
}

/**
 * 否定式「不知道」。
 *
 * 设计书原文写「含"不知道" → 丢弃」。逐字实现会**误杀正文提及**
 * （例：「如果不校验 X 就不知道 Y」是正常技术回答）。所以口径收紧为
 * 「出现在回答**开头**」= 助手在拿"不知道"当答案；正文中后段的提及不触发。
 */
const UNKNOWN_ANSWER = /^\s*(?:我|我们)?\s*(?:也)?\s*(?:不知道|不清楚|不了解|不确定|无法确定|无从得知|不会|i\s*don'?t\s*know|not\s*sure|no\s*idea)/i;

/** 回答开头多少字符内判「拿不知道当答案」。 */
const UNKNOWN_HEAD_CHARS = 40;

function isMeaninglessOnly(answer: string): boolean {
  const withoutPunctuation = answer.replace(/[\s\p{P}\p{S}]/gu, ' ').trim();
  if (withoutPunctuation === '') return true;
  const tokens = withoutPunctuation.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return true;
  // 单字符（如「嗯」「哦」）也算无意义；其余必须在表里。
  return tokens.every((t) => t.length <= 1 || MEANINGLESS_TOKENS.has(t.toLowerCase()));
}

/**
 * L3 规则过滤（设计书 §25.1）：
 *   ① 答案 < 5 字（`config.minAnswerLength`，默认按设计书取 5）
 *   ② 仅含无意义词
 *   ③ 含「不知道」（口径见 `UNKNOWN_ANSWER`）
 *   ④ 纯寒暄
 */
export function checkL3Rules(qa: QAPair, config: Config): RuleVerdict {
  const answer = qa.answer.trim();
  if (answer.length < config.minAnswerLength) return { pass: false, reason: 'answer-too-short' };
  if (isMeaninglessOnly(answer)) return { pass: false, reason: 'meaningless-only' };
  if (UNKNOWN_ANSWER.test(answer.slice(0, UNKNOWN_HEAD_CHARS))) return { pass: false, reason: 'contains-unknown' };
  if (isPleasantryOnly(answer)) return { pass: false, reason: 'pleasantry-only' };
  return { pass: true };
}

export interface SimilarVerdict {
  action: 'new' | 'duplicate' | 'conflict' | 'appended';
  existing?: KnowledgeItem;
  ratio?: number;
}

export interface FilterDeps {
  exactDuplicate(qa: QAPair): Promise<boolean>;
  semanticSimilar(qa: QAPair, threshold: number): Promise<SimilarVerdict>;
  evaluateContext?: EvaluateContext;
}

/**
 * 四层筛选：L1 精确去重 → L2 语义（重合度）→ L3 规则 → L4 价值。
 * 先失败的那一层决定 action，且**每一层都带 reason**，绝不静默丢弃。
 */
export async function fourLayerFilter(
  qa: QAPair,
  config: Config,
  deps: FilterDeps,
): Promise<FilterResult> {
  if (await deps.exactDuplicate(qa)) {
    return { pass: false, action: 'duplicate', reason: 'exact hash match' };
  }

  const sim = await deps.semanticSimilar(qa, config.semanticThreshold);
  if (sim.action === 'duplicate') {
    return { pass: false, action: 'duplicate', reason: 'semantic duplicate', existing: sim.existing };
  }
  if (sim.action === 'conflict') {
    return { pass: false, action: 'conflict', reason: 'conflicts with existing item', existing: sim.existing };
  }

  const rules = passesRules(qa, config);
  if (!rules.pass) {
    return { pass: false, action: 'ignored', reason: rules.reason };
  }

  const score = await evaluate(qa, deps.evaluateContext);
  if (score < config.valueThreshold) {
    return { pass: false, action: 'ignored', score, reason: 'below value threshold' };
  }

  return {
    pass: true,
    action: sim.action === 'appended' ? 'appended' : 'created',
    score,
    existing: sim.existing,
  };
}

/**
 * 设计书要求「关键词重合 + LLM 判定（阈值 0.85）」。这里先实现确定性的那一半：
 * token Jaccard 重合度 + 显式矛盾启发式（同题上的否定翻转）。
 * 不做 LLM 判定是能力缺口，不是遗漏：见 README「已知边界」。
 */
export function compareByOverlap(
  qa: QAPair,
  candidates: KnowledgeItem[],
  threshold: number,
): SimilarVerdict {
  const qaTokens = new Set(tokenize(qa.question + '\n' + qa.answer));
  let best: { item: KnowledgeItem; ratio: number } | undefined;
  for (const item of candidates) {
    const ratio = jaccard(qaTokens, new Set(tokenize(item.title + '\n' + item.content)));
    if (!best || ratio > best.ratio) best = { item, ratio };
  }
  if (!best || best.ratio <= 0) return { action: 'new' };

  if (best.ratio >= threshold) {
    const contradicts =
      flipSignals(qa.answer) !== flipSignals(best.item.content) && best.ratio > 0.7;
    return contradicts
      ? { action: 'conflict', existing: best.item, ratio: best.ratio }
      : { action: 'duplicate', existing: best.item, ratio: best.ratio };
  }

  // 同题但内容明显更长的，作为对既有条目的追加，而不是新条目。
  if (best.ratio >= threshold * 0.6 && qa.answer.length > best.item.content.length) {
    return { action: 'appended', existing: best.item, ratio: best.ratio };
  }
  return { action: 'new', ratio: best.ratio };
}

/** 奇偶否定计数：同题结论相反时才可能是冲突，避免把「不」当冲突信号。 */
function flipSignals(text: string): 'affirm' | 'negate' {
  const negations = (text.match(/不|没有|无法|禁止|不能|cannot|not\b|never|no longer/gi) ?? []).length;
  return negations % 2 === 0 ? 'affirm' : 'negate';
}