#!/usr/bin/env node
/**
 * 版本递增脚本 —— `VERSION` 是单一真源。
 *
 * 沿用仓库既有 `Oblivion_deepseek/scripts/bump-version.ps1` 的做法，只把语言换成
 * Node（本插件的工具链本来就是 esbuild + node scripts/*.mjs，不引入 PowerShell 依赖）：
 *
 *   ① 读 `VERSION`（缺失则回退到 `package.json` 的 version）
 *   ② 按级别递增并写回 `VERSION`
 *   ③ 把新版本同步到**所有**引用它的地方
 *   ④ 可选打 git tag `v<新版本>`
 *
 * 同步范围（缺一处就会让 `--check` 失败）：
 *   - `VERSION`        —— 真源
 *   - `package.json`   —— 包版本（运行期日志与客户端显示都取自这里）
 *
 * 客户端（浏览器半边）拿不到 `package.json`，由 `scripts/build.mjs` 在打包时经
 * esbuild 的 `define` 注入，因此**不需要**第三个同步点。
 *
 * 级别约定（与主仓一致）：
 *   fix / docs / chore → patch；feat → minor；破坏性改动 / 正式发版 → major。
 *
 * ⚠️ 用**正则替换**而不是 `JSON.parse` + `JSON.stringify` —— 后者会把整个
 *    package.json 重排缩进与键序，产生与版本无关的巨大 diff，review 时看不出改了什么。
 *
 * 用法：
 *   node scripts/bump-version.mjs patch
 *   node scripts/bump-version.mjs minor --tag
 *   node scripts/bump-version.mjs --check     # 只校验一致性，不改动
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION_FILE = join(ROOT, 'VERSION');
const PACKAGE_FILE = join(ROOT, 'package.json');
const LEVELS = ['patch', 'minor', 'major'];

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const tag = argv.includes('--tag');
const level = argv.find((arg) => LEVELS.includes(arg)) ?? 'patch';
const unknown = argv.filter((arg) => !LEVELS.includes(arg) && !['--check', '--tag'].includes(arg));
if (unknown.length > 0) {
  process.stderr.write(`未知参数：${unknown.join(' ')}\n`);
  process.exit(2);
}

/** 读 `VERSION`；缺失时回退到 package.json。 */
function readSource() {
  if (existsSync(VERSION_FILE)) return readFileSync(VERSION_FILE, 'utf8').trim();
  const match = /"version"\s*:\s*"([^"]+)"/.exec(readFileSync(PACKAGE_FILE, 'utf8'));
  return match ? match[1] : '';
}

function parseSemver(value) {
  const parts = value.split('-')[0].split('.');
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map(Number);
}

const oldVersion = readSource();
const parsed = parseSemver(oldVersion);
if (parsed === null) {
  process.stderr.write(`版本号格式非法：'${oldVersion}'（应为 x.y.z）\n`);
  process.exit(1);
}

const packageText = readFileSync(PACKAGE_FILE, 'utf8');
const packageMatch = /"version"\s*:\s*"([^"]+)"/.exec(packageText);
const packageVersion = packageMatch ? packageMatch[1] : '';

// ---- --check：只报告漂移，不写任何文件 ----
if (checkOnly) {
  if (packageVersion === oldVersion) {
    process.stdout.write(`版本一致：${oldVersion}\n`);
    process.exit(0);
  }
  process.stderr.write(
    `版本漂移：VERSION=${oldVersion} 而 package.json=${packageVersion}\n` +
      '运行 `npm run version:bump -- patch` 同步。\n',
  );
  process.exit(1);
}

let [major, minor, patch] = parsed;
if (level === 'major') [major, minor, patch] = [major + 1, 0, 0];
else if (level === 'minor') [minor, patch] = [minor + 1, 0];
else patch += 1;
const nextVersion = `${major}.${minor}.${patch}`;

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const changed = [];

// ---- ① VERSION ----
writeFileSync(VERSION_FILE, `${nextVersion}\n`, 'utf8');
changed.push('VERSION');
process.stdout.write(`VERSION: ${oldVersion} -> ${nextVersion}\n`);

// ---- ② package.json（只替换第一个 version 字段）----
const replaced = packageText.replace(
  new RegExp(`("version"\\s*:\\s*)"${escape(oldVersion)}"`),
  `$1"${nextVersion}"`,
);
if (replaced !== packageText) {
  writeFileSync(PACKAGE_FILE, replaced, 'utf8');
  changed.push('package.json');
  process.stdout.write('  ok package.json\n');
} else {
  process.stdout.write('  -- package.json（本就一致）\n');
}

// ---- ③ 客户端显示的版本是构建期注入的，无需同步；但必须重新构建 ----
process.stdout.write(`同步完成，共改动 ${String(changed.length)} 个文件\n`);

if (tag) {
  try {
    execFileSync('git', ['-C', ROOT, 'tag', `v${nextVersion}`], { stdio: 'inherit' });
    process.stdout.write(`已打 tag: v${nextVersion}\n`);
  } catch {
    process.stdout.write(`打 tag 失败（可能已存在 v${nextVersion}）\n`);
  }
}

process.stdout.write(
  '\n提醒：\n' +
    `  1) 重新构建，让客户端显示与日志都换成新版本：npm run build\n` +
    `  2) 在 CHANGELOG.md 补 [${nextVersion}] 条目\n` +
    '  3) 跑 npm run check:version 确认无漂移\n',
);
