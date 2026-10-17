/**
 * **自动整理 · 作用域一**（`organize.digest`）：把「本会话已沉淀的问答」交给模型整理成一页会话整理。
 *
 * ## 为什么送进去的是「本会话的沉淀」而不是对话原文
 *
 * 这是本模块**最重要的诚实边界**。插件拿不到对话原文：
 *
 *   - `session/event` 流只被 `qa-loop` **按轮**消费（`TurnBuffer` 在 `turn/end` 用完即删），
 *     插件没有、也不打算长期留一份会话文本（那是**新的**隐私面与新的常驻内存 —— 不值）。
 *   - 插件手上真有的，是 `qa-loop` 已经**捕获进知识库**的问答（条目 `sources` 里带
 *     `<sessionId>#turn-<n>`）。
 *
 * 所以这条路整理的是**本会话的沉淀**，不是整场对话。整场对话的整理仍然由
 * **外层会话的模型**调 `oblivion_digest` 完成（它本来就把对话握在上下文里，那条路不变、
 * 也依然是完整版）。两条路的落盘共用 `DigestService.save()`。
 *
 * ## 与 `generate()` 的分工
 *
 * 本模块只做**纯逻辑**：拼 prompt、解析回话。发请求在 `organize/index.ts`（`generate()`），
 * 落盘在 `digest/index.ts`（`composeDigest` / `save`）。纯逻辑单独放，是为了能被 Node 直接测
 * ——「模型回话的容错解析」是最容易静默出错、又最值得钉死一段断言的地方。
 */

/** 送进 prompt 的每条答案片段上限。 */
export const DIGEST_EXCERPT_CHARS = 500;
/** 一次最多送几条问答（按时间取**最近**的这些）。 */
export const DIGEST_ITEMS_MAX = 24;
/** 整理页最多几节（模型多给了就截断，不写超长文档）。 */
export const DIGEST_SECTIONS_MAX = 6;
/** 整理标题长度上限（`composeDigest` 还会再做一次文件名消毒）。 */
export const DIGEST_TITLE_MAX = 40;

/** 送进 prompt 的一条沉淀（来自知识库条目，不是对话原文）。 */
export interface DigestSourceItem {
  /** 条目 id（提示词里回带，便于模型/人对照）。 */
  id: string;
  /** 条目标题（捕获时由问句派生）。 */
  title: string;
  /** 主题桶。 */
  topic: string;
  /** 答案片段（已截断、已压空白）。 */
  text: string;
}

/** 模型要回的那个 JSON 对象。 */
export interface DigestDraft {
  title: string;
  topic: string;
  sections: Array<{ heading: string; body: string }>;
  decisions: string[];
  todos: string[];
  openQuestions: string[];
}

/** 标题消毒：与 `organize/index.ts` 的 `cleanTitle` 同一套规则（剥 `#`、剥 `.md`、去文件系统非法字符）。 */
function cleanDigestTitle(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[#\s]+/, '')
    .replace(/\.md$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DIGEST_TITLE_MAX)
    .trim();
}

/** 短串消毒（topic / heading）：压空白 + 去非法字符 + 截断。 */
function cleanShort(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

/** 字符串数组消毒：丢掉空项、去重、截断。 */
function cleanList(input: unknown, max: number): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.replace(/\s+/g, ' ').trim();
    if (text === '' || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 拼提示词。
 *
 * 两处刻意的写法：
 *   ① system 里明说「这些是**已沉淀的问答**，不是对话原文」——否则模型会去描述
 *      「你们聊了什么」，而它看不到对话，只能编。
 *   ② 要求**只依据给出的内容**，没有的就给空数组 —— 整理件最怕的是看起来完整但其实编的。
 */
export function buildDigestPrompt(
  items: ReadonlyArray<DigestSourceItem>,
  sessionId: string,
): { system: string; prompt: string } {
  const system = [
    '你是中文知识库的整理助手：把一场会话里**已经沉淀进知识库的问答**，整理成一页「会话整理」。',
    '注意：你看到的不是对话原文，只是这场会话已经沉淀下来的问答片段（可能不全）。',
    '只输出一个 JSON 对象，不要解释、不要 Markdown 代码块围栏、不要多余文字。',
  ].join('\n');

  const blocks = items.slice(0, DIGEST_ITEMS_MAX).map((item, index) => {
    const lines = ['### ' + String(index + 1) + '. ' + (item.title === '' ? '（无标题）' : item.title)];
    lines.push('entry_id: ' + item.id);
    if (item.topic !== '') lines.push('topic: ' + item.topic);
    if (item.text !== '') lines.push('内容片段：' + item.text);
    return lines.join('\n');
  });

  const prompt = [
    '下面是这场会话已经沉淀进知识库的 ' + String(Math.min(items.length, DIGEST_ITEMS_MAX)) + ' 条问答' +
      (sessionId === '' ? '' : '（会话 ' + sessionId + '）') +
      '。请把它们整理成一页会话整理，输出 JSON 对象：',
    '',
    '{"title":"<标题>","topic":"<一个短词>","sections":[{"heading":"<小节标题>","body":"<这一节的内容>"}],"decisions":["<决策>"],"todos":["<待办>"],"openQuestions":["<未决问题>"]}',
    '',
    '规则：',
    '- `title`：一眼看出这场会话在做什么，不超过 ' + DIGEST_TITLE_MAX + ' 个字，不要 `.md` 后缀。',
    '- `sections`：2-' + DIGEST_SECTIONS_MAX + ' 节，每节 `heading` + `body`；`body` 写「这几条合起来说了什么」，',
    '  而不是逐条复述。',
    '- `decisions` / `todos` / `openQuestions`：没有就给**空数组**，不要硬凑。',
    '- **只依据下面给出的内容**写，不要补充你没看到的背景。',
    '- `topic`：一个短词，用来做文件桶名；拿不准就留空。',
    '',
    '已沉淀的问答：',
    blocks.join('\n\n'),
  ].join('\n');

  return { system, prompt };
}

/** 去掉围栏，取第一个 `{` 到最后一个 `}`。 */
function sliceJsonObject(text: string): string | null {
  const bare = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '').trim();
  const start = bare.indexOf('{');
  const end = bare.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return bare.slice(start, end + 1);
}

/**
 * 解析模型回话。
 *
 * **刻意比改名那条路严**：这里不搞「逐个对象抠回来」的救回模式。
 * 一页会话整理是一份**整体**文档（标题 + 多节 + 三个清单），救回半个只在一种情况下有意义
 * —— 那不如让它失败、把原话回带给人看，也不要落一篇看起来完整、其实是拼接的半成品。
 * 所以只有两种结果：**要么解析出一个可用的草稿，要么报错 + 原话**。
 */
export function parseDigestDraft(text: string): { draft: DigestDraft | null; error: string; raw?: string } {
  const sliced = sliceJsonObject(text);
  if (sliced === null) {
    return { draft: null, error: '模型回话里没有 JSON 对象（开头要有 `{`，结尾要有 `}`）', raw: text.slice(0, 400) };
  }
  let value: unknown;
  try {
    value = JSON.parse(sliced) as unknown;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { draft: null, error: 'JSON 解析失败：' + detail, raw: text.slice(0, 400) };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { draft: null, error: 'JSON 顶层不是对象', raw: text.slice(0, 400) };
  }

  const rec = value as Record<string, unknown>;
  const title = cleanDigestTitle(rec.title);
  if (title === '') {
    return { draft: null, error: '模型没给 `title`（或全是空白）', raw: text.slice(0, 400) };
  }

  const rawSections = Array.isArray(rec.sections) ? rec.sections : [];
  const sections: Array<{ heading: string; body: string }> = [];
  for (const item of rawSections) {
    if (item === null || typeof item !== 'object') continue;
    const section = item as Record<string, unknown>;
    const heading = cleanShort(section.heading, 60);
    const body = typeof section.body === 'string' ? section.body.replace(/\r\n/g, '\n').trim() : '';
    if (body === '') continue;
    sections.push({ heading: heading === '' ? '要点' : heading, body });
    if (sections.length >= DIGEST_SECTIONS_MAX) break;
  }
  if (sections.length === 0) {
    return { draft: null, error: '`sections` 为空（没有一节有正文）', raw: text.slice(0, 400) };
  }

  return {
    draft: {
      title,
      topic: cleanShort(rec.topic, 24),
      sections,
      decisions: cleanList(rec.decisions, 10),
      todos: cleanList(rec.todos, 10),
      openQuestions: cleanList(rec.openQuestions, 10),
    },
    error: '',
  };
}
