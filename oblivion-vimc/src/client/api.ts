/**
 * @oblivion/vimc — 页面内控制面 `window.oblivionVimc`。
 *
 * 设置面板（DSH 设置 → Oblivion 键盘导航）是主要入口；这个控制面留给
 * 「控制台里一行搞定」的场景，以及让设置面板复用同一套动作。
 *
 * ```js
 * oblivionVimc.status()                    // 版本 / 开关 / 键位 / 已处理次数
 * oblivionVimc.probe()                     // 只读自检：滚动容器、输入框、可点击目标
 * oblivionVimc.hints()                     // 手动进入链接提示模式（等价按 f）
 * oblivionVimc.bindings()                  // 生效键位 + 未支持的 Vimium 命令
 * oblivionVimc.importVimium(json)          // 直接吃 Vimium-C 的选项导出对象
 * oblivionVimc.set({ smooth: false })      // 瞬时滚动
 * oblivionVimc.run('scrollToBottom')
 * ```
 */

import { describeBindings, type VimcCommand } from './keys.js';
import { importVimiumConfig, type VimiumImportReport } from './vimium.js';
import type { VimcConfig } from './config.js';
import type { VimcEngine, VimcProbe } from './engine.js';
import type { KeyMappingParse } from './keys.js';
import type { WindowLike } from './types.js';

export interface VimcApi {
  readonly version: string;
  status(): Record<string, unknown>;
  set(patch: Partial<VimcConfig>): VimcConfig;
  enable(): VimcConfig;
  disable(): VimcConfig;
  toggle(): VimcConfig;
  run(command: VimcCommand): boolean;
  /** 只读自检：滚动容器、输入框、可点击目标与自身开销。 */
  probe(options?: { scan?: boolean }): VimcProbe;
  /** 进入链接提示模式（等价按 `f`）。 */
  hints(): boolean;
  /** 生效键位表 + 解析诊断（未支持的 Vimium 命令、语法问题）。 */
  bindings(): KeyMappingParse;
  /** 导入 Vimium-C 的选项导出对象；返回补丁与报告（不落盘）。 */
  importVimium(json: unknown): { patch: Record<string, unknown>; report: VimiumImportReport };
  keys(): ReturnType<typeof describeBindings>;
  help(): string;
}

const HELP = [
  '@oblivion/vimc —— 把 DSH 当浏览器用（默认键位，可在设置 → Oblivion 键盘导航里改）',
  '  w / s        上翻 / 下翻一页',
  '  a / d        左移 / 右移一屏（scrollStepSize 像素）',
  '  W / S        回到顶部 / 跳到底部',
  '  f            链接提示：屏幕上的可点击元素浮出字母，按字母触发',
  '  i            聚焦输入框（默认选中光标所在行），Esc 退出输入框',
  '  Ctrl+↑↓←→    像素级滚动',
  '  oblivionVimc.set({...}) / probe() / hints() / bindings() / importVimium(json)',
].join('\n');

/** 安装页面内控制面，返回卸载函数。 */
export function installApi(win: WindowLike, engine: VimcEngine): () => void {
  const version = __OBLIVION_VIMC_VERSION__;
  const api: VimcApi = {
    version,
    status: () => ({
      version,
      enabled: engine.config().enabled,
      handled: engine.handledCount(),
      keys: describeBindings(engine.bindings().bindings),
      unsupported: engine.bindings().unsupported.map((item) => item.command),
      config: engine.config(),
    }),
    set: (patch) => engine.update(patch),
    enable: () => engine.update({ enabled: true }),
    disable: () => engine.update({ enabled: false }),
    toggle: () => engine.update({ enabled: !engine.config().enabled }),
    run: (command) => engine.run(command),
    probe: (options) => engine.probe(options),
    hints: () => engine.startHints(),
    bindings: () => engine.bindings(),
    importVimium: (json) => importVimiumConfig(json, { prefer: engine.config().prefer }),
    keys: () => describeBindings(engine.bindings().bindings),
    help: () => HELP,
  };
  const holder = win as unknown as { oblivionVimc?: VimcApi };
  holder.oblivionVimc = api;
  return () => {
    if (holder.oblivionVimc === api) delete holder.oblivionVimc;
  };
}
