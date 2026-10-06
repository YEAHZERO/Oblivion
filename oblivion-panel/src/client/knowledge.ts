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
}

/** 面板收到的笔记形状（`01_问答沉淀/*.md` 或 `04_会话整理/*.md`）。 */
export interface NoteLike {
  name?: string;
  path?: string;
  mtimeMs?: number;
  bytes?: number;
}

/** 一行的来源：有问答笔记 / 有会话整理笔记 / 仅入库。 */
export type KnowledgeSource = 'note' | 'digest' | 'item';

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

/**
 * 合成一栏。
 *
 * 匹配规则刻意保守：**只用「主题 == 笔记名」或「标题 == 笔记名」**（去扩展名、忽略大小写）。
 * 匹配不到就各成一行 —— 面板宁可多一行，也不把两个不相干的东西并到一起。
 */
export function mergeKnowledge(input: {
  notes?: NoteLike[] | null;
  digests?: NoteLike[] | null;
  items?: KnowledgeItemLike[] | null;
}): KnowledgeRow[] {
  const items = input.items ?? [];
  const consumed = new Set<number>();
  const rows: KnowledgeRow[] = [];

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
      ...matched.map((item) => num((item as { updated_at?: number }).updated_at)),
    ]);
    const primary = pickPrimary(matched);
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
