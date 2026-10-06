import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { GraphService } from '../graph/index.js';
import type { KnowledgeService } from '../knowledge/index.js';
import type { QAPair, ImplStatus, ItemStatus, Source } from '../types.js';
import { expandHome } from '../util/paths.js';
import { shortHash } from '../util/hash.js';
import { isoDate, now } from '../util/time.js';
import { safeDirName, writeIndexNote } from '../qa-loop/md-writer.js';

/**
 * **会话整理**（`oblivion_digest`）。
 *
 * ## 为什么摘要由模型做、插件只负责落盘
 *
 * 要「整理当前对话」，必须有人读懂整场对话。模型**本来就把对话握在上下文里**，
 * 它是天然的摘要器；而插件去调 LLM（`ctx.llm`）既要新的授权面，又要重放整段历史，
 * 还得处理失败重试 —— 收益全是重复劳动。
 *
 * 所以分工是：**模型产出结构（sections / decisions / todos / open questions / links），
 * 插件负责把这套结构落成两样东西**：
 *   ① 一篇人读的整理笔记 `<mdRoot>/04_会话整理/<日期>-<标题>.md`
 *   ② 一条可检索的知识条目（进 JSON 库、进共现图、能被 `oblivion_query` 查到）
 *
 * ## 为什么绕过四层筛选
 *
 * 四层筛选是给**自动捕获**用的（防噪声、防重复、防回灌）。整理是**用户显式要求**的动作，
 * 不该被 L3「答案太短」或 L4 价值分挡掉 —— 所以走 `knowledge.saveStructured()` 直写。
 */

export interface DigestSection {
  heading: string;
  body: string;
}

/** 会话整理件的**建边文本预算**（字符）：超过这个长度的部分不参与实体抽取，见 `save()` 的说明。 */
export const DIGEST_EDGE_TEXT_BUDGET = 1200;

export interface DigestInput {
  title: string;
  /** 主题桶（决定笔记文件名与条目 topic）；缺省从 title 派生。 */
  topic?: string;
  sections: DigestSection[];
  decisions?: string[];
  todos?: string[];
  openQuestions?: string[];
  /** 关联条目 id 或笔记名，写成 `[[…]]` 互链。 */
  links?: string[];
  /** 会话标识（模型可传；不传就是本机整理）。 */
  sessionId?: string;
  /** 落地状态（默认 implemented）。 */
  impl?: ImplStatus;
  /** 版本状态（默认 active）。 */
  status?: ItemStatus;
}

export interface DigestComposition {
  markdown: string;
  fileName: string;
  title: string;
  topic: string;
  sections: number;
}

export interface DigestResult extends DigestComposition {
  id: string;
  notePath: string;
  itemId: string;
  /** 建边用到的实体数（来自 graph 的抽取）。 */
  entities: number;
}

export interface DigestService {
  compose(input: DigestInput, at?: number): DigestComposition;
  save(input: DigestInput): Promise<DigestResult>;
}

/** 文件名消毒：与 md-writer 对笔记名同一套规则（不含路径分隔符，长度有上限）。 */
export function safeFileName(input: string): string {
  const cleaned = (input || 'untitled').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'untitled').slice(0, 80);
}

function bulletList(items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  return items.map((item) => '- ' + String(item).trim()).join('\n');
}

/** 从标题派生主题桶：取第一个像词的片段。 */
function deriveTopic(title: string): string {
  const m = title.match(/[\p{L}\p{N}_-]{2,20}/gu);
  return m?.[0] ?? 'untitled';
}

/**
 * 组装整理笔记（纯函数：给定输入与时间，输出确定的 markdown 与文件名）。
 *
 * 结构刻意固定：模型不必猜格式，人也能一眼扫完 —— 结论 / 决策 / 待办 / 未决 / 关联。
 */
export function composeDigest(input: DigestInput, at: number = now()): DigestComposition {
  const title = (input.title || '未命名整理').trim();
  const topic = (input.topic ?? deriveTopic(title)).trim() || 'untitled';
  const sections = Array.isArray(input.sections) ? input.sections : [];

  const parts: string[] = [];
  const status = input.status ?? 'active';
  const impl = input.impl ?? 'implemented';
  // YAML frontmatter：让「这份整理是现行还是草稿、落地到什么程度」自带答案（盲区修正）。
  parts.push('---');
  parts.push('title: ' + JSON.stringify(title));
  parts.push('topic: ' + JSON.stringify(topic));
  parts.push('source: "session_digest"');
  parts.push('session: ' + JSON.stringify(input.sessionId ?? ''));
  parts.push('created_at: ' + JSON.stringify(isoDate(at)));
  parts.push('tags: ["会话整理"' + (input.todos?.length ? ', "待办"' : '') + (input.decisions?.length ? ', "决策"' : '') + ']');
  parts.push('status: ' + JSON.stringify(status));
  parts.push('impl: ' + JSON.stringify(impl));
  parts.push('---');
  parts.push('');
  parts.push('# ' + title);
  parts.push('');
  parts.push('>Date :  ' + isoDate(at));
  parts.push('>Source：Oblivion · 会话整理');
  if (input.sessionId) parts.push('>Session：' + input.sessionId);
  parts.push('>Topic： ' + topic);
  parts.push('');

  for (const section of sections) {
    const heading = (section.heading || '要点').trim();
    parts.push('## ' + heading);
    parts.push('');
    parts.push(String(section.body ?? '').trim());
    parts.push('');
  }

  const decisions = bulletList(input.decisions);
  if (decisions) {
    parts.push('## 决策');
    parts.push('');
    parts.push(decisions);
    parts.push('');
  }

  const todos = bulletList(input.todos);
  if (todos) {
    parts.push('## 待办');
    parts.push('');
    parts.push(todos);
    parts.push('');
  }

  const open = bulletList(input.openQuestions);
  if (open) {
    parts.push('## 未决问题');
    parts.push('');
    parts.push(open);
    parts.push('');
  }

  const links = (input.links ?? []).filter((l) => String(l).trim() !== '');
  if (links.length) {
    parts.push('## 关联知识');
    parts.push('');
    parts.push(links.map((link) => '- [[' + String(link).trim().replace(/^\[\[|\]\]$/g, '') + ']]').join('\n'));
    parts.push('');
  }

  // 幂等连接键：同一篇笔记重复落盘不会生成第二份（与 md-writer 同一约定）。
  parts.push('<!-- oblivion:digest id=pending version=1 -->');
  parts.push('');

  return {
    markdown: parts.join('\n'),
    fileName: isoDate(at) + '-' + safeFileName(title) + '.md',
    title,
    topic,
    sections: sections.length,
  };
}

export function registerDigest(
  ctx: AppContext,
  config: Config,
  deps: { knowledge: KnowledgeService; graph: GraphService },
): DigestService {
  const mdRoot = expandHome(config.mdRoot);
  const classDir = safeDirName(config.mdClassify?.session_digest ?? '04_会话整理') || '04_会话整理';

  async function save(input: DigestInput): Promise<DigestResult> {
    const at = now();
    const composed = composeDigest(input, at);

    // ① 条目先落库（拿到 id 后回填到笔记标记里，两边用同一个 id 对齐）
    const ref = (input.sessionId ?? 'local') + '#digest-' + isoDate(at);
    const sources: Source[] = [{ type: 'session', ref, hash: shortHash(ref) }];
    const item = await deps.knowledge.saveStructured({
      title: composed.title,
      topic: composed.topic,
      content: composed.markdown,
      tags: ['会话整理', ...(input.todos?.length ? ['待办'] : []), ...(input.decisions?.length ? ['决策'] : [])],
      sources,
      impl: input.impl ?? 'implemented',
      status: input.status ?? 'active',
    });

    const markdown = composed.markdown.replace('id=pending', 'id=' + item.id);
    const dir = join(mdRoot, classDir);
    await mkdir(dir, { recursive: true });
    const notePath = join(dir, composed.fileName);
    const existing = await readFile(notePath, 'utf8').catch(() => '');
    if (existing.includes('oblivion:digest id=' + item.id)) {
      // 同一天同标题重复整理：不覆盖，追加一节（保历史，不静默丢）
      await writeFile(notePath, existing.trimEnd() + '\n\n---\n\n' + markdown, 'utf8');
    } else {
      await writeFile(notePath, markdown, 'utf8');
    }

    // ② 共现建边（用整理正文当一次「问答」文本，走同一套实体抽取 + 权重规则）
    //
    // **建边限流（保留"主题相邻"信号、砍掉噪声）**：整理文本长且跨主题，实测一次整理
    // 抽出 ~24 个实体 → C(24,2) = **276 条边**，等于在共现图里塞了一个全连接团，
    // 反而把"同一次问答里真正相邻的两个概念"这个信号淹没了。
    // 做法：**按文本预算限流** —— 只把前 `DIGEST_EDGE_TEXT_BUDGET` 个字符喂给实体抽取
    // （摘要在前、越往后越是细节），于是实体数与边数都随正文长度**有界**。
    // 不引入新配置键：这是"整理件天生跨主题"的固有属性，不是可调偏好。
    const edgeText = markdown.slice(0, DIGEST_EDGE_TEXT_BUDGET);
    const qa: QAPair = {
      question: composed.title,
      answer: edgeText,
      sources,
      sessionId: input.sessionId ?? 'local',
      turn: 0,
      capturedAt: at,
    };
    let entities = 0;
    try {
      entities = await deps.graph.recordCooccurrence(qa);
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' 整理建边失败（不影响落盘）：%o', error);
    }

    // 索引页同步重建（只放指针，权威内容在条目里）
    try {
      await writeIndexNote(mdRoot, deps.knowledge.index.all());
    } catch (error) {
      ctx.logger?.warn?.(config.logPrefix + ' 索引重建失败：%o', error);
    }

    return {
      ...composed,
      id: item.id,
      itemId: item.id,
      notePath,
      entities: typeof entities === 'number' ? entities : 0,
    };
  }

  ctx.effect(() => () => {
    // 纯文件写入，没有常驻状态需要清理。
  }, 'oblivion-core: digest teardown');

  return { compose: composeDigest, save };
}
