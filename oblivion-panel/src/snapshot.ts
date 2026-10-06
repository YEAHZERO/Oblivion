import { open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 观测快照装配：**把 `@oblivion/core` 落在磁盘上的东西读成一个只读 JSON**。
 *
 * 为什么是「读 core 的文件」而不是「调 core 的服务」：
 *   ① 两个插件解耦 —— panel 不 import core，core 也不需要为 UI 加接口；
 *   ② core 不在时（或还没跑过）panel 仍然能装载并显示「还没有数据」，
 *      而不是装载失败（DSH 的失败姿态是整行静默禁用，那更难排查）；
 *   ③ 数据形状是本仓自己的、有文档的（core README §九），不是第三方约定。
 *
 * 只读、有上限、不跟随任何用户输入拼路径（路径全部来自我们自己的 config）。
 */

const MAX_JSON_BYTES = 256 * 1024;
const MAX_JSONL_BYTES = 2 * 1024 * 1024;
/** core 的默认值（`oblivion-core/src/config.ts:159-160`）：status.json 里没带回 config 时按这个兜底。 */
const FALLBACK_RETENTION_DAYS = 90;
const FALLBACK_MAX_ENTRIES = 5000;
const MS_PER_DAY = 86_400_000;
/**
 * 判定曲线的点数上限（比列表宽得多，但仍有界）：曲线要的是趋势，
 * 240 个点在一条 320px 宽的曲线里已经远超可辨认度；列表另有自己的窗口（`recentLimit`）。
 */
const SERIES_MAX = 240;
/** 知识库里的两个笔记目录（与 `@oblivion/core` 的 md-writer 约定一致）。 */
export const QA_NOTE_DIR = '01_问答沉淀';
export const DIGEST_NOTE_DIR = '04_会话整理';
/** `oblivion_wiki` 落的主题页目录（与 core 的 `mdClassify.wiki` 一致）。 */
export const WIKI_NOTE_DIR = '02_Wiki页面';
/**
 * 每篇笔记只读头部这么多字节来取「关键词 / 日期 / 相关主题」。
 *
 * 三样东西都在**文件开头**（frontmatter + `>Date/>Tags/> Wiki：` 元信息块，整理件没有 frontmatter
 * 但元信息行更靠前），而正文可以很长 —— 整读几十篇笔记是白花 IO。8 KB 对元信息块是压倒性余量。
 */
const NOTE_HEAD_BYTES = 8192;

export interface CoreStatusShape {
  version?: string;
  generatedAt?: number;
  mdRoot?: string;
  dataRoot?: string;
  config?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  hints?: Array<{ key?: string; current?: unknown; suggested?: unknown; why?: string }>;
  perspective?: Record<string, unknown>;
}

export interface DecisionRow {
  at?: number;
  action?: string;
  pass?: boolean;
  reason?: string;
  score?: number;
  answerChars?: number;
  ms?: number;
}

/**
 * 留痕的聚合视图 —— **刻意与 core 的 `StatsSummary` 同形**（`oblivion-core/src/stats/summary.ts:5`）。
 * 面板不 import core（解耦，见文件头），所以这份口径是**镜像**：那边改了这边要同步改。
 */
export interface DecisionStats {
  /** 只作记录（core 的 `summarize` 不按日期过滤，过滤发生在 `trace.read()`）。 */
  windowDays: number;
  firstAt: number | null;
  lastAt: number | null;
  /** 留痕条数（含 `no-qa` 的空轮）。 */
  turns: number;
  /** 真的进了四层筛选的轮数（= turns - noQa）。 */
  evaluated: number;
  noQa: number;
  captured: number;
  rejected: number;
  captureRate: number;
  byAction: Record<string, number>;
  byReason: Record<string, number>;
  score: { min: number; p50: number; p90: number; max: number; belowThreshold: number } | null;
  /** 文件里解析成功的行数 / 被保留期与条数上限丢掉的行数（看得出统计口径有没有被裁）。 */
  parsed: number;
  dropped: number;
}

function ratio(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 1000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index] * 1000) / 1000;
}

/**
 * 由留痕**现算**统计（面板侧的实时版本）。
 *
 * 为什么面板要自己算：core 的 `status.json` 只在**装载那一刻**写一次
 * （`oblivion-core/src/index.ts` 的 `writeBootSnapshot()`），于是顶部 KPI 会停在重启时——
 * 实测顶部「已沉淀 2」而「最近沉淀 (4)」、「判定轮数 2」而留痕有 5 行。
 * 用户 2026-10-06 裁定：**面板自己从 `decisions.jsonl` 现算，core 不动**。
 *
 * 口径逐行镜像 `oblivion-core/src/stats/summary.ts:40` 的 `summarize()`（含 `pass` 用真值判断、
 * `score` 非数字不入统计、`no-qa` 不计入 `evaluated`）。输入等价性由 `readDecisions()` 保证
 * ——它做与 core `trace.read()` 同样的保留期/上限裁剪。
 */
export function summarizeDecisions(
  rows: DecisionRow[],
  extra: { parsed?: number; dropped?: number; windowDays?: number } = {},
): DecisionStats {
  const byAction: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const scores: number[] = [];
  let captured = 0;
  let noQa = 0;
  let belowThreshold = 0;

  for (const row of rows) {
    const action = String(row.action ?? '(none)');
    byAction[action] = (byAction[action] ?? 0) + 1;
    const reason = typeof row.reason === 'string' && row.reason !== '' ? row.reason : '(none)';
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (action === 'no-qa') {
      noQa += 1;
      continue;
    }
    if (row.pass) captured += 1;
    if (typeof row.score === 'number' && Number.isFinite(row.score)) {
      scores.push(row.score);
      if (!row.pass) belowThreshold += 1;
    }
  }

  const evaluated = rows.length - noQa;
  scores.sort((a, b) => a - b);
  const ats = rows.map((row) => row.at).filter((at): at is number => typeof at === 'number');

  return {
    windowDays: extra.windowDays ?? 0,
    firstAt: ats.length > 0 ? Math.min(...ats) : null,
    lastAt: ats.length > 0 ? Math.max(...ats) : null,
    turns: rows.length,
    evaluated,
    noQa,
    captured,
    rejected: evaluated - captured,
    captureRate: ratio(captured, evaluated),
    byAction,
    byReason,
    score:
      scores.length > 0
        ? {
            min: scores[0],
            p50: percentile(scores, 50),
            p90: percentile(scores, 90),
            max: scores[scores.length - 1],
            belowThreshold,
          }
        : null,
    parsed: extra.parsed ?? rows.length,
    dropped: extra.dropped ?? 0,
  };
}

export interface ItemRow {
  id: string;
  topic: string;
  title: string;
  created_at: number;
  status: string;
  /** 落地状态（core 0.1.11 起的 `impl`）：`implemented` / `designed` / `placeholder`。 */
  impl: string;
  version: number;
  sources: number;
  /** 来源类型（`session` / `digest` / …），用来判断是不是会话整理件。 */
  sourceTypes: string[];
  /** 关键词（条目 JSON 的 `tags`）。 */
  tags: string[];
  /** 最后一次更新时间（epoch ms）—— 显示日期时优先用它。 */
  updated_at: number;
}

/**
 * 一篇笔记的**元信息**（面板 0.0.14 起：文档下方要显示「相关主题 / 关键词 / 日期」）。
 *
 * 问答笔记与整理件的来源不同，所以解析要两边都认：
 *   - 问答笔记（`01_问答沉淀/*.md`）：frontmatter 里有 `tags` / `created_at` / `updated_at`，
 *     正文元信息块里还有 `>Tags：` 与主题页回链 `> Wiki： [[标题]]`；
 *   - 整理件（`04_会话整理/*.md`）：**没有 frontmatter**，只有 `>Date :` 那几行。
 */
export interface NoteHead {
  /** 关键词（frontmatter 的 `tags`，退化时取 `>Tags： #a #b`）。 */
  tags: string[];
  /** `YYYY-MM-DD`（frontmatter 的 `created_at`，退化时取 `>Date :` 行）；取不到是空串。 */
  createdAt: string;
  /** `YYYY-MM-DD`（frontmatter 的 `updated_at` / `>Date :`）；取不到是空串。 */
  updatedAt: string;
  /** 归并到的主题页标题（`> Wiki： [[标题]]`，以及 frontmatter 的 `related_wiki`）。 */
  wiki: string[];
}

export interface NoteRow extends NoteHead {
  name: string;
  path: string;
  mtimeMs: number;
  bytes: number;
}

export interface PanelSnapshot {
  ok: true;
  generatedAt: number;
  dataRoot: string;
  mdRoot: string;
  /** core 的装载快照（`status.json`）；没跑过就是 null。 */
  core: CoreStatusShape | null;
  /**
   * 由留痕（`decisions.jsonl`）**现算**的统计 —— 顶部 KPI 与「主要拦截原因」用这个。
   * 刻意不用 `core.stats`：那是 core 装载那一刻的快照，会停在重启时（见 `summarizeDecisions` 注释）。
   */
  live: DecisionStats;
  /**
   * 留痕：`recent` 是「最近判定」列表用的窗口（跟着 `recentLimit`），
   * `series` 是**判定曲线**用的宽窗口（`SERIES_MAX`）—— 曲线看趋势，列表看最近几条，两者同源一次读盘。
   */
  trace: { path: string; recent: DecisionRow[]; series: DecisionRow[] };
  /**
   * 知识条目（`<dataRoot>/ts-*.json`）—— 这是**扫描窗口**（比显示条数宽），
   * 因为客户端要按主题把同一主题的多个版本聚成一行（方案 A，见 `client/knowledge.ts`）。
   */
  items: ItemRow[];
  /** `01_问答沉淀/*.md`：问答落成的笔记，面板的主骨架。 */
  notes: NoteRow[];
  /** `04_会话整理/*.md`：`oblivion_digest` 的整理件 —— 原来只在条目栏看得到，合栏后要能点开。 */
  digests: NoteRow[];
  /**
   * `02_Wiki页面/*.md`：`oblivion_wiki` 落的主题页。
   *
   * 只作**标题 → 路径**的字典用：笔记里写的是 `> Wiki： [[标题]]`（core 只记标题），
   * 面板要让它可点开就得知道那个标题对应哪个文件；顺带也告诉用户现在有几个主题页。
   */
  wikis: NoteRow[];
  /** 读到了但有问题的地方（缺文件不算问题，缺文件是「还没跑」）。 */
  problems: string[];
}

async function readJsonCapped(path: string, problems: string[]): Promise<unknown> {
  try {
    const info = await stat(path);
    if (info.size > MAX_JSON_BYTES) {
      problems.push(`${path} 超过 ${MAX_JSON_BYTES} 字节，已跳过`);
      return undefined;
    }
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') problems.push(`${path}: ${String(error)}`);
    return undefined;
  }
}

interface RawJsonl {
  rows: DecisionRow[];
  /** 解析成功的行数。 */
  parsed: number;
  /** 不是合法 JSON 的行数。 */
  bad: number;
  truncated: boolean;
}

/** 读一个 jsonl：整读（有字节上限，超了只留尾部）+ 逐行解析，坏行只计数不抛错。 */
async function readJsonlRaw(path: string, problems: string[]): Promise<RawJsonl> {
  try {
    const raw = await readFile(path, 'utf8');
    const truncated = raw.length > MAX_JSONL_BYTES;
    if (truncated) problems.push(`${path} 超过 ${MAX_JSONL_BYTES} 字节，只取尾部`);
    const body = truncated ? raw.slice(raw.length - MAX_JSONL_BYTES) : raw;
    const lines = body.split('\n').filter((line) => line.trim() !== '');
    const rows: DecisionRow[] = [];
    let bad = 0;
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line) as DecisionRow);
      } catch {
        bad += 1;
      }
    }
    if (bad > 0) problems.push(`${path}: 有 ${bad} 行不是合法 JSON，已跳过`);
    return { rows, parsed: rows.length, bad, truncated };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') problems.push(`${path}: ${String(error)}`);
    return { rows: [], parsed: 0, bad: 0, truncated: false };
  }
}

/**
 * 读留痕并做**与 core 同口径的裁剪**（保留期 + 条数上限），供实时统计用。
 *
 * core 的 `trace.read()` 是「惰性裁剪」：读的时候顺手把超期/超量的丢掉并**重写文件**
 * （`oblivion-core/src/stats/trace.ts:85`）。面板**只读**，绝不重写别人的文件，
 * 所以这里只做同样的**过滤**，并把丢掉的行数如实报出来（`dropped`）。
 * 「最近判定」列表也从同一份结果取尾部，避免对同一文件读两遍、告警重复。
 */
async function readDecisions(
  path: string,
  options: { retentionDays: number; maxEntries: number; now: number },
  problems: string[],
): Promise<{ rows: DecisionRow[]; parsed: number; dropped: number }> {
  const { rows, parsed } = await readJsonlRaw(path, problems);
  const cutoff = options.now - options.retentionDays * MS_PER_DAY;
  const fresh = rows.filter((row) => typeof row.at === 'number' && row.at >= cutoff);
  const kept = fresh.length > options.maxEntries ? fresh.slice(fresh.length - options.maxEntries) : fresh;
  return { rows: kept, parsed, dropped: parsed - kept.length };
}

/** 最近沉淀的知识条目（`<dataRoot>/ts-*.json`），按 `created_at` 倒序。 */
async function readItems(dataRoot: string, limit: number, problems: string[]): Promise<ItemRow[]> {
  let names: string[] = [];
  try {
    names = (await readdir(dataRoot)).filter((name) => name.startsWith('ts-') && name.endsWith('.json'));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') problems.push(`${dataRoot}: ${String(error)}`);
    return [];
  }

  const rows: ItemRow[] = [];
  for (const name of names) {
    const parsed = await readJsonCapped(join(dataRoot, name), problems);
    if (!parsed || typeof parsed !== 'object') continue;
    const item = parsed as Record<string, unknown>;
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];
    rows.push({
      id: String(item.id ?? name.replace(/\.json$/, '')),
      topic: String(item.topic ?? ''),
      title: String(item.title ?? ''),
      created_at: Number(item.created_at ?? 0),
      status: String(item.status ?? 'active'),
      impl: String(item.impl ?? ''),
      version: Number(item.version ?? 1),
      sources: sources.length,
      sourceTypes: sources
        .map((source) => String((source as { type?: unknown })?.type ?? ''))
        .filter((type) => type !== ''),
      tags: tags.map((tag) => String(tag)).filter((tag) => tag.trim() !== ''),
      updated_at: Number(item.updated_at ?? item.created_at ?? 0),
    });
  }
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

/** 去掉 frontmatter 里的引号。 */
function unquote(value: string): string {
  return value
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

/** 取 `YYYY-MM-DD` 前缀（core 写的就是这个形状；带时间也认得）。 */
function dateOf(value: string): string {
  const matched = /^\d{4}-\d{2}-\d{2}/.exec(unquote(value));
  return matched ? matched[0] : '';
}

/** frontmatter 的行内数组：`["a", "b"]`（正常）或 `a, b`（手写）。 */
function arrayOf(value: string): string[] {
  const body = value.trim();
  const items: string[] = [];
  if (body.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed)) for (const item of parsed) items.push(String(item));
    } catch {
      // 半截/手写的数组退回分隔符切分：宁可多给几个词，也不要整份丢。
      for (const part of body.replace(/^\[|\]$/g, '').split(',')) items.push(part);
    }
  } else {
    for (const part of body.split(/[,\s]+/)) items.push(part);
  }
  return items.map((item) => unquote(item)).filter((item) => item !== '');
}

function addUnique(list: string[], value: string): void {
  const item = value.trim();
  if (item === '' || list.includes(item)) return;
  list.push(item);
}

/**
 * 解析笔记头部（**纯函数**，测试与自检直接断言它）。
 *
 * 一份解析要认两种布局，因为知识库里两种笔记的来源不同：
 *   - 问答笔记：frontmatter 的 `tags` / `created_at` / `updated_at`（core 用 YAML 行内数组写）；
 *   - 整理件：**没有 frontmatter**，只有 `>Date :  2026-10-06` 这类元信息行。
 * 字段名大小写、全/半角冒号、`> Wiki：` 前的空格都容忍（core 写的是 `> Wiki： [[标题]]`）。
 */
export function parseNoteHead(head: string): NoteHead {
  const lines = head.split(/\r?\n/);
  const result: NoteHead = { tags: [], createdAt: '', updatedAt: '', wiki: [] };
  let inFrontmatter = false;
  /** 文件不是以 `---` 开头（整理件）时，一开始就当 frontmatter 已结束。 */
  let frontmatterClosed = !(lines.length > 0 && lines[0].trim() === '---');

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!frontmatterClosed) {
      if (index === 0) {
        inFrontmatter = true;
        continue;
      }
      if (line.trim() === '---') {
        inFrontmatter = false;
        frontmatterClosed = true;
        continue;
      }
      if (!inFrontmatter) {
        frontmatterClosed = true;
        continue;
      }
      const field = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (field === null) continue;
      const key = field[1];
      const value = field[2];
      if (key === 'tags') for (const tag of arrayOf(value)) addUnique(result.tags, tag);
      else if (key === 'related_wiki') for (const title of arrayOf(value)) addUnique(result.wiki, title);
      else if (key === 'created_at') result.createdAt = result.createdAt || dateOf(value);
      else if (key === 'updated_at') result.updatedAt = result.updatedAt || dateOf(value);
      continue;
    }
    const meta = /^>\s*([^:：]*)[:：]\s*(.*)$/.exec(line);
    if (meta === null) continue;
    const key = meta[1].trim().toLowerCase();
    const value = meta[2];
    if (key === 'date') {
      const date = dateOf(value);
      if (date !== '') {
        result.createdAt = result.createdAt || date;
        result.updatedAt = result.updatedAt || date;
      }
    } else if (key === 'tags') {
      for (const matched of value.matchAll(/#([^\s#]+)/g)) addUnique(result.tags, matched[1]);
    } else if (key === 'wiki') {
      for (const matched of value.matchAll(/\[\[([^\]]+)\]\]/g)) addUnique(result.wiki, matched[1]);
    }
  }
  return result;
}

/** 读笔记头部（**有界**）：正文可以很长，而关键词/日期/相关主题都在开头。 */
async function readNoteHead(path: string, size: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const length = Math.max(0, Math.min(size, NOTE_HEAD_BYTES));
    if (length === 0) return '';
    const buffer = Buffer.alloc(length);
    const read = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, read.bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

/** 知识库某个笔记目录里的 markdown（按 mtime 倒序）。 */
async function readNoteDir(mdRoot: string, subdir: string, limit: number, problems: string[]): Promise<NoteRow[]> {
  const dir = join(mdRoot, subdir);
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.md'));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') problems.push(`${dir}: ${String(error)}`);
    return [];
  }

  const rows: NoteRow[] = [];
  for (const name of names) {
    const path = join(dir, name);
    try {
      const info = await stat(path);
      const head = await readNoteHead(path, info.size);
      rows.push({ name, path, mtimeMs: info.mtimeMs, bytes: info.size, ...parseNoteHead(head) });
    } catch (error) {
      problems.push(`${path}: ${String(error)}`);
    }
  }
  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}

/** 从 status.json 带回的 config 里取一个正整数（缺失/非法就回落到 core 的默认值）。 */
function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export interface SnapshotOptions {
  dataRoot: string;
  /** 面板显示条数上限（1..50）。 */
  recentLimit: number;
  /** core 缺失时的知识库兜底位置（与 @oblivion/core 的 DEC-029 一致）。 */
  fallbackMdRoot: string;
  now?: () => number;
}

export async function buildSnapshot(options: SnapshotOptions): Promise<PanelSnapshot> {
  const problems: string[] = [];
  const limit = Math.min(50, Math.max(1, Math.floor(options.recentLimit) || 10));
  const now = options.now ?? (() => Date.now());

  const core = (await readJsonCapped(join(options.dataRoot, 'status.json'), problems)) as CoreStatusShape | null;
  const mdRoot = typeof core?.mdRoot === 'string' && core.mdRoot !== '' ? core.mdRoot : options.fallbackMdRoot;

  // 裁剪口径来自 core 落盘的 config（它把整份 config 写进了 status.json），
  // 读不到就用 core 的默认值 —— 这样面板的实时统计与 core 的历史统计可比。
  const config = core?.config ?? {};
  const retentionDays = positiveInt(config.statsRetentionDays, FALLBACK_RETENTION_DAYS);
  const maxEntries = positiveInt(config.statsMaxEntries, FALLBACK_MAX_ENTRIES);
  const tracePath = join(options.dataRoot, 'decisions.jsonl');

  const [decisions, items, notes, digests, wikis] = await Promise.all([
    readDecisions(tracePath, { retentionDays, maxEntries, now: now() }, problems),
    // 条目按**宽窗口**读：客户端要把「同主题的多版」聚成一行（被降级的旧版也在其中），
    // 只读 limit 条会把版本历史截断，于是「共 N 版」永远显示不出来。
    readItems(options.dataRoot, Math.max(limit * 8, 100), problems),
    readNoteDir(mdRoot, QA_NOTE_DIR, limit, problems),
    readNoteDir(mdRoot, DIGEST_NOTE_DIR, limit, problems),
    // 主题页只当字典用（标题 → 路径），所以按同一个窗口读就够。
    readNoteDir(mdRoot, WIKI_NOTE_DIR, limit, problems),
  ]);

  return {
    ok: true,
    generatedAt: now(),
    dataRoot: options.dataRoot,
    mdRoot,
    core: core ?? null,
    live: summarizeDecisions(decisions.rows, {
      parsed: decisions.parsed,
      dropped: decisions.dropped,
      windowDays: retentionDays,
    }),
    trace: { path: tracePath, recent: decisions.rows.slice(-limit), series: decisions.rows.slice(-SERIES_MAX) },
    items,
    notes,
    digests,
    wikis,
    problems,
  };
}
