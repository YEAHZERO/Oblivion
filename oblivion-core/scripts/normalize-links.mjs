// 归一化「关联知识（自动）」双链段：**并成一段 + 去重 + 丢弱标题 + 丢掉指不到文件的链接**。
//
// 背景：`appendRelatedLinks` 从 v0.2.4 起已是单段合并语义、候选池也已过滤弱标题，
// 但现场笔记里可能仍留着旧版本堆出来的重复段（与改名回填后失效的悬空链接）。
// 这个脚本把现有笔记**扫一遍并就地修好**，可以随时重跑（幂等：没有变化就不写盘）。
//
// 用法：
//   node scripts/normalize-links.mjs                      # 干跑，只打印计划
//   node scripts/normalize-links.mjs --apply              # 执行
//   node scripts/normalize-links.mjs --root "D:/我的库" --dirs "01_问答沉淀,02_Wiki页面" --json
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const kit = await import(new URL('../lib/testkit.js', import.meta.url).href);

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const ROOT = resolve(String(arg('root', 'C:/Library/那些渐渐被遗忘')));
const DIRS = String(arg('dirs', '01_问答沉淀,02_Wiki页面'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const NOTE_DIR = DIRS[0];
const APPLY = process.argv.includes('--apply');
const JSON_OUT = process.argv.includes('--json');

function mdFiles(dir) {
  let out = [];
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of names) {
    if (entry.startsWith('.')) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out = out.concat(mdFiles(path));
    else if (/\.md$/i.test(entry)) out.push(path);
  }
  return out;
}

const linksOf = (raw) => [...raw.matchAll(/^- \[\[([^\]\n]+)\]\]/gm)].map((m) => m[1].trim());
const sectionsOf = (raw) => (raw.match(/^## 关联知识（自动）/gm) || []).length;

/** 能对上文件的链接文本集合：双链在 Obsidian 里按**文件名**解析，别的一律算悬空。 */
const onDisk = new Set(
  DIRS.flatMap((dir) => mdFiles(join(ROOT, dir))).map((f) => basename(f).replace(/\.md$/i, '')),
);

const files = mdFiles(join(ROOT, NOTE_DIR));
const report = { root: ROOT, scanned: 0, changed: 0, merged: 0, dropped: 0, weak: 0, notes: [] };
for (const path of files) {
  const before = readFileSync(path, 'utf8');
  if (!before.includes('oblivion:') || before.includes('oblivion:digest')) continue;
  const sections = sectionsOf(before);
  const links = linksOf(before);
  if (sections === 0 && links.length === 0) continue;
  report.scanned += 1;

  const keep = links.filter((t) => onDisk.has(t));
  const dropped = links.length - keep.length;
  const weak = links.filter((t) => !onDisk.has(t) && kit.isWeakTitle?.(t)).length;
  const needsWork = sections > 1 || dropped > 0; // 判据：段数不止一段，或有链接指不到文件
  if (!needsWork) continue;

  if (APPLY) await kit.appendRelatedLinks(path, keep, { prune: true });
  report.changed += 1;
  report.merged += sections > 1 ? 1 : 0;
  report.dropped += dropped;
  report.weak += weak;
  report.notes.push({ file: basename(path), sections, links: links.length, kept: keep.length, dropped });
  if (!JSON_OUT) {
    console.log(
      `${APPLY ? '改' : '会改'} ${basename(path)}：段 ${sections} → 1 / 链接 ${links.length} → ${keep.length}` +
        (dropped > 0 ? `（丢 ${dropped} 条指不到文件的）` : ''),
    );
  }
}

// 复核：整库还剩多少问题
const audit = { multiSection: 0, weakLinks: 0, dangling: 0, links: 0 };
for (const path of files) {
  const raw = readFileSync(path, 'utf8');
  if (!raw.includes('oblivion:')) continue;
  if (sectionsOf(raw) > 1) audit.multiSection += 1;
  for (const m of raw.matchAll(/^- \[\[([^\]\n]+)\]\]/gm)) {
    const t = m[1].trim();
    audit.links += 1;
    if (!onDisk.has(t)) {
      audit.dangling += 1;
      if (kit.isWeakTitle?.(t)) audit.weakLinks += 1;
    }
  }
}
report.audit = audit;

if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `\n${APPLY ? '已写盘' : '计划'}：${report.changed} 篇（其中并段 ${report.merged} 篇）/ ` +
      `丢 ${report.dropped} 条悬空链接${APPLY ? '' : '（加 --apply 执行）'}`,
  );
  console.log(
    `复核：多段笔记 ${audit.multiSection} 篇 / 悬空链接 ${audit.dangling} 条（其中弱标题 ${audit.weakLinks}）/ 相关链接共 ${audit.links} 条`,
  );
}
