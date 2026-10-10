#!/usr/bin/env node
/**
 * @oblivion/bundle 自检。
 *
 * 本包**不是插件**（`lib/index.js` 是 `export {};`），所以自检验的不是
 * 「代码能不能跑」，而是**组合声明是否正确** —— 这是本包唯一的实质内容，
 * 也是唯一会出事的地方。
 *
 * 抓的核心故障：**重复挂载**。
 * 自带 `dsh.bundle.patch` 的包（brand）由安装器写进 `dsh.profile.bundles`；
 * 若本 bundle 的 patch 再插一次同名行，同一插件会被挂载两次 —— 第三方生态的
 * 实测结论是「两个 Node 半边、重复注册前缀路由，**整棵插件树启动失败**」。
 * 这个约束此前只写在 cordis.patch.yml 的注释里，没有任何机器检查。
 *
 * 断言分四组：
 *   A. 产物形状 —— 空壳导出，且**没有** apply/name（避免将来有人手滑把它写成插件）
 *   B. patch 声明 —— 插了哪些行、**没有**插 brand/vimc、没有写 config
 *   C. 与成员包的交叉验证 —— 拿工作区里各成员包**真实的** package.json 对账：
 *      · 被本 bundle 插行的包，必须**不自带** dsh.bundle.patch
 *      · 未被插行的包，必须**自带** dsh.bundle.patch，或有别的挂载路径（vimc 走用户层）
 *      这一组是「契约交叉验证」，能抓住「成员包改了交付路径而 bundle 没跟着改」
 *   D. 与 profile 的实际状态对账 —— 本包是否在 bundles 里；被插入的包是否在 dependencies 里
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKSPACE = fileURLToPath(new URL('../..', import.meta.url));
const results = [];
let failed = 0;
let skipped = 0;

const SKIP = Symbol('skip');

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === SKIP) {
      skipped += 1;
      results.push(['SKIP', name, '本机不适用']);
      return;
    }
    results.push(['PASS', name, detail ?? '']);
  } catch (error) {
    failed += 1;
    results.push(['FAIL', name, error?.message ?? String(error)]);
  }
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pkg = readJson(join(ROOT, 'package.json'));
const patchText = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8');

/**
 * 从 patch 里解析出**实际生效**的插入行（忽略注释）。
 *
 * 不能用「全文搜 '@oblivion/core'」—— 注释里也出现这些名字（比如解释
 * 为什么不插 brand/vimc 的那一段）。必须逐行剥掉注释再匹配，否则断言
 * 会被自己的文档骗过去。
 */
function parseInsertedIds(text) {
  const ids = [];
  const lines = text.split(/\r?\n/).map((line) => line.replace(/#.*$/, ''));

  // 先标出 group 行的行号：group 的 `id` 是**分组标签**，不是包名。
  // 把 'oblivion-stack' 当成包名去工作区找 package.json 会必然落空 ——
  // 这是 2026-10-06 实测踩到的自检假失败。
  // loader 识别 group 的判据（dsh-app-boot/lib/index.js:2100）：
  //   row.group === true || row.name === 'cordis:group' || row.name === '@deepseek-ai/cordis-plugin-group'
  const groupLineIndexes = new Set();
  lines.forEach((line, index) => {
    if (/^\s*(name:\s*['"]?(cordis:group|@deepseek-ai\/cordis-plugin-group)['"]?|group:\s*true)\s*$/.test(line)) {
      // group 行自身，以及它上方紧邻的那条 `- id:` 行，都算 group 的
      groupLineIndexes.add(index);
      for (let back = index - 1; back >= 0 && back >= index - 3; back -= 1) {
        if (/^\s*-\s*id:/.test(lines[back])) {
          groupLineIndexes.add(back);
          break;
        }
        if (lines[back].trim() !== '' && !/^\s*(group|isolate|config):/.test(lines[back])) break;
      }
    }
  });

  lines.forEach((line, index) => {
    if (groupLineIndexes.has(index)) return;
    const match = /^\s*-\s*id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
    if (match !== null) ids.push(match[1]);
  });
  return ids;
}

const insertedIds = parseInsertedIds(patchText);

// ─────────────────────────── A. 产物形状 ───────────────────────────

await check('产物存在且可 import（空壳，不是插件）', async () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在');
  const mod = await import(pathToFileURL(lib).href);
  assert.equal(typeof mod.apply, 'undefined', '本包不该有 apply —— 它是组合层，不是插件');
  assert.equal(typeof mod.name, 'undefined', '本包不该有 name');
  return `${readFileSync(lib, 'utf8').length} B · 无 apply/name`;
});

await check('声明了 dsh.bundle.patch（自己是 bundle 层）', () => {
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.ok(existsSync(join(ROOT, 'cordis.patch.yml')));
  return 'dsh.bundle.patch = ./cordis.patch.yml';
});

// ─────────────────────────── B. patch 声明 ───────────────────────────

await check('patch 恰好插了 core / bridge / panel 三行', () => {
  // 2026-10-10 解散 `oblivion-stack` 之后，core 与 http-bridge 退回**同级行**，
  // 所以 parseInsertedIds 按 `- id:` 扫到的就是三条平铺的行。
  assert.deepEqual(
    [...insertedIds].sort(),
    ['@oblivion/core', '@oblivion/http-bridge', '@oblivion/panel'],
    `实际插了：${insertedIds.join(', ') || '（无）'}`,
  );
  return insertedIds.join(' · ');
});

await check('core 与 http-bridge 是两条**同级行**，且**没有** cordis:group', () => {
  // 2026-10-10 所有者裁定解散 group。依据：桥接 `inject: []`，端点走进程级全局键
  // `globalThis[Symbol.for('@oblivion/core/mcp')]`，两者之间**没有** Cordis 服务依赖
  // ⇒ 不需要共享作用域。旧的「必须同作用域」只对 `inject: ['oblivion']` 的旧版桥接成立。
  //
  // 这条断言反过来钉住新契约：**不许**再出现 group（否则等于把刚拆的层加回去，
  // 而它会重新引入「两者必须共享作用域」这个已被证伪的约束）。
  const live = patchText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .join('\n');
  assert.doesNotMatch(
    live,
    /^\s*name:\s*['"]?cordis:group['"]?\s*$/m,
    'patch 里又出现了 cordis:group —— 所有者已裁定解散它（桥接 inject: []，不需要共享作用域）',
  );
  assert.doesNotMatch(
    live,
    /^\s*group:\s*true\s*$/m,
    'patch 里还有 group: true —— 同上，group 已解散',
  );
  // core 与 http-bridge 必须都是顶层 insert 行（缩进 4 空格），不是谁的子行。
  assert.match(
    live,
    /^ {4}- id: '@oblivion\/core'\s*$/m,
    '@oblivion/core 不是同级 insert 行（缩进或 id 形状不对）',
  );
  assert.match(
    live,
    /^ {4}- id: '@oblivion\/http-bridge'\s*$/m,
    '@oblivion/http-bridge 不是同级 insert 行（缩进或 id 形状不对）',
  );
  return '两条同级行 · 无 group · 无 isolate';
});

await check('**没有**插 brand（自带 patch，插了会双重挂载）', () => {
  assert.ok(
    !insertedIds.includes('@oblivion/brand'),
    'brand 自带 dsh.bundle.patch —— 由安装器写进 profile.bundles；本 bundle 再插一次会让同一插件挂载两次，整棵插件树启动失败',
  );
  // 注释里提到它是允许的（那是文档），但实际行里不能有
  return '仅作依赖声明，挂载交给它自己的 patch';
});

await check('**没有**插 vimc（所有者裁定：走用户层热挂）', () => {
  assert.ok(
    !insertedIds.includes('@oblivion/vimc'),
    'vimc 由所有者裁定从 bundle 层改回热挂 —— 它的行在 profile 用户层；本 bundle 插它等于把它按回 bundle 层（改一次要重启）',
  );
  return '用户层 cordis.patch.yml 的 insert 行负责';
});

await check('没有任何插件行写 config（避免覆盖各自的默认值）', () => {
  // patch 会**替换整段 config** 而非合并 ⇒ 普通插件行写 config 会把它自己的默认值整段顶掉。
  //
  // 2026-10-10 解散 group 之前，本包唯一允许出现的 config 是 `cordis:group` 的子行数组
  // （loader 靠它识别）。group 解散后，patch 里就**不该再有任何 config:**；
  // 断言随之从「config 只能在 group 下」改成「一条 config 都不许有」，
  // 这样将来谁想给某个插件加配置，会被这条挡住并被迫先想清楚「整段替换」的后果。
  const live = patchText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''));
  const configLines = live
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*config:/.test(line));
  assert.equal(
    configLines.length,
    0,
    `patch 里出现了 config:（第 ${configLines.map((c) => c.index + 1).join(', ')} 行）—— ` +
      'patch 会替换整段 config 而非合并，写它就会覆盖该插件自己的默认值；' +
      '真要改配置，请写进 profile 的用户层补丁。',
  );
  return '0 处 config（各插件用自己的默认值）';
});

await check('@ 开头的标量都加了引号（YAML 语法要求）', () => {
  const unquoted = patchText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .filter((line) => /^\s*(id|name):\s*@/.test(line));
  assert.equal(
    unquoted.length,
    0,
    `未加引号的 @ 标量（YAML 会解析失败）：${unquoted.join(' | ')}`,
  );
  return '全部单引号包裹';
});

// ─────────────────────── C. 与成员包交叉验证 ───────────────────────

/** 读工作区里某成员包的真实 package.json。 */
function memberPkg(name) {
  const short = name.replace('@oblivion/', 'oblivion-');
  const file = join(WORKSPACE, short, 'package.json');
  return existsSync(file) ? readJson(file) : null;
}

await check('交叉验证：被插行的包都不自带 dsh.bundle.patch', () => {
  const offenders = [];
  for (const id of insertedIds) {
    const member = memberPkg(id);
    if (member === null) {
      offenders.push(`${id}（工作区里找不到该包）`);
      continue;
    }
    if (member.dsh?.bundle?.patch) {
      offenders.push(`${id}（它自带 patch —— 会双重挂载）`);
    }
  }
  assert.equal(offenders.length, 0, offenders.join('；'));
  return `${insertedIds.length} 个被插行的包都不自带 patch`;
});

await check('交叉验证：自带 patch 的包没被插行', () => {
  const selfPatching = [];
  for (const entry of readdirSync(WORKSPACE)) {
    if (!entry.startsWith('oblivion-')) continue;
    const member = memberPkg(`@oblivion/${entry.slice('oblivion-'.length)}`);
    if (member?.dsh?.bundle?.patch) selfPatching.push(member.name);
  }
  assert.ok(selfPatching.length > 0, '工作区里没有任何自带 patch 的包 —— 这条断言失去意义，检查工作区布局');
  const bad = selfPatching.filter((name) => insertedIds.includes(name));
  assert.equal(bad.length, 0, `${bad.join(', ')} 自带 patch 却被本 bundle 插行 = 双重挂载`);
  return `自带 patch：${selfPatching.join(', ')} —— 均未被插行`;
});

await check('依赖声明覆盖全部五个成员包（装齐靠这里）', () => {
  const want = [
    '@oblivion/brand',
    '@oblivion/vimc',
    '@oblivion/core',
    '@oblivion/http-bridge',
    '@oblivion/panel',
  ];
  const deps = Object.keys(pkg.dependencies ?? {});
  const missing = want.filter((name) => !deps.includes(name));
  assert.equal(missing.length, 0, `缺依赖声明：${missing.join(', ')} —— 装 bundle 时不会带上它们`);
  return want.join(' · ');
});

await check('compat.requires.npmPackages 与 dependencies 一致', () => {
  const declared = pkg.dsh?.compat?.requires?.npmPackages ?? [];
  const deps = Object.keys(pkg.dependencies ?? {}).sort();
  assert.deepEqual(
    [...declared].sort(),
    deps,
    'compat 声明的成员包与 dependencies 不一致 —— 契约校验会对不上',
  );
  return `${declared.length} 个成员包`;
});

await check('dsh.compat 不含工作区服务（本包不 inject 任何服务）', () => {
  const req = pkg.dsh?.compat?.requires ?? {};
  assert.equal(req.services, undefined, '本包是组合层，不 inject 服务');
  assert.equal(req.workspaceServices, undefined, '本包不依赖其他包的 provides');
  return '只有 npmPackages';
});

// ─────────────────── D. 与 desktop profile 实际状态对账 ───────────────────

await check('desktop profile：本包在 bundles 里', () => {
  const profilePkg = join(homedir(), '.dsh', 'profiles', 'desktop', 'package.json');
  if (!existsSync(profilePkg)) return SKIP;
  const prof = readJson(profilePkg);
  const bundles = prof.dsh?.profile?.bundles ?? [];
  assert.ok(bundles.includes(pkg.name), `${pkg.name} 不在 profile.bundles 里 —— 本 bundle 不会生效`);
  return `bundles 含 ${pkg.name}`;
});

await check('desktop profile：被插行的包都在 dependencies 里', () => {
  const profilePkg = join(homedir(), '.dsh', 'profiles', 'desktop', 'package.json');
  if (!existsSync(profilePkg)) return SKIP;
  const deps = Object.keys(readJson(profilePkg).dependencies ?? {});
  const missing = insertedIds.filter((id) => !deps.includes(id));
  assert.equal(missing.length, 0, `profile 里没有这些包的依赖：${missing.join(', ')} —— 插入行会指向不存在的包`);
  return insertedIds.join(' · ');
});

// ─────────────────────────── 汇总 ───────────────────────────

for (const [status, name, detail] of results) {
  const suffix = detail === '' ? '' : `\n        ${detail}`;
  console.log(`${status}  ${name}${suffix}`);
}
console.log(`\n${results.length} 项，失败 ${failed}，跳过 ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
