/**
 * @oblivion/vimc — 键盘引擎（客户端半边的核心）。
 *
 * 一次按键的完整判定顺序（顺序本身就是需求，**并且是按开销排的**）：
 *
 * ```
 * 插件启用？ ──否──▶ 完全不管
 *   │是
 * 命中排除规则（exclusionRules）？ ──是──▶ 完全不接管
 *   │否
 * 链接提示模式开着？ ──是──▶ 按键交给提示模式（字母选中目标 / Esc 取消）
 *   │否
 * 纯计算：命中生效键位？（不碰 DOM） ──否──▶ 只有 Esc 需要再看一眼焦点，其余直接放行
 *   │是
 * 焦点在输入框里？ ──是──▶ 不接管（除非 allowWhileEditing 且是翻页类命令）
 *   │否
 * 执行 → 真发生了动作才 preventDefault
 * ```
 *
 * 注意「纯计算」排在「问 DOM 焦点」**之前**：最常见的按键是**在输入框里打字**，
 * 那种情况一次都不该走 `closest()`/`getComputedStyle` 这类 DOM 查询。
 * 实测（真机、桌面端）：打字路径 ~0.05ms 级；命中命令时约 1–3ms（含一次焦点判定）。
 *
 * 「真发生了动作才 preventDefault」是有意的：没找到可滚容器、历史里没有上一页时
 * 不该吞键，让按键继续走宿主自己的处理链。
 */

import { normalizeConfig, writeConfig, type VimcConfig } from './config.js';
import { SCROLL_COMMANDS, matchBinding, resolveBindings, type KeyMappingParse, type VimcCommand } from './keys.js';
import { Scroller, describeElement, scrollRange } from './scroller.js';
import { blurActive, eventTarget, findInput, focusTarget, hasOpenPopup, isEditableFocus } from './focus.js';
import { createHints, describeCandidateAttrs, scanClickable, type HintSession } from './hints.js';
import { createFind, type FindController } from './find.js';
import { countTurns, jumpToTurn } from './transcript.js';
import { matchesExclusion } from './vimium.js';
import type { KeyEventLike, WindowLike } from './types.js';

/**
 * 只读自检结果：在**真实页面**里核对「锚点还在不在」，并顺带报告**本插件自身的开销**。
 *
 * 这是本机唯一可用的运行时证据来源（DSHX 的 verify 面在 Windows 上不可用，
 * 见 README「验证」节）：挂载时把它一起上报，就能回答
 * 「滚动容器/输入框/可点击目标/轮次在当前 DSH 版本里还找得到吗、插件花了多少时间」，
 * 而不需要有人按一次键。
 */
export interface VimcProbe {
  vertical: { target: string | null; range: number };
  horizontal: { target: string | null; range: number };
  input: { target: string | null; via: string | null };
  keys: { active: number; unsupported: number; errors: number; unmapAll: boolean };
  hints: {
    characters: string;
    /** 候选数；`null` = 本次没有扫描（挂载自检为了不给启动添开销会跳过扫描）。 */
    candidates: number | null;
    /** 选择器原始命中数（漏斗上端）；`null` = 本次没有扫描。 */
    matched: number | null;
    /** 三档候选数量（内联引用 / 正文其它 / 外部），`null` = 本次没有扫描。 */
    tiers: { references: number; content: number; outer: number } | null;
    /** 前几个「内联引用」的判定信号（只报信号名，不含属性值）。 */
    referenceSignals: string[];
    sample: string[];
    /** 前几个候选的**属性名**（不含值）：用来核对「正文链接」在当前 DSH 版本里长什么样。 */
    sampleAttrs: string[];
    sessions: number;
    /** 最近一次候选扫描耗时（ms）。 */
    scanMs: number;
  };
  /** 已加载的轮次数（`[data-chat-turn]`），供「上一条/下一条」跳转判定。 */
  turns: { count: number };
  /** 页面内查找状态（`/`、`.`、`,`）：只报计数与耗时，**不报查询内容**。 */
  find: {
    active: boolean;
    committed: boolean;
    matches: number;
    current: number;
    scanMs: number;
    regex: boolean;
    highlight: 'custom' | 'none';
    /** 累计画出的落点标记数。 */
    pings: number;
    /** 标记重摆次数（滚动跟随）。 */
    repositions: number;
  };
  /** 按键处理开销（只统计本插件在 keydown 捕获阶段花掉的时间）。 */
  perf: { keySamples: number; keyAvgMs: number; keyMaxMs: number };
  excluded: boolean;
}

export interface EngineHooks {
  /** 每次真的处理了一个命令后回调（诊断上报用）。 */
  onCommand?(command: VimcCommand, handled: boolean): void;
}

export interface VimcEngine {
  /** 当前配置（只读快照）。 */
  config(): VimcConfig;
  /** 合并更新配置并持久化。 */
  update(patch: Partial<VimcConfig>): VimcConfig;
  /** 直接执行一个命令（`window.oblivionVimc.run(...)` 也走这里）。 */
  run(command: VimcCommand): boolean;
  /** 生效键位表（含内置默认的合并结果与解析诊断）。 */
  bindings(): KeyMappingParse;
  /** 进入链接提示模式（`f` 命令的程序化入口）。 */
  startHints(): boolean;
  /** 按键处理开销快照（每条心跳都带上，这样不必等下一次自检就能看到真实数字）。 */
  perf(): { keySamples: number; keyAvgMs: number; keyMaxMs: number };
  /** 只读自检：不滚动、不聚焦、不注入节点；`scan: false` 时跳过开销最大的一步。 */
  probe(options?: { scan?: boolean }): VimcProbe;
  /** 已处理的按键次数。 */
  handledCount(): number;
  /** 摘掉监听并清空记忆。 */
  dispose(): void;
}

export function createEngine(win: WindowLike, initial: VimcConfig, hooks: EngineHooks = {}): VimcEngine {
  let config = normalizeConfig(initial);
  let handled = 0;
  const scroller = new Scroller(win);
  const hints: HintSession = createHints(win, () => config, { primary: () => scroller.target('y') });
  const find: FindController = createFind(win, () => config, {
    // 查找范围与滚动容器都用同一个「会话正文」发现结果：只搜正文，不搜侧栏。
    scope: () => scroller.target('y'),
    scroller: () => scroller.target('y'),
  });
  const now = (): number => (typeof win.performance?.now === 'function' ? win.performance.now() : Date.now());
  /** 本插件在 keydown 捕获阶段的耗时统计（回答「会不会拖慢客户端」）。 */
  const perf = { keySamples: 0, keyTotalMs: 0, keyMaxMs: 0 };
  const round3 = (value: number): number => Math.round(value * 1000) / 1000;
  const perfSnapshot = (): { keySamples: number; keyAvgMs: number; keyMaxMs: number } => ({
    keySamples: perf.keySamples,
    keyAvgMs: perf.keySamples === 0 ? 0 : round3(perf.keyTotalMs / perf.keySamples),
    keyMaxMs: round3(perf.keyMaxMs),
  });

  let parsedSource = config.keyMappings;
  let parsed = resolveBindings(parsedSource);
  const bindings = (): KeyMappingParse => {
    if (config.keyMappings !== parsedSource) {
      parsedSource = config.keyMappings;
      parsed = resolveBindings(parsedSource);
    }
    return parsed;
  };

  let exclusionHref: string | null = null;
  let exclusionHit = false;
  const isExcluded = (): boolean => {
    if (config.exclusions.length === 0) return false;
    const href = win.location?.href ?? '';
    if (href !== exclusionHref) {
      exclusionHref = href;
      exclusionHit = config.exclusions.some((pattern) => matchesExclusion(pattern, href));
    }
    return exclusionHit;
  };

  const goHistory = (delta: -1 | 1): boolean => {
    const history = win.history;
    if (history === undefined || typeof history.go !== 'function') return false;
    if (typeof history.length === 'number' && history.length <= 1) return false;
    try {
      history.go(delta);
    } catch {
      return false;
    }
    return true;
  };

  const run = (command: VimcCommand): boolean => {
    switch (command) {
      case 'scrollPageUp':
        return scroller.page('y', -1, config.pageRatioVertical, config.smooth);
      case 'scrollPageDown':
        return scroller.page('y', 1, config.pageRatioVertical, config.smooth);
      case 'stepUp':
        return scroller.byPixels('y', -config.scrollStepSize, config.smooth);
      case 'stepDown':
        return scroller.byPixels('y', config.scrollStepSize, config.smooth);
      case 'stepLeft':
        return scroller.byPixels('x', -config.scrollStepSize, config.smooth);
      case 'stepRight':
        return scroller.byPixels('x', config.scrollStepSize, config.smooth);
      case 'scrollToTop':
        return scroller.edge('y', 'start', config.smooth);
      case 'scrollToBottom':
        return scroller.edge('y', 'end', config.smooth);
      case 'focusInput': {
        const match = findInput(win, config.prefer);
        return match === null ? false : focusTarget(win, match.element, config.select);
      }
      case 'linkHints':
        return hints.start();
      case 'previousTurn':
        return jumpToTurn(win, scroller.target('y'), 'previous', config.smooth);
      case 'nextTurn':
        return jumpToTurn(win, scroller.target('y'), 'next', config.smooth);
      case 'openFind':
        return find.open();
      case 'findNext':
        return find.next();
      case 'findPrevious':
        return find.previous();
      case 'goBack':
        return goHistory(-1);
      case 'goForward':
        return goHistory(1);
      case 'escapeToPage':
        return blurActive(win);
      default:
        return false;
    }
  };

  const handleKeyDown = (event: KeyEventLike): void => {
    if (!config.enabled) return;
    if (isExcluded()) return;

    // 链接提示模式最先接管：此刻字母属于提示，不属于命令。
    if (hints.active()) {
      if (hints.handleKey(event)) {
        event.preventDefault();
        handled += 1;
        hooks.onCommand?.('linkHints', true);
      }
      return;
    }

    // 查找条（HUD 形态）开着时，`Esc` 关掉它 —— 此时焦点在页面上，命令绑定里没有 Esc，
    // 所以这一条必须在这里处理。
    if (find.active() && event.key === 'Escape'
      && event.ctrlKey !== true && event.altKey !== true && event.metaKey !== true) {
      find.close();
      event.preventDefault();
      handled += 1;
      return;
    }

    // ---- 纯计算阶段（不碰 DOM）：最常见的「在输入框里打字」在这里就返回 ----
    const binding = matchBinding(event, bindings().bindings, config.ignoreKeyboardLayout);

    if (binding === undefined) {
      // Esc 退出输入框是**隐式**行为（不占键位表），只有它需要在没命中键位时再看焦点。
      if (config.escapeToPage && event.key === 'Escape'
        && event.ctrlKey !== true && event.altKey !== true && event.metaKey !== true
        && !hasOpenPopup(win) && isEditableFocus(win, eventTarget(event)) && blurActive(win)) {
        event.preventDefault();
        handled += 1;
        hooks.onCommand?.('escapeToPage', true);
      }
      return;
    }

    // ---- 命中之后才问 DOM：焦点在不在可编辑区 ----
    const editing = isEditableFocus(win, eventTarget(event));
    // 输入框里只放行翻页类命令（且要显式开启），绝不把「聚焦输入框」「链接提示」塞回去。
    if (editing && !(config.allowWhileEditing && SCROLL_COMMANDS.has(binding.command))) return;

    if (!run(binding.command)) return;
    event.preventDefault();
    handled += 1;
    hooks.onCommand?.(binding.command, true);
  };

  /**
   * 捕获阶段的监听器：**只做计时包装**，真正的判定在 `handleKeyDown`。
   *
   * 计时口径 = 本插件在一个 keydown 上花掉的全部时间（包括「没命中、立刻返回」的那些键，例如
   * 在输入框里打字）。这是判断「插件会不会拖慢客户端」最直接的证据。
   */
  const onKeyDown = (event: KeyEventLike): void => {
    const started = now();
    try {
      handleKeyDown(event);
    } finally {
      const elapsed = now() - started;
      perf.keySamples += 1;
      perf.keyTotalMs += elapsed;
      if (elapsed > perf.keyMaxMs) perf.keyMaxMs = elapsed;
    }
  };

  const probe = (options: { scan?: boolean } = {}): VimcProbe => {
    const vertical = scroller.target('y');
    const horizontal = scroller.target('x');
    const input = findInput(win, config.prefer);
    const stats = hints.stats();
    let candidates: HTMLElement[] | null = null;
    let matched: number | null = null;
    let tiers: { references: number; content: number; outer: number } | null = null;
    let referenceSignals: string[] = [];
    let scanMs = stats.lastScanMs;
    if (options.scan !== false) {
      const started = now();
      const scan = scanClickable(win, { primary: vertical });
      candidates = scan.elements;
      matched = scan.matched;
      tiers = scan.tiers;
      referenceSignals = [...scan.referenceSignals];
      scanMs = now() - started;
    }
    const parse = bindings();
    return {
      vertical: { target: describeElement(vertical), range: scrollRange(vertical, 'y') },
      horizontal: { target: describeElement(horizontal), range: scrollRange(horizontal, 'x') },
      input: { target: describeElement(input === null ? null : input.element), via: input === null ? null : input.via },
      keys: {
        active: parse.bindings.length,
        unsupported: parse.unsupported.length,
        errors: parse.errors.length,
        unmapAll: parse.unmapAll,
      },
      hints: {
        characters: config.linkHintCharacters,
        candidates: candidates === null ? null : candidates.length,
        matched,
        tiers,
        referenceSignals,
        sample: candidates === null ? [] : candidates.slice(0, 6).map((element) => describeElement(element) ?? 'unknown'),
        sampleAttrs: candidates === null ? [] : describeCandidateAttrs(candidates),
        sessions: stats.sessions,
        scanMs: round3(scanMs),
      },
      turns: { count: countTurns(win, vertical) },
      find: find.stats(),
      perf: perfSnapshot(),
      excluded: isExcluded(),
    };
  };

  win.addEventListener('keydown', onKeyDown, true);

  return {
    config: () => config,
    update: (patch) => {
      config = writeConfig(win.localStorage, patch, config);
      // 配置变了：提示模式按旧字母表开着就没有意义了；排除规则的缓存也要作废。
      hints.cancel();
      exclusionHref = null;
      return config;
    },
    run,
    bindings,
    startHints: () => hints.start(),
    perf: perfSnapshot,
    probe,
    handledCount: () => handled,
    dispose: () => {
      win.removeEventListener('keydown', onKeyDown, true);
      hints.dispose();
      find.dispose();
      scroller.forget();
    },
  };
}
