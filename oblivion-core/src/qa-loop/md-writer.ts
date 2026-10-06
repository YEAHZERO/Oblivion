import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { join } from 'node:path';
import type { KnowledgeItem } from '../types.js';
import { isoDate } from '../util/time.js';
import { isWeakTitle } from '../knowledge/naming.js';

export type MdAction = 'created' | 'appended' | 'duplicate' | 'conflict';

export interface MdPayload {
  action: MdAction;
  /** `conflict` 分支没有 item（筛选没放行），只有双方内容。 */
  item?: KnowledgeItem;
  /** 仅 duplicate 分支使用：被补进来的来源。 */
  mergedSource?: { type: string; ref: string };
  /** 仅 conflict 分支使用：新问题/新答案与既有条目。 */
  conflict?: {
    question: string;
    answer: string;
    existingId: string;
    existingTitle: string;
    reason?: string;
    topic?: string;
  };
}

/** 分类映射：来源类型 → mdRoot 下的子目录（设计书 §25.3）。 */
export type MdClassifyMap = Readonly<Record<string, string>>;

/** §25.3 兜底目录：不匹配任何规则的知识落这里。 */
export const MD_FALLBACK_DIR = '99_其他';

/**
 * 目录名消毒：配置里的分类目录**不允许逃出 mdRoot**。
 * 去掉盘符/前导分隔符、`..` 片段与非法字符；结果为空则视为未配置。
 */
export function safeDirName(input: string): string {
  const cleaned = String(input ?? '')
    .replace(/^[a-zA-Z]:/, '')
    .split(/[\\/]+/)
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .map((seg) => seg.replace(/[<>:"|?*]/g, '_').trim())
    .filter((seg) => seg !== '')
    .join('/');
  return cleaned;
}

/** 配置里声明过（或兜底）的全部分类目录名，去重且已消毒。 */
export function mdDirNames(map: MdClassifyMap | undefined): string[] {
  const names: string[] = [MD_FALLBACK_DIR];
  if (map) {
    for (const value of Object.values(map)) {
      const dir = safeDirName(value);
      if (dir !== '' && !names.includes(dir)) names.push(dir);
    }
  }
  return names;
}

/**
 * **装载即建目录**：`mdRoot` 一经配置，就把知识库根与全部分类目录创建出来。
 *
 * 为什么不等第一次落盘再建：所有者要求「一旦定义后就自动创建 `01_问答沉淀\` 等」——
 * 目录先就位，用户马上能在知识库里看到落点，也避免首次捕获时才暴露权限问题。
 *
 * 幂等（`recursive: true`）、非阻塞（调用方 fire-and-forget + 失败只记日志）、
 * 不做任何删除：只创建，不动已有内容。
 *
 * @returns 已确保存在的目录绝对路径列表。
 */
export async function ensureMdDirs(root: string, map?: MdClassifyMap): Promise<string[]> {
  await mkdir(root, { recursive: true });
  const dirs = mdDirNames(map);
  for (const dir of dirs) {
    await mkdir(join(root, dir), { recursive: true });
  }
  return dirs.map((dir) => join(root, dir));
}

/**
 * 取分类目录。
 *
 * 依次看条目的来源类型，命中第一条有映射的就用它；都没有则落 `99_其他/`（§25.3 兜底）。
 */
export function classifyDir(item: KnowledgeItem, map: MdClassifyMap | undefined): string {
  if (map) {
    for (const source of item.sources) {
      const dir = map[source.type];
      if (typeof dir === 'string' && dir.trim() !== '') return safeDirName(dir) || MD_FALLBACK_DIR;
    }
  }
  return MD_FALLBACK_DIR;
}

function safeName(topic: string): string {
  const cleaned = (topic || 'untitled')
    .replace(/[\\/:*?"<>|]/g, '_')
    // 首尾的点/空格是**实际踩过的坑**：模型给的名字是「.gitignore 整棵忽略 + 搜索插件分工」，
    // 落成的文件以 `.` 开头 ⇒ `listNotes()`（有意跳过点开头文件）再也看不到它，
    // 面板不显示、改名工具找不到（`note-not-found`）。Windows 还会吃掉结尾的点与空格。
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 80)
    .trim();
  return cleaned === '' ? 'untitled' : cleaned;
}

/**
 * 笔记文件名取自**标题**（内容名，core 0.2.1 起由 `knowledge/naming.ts` 生成），
 * 标题**弱**（纯应答，如「继续」「不行」）或没有标题时才退回 `topic`。
 *
 * 为什么不用 `topic`：`topic` 的语义是「主题桶」（用来聚合同一主题的多版、给索引分组），
 * 它是「问句里第一个词串」，于是文件名长成了 `查看这个方案.md`、`我的0.md`
 * —— 所有者 2026-10-06：「命名上看不出是什么内容，单纯只是我的问题的简写而已」。
 * 标题才是「这里讲了什么」，`topic` 继续管分组，两件事各归各位。
 */
export function fileNameOf(item: { title?: string; topic?: string }): string {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
  // 名字弱（「继续」「不行」「已重启」）时**宁可退回 topic**：改名不能把名字改得更差。
  // 回填实测：`untitled.md → 继续.md`、`还是不行.md → 不行.md` 就是没有这条守卫的后果。
  if (title !== '' && !isWeakTitle(title)) return safeName(title);
  if (topic !== '' && !isWeakTitle(topic)) return safeName(topic);
  // 两个都弱（`继续` + `untitled`）时**守住 topic**：这一个分支上「不动」优于「改名」，
  // 因为弱名字之间没有信息差，改名只会让既有笔记的路径漂移。
  if (topic !== '') return safeName(topic);
  return safeName(title !== '' ? title : 'untitled');
}

const ID_MARKER = 'oblivion:';

/**
 * YAML frontmatter（盲区修正的核心）。
 *
 * 起因是一次真实的口径漂移：同一主题在文档里有 26 / 28 / 3 三个版本，读的人无法判断哪个是权威。
 * 解法不是"记得更新"，而是**让每个条目自己带状态**：
 *   - `status`：`active` / `superseded` / `draft` / `conflict` / `archived`
 *   - `impl`：`implemented` / `designed` / `placeholder`
 *   - `supersedes` / `superseded_by`：版本链
 * Obsidian 与大多数 Markdown 工具都能直接读 frontmatter，因此这一步同时让知识库对**人**和**机器**都可判读。
 */
export function renderFrontmatter(item: KnowledgeItem, extra: Record<string, string | string[]> = {}): string {
  const lines: string[] = ['---'];
  const push = (key: string, value: string | string[] | undefined): void => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      lines.push(key + ': [' + value.map((v) => JSON.stringify(v)).join(', ') + ']');
      return;
    }
    lines.push(key + ': ' + JSON.stringify(value));
  };

  push('title', item.title);
  push('topic', item.topic);
  push('source', item.sources[0]?.type ?? 'session');
  push('ref', item.sources[0]?.ref ?? '');
  push('created_at', isoDate(item.created_at));
  push('updated_at', isoDate(item.updated_at));
  push('tags', item.tags);
  push('status', item.status);
  push('impl', item.impl ?? 'implemented');
  if (item.supersededBy) push('superseded_by', item.supersededBy);
  for (const [key, value] of Object.entries(extra)) push(key, value);
  lines.push('---');
  return lines.join('\n');
}

/** 新条目渲染。`<!-- oblivion:id=… -->` 是幂等连接键：同一个 id 重复落盘不会生成第二份。 */
function renderNew(item: KnowledgeItem): string {
  const tags = item.tags.map((t) => '#' + t).join(' ');
  const sources = item.sources.map((s) => '- `' + s.type + '`: ' + s.ref).join('\n');
  const note = item.content.replace(/\s+/g, ' ').slice(0, 100);
  return [
    renderFrontmatter(item, { related_wiki: [] }),
    '',
    '# ' + item.title,
    '',
    '>Date :  ' + isoDate(item.created_at),
    '>Source：Oblivion',
    '>Note：' + note,
    '>Tags： ' + tags,
    '',
    '## 内容',
    '',
    item.content,
    '',
    '## 来源',
    '',
    sources,
    '',
    '<!-- oblivion:id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
}

/**
 * 冲突页渲染（`50-Conflicts/`）。
 *
 * 设计铁律：**冲突不合并**。新旧两版都留，页面上并列，让读者自己判断 ——
 * 静默合并是知识库最不可逆的一种损坏。
 */
export function renderConflict(payload: MdPayload, at: number): string {
  const c = payload.conflict;
  if (!c) return '';
  return [
    '# 冲突：' + (c.topic || c.question.slice(0, 40)),
    '',
    '>Detected：' + isoDate(at),
    '>Source：Oblivion · 冲突记录',
    '>Policy：**不合并**，两个版本都保留',
    c.reason ? '>Reason：' + c.reason : '',
    '',
    '## 新（未入库）',
    '',
    '**Q**：' + c.question,
    '',
    c.answer,
    '',
    '## 旧（已在库）',
    '',
    '- 条目：`' + c.existingId + '`',
    '- 标题：' + c.existingTitle,
    '',
    '<!-- oblivion:conflict with=' + c.existingId + ' at=' + at + ' -->',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * 索引页（`00-Index/索引.md`）：**只放指针，不放正文**。
 *
 * 这是盲区修正的另一半 —— 权威内容只在条目里，索引负责"一眼看清有哪些、什么状态"。
 */
export function renderIndex(entries: KnowledgeItem[], at: number): string {
  const byTopic = new Map<string, KnowledgeItem[]>();
  for (const item of entries) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }
  const lines: string[] = [
    '---',
    'title: "Oblivion 知识索引"',
    'source: "index"',
    'created_at: ' + JSON.stringify(isoDate(at)),
    'status: "active"',
    'impl: "implemented"',
    '---',
    '',
    '# Oblivion 知识索引',
    '',
    '> 本页由插件自动重建，**只放指针**；权威内容在各自条目与笔记里。',
    '> 状态口径：`active` 现行 / `superseded` 已被新版取代 / `draft` 草稿 / `conflict` 有冲突 / `archived` 归档。',
    '',
    '| 主题 | 条目 | 标题 | 状态 | 落地 | 更新 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const [topic, items] of [...byTopic.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const item of items.sort((a, b) => b.updated_at - a.updated_at)) {
      lines.push(
        '| ' + topic + ' | `' + item.id + '` | ' + item.title.replace(/\|/g, '\\|') + ' | ' + item.status + ' | ' + (item.impl ?? 'implemented') + ' | ' + isoDate(item.updated_at) + ' |',
      );
    }
  }
  if (byTopic.size === 0) lines.push('| — | — | 还没有条目 | — | — | — |');
  lines.push('');
  return lines.join('\n');
}

function appendSection(existing: string, item: KnowledgeItem): string {
  const parts = item.content.split('\n\n---\n\n');
  const tail = parts[parts.length - 1] ?? '';
  const block = [
    '',
    '## 追加（' + isoDate(item.updated_at) + '）',
    '',
    tail,
    '',
    '<!-- oblivion:append id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
  const head = existing.replace(/<!-- oblivion:id=.*?-->\n?/g, '').trimEnd();
  return head + '\n\n' + block;
}

function appendSource(existing: string, payload: MdPayload): string {
  if (!payload.mergedSource) return existing;
  const line = '- `' + payload.mergedSource.type + '`: ' + payload.mergedSource.ref + '（重复捕获，仅补来源）';
  if (existing.includes(line)) return existing;
  return existing.trimEnd() + '\n' + line + '\n';
}

/**
 * 写主题笔记。三个分支都以 id 为连接键，因此重放同一次捕获是幂等的。
 *
 * 落盘路径 = `<mdRoot>/<分类目录>/<topic>.md`（分类见 `classifyDir`，默认问答沉淀落 `01_问答沉淀/`）。
 *
 * ⚠️ **共用知识库的防误伤**：`mdRoot` 是既有的 Obsidian 知识库，同名文件很可能是**用户自己的笔记**。
 * 所以目标文件若已存在且**不含任何 `oblivion:` 标记**，就视为外来文件 —— 不追加、不改写，
 * 改为写 `<topic>-oblivion.md`。发现这种情况时不会有静默覆盖。
 */
/**
 * 推算某个条目**已经落盘**的笔记路径（用于双链反向回填）。
 *
 * 与 `writeMD` 同一套定位规则：`<mdRoot>/<分类目录>/<topic>.md`，
 * 若该文件不含 `oblivion:` 标记（说明是**用户自己的同名笔记**）则改用 `<topic>-oblivion.md`。
 * 返回 `''` 表示两处都不存在 —— 调用方应跳过（绝不新建文件：反填是锦上添花，不该产生副作用）。
 */
export async function notePathFor(
  root: string,
  item: KnowledgeItem,
  classify?: MdClassifyMap,
): Promise<string> {
  const dir = join(root, classifyDir(item, classify));
  const name = fileNameOf(item);
  const primary = join(dir, name + '.md');
  const primaryText = await readFile(primary, 'utf8').catch(() => '');
  if (primaryText.includes(ID_MARKER) || primaryText.includes('oblivion:digest')) return primary;
  const fallback = join(dir, name + '-oblivion.md');
  const fallbackText = await readFile(fallback, 'utf8').catch(() => '');
  if (fallbackText.includes(ID_MARKER) || fallbackText.includes('oblivion:digest')) return fallback;
  return '';
}

export async function writeMD(
  root: string,
  payload: MdPayload,
  classify?: MdClassifyMap,
): Promise<string> {
  // ---- 冲突分支：没有 item（筛选没放行），单独写 `50-Conflicts/`，绝不合并 ----
  if (payload.action === 'conflict') {
    const dir = join(root, CONFLICTS_DIR);
    await mkdir(dir, { recursive: true });
    const c = payload.conflict;
    const name = safeName(c?.topic || c?.question || 'conflict');
    const path = join(dir, name + '.md');
    const existing = await readFile(path, 'utf8').catch(() => '');
    const block = renderConflict(payload, payload.conflict ? Date.now() : Date.now());
    if (c && existing.includes('oblivion:conflict with=' + c.existingId)) return path;
    await writeFile(path, existing ? existing.trimEnd() + '\n\n---\n\n' + block : block, 'utf8');
    return path;
  }

  const item = payload.item;
  if (!item) return ''; // 其余分支都要求有 item；静默返回空路径而不是抛错（调用方只记日志）

  const dir = join(root, classifyDir(item, classify));
  await mkdir(dir, { recursive: true });

  const name = fileNameOf(item);
  let path = join(dir, name + '.md');
  let existing = await readFile(path, 'utf8').catch(() => '');
  if (existing !== '' && !existing.includes(ID_MARKER)) {
    path = join(dir, name + '-oblivion.md');
    existing = await readFile(path, 'utf8').catch(() => '');
  }

  switch (payload.action) {
    case 'created': {
      if (existing.includes('oblivion:id=' + item.id)) return path;
      const body = existing ? existing.trimEnd() + '\n\n' + renderNew(item) : renderNew(item);
      await writeFile(path, body, 'utf8');
      return path;
    }
    case 'appended':
      await writeFile(path, appendSection(existing, item), 'utf8');
      return path;
    case 'duplicate':
      await writeFile(path, appendSource(existing, payload), 'utf8');
      return path;
    default:
      return path;
  }
}

/** 冲突页目录名（盲区规格里的 `50-Conflicts/`）。 */
export const CONFLICTS_DIR = '50-Conflicts';
/** 索引目录名（只放指针）。 */
export const INDEX_DIR = '00-Index';

/**
 * 重建索引页 `<mdRoot>/00-Index/索引.md`。
 *
 * 只放指针、不放正文 —— 权威内容在条目里。这样"有几个版本、哪个是现行"一眼可判，
 * 不需要人去翻历史文档（那正是盲区 1「口径漂移」的根因）。
 */
export async function writeIndexNote(root: string, entries: KnowledgeItem[], at = Date.now()): Promise<string> {
  const dir = join(root, INDEX_DIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, '索引.md');
  await writeFile(path, renderIndex(entries, at), 'utf8');
  return path;
}

/**
 * 给既有笔记追加「关联知识」双链段（图谱生长的"双链写回"）。
 *
 * 幂等：同一批链接已存在则不动。**只追加到我们自己写的笔记**（含 `oblivion:` 标记）——
 * 用户自有笔记一个字都不改（与防误伤同一条原则）。
 */
export async function appendRelatedLinks(notePath: string, titles: string[]): Promise<boolean> {
  const links = titles.map((t) => String(t).trim()).filter((t) => t !== '');
  if (links.length === 0) return false;
  const existing = await readFile(notePath, 'utf8').catch(() => '');
  if (existing === '' || !existing.includes(ID_MARKER)) return false;

  const missing = links.filter((t) => !existing.includes('[[' + t + ']]'));
  if (missing.length === 0) return false;

  const block = [
    '',
    '## 关联知识（自动）',
    '',
    missing.map((t) => '- [[' + t.replace(/^\[\[|\]\]$/g, '') + ']]').join('\n'),
    '',
  ].join('\n');
  await writeFile(notePath, existing.trimEnd() + '\n' + block, 'utf8');
  return true;
}