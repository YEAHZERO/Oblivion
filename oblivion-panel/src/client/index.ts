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
import { createLeftbarAction, openOblivionTab, type OpenTabCapable } from './leftbar.js';
import { PANEL_TAB_ID, registerPanelTab, type ClientCtxLike } from './register.js';

/** 没有硬依赖；`betterSidebar` / `slots` 都走渐进注册。 */
export const inject: string[] = [];

const LOG_NAME = '@oblivion/panel';

interface SlotServiceLike {
  inject?(slot: string, callback: () => unknown): unknown;
  register?(options: Record<string, unknown>, component: unknown): unknown;
}

/** ① ctx 形状自报（诊断；失败绝不影响装载）。 */
function reportCtxShape(ctx: ClientCtxLike): void {
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
  const result = registerPanelTab(ctx, ((props: unknown) => createElement(OblivionPanel, props as never)) as never, warn);
  if (result.status === 'registered') logger?.info?.('已在 side bar 注册 Oblivion 面板 tab');
  else warn('面板 tab 未注册：' + String(result.detail ?? result.status));

  // ② 左栏入口（官方 sidebar.footer.action）
  const slots = (ctx as { slots?: SlotServiceLike }).slots;
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    const service = result.service as OpenTabCapable | undefined;
    const component = createLeftbarAction(() => {
      const outcome = openOblivionTab(service, PANEL_TAB_ID);
      if (outcome === 'opened') logger?.info?.('左栏入口：已打开右侧 Oblivion 页');
      else warn('左栏入口：打开右侧 Oblivion 页失败（' + outcome + '）');
    });
    try {
      slots.inject('sidebar.footer.action', () =>
        slots.register?.({ name: 'sidebar.footer.action', id: 'oblivion-panel', order: 60, label: () => 'Oblivion' }, component),
      );
    } catch (error) {
      warn('左栏入口注册失败：' + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn('slots 服务不可用：左栏入口未注册（右侧栏 tab 不受影响）');
  }

  // ③ ctx 形状自报
  reportCtxShape(ctx);
}

export default { inject, apply };
