# 创造一个插件（命名为@oblivion · 轮 3

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

查看该插件对dsh的影响，比如操作上有没有降低客户端的反应速度；然后将该oblivion里的版本号规定从0.0.1开始起步，已经有的不管了，然后每次都是先加第三位数字；怎么样让这个快捷键能按一个键跳转到上一条，比如现在在这里，就跳转到图二显示本轮问题，如果在图三，则跳转到上一个问题这种，类似于图四点击右侧导航

## 回答

Three things to do. Let me start with reconnaissance for the message-jump feature (how DSH marks turns and how the right nav jumps):

Figure 4 is DSH's own turn rail. Let me see exactly what a turn anchor is in the DOM so my jump matches it:

Recon done. Now implementing: turn-jump (using DSH's own `[data-chat-turn]` anchors), perf instrumentation, and the filter-cost optimization.

Now updating the tests for the new behavior (turn jump, perf, debounced evidence):

All 34 pass. Now encoding the new version rule (start at 0.0.1, always bump the third digit first):

A TypeScript-ism slipped into the `.mjs` script — fixing:

Version rule works (`0.2.0 → 0.2.1`, positional `minor` rejected). Now deploying v0.2.1 live and reading the perf evidence:

The live scan measured **111.8 ms** — that's the real cost driver. Let me optimize it (removing the per-element `getComputedStyle`) and instrument the funnel:

Let me also include the key-latency snapshot in every heartbeat, so real per-keystroke numbers become observable:

The user is pressing keys right now. Let me capture the real latency numbers and a fresh scan measurement:

Now a real optimization for the common path (typing): match bindings *before* touching the DOM region:

Deploying the final build and collecting the post-optimization measurements:

Final live numbers: scan **111.8 ms → 11.2 ms**, `linkHints=7` and `escapeToPage=1` in real use. Now the docs:

Final verification pass:

三件事都做完了，插件现在线上是 **v0.2.1**（客户端半边热挂载生效，无需重启）。

## 一、对 DSH 的影响：稳态可忽略，唯一重活已优化 10×

| 时机 | 做什么 | 真机实测 |
| --- | --- | --- |
| **任意按键**（含在输入框里打字） | 一个 window 捕获监听器：**先纯计算**比对 ≤14 条键位，没命中立刻返回 | 打字路径**不碰 DOM**；命中命令才多一次焦点判定（重排前样本：平均 **1.825ms** / 峰值 **3ms**） |
| 按 `f` / 点「运行只读自检」 | 一次候选扫描 | **11.2–19.2ms**（选择器命中 **1258** → 视口候选 **42**）；优化前同页 **111.8ms** |
| 挂载后 1.5s | 一次渲染后自检（含上面的扫描） | 同上，且在**绘制之后**的定时器里，不阻塞首屏 |
| 每次处理命令 | 一条回环 POST 心跳（400ms 合并） | 失败只丢心跳，绝不影响按键 |
| 宿主落盘 | 写 `client-beat.json` | 新版合并到 **750ms 一次**（当前宿主半边是旧版，仍每条写；重启后生效） |

**没有**轮询、`setInterval`、`MutationObserver`、常驻注入 DOM、后台网络请求；内存 O(1)（配置 + 14 条键位，扫描数组是临时的）；设置面板只在打开时渲染。

发现并修掉的四处（第一版真机量到 111.8ms，逐项拆开只有两个原因）：

1. 用 `checkVisibility()` 快路径替代**逐元素 `getComputedStyle`** ← 主因（DSH 样式表极大，真机上每元素是毫秒级）
2. 一次 `closest()` 替代两次祖先遍历；每元素只读一次矩形；样式只给已进视口的幸存者
3. 挂载自检**不扫描**（那时外壳还没渲染完）
4. 按键路径按开销重排：**先纯计算、命中后才问 DOM**

**你可以自己复核**：`oblivionVimc.probe().perf` / `hints.scanMs`，或设置页 →「排除规则与诊断 → 运行只读自检」（直接列成表格），或看 `%TEMP%\oblivion-vimc\client-beat.json`（每条命令心跳都带 `perf`）。
> 诚实说明：按键耗时那组数字是**重排之前**的 4 次采样；重排把打字路径的 DOM 查询去掉了，新数字会随你打字继续上报（摘要层字段要等宿主半边重启）。

## 二、版本规则已改（0.0.1 起步 · 每次先加第三位）

| 规则 | 落点 |
| --- | --- |
| 新版本线从 **`0.0.1`** 起步；**已有版本不回改**；每次**只加第三位** | [`.action/AGENTS.MD`](.action/AGENTS.MD)（规范）+ [CHANGELOG.md](CHANGELOG.md) 开头 |
| 第二位/第一位**只在明确要求时**：`--minor` / `--major`；位置参数写 `minor` **直接被拒** | [scripts/bump-version.mjs](oblivion-vimc/scripts/bump-version.mjs) |

本轮已按新规则执行：`@oblivion/vimc` **0.2.0 → 0.2.1**（不是 0.3.0）。已有版本号一律没动（根 `VERSION` 仍 0.0.2、`@oblivion/brand` 仍 0.1.0）。

## 三、一个键跳上一条提问：`[` / `]`

| 你的位置 | 按 `[` |
| --- | --- |
| 正在读某轮回答中间 | 回到**本轮提问**顶部（正是你要的「图二那一条」） |
| 已在某轮提问顶部 | 继续往**上一条提问**（图三的语义） |
| 已在最上面那条 | 不动作、**不吞键**（往上滚仍交给 `w`/`W`） |

- 落点与 DSH **右侧轮次导航条（图四）同源**：用的是 `ui-chat` 写在每个轮次行上的官方 `data-chat-turn`，不碰任何 class 名或组件内部结构；实测线上识别到 **3** 个已加载轮次
- 目标贴容器顶 + 2px，并 **700ms 描边**便于确认落点（用完还原行内样式）
- 键位可改：设置页 → 键位文本里 `map [ previousTurn` / `map ] nextTurn`
- 边界：DSH 会话分页加载，跳转只覆盖**已加载**轮次；滚到顶会触发它自己的分页，等加载完再按即可继续往上

## 顺带的事实

你这几轮的真实使用都记在宿主计数器里：`scrollPageUp 20 · scrollPageDown 22 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 6 · escapeToPage 1` —— `f`、`i`→`Esc` 都在真实页面里用过了。测试 **34/34**、`dshx check` 全绿、版本一致。

文档同步：[插件 README](oblivion-vimc/README.md)（新增「轮次跳转」「对 DSH 的影响（性能）」「版本规则」三节）、[设计笔记](.design/vimc-键盘导航.md)（REQ-8..10 / DEC-15..18 / AC-17..21）、[CHANGELOG](CHANGELOG.md)、[每日日志](.memory/daily/2026-10-05.md)。

要不要我把 `f` 的候选再收敛一点（现在 1258 个命中里主要是 `<summary>`/`<button>`/`[tabindex]`，可以只提示链接类 + 按钮），或者把 `[`/`]` 换成你更顺手的键？

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---