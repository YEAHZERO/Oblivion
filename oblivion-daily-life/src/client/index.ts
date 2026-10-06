/**
 * 有数（@oblivion/daily-life）· 浏览器半边入口。
 *
 * 只做两件事：把「有数」这一页注册进 better-sidebar，然后留一条装载标记。
 * **不**在插件顶层声明 `inject`（Cordis 会因此把整个插件判成未激活 —— panel 与
 * http-bridge 都实测过）；better-sidebar 由 `register.ts` 里的可选取服务拿。
 */

import { dailyLifeIcon } from './icon.js';
import { DailyLifePanel } from './panel.js';
import { registerDailyLifeTab, type ClientCtxLike, type TabDescriptorLike } from './register.js';

export const name = '@oblivion/daily-life';

/** 刻意留空：可选依赖由 `registerDailyLifeTab` 自己取。 */
export const inject: string[] = [];

interface ClientHost {
  logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };
}

export function apply(rawCtx: unknown): void {
  const ctx = rawCtx as ClientCtxLike & ClientHost;
  const warn = (message: string): void => {
    ctx.logger?.warn?.('[oblivion-daily-life] ' + message);
  };

  const result = registerDailyLifeTab(ctx, DailyLifePanel as unknown as TabDescriptorLike['component'], warn, dailyLifeIcon);
  ctx.logger?.info?.(
    `[oblivion-daily-life] 客户端半边：tab ${result.status === 'registered' ? '已注册' : '未注册（' + String(result.detail ?? result.status) + '）'}`,
  );

  console.log('[oblivion-daily-life] loaded');
}
