import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 知识库目录树装配（只读、有上限、不跟随用户输入拼路径）。
 *
 * 与 `snapshot.ts` 同一套安全边界：路径全部来自插件 config / core 的 status.json，
 * 读取有深度与数量上限，任何子目录读失败只记一条 problem，不让整棵树失败。
 */

export interface KbTreeNode {
  /** 条目名（目录或文件）。 */
  name: string;
  /** 相对 mdRoot 的路径（'/' 分隔；根节点为 ''）。 */
  relPath: string;
  kind: 'dir' | 'file';
  /** 仅目录节点；按 name 排序、文件排在子目录之后。 */
  children?: KbTreeNode[];
}

export interface KbTreeResult {
  ok: boolean;
  /** 实际使用的知识库根（core.mdRoot 优先，缺则 fallback）。 */
  mdRoot: string;
  mdRootSource: 'core' | 'fallback';
  tree: KbTreeNode[];
  /** 是否因深度/数量上限被裁剪。 */
  truncated: boolean;
  fileCount: number;
  dirCount: number;
  problems: string[];
}

export interface KbTreeOptions {
  /** core status.json 带回的 mdRoot（可能缺失）。 */
  coreMdRoot?: string;
  /** core 缺失时的兜底知识库位置（已展开 `~`）。 */
  fallbackMdRoot: string;
  /** 目录递归深度上限（不含根本身），默认 4。 */
  maxDepth?: number;
  /** 每个目录内最多列出的条目数（目录+文件合计），默认 100。 */
  maxEntriesPerDir?: number;
  /** 整棵树最多产出的节点总数，默认 800。 */
  maxNodes?: number;
}

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ENTRIES_PER_DIR = 100;
const DEFAULT_MAX_NODES = 800;

/**
 * 装配一棵有界的知识库目录树。
 *
 * 排序约定：目录在前、按 name 字典序；文件在后、按 name 字典序。
 * 超限裁剪只发生在「节点总数 / 每层条目数 / 深度」三处，全部汇总进 `truncated`。
 */
export async function buildKbTree(options: KbTreeOptions): Promise<KbTreeResult> {
  const problems: string[] = [];
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntriesPerDir = options.maxEntriesPerDir ?? DEFAULT_MAX_ENTRIES_PER_DIR;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;

  const coreMdRoot = typeof options.coreMdRoot === 'string' && options.coreMdRoot !== '' ? options.coreMdRoot : undefined;
  const mdRoot = coreMdRoot ?? options.fallbackMdRoot;
  const mdRootSource = coreMdRoot !== undefined ? 'core' : 'fallback';

  const counters = { files: 0, dirs: 0, nodes: 0 };
  let truncated = false;

  async function walk(dirPath: string, relDir: string, depth: number): Promise<KbTreeNode[]> {
    if (counters.nodes >= maxNodes) {
      truncated = true;
      return [];
    }
    let entries: Array<{ name: string; isDir: boolean }> = [];
    try {
      const names = await readdir(dirPath);
      for (const name of names) {
        if (counters.nodes >= maxNodes) {
          truncated = true;
          break;
        }
        let isDir = false;
        try {
          isDir = (await stat(join(dirPath, name))).isDirectory();
        } catch {
          // 条目 stat 失败（竞态删除等）：跳过，不记 problem（目录级 read 失败才记）
          continue;
        }
        entries.push({ name, isDir });
      }
    } catch (error) {
      problems.push(`${dirPath}: ${String(error)}`);
      return [];
    }

    const dirs = entries.filter((e) => e.isDir).map((e) => e.name);
    const files = entries.filter((e) => !e.isDir).map((e) => e.name);
    const overflow = entries.length > maxEntriesPerDir;
    if (overflow) truncated = true;

    const nodeLimit = overflow ? maxEntriesPerDir : entries.length;
    // 目录优先保留（文件可后续进深层目录看），超出名额时先裁文件
    const dirNames = dirs.slice(0, nodeLimit);
    const fileNames = files.slice(0, Math.max(0, nodeLimit - dirNames.length));

    const result: KbTreeNode[] = [];

    for (const name of dirNames) {
      counters.nodes += 1;
      counters.dirs += 1;
      const relPath = relDir === '' ? name : relDir + '/' + name;
      const children =
        depth + 1 <= maxDepth && counters.nodes < maxNodes
          ? await walk(join(dirPath, name), relPath, depth + 1)
          : undefined;
      if (depth + 1 > maxDepth) truncated = true;
      result.push({ name, relPath, kind: 'dir', children });
    }

    for (const name of fileNames) {
      counters.nodes += 1;
      counters.files += 1;
      const relPath = relDir === '' ? name : relDir + '/' + name;
      result.push({ name, relPath, kind: 'file' });
    }

    return result;
  }

  const tree = await walk(mdRoot, '', 0);

  return {
    // 根目录读失败（mdRoot 不存在 / 无权限）：problems 非空，如实报 `ok: false`，
    // 调用方（路由 / UI）据此区分「树是真的空」和「树读不出来」。
    ok: problems.length === 0,
    mdRoot,
    mdRootSource,
    tree,
    truncated,
    fileCount: counters.files,
    dirCount: counters.dirs,
    problems,
  };
}

/** 仅取 status.json 里的 mdRoot（与 snapshot.ts 的 readJsonCapped 相同口径：256 KB 上限）。 */
export async function readCoreMdRoot(dataRoot: string): Promise<string | undefined> {
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(join(dataRoot, 'status.json'), 'utf8');
    if (text.length > 256 * 1024) return undefined;
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && 'mdRoot' in parsed) {
      const mdRoot = (parsed as { mdRoot?: unknown }).mdRoot;
      return typeof mdRoot === 'string' && mdRoot !== '' ? mdRoot : undefined;
    }
  } catch {
    // status.json 缺失 / 坏 JSON：走 fallback
  }
  return undefined;
}

// ── 文件内容读取（两栏面板右栏用；只读、有上限）─────────────────────

export interface KbFileResult {
  ok: boolean;
  /** 相对 mdRoot 的路径（'/' 分隔，与目录树节点 relPath 同口径）。 */
  relPath: string;
  /** 文件文本内容（成功时）。 */
  content?: string;
  /** 是否因上限被截断。 */
  truncated?: boolean;
  /** 失败原因（ok:false 时）。 */
  error?: string;
}

const MAX_KB_FILE_BYTES = 512 * 1024;

/**
 * 读取 mdRoot 下一个文件的文本内容。
 *
 * 安全边界与 buildKbTree 同一套：
 *   - 路径只接受相对 mdRoot 的 `relPath`（'/' 分隔），`..` 与绝对路径一律拒绝；
 *   - 超过 MAX_KB_FILE_BYTES 只读前 512 KB 并标 `truncated`。
 */
export async function readKbFile(
  mdRoot: string,
  relPath: string,
  coreMdRoot?: string,
): Promise<KbFileResult> {
  const clean = typeof relPath === 'string' ? relPath.replace(/\\/g, '/') : '';
  if (clean === '' || clean.startsWith('/')) {
    return { ok: false, relPath: clean, error: '非法路径：必须是非空相对路径' };
  }
  const segments = clean.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return { ok: false, relPath: clean, error: '非法路径：含 `..` 或空段' };
  }
  const root = (typeof coreMdRoot === 'string' && coreMdRoot !== '' ? coreMdRoot : mdRoot).replace(/\\/g, '/');
  const absPath = segments.length === 1 ? join(root, segments[0]) : segments.map((s, i) => join(root, segments.slice(0, i + 1).join('/'))).pop()!;

  try {
    const { readFile, stat } = await import('node:fs/promises');
    const st = await stat(absPath);
    if (!st.isFile()) {
      return { ok: false, relPath: clean, error: '不是文件' };
    }
    const truncated = st.size > MAX_KB_FILE_BYTES;
    const text = await readFile(absPath, 'utf8');
    const content = truncated ? text.slice(0, MAX_KB_FILE_BYTES) : text;
    return { ok: true, relPath: clean, content, truncated: truncated || undefined };
  } catch (error) {
    return { ok: false, relPath: clean, error: String(error) };
  }
}

// ── 文件写入（编辑模式：保存 md 内容到磁盘；只写已存在文件，不建目录）──────────

export interface KbWriteResult {
  ok: boolean;
  /** 写入的相对路径。 */
  relPath: string;
  /** 失败原因。 */
  error?: string;
  /** 写入字节数（UTF-8）。 */
  bytesWritten?: number;
}

const MAX_KB_WRITE_BYTES = 512 * 1024;

/**
 * 将编辑后的文本写回 mdRoot 下的文件。
 *
 * 安全边界：
 *   - 路径校验与 readKbFile 同一套（`..`/绝对路径/空段 一律拒绝）；
 *   - 目标文件必须已存在（stat 失败或不是文件 → 拒绝，不新建文件）；
 *   - 内容超过 MAX_KB_WRITE_BYTES 拒绝写入（防止意外写爆）；
 *   - 写入走 `writeFile`（原子替换，不做 append / 合并）。
 */
export async function writeKbFile(
  mdRoot: string,
  relPath: string,
  content: string,
  coreMdRoot?: string,
): Promise<KbWriteResult> {
  const clean = typeof relPath === 'string' ? relPath.replace(/\\/g, '/') : '';
  if (clean === '' || clean.startsWith('/')) {
    return { ok: false, relPath: clean, error: '非法路径：必须是非空相对路径' };
  }
  const segments = clean.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return { ok: false, relPath: clean, error: '非法路径：含 `..` 或空段' };
  }
  if (typeof content !== 'string') {
    return { ok: false, relPath: clean, error: 'content 必须为字符串' };
  }
  const utf8Bytes = new TextEncoder().encode(content).length;
  if (utf8Bytes > MAX_KB_WRITE_BYTES) {
    return { ok: false, relPath: clean, error: '内容超过 512 KB 上限，拒绝写入' };
  }
  const root = (typeof coreMdRoot === 'string' && coreMdRoot !== '' ? coreMdRoot : mdRoot).replace(/\\/g, '/');
  const absPath = segments.length === 1 ? join(root, segments[0]) : segments.map((s, i) => join(root, segments.slice(0, i + 1).join('/'))).pop()!;

  try {
    const { writeFile, stat } = await import('node:fs/promises');
    const st = await stat(absPath);
    if (!st.isFile()) {
      return { ok: false, relPath: clean, error: '目标不是文件，拒绝写入' };
    }
    await writeFile(absPath, content, 'utf8');
    return { ok: true, relPath: clean, bytesWritten: utf8Bytes };
  } catch (error) {
    return { ok: false, relPath: clean, error: String(error) };
  }
}
