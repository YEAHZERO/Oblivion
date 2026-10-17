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
 *   - 文件在、全 `unavailable/failed` → 环境不允许在候选作用域上放槽（错误原文在文件里）；
 *   - 文件里带 `writeError` → **上一次**落盘失败过（原因就在字段里；这一笔是成功的）。
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
  /**
   * **上一次**落盘失败的原因（这一笔写成功后就消失）；从来没失败过就没有这个字段。
   *
   * 为什么要有：落盘失败过去是**完全静默**的（`void` + 空 catch），文件于是停在前一个阶段
   * 而没人知道为什么 —— 2026-10-17 就被这条带偏过一次（见 `writeChannelDiag` 的注释）。
   */
  writeError?: string;
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

/**
 * **落盘重试次数**：临时文件 / rename 会被杀毒、索引器、同步盘**瞬时占用**（`util/fs.ts` 里有实测原文）。
 */
const WRITE_ATTEMPTS = 3;

/** 两次尝试之间的间隔（毫秒）：只够让瞬时占用松手，不是「定时任务」。 */
const WRITE_RETRY_MS = 20;

/** 写入串行队列（模块级：同一进程里三处调用共用一条队，见 `writeChannelDiag`）。 */
let writeQueue: Promise<void> = Promise.resolve();

/** 每个路径**上一次**没写成功的原因；下一笔成功写入会把它带进文件（否则这个缺口没有任何证据）。 */
const lastWriteErrors = new Map<string, string>();

/** 等一小会儿（重试用；不引入任何长期存在的计时器）。 */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 落盘（**串行** + 原子写 + 失败重试 + 失败留痕；诊断本身绝不影响主链路）。
 *
 * ## 为什么必须串行（2026-10-17 修）
 *
 * `apply()` 里三处调用都是**即发即忘**的（`void writeChannelDiag(...)`，同一个 tick 连着发）：
 * `apply:enter` → `apply:mcp`（`onReport` 里）→ `apply:done`。每一笔都走「写临时文件 → rename」
 * 落到**同一个目标路径**，于是多笔写入在文件系统里并发：**后发的 rename 可能先落地**，
 * 文件就停在更早的阶段。真机现场（`<dataRoot>/mcp-channel-diag.json`）：
 * `stage: 'apply:mcp'`、`at` 只比它自己的 `report.at` 晚 1ms —— 而 `apply:done` 明明在它之后
 * 被调用。读这个文件的人正拿它判断「装载走到哪一步」，顺序错乱会把定位方向带偏
 * （看起来像 `apply()` 根本没走完）。
 *
 * 修法：模块级队列，写入按**调用顺序**排队 ⇒ 最后一笔落地的一定是最后发出的那个阶段。
 * 队列里的任务自己吞掉异常，队列因此永不 reject，调用点继续 `void`（不需要也不该 await：
 * 诊断写盘不该拖住装载）。
 *
 * ## 失败不再静默
 *
 * ① 每一次落盘最多试 `WRITE_ATTEMPTS` 次（Windows 的瞬时占用会自己松手）；
 * ② 真正写不进去时，把原因记在**同一路径**上，由**下一笔**成功写入带进文件
 *    （`writeError` 字段）—— 诊断文件自己交代自己的缺口。
 */
export function writeChannelDiag(dataRoot: string, diag: ChannelDiag): Promise<void> {
  // `.catch(() => {})` 是队列的兜底：万一 `writeDiag` 在 try 之外抛了（例如 dataRoot 不是字符串），
  // 也只是这一笔没写、后面照旧 —— 绝不能让队列变成 rejected 而把**后续所有**写入一起废掉。
  const task = writeQueue.then(() => writeDiag(dataRoot, diag)).catch(() => {});
  writeQueue = task;
  return task;
}

/** 队列里的单笔写入：先拼 payload（带上一次失败的原因），再按次数重试。 */
async function writeDiag(dataRoot: string, diag: ChannelDiag): Promise<void> {
  const path = join(expandHome(dataRoot), 'mcp-channel-diag.json');
  const previous = lastWriteErrors.get(path);
  const payload: ChannelDiag = previous === undefined ? diag : { ...diag, writeError: previous };

  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    try {
      await writeJsonAtomic(path, payload);
      lastWriteErrors.delete(path);
      return;
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : String(error);
      lastWriteErrors.set(path, text + '（第 ' + attempt + '/' + WRITE_ATTEMPTS + ' 次尝试，' + new Date().toISOString() + '）');
      if (attempt < WRITE_ATTEMPTS) await delay(WRITE_RETRY_MS);
    }
  }
}
