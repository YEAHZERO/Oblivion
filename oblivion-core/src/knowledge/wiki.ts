/**
 * **主题页（Wiki）生成**（core 0.2.4）。
 *
 * 起因（所有者 2026-10-06）：
 *
 *   > 「那什么时候才能将差不多主题的合并，甚至生成 wiki 呢？」
 *
 * 之前的口径只有「一篇问答 = 一篇笔记」：同主题的旧版降级为 `superseded`（**不删**）、
 * 有分歧走 `50-Conflicts/`、面板上同一主题聚成一行 —— 但**正文从不合并，也从没有主题页**。
 *
 * ## 为什么不能用 topic 自动合并
 *
 * 实测（2026-10-06）：`01_问答沉淀` 56 篇落在 **55 个 topic** 上，只有 1 个 topic 有 2 版。
 * 因为 `topic` 是「问句里第一个词串」（`qa-loop` 的 `deriveTopic`），它跟「主题」根本不是一回事
 * ⇒ 按 topic 合并等于合不出东西。「差不多主题」是**语义判断**，只有模型判得了。
 *
 * ## 分工（与 `oblivion_digest` / `oblivion_retitle` 完全同一种）
 *
 * **模型判簇并写概述，插件只负责落盘与回链**（插件不调 LLM）：
 *   ① `list`：给模型候选 —— 每篇笔记的 `id / 现名 / 原问句(ask) / tags / 摘要`，外加**已有主题页**
 *      （免得重复造页）；
 *   ② 模型回 `clusters: [{ title, summary, members: [id…], tags }]`；
 *   ③ `apply`：每簇写 `<mdRoot>/02_Wiki页面/<标题>.md`（frontmatter + 概述 + 来源笔记双链 +
 *      标签 + 幂等标记），再给**每篇成员笔记**补一行 `> Wiki：[[主题页文件名]]`（双向可追溯），
 *      最后重建 `00-Index/索引.md`。
 *
 * ## 三条不变量（与改名同一套底线）
 *
 *   ① 只动**我们自己写的**文件：笔记正文里的 `<!-- oblivion:id=… -->`、主题页里的
 *      `<!-- oblivion:wiki … -->`。用户自有的同名 markdown 一个字不改 ——
 *      目标是用户自己的笔记时**让路**成 `<标题>-oblivion.md`（`writeMD` 同一条防误伤规则）。
 *   ② 主题页是**新增物**，不改成员笔记的正文；写回只在顶部元信息块加一行 `> Wiki：`。
 *   ③ 幂等：同一个簇重跑 = **更新那一页**（认 `oblivion:wiki` 标记），不会长出 `<标题>-2.md`；
 *      同一篇笔记已指过同一页时不重复写。
 */
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFile } from '../util/fs.js';
import { expandHome } from '../util/paths.js';
import { isoDate } from '../util/time.js';
import { listNotes, freeName, type NoteRef, type RetitleIndexHost } from './retitle.js';
import { safeDirName, safeName, writeIndexNote, type MdClassifyMap } from '../qa-loop/md-writer.js';
import type { KnowledgeItem } from '../types.js';

const ID_MARKER = 'oblivion:';
/** 主题页的幂等标记：认这个标记才认为「这页是我们写的，可以重写」。 */
const WIKI_MARKER = 'oblivion:wiki';
/** 分类映射里 `wiki` 缺席时的兜底目录名（与 `config.ts` 的默认值一致）。 */
export const WIKI_DIR_FALLBACK = '02_Wiki页面';
/** 一页最多挂多少篇来源笔记（超出的簇应该继续拆主题）。 */
const PAGE_MEMBER_MAX = 40;
/** 一篇笔记最多指回几个主题页。 */
const NOTE_WIKI_MAX = 5;

export interface WikiMember {
  id: string;
  file: string;
  title: string;
  /** 原问句（`ask:` 或旧笔记的 `title`）—— 主题页上「这篇当时在问什么」。 */
  ask: string;
  /** 条目状态：`active` / `superseded` / `conflict` / …（主题页上标出「已被新版取代」）。 */
  status: string;
  tags: string[];
  /** 答案正文开头一小段（列表模式给模型看，判「是不是一个主题」用）。 */
  excerpt: string;
}

export interface WikiCandidate extends WikiMember {
  /** 这篇笔记当前指回的主题页（`> Wiki：[[…]]`），空串表示还没归过页。 */
  wiki: string;
}

/** 已有的主题页（列表模式用来避免重复造页）。 */
export interface WikiPageRef {
  file: string;
  title: string;
  members: number;
  updatedAt: number;
}

export interface WikiCluster {
  /** 主题页标题（也是文件名）—— 模型给的，要像「一个主题」而不是「一个问题」。 */
  title: string;
  /** 模型写的概述：合并后的结论/口径，**这一段是主题页存在的理由**。 */
  summary: string;
  /** 成员笔记 id（取自候选列表）。 */
  members: string[];
  tags?: string[];
}

export interface WikiClusterResult {
  title: string;
  ok: boolean;
  file?: string;
  members?: number;
  /** 成功写回 `> Wiki：` 行的笔记数。 */
  linked?: number;
  error?: string;
}

export interface WikiListResult {
  notes: WikiCandidate[];
  pages: WikiPageRef[];
}

export interface WikiApplyResult {
  results: WikiClusterResult[];
  linked: number;
  index: { path: string; count: number } | null;
}

export interface WikiService {
  list(limit?: number): Promise<WikiListResult>;
  apply(clusters: WikiCluster[]): Promise<WikiApplyResult>;
}

function statusOf(raw: string): string {
  const hit = /^status:\s*"?([\w-]+)"?\s*$/m.exec(raw);
  return hit ? hit[1] : '';
}

function wikiLinkOf(raw: string): string {
  const hit = /^>\s*Wiki[:：]\s*(.+)$/m.exec(raw);
  return hit ? hit[1].trim() : '';
}

function pageTitleOf(raw: string): string {
  const hit = /^title:\s*"?(.*?)"?\s*$/m.exec(raw);
  return hit ? hit[1] : '';
}

const STATUS_NOTE: Record<string, string> = {
  superseded: '（已被新版取代）',
  conflict: '（有冲突）',
  draft: '（草稿）',
  archived: '（已归档）',
};

/**
 * 双链的目标永远是**磁盘文件名**（不含 `.md`）。
 *
 * 为什么不能用标题：Obsidian 按文件名解析 `[[…]]`，而文件名是消毒过的
 * （`safeName` 把 `:` `/` 换成 `_`）。现场就有 `[[清理死进程残留 + cordis:group 形状核对]]`
 * 这种带 `:` 的链接 —— 点开是「未创建的笔记」，双向可追溯当场断掉。
 */
function linkTargetOf(member: WikiMember): string {
  const stem = String(member.file ?? '').replace(/\\/g, '/').split('/').pop() ?? '';
  const base = stem.replace(/\.md$/i, '').trim();
  return base !== '' ? base : safeName(member.title);
}

/**
 * 渲染一页主题页（纯函数，便于单测与自检）。
 *
 * 版式刻意与笔记同构（frontmatter + `>` 元信息 + 小节 + 尾标），这样 Obsidian 里
 * 从笔记跳到主题页不会有「换了一套东西」的感觉。
 */
export function renderWikiPage(input: { cluster: WikiCluster; members: WikiMember[]; at: number }): string {
  const { cluster, members, at } = input;
  const title = cluster.title.trim();
  const date = isoDate(at);
  const clusterTags = (cluster.tags ?? [])
    // 小写：与 `tagsFromQA()` 的口径一致（标签要能筛，大小写混着就筛不动）。
    .map((t) => String(t).trim().replace(/^#+/, '').toLowerCase())
    .filter((t) => t !== '');
  // 主题页的标签 = 模型给的 + 成员笔记的并集（最多 12 个）：一页能代表它覆盖的范围。
  const tags = [...new Set([...clusterTags, ...members.flatMap((m) => m.tags)])].slice(0, 12);
  const flagged = members.filter((m) => STATUS_NOTE[m.status] !== undefined);

  const lines: string[] = [
    '---',
    'title: ' + JSON.stringify(title),
    'source: "wiki"',
    'generated_by: "model"',
    'created_at: ' + JSON.stringify(date),
    'updated_at: ' + JSON.stringify(date),
    'tags: [' + tags.map((t) => JSON.stringify(t)).join(', ') + ']',
    'status: "active"',
    'impl: "implemented"',
    'wiki_members: ' + members.length,
    '---',
    '',
    '# ' + title,
    '',
    '>Generated：' + date,
    '>Source：Oblivion · 主题页（模型归并，插件只落盘）',
    '>Members：' + members.length + ' 篇笔记',
    '>Tags： ' + (tags.length > 0 ? tags.map((t) => '#' + t).join(' ') : '（无）'),
    '',
    '## 概述',
    '',
    (cluster.summary ?? '').trim() === '' ? '（模型未给概述）' : cluster.summary.trim(),
    '',
    '## 来源笔记',
    '',
  ];
  if (members.length === 0) lines.push('（没有成员）');
  for (const member of members.slice(0, PAGE_MEMBER_MAX)) {
    const flag = STATUS_NOTE[member.status] ?? '';
    const ask = member.ask !== '' && member.ask !== member.title ? ' —— ' + member.ask.replace(/\s+/g, ' ') : '';
    lines.push('- [[' + linkTargetOf(member) + ']]' + flag + ask);
  }
  if (members.length > PAGE_MEMBER_MAX) {
    lines.push('- …（另有 ' + (members.length - PAGE_MEMBER_MAX) + ' 篇，见 `00-Index/索引.md`）');
  }
  if (flagged.length > 0) {
    lines.push(
      '',
      '## 口径提示',
      '',
      '本页成员里有 ' + flagged.length + ' 篇不是 `active`（**旧版不会被删，冲突不会被合并**）：',
      ...flagged.map((m) => '- [[' + linkTargetOf(m) + ']]' + (STATUS_NOTE[m.status] ?? '')),
      '',
    );
  }
  lines.push(
    '',
    '## 标签',
    '',
    tags.length > 0 ? tags.map((t) => '#' + t).join(' ') : '（无）',
    '',
    '<!-- oblivion:wiki title=' + title + ' members=' + members.length + ' at=' + at + ' -->',
    '',
  );
  return lines.join('\n');
}

/**
 * 给一篇笔记写回 `> Wiki：[[主题页]]` 一行（纯函数）。
 *
 * `wikiLink` 必须是**主题页在磁盘上的文件名**（不含 `.md`），不是簇标题 —— 标题里的
 * `:` `/` 会被消毒，用标题当链接文本会指向一篇不存在的笔记。
 * 只认我们自己写的笔记（正文含 `oblivion:` 标记）；一行里最多指 5 页；已指过同一页则原样返回。
 * 首次插入点在顶部 `>Date/>Source/>Note/>Tags/>Ask` 元信息块的末尾 —— 双链要显眼，但不打断正文。
 */
export function writebackWikiLink(raw: string, wikiLink: string): string {
  const title = wikiLink.trim();
  if (title === '' || raw === '' || !raw.includes(ID_MARKER)) return raw;
  const lines = raw.split(/\r?\n/);
  const at = lines.findIndex((line) => /^>\s*Wiki[:：]/.test(line));
  if (at >= 0) {
    const existing = [...lines[at].matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1].trim());
    if (existing.includes(title)) return raw;
    const merged = [...existing, title].slice(0, NOTE_WIKI_MAX);
    lines[at] = '> Wiki： ' + merged.map((t) => '[[' + t + ']]').join(' ');
    return lines.join('\n');
  }
  const link = '> Wiki： [[' + title + ']]';
  let anchor = -1;
  for (let i = 0; i < Math.min(lines.length, 24); i += 1) {
    if (/^>\s*(Date|Source|Note|Tags|Ask)/.test(lines[i])) anchor = i;
  }
  if (anchor >= 0) {
    lines.splice(anchor + 1, 0, link);
  } else {
    const h1 = lines.findIndex((line) => /^#\s+/.test(line));
    lines.splice(h1 >= 0 ? h1 + 1 : 0, 0, '', link);
  }
  return lines.join('\n');
}

/** 扫主题页目录：只认带 `oblivion:wiki` 标记的页面（用户自己的 md 不进列表）。 */
export async function listWikiPages(dir: string): Promise<WikiPageRef[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: WikiPageRef[] = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file.startsWith('.')) continue;
    const path = join(dir, file);
    const raw = await readFile(path, 'utf8').catch(() => '');
    if (raw === '' || !raw.includes(WIKI_MARKER)) continue;
    const marker = new RegExp(WIKI_MARKER + '[^>]*?members=(\\d+)').exec(raw);
    const info = await stat(path).catch(() => null);
    out.push({
      file,
      title: pageTitleOf(raw),
      members: marker ? Number(marker[1]) : 0,
      updatedAt: info ? info.mtimeMs : 0,
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

/**
 * 把「候选 / 落地」装成模型面工具能用的一层。
 *
 * `host` 与改名那条路同一个理由：模型改了知识结构，如果内存索引不 `rebuild()`，
 * 之后 `oblivion_query` 还会按老样子回话（索引是缓存，不是每次都读盘）。
 */
export function createWikiService(deps: {
  /** `config.mdRoot` / `config.dataRoot` **原样**传进来（可以是 `~/.oblivion/data`），这里自己展开。 */
  mdRoot: string;
  dataRoot: string;
  classify?: MdClassifyMap;
  host?: RetitleIndexHost | null;
}): WikiService {
  const mdRoot = expandHome(deps.mdRoot);
  const qaDir = deps.classify?.session ?? deps.classify?.qa_loop ?? '01_问答沉淀';
  const mdDir = join(mdRoot, qaDir);
  const wikiDir = join(mdRoot, safeDirName(deps.classify?.wiki ?? WIKI_DIR_FALLBACK) || WIKI_DIR_FALLBACK);
  void deps.dataRoot; // 主题页不改条目 JSON（成员笔记的 title 归改名那条路管），保留参数为了接口一致。

  async function memberOf(note: NoteRef): Promise<WikiMember & { wiki: string }> {
    const raw = await readFile(note.path, 'utf8').catch(() => '');
    return {
      id: note.id,
      file: note.file,
      title: note.title,
      ask: note.ask,
      status: statusOf(raw),
      tags: note.tags,
      excerpt: note.excerpt,
      wiki: wikiLinkOf(raw),
    };
  }

  return {
    async list(limit = 20) {
      const notes = await listNotes(mdDir, limit);
      const candidates: WikiCandidate[] = [];
      for (const note of notes) {
        const member = await memberOf(note);
        // `wiki` 留在候选里：模型能看到「这篇已经归过页」，从而选择补进旧页或另起一页。
        candidates.push(member);
      }
      return { notes: candidates, pages: await listWikiPages(wikiDir) };
    },

    async apply(clusters) {
      await mkdir(wikiDir, { recursive: true });
      const notes = await listNotes(mdDir, 0);
      const byId = new Map(notes.map((n) => [n.id, n]));
      const taken = new Set(await readdir(wikiDir).catch(() => [] as string[]));
      const results: WikiClusterResult[] = [];
      let linked = 0;

      for (const cluster of clusters ?? []) {
        const title = String(cluster?.title ?? '').trim();
        if (title === '') {
          results.push({ title, ok: false, error: 'empty-title' });
          continue;
        }
        const ids = [...new Set((cluster.members ?? []).map((id) => String(id)))];
        const picked = ids.map((id) => byId.get(id)).filter((n): n is NoteRef => n !== undefined);
        if (picked.length === 0) {
          results.push({ title, ok: false, error: 'no-known-members' });
          continue;
        }

        const members: WikiMember[] = [];
        for (const note of picked) members.push(await memberOf(note));

        const at = Date.now();
        const page = renderWikiPage({ cluster: { ...cluster, title }, members, at });
        const base = safeDirName(title).replace(/^[.\s]+/, '').replace(/[.\s]+$/, '').replace(/\//g, '_') || 'untitled';
        let file = base + '.md';
        const existing = await readFile(join(wikiDir, file), 'utf8').catch(() => '');
        if (existing !== '' && !existing.includes(WIKI_MARKER)) {
          // 用户自己的同名笔记：**让路**（与 `writeMD` 同一条防误伤规则）。
          file = await freeName(wikiDir, base + '-oblivion', '', taken);
        } else if (existing === '') {
          file = await freeName(wikiDir, base, '', taken);
        }
        await writeFile(join(wikiDir, file), page, 'utf8');
        taken.add(file);

        // 写回：只在成员笔记顶部元信息块加一行 `> Wiki：[[主题页文件名]]`，正文一个字不动。
        // 链接文本用**落盘后的文件名**（可能因为同名让路带上 `-oblivion` 后缀）。
        const pageLink = file.replace(/\.md$/i, '');
        let wrote = 0;
        for (const note of picked) {
          const raw = await readFile(note.path, 'utf8').catch(() => '');
          if (raw === '') continue;
          const next = writebackWikiLink(raw, pageLink);
          if (next === raw) continue;
          await writeFile(note.path, next, 'utf8');
          wrote += 1;
        }
        linked += wrote;
        results.push({ title, ok: true, file, members: members.length, linked: wrote });
      }

      let index: { path: string; count: number } | null = null;
      if (deps.host) {
        try {
          deps.host.index.rebuild(await deps.host.store.loadAll());
          const all: KnowledgeItem[] = deps.host.index.all();
          index = { path: await writeIndexNote(mdRoot, all), count: all.length };
        } catch {
          // 索引刷新失败不该让「主题页已经写好」变成一次失败（与改名同一条口径）。
          index = null;
        }
      }
      return { results, linked, index };
    },
  };
}
