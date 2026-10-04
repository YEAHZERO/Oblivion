#!/usr/bin/env node
/**
 * @oblivion/brand 构建脚本（esbuild，无需 tsc）。
 *
 * 产出两个文件：
 *   lib/index.js   —— Node 半边，ESM，供 Cordis Loader 加载
 *   lib/client.js  —— 浏览器半边，包成 DSH 客户端模块格式
 *                     （`window.__ModuleLoader__.load({ id, factory })` 的 IIFE 工厂闭包）
 *
 * 浏览器半边把 react / react-dom / react-jsx-runtime / ui-primitives 标为 external：
 * 它们由宿主的客户端模块表提供（官方品牌插件同样是 `require("react/jsx-runtime")`）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'lib');
const PKG_NAME = '@oblivion/brand';

/** 宿主客户端模块表提供的依赖，不能打进 bundle。 */
const CLIENT_EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
];

mkdirSync(LIB, { recursive: true });

// ---- Node 半边 ----
await build({
  entryPoints: [join(ROOT, 'src', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  outfile: join(LIB, 'index.js'),
  logLevel: 'warning',
});

// ---- 浏览器半边 ----
// 客户端拿不到 package.json，版本在打包时注入。单一真源是仓库根的 VERSION，
// 由 scripts/bump-version.mjs 同步到 package.json，因此这里读到的就是权威版本。
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

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
  define: { __OBLIVION_BRAND_VERSION__: JSON.stringify(version) },
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
  `@oblivion/brand: lib/index.js + lib/client.js (${wrapped.length} B client bundle)\n`,
);
