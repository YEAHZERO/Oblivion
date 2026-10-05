/**
 * @oblivion/vimc — 链接提示（`f`，对应 Vimium-C 的 `LinkHints.activate`）。
 *
 * ## 交互
 *
 * 按 `f` → 当前**视口内**每个可点击元素上浮出一个字母标签 → 输入字母即触发该元素；
 * 标签数量超过字母表长度时自动变成**两个字母**；按 `Esc` 或输入字母表之外的键取消。
 *
 * ## 为什么是「统一长度」而不是「先单字母、不够再双字母」
 *
 * 有两种朴素做法：
 *
 * - **(A) 统一长度**：数量 ≤ 字母表长度时全部单字母，否则全部双字母
 * - **(B) 混合**：前 N 个单字母、其余双字母
 *
 * (B) 更省击键，但有**前缀歧义**：既存在标签 `d` 又存在 `da` 时，输入 `d` 到底是立即触发还是等待？
 * 上游 Vimium-C（`content/hint_filters.ts`）选择「完整匹配 + 前缀并存时等 255ms 定时器」。
 * 本插件的做法是 (B) 的**无歧义版本**：两位串的首字母**从单字母用剩的字母里预留**，
 * 于是单字母永远可以立即触发、也不需要任何等待启发式。
 *
 * ## 元素识别
 *
 * 用一份「可点击」选择器表 + 可见性/禁用/遮挡过滤，再去掉「包含另一个候选」的外层元素
 * （`<label><input></label>` 取内层），然后**按优先级分档**（内联引用 → 正文其它 → 外部），
 * 档内按屏幕阅读顺序（行 → 左）排序后分配字母。
 *
 * ## 上游参考
 *
 * Vimium-C（Apache-2.0，Copyright 2023-present Gong Dahan）的 `content/hint_filters.ts` /
 * `content/link_hints.ts`。本文件是独立实现，**未复制上游代码**；差异见 README「参考与许可」。
 */

import type { KeyEventLike, WindowLike } from './types.js';
import type { VimcConfig } from './config.js';
import { describeElement } from './scroller.js';

/** 可点击元素选择器（与 Vimium 的口径接近，去掉浏览器扩展专有的部分）。 */
const CLICKABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
  'select',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** 单次最多提示多少个（防极端页面把 DOM 拖死）。 */
const MAX_HINTS = 400;

/** 标签容器与标签的属性名（测试与自证都靠它认出来）。 */
export const HINT_CONTAINER_ATTRIBUTE = 'data-vimc-hints';
export const HINT_LABEL_ATTRIBUTE = 'data-vimc-hint';

/**
 * 生成 `count` 个提示串。
 *
 * 顺序即优先级：**前面的候选拿更短的提示**。数量装得下就全给单字母；
 * 装不下时用「保留首字母」的混合长度方案，保证**前缀无歧义**：
 *
 * ```
 * 字母表 dsavewrqcxz、15 个候选 →
 *   d s a v e w r q c x      ← 前 10 个：单字母
 *   zd zs za zv ze …          ← 其余：两字母，且首字母只用被「保留」的 z
 * ```
 *
 * 于是：按 `d` 立即触发那一个；按 `z` 会等第二个字母（因为它只出现在两字母串里）。
 * 候选太多、两级放不下时退回**统一长度**（老行为）。
 *
 * ⚠️ 这条规则与所有者要求一致：**会话正文里的链接优先**，外部按钮排在后面（见 `scanClickable` 的 tier）。
 *
 * @param count 候选数量。
 * @param characters 字母表（顺序即优先级，例如 Vimium-C 导出里的 `dsavewrqcxz`）。
 */
export function generateHintStrings(count: number, characters: string): string[] {
  const alphabet = [...characters];
  const size = alphabet.length;
  if (count <= 0 || size === 0) return [];
  if (count <= size) return alphabet.slice(0, count);

  // 混合长度：单字母最多用到第 size-1 个，剩下的字母保留作两字母串的首字母
  let short = 0;
  for (let candidate = size - 1; candidate >= 1; candidate -= 1) {
    if (count - candidate <= (size - candidate) * size) {
      short = candidate;
      break;
    }
  }
  if (short > 0) {
    const mixed = alphabet.slice(0, short);
    for (const first of alphabet.slice(short)) {
      for (const char of alphabet) {
        if (mixed.length >= count) break;
        mixed.push(`${first}${char}`);
      }
      if (mixed.length >= count) break;
    }
    if (mixed.length >= count) return mixed.slice(0, count);
  }

  // 兜底：统一长度
  let digits = 1;
  let capacity = size;
  while (capacity < count) {
    digits += 1;
    capacity *= size;
  }
  const hints: string[] = [];
  const build = (prefix: string, remaining: number): void => {
    if (hints.length >= count) return;
    if (remaining === 0) {
      hints.push(prefix);
      return;
    }
    for (const char of alphabet) {
      if (hints.length >= count) return;
      build(`${prefix}${char}`, remaining - 1);
    }
  };
  build('', digits);
  return hints.slice(0, count);
}

function rectOf(element: Element): DOMRect | null {
  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
}

/** 廉价前置检查：属性 / 禁用状态（不触发布局、不读计算样式）。 */
function isCandidate(element: Element): boolean {
  if (typeof element.hasAttribute === 'function') {
    if (element.hasAttribute('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.getAttribute('aria-disabled') === 'true') return false;
    if (element.getAttribute('disabled') !== null) return false;
  }
  const candidate = element as { disabled?: boolean; type?: string };
  if (candidate.disabled === true) return false;
  return candidate.type !== 'hidden';
}

/**
 * 样式可见性检查（**慢路径**）。
 *
 * ⚠️ 计算样式是这条链路里最贵的一步：在 DSH 这种规则极多的页面上，`getComputedStyle`
 * 每个元素的成本是**毫秒级**的，实测 74 个视口内元素就要 ~110ms。所以只在
 * 浏览器不支持 `checkVisibility()` 时才走这里（见 `candidateVisible`）。
 */
function styledVisible(win: WindowLike, element: Element): boolean {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    return true;
  }
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (style.opacity !== '' && Number(style.opacity) === 0) return false;
  return style.pointerEvents !== 'none';
}

/** 浏览器原生可见性判定（Chromium 105+ / Safari 17+）。 */
interface VisibilityCapable {
  checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;
}

/**
 * 元素是否可见 —— **快路径优先**。
 *
 * `checkVisibility()` 是引擎内部一次调用（不构造 `CSSStyleDeclaration`），在实测页面上
 * 比 `getComputedStyle` 快一个数量级。它不覆盖 `pointer-events`，所以这里额外查一次
 * **行内** `pointer-events: none`（免费）；继承来的 `pointer-events: none` 不再检查 ——
 * 代价（毫秒级慢路径）远大于收益（那种容器里本来也不会有可点击目标）。
 */
function candidateVisible(win: WindowLike, element: Element): boolean {
  const capable = element as VisibilityCapable & { style?: CSSStyleDeclaration };
  if (capable.style !== undefined && capable.style.pointerEvents === 'none') return false;
  if (typeof capable.checkVisibility === 'function') {
    try {
      return capable.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    } catch {
      /* 落到计算样式 */
    }
  }
  return styledVisible(win, element);
}

function inViewport(win: WindowLike, rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.top < win.innerHeight
    && rect.right > 0 && rect.left < win.innerWidth;
}

export interface ClickableScan {
  /** 通过全部筛选的候选（**已按优先级排序**：正文链接 → 正文其它 → 外部）。 */
  readonly elements: HTMLElement[];
  /** 选择器原始命中数（诊断漏斗：原始命中 → 候选）。 */
  readonly matched: number;
  /** 三档候选的数量（与 `elements` 的前后顺序对应）。 */
  readonly tiers: ClickableTiers;
  /** 前几个「内联引用」的判定信号（`link`/`path`/`at`/`ext`；只报信号名，不含属性值）。 */
  readonly referenceSignals: readonly string[];
}

/** 候选优先级分档：正文里的**内联引用** → 正文里其它可点击 → 正文之外（侧栏/工具栏/输入区）。 */
export interface ClickableTiers {
  /** 正文里的内联引用 / 链接（详见 `isReference`）。 */
  readonly references: number;
  /** 会话正文里的其它可点击元素（消息操作按钮、`summary`、`[tabindex]`…）。 */
  readonly content: number;
  /** 正文之外的可点击元素（外部按钮等）。 */
  readonly outer: number;
}

/**
 * 「引用目标」的样子。
 *
 * 实测依据（所有者截图）：鼠标悬停 DSH 里的 `@oblivion/brand` 这类内联引用时，
 * 提示气泡显示的是它指向的**文件路径**（如 `oblivion-vimc/README.md`）——也就是说
 * 那个 `button[data-variant]` 的 `title` / `aria-label` 里就是路径。
 *
 * 判据刻意收紧，避免把「版本号」当成路径（实测踩过：`aria-label` 里带 `v4.1` 的按钮被误判）：
 *   ① 含路径分隔符 `/` 或 `\`；② 以 `@` 开头的提及；③ 以**已知文件扩展名**结尾
 *   （只列常见的，不用「点 + 短串」这种宽泛规则）。
 */
const REFERENCE_PATH = /[/\\]/;
const REFERENCE_AT = /^@/;
const REFERENCE_EXTENSION = /\.(?:md|markdown|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|ts|tsx|js|jsx|mjs|cjs|css|scss|less|html?|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|sql|xml|svg|png|jpe?g|gif|webp|log|lock|env)$/i;

type ReferenceSignal = 'link' | 'path' | 'at' | 'ext';

/** 判定「内联引用」的命中原因（`null` = 不是引用）；自检里只报信号名，不报属性值。 */
function referenceSignal(element: Element): ReferenceSignal | null {
  if (isLinkish(element)) return 'link';
  if (typeof element.getAttribute !== 'function') return null;
  for (const name of ['title', 'aria-label']) {
    const value = element.getAttribute(name);
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.length > 200) continue;
    // `@提及` 比「含斜杠」更具体，先判它（`@oblivion/brand` 两种都命中）
    if (REFERENCE_AT.test(trimmed)) return 'at';
    if (REFERENCE_PATH.test(trimmed)) return 'path';
    if (REFERENCE_EXTENSION.test(trimmed)) return 'ext';
  }
  return null;
}

/** 是不是「内联引用 / 链接」。 */
function isReference(element: Element): boolean {
  return referenceSignal(element) !== null;
}

/** 是不是「链接类」元素。 */
function isLinkish(element: Element): boolean {
  if (typeof element.getAttribute === 'function') {
    if (element.getAttribute('role') === 'link') return true;
    if (element.getAttribute('data-href') !== null) return true;
  }
  const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';
  if (tag === 'a' && typeof element.hasAttribute === 'function' && element.hasAttribute('href')) return true;
  return typeof element.closest === 'function' && element.closest('a[href]') !== null;
}

/**
 * 扫描视口内可点击元素。
 *
 * 筛选顺序按「便宜 → 昂贵」排（这是**实测调出来的**：早期版本对每个命中元素都读计算样式，
 * 在真机上 74 个候选要 ~110ms）：
 *
 *   ① 一次 `closest()` 排除我们的浮层与 `aria-hidden` 子树；
 *   ② 属性/禁用状态（免费）；
 *   ③ `checkVisibility()`（引擎内部一次判定，不构造样式对象）；
 *   ④ `getBoundingClientRect()` 一次 → 视口算术（免费）；
 *   ⑤ 只有走到这里的元素才会被记录。
 *
 * 排序再叠一层**优先级**：正文里的**内联引用**最前，其次正文里其它元素，外部按钮最后 ——
 * 提示串按这个顺序分配，于是「正文链接/引用优先拿单字母」（所有者要求）。
 *
 * @param options.primary 会话正文容器（拿不到时全部按外部处理，排序退回几何顺序）。
 */
export function scanClickable(win: WindowLike, options: { primary?: Element | null } = {}): ClickableScan {
  let nodes: Element[] = [];
  try {
    nodes = Array.from(win.document.querySelectorAll(CLICKABLE_SELECTOR));
  } catch {
    return { elements: [], matched: 0, tiers: { references: 0, content: 0, outer: 0 }, referenceSignals: [] };
  }
  const matched = nodes.length;
  const primary = options.primary ?? null;
  const inPrimary = (element: Element): boolean => primary !== null && typeof primary.contains === 'function' && primary.contains(element);
  const tierOf = (element: Element): 0 | 1 | 2 => (inPrimary(element) ? (isReference(element) ? 0 : 1) : 2);
  const candidates: { element: HTMLElement; rect: DOMRect }[] = [];
  for (const element of nodes) {
    if (candidates.length >= MAX_HINTS) break;
    if (element.closest(`[${HINT_CONTAINER_ATTRIBUTE}],[aria-hidden="true"]`) !== null) continue;
    if (!isCandidate(element)) continue;
    if (!candidateVisible(win, element)) continue;
    const rect = rectOf(element);
    if (rect === null || !inViewport(win, rect)) continue;
    candidates.push({ element: element as HTMLElement, rect });
  }
  // 外层包含内层候选时只留内层（`<label><input type=checkbox></label>` 这类）。
  const inner = candidates.filter((candidate) => !candidates.some((other) => (
    other !== candidate && candidate.element.contains(other.element)
  )));
  inner.sort((left, right) => {
    const tierGap = tierOf(left.element) - tierOf(right.element);
    if (tierGap !== 0) return tierGap;
    const rowGap = Math.round(left.rect.top / 8) - Math.round(right.rect.top / 8);
    return rowGap !== 0 ? rowGap : left.rect.left - right.rect.left;
  });
  const tiers = { references: 0, content: 0, outer: 0 };
  const signals: ReferenceSignal[] = [];
  for (const candidate of inner) {
    const tier = tierOf(candidate.element);
    if (tier === 0) {
      tiers.references += 1;
      if (signals.length < 3) {
        const signal = referenceSignal(candidate.element);
        if (signal !== null) signals.push(signal);
      }
    } else if (tier === 1) tiers.content += 1;
    else tiers.outer += 1;
  }
  return { elements: inner.map((candidate) => candidate.element), matched, tiers, referenceSignals: signals };
}

/** 只要元素列表的便捷入口（设置页自检、`__test` 缝隙与提示模式共用）。 */
export function collectClickable(win: WindowLike): HTMLElement[] {
  return scanClickable(win).elements;
}

/** 标签的样子：Vimium 风格的琥珀底 + 深色粗体字母。 */
const LABEL_STYLE: Readonly<Record<string, string>> = {
  position: 'fixed',
  zIndex: '2147483647',
  padding: '0 3px',
  margin: '0',
  background: '#ffd76e',
  color: '#1f1f1f',
  border: '1px solid #b8860b',
  borderRadius: '3px',
  boxShadow: '0 1px 2px rgba(0,0,0,.35)',
  font: '700 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  letterSpacing: '0.5px',
  pointerEvents: 'none',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

function applyStyle(element: HTMLElement, style: Readonly<Record<string, string>>): void {
  for (const [property, value] of Object.entries(style)) {
    element.style.setProperty(property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`), value);
  }
}

/**
 * 模拟一次真实点击。
 *
 * 按 `pointerdown → mousedown → pointerup → mouseup → click` 顺序派发（与 Vimium 同路数）：
 * React 的 `onMouseDown` / `onClick`、以及浏览器对 `<a href>` 的默认跳转都能被触发。
 */
export function activateElement(win: WindowLike, element: HTMLElement): void {
  const rect = rectOf(element);
  const view = win as unknown as { MouseEvent?: typeof MouseEvent; PointerEvent?: typeof PointerEvent };
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: win as unknown as Window,
    button: 0,
    buttons: 1,
    clientX: rect === null ? 0 : rect.left + rect.width / 2,
    clientY: rect === null ? 0 : rect.top + rect.height / 2,
  };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Constructor = type.startsWith('pointer') ? (view.PointerEvent ?? view.MouseEvent) : view.MouseEvent;
    if (Constructor === undefined) continue;
    try {
      element.dispatchEvent(new Constructor(type, base));
    } catch {
      /* 单个阶段失败不影响后续阶段 */
    }
  }
}

export interface HintSessionStats {
  /** 进入过多少次提示模式。 */
  readonly sessions: number;
  /** 最近一次候选扫描耗时（ms，`performance.now()` 口径）。 */
  readonly lastScanMs: number;
  /** 最近一次扫描命中的候选数。 */
  readonly lastCandidateCount: number;
  /** 最近一次扫描时选择器的原始命中数（诊断漏斗用）。 */
  readonly lastMatchedCount: number;
}

export interface HintSession {
  /** 当前是否处于提示模式。 */
  active(): boolean;
  /** 进入提示模式；没有候选时返回 `false` 且不改变状态。 */
  start(): boolean;
  /** 处理一个按键；返回 `true` 表示已被提示模式消费。 */
  handleKey(event: KeyEventLike): boolean;
  /** 取消并清理。 */
  cancel(): void;
  /** 自身开销统计（回答「这插件会不会拖慢客户端」用）。 */
  stats(): HintSessionStats;
  /** 释放（含事件监听）。 */
  dispose(): void;
}

export interface HintSessionDeps {
  /** 会话正文容器（决定候选优先级：正文链接 → 正文其它 → 外部）。 */
  readonly primary?: () => Element | null;
}

export function createHints(win: WindowLike, getConfig: () => VimcConfig, deps: HintSessionDeps = {}): HintSession {
  let container: HTMLElement | null = null;
  let labels: { hint: string; element: HTMLElement; node: HTMLElement }[] = [];
  let prefix = '';
  let frame: number | null = null;
  let sessions = 0;
  let lastScanMs = 0;
  let lastCandidateCount = 0;
  let lastMatchedCount = 0;

  const now = (): number => (typeof win.performance?.now === 'function' ? win.performance.now() : Date.now());

  const teardown = (): void => {
    for (const label of labels) label.node.remove();
    labels = [];
    container?.remove();
    container = null;
    prefix = '';
  };

  const reposition = (): void => {
    if (container === null) return;
    for (const label of labels) {
      const rect = rectOf(label.element);
      if (rect === null) continue;
      label.node.style.setProperty('left', `${Math.round(rect.left)}px`);
      label.node.style.setProperty('top', `${Math.round(rect.top)}px`);
    }
  };

  const onViewportChange = (): void => {
    if (container === null || frame !== null) return;
    const schedule = win.requestAnimationFrame;
    if (typeof schedule !== 'function') {
      reposition();
      return;
    }
    frame = schedule.call(win, () => {
      frame = null;
      reposition();
    });
  };

  const render = (): void => {
    if (container === null) return;
    for (const label of labels) {
      const matched = label.hint.startsWith(prefix);
      const rest = label.hint.slice(prefix.length);
      label.node.textContent = '';
      label.node.style.setProperty('display', matched ? 'block' : 'none');
      const typed = win.document.createElement('span');
      typed.textContent = prefix;
      typed.style.setProperty('opacity', '0.45');
      const remaining = win.document.createElement('span');
      remaining.textContent = rest;
      label.node.append(typed, remaining);
    }
  };

  const cancel = (): void => {
    teardown();
    win.removeEventListener('scroll', onViewportChange, true);
    win.removeEventListener('resize', onViewportChange, true);
  };

  const start = (): boolean => {
    cancel();
    const config = getConfig();
    const started = now();
    const scan = scanClickable(win, { primary: deps.primary?.() ?? null });
    const candidates = scan.elements;
    lastScanMs = now() - started;
    lastCandidateCount = candidates.length;
    lastMatchedCount = scan.matched;
    sessions += 1;
    if (candidates.length === 0) return false;
    const hints = generateHintStrings(candidates.length, config.linkHintCharacters);
    const overlay = win.document.createElement('div');
    overlay.setAttribute(HINT_CONTAINER_ATTRIBUTE, '');
    applyStyle(overlay, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      pointerEvents: 'none',
      contain: 'layout style',
    });
    labels = candidates.map((element, index) => {
      const hint = hints[index] ?? '';
      const node = win.document.createElement('span');
      node.setAttribute(HINT_LABEL_ATTRIBUTE, hint);
      applyStyle(node, LABEL_STYLE);
      const rect = rectOf(element);
      if (rect !== null) {
        node.style.setProperty('left', `${Math.round(rect.left)}px`);
        node.style.setProperty('top', `${Math.round(rect.top)}px`);
      }
      overlay.append(node);
      return { hint, element, node };
    });
    win.document.body.append(overlay);
    container = overlay;
    prefix = '';
    render();
    win.addEventListener('scroll', onViewportChange, true);
    win.addEventListener('resize', onViewportChange, true);
    return true;
  };

  return {
    active: () => container !== null,
    start,
    handleKey: (event) => {
      if (container === null) return false;
      if (event.defaultPrevented === true) return false;
      if (event.key === 'Escape') {
        cancel();
        return true;
      }
      if (event.repeat === true) return true; // 提示模式下吞掉长按重复
      if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return false;
      const key = typeof event.key === 'string' ? event.key : '';
      if (key.length !== 1) return false;
      const char = key.toLowerCase();
      const alphabet = [...getConfig().linkHintCharacters];
      if (!alphabet.includes(char)) {
        // 字母表之外的键：退出提示模式，并把该键放行（Vimium 也是这个手感）
        cancel();
        return false;
      }
      const next = `${prefix}${char}`;
      const matches = labels.filter((label) => label.hint.startsWith(next));
      if (matches.length === 0) {
        cancel();
        return true;
      }
      if (matches.length === 1) {
        const target = matches[0]!.element;
        cancel();
        activateElement(win, target);
        return true;
      }
      prefix = next;
      render();
      return true;
    },
    cancel,
    stats: () => ({ sessions, lastScanMs, lastCandidateCount, lastMatchedCount }),
    dispose: () => {
      cancel();
      if (frame !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

/** 诊断用：把候选元素描述成可读字符串（自证里报告「屏幕上提示了几个什么」）。 */
export function describeCandidates(elements: readonly HTMLElement[], limit = 6): string[] {
  return elements.slice(0, limit).map((element) => describeElement(element) ?? 'unknown');
}

/**
 * 诊断用：候选元素的**属性名**（不含属性值，避免把内容带出去）。
 *
 * 用途：DSH 把内联引用渲染成什么标签，只能从真实页面看 —— 有了这个就能精确判断
 * 「哪些算正文链接」，而不是靠猜 class 名。
 */
export function describeCandidateAttrs(elements: readonly HTMLElement[], limit = 3): string[] {
  return elements.slice(0, limit).map((element) => {
    const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : 'unknown';
    const names: string[] = [];
    try {
      for (const attribute of Array.from(element.attributes ?? [])) names.push(attribute.name);
    } catch {
      /* 忽略 */
    }
    return names.length === 0 ? tag : `${tag}[${names.sort().join(',')}]`;
  });
}
