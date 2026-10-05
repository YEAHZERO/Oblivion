/**
 * @oblivion/vimc — 滚动容器发现与滚动执行。
 *
 * ## 为什么不能直接 `window.scrollBy`
 *
 * 「把 DSH 当浏览器」这句需求里，真正的难点不是按键，而是**滚谁**。
 * DSH 是 100vh 的应用外壳：`html`/`body` 基本不滚，可滚的是内部若干
 * `overflow: auto` 的面板（会话正文、设置弹窗正文、侧栏列表……）。
 * 所以这里照 Vimium 的思路做**滚动目标发现**，而不是假定文档可滚：
 *
 *   ① 取视口正中点命中元素，沿祖先链（**跨 shadow DOM**）找该轴最近的
 *      可滚动祖先 —— 几何上是稳定的，弹窗打开时自然滚弹窗；
 *   ② 找不到就退回**上一次滚过的容器**（仍连接且仍可滚时）；
 *   ③ 再退到根滚动元素（整页滚动型页面）。
 *
 * 横向轴（`a`/`d`）用的是同一套发现逻辑，因此光标中心压在宽代码块/宽表格上时，
 * 会先滚那个块自己的横向滚动条 —— 这正是 `scrollLeft/scrollRight` 该有的手感。
 */

import type { WindowLike } from './types.js';

export type Axis = 'x' | 'y';

/** 这些 `overflow` 值允许滚。 */
const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay']);

/** 小于这个像素的溢出当成「不滚」，避免布局抖动引起的 1px 幽灵滚动。 */
const MIN_OVERFLOW_PX = 4;

/**
 * 各轴的**优先容器**：视口正中点探测失败时的第一顺位兜底。
 *
 * `[data-conversation-scroll]` 是 DSH 会话正文滚动区的官方数据属性
 * （`ui-conversation` 的 `ConversationRoot`，CSS 里是 `overflow-y: auto`；
 * 桌面端 0.2.0-rc.2 实测存在）。放在**探测之后**而不是之前是有意的：
 * 弹窗打开时视口中心落在弹窗里，应当先滚弹窗，而不是滚它背后被遮住的正文。
 */
const PREFERRED: Readonly<Record<Axis, readonly string[]>> = {
  y: ['[data-conversation-scroll]'],
  x: [],
};

function parentOf(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  // 跨 shadow 边界：宿主元素是 shadow 根的上层父节点。
  const root = typeof element.getRootNode === 'function' ? element.getRootNode() : null;
  const host = root !== null && 'host' in root ? (root as ShadowRoot).host : null;
  return host ?? null;
}

function overflowAmount(element: Element, axis: Axis): number {
  return axis === 'y'
    ? element.scrollHeight - element.clientHeight
    : element.scrollWidth - element.clientWidth;
}

function overflowOf(win: WindowLike, element: Element, axis: Axis): string {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    style = null;
  }
  if (style === null) return 'visible';
  return axis === 'y' ? style.overflowY : style.overflowX;
}

/**
 * 该元素在这个轴上是否真的可滚。
 *
 * 根滚动元素（`html`/`body`/`scrollingElement`）是特例：它的 `overflow` 计算值
 * 往往是 `visible`，但整页确实能滚，所以只看溢出量。
 */
export function isScrollable(win: WindowLike, element: Element | null, axis: Axis): boolean {
  if (element === null) return false;
  if (overflowAmount(element, axis) <= MIN_OVERFLOW_PX) return false;
  const doc = win.document;
  if (element === doc.scrollingElement || element === doc.documentElement || element === doc.body) return true;
  return SCROLLABLE_OVERFLOW.has(overflowOf(win, element, axis));
}

function nearestScrollable(win: WindowLike, start: Element | null, axis: Axis): Element | null {
  for (let element = start; element !== null; element = parentOf(element)) {
    if (isScrollable(win, element, axis)) return element;
  }
  return null;
}

/** 可见元素才参与兜底（隐藏的会话视图同样带着数据属性）。 */
function isRendered(element: Element): boolean {
  try {
    return element.getClientRects().length > 0 && element.clientHeight > 0;
  } catch {
    return true;
  }
}

/**
 * 给元素一个可读标识（诊断 / 自证用）。
 *
 * 只输出标签、id 与两个官方数据属性 —— 不输出 class（CSS Module 的类名是哈希、
 * 跨版本无意义）也不输出文本内容。
 */
export function describeElement(element: Element | null): string | null {
  if (element === null) return null;
  const tag = element.tagName.toLowerCase();
  const id = element.id === '' ? '' : `#${element.id}`;
  for (const marker of ['data-conversation-scroll', 'data-composer-input', 'data-input-scroll']) {
    if (typeof element.hasAttribute === 'function' && element.hasAttribute(marker)) return `${tag}${id}[${marker}]`;
  }
  return `${tag}${id}`;
}

/** 该元素在这个轴上的可滚距离（诊断用）。 */
export function scrollRange(element: Element | null, axis: Axis): number {
  return element === null ? 0 : Math.max(0, overflowAmount(element, axis));
}

/** 按优先选择器取「面积最大的那个可见可滚容器」。 */
function preferredScrollable(win: WindowLike, axis: Axis): Element | null {
  let winner: Element | null = null;
  let bestArea = 0;
  for (const selector of PREFERRED[axis]) {
    let matches: Element[] = [];
    try {
      matches = Array.from(win.document.querySelectorAll(selector));
    } catch {
      matches = [];
    }
    for (const element of matches) {
      if (!isScrollable(win, element, axis) || !isRendered(element)) continue;
      const area = element.clientWidth * element.clientHeight;
      if (area > bestArea) {
        bestArea = area;
        winner = element;
      }
    }
  }
  return winner;
}

/** 视口正中点命中的元素（可能落在 shadow DOM 里，那时返回的是宿主）。 */
function probeCenter(win: WindowLike): Element | null {
  const doc = win.document;
  let hit: Element | null = null;
  if (typeof doc.elementFromPoint === 'function') {
    try {
      hit = doc.elementFromPoint(Math.max(1, Math.round(win.innerWidth / 2)), Math.max(1, Math.round(win.innerHeight / 2)));
    } catch {
      hit = null;
    }
  }
  return hit ?? doc.activeElement ?? doc.body ?? null;
}

export class Scroller {
  private last: Element | null = null;

  constructor(private readonly win: WindowLike) {}

  /** 该轴当前的滚动目标；找不到返回 `null`。 */
  target(axis: Axis): Element | null {
    const doc = this.win.document;
    const fromCenter = nearestScrollable(this.win, probeCenter(this.win), axis);
    if (fromCenter !== null) return fromCenter;
    const preferred = preferredScrollable(this.win, axis);
    if (preferred !== null) return preferred;
    if (isScrollable(this.win, this.last, axis)) return this.last;
    const root = doc.scrollingElement ?? doc.documentElement;
    if (isScrollable(this.win, root, axis)) return root;
    return null;
  }

  /** 按容器可视尺寸的 `ratio` 翻一屏。 */
  page(axis: Axis, direction: 1 | -1, ratio: number, smooth: boolean): boolean {
    const element = this.target(axis);
    if (element === null) return false;
    const size = axis === 'y' ? element.clientHeight : element.clientWidth;
    if (!(size > 0)) return false;
    const step = Math.max(1, Math.round(size * ratio)) * direction;
    return this.move(element, axis === 'x' ? step : 0, axis === 'y' ? step : 0, smooth);
  }

  /**
   * 按像素步进（Vimium-C 的 `scrollUp/Down/Left/Right`、`scrollPx*`，步长 = `scrollStepSize`）。
   *
   * @param delta 正负像素（正 = 右/下）。
   */
  byPixels(axis: Axis, delta: number, smooth: boolean): boolean {
    if (delta === 0) return false;
    const element = this.target(axis);
    if (element === null) return false;
    return this.move(element, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0, smooth);
  }

  /** 跳到该轴的头部/尾部。 */
  edge(axis: Axis, edge: 'start' | 'end', smooth: boolean): boolean {
    const element = this.target(axis);
    if (element === null) return false;
    const position = edge === 'start' ? 0 : axis === 'y' ? element.scrollHeight : element.scrollWidth;
    return this.moveTo(element, axis === 'x' ? position : null, axis === 'y' ? position : null, smooth);
  }

  /** 丢掉「上次滚动容器」的记忆（卸载时调用）。 */
  forget(): void {
    this.last = null;
  }

  private move(element: Element, left: number, top: number, smooth: boolean): boolean {
    this.last = element;
    const behavior = (smooth ? 'smooth' : 'instant') as unknown as ScrollBehavior;
    try {
      if (typeof element.scrollBy === 'function') {
        element.scrollBy({ left, top, behavior });
        return true;
      }
    } catch {
      /* 落到下面的赋值兜底 */
    }
    element.scrollLeft += left;
    element.scrollTop += top;
    return true;
  }

  private moveTo(element: Element, left: number | null, top: number | null, smooth: boolean): boolean {
    this.last = element;
    const behavior = (smooth ? 'smooth' : 'instant') as unknown as ScrollBehavior;
    const options: ScrollToOptions = { behavior };
    if (top !== null) options.top = top;
    if (left !== null) options.left = left;
    try {
      if (typeof element.scrollTo === 'function') {
        element.scrollTo(options);
        return true;
      }
    } catch {
      /* 落到下面的赋值兜底 */
    }
    if (top !== null) element.scrollTop = top;
    if (left !== null) element.scrollLeft = left;
    return true;
  }
}
