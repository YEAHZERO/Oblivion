# 创造一个插件（命名为@oblivion · 轮 4

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

一个键跳上一条提问：[，那么跳转下一条就是]，同时使用 / 可以在页面搜索关键词（使用 ,  和  .  可以按照关键词跳转）
默认平滑滚动的距离设置查看刚才的脚本设置是多少，可以设0.6-0.8之间

## 回答

Two additions: in-page search (`/` open, `.`/`,` jump) and the scroll-distance default. Let me check what the *live* config had for scroll distance, then implement:

The vimium config has no page-ratio (only `scrollStepSize=90`); our plugin's own ratio was 0.9. I'll set it to 0.7. First, the in-page search module:

The new 0.7 ratio changed the expected scroll distances in tests. Let me update them precisely:

Root cause found: `NodeFilter` isn't global in Node/happy-dom. Let me use the numeric constant (works everywhere) and finish the test updates:

All 37 pass. Bumping to 0.2.2 (third digit) and verifying:

v0.2.2 live (17 keys, `find` stats present, scan 7.5 ms). Now the docs:

三件事都完成了，插件现在线上是 **v0.2.2**（客户端半边热挂载；顺带发现你刚重启过 DSH —— 宿主半边也因此换成了最新版）。

## 1. `[` / `]` 与 `/` `.` `,`

| 键 | 行为 |
| --- | --- |
| `[` / `]` | 上一条 / 下一条**提问**（已在线，宿主计数器显示你已用过 `previousTurn` 2 次） |
| `/` | 打开查找框：**边打边找**，右下角显示 `当前/总数` |
| `Enter` / `Shift+Enter` | 查找框内：下一个 / 上一个命中（到端回绕） |
| `Esc` | 关闭查找框、焦点还给打开前的元素；**查询与命中保留** |
| `.` / `,` | 关掉框后继续下一个 / 上一个（还没有查询时会先把框打开） |

实现要点：

- **不侵入 DOM**：命中用 `Range` + **CSS Custom Highlight API**（`::highlight(vimc-find)`）——不包 `<mark>`、不改文本节点。DSH 输入框是 Lexical 宿主，外部动选区会让编辑器状态与 DOM 不同步，所以刻意不用 `window.find()`。浏览器不支持该 API 时退化为「只滚动、不高亮」。
- 落点放在容器高度的 **1/3**；查找范围 = 会话正文滚动容器（不搜侧栏）。
- 大小写是 Vimium 的**智能大小写**（查询含大写才区分）；你那份配置里的 `regexFindMode = true` 我已从「不采纳」改成**采纳**——导入你的 JSON 后 `/` 就按正则解释，非法正则按无命中处理（不报错）。
- 查找框本身就是 `<input>`，所以插件其它快捷键在框内靠**已有的可编辑区守卫**自动让位——在框里打 `w` 就是字母 `w`，没有额外状态机。

## 2. 平滑滚动的距离：查到的是 90px 步长，没有比例项 → 现在设 0.7

先查证了「刚才那个脚本」（`vimium_c-20251214_001720.json`）：

| 脚本里的滚动设置 | 值 | 本插件 |
| --- | --- | --- |
| `scrollStepSize` | **90**（像素步长：`scrollUp/Down/Left/Right`、`scrollPx*`、`a/d`） | 已沿用 90 |
| 翻页比例 | **没有这一项**（Vimium-C 的 `scrollPageUp/Down` 是整屏减重叠，比例写死在实现里） | 本插件自己的选项 |

所以「翻页距离」是本插件自己的选项：旧默认 **0.9** → 按你的要求取 **0.7**（0.6–0.8 区间中点）。
并且做了**定向迁移**：v0.1 写下的、没有 v0.2 字段的旧配置里那个 0.9 会被自动改成 0.7；你自己改过的值（比如 0.5）不动。
现在 `w`/`s` 一次走 0.7 × 容器高度（400px 容器 = 280px），设置页「滚动」里可以随时调。

## 3. 版本按新规则：0.2.1 → **0.2.2**（加第三位，不是 0.3.0）

## 4. 验证

| 项 | 结果 |
| --- | --- |
| `npm test` | **37/37**（新增查找 3 条 + 比例默认/迁移 1 条；原有 34 条在 0.7 口径下全绿） |
| `dshx check`（CLI）/ 类型 / 版本 | 全绿 / ✅ / `0.2.2` |
| 线上自检 | `clientVersion 0.2.2`、`keys.active 17 / unsupported 0 / errors 0`、`turns 2`、`find` 字段就位、`hints` 命中 605 → 候选 46、`scanMs 7` |
| **宿主半边已是最新版** | `host-mount.json` pid 变了（24220 → 20692，01:52:58 重启）→ 摘要层已出现 `probe`/`perf`、`moduleUrl` 与卸载自证 —— 之前挂着的「需重启才生效」这条**已结清** |
| 真实按键延迟（重启后 3 次采样） | 平均 **3.7ms** / 峰值 **10.1ms**；重启前 4 次采样是 1.8 / 3ms。样本太少不足以定论，但结构上**打字路径已经不做任何 DOM 查询**（先纯计算比对键位，命中命令才问焦点）；设置页每次自检都会显示平均/峰值/采样数，可以持续观察 |

顺带：性能优化后的候选扫描稳定在 **7–19ms**（优化前 111.8ms）。

文档同步：[插件 README](oblivion-vimc/README.md)（新增「页面内查找」一节、键位表与设置页表更新、边界条目）、[CHANGELOG](CHANGELOG.md) 0.2.2 条目、[设计笔记](.design/vimc-键盘导航.md)（REQ-11/12 · DEC-19..21 · AC-22..24）、[每日日志](.memory/daily/2026-10-05.md)、[根 README](README.md)。

要不要我把 `.`/`,` 也做成「不打开框、直接续上次查询」的默认（现在已经是），或者把查找落点从 1/3 改成居中？另外如果你想让 `f` 只提示**链接类**（现在 605 个命中里大多是 `<summary>`/`<button>`），我也可以收敛一下候选规则。

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---