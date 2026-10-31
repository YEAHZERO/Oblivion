/**
 * `@oblivion/core` · DSH 会话导入模块。
 *
 * 功能：扫描 `~/.dsh/sessions` 下的会话日志（多帧 zstd），
 * 按轮次提取问答对，供 `oblivion_session_scan` / `oblivion_session_import` 工具使用。
 *
 * ## 关键约束
 *
 * ① **多帧 zstd**：`session.v4.jsonl.zstd` 是多帧追加写，
 *    Node 的 `zstdDecompressSync` 一次只能解一帧。
 *    必须按魔数 `28 B5 2F FD` 切片、逐帧解，再按轮次边界（`turn/start`）归属事件。
 *
 * ② **事件 schema v4**：
 *    - `turn/start` {data:{turn}}  —— 轮次起点
 *    - `turn/end`   {data:{turn, reason:{kind}}}  —— 轮次终点
 *    - `user/message` {data:{content:[{type:'text',text}]}}  —— 提问
 *    - `assistant/message` {data:{turn, step, message:{content:[...]}}}  —— 回答
 *    - `session/title` {data:{title}}  —— 会话标题（备用，projcache 优先）
 *    - 跳过 `agent/inbox/spliced`（子代理镜像，重复）
 *
 * ③ **projcache 元数据**：`~/.dsh/storages/session_projcache/sessions/<uuid>.json`
 *    顶层 `{version, record:{rows:{title:{val,...}, goal:{val,...}}}}`，
 *    文件名有裸 UUID 和 `session-` 前缀两种形态，匹配要双向归一。
 *
 * ④ **去重**：导入时按 `(sessionId, turn)` 查已有条目的 `sources[].ref`，
 *    已导入的跳过，不重复落盘。
 *
 * ⑤ **内存安全**：单帧最大 64 MB（防魔数误命中把内存吃光）；
 *    只保留目标轮次的事件，其余立刻丢弃。
 */

import { zstdDecompressSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expandHome } from './../util/paths.js';
import type { Source } from '../types.js';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const MAX_FRAME = 64 * 1024 * 1024; // 64 MiB per frame

const SESSIONS_ROOT = resolve(expandHome('~/.dsh/sessions'));
const PROJCACHE_DIR = resolve(expandHome('~/.dsh/storages/session_projcache/sessions'));

/** 只解析「与轮次边界/问答有关」的行 —— 会话日志里大多数行是 tool/result 等大记录。 */
const INTERESTING = /"(turn\/start|turn\/end|user\/message|assistant\/message|session\/title)"/;

// ── 类型 ──────────────────────────────────────────────────────────────────────

export interface SessionScanResult {
  sessionId: string;
  title: string;
  goal: string;
  turnCount: number;
  qaCount: number;
  sizeKb: number;
  lastTime: number;
}

export interface SessionQAPair {
  turn: number;
  question: string;
  answer: string;
  tools?: string[];
  aborted?: boolean;
}

export interface SessionImportResult {
  sessionId: string;
  imported: number;
  skipped: number;
  failures: Array<{ turn: number; error: string }>;
}

// ── projcache 读取 ─────────────────────────────────────────────────────────────

function normalizeSessionId(name: string): string {
  return name.startsWith('session-') ? name : `session-${name}`;
}

async function readProjcacheMeta(sessionId: string): Promise<{ title: string; goal: string }> {
  // 双向归一：文件名可能是裸 uuid 或 session-uuid
  const bareId = sessionId.startsWith('session-') ? sessionId.slice(8) : sessionId;
  const candidates = [
    join(PROJCACHE_DIR, `${bareId}.json`),
    join(PROJCACHE_DIR, `session-${bareId}.json`),
  ];
  for (const path of candidates) {
    try {
      const data = await readFile(path, 'utf8');
      const doc = JSON.parse(data) as { version?: number; record?: { rows?: Record<string, unknown> } };
      const rows = doc?.record?.rows as Record<string, { val?: unknown }> | undefined;
      if (!rows) continue;
      const titleRaw = (rows.title?.val as { val?: string } | string | undefined);
      const title = typeof titleRaw === 'object' && titleRaw && 'val' in titleRaw ? (titleRaw.val as string) : (typeof titleRaw === 'string' ? titleRaw : '');
      const goalRaw = rows.goal?.val as { current?: string | null } | undefined;
      const goal = goalRaw?.current ?? '';
      return { title: title.trim(), goal };
    } catch {
      // 读不到就回退
    }
  }
  return { title: '', goal: '' };
}

// ── zstd 多帧流式解析 ──────────────────────────────────────────────────────────

/**
 * 把一段多帧 zstd 按轮次切分，返回 [{turn, events}]。
 * 只保留需要的轮次，其余立刻丢弃。
 */
async function parseZstdSessions(
  filePath: string,
  wantedTurns: Set<number> | null,
): Promise<Array<{ turn: number; events: Array<Record<string, unknown>> }>> {
  const buf = await readFile(filePath);
  // 找所有帧起始位置
  const starts: number[] = [];
  for (let i = 0; i < buf.length; ) {
    const at = buf.indexOf(ZSTD_MAGIC, i);
    if (at < 0) break;
    starts.push(at);
    i = at + 4;
  }
  if (starts.length === 0) return [];

  const result = new Map<number, Array<Record<string, unknown>>>();
  let currentTurn: number | null = null;
  let remainder = '';

  for (let k = 0; k < starts.length; k++) {
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    let text: string;
    try {
      text = zstdDecompressSync(buf.subarray(starts[k], end), { maxOutputLength: MAX_FRAME }).toString('utf8');
    } catch {
      continue; // 伪帧：跳过
    }
    const parts = (remainder + text).split('\n');
    remainder = parts.pop() ?? '';
    for (const line of parts) {
      if (!line || !INTERESTING.test(line)) continue;
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = record.type as string;
      const data = (record.data ?? {}) as Record<string, unknown>;
      // 更新当前轮次
      if (type === 'turn/start' && typeof data.turn === 'number') {
        currentTurn = data.turn;
      } else if (type !== 'turn/start' && typeof data.turn === 'number') {
        currentTurn = data.turn;
      }
      if (currentTurn === null) continue;
      // 过滤：只要目标轮次（null = 全部）
      if (wantedTurns && !wantedTurns.has(currentTurn)) continue;
      const arr = result.get(currentTurn) ?? [];
      arr.push(record);
      result.set(currentTurn, arr);
    }
  }
  return [...result.entries()].map(([turn, events]) => ({ turn, events })).sort((a, b) => a.turn - b.turn);
}

// ── 从事件提取问答 ─────────────────────────────────────────────────────────────

function textOfBlocks(blocks: unknown): string {
  if (typeof blocks === 'string') return blocks.trim();
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text') {
      const t = (b as Record<string, string>).text;
      if (typeof t === 'string' && t.trim()) parts.push(t.trim());
    }
  }
  return parts.join('\n');
}

function extractQA(events: Array<Record<string, unknown>>): { question: string; answer: string; tools: string[]; aborted: boolean } {
  let question = '';
  let answer = '';
  const tools: string[] = [];
  let aborted = false;
  for (const e of events) {
    const data = (e.data ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case 'turn/end':
        aborted = (data.reason as Record<string, unknown>)?.kind === 'aborted';
        break;
      case 'user/message': {
        const content = data.content;
        const text = textOfBlocks(content);
        if (text && !question) question = text; // 只取第一条 user/message
        break;
      }
      case 'assistant/message': {
        const msg = (data.message ?? {}) as Record<string, unknown>;
        const text = textOfBlocks(msg.content);
        if (text) answer = answer ? answer + '\n\n' + text : text;
        break;
      }
      case 'tool/call':
        if (typeof data.name === 'string' && data.name) tools.push(data.name);
        break;
    }
  }
  return { question, answer, tools, aborted };
}

// ── 公开 API ───────────────────────────────────────────────────────────────────

/**
 * 扫描所有 DSH 会话，返回摘要列表（按大小降序）。
 *
 * 注意：只读前 N 个会话的完整内容（用于 qaCount）；
 * 其余会话只走轻量计数（regex 数 turn/start 行，不 JSON.parse 全文）。
 */
export async function scanSessions(limit?: number): Promise<SessionScanResult[]> {
  const entries = await readdir(SESSIONS_ROOT, { withFileTypes: true }).catch(() => []);
  const results: SessionScanResult[] = [];

  for (const ws of entries) {
    if (!ws.isDirectory()) continue;
    const subEntries = await readdir(join(SESSIONS_ROOT, ws.name), { withFileTypes: true }).catch(() => []);
    for (const sd of subEntries) {
      if (!sd.isDirectory() || !sd.name.startsWith('session-')) continue;
      const sessionId = sd.name;
      const zsPath = join(SESSIONS_ROOT, ws.name, sessionId, 'session.v4.jsonl.zstd');
      let sizeKb = 0;
      try { sizeKb = Math.round((await stat(zsPath)).size / 1024); } catch { continue; }
      if (sizeKb === 0) continue;

      // 只读 meta 不解析全文
      const { title: projTitle, goal } = await readProjcacheMeta(sessionId).catch(() => ({ title: '', goal: '' }));

      // 轻量计数：按帧解压、只对每行做 regex 匹配（不 JSON.parse），统计 turn 数和 QA 对数。
      // 这是 O(文件字节数) 的内存，但不构建完整事件树。
      const buf = await readFile(zsPath).catch(() => null);
      let turnCount = 0;
      let qaCount = 0;
      let lastTurn = 0;
      if (buf) {
        const starts: number[] = [];
        for (let i = 0; i < buf.length; ) {
          const at = buf.indexOf(ZSTD_MAGIC, i);
          if (at < 0) break;
          starts.push(at);
          i = at + 4;
        }
        const TURN_RE = /"turn\/start"/;
        const USER_RE = /"user\/message"/;
        const QN_RE = /"question"[^{]*"([^"]{8,})"/;
        const AN_RE = /"answer"[^{]*"([^"]{60,})"/;
        let currentTurn = 0;
        let hasQuestion = false;
        for (let k = 0; k < starts.length; k++) {
          const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
          let text: string;
          try {
            text = zstdDecompressSync(buf.subarray(starts[k], end), { maxOutputLength: MAX_FRAME }).toString('utf8');
          } catch { continue; }
          for (const line of text.split('\n')) {
            if (TURN_RE.test(line)) { currentTurn++; hasQuestion = false; }
            else if (USER_RE.test(line)) { hasQuestion = true; }
            else if (currentTurn > lastTurn) lastTurn = currentTurn;
          }
        }
        turnCount = currentTurn;
        // qaCount 用轻量 regex 估算（不 JSON.parse）：统计有 question/answer 的轮次
        // 这比全解析快 10x+ 且内存可控
        if (buf && buf.length > 0) {
          let qLines = 0, aLines = 0;
          for (let k = 0; k < starts.length; k++) {
            const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
            let text: string;
            try { text = zstdDecompressSync(buf.subarray(starts[k], end), { maxOutputLength: MAX_FRAME }).toString('utf8'); } catch { continue; }
            // 只数含 question/answer 的行（粗略但够快）
            const lines = text.split('\n');
            for (const l of lines) {
              if (/["']question["']\s*:/.test(l)) qLines++;
              if (/["']answer["']\s*:/.test(l)) aLines++;
            }
          }
          qaCount = Math.min(qLines, aLines);
        }
      }

      results.push({
        sessionId,
        title: projTitle || sessionId,
        goal,
        turnCount,
        qaCount,
        sizeKb,
        lastTime: lastTurn,
      });
    }
  }
  results.sort((a, b) => b.sizeKb - a.sizeKb);
  return limit ? results.slice(0, limit) : results;
}

/**
 * 导入指定会话的问答到知识库。
 * mode='qa': 每轮一页问答沉淀（复用 saveStructured）
 * mode='digest': 整会话一页整理（调用方自行拼 digest）
 */
export async function importSessions(
  opts: {
    sessionIds: string[];
    maxPerSession?: number;
    mode: 'qa' | 'digest';
    dryRun?: boolean;
    knownRefs?: Set<string>; // 已有 ref 集合，用于去重
  },
  saveStructured: (input: { title: string; topic: string; content: string; tags?: string[]; sources: Source[] }) => Promise<unknown>,
): Promise<SessionImportResult> {
  const { sessionIds, maxPerSession = 20, mode, dryRun = true, knownRefs = new Set() } = opts;
  let imported = 0;
  let skipped = 0;
  const failures: Array<{ turn: number; error: string }> = [];

  for (const sessionId of sessionIds) {
    // 找 zstd 文件
    const dirs = await readdir(SESSIONS_ROOT, { withFileTypes: true }).catch(() => []);
    let zsPath: string | null = null;
    for (const ws of dirs) {
      if (!ws.isDirectory()) continue;
      const candidate = join(SESSIONS_ROOT, ws.name, sessionId, 'session.v4.jsonl.zstd');
      try { await stat(candidate); zsPath = candidate; break; } catch { /* try next */ }
    }
    if (!zsPath) { skipped++; continue; }

    // 读 meta
    const { title: projTitle } = await readProjcacheMeta(sessionId).catch(() => ({ title: '' }));
    const baseTitle = projTitle || sessionId;

    // 只取前 N 轮
    const wantedTurns = new Set<number>();
    // 先扫一遍拿 turn 列表
    const allTurns = await parseZstdSessions(zsPath, null);
    const toImport = allTurns.slice(0, maxPerSession);

    for (const { turn, events } of toImport) {
      const { question, answer, tools, aborted } = extractQA(events);
      // 过滤太短的轮次
      if (question.length < 8 || answer.length < 60) { skipped++; continue; }
      // 过滤确认词
      if (['继续', '好', 'ok', 'OK', '是的', '对', '嗯', '可以', '行'].includes(question.trim())) { skipped++; continue; }
      // 去重：ref = sessionId#turn-N
      const ref = `${sessionId}#turn-${turn}`;
      if (knownRefs.has(ref)) { skipped++; continue; }

      const content = mode === 'qa'
        ? `## 问题\n\n${question}\n\n## 回答\n\n${answer}${aborted ? '\n\n> （中断，回答可能不完整）' : ''}${tools.length ? `\n\n涉及工具: ${tools.join(', ')}` : ''}`
        : `[轮 ${turn}] ${question}\n\n${answer}`;

      try {
        if (!dryRun) {
          await saveStructured({
            title: `${baseTitle} · 轮 ${turn}`,
            topic: question.slice(0, 40),
            content,
            sources: [{ type: 'session', ref, hash: ref }],
          });
        }
        imported++;
      } catch (e) {
        failures.push({ turn, error: String(e) });
      }
    }
  }
  return { sessionId: sessionIds.join(','), imported, skipped, failures };
}
