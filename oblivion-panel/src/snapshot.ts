import { readFile, readdir, stat } from 'node:fs/promises';
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

export interface ItemRow {
  id: string;
  topic: string;
  title: string;
  created_at: number;
  status: string;
  version: number;
  sources: number;
}

export interface NoteRow {
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
  trace: { path: string; recent: DecisionRow[] };
  items: ItemRow[];
  notes: NoteRow[];
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

/** 读 jsonl 的**尾部**若干条（留痕可能很大，不整读）。 */
async function readJsonlTail(path: string, limit: number, problems: string[]): Promise<DecisionRow[]> {
  try {
    const raw = await readFile(path, 'utf8');
    if (raw.length > MAX_JSONL_BYTES) {
      problems.push(`${path} 超过 ${MAX_JSONL_BYTES} 字节，只取尾部`);
    }
    const body = raw.length > MAX_JSONL_BYTES ? raw.slice(raw.length - MAX_JSONL_BYTES) : raw;
    const lines = body.split('\n').filter((line) => line.trim() !== '');
    const tail = lines.slice(-limit);
    const out: DecisionRow[] = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line) as DecisionRow);
      } catch {
        problems.push(`${path}: 有一行不是合法 JSON，已跳过`);
      }
    }
    return out;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') problems.push(`${path}: ${String(error)}`);
    return [];
  }
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
    rows.push({
      id: String(item.id ?? name.replace(/\.json$/, '')),
      topic: String(item.topic ?? ''),
      title: String(item.title ?? ''),
      created_at: Number(item.created_at ?? 0),
      status: String(item.status ?? 'active'),
      version: Number(item.version ?? 1),
      sources: Array.isArray(item.sources) ? item.sources.length : 0,
    });
  }
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}

/** 问答沉淀目录里的笔记（按 mtime 倒序）。 */
async function readNotes(mdRoot: string, limit: number, problems: string[]): Promise<NoteRow[]> {
  const dir = join(mdRoot, '01_问答沉淀');
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
      rows.push({ name, path, mtimeMs: info.mtimeMs, bytes: info.size });
    } catch (error) {
      problems.push(`${path}: ${String(error)}`);
    }
  }
  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
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

  const [recent, items, notes] = await Promise.all([
    readJsonlTail(join(options.dataRoot, 'decisions.jsonl'), limit, problems),
    readItems(options.dataRoot, limit, problems),
    readNotes(mdRoot, limit, problems),
  ]);

  return {
    ok: true,
    generatedAt: now(),
    dataRoot: options.dataRoot,
    mdRoot,
    core: core ?? null,
    trace: { path: join(options.dataRoot, 'decisions.jsonl'), recent },
    items,
    notes,
    problems,
  };
}
