/**
 * `@oblivion/core` · MCP 通道装载诊断（`<dataRoot>/mcp-channel-diag.json`）。
 *
 * ## 为什么单独立一个文件
 *
 * 通道是**跨插件**的：发布侧在 core，读侧在 `@oblivion/http-bridge`。它坏掉时
 * 两侧都看不见对方 —— core 只打一行 `console.log`（GUI 宿主里根本读不到），
 * 传输层只回 503「未找到通道」。于是「到底有没有发布出去」没有任何证据，
 * 只能靠推断（2026-10-17 之前就是这么卡住的）。
 *
 * 把 core 这一侧的发布事实落盘，与桥接的 `/health` 两侧对照，一次重启即可区分：
 *   - 文件不存在 → `apply()` 根本没进来（或插件没装载）；
 *   - `stage: 'apply:enter'` 且带 `error` → `apply()` 半路抛了（原文就在文件里）；
 *   - `stage: 'apply:done'` 而 `/health` 仍 `present:false` → 两侧不在同一进程/作用域
 *     （对照 `pid`：不一样就是两个进程，通道这条路天生不通）；
 *   - 文件在、全 `unavailable/failed` → 环境不允许在候选作用域上放槽（错误原文在文件里）。
 *
 * 它同时是「通道是好的」的正向证据 —— 所以**成功时也写**，不是只在出错时写。
 */

import { join } from 'node:path';
import { expandHome } from '../util/paths.js';
import { writeJsonAtomic } from '../util/fs.js';
import type { ChannelReport } from './channel.js';

/** 通道诊断文件的形状（加字段不破坏；语义变更才 +1）。 */
export interface ChannelDiag {
  /** 写入方版本，`0.0.0-unknown` 表示没注入。 */
  version: string;
  at: number;
  /** 发布这份报告的进程 —— 与桥接 `/health` 的 `pid` 对照用。 */
  pid: number;
  /**
   * 装载走到哪一步：`apply:enter` → `apply:done`（或 `apply:failed`）。
   *
   * 通道没出现时，这是唯一的解释位：文件停在 `apply:enter` = `apply()` 半路抛了（`error` 有原文）、
   * 停在 `apply:done` 而 `/health` 仍 `present:false` = 两侧不在同一进程/作用域。
   */
  stage: string;
  /** 装载中途抛错时的原文（截断到 200 字符）；没抛就没有这个字段。 */
  error?: string;
  /** 进程环境事实：宿主是 Electron 还是裸 Node、是不是 `ELECTRON_RUN_AS_NODE`。 */
  env: {
    node: string;
    electron: string;
    runAsNode: boolean;
    execArgv: string[];
  };
  /** 发布报告本体（每个候选作用域一条，见 `channel.ts`）；装载挂在发布之前时为 `null`。 */
  report: ChannelReport | null;
}

/** 组装诊断（不落盘），进程事实与报告一起留痕。 */
export function buildChannelDiag(
  version: string,
  report: ChannelReport | null,
  stage: string,
  error?: unknown,
): ChannelDiag {
  const text = error === undefined ? '' : error instanceof Error ? error.message : String(error);
  return {
    version,
    at: Date.now(),
    pid: process.pid,
    stage,
    ...(text === '' ? {} : { error: text.length > 200 ? text.slice(0, 200) : text }),
    env: {
      node: process.versions.node ?? '',
      electron: process.versions.electron ?? '',
      runAsNode: process.env.ELECTRON_RUN_AS_NODE !== undefined,
      execArgv: [...process.execArgv],
    },
    report,
  };
}

/** 落盘（原子写；失败静默 —— 诊断本身绝不影响主链路）。 */
export async function writeChannelDiag(dataRoot: string, diag: ChannelDiag): Promise<void> {
  try {
    await writeJsonAtomic(join(expandHome(dataRoot), 'mcp-channel-diag.json'), diag);
  } catch {
    // 见函数注释
  }
}
