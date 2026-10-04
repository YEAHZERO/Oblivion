/**
 * 插件版本号（构建期注入）。
 *
 * 单一真源是仓库根的 `VERSION`，由 `scripts/bump-version.mjs` 同步到
 * `package.json`，再由 `scripts/build.mjs` 经 esbuild 的 `define` 替换掉这里的
 * 标识符。浏览器拿不到 `package.json`，所以只能这样注入。
 *
 * 用 `typeof` 兜底：在未经过 esbuild 的场合（例如 `tsc` 类型检查、或直接跑源码），
 * 标识符没有被替换，`typeof` 对未定义变量是安全的，于是回退到 `dev`。
 */
declare const __OBLIVION_BRAND_VERSION__: string;

export const PLUGIN_VERSION: string =
  typeof __OBLIVION_BRAND_VERSION__ === 'string' ? __OBLIVION_BRAND_VERSION__ : 'dev';
