/**
 * 笔记改名 / 打标签（core 0.2.2）。
 *
 * 起因（所有者 2026-10-06）：「这些沉淀的文档，命名上看不出是什么内容，单纯只是我的问题的简写而已，
 * 需要在沉淀整理的时候顺便命名 + 打标签」。管线里已经改成**按内容命名**（`knowledge/naming.ts`），
 * 但已经落盘的笔记不会自己改名 —— 这个模块就是「回填」与「事后改名」两条路共用的一层：
 *
 *   - 工具面：`oblivion_retitle`（模型看一批笔记 → 给出新名与标签 → 落地），与 `oblivion_digest` 同一种做法：
 *     **模型负责起名，插件只负责落盘与同步**（插件不调 LLM）。
 *   - 脚本面：`scripts/rename-notes.mjs` 用同一套读写逻辑，把 `naming.ts` 的规则回溯应用到存量笔记。
 *
 * 三条不变量：
 *   ① 只动**我们自己写的**笔记（正文里有 `<!-- oblivion:id=… -->`）；用户自有的 Markdown 一个字不改。
 *   ② 改名**不丢信息**：原问句写进 frontmatter `ask:` 与正文 `>Ask：` 行（只在第一次写）。
 *   ③ 改名必须**同步条目 JSON**（`<dataDir>/<id>.json`）的 `title` —— 落盘路径是按名字算的
 *      （`md-writer.ts` 的 `notePathFor`），只改文件名不改条目，下一次同条目写入会按旧名再起一份。
 */
import { readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFile } from '../util/fs.js';
import { fileNameOf, writeIndexNote, type MdClassifyMap } from '../qa-loop/md-writer.js';
import { expandHome } from '../util/paths.js';
import type { KnowledgeItem } from '../types.js';

const ID_RE = /<!--\s*oblivion:id=(\S+)\s+version=(\d+)\s*-->/;
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
/** 正文里与「来源」之间的那一段才是答案 —— 笔记自己的脚手架（`## 内容`/`## 来源`）不能当内容读。 */
const SECTION_RE = /^##\s+/;

export interface NoteMeta {
  title: string;
  topic: string;
  tags: string[];
  ask: string;
  /**
   * 这篇名字是谁起的：`'model'` 表示模型起的（`oblivion_retitle` / 模型回填）。
   * 规则管线（`rename-notes.mjs` 的字符串命名）看到这个标记就**不再改动它** ——
   * 否则下一次回填会把模型起的内容名重新算回「去水词后的整句问句」。
   */
  namedBy: string;
  id: string;
  version: number;
}
export interface ParsedNote {
  frontmatter: string;
  body: string;
  meta: NoteMeta;
}
export interface NoteRef {
  id: string;
  file: string;
  path: string;
  title: string;
  topic: string;
  tags: string[];
  /**
   * 改名时要保留的**原问句**。
   *
   * 0.2.1 之前的笔记没有 `ask:`，那时的 `title` 就是问句（旧 `deriveTitle` = 问句前缀）
   * ⇒ `listNotes()` 统一回退到 `title`，模型在候选列表里也就一定能看到「这篇原来在问什么」。
   */
  ask: string;
  /** 名字来源（`'model'` 表示模型起的）—— 规则管线据此让路，见 `NoteMeta.namedBy`。 */
  namedBy: string;
  excerpt: string;
  mtime: number;
}
export interface RetitleEntry {
  id: string;
  title: string;
  tags?: string[];
  namedBy?: string;
}
export interface RetitleResult {
  id: string;
  ok: boolean;
  from?: string;
  to?: string;
  /** 条目 JSON 是否同步成功（false 表示只改了笔记，条目可能已不在）。 */
  itemSynced?: boolean;
  error?: string;
}

function asString(value: string): string {
  const t = value.trim();
  if (t === '') return '';
  if (t.startsWith('"')) {
    try {
      return String(JSON.parse(t));
    } catch {
      return t.replace(/^"|"$/g, '');
    }
  }
  return t;
}

function asArray(value: string): string[] {
  const t = value.trim();
  if (t === '') return [];
  if (t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return t.split(',').map((s) => asString(s)).filter((s) => s !== '');
}

/** 解析一篇笔记：frontmatter + 正文 + 幂等标记。没有标记（用户自有笔记）时 `meta.id === ''`。 */
export function parseNote(raw: string): ParsedNote {
  const matched = FM_RE.exec(raw);
  const frontmatter = matched ? matched[1] : '';
  const body = matched ? raw.slice(matched[0].length) : raw;
  const field = (key: string): string => {
    const hit = new RegExp('^' + key + ':\\s*(.*)$', 'm').exec(frontmatter);
    return hit ? hit[1].trim() : '';
  };
  const marker = ID_RE.exec(body) ?? ID_RE.exec(raw);
  return {
    frontmatter,
    body,
    meta: {
      title: asString(field('title')),
      topic: asString(field('topic')),
      tags: asArray(field('tags')),
      ask: asString(field('ask')),
      namedBy: asString(field('named_by')),
      id: marker ? marker[1] : '',
      version: marker ? Number(marker[2]) : 0,
    },
  };
}

/** `## 内容` 段（答案正文）。没有这个段就退回整段正文，绝不返回空串。 */
export function contentSection(body: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+内容\s*$/.test(l));
  if (start < 0) return body.trim();
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => SECTION_RE.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

function setField(frontmatter: string, key: string, value: string): string {
  const line = new RegExp('^' + key + ':.*$', 'm');
  if (line.test(frontmatter)) return frontmatter.replace(line, key + ': ' + value);
  return frontmatter.replace(/\s*$/, '') + '\n' + key + ': ' + value;
}

/**
 * 重写一篇笔记：标题（frontmatter `title` + 正文 `#`）、标签（frontmatter `tags` + `>Tags：`），
 * 并在第一次改名时把**原问句**留成 `ask:` / `>Ask：` —— 名字回答「这里讲了什么」，
 * `ask` 回答「我当时问的是什么」，两个都要留下。
 */
export function renderNote(
  parsed: ParsedNote,
  next: { title: string; tags?: string[]; ask?: string; namedBy?: string },
): string {
  const title = next.title.trim();
  // 注意用 `||` 而不是 `??`：`parseNote()` 把缺失字段读成**空串**，`??` 会认它「已给值」，
  // 于是 `ask` 永远为空 —— 回填那一轮 54 篇笔记就这样漏掉了 `ask:`/`>Ask：`。
  const ask = (next.ask || parsed.meta.ask || parsed.meta.title).trim();
  const namedBy = (next.namedBy || parsed.meta.namedBy || '').trim();
  let frontmatter = parsed.frontmatter;
  if (frontmatter !== '') {
    frontmatter = setField(frontmatter, 'title', JSON.stringify(title));
    if (next.tags && next.tags.length > 0) {
      frontmatter = setField(frontmatter, 'tags', '[' + next.tags.map((t) => JSON.stringify(t)).join(', ') + ']');
    }
    if (ask !== '') frontmatter = setField(frontmatter, 'ask', JSON.stringify(ask));
    if (namedBy !== '') frontmatter = setField(frontmatter, 'named_by', JSON.stringify(namedBy));
  }

  const lines = parsed.body.split(/\r?\n/);
  const h1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1 >= 0) lines[h1] = '# ' + title;
  if (next.tags && next.tags.length > 0) {
    const tagLine = lines.findIndex((l) => /^>\s*Tags[:：]/.test(l));
    if (tagLine >= 0) lines[tagLine] = '>Tags： ' + next.tags.map((t) => '#' + t).join(' ');
  }
  if (ask !== '' && !lines.some((l) => /^>\s*Ask[:：]/.test(l))) {
    let anchor = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (/^>\s*(Date|Source|Note|Tags)/.test(lines[i])) anchor = i;
    }
    if (anchor >= 0) lines.splice(anchor + 1, 0, '>Ask： ' + ask);
  }

  const head = frontmatter === '' ? '' : '---\n' + frontmatter + '\n---\n';
  return head + lines.join('\n');
}

/** 扫一个目录，挑出我们自己写的笔记（带 `oblivion:id` 标记），按修改时间倒序。`limit <= 0` 表示全部。 */
export async function listNotes(dir: string, limit = 10): Promise<NoteRef[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: NoteRef[] = [];
  for (const file of files) {
    if (!file.endsWith('.md') || file.startsWith('.')) continue;
    const path = join(dir, file);
    const raw = await readFile(path, 'utf8').catch(() => '');
    if (raw === '') continue;
    const parsed = parseNote(raw);
    if (parsed.meta.id === '') continue;
    const info = await stat(path).catch(() => null);
    out.push({
      id: parsed.meta.id,
      file,
      path,
      title: parsed.meta.title,
      topic: parsed.meta.topic,
      tags: parsed.meta.tags,
      ask: parsed.meta.ask || parsed.meta.title,
      namedBy: parsed.meta.namedBy,
      excerpt: contentSection(parsed.body).replace(/\s+/g, ' ').slice(0, 80),
      mtime: info ? info.mtimeMs : 0,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return limit > 0 ? out.slice(0, limit) : out;
}

/**
 * 挑一个没被占用的文件名（`<base>.md` → `<base>-2.md` → …）。
 *
 * `self` 是「这篇笔记自己现在的文件名」：自己占着的名字不算冲突（改名成同名是合法的 no-op）。
 * 主题页生成（`knowledge/wiki.ts`）复用这同一个函数 —— 「别覆盖别人的文件」只有一套口径。
 */
export async function freeName(dir: string, base: string, self: string, taken: Set<string>): Promise<string> {
  let candidate = base + '.md';
  let n = 2;
  for (;;) {
    const busy = taken.has(candidate) || (await stat(join(dir, candidate)).then(() => true).catch(() => false));
    if (!busy || candidate === self) return candidate;
    candidate = base + '-' + n + '.md';
    n += 1;
  }
}

/**
 * 落地一批改名。**先写内容、再改名**（顺序反了会在 Windows 上撞到占用）：改名失败时退回
 * 「写新路径 + 删旧路径」，最坏情况是保留旧文件名 —— 但内容一定在。
 */
export async function applyRetitle(
  deps: { mdDir: string; dataDir: string },
  entries: RetitleEntry[],
): Promise<RetitleResult[]> {
  const notes = await listNotes(deps.mdDir, 0);
  const byId = new Map(notes.map((n) => [n.id, n]));
  const taken = new Set(notes.map((n) => n.file));
  const results: RetitleResult[] = [];

  for (const entry of entries) {
    const note = byId.get(entry.id);
    if (!note) {
      results.push({ id: entry.id, ok: false, error: 'note-not-found' });
      continue;
    }
    const title = (entry.title || '').trim();
    if (title === '') {
      results.push({ id: entry.id, ok: false, error: 'empty-title' });
      continue;
    }

    const raw = await readFile(note.path, 'utf8');
    const parsed = parseNote(raw);
    const content = renderNote(parsed, { title, tags: entry.tags, namedBy: entry.namedBy });
    await writeFile(note.path, content, 'utf8');

    let target = note.file;
    if (fileNameOf({ title, topic: note.topic }) + '.md' !== note.file) {
      target = await freeName(deps.mdDir, fileNameOf({ title, topic: note.topic }), note.file, taken);
      try {
        await rename(note.path, join(deps.mdDir, target));
      } catch {
        try {
          await writeFile(join(deps.mdDir, target), content, 'utf8');
          await unlink(note.path);
        } catch {
          target = note.file;
        }
      }
      if (target !== note.file) {
        taken.delete(note.file);
        taken.add(target);
      }
    }

    let itemSynced = false;
    const itemRaw = await readFile(join(deps.dataDir, note.id + '.json'), 'utf8').catch(() => '');
    if (itemRaw !== '') {
      try {
        const item = JSON.parse(itemRaw) as KnowledgeItem;
        item.title = title;
        if (entry.tags && entry.tags.length > 0) item.tags = entry.tags;
        item.updated_at = Date.now();
        await writeFile(join(deps.dataDir, note.id + '.json'), JSON.stringify(item, null, 2) + '\n', 'utf8');
        itemSynced = true;
      } catch {
        itemSynced = false;
      }
    }

    results.push({ id: note.id, ok: true, from: note.file, to: target, itemSynced });
  }
  return results;
}

/**
 * 索引/条目两层的最小结构面：插件里传 `KnowledgeService`（它正好有 `store` + `index`），
 * 脚本与单测里可以只给一个 `{ store, index }` 替身。
 */
export interface RetitleIndexHost {
  store: { loadAll(): Promise<KnowledgeItem[]> };
  index: { rebuild(items: KnowledgeItem[]): void; all(): KnowledgeItem[] };
}

export interface RetitleService {
  /** 看一批候选笔记（按 mtime 倒序，只含我们自己的笔记）。 */
  list(limit?: number): Promise<NoteRef[]>;
  /** 落地一批改名，并顺手重建 `<mdRoot>/00-Index/索引.md`。 */
  apply(entries: RetitleEntry[]): Promise<{ results: RetitleResult[]; index: { path: string; count: number } | null }>;
}

/**
 * 把「读笔记 / 改笔记」装成模型面工具能用的一个服务。
 *
 * `host` 是**为了刷新**：改名顺手把条目 JSON 的 `title` 改了，如果不 `rebuild()`，
 * 这一轮之后 `oblivion_query` 还会按旧索引里的 title 回话（索引是内存缓存，不是每次都读盘）。
 */
export function createRetitleService(deps: {
  /** `config.mdRoot` / `config.dataRoot` **原样**传进来（可以是 `~/.oblivion/data`），这里自己展开。 */
  mdRoot: string;
  dataRoot: string;
  classify?: MdClassifyMap;
  host?: RetitleIndexHost | null;
}): RetitleService {
  const mdRoot = expandHome(deps.mdRoot);
  const dataDir = expandHome(deps.dataRoot);
  const qaDir = deps.classify?.session ?? deps.classify?.qa_loop ?? '01_问答沉淀';
  const mdDir = join(mdRoot, qaDir);
  return {
    list: (limit = 10) => listNotes(mdDir, limit),
    async apply(entries) {
      const results = await applyRetitle({ mdDir, dataDir }, entries);
      let index: { path: string; count: number } | null = null;
      if (deps.host) {
        try {
          deps.host.index.rebuild(await deps.host.store.loadAll());
          const all = deps.host.index.all();
          index = { path: await writeIndexNote(mdRoot, all), count: all.length };
        } catch {
          // 索引刷新失败不该让「改名已经成功」这件事变成一次失败。
          index = null;
        }
      }
      return { results, index };
    },
  };
}
