#!/usr/bin/env node
/**
 * 存量笔记改名回填（core 0.2.2）。
 *
 * 把 `knowledge/naming.ts` 的「按内容命名」规则回溯应用到**已经落盘**的笔记上：
 * 问句（`ask:` 或旧 `title:`）→ 用 `titleFromQA()` 算出内容名 → 改名 + 同步标签 + 同步条目 JSON。
 *
 * 默认 **dry-run**，只打印计划；确认后才 `--apply`。改名逻辑不在这个脚本里自己实现，
 * 而是走 `lib/testkit.js` 导出的 `applyRetitle()` —— 与模型面工具 `oblivion_retitle` 同一套代码，
 * 避免「脚本改一套、工具另改一套」的口径漂移。
 *
 * 用法：
 *   node scripts/rename-notes.mjs                       # 预览
 *   node scripts/rename-notes.mjs --apply               # 落地
 *   node scripts/rename-notes.mjs --apply --clean-tmp   # 顺带清掉原子写残留的 .*.tmp
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const kit = await import(pathToFileURL(join(HERE, 'lib', 'testkit.js')).href);
const { DEFAULT_CONFIG, expandHome, fileNameOf, listNotes, contentSection, parseNote, applyRetitle, titleFromQA, tagsFromQA, writeIndexNote } = kit;

const SKIP_DIRS = new Set(['00-Index', '50-Conflicts', '04_会话整理', 'node_modules']);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const value = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const apply = flag('apply');
const withTags = !flag('no-tags');
const cleanTmp = flag('clean-tmp');
const asJson = flag('json');
const limit = Number(value('limit', '0')) || 0;
const tmpAgeMin = Number(value('tmp-age-min', '10')) || 10;
const mdRoot = resolve(expandHome(value('root', DEFAULT_CONFIG.mdRoot)));
const dataDir = resolve(expandHome(value('data', '~/.oblivion/data')));
const dirFilter = value('dirs', '') ? value('dirs', '').split(',').map((s) => s.trim()).filter(Boolean) : null;

function sameTags(a, b) {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/** 清理原子写残留：`.<pid>-<ts>-<rand>.tmp`。只删「足够旧」的，避免撞上正在进行的写入。 */
async function sweepTmp(dir, recursive, depth = 0) {
  const removed = [];
  const skipped = [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive && depth < 4 && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        const nested = await sweepTmp(path, true, depth + 1);
        removed.push(...nested.removed);
        skipped.push(...nested.skipped);
      }
      continue;
    }
    if (!entry.name.endsWith('.tmp')) continue;
    const info = await stat(path).catch(() => null);
    const ageMin = info ? (Date.now() - info.mtimeMs) / 60000 : 0;
    if (ageMin < tmpAgeMin) {
      skipped.push({ path, ageMin });
      continue;
    }
    if (apply) {
      const ok = await rm(path, { force: true }).then(() => true).catch(() => false);
      if (!ok) {
        skipped.push({ path, ageMin, error: 'delete-failed' });
        continue;
      }
    }
    removed.push({ path, size: info ? info.size : 0, ageMin });
  }
  return { removed, skipped };
}

const dirs = (await readdir(mdRoot, { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.'))
  .map((e) => e.name)
  .filter((name) => !dirFilter || dirFilter.includes(name))
  .sort();

const plan = [];
for (const dir of dirs) {
  const dirPath = join(mdRoot, dir);
  const notes = await listNotes(dirPath, limit);
  for (const note of notes) {
    const raw = await readFile(note.path, 'utf8').catch(() => '');
    if (raw === '') continue;
    const parsed = parseNote(raw);
    const question = note.ask || note.title;
    const answer = contentSection(parsed.body);
    const title = titleFromQA(question, answer);
    // `untitled` = 「这条没算出内容名」。这时候**别改**：`对比这两个.md → untitled.md` 是纯损失。
    if (title === 'untitled' || title === '') continue;
    const tags = withTags ? tagsFromQA(question, answer, note.topic ? [note.topic] : []) : note.tags;
    const nextFile = fileNameOf({ title, topic: note.topic }) + '.md';
    const renamed = nextFile !== note.file;
    const retagged = withTags && !sameTags(tags, note.tags);
    if (!renamed && !retagged) continue;
    plan.push({ dir, dirPath, id: note.id, file: note.file, nextFile, title, tags, renamed, retagged, ask: question });
  }
}

const result = { apply, mdRoot, dataDir, planned: plan.length, renamed: plan.filter((p) => p.renamed).length, retagged: plan.filter((p) => p.retagged).length, notes: plan };

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${apply ? '应用' : '预览（加 --apply 才落地）'}：知识库 ${mdRoot}`);
  console.log(`扫描目录：${dirs.join(' / ') || '（无）'}`);
  for (const item of plan) {
    const mark = item.renamed ? '改名' : '标签';
    const tail = item.tags.length > 0 ? `  [${item.tags.join(', ')}]` : '';
    console.log(`  ${mark} ${item.dir}/${item.file} → ${item.renamed ? item.nextFile : item.file}${tail}`);
  }
  console.log(`共 ${plan.length} 篇需要动：改名 ${result.renamed}、只改标签 ${plan.filter((p) => p.retagged && !p.renamed).length}`);
}

if (apply && plan.length > 0) {
  const byDir = new Map();
  for (const item of plan) {
    if (!byDir.has(item.dirPath)) byDir.set(item.dirPath, []);
    byDir.get(item.dirPath).push({ id: item.id, title: item.title, tags: withTags ? item.tags : undefined });
  }
  let ok = 0;
  const failures = [];
  for (const [dirPath, entries] of byDir) {
    const results = await applyRetitle({ mdDir: dirPath, dataDir }, entries);
    for (const r of results) {
      if (r.ok) ok += 1;
      else failures.push(`${r.id}: ${r.error}`);
    }
  }
  console.log(`\n落地完成：成功 ${ok} / 计划 ${plan.length}${failures.length ? `，失败 ${failures.length}：${failures.join('; ')}` : ''}`);

  const itemFiles = (await readdir(dataDir).catch(() => [])).filter((f) => f.endsWith('.json') && !f.startsWith('conflict-'));
  const items = [];
  for (const file of itemFiles) {
    try {
      const parsed = JSON.parse(await readFile(join(dataDir, file), 'utf8'));
      if (parsed && typeof parsed.id === 'string') items.push(parsed);
    } catch {
      /* 单条坏了不影响重建索引 */
    }
  }
  const indexPath = await writeIndexNote(mdRoot, items);
  console.log(`索引已重建：${indexPath}（${items.length} 条）`);
}

if (cleanTmp) {
  const inKb = await sweepTmp(mdRoot, true);
  const inData = await sweepTmp(dataDir, false);
  const removed = [...inKb.removed, ...inData.removed];
  const total = removed.reduce((sum, r) => sum + r.size, 0);
  console.log(`\n残留临时文件：${apply ? '已删' : '待删（加 --apply）'} ${removed.length} 个 / ${total} 字节`);
  for (const r of removed.slice(0, 20)) console.log(`  ${r.path}  ${r.size} B  ${r.ageMin.toFixed(0)} 分钟前`);
  if (removed.length > 20) console.log(`  …另有 ${removed.length - 20} 个`);
  const skipped = [...inKb.skipped, ...inData.skipped];
  for (const s of skipped.slice(0, 5)) {
    console.log(`  跳过 ${s.path}（${s.error ?? `${s.ageMin.toFixed(0)} 分钟前，太新`}）`);
  }
  if (skipped.length > 5) console.log(`  …另有 ${skipped.length - 5} 个太新，跳过`);
}
