/**
 * 把「条目」与「笔记」合成**一栏**（所有者 2026-10-06 裁定，方案 A）。
 *
 * ## 为什么要合
 *
 * 原来面板并列两栏：「最近沉淀」读条仓库（`<dataRoot>/ts-*.json`），「知识库笔记」读磁盘
 * （`01_问答沉淀/*.md`）。绝大多数情况下两者一一对应 ⇒ 同一批标题被列了两遍，看起来就是冗余。
 * 但条目栏又不是真的多余 —— 它独有三件事：
 *
 *   1. **降级版本**：同主题出新版时旧条目转 `superseded`（不删），而笔记按主题只有一篇；
 *   2. **没有笔记的条目**：`oblivion_digest` 的笔记落在 `04_会话整理/`，还有些条目主题没落成文件；
 *   3. **结构化字段**：`status`（active/superseded/…）、`impl`（已落地/仅设计/占位）、版本数。
 *
 * 所以合并的规则是：**以笔记为骨架**（能点开、名字是人写的），把同主题条目的状态与版本挂在它后面；
 * 找不到笔记的条目**补成额外一行**并标注来源（会话整理 / 仅入库）。一栏之内既看得到文件，
 * 也看得到版本与分歧，不再有两份标题。
 *
 * 本文件是**纯函数**（不碰 DOM、不引 `node:`），因此 `lib/testkit.js` 能在 Node 里直接断言它。
 */

/** 面板收到的条目形状（Node 半边 `ItemRow` 的宽松视图）。 */
export interface KnowledgeItemLike {
  id?: string;
  topic?: string;
  title?: string;
  created_at?: number;
  status?: string;
  /** 落地状态（core 0.1.11 起）：`implemented` / `designed` / `placeholder`。 */
  impl?: string;
  version?: number;
  /** 累计来源条数（core 的 `sources.length`）。 */
  sources?: number;
  /** 来源类型（`session` / `digest` / …），用来判断是不是会话整理件。 */
  sourceTypes?: string[];
  /** 关键词（条目 JSON 的 `tags`）。 */
  tags?: string[];
  /** 最后更新时间（epoch ms）—— 笔记没写日期时用它。 */
  updated_at?: number;
}

/**
 * 面板收到的笔记形状（`01_问答沉淀/*.md` 或 `04_会话整理/*.md`）。
 *
 * 后四个字段是 0.0.14 加的：所有者要「每个文档下方显示：相关主题和关键词、日期」，
 * 而这三样本来只在 **md 文件头部**（frontmatter + `>Date/>Tags/> Wiki：` 元信息行）——
 * 宿主半边解析好再发过来（浏览器半边碰不到磁盘）。
 */
export interface NoteLike {
  name?: string;
  path?: string;
  mtimeMs?: number;
  bytes?: number;
  /** 关键词（笔记 frontmatter 的 `tags`）。 */
  tags?: string[];
  /** `YYYY-MM-DD`（frontmatter 的 `created_at`／`>Date :` 行）。 */
  createdAt?: string;
  /** `YYYY-MM-DD`（frontmatter 的 `updated_at`／`>Date :` 行）。 */
  updatedAt?: string;
  /** 归并到的主题页标题（`> Wiki： [[标题]]` 等）。 */
  wiki?: string[];
}

/** 主题页（`02_Wiki页面/*.md`）：只用来把「相关主题」的标题解析成可点开的路径。 */
export interface WikiPageLike {
  name?: string;
  path?: string;
}

/** 一行的来源：有问答笔记 / 有会话整理笔记 / 仅入库。 */
export type KnowledgeSource = 'note' | 'digest' | 'item';

/** 归并到的主题页：标题 + （能解析到时）可点开的路径。 */
export interface KnowledgePage {
  title: string;
  path?: string;
}

export interface KnowledgeRow {
  /** 稳定 key（笔记路径或条目 topic）。 */
  key: string;
  /** 显示名：笔记去掉 `.md`，没有笔记就用条目标题。 */
  title: string;
  /** 有笔记才有：点它走 `onOpenFile`。 */
  notePath?: string;
  /** 排序与显示用的时间（笔记 mtime 或条目 created_at）。 */
  at: number;
  source: KnowledgeSource;
  /** 代表性条目的状态（`active` / `superseded` / …）；没有对应条目则为空串。 */
  status: string;
  /** 代表性条目的落地状态；没有则为空串。 */
  impl: string;
  /** 同主题条目数（>1 表示这个主题有多版）。 */
  versions: number;
  /** 代表性条目的 id（排查用）。 */
  itemId: string;
  /** 代表性条目累计的来源条数。 */
  sources: number;
  /** 主题（条目里的 `topic`）。 */
  topic: string;
  /** 关键词（笔记 tags ∪ 同主题条目的 tags，去重、保持出现顺序）。 */
  tags: string[];
  /** 归并到的主题页（来自笔记里的回链；条目行没有）。 */
  wiki: KnowledgePage[];
  /**
   * 笔记自己写的日期（`updated_at` 优先，退化 `created_at`）；笔记没写就是空串。
   * 显示时用 `dateText()`：空串按 `at` 折算成本地日期。
   */
  date: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 条目状态说人话（core 的 `ItemStatus`）。 */
export function itemStatusLabel(status: unknown): string {
  switch (text(status)) {
    case 'active':
      return '当前版本';
    case 'superseded':
      return '已被新版取代';
    case 'draft':
      return '草稿';
    case 'conflict':
      return '有冲突';
    case 'archived':
      return '已归档';
    case '':
      return '';
    default:
      return String(status);
  }
}

/** 落地状态说人话（core 的 `ImplStatus`）。 */
export function implLabel(impl: unknown): string {
  switch (text(impl)) {
    case 'implemented':
      return '已落地';
    case 'designed':
      return '仅设计';
    case 'placeholder':
      return '占位';
    case '':
      return '';
    default:
      return String(impl);
  }
}

/** 行的来源标注。 */
export function sourceLabel(source: KnowledgeSource): string {
  switch (source) {
    case 'note':
      return '';
    case 'digest':
      return '会话整理';
    case 'item':
      return '仅入库';
  }
}

/** `查看这个.md` → `查看这个`。 */
function baseName(name: unknown): string {
  return text(name).replace(/\.md$/i, '');
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

/** 这一行的时间取「最近的动静」：笔记 mtime 与条目时间取大者。 */
function latest(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

/** 一行里最多显示几个关键词 / 几个主题页（其余折成 `+N`）—— 面板是窄栏，宁可少而清楚。 */
export const KEYWORD_MAX = 5;
export const WIKI_MAX = 2;

/** 收一份字符串数组：去空、去重、保序（宿主发过来的都是 `unknown`，别信形状）。 */
function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const item = text(entry);
    if (item !== '' && !items.includes(item)) items.push(item);
  }
  return items;
}

/**
 * 合成一栏。
 *
 * 匹配规则刻意保守：**只用「主题 == 笔记名」或「标题 == 笔记名」**（去扩展名、忽略大小写）。
 * 匹配不到就各成一行 —— 面板宁可多一行，也不把两个不相干的东西并到一起。
 *
 * 0.0.14 起每行还带「相关主题 / 关键词 / 日期」（所有者要求显示在每个文档下方）：
 * 关键词 = 笔记 tags ∪ 同主题条目 tags；日期 = 笔记自己写的（没写就留空，渲染时按 `at` 折算）；
 * 相关主题 = 笔记里 `> Wiki： [[标题]]` 的回链，用主题页列表把标题**解析成可点开的路径**。
 */
export function mergeKnowledge(input: {
  notes?: NoteLike[] | null;
  digests?: NoteLike[] | null;
  /** 主题页列表：只为把回链的标题解析成路径（没有它也能显示标题）。 */
  wikis?: WikiPageLike[] | null;
  items?: KnowledgeItemLike[] | null;
}): KnowledgeRow[] {
  const items = input.items ?? [];
  const consumed = new Set<number>();
  const rows: KnowledgeRow[] = [];

  // 主题页字典：标题（去扩展名、忽略大小写）→ 路径。
  const pages = new Map<string, string>();
  for (const page of input.wikis ?? []) {
    const name = lower(baseName(page.name));
    const path = text(page.path);
    if (name !== '' && path !== '' && !pages.has(name)) pages.set(name, path);
  }

  const collect = (note: NoteLike, source: KnowledgeSource): void => {
    const base = lower(baseName(note.name));
    if (base === '') return;
    const matched: KnowledgeItemLike[] = [];
    items.forEach((item, index) => {
      if (consumed.has(index)) return;
      if (lower(item.topic) === base || lower(item.title) === base) {
        consumed.add(index);
        matched.push(item);
      }
    });
    const at = latest([
      num(note.mtimeMs),
      ...matched.map((item) => num(item.created_at)),
      ...matched.map((item) => num(item.updated_at)),
    ]);
    const primary = pickPrimary(matched);
    const tags = textList(note.tags);
    for (const item of matched) {
      for (const tag of textList(item.tags)) if (!tags.includes(tag)) tags.push(tag);
    }
    rows.push({
      key: text(note.path) !== '' ? text(note.path) : base,
      title: baseName(note.name),
      notePath: text(note.path) !== '' ? text(note.path) : undefined,
      at,
      source,
      status: text(primary?.status),
      impl: text(primary?.impl),
      versions: matched.length,
      itemId: text(primary?.id),
      sources: num(primary?.sources),
      topic: text(primary?.topic),
      tags,
      wiki: textList(note.wiki).map((title) => {
        const path = pages.get(lower(title));
        return path === undefined ? { title } : { title, path };
      }),
      date: text(note.updatedAt) !== '' ? text(note.updatedAt) : text(note.createdAt),
    });
  };

  for (const note of input.notes ?? []) collect(note, 'note');
  for (const note of input.digests ?? []) collect(note, 'digest');

  // 剩下的条目：按 topic 归组（同主题的多版本来回一行），没有 topic 就退回标题。
  const groups = new Map<string, { key: string; items: KnowledgeItemLike[] }>();
  items.forEach((item, index) => {
    if (consumed.has(index)) return;
    const topic = text(item.topic);
    const title = text(item.title);
    const groupKey = lower(topic !== '' ? topic : title);
    if (groupKey === '') return;
    const bucket = groups.get(groupKey);
    if (bucket === undefined) groups.set(groupKey, { key: topic !== '' ? topic : title, items: [item] });
    else bucket.items.push(item);
  });

  for (const { key, items: members } of groups.values()) {
    const primary = pickPrimary(members);
    const tags: string[] = [];
    for (const item of members) {
      for (const tag of textList(item.tags)) if (!tags.includes(tag)) tags.push(tag);
    }
    rows.push({
      key: 'item:' + key,
      title: text(primary?.title) !== '' ? text(primary?.title) : key,
      at: latest(members.map((item) => num(item.created_at))),
      source: isDigest(primary) ? 'digest' : 'item',
      status: text(primary?.status),
      impl: text(primary?.impl),
      versions: members.length,
      itemId: text(primary?.id),
      sources: num(primary?.sources),
      topic: text(primary?.topic),
      tags,
      // 没有笔记文件就没有回链可解析；日期留空，渲染时按 `at` 折算。
      wiki: [],
      date: '',
    });
  }

  // 一行一行的排序：最近动静在前；同一时间按标题稳定排序，避免刷新时跳动。
  return rows.sort((left, right) => right.at - left.at || left.title.localeCompare(right.title));
}

/** 代表性条目：优先「当前版本」，否则取最新的一版。 */
function pickPrimary(items: KnowledgeItemLike[]): KnowledgeItemLike | undefined {
  if (items.length === 0) return undefined;
  const active = items.filter((item) => text(item.status) === 'active' || text(item.status) === '');
  const pool = active.length > 0 ? active : items;
  return pool.reduce((best, item) => (num(item.created_at) >= num(best.created_at) ? item : best));
}

/** 是不是 `oblivion_digest` 产出的条目（来源里带 `digest`）。 */
function isDigest(item: KnowledgeItemLike | undefined): boolean {
  return (item?.sourceTypes ?? []).some((type) => lower(type) === 'digest');
}

/**
 * 「文档下方」那一行的三段：相关主题 / 关键词 / 日期。
 *
 * 拆成 parts 而不是拼一个字符串，是因为**相关主题要能点开**（Panel 渲染成链接）；
 * `detailText()` 是它的纯文本形态，供测试与自检直接断言。
 */
export interface DetailPart {
  label: string;
  text: string;
  /** 只有「相关主题」带：可点开的主题页（**已经按 `WIKI_MAX` 截断**，多余的只体现在 `text` 的 `+N` 里）。 */
  wiki?: KnowledgePage[];
}

/** `#a #b +2`（多于 `KEYWORD_MAX` 折成 `+N`）；没有关键词就是空串。 */
export function keywordText(row: KnowledgeRow): string {
  const tags = textList(row.tags);
  if (tags.length === 0) return '';
  const shown = tags.slice(0, KEYWORD_MAX).map((tag) => '#' + tag.replace(/^#+/, ''));
  const rest = tags.length - shown.length;
  return shown.join(' ') + (rest > 0 ? ' +' + rest : '');
}

/** `主题页甲、主题页乙`（多于 `WIKI_MAX` 折成 `+N`）；没有主题页就是空串。 */
export function wikiText(row: KnowledgeRow): string {
  const pages = (row.wiki ?? []).filter((page) => text(page.title) !== '');
  if (pages.length === 0) return '';
  const shown = pages.slice(0, WIKI_MAX).map((page) => text(page.title));
  const rest = pages.length - shown.length;
  return shown.join('、') + (rest > 0 ? ' +' + rest : '');
}

/** `2026-10-06`：优先笔记自己写的日期，否则把 `at` 折算成本地日期（没有时间就是空串）。 */
export function dateText(row: KnowledgeRow): string {
  const written = text(row.date);
  if (written !== '') return written;
  if (!Number.isFinite(row.at) || row.at <= 0) return '';
  const at = new Date(row.at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate());
}

/** 「文档下方」那一行的分段；缺一段就不给那一段（不拿「暂无」凑数）。 */
export function detailParts(row: KnowledgeRow): DetailPart[] {
  const parts: DetailPart[] = [];
  const wiki = wikiText(row);
  parts.push({ label: '相关主题', text: wiki !== '' ? wiki : '未归并', wiki: (row.wiki ?? []).slice(0, WIKI_MAX) });
  const tags = keywordText(row);
  if (tags !== '') parts.push({ label: '关键词', text: tags });
  const date = dateText(row);
  if (date !== '') parts.push({ label: '日期', text: date });
  return parts;
}

/** 上面那一段的纯文本形态：`相关主题：X · 关键词：#a #b · 日期：2026-10-06`。 */
export function detailText(row: KnowledgeRow): string {
  return detailParts(row)
    .map((part) => part.label + '：' + part.text)
    .join(' · ');
}

/** 「仅入库」默认显示几条（其余按需展开）—— 与「最近判定」同一个取舍。 */
export const KNOWLEDGE_ITEM_LIMIT = 5;

/** 默认视图的切分结果（纯数据，便于自检与测试）。 */
export interface KnowledgeView {
  /** 有笔记的行（问答沉淀 / 会话整理）—— 能点开的是这些。 */
  backbone: KnowledgeRow[];
  /** 只有条目、没有笔记文件的行（仅入库）。 */
  itemOnly: KnowledgeRow[];
  /** 实际要渲染的行（**保持原顺序**）。 */
  visible: KnowledgeRow[];
  /** 被折叠掉的行数。 */
  hidden: number;
}

function hasNote(row: KnowledgeRow): boolean {
  return typeof row.notePath === 'string' && row.notePath !== '';
}

/**
 * 默认视图：**有笔记的行全部显示，「仅入库」只显示最近几条**。
 *
 * 为什么（实测 2026-10-06）：本机 65 个条目合成 **47 行**，其中 36 行是「仅入库」
 * （没有笔记文件的纯条目）—— 一屏列表里它们把真正能点开的笔记挤到看不见。
 * 所有者对「最近判定」的裁定是同一句话（「不需要这么多」），所以这里照同一取舍办：
 * 默认少量 + 一个展开按钮。展开时**顺序完全不变**（按原数组过滤、不重排），
 * 免得折叠与展开之间位置跳动。
 */
export function knowledgeView(
  rows: KnowledgeRow[],
  options: { itemLimit?: number; showAll?: boolean } = {},
): KnowledgeView {
  const limit = Math.max(0, Math.floor(options.itemLimit ?? KNOWLEDGE_ITEM_LIMIT));
  const backbone: KnowledgeRow[] = [];
  const itemOnly: KnowledgeRow[] = [];
  for (const row of rows) (hasNote(row) ? backbone : itemOnly).push(row);
  if (options.showAll === true) {
    return { backbone, itemOnly, visible: rows.slice(), hidden: 0 };
  }
  const keep = new Set(itemOnly.slice(0, limit).map((row) => row.key));
  const visible = rows.filter((row) => hasNote(row) || keep.has(row.key));
  return { backbone, itemOnly, visible, hidden: rows.length - visible.length };
}
