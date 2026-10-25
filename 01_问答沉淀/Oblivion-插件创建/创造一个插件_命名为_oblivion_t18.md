# 创造一个插件（命名为@oblivion · 轮 18

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

我想在这个插件中，将dsh的左侧工作区能像obsidian（图三）一样展示内部的文件夹和文件，或者将"工作区文件"这个可以在左侧显示出来，并且分成工作区、文件区、文件展示区、对话区

## 回答

这是**客户端 UI**需求（`@oblivion/core` 是 Host 侧 object 插件，没有界面能力）。动手前必须先做槽位与服务的真实对账——先查 DSH 里「工作区文件」到底是谁实现的、有哪些槽位可用：

**关键发现**：DSH 已经自带 `ui-sidebar-files`（就是「工作区文件」Ctrl+P）以及 `ui-sidebar-browser` / `ui-sidebar-documentpreview` / `ui-sidebar-right` / `ui-workspace` / `ui-layout`。先看它们的槽位与注册点：

布局真相清楚了：左侧栏槽位只有 `brand.mark/name`、`panellist`(全局面板图标)、`workspaces`(会话浏览器)、`settings`、`footer.action`。看看「工作区文件」到底注册到哪个面板、以及它的数据服务：

**重大发现**：你已经装了第三方插件 `dsh-better-sidebar` v0.24.1 —— 它的自述正是「**file tree, editor, changes, tasks and side chat in one column**」并且「**暴露一个服务，供其它插件注册侧栏标签页与文件查看器**」。读它的文档与接口：

这份 README 说明你想要的**基本已经有了**。做最后一步取证（装载状态 + 扩展接口签名）：

## 一、结论先说：你要的「像 Obsidian 一样」**侧栏能力，DSH 里已经装好了**

它来自第三方插件 **`dsh-better-sidebar` v0.24.1**，就在你的 `desktop` profile 里（官方 CLI 列表已确认）：

```
├── @oblivion/brand@link:…   ├── @oblivion/core@link:…   ├── @oblivion/vimc@link:…
└── dsh-better-sidebar@0.24.1     ← 就是它
```

它的自述原文：**"file tree, editor, changes, tasks and side chat in one column, separate for every conversation. Also exposes a service other plugins use to register sidebar tabs and file viewers."**

### 你要的四区，现状对照

| 你想要的区 | 谁提供（现状） |
| --- | --- |
| **工作区** | 左栏顶部工作区/会话列表 —— **官方** `ui-workspace`（就是你的截图二） |
| **文件区** | **better-sidebar 的文件树**：接管官方「文件」页 —— 懒加载目录树、**展开目录实时 watch 自动刷新**、软链接、全局文件名搜索、拖拽上传、悬浮 `@文件` 引用进输入框、多选（Ctrl/Shift）、**Git 变更着色**、新建文件夹、右键「打开方式」 |
| **文件展示区** | **better-sidebar 的可编辑编辑器**（同列打开；Markdown/Mermaid/HTML 渲染、保存、预览切换）或官方右栏 `ui-sidebar-documentpreview` |
| **对话区** | 主列会话（官方）+ better-sidebar 额外给的**侧边对话**（Codex 风格，继承主会话上下文独立跑）与**底部工作台**（可与原生右栏同时展开） |

它还是**按会话隔离布局**（每个会话自己的侧栏状态）——这正是 Obsidian 那种「一列里树 + 编辑器」。

### 你的截图一为什么是空的

那张卡是**文件页的空态引导**（`工作区文件 / 浏览会话工作区的文件 / Ctrl+P`）——它表示**这一列还没打开任何目录或文件**，不是功能缺失。在一个**带工作区的会话**里点开目录（或按 `Ctrl+P` 选文件），树就长出来了。

## 二、所以这里有两个不同层次的需求，别混

| 需求 | 该怎么做 |
| --- | --- |
| ①「左栏像 Obsidian 一样看文件夹树 + 文件展示」 | **已经满足**，用 `dsh-better-sidebar` 即可。**我们不该再写一个文件树**——那是重复造轮子，而且会和它抢官方「文件」页 |
| ②「把 **Oblivion 认知层**放进这个侧栏」 | **还没做，且值得做**，而且有官方支持的扩展点 |

### 扩展点的真实证据（不是我猜的）

```ts
// dsh-better-sidebar/lib/types/client/service.d.ts
// The BetterSidebar client service: a registry that external plugins use …
// published to the cordis context as `ctx.betterSidebar` …
// registerTab / registerFileViewer, both returning a disposer …
// matchFileViewer walks descriptors in priority order (desc, stable): … then `exts`
export interface TabDescriptor { id: string; … }
```

它的 **内置 5 个 tab + 3 个 viewer 走的就是同一套 API**，生态里已有 28+ 个 Tab 插件、3 个预览插件在用这条通道（README「插件生态」列了名单）。

## 三、建议：新建客户端插件 `@oblivion/panel`（而不是改 core）

`@oblivion/core` 是 **Host 侧 object 插件，没有任何 UI 能力** —— 界面必须落在 **client 插件**里。

| 方案 | 内容 | 评价 |
| --- | --- | --- |
| **A. 零代码** | 我给你一份「用 better-sidebar 的 tab + 原生右栏摆出工作区/文件区/预览区/对话区」的操作与验证清单（含 `Ctrl+P` 等） | 立刻可用，但**无法把 Oblivion 数据放进去** |
| **B. 新建 `@oblivion/panel`（推荐）** | 用 `ctx.betterSidebar.registerTab` 注册一个 **「Oblivion」tab**：最近沉淀条目 / 待调参建议（复用 `oblivion_status` 的数据）/ 按主题分组的笔记列表；点击用它的 viewer 打开 `01_问答沉淀/*.md`。可选再 `registerFileViewer` 给笔记加「条目视图」（来源 / 冲突 / 共现邻居） | 与官方和 better-sidebar **共存**，不抢座位；client 插件可热挂 |
| **C. 自己抢左栏做文件树** | 抢占 `sidebar.workspaces`（**single** 槽位 = 官方会话浏览器的座位）重画整列 | ❌ **不建议**：等于接管整个左栏、要自己重写会话列表，并与 better-sidebar 直接冲突 |

**边界**（我会遵守）：`betterSidebar` 作为**可选注入**——它没装的 profile 上我们的插件**降级不注册**，绝不因此装载失败。

## 四、要你定两件事

1. **先 A 还是直接 B？**
   A = 我把「怎么用现有能力摆出四区」的步骤写给你（你在界面上点）；
   B = 我做 `@oblivion/panel`，把认知层嵌进侧栏（文件树继续交给 better-sidebar）。
2. **若选 B：新包 `@oblivion/panel`，还是并进 `@oblivion/brand`？**
   我建议**新包**：`brand` 管品牌（bundle 层、改一次要重启），`panel` 管认知面板（热挂、改一次落盘即生效），职责不混。

你定了之后我会：先按 HANDOFF 第 3 步做 **API 对账**（把 `service.d.ts` 的 `TabDescriptor` / `registerTab` / `registerFileViewer` 完整读一遍，确认我们那份 DSH 的签名与版本匹配）→ 再写 MVP（一个 tab，先只读）→ 按 DSH-COMPAT 流程登记契约（`clientPackages` + 服务存在性断言）→ 给你激活与验证步骤。

- 涉及工具: `pwsh`, `read`

---