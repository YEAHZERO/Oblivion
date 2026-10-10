#!/usr/bin/env node
/**
 * 存量笔记「推理剥离」回填（core 0.2.10）。
 *
 * 起因（所有者 2026-10-07）：76 篇笔记里 **40 篇的 `>Note：` 是英文推理碎片** ——
 * 旧 `textOfMessage()` 把 assistant 消息里**所有**带 `text` 的块拼成答案，而推理块与可见
 * 文本块形状相同（都是 `{ type, text }`），于是「Let me start by…」跟着结论一起被沉淀。
 *
 * 修好的抽取逻辑在 `src/qa-loop/extract.ts`（按块类型剥 reasoning/tool-call）；
 * 这个脚本把它**回溯**到已经落盘的笔记：按条目 JSON 的 `sources[0].ref`
 * （`<sessionId>#turn-<n>`）回到 DSH 会话日志，重算那一轮的回答，替换
 * `## 内容` 段与 `>Note：` 行，并同步条目 JSON 的 `content`。
 *
 * 会话日志是**多帧 zstd**（`session.v4.jsonl.zstd`，实测 11,273 帧 / 59.8 MB 明文）：
 * Node 的 `zstdDecompressSync` 一次只能解一帧，所以这里按魔数 `28 B5 2F FD` 切片、逐帧解，
 * 而且**只保留目标轮次的事件**（不然 60 MB 全进内存）。
 *
 * 默认 **dry-run**，只打印计划；确认后才 `--apply`。
 *
 * 用法：
 *   node scripts/repair-reasoning-notes.mjs                 # 预览
 *   node scripts/repair-reasoning-notes.mjs --apply         # 落地
 *   node scripts/repair-reasoning-notes.mjs --json          # 机器可读（预览或落地结果）
 *   node scripts/repair-reasoning-notes.mjs --dirs 01_问答沉淀
 */
import { readdir, readFile, rename, stat, unlink, writeFile as fsWrite } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const kit = await import(pathToFileURL(join(HERE, 'lib', 'testkit.js')).href);
const { DEFAULT_CONFIG, expandHome, listNotes, parseNote, contentSection, extractQAPair } = kit;

const SKIP_DIRS = new Set(['00-Index', '50-Conflicts', '04_会话整理', 'node_modules']);
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
/** 单帧解压上限：正常帧是几十 KB，给 64 MB 只是防「魔数误命中」时把内存吃光。 */
const MAX_FRAME = 64 * 1024 * 1024;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const value = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const apply = flag('apply');
const asJson = flag('json');
const mdRoot = resolve(expandHome(value('root', DEFAULT_CONFIG.mdRoot)));
const dataDir = resolve(expandHome(value('data', '~/.oblivion/data')));
const sessionsRoot = resolve(expandHome(value('sessions', '~/.dsh/sessions')));
const dirFilter = value('dirs', '')
  ? value('dirs', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

/**
 * 只解析「与轮次边界/问答有关」的行 —— 会话日志里大多数行是 `tool/result`、`compaction/*`
 * 这类大记录（实测单条可达数 MB），为了读一个 `type` 去 `JSON.parse` 它们纯属浪费，
 * 而且会把小堆撑爆（首版就是这样 OOM 的）。
 */
const INTERESTING = /"(turn\/start|turn\/end|user\/message|assistant\/message)"/;

/**
 * 把一段多帧 zstd 明文按行交给 `onLine`，**只留需要的轮次**（其余立刻丢）。
 *
 * 轮次归属靠**边界事件**（`turn/start` 的 `data.turn`）而不是每条消息自己的 `data.turn`：
 * 实测 `user/message` 载荷里**没有** `turn` 字段（只有 `assistant/message` 有），
 * 按 `data.turn` 过滤会把所有提问都丢掉 ⇒ `extractQAPair` 全部返回 undefined（首版就这样全灭）。
 */
async function eachLogLine(file, wantedTurns, onLine) {
  const buf = await readFile(file);
  const starts = [];
  for (let i = 0; i < buf.length; ) {
    const at = buf.indexOf(ZSTD_MAGIC, i);
    if (at < 0) break;
    starts.push(at);
    i = at + 4;
  }
  let remainder = '';
  let currentTurn = null;
  let frames = 0;
  let skipped = 0;
  for (let k = 0; k < starts.length; k += 1) {
    const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
    let text;
    try {
      text = zstdDecompressSync(buf.subarray(starts[k], end), { maxOutputLength: MAX_FRAME }).toString('utf8');
    } catch {
      skipped += 1; // 魔数误命中切出来的伪帧：跳过，不影响后续帧
      continue;
    }
    frames += 1;
    const parts = (remainder + text).split('\n');
    remainder = parts.pop() ?? '';
    for (const line of parts) {
      if (!line || !INTERESTING.test(line)) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue; // 半行/坏行：会话日志不许因为一行坏掉就整篇放弃
      }
      const type = record?.type;
      if (type === 'turn/start') {
        if (typeof record?.data?.turn === 'number') currentTurn = record.data.turn;
      } else if (typeof record?.data?.turn === 'number') {
        currentTurn = record.data.turn;
      }
      if (currentTurn === null || !wantedTurns.has(currentTurn)) continue;
      onLine(record, currentTurn);
      if (type === 'turn/end') currentTurn = currentTurn; // 保留到下一个 turn/start：尾部事件仍属本轮
    }
  }
  return { frames, skipped, bytes: buf.length };
}

/** 一次会话只解一遍：把需要的轮次事件攒起来。 */
async function collectTurns(sessionId, wantedTurns) {
  const candidates = [
    join(sessionsRoot, sessionId, 'session.v4.jsonl.zstd'),
    join(sessionsRoot, sessionId, 'session.jsonl.zstd'),
  ];
  const dirs = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    candidates.push(join(sessionsRoot, entry.name, sessionId, 'session.v4.jsonl.zstd'));
  }
  let file = null;
  for (const candidate of candidates) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) {
      file = candidate;
      break;
    }
  }
  if (!file) return { found: false };

  const byTurn = new Map();
  const meta = await eachLogLine(file, wantedTurns, (record, turn) => {
    if (!byTurn.has(turn)) byTurn.set(turn, []);
    byTurn.get(turn).push(record);
  });
  return { found: true, file, byTurn, ...meta };
}

/**
 * 替换 `## 内容` 段。
 *
 * **不能**用「到下一个 `## ` 标题为止」当边界：答案自己就带 `##` 小标题（这就是这些笔记的常态），
 * 那样只会换掉第一段，旧推理还会留在文件后半截 ⇒ 复制粘贴出两份内容。
 * 可靠边界是**最后一个** `<!-- oblivion:id=… -->` 标记（`renderNew()` 把它写在末尾），
 * 从它前面的结构性 `## 来源` 到标记行整段重建，标记之后的内容（`## 关联知识（自动）` 等）原样保留。
 */
function replaceContentSection(raw, content) {
  const head = /^##[ \t]*内容[ \t]*$/m.exec(raw);
  if (!head) return null;
  const headEnd = head.index + head[0].length;
  const markers = [...raw.matchAll(/^<!--[ \t]*oblivion:id=[^\n]*?-->[ \t]*$/gm)];
  const marker = markers.length > 0 ? markers[markers.length - 1] : null;
  if (!marker) {
    // 没有标记：退回「下一个 ## 标题」的弱边界，并标记出来让人工复核。
    const rest = raw.slice(headEnd);
    const next = /^##[ \t]+/m.exec(rest);
    const to = next ? headEnd + next.index : raw.length;
    return {
      text: raw.slice(0, headEnd) + '\n\n' + content + '\n\n' + raw.slice(to).replace(/^\n+/, ''),
      strong: false,
      tail: '',
      replaced: raw.slice(headEnd, to),
    };
  }
  const before = raw.slice(0, marker.index);
  const heads = [...before.matchAll(/^##[ \t]+.*$/gm)];
  const lastHead = heads.length > 0 ? heads[heads.length - 1] : null;
  const tailStart = lastHead ? lastHead.index : marker.index;
  const tail = raw.slice(tailStart, marker.index + marker[0].length);
  const rest = raw.slice(marker.index + marker[0].length);
  const strong = /^##[ \t]*来源/.test(tail);
  return {
    text: raw.slice(0, headEnd) + '\n\n' + content + '\n\n' + tail.trimEnd() + '\n' + rest.replace(/^\n+/, '\n'),
    strong,
    tail: tail.split('\n')[0],
    replaced: raw.slice(headEnd, marker.index + marker[0].length),
  };
}

/**
 * 单文件写入：临时文件 → rename；rename 失败就退回直接写。
 *
 * 为什么脚本自带一份（不 import core 的 `util/fs.ts`）：core 的 `lib/` 是 **esbuild 单文件产物**
 * —— 只有 `lib/index.js` 与 `lib/testkit.js`，不存在 `lib/util/fs.js` 这个子路径。
 * 口径与 `src/util/fs.ts` 的 `writeTextAtomic()` 一致（Windows 上 rename 偶尔 EPERM）。
 */
async function writeText(path, text) {
  const tmp = `${path}.${process.pid}-${Date.now().toString(36)}.tmp`;
  await fsWrite(tmp, text, 'utf8');
  try {
    await rename(tmp, path);
  } catch {
    await unlink(tmp).catch(() => {});
    await fsWrite(path, text, 'utf8');
  }
}

function replaceNoteLine(raw, noteText) {
  const re = /^>[ \t]*Note[：:][ \t]*.*$/m;
  if (!re.test(raw)) return raw;
  return raw.replace(re, '>Note：' + noteText);
}

const dirs = (await readdir(mdRoot, { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
  .map((e) => e.name)
  .filter((name) => !dirFilter || dirFilter.includes(name))
  .sort();

const notes = [];
for (const dir of dirs) {
  const dirPath = join(mdRoot, dir);
  for (const note of await listNotes(dirPath, 1000)) {
    notes.push({ dir, dirPath, note });
  }
}

// ① 先把「每篇笔记需要哪个会话的哪一轮」读出来，再按会话批量解日志。
const refs = [];
for (const entry of notes) {
  const itemPath = join(dataDir, entry.note.id + '.json');
  let item = null;
  try {
    item = JSON.parse(await readFile(itemPath, 'utf8'));
  } catch {
    /* 条目缺失/坏掉：下面按 no-item 记账 */
  }
  const ref = item?.sources?.[0]?.ref ?? '';
  const m = /^(.*)#turn-(\d+)$/.exec(ref);
  refs.push({
    ...entry,
    item,
    ref,
    sessionId: m ? m[1] : '',
    turn: m ? Number(m[2]) : -1,
  });
}

const wanted = new Map();
for (const r of refs) {
  if (!r.sessionId || r.turn < 0) continue;
  if (!wanted.has(r.sessionId)) wanted.set(r.sessionId, new Set());
  wanted.get(r.sessionId).add(r.turn);
}

const sessions = new Map();
for (const [sessionId, turns] of wanted) {
  sessions.set(sessionId, await collectTurns(sessionId, turns));
}

// ② 逐篇重算可见答案。
const plan = [];
const buckets = {
  fixed: 0,
  clean: 0,
  'weak-boundary': 0,
  'no-log': 0,
  'no-turn': 0,
  'no-ref': 0,
  'no-item': 0,
  'no-heading': 0,
  'no-qa': 0,
};
for (const r of refs) {
  const raw = await readFile(r.note.path, 'utf8').catch(() => '');
  if (raw === '') continue;
  const parsed = parseNote(raw);
  const current = contentSection(parsed.body);
  const item = r.item;
  const base = {
    dir: r.dir,
    dirPath: r.dirPath,
    id: r.note.id,
    file: r.note.file,
    ref: r.ref,
    sessionId: r.sessionId,
    turn: r.turn,
  };

  if (!item) {
    buckets['no-item'] += 1;
    plan.push({ ...base, status: 'no-item' });
    continue;
  }
  if (!r.sessionId || r.turn < 0) {
    buckets['no-ref'] += 1;
    plan.push({ ...base, status: 'no-ref' });
    continue;
  }
  const session = sessions.get(r.sessionId);
  if (!session?.found) {
    buckets['no-log'] += 1;
    plan.push({ ...base, status: 'no-log', detail: '日志文件不在 ~/.dsh/sessions 下' });
    continue;
  }
  const events = session.byTurn.get(r.turn);
  if (!events || events.length === 0) {
    buckets['no-turn'] += 1;
    plan.push({ ...base, status: 'no-turn' });
    continue;
  }
  const qa = extractQAPair({ sessionId: r.sessionId, turn: r.turn, events });
  if (!qa) {
    buckets['no-qa'] += 1;
    plan.push({ ...base, status: 'no-qa', detail: '该轮没有真人提问或没有回答' });
    continue;
  }

  const next = qa.answer;
  const noteText = next.replace(/\s+/g, ' ').slice(0, 100);
  const replaced = replaceContentSection(raw, next);
  if (replaced === null) {
    buckets['no-heading'] += 1;
    plan.push({ ...base, status: 'no-heading' });
    continue;
  }
  if (!replaced.strong) {
    // 找不到 `## 内容` → `## 来源` → 标记 这条结构（或标记缺失）：不自动动它，交人工。
    buckets['weak-boundary'] += 1;
    plan.push({ ...base, status: 'weak-boundary', detail: '内容段边界不可靠（缺 oblivion:id 标记或来源段）' });
    continue;
  }
  const finalRaw = replaceNoteLine(replaced.text, noteText);
  const changed = finalRaw !== raw || (item.content ?? '') !== next;
  if (!changed || current.trim() === next.trim()) {
    buckets.clean += 1;
    plan.push({ ...base, status: 'clean', title: r.note.title });
    continue;
  }
  buckets.fixed += 1;
  plan.push({
    ...base,
    status: 'fixed',
    title: r.note.title,
    beforeChars: replaced.replaced.length,
    afterChars: next.length,
    beforeHead: replaced.replaced.replace(/\s+/g, ' ').slice(0, 80),
    afterHead: next.replace(/\s+/g, ' ').slice(0, 80),
    raw: finalRaw,
    itemNext: { ...item, content: next, updated_at: Date.now() },
  });
}

// ③ 顺带体检（只报不改）：`## 关联知识（自动）` 重复段。
const dupLinks = [];
for (const r of refs) {
  const raw = await readFile(r.note.path, 'utf8').catch(() => '');
  const count = (raw.match(/^##[ \t]*关联知识[（(]自动[）)]/gm) ?? []).length;
  if (count > 1) dupLinks.push({ dir: r.dir, file: r.note.file, sections: count });
}

if (apply) {
  let written = 0;
  const failures = [];
  for (const item of plan) {
    if (item.status !== 'fixed') continue;
    try {
      await writeText(join(item.dirPath, item.file), item.raw);
      await writeText(join(dataDir, item.id + '.json'), JSON.stringify(item.itemNext, null, 2) + '\n');
      written += 1;
    } catch (error) {
      failures.push(`${item.id}: ${error?.message ?? error}`);
    }
  }
  console.log(`落地：改写 ${written} / 计划 ${plan.filter((p) => p.status === 'fixed').length} 篇${failures.length ? `，失败 ${failures.length}：${failures.join('; ')}` : ''}`);
}

const summary = {
  apply,
  mdRoot,
  dataDir,
  sessionsRoot,
  scannedNotes: refs.length,
  sessionsRead: [...sessions.entries()].map(([id, s]) => ({
    sessionId: id,
    found: s.found,
    frames: s.frames ?? 0,
    skippedFrames: s.skipped ?? 0,
    bytes: s.bytes ?? 0,
  })),
  buckets,
  fixed: plan.filter((p) => p.status === 'fixed'),
  needsAttention: plan.filter((p) => !['fixed', 'clean'].includes(p.status)),
  duplicateRelatedSections: dupLinks,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`${apply ? '应用' : '预览（加 --apply 才落地）'}：知识库 ${mdRoot}`);
  console.log(`扫描 ${refs.length} 篇笔记，涉及 ${sessions.size} 个会话`);
  console.log(
    `修好 ${buckets.fixed} / 本来干净 ${buckets.clean} / 边界不可靠 ${buckets['weak-boundary']} / 无日志 ${buckets['no-log']} / 找不到轮次 ${buckets['no-turn']} / 无 ref ${buckets['no-ref']} / 无条目 ${buckets['no-item']} / 无内容段 ${buckets['no-heading']} / 无问答对 ${buckets['no-qa']}`,
  );
  for (const item of summary.fixed.slice(0, 12)) {
    console.log(`  修 ${item.dir}/${item.file}`);
    console.log(`      改前 ${item.beforeChars} 字：${item.beforeHead}`);
    console.log(`      改后 ${item.afterChars} 字：${item.afterHead}`);
  }
  if (summary.fixed.length > 12) console.log(`  …另有 ${summary.fixed.length - 12} 篇`);
  if (summary.needsAttention.length > 0) {
    console.log(`另有 ${summary.needsAttention.length} 篇需要人工看：`);
    for (const item of summary.needsAttention.slice(0, 10)) {
      console.log(`  ${item.status} ${item.dir}/${item.file}${item.detail ? '（' + item.detail + '）' : ''}`);
    }
    if (summary.needsAttention.length > 10) console.log(`  …另有 ${summary.needsAttention.length - 10} 篇`);
  }
  if (dupLinks.length > 0) {
    console.log(`\n顺带体检：${dupLinks.length} 篇笔记有重复的「关联知识（自动）」段（本脚本不改）：`);
    for (const item of dupLinks.slice(0, 8)) console.log(`  ${item.sections} 段 ${item.dir}/${item.file}`);
    if (dupLinks.length > 8) console.log(`  …另有 ${dupLinks.length - 8} 篇`);
  }
}
