/**
 * 读回**指定 DSH 会话**最近的问答（宿主半边，**只读**）。
 *
 * ## 为什么需要它
 *
 * 注入那条路（`session-inject.ts` / `POST /obl-brand/session/message`）是**只写**的：
 * 消息进了 DSH、回答由 DSH 产出并留在 DSH 的会话存储与 UI 里 —— 调用方（如另一个
 * agent 工具，或一个脚本）看不到回答。于是「在 A 里继续 DSH 会话」这件事永远只能
 * 单向完成。本模块补上反向的一步。
 *
 * ## 为什么读日志而不是问宿主要
 *
 * 宿主不是没有会话数据，而是**没有公开的读取面**：DSH 的会话服务只对
 * `prompt()` 这类写操作开 `@Remote`，读侧要靠内部状态快照（私有、且已经废弃过一轮）。
 * 而会话日志 `<DSH_HOME>/sessions/<工作区>/<会话 id>/session.v4.jsonl.zstd` 是
 * **App 自己持续在写的**（实测：本轮读数时最后一条记录的 `time` 距请求只差几秒），
 * 且只读 ⇒ 不可能像「往日志追加一帧」那样把会话写坏（那条路的坑见 `session-inject.ts` 顶部）。
 *
 * ## 格式（2026-10-17 在本机实测确认）
 *
 * 文件是**多帧拼接**：一个 zstd 帧装一段 JSONL，帧之间没有分隔符 —— 只能按 zstd 的
 * magic（`28 B5 2F FD`）切。注意 **Node 的 `createZstdDecompress` 只解第一帧**，
 * 所以必须像本模块这样逐帧 `zstdDecompressSync`。
 *
 * 文件可以几十 MB，因此只读**尾部窗口**（`readTailBytes`）—— 首/尾两块都可能是半帧，
 * 解不开就跳过（不是损坏）。
 *
 * ## 只取「回答」不取「思维链」
 *
 * `assistant/message` 里的 `reasoning` 块是思考过程，不是答案：本模块只收 `text` 块。
 * 需要留痕时看 `blocks`，别把它混进回答。
 *
 * ## 安全口径
 *
 * 会话正文是私人内容，因此与注入路由同一条规矩：只服务本机调用方（`isTrustedCaller`），
 * 并共用同一个运营者开关（`SESSION_INJECT_ENV`）。会话 id 只用于拼路径 ⇒ 必须过
 * `SESSION_ID_PATTERN`（挡路径穿越）。
 */

import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';

/** 默认返回条数。 */
export const DEFAULT_TAIL_LIMIT = 6;

/** 返回条数上限（挡住「把整条会话一次拉出来」）。 */
export const MAX_TAIL_LIMIT = 50;

/** 单条消息回传的字符上限；超出截断并标 `truncated`。 */
export const MAX_TAIL_TEXT_CHARS = 20_000;

/** 尾部扫描窗口：会话可几十 MB，只读最后这么多字节。 */
export const TAIL_WINDOW_BYTES = 1 << 20;

/** 会话 id 的形状：拼路径用，必须挡住 `..` 与路径分隔符。 */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** 会话日志文件名（DSH 自己定的；换版本要同步改这里）。 */
export const SESSION_LOG_FILE = 'session.v4.jsonl.zstd';

/** zstd 帧 magic。 */
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd] as const;

/** 一条回传的消息。 */
export interface TailMessage {
  /** 会话内的单调序号（DSH 自己的）；用来判断「这条是不是新出现的」。 */
  seq: number;
  /** epoch 毫秒（DSH 的 `time`）。 */
  at: number;
  role: 'user' | 'assistant';
  text: string;
  /** 文本超上限被截断时为 `true`。 */
  truncated?: true;
}

/** 只读一遍的统计（调用方拿它判断「是不是真读到了」）。 */
export interface TailStats {
  /** 文件总字节。 */
  fileBytes: number;
  /** 实际读进来的尾窗字节。 */
  windowBytes: number;
  /** 尾窗里切出来的完整帧数。 */
  frames: number;
  /** 解不开的帧数（首/尾半帧不计）。 */
  brokenFrames: number;
}

export interface TailPayload {
  sessionId: string;
  messages: TailMessage[];
  stats: TailStats;
}

export type TailQueryResult = { ok: true; value: { sessionId: string; limit: number } } | { ok: false; error: string };

/**
 * 解析查询参数（纯函数）。
 *
 * `session` 必填且必须过形状校验；`limit` 缺省 `DEFAULT_TAIL_LIMIT`，非法即报错
 * （**不静默取默认** —— 调用方写错参数时应该看得见）。
 */
export function parseTailQuery(params: { session?: string | null; limit?: string | null }): TailQueryResult {
  const sessionId = (params.session ?? '').trim();
  if (sessionId === '') return { ok: false, error: '缺少 session 参数' };
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { ok: false, error: 'session 含非法字符（只允许字母数字与 . _ -）' };
  }

  const raw = (params.limit ?? '').trim();
  if (raw === '') return { ok: true, value: { sessionId, limit: DEFAULT_TAIL_LIMIT } };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TAIL_LIMIT) {
    return { ok: false, error: `limit 必须是 1..${String(MAX_TAIL_LIMIT)} 的整数` };
  }
  return { ok: true, value: { sessionId, limit } };
}

/**
 * `DSH_HOME` 的解析规则（与 `orphans.ts` / `profile-plugins.ts` 逐字一致）：
 * 环境变量优先、**空串视同未设**，否则 `<homeDir>/.dsh`。
 *
 * 三处各写一份是有意的取舍：这三个模块分属不同主题（清扫 / profile 读取 / 会话读数），
 * 抽公共模块会让「谁依赖谁」变得难读；规则出处是 `orphans.ts`（它把这条写成了注释），
 * 代价由自检兜住（本函数的两个分支各有断言，见 `scripts/selfcheck.mjs`）。
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env, homeDir: string = homedir()): string {
  const configured = (env['DSH_HOME'] ?? '').trim();
  if (configured !== '') return configured;
  return homeDir === '' ? '' : join(homeDir, '.dsh');
}

/**
 * 会话日志的路径：`<sessionsRoot>/<任意工作区目录>/<会话 id>/session.v4.jsonl.zstd`。
 *
 * 工作区目录名是 `cwd` 的可读编码（`--C-Projects-Oblivion--` 这种），随工作区变化，
 * 所以只能扫一层目录找会话目录，不能拼死。找不到返回 `undefined`（路由据此回 404）。
 */
export function findSessionFile(sessionsRoot: string, sessionId: string, list: typeof readdirSync = readdirSync): string | undefined {
  if (!SESSION_ID_PATTERN.test(sessionId)) return undefined;
  let entries: string[];
  try {
    entries = list(sessionsRoot) as unknown as string[];
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const candidate = join(sessionsRoot, entry, sessionId, SESSION_LOG_FILE);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* 不是这个工作区，继续找 */
    }
  }
  return undefined;
}

/** 读文件尾部 `windowBytes` 字节（几十 MB 的会话也只读这一点）。 */
export function readTailBytes(path: string, windowBytes: number = TAIL_WINDOW_BYTES): { buffer: Buffer; fileBytes: number } {
  const size = statSync(path).size;
  const start = Math.max(0, size - windowBytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    let read = 0;
    while (read < length) {
      const got = readSync(fd, buffer, read, length - read, start + read);
      if (got <= 0) break;
      read += got;
    }
    return { buffer: read === length ? buffer : buffer.subarray(0, read), fileBytes: size };
  } finally {
    closeSync(fd);
  }
}

/** 按 magic 切帧，逐帧解压成文本；首/尾半帧静默跳过，中间解不开的计入 `brokenFrames`。 */
export function decodeFrames(buffer: Buffer): { text: string; frames: number; brokenFrames: number } {
  const cuts: number[] = [];
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (buffer[i] === ZSTD_MAGIC[0] && buffer[i + 1] === ZSTD_MAGIC[1] && buffer[i + 2] === ZSTD_MAGIC[2] && buffer[i + 3] === ZSTD_MAGIC[3]) {
      cuts.push(i);
    }
  }
  if (cuts.length === 0) return { text: '', frames: 0, brokenFrames: 0 };
  // 起点不在 magic 上 ⇒ 头部是半帧，从窗口起点再切一刀，让它是「首块」被跳过。
  const starts = cuts[0] === 0 ? cuts : [0, ...cuts];
  starts.push(buffer.length);

  const parts: string[] = [];
  let frames = 0;
  let brokenFrames = 0;
  for (let index = 0; index + 1 < starts.length; index += 1) {
    const chunk = buffer.subarray(starts[index], starts[index + 1]);
    try {
      parts.push(zstdDecompressSync(chunk).toString('utf8'));
      frames += 1;
    } catch {
      const isEdge = index === 0 || index + 2 === starts.length;
      if (!isEdge) brokenFrames += 1;
    }
  }
  return { text: parts.join(''), frames, brokenFrames };
}

/** 取一条记录里的**回答**文本（只收 `text` 块；`reasoning` 是思考过程，不算答案）。 */
export function textOfContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type !== 'text') continue;
    if (typeof typed.text === 'string') parts.push(typed.text);
  }
  return parts.join('\n').trim();
}

/** 从 JSONL 记录里抽 `user/message` 与 `assistant/message`，取最后 `limit` 条。 */
export function extractTailMessages(lines: string[], limit: number): TailMessage[] {
  const out: TailMessage[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof record !== 'object' || record === null) continue;
    const typed = record as {
      type?: unknown;
      seq?: unknown;
      time?: unknown;
      data?: { content?: unknown; message?: { content?: unknown } };
    };
    const role = typed.type === 'user/message' ? 'user' : typed.type === 'assistant/message' ? 'assistant' : undefined;
    if (role === undefined) continue;
    const raw = role === 'user' ? typed.data?.content : typed.data?.message?.content;
    const text = textOfContent(raw);
    if (text === '') continue;
    const truncated = text.length > MAX_TAIL_TEXT_CHARS;
    out.push({
      seq: typeof typed.seq === 'number' ? typed.seq : -1,
      at: typeof typed.time === 'number' ? typed.time : 0,
      role,
      text: truncated ? text.slice(0, MAX_TAIL_TEXT_CHARS) : text,
      ...(truncated ? { truncated: true as const } : {}),
    });
  }
  return out.slice(-limit);
}

/** 读一条会话的尾部问答（把上面几步串起来；找不到文件返回 `undefined`）。 */
export function readSessionTail(
  sessionsRoot: string,
  sessionId: string,
  limit: number,
  windowBytes: number = TAIL_WINDOW_BYTES,
): TailPayload | undefined {
  const file = findSessionFile(sessionsRoot, sessionId);
  if (file === undefined) return undefined;
  const { buffer, fileBytes } = readTailBytes(file, windowBytes);
  const { text, frames, brokenFrames } = decodeFrames(buffer);
  return {
    sessionId,
    messages: extractTailMessages(text.split('\n'), limit),
    stats: { fileBytes, windowBytes: buffer.length, frames, brokenFrames },
  };
}
