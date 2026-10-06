/**
 * @oblivion/panel — 浏览器半边入口。
 *
 * `inject` 刻意留空：本插件**只有**一个可选依赖（`dsh-better-sidebar` 提供的
 * `ctx.betterSidebar`），它缺席时应当「不注册面板但插件照常装载」，
 * 而不是让整棵客户端树因为一个 UI 服务缺失而倒掉。
 *
 * 具体注册与降级逻辑在 `register.ts`（不依赖 React，可被 Node 侧测试直接覆盖）。
 */

import { createElement } from 'react';
import { OblivionPanel } from './Panel.js';
import { registerPanelTab, type ClientCtxLike } from './register.js';

/** 没有硬依赖；`betterSidebar` 走渐进注册。 */
export const inject: string[] = [];

const LOG_NAME = '@oblivion/panel';

export function apply(ctx: ClientCtxLike): void {
  const warn = (message: string): void => {
    const logger = (ctx as { logger?: (name: string) => { warn?: (m: string) => void } }).logger;
    logger?.(LOG_NAME)?.warn?.(message);
  };

  const result = registerPanelTab(ctx, ((props: unknown) => createElement(OblivionPanel, props as never)) as never, warn);
  if (result.status === 'registered') {
    const logger = (ctx as { logger?: (name: string) => { info?: (m: string) => void } }).logger;
    logger?.(LOG_NAME)?.info?.('已在 side bar 注册 Oblivion 面板 tab');
  }
}

export default { inject, apply };
