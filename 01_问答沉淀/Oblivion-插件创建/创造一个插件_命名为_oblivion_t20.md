# 创造一个插件（命名为@oblivion · 轮 20

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

. 新建 @oblivion/panel（推荐）
然后给出A

## 回答

收到：**B（新建 `@oblivion/panel`）**，并且要 **A 的操作步骤**。先做两件事的取证——A 需要 better-sidebar 的真实操作面，B 需要它的扩展 API 与仓库里 client 插件的既有约定：

`TabDescriptor` 拿到了（`registerTab` → `component(props)` 返回 ReactNode）。现在看仓库里既有的 client/host 双半约定（照抄已验证的写法，不发明）：

既有约定都拿到了（Host 路由 `webServer.register` + client 插件形态 `inject=['slots']`/`slots.inject`/`createElement`）。取最后一份模板（build 包装 + tsconfig + dshx.yml）：

模板齐了。开始建 **`@oblivion/panel`**（新包，走热挂）。先确认依赖面并复制版本脚本：

一处 dshx 硬校验没过（function plugin 不许 default-export）。看既有插件怎么写的，然后改：

dshx 全绿。现在给它补契约断言（第三方依赖 `dsh-better-sidebar` 需要新的校验种类）:

**面板的 Node 半边已经热挂生效**（无需重启）：路由 HTTP 200、契约 5/5。顺便验证上一轮那个预测：

面板已交付并**在真实 Host 里跑起来了**。但顺带验证出一个**必须马上查的异常**：上一轮预测的 `decisions.jsonl` **仍然不存在**（status.json 也没刷新）。这说明 `turn/end` 可能根本没接到——我加一个临时事件探针来定位：

核心已升到 **0.1.6（带事件探针）**。现在验证一个关键假设——**link 插件的 Host 侧改动会不会被监视并自动重挂**：

`status.json` 在构建后 **1 秒**就被重写为 v0.1.6 —— 这推翻了「Host 侧改码必须重启」的说法：**link 插件的 Host 半边会被监视并自动重挂**。探针要等本轮结束才有数据，先把订阅姿势查清（万一探针为空，这就是修法）：

订阅姿势与官方完全一致（`ctx.on('session/event', (session, event) => …)`）——所以探针的结论会是决定性的。先把新插件与今天的两个发现写进文档：

B 交付完成（`d74839b` 已推送），A 的步骤在下面。

## 一、B：`@oblivion/panel` v0.0.1 已建好并**在真实 Host 里跑起来了**

**它是什么**：core 的观测数据（捕获率 / 拦截原因 / 调参建议 / 最近沉淀 / 知识库笔记）做成一个 tab，**嵌进 `dsh-better-sidebar` 的那一列**。**不自己造文件树**——文件树、编辑器、侧边对话都交给 better-sidebar，我们只在它的座位上加「认知层观测」页。

| 半边 | 做了什么 |
| --- | --- |
| **Node**（`src/index.ts`） | 启动标记 + 自证据文件 + **一条只读路由** `GET /oblivion-panel/status`（GET-only、`no-store`、读入有上限、**不含会话原文**） |
| **浏览器**（`src/client/`） | `ctx.betterSidebar.registerTab({ id:'oblivion:panel', order:70, single:true })` + 面板 UI（空态会解释「为什么没数据」） |

**实测证据**（不是"应该能跑"）：

```
契约校验    => PASS（5/5）  ← 含新断言 npmPkg dsh-better-sidebar v0.24.1
路由探测    HTTP 200  {"ok":true,"panelVersion":"0.0.1","core":{"version":"0.1.6",...}}
自证据文件  %TEMP%\oblivion-panel\host-mount.json  {"mountedAt":"2026-10-06T01:09:16Z","pid":27188}
闸门        test 13/13 · selfcheck 8/8 · dshx check 全绿（含「function plugin 不得 default export」）
工作区      pnpm run check → 全部通过（brand 10/10 · core 8/8 · panel 5/5 · vimc 6/6）
```

**你要做的一步**：**硬刷新页面**（`Ctrl+Shift+R`），然后在 side bar 的 `+` 菜单里找 **Oblivion**。
（Node 半边已热挂生效，**不用重启 App**。）

顺带纠正一条我之前说错的结论：**「Host 侧改码必须重启 App」对 link 挂载的插件不成立** —— 实测 `lib/index.js` 构建于 `09:10:19`，`status.json` 在 `09:10:20` 就变成 `version 0.1.6`（**1 秒级自动重挂**）。仍成立的是：bundle 层要重启、浏览器半边要硬刷新。

## 二、A：用现成能力摆出「工作区 / 文件区 / 文件展示区 / 对话区」

**A-1 四区对应关系**

| 你要的区 | 用什么 | 怎么开 |
| --- | --- | --- |
| **工作区** | 官方左栏（你截图二） | 已有 |
| **文件区** | better-sidebar 的 **文件** tab（接管官方「文件」页） | side bar 的 `+` → 新建「文件」页 |
| **文件展示区** | 同一列里的**可编辑编辑器**（Markdown/HTML/Mermaid 渲染） | 在文件树里点文件 |
| **对话区** | 主列会话 + 原生右侧栏（可同时展开） | 已有 |

**A-2 操作（按 better-sidebar 文档 + 你的截图推导）**

1. **先让文件树长出来**：在一个**带工作区的会话**里，`+` → **文件**，展开一个目录；或直接按 **`Ctrl+P`**（你截图一那张「工作区文件 / Ctrl+P」就是它的空态引导，不是功能缺失）。
2. **一列两栏（最像 Obsidian）**：把某个 tab **拖到分栏边缘** → 拆成左右两栏；左边放**文件**树、右边放编辑器 → 「文件区 + 文件展示区」同屏。拖到中间可合并回去。
3. **加第二/第三条工作线**（都在 `+` 菜单里）：
   - **变动**：Git 视角（暂存/提交/历史）+ 本轮 AI 改动，统一 diff 渲染
   - **任务**：子代理拓扑 + 后台任务清单
   - **侧边对话**（beta）：Codex 风格线程，继承主会话上下文，可一键提升为顶层会话
4. **引用文件进输入框**：文件树里悬浮行尾的 **`@文件`** 按钮 → 直接把路径插进对话输入框（跨区协作的关键动作）。
5. **快捷键**：`Ctrl+S` 保存编辑 · `Ctrl+Enter` Git 提交 · **中键**关 tab · 右键 tab → 关闭其他/左侧/右侧 · 右键行 → 复制相对/绝对路径 · 打开方式（资源管理器 / VS Code / Cursor / Zed / 自定义模板）。
6. **每会话独立**：布局按会话持久化 —— 你在一个会话里摆好的分栏，不会污染别的会话。
7. **再加我们的第五个 tab**：`Oblivion` —— 与上面这些**并存**，专门显示认知层观测与调参建议。

> 说明：A-2 的按键与手势来自 better-sidebar 的 README（v0.24.1）；界面细节我没法替你看屏确认，若某一步与你的版本不一致，以它设置页里的「侧边卡片」为准（那里还能一键复制它推荐的 28+ 个生态插件的安装命令）。

## 三、顺带查出一个**必须结案**的异常（已加探针）

上一轮我预测「这条回复结束后 `decisions.jsonl` 应出现第 1 行」——**它没有出现**，而且 `status.json` 的 `stats.turns` 一直是 0。而这期间**至少有两轮问答走完了 `turn/end`**。

也就是说：`@oblivion/core` 装载正常（`status.json` 每次 apply 都写、路由 200）、订阅写法与官方 14 处 Host 侧代码**逐字一致**，但**事件像是没送到我们手里**。

我在 **core v0.1.6** 里加了一次性探针 `enableEventProbe`：**在守卫之前**把每个 `session/event` 记一行到 `~/.oblivion/data/events-probe.jsonl`（只记 `type`/`seq`/`sessionIdOk`/`subjectKeys`/`dataKeys`，**不含任何正文**）。判读表写进了 [HANDOFF.md](C:\Projects\Oblivion\HANDOFF.md) 坑清单 5.5：

| 探针结果 | 结论 |
| --- | --- |
| 一行都没有 | `session/event` 根本没到本插件 → 查 `ctx.inject(['session'], …)` 是否为必要前置 |
| 有事件但无 `turn/end` | 事件名/时机不对 |
| 有 `turn/end` 且 `sessionIdOk: false` | **是我们自己的守卫丢了事件**（`subject.id` 不是字符串） |
| 有 `turn/end` 且 `sessionIdOk: true` | 事件到了却没留痕 → `handle()` 内部异常 |

**你什么都不用做**：这条回复结束时就会触发一次 `turn/end`；下一轮我第一件事就是读这个探针，按上表定位并修掉 —— 修好后把 `enableEventProbe` 关回 `false`。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---