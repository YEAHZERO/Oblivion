/**
 * @oblivion/vimc — 浏览器半边入口（Cordis 客户端插件）。
 *
 * 模块导出面：
 *   - `inject`：**空数组**。键盘引擎是纯 DOM 逻辑，不该因为某个 UI 服务缺席而不安装；
 *     设置页需要 `slots`，所以用 `ctx.inject(['slots'], …)` **渐进注册**（服务就位后再挂），
 *     而不是把 `slots` 写成硬依赖。这样即使在一个没有设置面板的精简外壳里，
 *     按键功能依然可用。
 *   - `apply(ctx)`：装配键盘引擎 + 页面内控制面 + 设置页。
 *
 * 为什么不走 `ctx.shortcuts`（DSH 官方快捷键服务）：见 README「为什么不用 ctx.shortcuts」——
 * 在 Windows/macOS 桌面端，已接受的组合键会被**原生层抢先拦截**，把裸字母 `w/s/a/d/i/f`
 * 注册进去会让用户在输入框里打不出这些字母。
 */

import { createBeatSender } from './beat.js';
import { installApi } from './api.js';
import { readConfig } from './config.js';
import { createEngine, type EngineHooks } from './engine.js';
import { createVimcSettingsPanel } from './settings.js';
import { DEFAULT_KEY_MAPPINGS, matchBinding, resolveBindings } from './keys.js';
import { DEFAULT_CONFIG, DEFAULT_PAGE_RATIO, normalizeConfig } from './config.js';
import { collectClickable, generateHintStrings } from './hints.js';
import { importVimiumConfig, matchesExclusion, parseKeyMappings } from './vimium.js';
import type { WindowLike } from './types.js';

export const name = '@oblivion/vimc-client';

/** 无硬性客户端服务依赖（设置页用渐进注入，见文件头）。 */
export const inject = [];

/** 设置页在 DSH 设置里的位置：紧挨 `oblivion-brand`(45)，在 `better-sidebar`(100) 之前。 */
const SETTINGS_SECTION_ID = 'oblivion-vimc';
const SETTINGS_SECTION_ORDER = 46;

interface ClientLogger {
  info(message: string): void;
  warn(message: string): void;
}

/** `@deepseek-ai/dsh-client-ui-slots` 服务面（只用注册与声明两件事）。 */
interface SlotRegistrar {
  inject(slot: string, callback: () => unknown): unknown;
  register(options: Record<string, unknown>, component: unknown): unknown;
}

/** 本插件用到的最小 Cordis 客户端上下文面。 */
interface ClientCtx {
  effect?(callback: () => (() => void) | void, label?: string): void;
  logger?(name: string): ClientLogger;
  on?(event: string, listener: () => void): void;
  inject?(deps: readonly string[], callback: (scope: { slots?: SlotRegistrar }) => void): void;
}

export function apply(ctx: ClientCtx): void {
  const logger = ctx.logger?.('@oblivion/vimc');
  const win = (globalThis as { window?: unknown }).window as WindowLike | undefined;
  if (win === undefined || typeof win.addEventListener !== 'function') {
    logger?.warn('没有可用的 window —— 浏览器半边跳过安装');
    return;
  }

  const hooks: EngineHooks = {};
  const engine = createEngine(win, readConfig(win.localStorage), hooks);
  const beat = createBeatSender(win, () => engine.config());
  hooks.onCommand = (command) => {
    // 每条命令心跳都带上按键开销快照：这样在真实页面里按几下就能看到实测延迟。
    beat.send(command, { perf: engine.perf() });
  };

  const disposeApi = installApi(win, engine);
  logger?.info(
    `v${__OBLIVION_VIMC_VERSION__} 已安装：w/s 翻页、a/d 横向步进、W/S 到顶/到底、f 链接提示、i 聚焦输入框（焦点在输入框内时不接管，Esc 退出）`,
  );

  // 挂载心跳 + **不扫描**的轻量自检（挂载这一刻外壳还没渲染完，扫描既没用又白花时间；
  // 真正的锚点自检在渲染后那一次）。顺带把生效键位等元信息落进证据文件。
  beat.send('mounted', { probe: engine.probe({ scan: false }), perf: engine.perf() });

  // 挂载这一刻外壳（侧栏/会话区）往往还没渲染完，自检会诚实地报 null。
  // 再补一次「渲染后自检」，它才是能回答「锚点找得到吗」的那一份。
  let settleTimer: number | null = null;
  const schedule = win.setTimeout;
  if (typeof schedule === 'function') {
    settleTimer = schedule.call(win, () => {
      settleTimer = null;
      beat.send('probe', { probe: engine.probe(), perf: engine.perf() });
    }, 1500);
  }

  // ---- 设置页（渐进注册：slots 就位后再挂，不影响键盘引擎）----
  if (typeof ctx.inject === 'function') {
    ctx.inject(['slots'], (scope) => {
      const slots = scope.slots;
      if (slots === undefined || typeof slots.register !== 'function') {
        logger?.warn('slots 不可用：设置页未挂载（按键功能不受影响）');
        return;
      }
      const panel = createVimcSettingsPanel(win, engine);
      slots.inject('settings.section', () => slots.register({
        name: 'settings.section',
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        label: () => 'Oblivion 键盘导航',
      }, panel));
      logger?.info('设置页已挂载：设置 → Oblivion 键盘导航');
    });
  }

  const dispose = (): void => {
    if (settleTimer !== null && typeof win.clearTimeout === 'function') win.clearTimeout(settleTimer);
    settleTimer = null;
    disposeApi();
    engine.dispose();
    beat.dispose();
  };
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'oblivion-vimc: 键盘引擎');
  else if (typeof ctx.on === 'function') ctx.on('dispose', dispose);
}

/**
 * 测试缝隙：纯函数与只读扫描器。
 *
 * 构建产物是 CJS bundle，测试跑在 Node 里（happy-dom + `node --test`），
 * 靠这个具名导出直接测解析/生成/匹配这三块纯逻辑，不必只在按键路径上间接覆盖。
 * 宿主客户端模块表只读 `name` / `inject` / `apply`，因此多一个导出对运行时无影响。
 */
export const __test = {
  DEFAULT_KEY_MAPPINGS,
  DEFAULT_CONFIG,
  DEFAULT_PAGE_RATIO,
  normalizeConfig,
  matchBinding,
  resolveBindings,
  parseKeyMappings,
  generateHintStrings,
  collectClickable,
  importVimiumConfig,
  matchesExclusion,
};
