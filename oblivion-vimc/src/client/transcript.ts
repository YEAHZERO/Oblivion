/**
 * @oblivion/vimc — 会话轮次跳转（「上一条 / 下一条提问」）。
 *
 * ## 与 DSH 自己的右侧轮次导航同一批锚点
 *
 * DSH 的 `ui-chat` 在每个轮次的行上写 `data-chat-turn="<n>"`，它的轮次导航栏
 * （`TurnNavigator`）与 `use-chat-viewport.ts` 的 `navigateToTurn` 就是靠这批行定位的。
 * 本模块只读这些**官方数据属性**，不依赖任何 class 名或组件内部结构：
 *
 *   ① 收集 `[data-chat-turn]`，同一轮只取**文档顺序里的第一行**（= 该轮最上面的锚点）；
 *   ② 换算成滚动内容坐标（相对滚动容器顶部）；
 *   ③ `previous` 取「严格在当前视口顶之上」里最靠下的那一个，`next` 取最靠上的那一个；
 *   ④ 滚到它的顶部并对目标做一次短暂描边，让人确认跳到了哪。
 *
 * ## 为什么是「严格之上/之下」（epsilon）
 *
 * 用户要的手感是：**读到回答中间时按一次 → 回到本轮提问；已经在提问顶部时按一次 → 再上一条**。
 * 若用「≤ 当前顶」判定，第二条就永远卡在同一轮上；所以带 8px 容差：
 * 恰好对齐的那一轮不算「之上」，于是第二次按会继续往上走。
 *
 * ## 已知边界
 *
 * DSH 的会话是**分页加载**的：DOM 里只有已加载的轮次。因此跳转只能到达已加载的轮次，
 * 到了最上面那一条时再按不会凭空加载更早历史（DSH 的分页由它自己的滚动观察者驱动 ——
 * 滚到顶会触发它加载，所以「先跳到最上、等加载完、再按一次」即可继续往上）。
 */

import type { WindowLike } from './types.js';

/** 轮次行的官方数据属性（`ui-chat` 的 `ChatNodeSeat` 写入）。 */
const TURN_SELECTOR = '[data-chat-turn]';

/** 「恰好对齐」的容差：小于它就认为还在同一轮的顶部。 */
const ALIGN_EPSILON_PX = 8;

/** 目标高亮持续时间。 */
const FLASH_MS = 700;

/** 每次跳转给目标留出的上边距（避免贴着容器边缘）。 */
const TOP_MARGIN_PX = 2;

export interface TurnPosition {
  readonly turn: number;
  readonly element: HTMLElement;
  /** 相对滚动内容顶部的位置（= 可以直接赋给 scrollTop 的值）。 */
  readonly top: number;
}

/** 目标元素的短暂描边（用行内 outline，不引起重排；用完还原原值）。 */
const flashTimers = new WeakMap<Element, number>();

function flash(win: WindowLike, element: HTMLElement): void {
  const style = element.style;
  if (style === undefined) return;
  const restore = {
    outline: style.getPropertyValue('outline'),
    'outline-offset': style.getPropertyValue('outline-offset'),
  };
  style.setProperty('outline', '2px solid var(--dsw-alias-brand-primary, #4d6bfe)');
  style.setProperty('outline-offset', '2px');

  const previous = flashTimers.get(element);
  if (previous !== undefined && typeof win.clearTimeout === 'function') win.clearTimeout(previous);
  const clear = (): void => {
    flashTimers.delete(element);
    if (restore.outline === '') style.removeProperty('outline');
    else style.setProperty('outline', restore.outline);
    if (restore['outline-offset'] === '') style.removeProperty('outline-offset');
    else style.setProperty('outline-offset', restore['outline-offset']);
  };
  if (typeof win.setTimeout === 'function') {
    flashTimers.set(element, win.setTimeout(clear, FLASH_MS));
  } else {
    clear();
  }
}

/**
 * 收集已加载的轮次锚点。
 *
 * @param scroller 会话滚动容器（`Scroller.target('y')` 的结果）。
 * @returns 按位置升序排列；一个轮次只保留文档顺序里的第一行。
 */
export function collectTurns(win: WindowLike, scroller: Element): TurnPosition[] {
  let rows: Element[] = [];
  try {
    rows = Array.from(win.document.querySelectorAll(TURN_SELECTOR));
  } catch {
    return [];
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const base = scroller.scrollTop - scrollerRect.top;
  const byTurn = new Map<number, TurnPosition>();
  for (const row of rows) {
    const attribute = row.getAttribute('data-chat-turn');
    const turn = attribute === null ? Number.NaN : Number(attribute);
    if (!Number.isFinite(turn) || byTurn.has(turn)) continue;
    if (typeof row.closest === 'function' && row.closest('[hidden]') !== null) continue;
    const rect = row.getBoundingClientRect();
    byTurn.set(turn, { turn, element: row as HTMLElement, top: rect.top + base });
  }
  return [...byTurn.values()].sort((left, right) => left.top - right.top);
}

/** 该容器里一共有多少个已加载轮次（自检用）。 */
export function countTurns(win: WindowLike, scroller: Element | null): number {
  return scroller === null ? 0 : collectTurns(win, scroller).length;
}

/**
 * 跳到上一条 / 下一条提问。
 *
 * @param direction `previous` = 往上（读回答时回到本轮提问；已在提问顶部时再上一条）。
 * @returns 真的滚动了才返回 `true`（否则不吞键）。
 */
export function jumpToTurn(
  win: WindowLike,
  scroller: Element | null,
  direction: 'previous' | 'next',
  smooth: boolean,
): boolean {
  if (scroller === null) return false;
  const turns = collectTurns(win, scroller);
  if (turns.length === 0) return false;
  const current = scroller.scrollTop;
  const candidates = direction === 'previous'
    ? turns.filter((turn) => turn.top < current - ALIGN_EPSILON_PX)
    : turns.filter((turn) => turn.top > current + ALIGN_EPSILON_PX);
  if (candidates.length === 0) return false;
  const target = direction === 'previous' ? candidates[candidates.length - 1]! : candidates[0]!;
  const top = Math.max(0, target.top - TOP_MARGIN_PX);
  const behavior = (smooth ? 'smooth' : 'instant') as unknown as ScrollBehavior;
  try {
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top, behavior });
    else scroller.scrollTop = top;
  } catch {
    scroller.scrollTop = top;
  }
  flash(win, target.element);
  return true;
}
