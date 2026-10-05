/**
 * @oblivion/vimc — 诊断上报（自证据链）。
 *
 * ## 为什么要这条通道
 *
 * 本机（Windows）DSHX 的验证工具链不可用：`dshx check` / `activate-new-client` /
 * `verify-boot` 全部先跑 `dshx creator claim`，而 claim 依赖 POSIX `ps -o lstart=`
 * 读进程启动时间 → 恒报 `Creator+ Host identity is incomplete`
 * （见 WORKSPACE.md「已知限制 1」）。也就是说，「当前 Host 是否真的挂上了这个
 * 客户端半边」没有任何官方途径可查。
 *
 * 于是本插件自带一条最小证据链：
 *
 *   浏览器半边（本文件） ──POST /oblivion-vimc/beat──▶ 宿主半边（src/index.ts）
 *                                                        └─▶ %TEMP%\oblivion-vimc\client-beat.json
 *
 * 只要那个文件里出现 `command: "mounted"`，就客观证明**真实页面里跑起来了**；
 * 出现 `command: "scrollPageDown"` 则证明**按键判定链真的走通了**。
 *
 * 上报本身是 fire-and-forget：失败只丢一条心跳，绝不影响按键行为；
 * 也绝不携带页面 URL/会话内容（只带版本、浏览器 UA、配置快照与命令名）。
 */

import { publicConfig, type VimcConfig } from './config.js';
import type { WindowLike } from './types.js';

export interface BeatSender {
  send(command: string, extra?: Record<string, unknown>): void;
  dispose(): void;
}

export function createBeatSender(
  win: WindowLike,
  getConfig: () => VimcConfig,
  endpoint = '/oblivion-vimc/beat',
  intervalMs = 400,
): BeatSender {
  let timer: number | null = null;
  // 单独的布尔量而不是「timer 是否非 null」：`setTimeout` 的返回值在浏览器里是
  // 正整数，但它**允许**是 0（测试替身、极端实现都会），拿 0 当「没排期」会漏发。
  let scheduled = false;
  let pending: { command: string; extra?: Record<string, unknown> } | null = null;
  let closed = false;

  const post = (entry: { command: string; extra?: Record<string, unknown> }): void => {
    const send = win.fetch;
    if (typeof send !== 'function') return;
    const payload = {
      version: __OBLIVION_VIMC_VERSION__,
      command: entry.command,
      at: Date.now(),
      userAgent: win.navigator?.userAgent ?? '',
      config: publicConfig(getConfig()),
      ...entry.extra,
    };
    try {
      const result: unknown = send.call(win, endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      // 不 await：上报永远不阻塞按键路径，也不冒泡任何错误。
      if (result !== null && typeof result === 'object' && typeof (result as Promise<unknown>).catch === 'function') {
        void (result as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      /* 宿主路由不存在 / 页面已卸载：忽略 */
    }
  };

  const flush = (): void => {
    timer = null;
    scheduled = false;
    const entry = pending;
    pending = null;
    if (closed || entry === null) return;
    post(entry);
  };

  return {
    send: (command, extra) => {
      if (closed || getConfig().diagnostics !== true) return;
      // 只带命令名与可选附加字段；同一个合并窗口内以**最后一次**为准（心跳不是审计流水）。
      pending = extra === undefined ? { command } : { command, extra };
      if (scheduled) return;
      const schedule = win.setTimeout;
      if (typeof schedule !== 'function') {
        flush();
        return;
      }
      // 合并窗口内的连续按键（长按 s 不会打出一串请求）。
      scheduled = true;
      timer = schedule.call(win, flush, intervalMs);
    },
    dispose: () => {
      closed = true;
      pending = null;
      scheduled = false;
      if (timer !== null && typeof win.clearTimeout === 'function') win.clearTimeout(timer);
      timer = null;
    },
  };
}
