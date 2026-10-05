/**
 * @oblivion/vimc — 页面内查找（`/` 打开、`.` 下一个、`,` 上一个）。
 *
 * 对应 Vimium-C 的 `enterFindMode` / `performFind` / `performBackwardsFind`
 * （所有者导出里就是 `map / enterFindMode postOnEsc`、`map . performFind`、`map , performBackwardsFind`）。
 *
 * ## 为什么自己实现而不是用 `window.find()`
 *
 * `window.find()` 是非标准 API，且它会**接管原生选区**：在 DSH 这种 contenteditable
 * （Lexical 宿主）的应用里，选区被外部改动会引发编辑器状态与 DOM 不同步。
 * 所以这里只做两件不侵入的事：
 *
 *   ① 用 **CSS Custom Highlight API**（`CSS.highlights`）高亮 —— 高亮的是 `Range`，
 *      **完全不改 DOM**（不包 `<mark>`、不碰文本节点）；
 *   ② 只把**滚动容器**滚到命中处（与插件其余部分共用同一个容器发现逻辑）。
 *
 * 浏览器不支持 `CSS.highlights`（老版本 / 测试替身）时退化为「只滚动、不高亮」——
 * 功能仍在，只是没有底色提示。
 *
 * ## 交互
 *
 * | 键 | 行为 |
 * | --- | --- |
 * | `/` | 打开查找框（带上次查询），边打边找，`Enter` = 下一个、`Shift+Enter` = 上一个、`Esc` = 关闭 |
 * | `.` | 下一个命中（查找框关着也生效；没有查询时打开查找框） |
 * | `,` | 上一个命中（同上） |
 * | `Esc`（框内） | 关闭查找框并把焦点还给打开前的元素 |
 *
 * 大小写按 Vimium 的**智能大小写**：查询里含大写字母 → 区分大小写，否则不区分。
 * `regexFindMode`（可由 Vimium-C 导出导入）打开时，查询按正则解释（非法正则按无命中处理）。
 *
 * ⚠️ 查找框自身是 `<input>`，所以插件的其它快捷键在框内**自动不生效**（可编辑区守卫）——
 * 这是「在查找框里打 `w` 应该是字母 w」的前提，不需要额外的状态机。
 *
 * ## 上游参考
 *
 * 行为参考 Vimium-C（Apache-2.0，Copyright 2023-present Gong Dahan）的 `content/mode_find.ts`
 * 与 `content/dom_ui.ts` 的 `flash_()`：落点用矩形覆盖层标记、只保留一个活动标记、有寿命并淡出。
 * 本文件是独立实现，**未复制上游代码**；差异见 README「参考与许可」一节
 * （我们不使用 `window.find`，因为 DSH 输入框是 Lexical 宿主，原生选区被外部改动会失步）。
 */

import type { VimcConfig } from './config.js';
import type { KeyEventLike, WindowLike } from './types.js';

/** 全量高亮的名字与当前命中的名字（`::highlight()` 里引用）。 */
const ALL_HIGHLIGHT = 'vimc-find';
const CURRENT_HIGHLIGHT = 'vimc-find-current';

/** 命中上限（防超长会话把内存与高亮拖爆）。 */
const MAX_MATCHES = 2000;

/** 输入防抖：边打边找，但不必每个字符都全量扫一遍。 */
const INPUT_DEBOUNCE_MS = 120;

/**
 * 命中相对容器顶的位置。
 *
 * 0.25 = 「靠上、但和顶边留一点距离」——所有者明确说**居中不好看**，落到像自己那条提问的位置就行。
 */
const LANDING_RATIO = 0.25;

/** 落点标记（ping）的存活时间与每个命中最多标几个矩形。 */
const PING_MS = 1200;
const PING_MAX_RECTS = 8;

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** 宿主样式表里插一条 `::highlight()` 规则（只插一次，卸载时移除）。 */
function ensureStyle(win: WindowLike): void {
  const doc = win.document;
  if (doc.querySelector('style[data-vimc-find-style]') !== null) return;
  const style = doc.createElement('style');
  style.setAttribute('data-vimc-find-style', '');
  style.textContent = [
    // ⚠️ `::highlight()` 只接受**允许的属性**，且必须是长写属性：
    // 写 `background:` 简写在某些构建里会被整条丢弃（表现为「死活没有高亮」）。
    `::highlight(${ALL_HIGHLIGHT}) { background-color: #ffd76e; color: #1f1f1f; }`,
    `::highlight(${CURRENT_HIGHLIGHT}) { background-color: #ff9f1a; color: #1f1f1f; }`,
  ].join('\n');
  doc.head.append(style);
}

function clearHighlights(win: WindowLike): void {
  const registry = (win as unknown as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  if (registry === undefined) return;
  try {
    registry.delete(ALL_HIGHLIGHT);
    registry.delete(CURRENT_HIGHLIGHT);
  } catch {
    /* 忽略 */
  }
}

function paintHighlights(win: WindowLike, all: Range[], current: Range | undefined): void {
  const css = (win as unknown as { CSS?: { highlights?: Map<string, unknown>; Highlight?: new (...ranges: Range[]) => unknown } }).CSS;
  const registry = css?.highlights;
  const HighlightConstructor = css?.Highlight;
  if (registry === undefined || HighlightConstructor === undefined) return;
  try {
    registry.delete(ALL_HIGHLIGHT);
    registry.delete(CURRENT_HIGHLIGHT);
    if (all.length > 0) registry.set(ALL_HIGHLIGHT, new HighlightConstructor(...all));
    if (current !== undefined) registry.set(CURRENT_HIGHLIGHT, new HighlightConstructor(current));
  } catch {
    /* 高亮失败不影响跳转 */
  }
}

/** `NodeFilter.SHOW_TEXT`：用数字常量而不是全局 `NodeFilter` —— 后者在测试替身/非浏览器环境里可能不存在。 */
const SHOW_TEXT = 4;

/** 在给定根节点里找命中，产出一组 `Range`。 */
function collectRanges(win: WindowLike, root: Element, query: string, regex: boolean): Range[] {
  const doc = win.document;
  const ranges: Range[] = [];
  if (query === '') return ranges;
  const caseSensitive = /[A-Z]/.test(query);
  let pattern: RegExp | null = null;
  if (regex) {
    try {
      pattern = new RegExp(query, caseSensitive ? 'gu' : 'giu');
    } catch {
      return ranges; // 非法正则：按无命中处理（框内会显示 0/0）
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  let walker: TreeWalker;
  try {
    walker = doc.createTreeWalker(root, SHOW_TEXT);
  } catch {
    return ranges;
  }
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    const data = text.data;
    if (data === '') continue;
    if (pattern !== null) {
      pattern.lastIndex = 0;
      for (const match of data.matchAll(pattern)) {
        const index = match.index ?? 0;
        const length = match[0].length;
        if (length === 0) continue;
        const range = doc.createRange();
        try {
          range.setStart(text, index);
          range.setEnd(text, index + length);
        } catch {
          continue;
        }
        ranges.push(range);
        if (ranges.length >= MAX_MATCHES) return ranges;
      }
      continue;
    }
    const haystack = caseSensitive ? data : data.toLowerCase();
    let from = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index < 0) break;
      const range = doc.createRange();
      try {
        range.setStart(text, index);
        range.setEnd(text, index + needle.length);
      } catch {
        break;
      }
      ranges.push(range);
      if (ranges.length >= MAX_MATCHES) return ranges;
      from = index + Math.max(1, needle.length);
    }
  }
  return ranges;
}

export interface FindStats {
  /** 查找条是否可见。 */
  readonly active: boolean;
  /** 是否处于「已提交」形态（只读 HUD、不聚焦；此时 `.`/`,` 可直接跳）。 */
  readonly committed: boolean;
  /** 命中总数（含折叠区域内、暂时不可见的那些）。 */
  readonly matches: number;
  /** 当前命中序号（1 起；0 = 没有命中）。 */
  readonly current: number;
  /** 最近一次查找耗时（ms）。 */
  readonly scanMs: number;
  /** 是否按正则解释（来自 `regexFindMode`）。 */
  readonly regex: boolean;
  /** 高亮能力：`custom` = CSS Custom Highlight 可用；`none` = 只能靠落点标记。 */
  readonly highlight: 'custom' | 'none';
  /** 累计画出的落点标记数（每次呈现当前命中 +1）。 */
  readonly pings: number;
  /** 标记被重摆的次数（滚动跟随；> pings 说明滚动期间确实在跟随修正）。 */
  readonly repositions: number;
}

export interface FindController {
  /** `/`：打开查找条（已打开时回到编辑态并全选）。 */
  open(): boolean;
  /** `.`：下一个命中。 */
  next(): boolean;
  /** `,`：上一个命中。 */
  previous(): boolean;
  /** 关闭查找条（保留查询与命中）。 */
  close(): void;
  /** 查找条是否可见。 */
  active(): boolean;
  /** 是否处于「已提交」形态（只读 HUD、不聚焦）。 */
  committedState(): boolean;
  stats(): FindStats;
  dispose(): void;
}

export interface FindDeps {
  /** 查找范围（通常是会话正文；拿不到时退回 `document.body`）。 */
  readonly scope?: () => Element | null;
  /** 滚动容器（与插件其余部分共用）。 */
  readonly scroller: () => Element | null;
}

export function createFind(win: WindowLike, getConfig: () => VimcConfig, deps: FindDeps): FindController {
  let overlay: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let committedText: HTMLElement | null = null;
  let counter: HTMLElement | null = null;
  let timer: number | null = null;
  let ranges: Range[] = [];
  let index = -1;
  let query = '';
  let scanMs = 0;
  /** 累计画出过多少个落点标记（自证：跳转确实伴随可见标记，而不是只改了个索引）。 */
  let pings = 0;
  /** 标记被重摆过多少次（滚动跟随；也是「对齐」这条链路的体检指标）。 */
  let pingRepositions = 0;
  /** 当前活动的落点标记（参考 Vimium-C：同时只保留一个活动标记）。 */
  let pingState: { range: Range; boxes: HTMLElement[] } | null = null;
  let pingTimer: number | null = null;
  let pingFrame: number | null = null;
  /** `true` = 已「提交」：输入框收起、焦点还给页面，查找条退化成只读 HUD（可按 `.`/`,` 继续跳）。 */
  let committed = false;
  let previousFocus: Element | null = null;

  const now = (): number => (typeof win.performance?.now === 'function' ? win.performance.now() : Date.now());

  const scopeElement = (): Element => deps.scope?.() ?? win.document.body;

  /** 这个命中当前**渲染出来了吗**（折叠的 `<details>` 里、隐藏容器里 → 没有矩形）。 */
  const isRendered = (range: Range): boolean => {
    const capable = range as Range & { getClientRects?: () => DOMRectList };
    if (typeof capable.getClientRects !== 'function') return true; // 没有布局信息：当作可见，别把功能卡死
    try {
      return capable.getClientRects().length > 0;
    } catch {
      return true;
    }
  };

  /**
   * 命中落在**折叠的分组**里时，用官方开关把它展开。
   *
   * DSH 把工具调用收进 `<details>`；文字仍在 DOM 里但不可见。点 `<summary>`（而不是直接改
   * `details.open`）是为了让 React 自己的状态跟着变 —— 直接改 DOM 属性会在下一次渲染被覆盖。
   */
  const reveal = (range: Range): boolean => {
    const start = range.startContainer;
    const element = start.nodeType === 1 ? (start as Element) : start.parentElement;
    if (element === null || typeof element.closest !== 'function') return false;
    const details = element.closest('details:not([open])');
    if (details === null) return false;
    const summary = details.querySelector('summary');
    try {
      if (summary !== null && typeof (summary as HTMLElement).click === 'function') {
        (summary as HTMLElement).click();
        // 宿主没响应点击（或不是 React 那套）时兜底：直接置 open，保证命中一定看得见。
        if (!(details as HTMLDetailsElement).open) (details as HTMLDetailsElement).open = true;
        return true;
      }
      (details as HTMLDetailsElement).open = true;
      return true;
    } catch {
      return false;
    }
  };

  /** 命中在文档里的稳定身份（重新收集后据此找回同一个命中）。 */
  const nodeIds = new WeakMap<Node, number>();
  let nextNodeId = 1;
  const keyOf = (range: Range): string => {
    const node = range.startContainer;
    let id = nodeIds.get(node);
    if (id === undefined) {
      id = nextNodeId;
      nextNodeId += 1;
      nodeIds.set(node, id);
    }
    return `${String(id)}:${String(range.startOffset)}`;
  };

  const scrollerElement = (): Element | null => deps.scroller();

  const scrollToCurrent = (): void => {
    const range = ranges[index];
    const scroller = scrollerElement();
    if (range === undefined || scroller === null) return;
    let rect: DOMRect;
    try {
      rect = range.getBoundingClientRect();
    } catch {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = (rect.top - scrollerRect.top) - scroller.clientHeight * LANDING_RATIO;
    const top = Math.max(0, scroller.scrollTop + delta);
    const behavior = (getConfig().smooth ? 'smooth' : 'instant') as unknown as ScrollBehavior;
    try {
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior });
      else scroller.scrollTop = top;
    } catch {
      scroller.scrollTop = top;
    }
  };

  /**
   * 落点标记（ping）：在当前命中四周画一圈会淡出的琥珀色框。
   *
   * 为什么要它：`::highlight()` 是「文字底色」，遇到命中在**折叠/隐藏**内容里、
   * 或浏览器不支持 Custom Highlight 时就会**什么都看不见**，用户根本不知道跳到哪了。
   * 这个标记与文字是否被高亮无关，**总能看见**。
   *
   * ⚠️ 对齐是这条链路最容易错的地方（所有者实测「搜『高亮』，黄框出现在『结果』旁边」）：
   * 框用的是**视口坐标**，一旦发生滚动（尤其 `smooth` 平滑滚动还在动画中），坐标就过期了。
   * 所以这里做两件事：
   *   ① `present()` 里**先滚、再画**，首帧就是滚动后的坐标；
   *   ② 标记存活期间监听 `scroll`/`resize`（捕获阶段 + rAF 节流）**持续重摆**，滚动动画中一路跟随。
   * 参考 Vimium-C `dom_ui.ts` 的 `flash_`（矩形定位 + 单个活动元素 + 寿命 + 淡出），
   * 差别是它能把矩形换算成页面坐标（`setBoundary_(..., knownViewOffset)` → `.AbsF`），
   * 而 DSH 的正文是**嵌套滚动容器**、不能假定宿主定位上下文，所以这里用「跟随重摆」代替。
   */
  const pingRects = (range: Range): DOMRect[] => {
    const capable = range as Range & { getClientRects?: () => DOMRectList };
    let rects: DOMRect[] = [];
    try {
      if (typeof capable.getClientRects === 'function') rects = Array.from(capable.getClientRects());
      if (rects.length === 0) rects = [range.getBoundingClientRect()];
    } catch {
      return [];
    }
    return rects.filter((rect) => rect.width > 0 && rect.height > 0).slice(0, PING_MAX_RECTS);
  };

  /** 按当前矩形重摆标记（滚动/缩放时也调用）。 */
  const placePing = (): void => {
    const state = pingState;
    if (state === null) return;
    const doc = win.document;
    const rects = pingRects(state.range);
    if (rects.length === 0) return;
    while (state.boxes.length < rects.length) {
      const box = doc.createElement('div');
      box.setAttribute('data-vimc-find-ping', '');
      Object.assign(box.style, {
        position: 'fixed',
        border: '2px solid #ff9f1a',
        borderRadius: '3px',
        boxShadow: '0 0 0 2px rgba(255,159,26,.28)',
        pointerEvents: 'none',
        zIndex: '2147483646',
        opacity: '1',
        transition: 'opacity 240ms ease-out',
      } satisfies Partial<CSSStyleDeclaration>);
      doc.body.append(box);
      state.boxes.push(box);
    }
    for (const [offset, box] of state.boxes.entries()) {
      const rect = rects[offset];
      if (rect === undefined) {
        box.style.display = 'none';
        continue;
      }
      box.style.display = 'block';
      box.style.left = `${String(Math.max(0, rect.left - 2))}px`;
      box.style.top = `${String(Math.max(0, rect.top - 2))}px`;
      box.style.width = `${String(rect.width + 4)}px`;
      box.style.height = `${String(rect.height + 4)}px`;
    }
    pingRepositions += 1;
  };

  /** 滚动/缩放期间跟随（rAF 节流：滚动事件可能每帧多次）。 */
  const onPingViewportChange = (): void => {
    if (pingState === null) return;
    if (pingFrame !== null) return;
    if (typeof win.requestAnimationFrame !== 'function') {
      placePing();
      return;
    }
    pingFrame = win.requestAnimationFrame(() => {
      pingFrame = null;
      placePing();
    });
  };

  const removePing = (): void => {
    if (pingTimer !== null && typeof win.clearTimeout === 'function') win.clearTimeout(pingTimer);
    pingTimer = null;
    if (pingFrame !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(pingFrame);
    pingFrame = null;
    if (pingState !== null) {
      for (const box of pingState.boxes) box.remove();
      pingState = null;
      win.removeEventListener('scroll', onPingViewportChange, true);
      win.removeEventListener('resize', onPingViewportChange, true);
    }
  };

  const ping = (range: Range | undefined): void => {
    removePing();
    if (range === undefined) return;
    if (pingRects(range).length === 0) return;
    pingState = { range, boxes: [] };
    pings += 1;
    placePing();
    win.addEventListener('scroll', onPingViewportChange, true);
    win.addEventListener('resize', onPingViewportChange, true);
    const fade = (): void => {
      if (pingState === null) return;
      for (const box of pingState.boxes) box.style.opacity = '0';
    };
    if (typeof win.setTimeout === 'function') {
      win.setTimeout(fade, Math.max(0, PING_MS - 260));
      pingTimer = win.setTimeout(removePing, PING_MS);
    }
  };

  /** 查找条的两种形态：编辑态（输入框可见、聚焦）与提交态（只读文本 + 计数，不聚焦）。 */
  const syncMode = (): void => {
    if (overlay !== null) overlay.style.opacity = committed ? '0.9' : '1';
    if (input !== null) input.style.display = committed ? 'none' : 'inline-block';
    if (committedText !== null) committedText.style.display = committed ? 'inline' : 'none';
  };

  const render = (): void => {
    if (counter !== null) counter.textContent = `(${String(ranges.length)} 处)`;
    if (committedText !== null) committedText.textContent = query;
    if (input !== null && input.value !== query) input.value = query;
  };

  /** 把「当前命中」呈现出来：高亮（若可用）→ **先滚动** → 再画落点标记 → 更新 HUD。 */
  const present = (): void => {
    const range = ranges[index];
    paintHighlights(win, overlay === null ? [] : ranges, range);
    scrollToCurrent();
    // ⚠️ 顺序不能反：先滚再画，首帧坐标才是落点位置（平滑滚动期间由滚动跟随继续修正）
    ping(range);
    render();
  };

  /** 重新扫一遍同一查询，并尽量保持「当前命中」不变（展开分组后 DOM 变了要用）。 */
  const recollect = (keep: Range): boolean => {
    ranges = query === '' ? [] : collectRanges(win, scopeElement(), query, getConfig().regexFindMode);
    const key = keyOf(keep);
    const found = ranges.findIndex((item) => keyOf(item) === key);
    if (found < 0) {
      index = ranges.length === 0 ? -1 : 0;
      return false;
    }
    index = found;
    return true;
  };

  const search = (nextQuery: string): void => {
    query = nextQuery;
    const started = now();
    ranges = query === '' ? [] : collectRanges(win, scopeElement(), query, getConfig().regexFindMode);
    scanMs = now() - started;
    index = ranges.length === 0 ? -1 : 0;
    if (overlay === null) paintHighlights(win, [], undefined);
    present();
  };

  /**
   * `.` / `,`：跳向下一个 / 上一个命中。
   *
   * 三阶段，顺序很重要：
   *   ① 先找**下一个已渲染**的命中（最常见，也最快）；
   *   ② 都不渲染时，找下一个**能展开的**（折叠分组里的命中）→ 点开 → 重新收集 → 再跳；
   *   ③ 连布局信息都没有（测试替身/极简环境）→ 退化为按顺序跳，别把功能锁死。
   */
  const step = (direction: 1 | -1): boolean => {
    if (ranges.length === 0) return open();
    const order = Array.from({ length: ranges.length }, (_, hop) => (
      ((index + direction * (hop + 1)) % ranges.length + ranges.length) % ranges.length
    ));
    const rendered = order.find((candidate) => {
      const range = ranges[candidate];
      return range !== undefined && isRendered(range);
    });
    if (rendered !== undefined) {
      index = rendered;
      present();
      return true;
    }
    for (const candidate of order) {
      const range = ranges[candidate];
      if (range === undefined || !reveal(range)) continue;
      if (recollect(range)) {
        present();
        return true;
      }
    }
    const fallback = order[0];
    if (fallback === undefined) return false;
    index = fallback;
    present();
    return true;
  };

  /**
   * 提交：收起输入框、把焦点还给页面，查找条变成只读 HUD。
   *
   * 这是所有者要的手感（也贴合 Vimium / 浏览器原生查找条）：回车之后**查找框不聚焦**，
   * 于是 `,` / `.` 能直接前后跳（否则按键会被输入框吃掉）。再按 `/` 会回到编辑态并全选查询。
   */
  const commit = (): void => {
    committed = true;
    try {
      input?.blur();
    } catch {
      /* 忽略 */
    }
    syncMode();
  };

  const onInputKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      step(event.shiftKey ? -1 : 1);
      commit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const onInput = (): void => {
    const value = input?.value ?? '';
    if (timer !== null && typeof win.clearTimeout === 'function') win.clearTimeout(timer);
    const run = (): void => {
      timer = null;
      search(value);
    };
    if (typeof win.setTimeout === 'function') timer = win.setTimeout(run, INPUT_DEBOUNCE_MS);
    else run();
  };

  const open = (): boolean => {
    if (overlay !== null) {
      // 已在 HUD 形态：回到编辑态并全选，方便直接改查询
      committed = false;
      syncMode();
      input?.focus();
      input?.select();
      return true;
    }
    ensureStyle(win);
    const doc = win.document;
    previousFocus = doc.activeElement;
    const box = doc.createElement('div');
    box.setAttribute('data-vimc-find', '');
    Object.assign(box.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 8px',
      borderRadius: '6px',
      border: '1px solid var(--dsw-alias-border-l2, #555)',
      background: 'var(--dsw-alias-bg-overlay, #1f1f1f)',
      color: 'var(--dsw-alias-label-primary, #eee)',
      boxShadow: '0 2px 8px rgba(0,0,0,.28)',
      font: `12px/1.5 ${FONT_STACK}`,
      opacity: '1',
    } satisfies Partial<CSSStyleDeclaration>);
    const prompt = doc.createElement('span');
    prompt.textContent = '/';
    prompt.style.opacity = '0.5';
    const field = doc.createElement('input');
    field.setAttribute('data-vimc-find-input', '');
    field.type = 'text';
    field.value = query;
    field.placeholder = '查找…';
    Object.assign(field.style, {
      width: '160px',
      border: '0',
      outline: '0',
      background: 'transparent',
      color: 'inherit',
      font: 'inherit',
    } satisfies Partial<CSSStyleDeclaration>);
    // 提交态显示用（只读文本）
    const text = doc.createElement('span');
    text.setAttribute('data-vimc-find-text', '');
    text.textContent = query;
    text.style.display = 'none';
    const count = doc.createElement('span');
    count.setAttribute('data-vimc-find-count', '');
    count.style.opacity = '0.6';
    count.textContent = '(0 处)';
    field.addEventListener('input', onInput);
    field.addEventListener('keydown', onInputKeyDown);
    box.append(prompt, field, text, count);
    doc.body.append(box);
    overlay = box;
    input = field;
    committedText = text;
    counter = count;
    committed = false;
    syncMode();
    field.focus();
    field.select();
    if (query !== '') search(query);
    else render();
    return true;
  };

  const close = (): void => {
    if (timer !== null && typeof win.clearTimeout === 'function') win.clearTimeout(timer);
    timer = null;
    overlay?.remove();
    overlay = null;
    input = null;
    committedText = null;
    counter = null;
    committed = false;
    clearHighlights(win);
    removePing();
    const restore = previousFocus;
    previousFocus = null;
    if (restore !== null && restore.isConnected && typeof (restore as HTMLElement).focus === 'function') {
      try {
        (restore as HTMLElement).focus({ preventScroll: true });
      } catch {
        /* 焦点还不了就算了 */
      }
    }
  };

  return {
    open,
    next: () => step(1),
    previous: () => step(-1),
    close,
    active: () => overlay !== null,
    /** 已提交（只读 HUD、不聚焦）时为 `true`。 */
    committedState: () => committed,
    stats: () => ({
      active: overlay !== null,
      committed,
      matches: ranges.length,
      current: index < 0 ? 0 : index + 1,
      scanMs: Math.round(scanMs * 1000) / 1000,
      regex: getConfig().regexFindMode,
      highlight: (win as unknown as { CSS?: { highlights?: unknown } }).CSS?.highlights === undefined ? 'none' : 'custom',
      pings,
      repositions: pingRepositions,
    }),
    dispose: () => {
      close();
      removePing();
      win.document.querySelector('style[data-vimc-find-style]')?.remove();
      ranges = [];
      index = -1;
    },
  };
}

/** 供引擎判定用：这些键在查找框里应由输入框自己处理（避免与插件命令打架）。 */
export function isFindKey(event: KeyEventLike): boolean {
  return event.key === 'Enter' || event.key === 'Escape';
}
