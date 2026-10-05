#!/usr/bin/env node
/**
 * @oblivion/vimc 构建脚本（esbuild，无需 tsc）。
 *
 * 产出两个文件：
 *   lib/index.js   —— Node 半边，ESM，供 Cordis Loader 加载
 *   lib/client.js  —— 浏览器半边，包成 DSH 客户端模块格式
 *                     （`window.__ModuleLoader__.load({ id, factory })` 的 IIFE 工厂闭包）
 *
 * ## external 只留 React 基线
 *
 * 浏览器半边只有设置页需要框架：`react` / `react/jsx-runtime` 由**宿主的客户端模块表**
 * 提供（官方 UI 插件同样是 `require("react/jsx-runtime")`），因此标为 external、不打进包。
 * 键盘引擎本身是纯 DOM 逻辑，一个包都不 import —— 所以 external 列表**很长**这件事
 * 本身就是信号：一旦这里多出别的名字，就说明插件开始依赖宿主 UI 包了，需要重新评估。
 *
 * 客户端拿不到 package.json，版本在打包时经 `define` 注入（单一真源是 VERSION，
 * 由 scripts/bump-version.mjs 同步到 package.json，因此这里读到的就是权威版本）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'lib');
const PKG_NAME = '@oblivion/vimc';

/** 宿主客户端模块表提供的依赖，不能打进 bundle。 */
const CLIENT_EXTERNAL = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
];

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const define = { __OBLIVION_VIMC_VERSION__: JSON.stringify(version) };

mkdirSync(LIB, { recursive: true });

// ---- Node 半边 ----
await build({
  entryPoints: [join(ROOT, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  outfile: join(LIB, 'index.js'),
  define,
  logLevel: 'warning',
});

// ---- 浏览器半边 ----
const result = await build({
  entryPoints: [join(ROOT, 'src', 'client', 'index.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120', 'safari17', 'firefox120'],
  jsx: 'automatic',
  external: CLIENT_EXTERNAL,
  legalComments: 'none',
  define,
  logLevel: 'warning',
});

const code = result.outputFiles[0].text;

// 包进 DSH 客户端模块格式。工厂里 `module`/`exports` 的声明与 CJS 产物对齐。
const wrapped =
  'window.__ModuleLoader__.load({\n' +
  `\tid: ${JSON.stringify(PKG_NAME)},\n` +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  '\t\tvar exports = module.exports;\n' +
  code +
  '\n\t\treturn module.exports;\n' +
  '\t}\n' +
  '});\n';

const clientPath = join(LIB, 'client.js');
writeFileSync(clientPath, wrapped, 'utf8');

process.stdout.write(
  `@oblivion/vimc v${version}: lib/index.js + lib/client.js (${wrapped.length} B client bundle)\n`,
);
