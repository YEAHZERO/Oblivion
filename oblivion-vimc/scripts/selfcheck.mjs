#!/usr/bin/env node
/**
 * @oblivion/vimc 自检。
 *
 * 本包有 42 项单测（`tests/*.mjs`），覆盖的是键盘引擎、提示串、查找这类
 * **纯逻辑**。selfcheck 补的是单测抓不到的那一层：**装载契约**。
 *
 * 单测跑在 Node + happy-dom 里，直接 import 源码模块；selfcheck 验的是
 * **构建产物**与**声明之间的一致性** —— 也就是「插件被真正挂载时会不会出问题」。
 *
 * 断言分五组：
 *   A. 产物形状 —— 宿主半边是函数式插件（只导出 apply）；
 *      客户端半边是 __ModuleLoader__ 工厂（不是普通 ESM）
 *   B. marker 三方一致 —— dshx.yml / src/index.ts 的 console.log / lib/index.js 产物
 *      逐字相同。`dshx verify-boot` 靠它证明 apply() 真的跑过，漂了就静默失效
 *   C. id 三方一致 —— package.json 的 name / dshx.yml 的 id / client.js 工厂的 id。
 *      `dshx activate-new-client` 有硬校验 plugin.id === packageName
 *   D. 客户端槽位契约 —— dsh.client.inject 与 compat.requires 对账，
 *      且源码里确实注册了声明的槽位
 *   E. 热挂路径 —— 不自带 dsh.bundle.patch（否则会从热挂退回 bundle 层）
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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

const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const pkg = JSON.parse(readText('package.json'));
const hostBundle = readText('lib/index.js');
const clientBundle = readText('lib/client.js');

// ─────────────────────────── A. 产物形状 ───────────────────────────

await check('宿主半边产物存在且导出 apply（函数式插件）', async () => {
  assert.ok(existsSync(join(ROOT, 'lib', 'index.js')), 'lib/index.js 不存在，先跑 build');
  const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);
  assert.equal(typeof mod.apply, 'function', '宿主半边必须导出 apply');
  return `${hostBundle.length} B`;
});

await check('客户端半边是 __ModuleLoader__ 工厂（不是普通 ESM）', () => {
  assert.ok(existsSync(join(ROOT, 'lib', 'client.js')), 'lib/client.js 不存在，先跑 build');
  assert.match(
    clientBundle,
    /window\.__ModuleLoader__\.load\(/,
    '客户端产物必须包成 __ModuleLoader__.load 工厂 —— 宿主客户端模块表据此装载',
  );
  assert.match(clientBundle, /factory:\s*\(require\)/, '缺 factory 闭包');
  return `${clientBundle.length} B · 工厂闭包`;
});

await check('package.json 同时导出 . 与 ./client', () => {
  assert.equal(pkg.exports?.['.'], './lib/index.js');
  assert.equal(pkg.exports?.['./client'], './lib/client.js');
  return 'main + ./client';
});

// ─────────────────────── B. marker 三方一致 ───────────────────────

await check('marker 三方逐字一致（dshx.yml / src / 产物）', () => {
  const dshx = readText('dshx.yml');
  const declared = /^marker:\s*"?([^"\n]+?)"?\s*$/m.exec(dshx)?.[1];
  assert.ok(declared, 'dshx.yml 里找不到 marker');

  const src = readText('src/index.ts');
  assert.ok(
    src.includes(`console.log('${declared}')`) || src.includes(`console.log("${declared}")`),
    `src/index.ts 里没有 console.log('${declared}') —— dshx verify-boot 会失败`,
  );

  assert.ok(
    hostBundle.includes(declared),
    `产物里没有 marker 字符串「${declared}」—— 构建后 marker 丢了`,
  );
  return declared;
});

await check('dshx.yml 的 id 与 package.json 的 name 逐字相同', () => {
  const dshx = readText('dshx.yml');
  const id = /^id:\s*'?([^'\n]+?)'?\s*$/m.exec(dshx)?.[1];
  assert.equal(
    id,
    pkg.name,
    `dshx.yml 的 id（${id}）≠ package.json 的 name（${pkg.name}）—— dshx activate-new-client 会拒绝`,
  );
  return pkg.name;
});

await check('客户端工厂的 id 与包名一致', () => {
  const match = /id:\s*"([^"]+)"/.exec(clientBundle);
  assert.ok(match, 'client.js 工厂里找不到 id');
  assert.equal(match[1], pkg.name, `工厂 id（${match[1]}）≠ 包名（${pkg.name}）`);
  return match[1];
});

// ─────────────────────── C. 客户端槽位契约 ───────────────────────

await check('dsh.client.inject 与 compat.requires.clientPackages 一致', () => {
  const injected = pkg.dsh?.client?.inject ?? [];
  const required = pkg.dsh?.compat?.requires?.clientPackages ?? [];
  assert.deepEqual(
    [...injected].sort(),
    [...required].sort(),
    'dsh.client.inject 与 compat.requires.clientPackages 不一致 —— 契约校验会对不上',
  );
  return injected.join(' · ') || '（空）';
});

await check('客户端模块的 Cordis 服务 inject 为空（渐进注册 slots）', () => {
  // ⚠️ 别把两个 inject 混为一谈：
  //   · package.json 的 dsh.client.inject = **客户端包**依赖（上一条断言）
  //   · src/client/index.ts 的 export const inject = **Cordis 服务**硬依赖（本条）
  // 后者必须为空：键盘引擎是纯 DOM 逻辑，不该因为某个 UI 服务缺席而不安装；
  // 设置页走 ctx.inject(['slots'], …) 渐进注册。
  const src = readText('src/client/index.ts');
  const declared = /export const inject\s*(?::[^=]+)?=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(declared, '源码里找不到 export const inject');
  assert.equal(
    declared[1].trim(),
    '',
    `Cordis 服务 inject 被加成硬依赖了：${declared[1].trim()} —— 应走 ctx.inject([...], …) 渐进注册`,
  );
  assert.match(src, /ctx\.inject\(\['slots'\]/, '渐进注册调用不见了 —— 设置页会静默不挂载');
  return "inject = [] · 设置页走 ctx.inject(['slots'], …)";
});

await check('声明的槽位在源码里真的被注册', () => {
  const slots = pkg.dsh?.compat?.requires?.slots ?? [];
  assert.ok(slots.length > 0, 'compat 里没声明任何槽位');
  const src = readText('src/client/index.ts');
  const missing = slots.filter((slot) => !src.includes(`'${slot}'`) && !src.includes(`"${slot}"`));
  assert.equal(missing.length, 0, `源码里找不到这些槽位：${missing.join(', ')}`);
  return slots.join(' · ');
});

await check('槽位 kind 与注册用的 API 匹配', () => {
  const kinds = pkg.dsh?.compat?.requires?.slotKinds ?? {};
  const src = readText('src/client/index.ts');
  assert.equal(
    kinds['settings.section'],
    'list',
    'settings.section 在宿主契约里是 list —— 改了这个值要同步改断言',
  );
  assert.match(src, /slots\.register\(/, '源码里没有 slots.register 调用');
  return 'settings.section = list';
});

// ─────────────────────── D. 热挂路径 ───────────────────────

await check('**不**自带 dsh.bundle.patch（否则退回 bundle 层）', () => {
  assert.equal(
    pkg.dsh?.bundle,
    undefined,
    '声明 dsh.bundle.patch 会让安装器写进 profile.bundles —— 组合在启动时算好，改一次要重启；' +
      '本包在 2026-10-06 由所有者裁定从 bundle 层改回热挂，别加回来',
  );
  return '走用户层 cordis.patch.yml 插入行';
});

await check('compat.requires.patchInsert 声明了自己的 id', () => {
  const patchInsert = pkg.dsh?.compat?.requires?.patchInsert ?? [];
  assert.ok(
    patchInsert.includes(pkg.name),
    'compat 里没声明 patchInsert —— 换机器丢了用户层插入行时，契约校验不会报错',
  );
  return patchInsert.join(' · ');
});

await check('cordis.patch.yml 的插入行 id 与包名一致', () => {
  const patch = readText('cordis.patch.yml');
  const ids = patch
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, ''))
    .map((line) => /^\s*-\s*id:\s*'?([^'\s]+)'?\s*$/.exec(line)?.[1])
    .filter(Boolean);
  assert.ok(ids.length > 0, 'cordis.patch.yml 里没有生效的插入行');
  assert.deepEqual(ids, [pkg.name], `插入行 id 应为 ${pkg.name}，实际 ${ids.join(', ')}`);
  return pkg.name;
});

// ─────────────────── E. 与 desktop profile 对账 ───────────────────

await check('desktop profile：用户层插入行已就位', () => {
  const patchFile = join(homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
  if (!existsSync(patchFile)) return SKIP;
  assert.ok(
    readFileSync(patchFile, 'utf8').includes(`'${pkg.name}'`),
    `用户层补丁里没有 ${pkg.name} 的插入行 —— 换机器/重置 profile 会静默不生效`,
  );
  return 'cordis.patch.yml 含插入行';
});

await check('desktop profile：本包**不**在 bundles 里（热挂包不得双挂）', () => {
  const profilePkg = join(homedir(), '.dsh', 'profiles', 'desktop', 'package.json');
  if (!existsSync(profilePkg)) return SKIP;
  const bundles = JSON.parse(readFileSync(profilePkg, 'utf8')).dsh?.profile?.bundles ?? [];
  assert.ok(
    !bundles.includes(pkg.name),
    `${pkg.name} 在 profile.bundles 里 —— 热挂包又进 bundles = 同一插件挂载两次，整棵插件树启动失败`,
  );
  return '仅在用户层插入行，未进 bundles';
});

// ─────────────────────────── 汇总 ───────────────────────────

for (const [status, name, detail] of results) {
  const suffix = detail === '' ? '' : `\n        ${detail}`;
  console.log(`${status}  ${name}${suffix}`);
}
console.log(`\n${results.length} 项，失败 ${failed}，跳过 ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
