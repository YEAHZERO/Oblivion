/**
 * @oblivion/vimc — 依赖缝隙（seam）类型。
 *
 * 这里刻意**不 import `@deepseek-ai/cordis` 或任何宿主包**，只用最小结构类型描述
 * 我们真正用到的那些能力（window / 事件 / 存储 / fetch）。三个好处：
 *
 *  1. `tsc -p tsconfig.json` 能在本插件目录内独立通过，不依赖 checkout 是否在场；
 *  2. 单元测试可以直接喂 happy-dom 的对象，不需要类型体操；
 *  3. 宿主版本升级时，只有真正用到的成员变化才会影响本插件。
 */

/** 只读键值存储（`localStorage` 的结构子集）。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 我们读取的键盘事件字段（DOM `KeyboardEvent` 的结构子集，便于测试替身）。 */
export interface KeyEventLike {
  readonly key?: string;
  readonly code?: string;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  /** IME 组合期的旧式标记（229）。 */
  readonly keyCode?: number;
  readonly defaultPrevented?: boolean;
  readonly target?: EventTarget | null;
  composedPath?(): EventTarget[];
  preventDefault(): void;
}

/** 我们读取的 window 面。 */
export interface WindowLike {
  readonly document: Document;
  readonly innerWidth: number;
  readonly innerHeight: number;
  getComputedStyle(element: Element): CSSStyleDeclaration;
  addEventListener(type: string, listener: (event: KeyEventLike) => void, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: KeyEventLike) => void, options?: boolean | AddEventListenerOptions): void;
  getSelection?(): Selection | null;
  readonly localStorage?: StorageLike;
  readonly fetch?: typeof fetch;
  readonly navigator?: { readonly userAgent?: string };
  readonly location?: { readonly href?: string; readonly origin?: string };
  /** 只用于 `goBack` / `goForward`（SPA 安全的历史导航）。 */
  readonly history?: { go(delta?: number): void; readonly length?: number };
  setTimeout?(handler: () => void, timeout?: number): number;
  clearTimeout?(handle: number): void;
  requestAnimationFrame?(callback: (time: number) => void): number;
  cancelAnimationFrame?(handle: number): void;
  /** 性能计时（自检里报告自身开销用；缺席时退回 `Date.now()`）。 */
  readonly performance?: { now(): number };
  /** 合成点击用的事件构造器（测试替身可能没有）。 */
  readonly MouseEvent?: typeof MouseEvent;
  readonly PointerEvent?: typeof PointerEvent;
}

/**
 * 把任意事件目标收窄成 Element。
 *
 * 刻意**不用 `instanceof Element`**：跨 realm（iframe / shadow / 测试替身）时
 * 构造器身份并不共享，用 `closest` 的存在性判断既宽松又够准。
 */
export function asElement(value: unknown): Element | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Element;
  return typeof candidate.closest === 'function' ? candidate : null;
}
