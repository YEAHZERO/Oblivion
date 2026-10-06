/**
 * @oblivion/panel — 浏览器半边入口。
 *
 * `inject` 刻意留空：本插件**只有**一个可选依赖（`dsh-better-sidebar` 提供的 `ctx.betterSidebar`），
 * 它缺席时应当「不注册面板但插件照常装载」，而不是让整棵客户端树因为一个 UI 服务缺失而倒掉。
 *
 * 三条注册：
 *   ① **右侧栏 tab**（`registerPanelTab` → `betterSidebar.registerTab`）
 *   ② **左栏入口**（官方 `sidebar.footer.action`）→ 点击把右侧那一列切到 Oblivion 页
 *   ③ **ctx 形状自报**（POST 给自己的 Node 半边）→ 与 core 的 dump 对照，定位 `inject` 缺失的根因
 */

import { createElement } from 'react';
import { OblivionPanel } from './Panel.js';
import { createLeftbarAction, openOblivionTab, PolarisGlyph, type OpenTabCapable } from './leftbar.js';
import { PANEL_TAB_ID, registerPanelTab, type ClientCtxLike } from './register.js';

/**
 * **必须声明 `slots`**：Cordis 对未在 `inject` 里声明的服务访问会**抛错**
 * （`cannot get property "slots" without inject`），而左栏入口要用 `ctx.slots.register`。
 * 原先是 `inject: []` + 裸读 `ctx.slots` → **panel 装载失败、App 起不来**
 * （实测崩溃日志：`web boot: 1 entry did not activate @oblivion/panel: failed`）。
 *
 * `betterSidebar` 仍走**渐进注册**（`ctx.inject(['betterSidebar'], …)`）：它来自第三方插件，
 * 缺席时应「不注册右侧 tab 但插件照常装载」。
 */
export const inject: string[] = ['slots'];

const LOG_NAME = '@oblivion/panel';

interface SlotServiceLike {
  inject?(slot: string, callback: () => unknown): unknown;
  register?(options: Record<string, unknown>, component: unknown): unknown;
}

/** 把一段 JSON 报给本插件自己的 Node 半边（诊断通道；失败绝不影响装载）。 */
function postDiag(payload: Record<string, unknown>): void {
  try {
    void fetch('/oblivion-panel/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    // 诊断本身绝不影响装载
  }
}

/** ① ctx 形状自报（诊断；失败绝不影响装载）。`extra` 用来带上注册/点击结果。 */
function reportCtxShape(ctx: ClientCtxLike, extra: Record<string, unknown> = {}): void {
  try {
    const target = ctx as unknown as Record<string, unknown>;
    const keys = Object.keys(target).slice(0, 80);
    const typeofs: Record<string, string> = {};
    for (const key of keys) {
      try {
        typeofs[key] = typeof target[key];
      } catch {
        typeofs[key] = '(throws)';
      }
    }
    const prototypes: string[] = [];
    let cursor: unknown = Object.getPrototypeOf(target);
    for (let depth = 0; depth < 5 && cursor; depth += 1) {
      prototypes.push((cursor as { constructor?: { name?: string } }).constructor?.name ?? '(anonymous)');
      cursor = Object.getPrototypeOf(cursor);
    }
    const probes: Record<string, string> = {};
    for (const name of ['on', 'emit', 'inject', 'get', 'provide', 'effect', 'slots', 'locale', 'shortcuts', 'betterSidebar', 'layout', 'session', 'remote', 'logger']) {
      try {
        const value = typeof target[name];
        if (value !== 'undefined') probes[name] = value;
      } catch {
        probes[name] = '(throws)';
      }
    }
    const body = JSON.stringify({
      at: Date.now(),
      where: 'client',
      keys,
      typeofs,
      prototypes,
      probes,
      hasInject: typeof target.inject === 'function',
      hasGet: typeof target.get === 'function',
      ...extra,
    });
    void fetch('/oblivion-panel/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    // 诊断本身绝不影响装载
  }
}

export function apply(ctx: ClientCtxLike): void {
  const logger = (ctx as { logger?: (name: string) => { warn?: (m: string) => void; info?: (m: string) => void } }).logger?.(LOG_NAME);
  const warn = (message: string): void => logger?.warn?.(message);

  // ① 右侧栏 tab
  const result = registerPanelTab(
    ctx,
    ((props: unknown) => createElement(OblivionPanel, props as never)) as never,
    warn,
    (size: number) => createElement(PolarisGlyph, { size }),
  );
  if (result.status === 'registered') logger?.info?.('已在 side bar 注册 Oblivion 面板 tab');
  else warn('面板 tab 未注册：' + String(result.detail ?? result.status));

  // ② 左栏入口（官方 sidebar.footer.action）
  //    `slots` 已声明 inject；仍 try/catch —— 守卫读错也只该「少一个入口」，
  //    不该让整个客户端 entry 装载失败（这正是上次 App 起不来的原因）。
  let slots: SlotServiceLike | undefined;
  try {
    slots = (ctx as { slots?: SlotServiceLike }).slots;
  } catch (error) {
    warn('读取 ctx.slots 被宿主守卫拦下：' + (error instanceof Error ? error.message : String(error)));
  }
  let leftbarRegistered = false;
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    /**
     * **在点击那一刻**才读服务句柄。
     *
     * `registerPanelTab` 里的 `ctx.inject(['betterSidebar'], …)` 可能是异步触发的，
     * 提前取 `result.service` 会永远拿到 `undefined` ⇒ 点击走 'no-service' 分支、
     * 只留一条日志 —— 这就是「左下角图标点不动」的真凶。
     */
    const readService = (): OpenTabCapable | undefined => result.service as unknown as OpenTabCapable | undefined;
    const component = createLeftbarAction(() => {
      const service = readService();
      const outcome = openOblivionTab(service, PANEL_TAB_ID);
      postDiag({
        at: Date.now(),
        where: 'leftbar-click',
        outcome,
        hasService: service !== undefined,
        hasOpenTab: typeof service?.openTab === 'function',
        tabStatus: result.status,
        tabType: PANEL_TAB_ID,
      });
      if (outcome === 'opened') logger?.info?.('左栏入口：已打开右侧 Oblivion 页');
      else warn('左栏入口：打开右侧 Oblivion 页失败（' + outcome + '）');
    });
    try {
      slots.inject('sidebar.footer.action', () =>
        slots.register?.({ name: 'sidebar.footer.action', id: 'oblivion-panel', order: 60, label: () => 'Oblivion' }, component),
      );
      leftbarRegistered = true;
    } catch (error) {
      warn('左栏入口注册失败：' + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn('slots 服务不可用：左栏入口未注册（右侧栏 tab 不受影响）');
  }

  // ③ ctx 形状自报（带上两个 UI 注册的真实结果，省得靠 DevTools 猜）
  reportCtxShape(ctx, {
    panelTab: { status: result.status, detail: result.detail ?? null, tabId: PANEL_TAB_ID },
    leftbar: { registered: leftbarRegistered, seat: 'sidebar.footer.action' },
  });
}

export default { inject, apply };
