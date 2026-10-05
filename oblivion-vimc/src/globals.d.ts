/**
 * 构建期注入的常量（由 scripts/build.mjs 的 esbuild `define` 提供）。
 *
 * 两个半边都用它：日志、诊断凭据、`window.oblivionVimc.version`。
 * 单一真源是插件根的 `VERSION`，经 scripts/bump-version.mjs 同步到 package.json。
 */
declare const __OBLIVION_VIMC_VERSION__: string;
