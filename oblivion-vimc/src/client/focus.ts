/**
 * @oblivion/vimc — 「焦点在不在输入框里」判定 + `i` 聚焦输入框。
 *
 * ## 核心约束就落在这里
 *
 * 需求原文：「**当鼠标点击主页面 / 鼠标未聚焦到输入框内时**」才用快捷键。
 * 所以每个按键事件都先问一句 `isEditableFocus(...)`：只要焦点（或事件目标）
 * 落在可编辑元素 / 终端里，插件**完全不接管**，一个字符都不会吞。
 *
 * 判定与 DSH 自己的 `@deepseek-ai/dsh-client-shortcuts` 口径保持一致
 * （见 `packages/client/shortcuts/src/client/dom.ts`）：
 *   `input, textarea, select, [contenteditable="true"], [contenteditable=""]` → 可编辑区
 *   `.xterm` → 终端区
 * 本插件额外把 `[contenteditable="plaintext-only"]`、`[role="textbox"]` 也算进去，
 * 因为 DSH 的输入框是 **contenteditable 的 Lexical 宿主**（`[data-composer-input]`）。
 */

import type { KeyEventLike, WindowLike } from './types.js';
import { asElement } from './types.js';
import type { VimcSelectMode } from './config.js';

/** 可编辑元素选择器（与 DSH 内置快捷键服务的口径对齐后再宽一点）。 */
const EDITABLE_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(', ');

/** 终端区（xterm 用隐藏 textarea 接管键盘，但仍单独判一次，语义更明确）。 */
const TERMINAL_SELECTOR = '.xterm, .xterm-helper-textarea';

/** 侧栏/导航区：`i` 选输入框时降权，避免抢到侧栏搜索框。 */
const SIDEBAR_SELECTOR = 'aside, nav, [role="navigation"], [data-sidebar]';

/** 输入框候选（通用兜底；优先选择器命中时用不到）。 */
const INPUT_SELECTOR = [
  'textarea',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  'input:not([type])',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(', ');

/** 菜单/弹窗打开时不抢 `Esc`。 */
const POPUP_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"], [data-shortcut-modal]';

function closest(element: Element, selector: string): Element | null {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

/** 该元素本身是否处在可编辑/终端区域里。 */
export function isEditableElement(element: Element | null): boolean {
  if (element === null) return false;
  if (closest(element, EDITABLE_SELECTOR) !== null) return true;
  return closest(element, TERMINAL_SELECTOR) !== null;
}

/**
 * 事件目标或当前焦点是否落在可编辑区。
 *
 * 两个都查：事件目标可能是 `body`（例如刚点过页面空白处），而焦点还在输入框里；
 * 反过来也成立（焦点在页面，事件却来自某个可编辑子节点）。
 */
export function isEditableFocus(win: WindowLike, target: EventTarget | null | undefined): boolean {
  const fromEvent = asElement(target);
  if (isEditableElement(fromEvent)) return true;
  const active = win.document.activeElement;
  return isEditableElement(active === undefined ? null : active);
}

/** 事件里最深的目标元素（穿透 shadow DOM 的 retargeting）。 */
export function eventTarget(event: KeyEventLike): EventTarget | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : undefined;
  const first = path !== undefined && path.length > 0 ? path[0] : undefined;
  if (first !== undefined && first !== null) return first;
  return event.target ?? null;
}

/** 是否有菜单/弹窗开着（`Esc` 让位给它）。 */
export function hasOpenPopup(win: WindowLike): boolean {
  try {
    return win.document.querySelector(POPUP_SELECTOR) !== null;
  } catch {
    return false;
  }
}

function isVisible(win: WindowLike, element: Element): boolean {
  if (typeof element.hasAttribute === 'function' && element.hasAttribute('hidden')) return false;
  if (typeof element.getAttribute === 'function' && element.getAttribute('aria-hidden') === 'true') return false;
  try {
    const rects = element.getClientRects();
    if (rects.length === 0) return false;
  } catch {
    /* 没有布局信息时不做否定判断 */
  }
  let style: CSSStyleDeclaration | null = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    style = null;
  }
  if (style === null) return true;
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  return !(style.opacity !== '' && Number(style.opacity) === 0);
}

/**
 * 是否可作为聚焦目标。
 *
 * @param lenient 优先选择器用宽松判定：DSH 的输入框在「未选模型」等状态下带
 *   `aria-disabled="true"`，但点它仍会打开选择器 —— 所以仍然应该聚焦它。
 */
function isUsable(element: Element, win: WindowLike, lenient: boolean): boolean {
  const candidate = element as HTMLElement & { disabled?: boolean; readOnly?: boolean };
  if (typeof candidate.focus !== 'function') return false;
  if (!lenient) {
    if (candidate.disabled === true || candidate.readOnly === true) return false;
    if (typeof element.getAttribute === 'function') {
      if (element.getAttribute('aria-disabled') === 'true') return false;
      if (element.getAttribute('contenteditable') === 'false') return false;
    }
  }
  return isVisible(win, element);
}

/** 给候选打分：非侧栏 > 在视口内 > 面积大 > 离视口中心近。 */
function score(win: WindowLike, element: Element): number {
  const inSidebar = closest(element, SIDEBAR_SELECTOR) !== null;
  let rect: DOMRect | null = null;
  try {
    rect = element.getBoundingClientRect();
  } catch {
    rect = null;
  }
  const width = rect === null ? 0 : rect.width;
  const height = rect === null ? 0 : rect.height;
  const onScreen = rect !== null && rect.bottom > 0 && rect.top < win.innerHeight ? 100 : 0;
  const area = Math.min(300, Math.log10(1 + Math.max(0, width * height)) * 60);
  let proximity = 0;
  if (rect !== null) {
    const distance = Math.hypot(
      rect.left + width / 2 - win.innerWidth / 2,
      rect.top + height / 2 - win.innerHeight / 2,
    );
    const span = Math.hypot(win.innerWidth, win.innerHeight) || 1;
    proximity = (1 - Math.min(1, distance / span)) * 120;
  }
  return (inSidebar ? 0 : 400) + onScreen + area + proximity;
}

function queryAll(win: WindowLike, selector: string): Element[] {
  try {
    return Array.from(win.document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function best(candidates: readonly Element[], win: WindowLike, lenient: boolean): HTMLElement | null {
  let winner: Element | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (!isUsable(candidate, win, lenient)) continue;
    const value = score(win, candidate);
    if (value > bestScore) {
      bestScore = value;
      winner = candidate;
    }
  }
  return winner === null ? null : (winner as HTMLElement);
}

/** 输入框命中的来源：优先选择器（`prefer`）还是通用打分。 */
export interface InputMatch {
  element: HTMLElement;
  via: string;
}

/**
 * 找要聚焦的输入框：先按 `prefer` 选择器精确命中（DSH 输入框是
 * `[data-composer-input]`），再退到通用候选并靠打分挑「最像主输入框」的那个。
 */
export function findInput(win: WindowLike, prefer: readonly string[]): InputMatch | null {
  for (const selector of prefer) {
    const found = best(queryAll(win, selector), win, true);
    if (found !== null) return { element: found, via: selector };
  }
  const fallback = best(queryAll(win, INPUT_SELECTOR), win, false);
  return fallback === null ? null : { element: fallback, via: 'generic' };
}

function isContentEditableHost(element: HTMLElement): boolean {
  let attribute: string | null = null;
  try {
    attribute = element.getAttribute('contenteditable');
  } catch {
    attribute = null;
  }
  if (attribute !== null && attribute !== 'false') return true;
  return element.isContentEditable === true;
}

function isTextControl(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  const candidate = element as HTMLInputElement | HTMLTextAreaElement;
  return typeof candidate.setSelectionRange === 'function' || typeof candidate.value === 'string';
}

/** 文本里「最后一行的起点」下标（`select: 'all-line'` 用）。 */
export function lastLineStart(text: string): number {
  const index = text.lastIndexOf('\n');
  return index < 0 ? 0 : index + 1;
}

function applySelection(win: WindowLike, element: HTMLElement, mode: VimcSelectMode): void {
  const doc = win.document;
  if (isContentEditableHost(element)) {
    const selection = typeof win.getSelection === 'function'
      ? win.getSelection()
      : typeof doc.getSelection === 'function'
        ? doc.getSelection()
        : null;
    if (selection === null) return;
    const range = doc.createRange();
    if (mode === 'all') {
      range.selectNodeContents(element);
    } else {
      range.selectNodeContents(element);
      range.collapse(false);
      selectLastLine(element, range);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  if (isTextControl(element)) {
    const value = element.value;
    const end = value.length;
    const start = mode === 'all' ? 0 : lastLineStart(value);
    element.setSelectionRange(start, end);
  }
}

/** 把已折叠到末尾的 Range 的起点回退到最后一行的开头。 */
function selectLastLine(element: HTMLElement, range: Range): void {
  const doc = element.ownerDocument;
  if (doc === null || typeof doc.createTreeWalker !== 'function') return;
  const nodes: Text[] = [];
  let total = 0;
  try {
    const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT：用数字常量，避免依赖全局 NodeFilter */);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node as Text;
      nodes.push(text);
      total += text.data.length;
    }
  } catch {
    return;
  }
  if (nodes.length === 0 || total === 0) return;
  const content = nodes.map((node) => node.data).join('');
  const start = lastLineStart(content);
  if (start <= 0) return;
  let consumed = 0;
  for (const node of nodes) {
    const length = node.data.length;
    if (start <= consumed + length) {
      range.setStart(node, start - consumed);
      return;
    }
    consumed += length;
  }
}

/**
 * 聚焦目标并按配置设置选区。
 *
 * 选区设置整体包在 try/catch 里：不同编辑器（Lexical/CodeMirror）对程序化
 * 选区的容忍度不同，**聚焦成功**才是这个命令的语义，选区只是加分项。
 */
export function focusTarget(win: WindowLike, element: HTMLElement, mode: VimcSelectMode): boolean {
  try {
    element.focus({ preventScroll: false });
  } catch {
    try {
      element.focus();
    } catch {
      return false;
    }
  }
  if (mode !== 'none') {
    try {
      applySelection(win, element, mode);
    } catch {
      /* 选区失败不影响聚焦 */
    }
  }
  return true;
}

/** 让当前焦点退出输入框（`escapeToPage`）。 */
export function blurActive(win: WindowLike): boolean {
  const active = win.document.activeElement;
  if (active === null || typeof (active as HTMLElement).blur !== 'function') return false;
  try {
    (active as HTMLElement).blur();
  } catch {
    return false;
  }
  return true;
}
