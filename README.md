# Oblivion · 遗忘

**基于 DeepSeek Harness 宿主构建的、具备自学习能力的本地知识库插件生态。**

| 字段     | 值 |
| -------- | --- |
| 产品版本 | **0.0.2**（见 [`VERSION`](VERSION)） |
| 状态     | alpha — 设计基线已定，实现按路线图推进 |
| **宿主** | **`@deepseek-ai/dsh`（上游，不 Fork）** |
| 本项目   | `@oblivion/*` 插件生态（8 个插件） |
| 品牌图标 | **北极星（Polaris）** |
| 许可证   | MIT |
| 维护者   | YEAHZERO |

> **设计基线是 [`v4.1-baseline`](.design/ARCHITECTURE.MD)（DSH 宿主化决策版）** —— 2026-10-04 的范式修正：
> **Oblivion 不是独立应用，而是 DSH 的一个「认知增强插件组」。** 宿主已提供的 20 项基础能力（容器、
> 组合引擎、LLM 适配、会话、UI、沙箱…）**一律不重造**；Oblivion 只写宿主没有的 8 项领域能力。

---

## 一、本仓库现状（先读这一段）

本仓库是**重新生成的开仓**，目前只承载五类东西：

| 路径 | 内容 | 状态 |
| --- | --- | --- |
| `.design/ARCHITECTURE.MD` | **设计书**（v4.1-baseline，2400+ 行；**§33 是「设计书 vs 落地」的对账入口**） | 权威规范 |
| `.design/DSH-COMPAT.md` | **DSH 升级兼容台账**（契约声明 + 校验矩阵 + 升级 SOP） | 已运行（7 包全 PASS） |
| `.design/自动整理与设置页.md` | **自动整理 + 插件设置页**设计稿（**DEC-030**：默认不调 LLM → 显式开启后经 `ctx.llm`；含实测的宿主 LLM/凭据接口清单） | **Confirmed**（所有者已确认；**代码未开始**） |
| `.action/` · `.memory/` | **AI Agent 协作框架**（工作流 / 业务规则 / 记忆库与版本规则） | 已入库（规则与模板） |
| `oblivion-*/` | **6 个插件 + 1 个安装入口**（见下） | ✅ 已实现并上机 |
| `tools/` | 运维脚本（`check-workspace.ps1` / `verify-dsh-compat.ps1` / `lint-ps1-bom.ps1` …） | 可用 |

**已实现的包（7 个目录：6 个插件 + 1 个安装入口）**：@oblivion/bundle 是安装入口（不是插件：没有 apply(ctx)，只有 cordis.patch.yml），一条命令装齐其余插件。

| 包 | 版本 | 角色 |
| --- | --- | --- |
| [`@oblivion/brand`](oblivion-brand/README.md) | **0.1.7** | 品牌槽位接管（侧栏与会话 Hero 换成北极星，**零 Fork**）；可把「插件市场」这类面板挂到侧栏；设置页**一键重启 DSH** |
| [`@oblivion/vimc`](oblivion-vimc/README.md) | **0.2.10** | 键盘导航（`w/s` 翻页 · `f` 链接提示 · `/` 查找 · `i`/`Esc` 输入框 · `Ctrl+方向键` 像素滚动）；按 [Vimium-C](https://github.com/gdh1995/vimium-c) 语义实现（**未复制代码**），**可直接导入 `vimium_c-*.json`**；自带设置页与开销自证 |
| [`@oblivion/core`](oblivion-core/README.md) | **0.2.12** | **认知层内核**：knowledge / qa-loop / perspective / feedback / graph / profile + digest / retitle / wiki / stats；**9 个模型面工具** + MCP 协议面（浏览器扩展那条路） |
| [`@oblivion/panel`](oblivion-panel/README.md) | **0.0.16** | 侧栏观测面板（嵌 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar)）：捕获率 / 判定曲线 / 调参建议 / **知识库单栏** |
| [`@oblivion/http-bridge`](oblivion-http-bridge/README.md) | **0.1.3** | 浏览器扩展接入：固定端口 `42081` 上的 HTTP 传输层（鉴权 / CORS / 体积 / 健康路由），**不含 MCP 逻辑** |
| [`@oblivion/daily-life`](oblivion-daily-life/README.md) | **0.0.1** | 「**有数**」物品服役账本：日均成本 / 服役进度 / 闲置天数 |
| [`@oblivion/bundle`](oblivion-bundle/README.md) | **0.0.1** | 安装入口（插件清单 + 预设配置；**不是插件**） |

> **`@oblivion/core` 的边界（一句话）**：设计书的 **Phase 2–6 合并进这一个包**。落盘根**默认 `~/OblivionKB`**
> （`01_问答沉淀/` 分类，**可由 config 改**，装载时自动创建）；本机（所有者）的既有知识库在
> `C:\Library\那些渐渐被遗忘` —— 那是 **profile 用户层的覆盖**，不是代码里的默认值（见下方 DEC-029）；
> **零侵入**（不阻塞主链路、无 cron/Worker/定时器，图衰减与保留期都是**读取时惰性计算**、防回灌）；
> 挂载走**热挂**（DEC-028）。细节与闸门数字见 [`oblivion-core/README.md`](oblivion-core/README.md)。

> ⚠️ **本仓库目前没有 26 个 `oblivion-*` 能力包。** 那是 **v4.0 及更早**的计划；v4.1 已把它**收敛**：
> 原计划的 `knowledge` / `qa-loop` / `perspective` / `graph-growth` / `feedback`
> **全部合并进 [`@oblivion/core`](oblivion-core/README.md) 一个包**（宿主提供的不再重造）。
> **不要把旧计划读成现状。**
>
> **设计书写的 ≠ 已做的**：哪些做完了、哪些没做、哪些是设计书自己写错（例如 `session:complete` 这个钩子根本不存在），
> 一律看 [设计书 §33 现状对账与缺口](.design/ARCHITECTURE.MD) 与 [HANDOFF.md](HANDOFF.md)。
> 截至 **2026-10-17**，**已落地**的领域能力：问答沉淀、共现图谱、画像、反馈、会话整理（`oblivion_digest`）、
> 笔记改名（`oblivion_retitle`）、主题页（`oblivion_wiki`）、观测与调参留痕（`oblivion_status` + 面板判定曲线）、
> 浏览器扩展接入（`@oblivion/http-bridge`）。**仍缺**：文档导入解析（anydoc）、向量检索、
> 内容创作（Phase 6）、Obsidian 适配（Phase 7）、真机 e2e（Phase 9）、根 `VERSION` 递增器。
>
> **已裁定**：① 知识库**根默认 `~/OblivionKB`、一律可配置**、**内部按 `01_问答沉淀/` 分类**
> （DEC-029；2026-10-17 把「默认值」与「本机私有路径」拆开：本机既有知识库 `C:\Library\那些渐渐被遗忘`
> 改由 profile 用户层按 id 覆盖 `mdRoot`，机器本地、不入库）；
> ② `@oblivion/core` **走热挂**（DEC-028）；③ `@oblivion/vimc` 的挂载**从 bundle 层改回 profile 用户层热挂**（2026-10-06）。

---

## 二、这个项目要做什么

> **本节只给结论与指针。设计意图、证据、决策与验收基线一律以[设计书](.design/ARCHITECTURE.MD)为准 ——
> 本项目自己的纪律是「文档之间只给指针，不复制论证」，复制出来的第二份迟早与第一份不一致。**

三条主线：

> ① **知识自动生长**（问答闭环 + 思维激荡 + 图谱生长 + 反馈画像）
> ② **可编程组合**（一切皆插件 + YAML 声明 + 双形态共享）
> ③ **长期可维护**（勘误不删 + 变更控制 + 发布工程学 + 源码沉淀）

**Oblivion 要写的插件（宿主没有的部分）** —— 计划 8 个，**实际收敛成 6 个包**（右列才是现状）：

| 计划中的插件 | 职责 | 实际 |
| --- | --- | --- |
| `@oblivion/brand` | 品牌槽位接管 | ✅ [`oblivion-brand/`](oblivion-brand/README.md) |
| `@oblivion/vimc` | 键盘导航（**清单外新增**） | ✅ [`oblivion-vimc/`](oblivion-vimc/README.md) |
| `@oblivion/knowledge` | 知识库核心 + 文档解析 + 向量检索 | ⚠️ 核心**并入 [`@oblivion/core`](oblivion-core/README.md)**；**文档解析 / 向量检索仍未做** |
| `@oblivion/qa-loop` | 问答闭环（四层筛选 + 注入） | ✅ **并入 `@oblivion/core`** |
| `@oblivion/perspective` | 思维激荡（双模式触发） | ✅ **并入 `@oblivion/core`** |
| `@oblivion/graph-growth` | 图谱生长（共现建边 + 双链写回） | ✅ 共现建边 **并入 core**；双链回写见 `oblivion_wiki` |
| `@oblivion/feedback` | 反馈画像（👍/👎/⏺） | ✅ **并入 `@oblivion/core`** |
| `@oblivion/content-creator` | 内容创作（播客/学习指南/FAQ/摘要） | ⏳ 未做（Phase 6） |
| `@oblivion/adapter-obsidian` | Obsidian 适配 | ⏳ 未做（Phase 7） |

> 计划外还长出 4 个包（真实需要，不是原设计）：[`panel`](oblivion-panel/README.md)（观测面板）、
> [`http-bridge`](oblivion-http-bridge/README.md)（浏览器扩展接入）、
> [`daily-life`](oblivion-daily-life/README.md)（有数 · 物品服役账本）、[`bundle`](oblivion-bundle/README.md)（安装入口）。

**Oblivion 明确不做的**（由宿主提供，见设计书 §2.2 A 组）：Cordis 容器、YAML Patch 组合引擎、
插件加载器、LLM 适配器、会话与持久化、56 个 `ui-*` 包、沙箱/审批/权限、遥测……
**也不做**：检索排序优化（DEC-008，Deferred）。

---

## 三、文档地图

| 想知道什么 | 去哪 |
| --- | --- |
| **为什么这么设计 / 有哪些证据 / 决策与验收** | [`.design/ARCHITECTURE.MD`](.design/ARCHITECTURE.MD)（v4.1-baseline） |
| **DSH 插件怎么开发**（环境前置、命令、已知限制与踩过的坑） | [`WORKSPACE.md`](WORKSPACE.md) |
| **`@oblivion/brand` 插件怎么用/怎么改** | [`oblivion-brand/README.md`](oblivion-brand/README.md) |
| **`@oblivion/vimc` 插件怎么用/怎么改** | [`oblivion-vimc/README.md`](oblivion-vimc/README.md)（设计意图/决策/验收见 [`.design/vimc-键盘导航.md`](.design/vimc-键盘导航.md)） |
| **`@oblivion/core` 插件怎么用/怎么改** | [`oblivion-core/README.md`](oblivion-core/README.md)（设计书见 [`.design/core-认知内核.md`](.design/core-认知内核.md)，含现状对账） |
| **`@oblivion/panel` 面板怎么用/怎么改** | [`oblivion-panel/README.md`](oblivion-panel/README.md) |
| **`@oblivion/http-bridge` 浏览器扩展怎么接** | [`oblivion-http-bridge/README.md`](oblivion-http-bridge/README.md) |
| **`@oblivion/daily-life`（有数）怎么用** | [`oblivion-daily-life/README.md`](oblivion-daily-life/README.md) |
| **一条命令装齐所有插件（安装入口）** | [`oblivion-bundle/README.md`](oblivion-bundle/README.md) |
| **Agent 协作规范与业务规则** | [`.action/`](.action/) |
| **记忆库怎么用（每轮三步固定动作）** | [`.memory/README.md`](.memory/README.md) |
| **对外版本说明** | [`CHANGELOG.md`](CHANGELOG.md) |
| **DSH 升级后我的插件还活着吗** | [`.design/DSH-COMPAT.md`](.design/DSH-COMPAT.md) + `pnpm run verify:dsh`（契约声明 / 取证校验 / 升级 SOP / 台账） |
| **怎么贡献 / 第三方复用登记** | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

> **版本有两条轴，别混**：**产品版本**在根 [`VERSION`](VERSION) / [`CHANGELOG.md`](CHANGELOG.md)；
> **插件版本**在各自包里的 `VERSION`（`oblivion-brand/` · `oblivion-vimc/` · `oblivion-core/` ·
> `oblivion-panel/` · `oblivion-http-bridge/` · `oblivion-daily-life/` · `oblivion-bundle/`），
> 各自 `pnpm run version:bump` **只加第三位**（patch-only）。
> 两条轴独立递增（设计书 §12.13）。

---

## 四、本仓库实际结构

```
Oblivion/
├── .action/                 # Agent 协作框架（规则 / 工作流 / 技能）
├── .memory/                 # 记忆库：规则与模板入库，逐日记录不入库
├── .design/                 # 设计书 ARCHITECTURE.MD + 设计笔记
├── package.json · pnpm-workspace.yaml · .npmrc · pnpm-lock.yaml   # pnpm 工作区（依赖只存一份）
├── oblivion-brand/          # @oblivion/brand（品牌槽位接管）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/
│   └── README.md
├── oblivion-vimc/           # @oblivion/vimc（键盘导航：w/s/a/d · W/S · i）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/ · tests/
│   └── README.md
├── oblivion-core/           # @oblivion/core（认知层内核：六模块 + digest/retitle/wiki/stats + MCP 面）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/ · test/
│   └── README.md
├── oblivion-panel/          # @oblivion/panel（侧栏观测面板，client 双半）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/ · test/
│   └── README.md
├── oblivion-http-bridge/    # @oblivion/http-bridge（浏览器扩展接入：固定端口 42081）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/ · test/
│   └── README.md
├── oblivion-daily-life/     # @oblivion/daily-life（「有数」物品服役账本）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/ · test/
│   └── README.md
├── oblivion-bundle/         # @oblivion/bundle（安装入口：清单 + 预设配置，**无 apply**）
│   ├── VERSION              #   版本单一真源
│   ├── lib/index.js · cordis.patch.yml
│   └── README.md
├── tools/                   # 本机运维脚本
├── package.json             # pnpm workspace 根（packageManager: pnpm@11.7.0；脚本转 tools/check-workspace.ps1）
├── pnpm-workspace.yaml      # 工作区 glob + allowBuilds（依赖安装脚本显式审批）
├── .npmrc                   # auto-install-peers=false · hoist=false（框架包只放 peerDependencies）
├── pnpm-lock.yaml           # 工作区唯一 lockfile（入库）
├── tools/check-workspace.ps1# 工作区统一入口（解析 DSH 运行时；不依赖 PATH）
├── CHANGELOG.md             # 对外版本说明
├── CONTRIBUTING.md          # 贡献指南 + 第三方复用登记
├── LICENSE · SECURITY.md
├── VERSION                  # 产品版本单一真源
├── WORKSPACE.md             # DSH 插件工作区操作细节
└── README.md
```

---

## 四·五、构建与测试（pnpm workspace）

本仓库用 **pnpm**，并且**只用 DSH 分发的那份受控运行时**——不要求系统安装 Node.js 或 pnpm。

**一条命令（推荐）**：`tools/check-workspace.ps1` 在**运行时解析** DSH 运行时位置，因此不依赖 `pnpm` 在 PATH 上：

```powershell
powershell -File tools/check-workspace.ps1                # = 契约 + install + typecheck + test + build + 版本 + selfcheck
powershell -File tools/check-workspace.ps1 -Task test     # 只跑测试（compat/install/typecheck/test/build/version/selfcheck）
powershell -File tools/check-workspace.ps1 -Task compat   # 只跑 DSH 宿主契约校验（升级后最该跑的一条）
powershell -File tools/check-workspace.ps1 -Task selfcheck# 只跑每包端到端自检
```

> ⚠️ **构建与 DSH 运行互斥（2026-10-17 起有守卫）**：`check` / `build` 会重写插件的 `lib/client.js`，
> 而 DSH 在界面启动 / 刷新附近读到被重写的客户端产物，就会弹「应用无法启动」——
> `web boot: N entries did not activate`。所以脚本在 DSH 活着时**直接拒绝**这两条任务，
> 报错里带完整因果与两条出路（**完全退出 DSH 再构建** / `-AllowRunning` 后立刻**完全重启** DSH）。
> 范围里没有 client 半边时可用精确包名放行：`-Task build -Filter '@oblivion/core'`。
> 判据、四条逐条可核的机制与上机实测见 [`WORKSPACE.md`](WORKSPACE.md) 与 [`CHANGELOG.md`](CHANGELOG.md)。

> **完整的检查规范见 [`docs/检查方法.md`](docs/检查方法.md)** —— 四层检查各抓什么故障、
> 新建插件要凑齐哪些脚本、selfcheck 怎么写、当前检查台账与已知缺口。
> 新增插件或改动 `scripts` 时**务必回看那份文档**：`pnpm -r --if-present` 对缺 script 的包
> **静默跳过**，缺检查不会报错，只会让人误以为「全绿」。

> **`check` 的第一步是 DSH 宿主契约校验** —— 它回答「DSH 升级后我的插件还活着吗」。
> 机制、升级 SOP 与台账见 [`.design/DSH-COMPAT.md`](.design/DSH-COMPAT.md)。

> **`.ps1` 必须带 UTF-8 BOM**（PS 5.1 会把无 BOM 脚本按 ANSI 读，中文注释乱码 → 解析失败）。
> 这条**有机器检查**：`tools/lint-ps1-bom.ps1`（纯 ASCII 写的，因此它自己永远不会因这个原因失效），
> 且 `pnpm run check` 会先跑它。**检查不能写在它要保护的文件里** —— 那个文件一旦丢了 BOM 就连解析都过不去，脚本内的断言永远跑不到。

> 之所以要有这个脚本：DSH 把 pnpm 作为**受控运行时**分发（`pnpm.mjs` 由它自带的 node 执行），
> 本机上 `pnpm` **不在 PATH** 上，所以 `package.json` 里不能写嵌套的 `pnpm run xxx`（会 `'pnpm' is not recognized`）。
> 根 `package.json` 的 `check` / `build` / `test` / `typecheck` / `check:version` 全部指向这个脚本；
> 换机器/CI 可用 `DSH_RUNTIME_ROOT`、`DSH_NODE`、`DSH_PNPM` 覆盖。

**直接调运行时**（等价，便于排错）：

```powershell
# DSH 受控运行时（随 DSH Desktop 分发；版本与宿主一致）
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"

& $node $pnpm install          # 工作区一次装完
& $node $pnpm -r run build     # 全部插件构建
& $node $pnpm -C oblivion-vimc run test   # 单个插件
```

如果你把该运行时目录放进了 PATH（或系统本来就有同版本 pnpm），直接 `pnpm install` / `pnpm -r run build` 也可以。

**为什么是 pnpm 而不是 npm —— 与 DSH 的 Profile 模型同源：**

| 维度 | npm（旧） | pnpm workspace（现在） |
| --- | --- | --- |
| 依赖落盘 | 每个插件一份实体 `node_modules`（实测 `oblivion-brand` 38.0 MB + `oblivion-vimc` 54.7 MB） | **全局内容寻址 store 一份**，插件目录里只有符号链接（实测每个插件 `node_modules` 约 **0.02 MB / 12 项**） |
| lockfile | 每插件一个 `package-lock.json` | 工作区**唯一** `pnpm-lock.yaml` |
| 安装脚本 | 依赖想跑就跑 | 默认**不执行**，只在 `pnpm-workspace.yaml` 的 `allowBuilds` 里逐包放行（当前仅 `esbuild`） |
| 框架包 | 容易被装成 `dependencies` → 运行时两个模块实例、symbol 分裂 | 只放 `peerDependencies` + `auto-install-peers=false`，与 DSH Profile 同一条铁律 |
| 未声明依赖 | 可能"碰巧 require 到" | `hoist=false`：未声明就解析失败 |

> DSH 侧仍按 Profile 模型消费插件：`$DSH_HOME/profiles/<name>/package.json` 里是 `link:` 依赖 +
> `cordis.patch.yml` 插入行（见 [`WORKSPACE.md`](WORKSPACE.md)），**与这里的开发工作区互不影响**。

---

## 版本历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| **0.0.1** | 2026-10-02 | 起点基线 |
| **0.0.2** | 2026-10-04 | Phase 5 问答闭环落地（**旧范式**：26 个自建能力包） |
| 未发版 | 2026-10-04 | **范式修正**：重新开仓，改为 DSH 宿主 + `@oblivion/*` 插件生态；只保留设计书、协作框架与已落地的 `@oblivion/brand` |
| 未发版 | 2026-10-05 | 新增 `@oblivion/vimc`（键盘导航插件，已装机并附验收证据）。**产品版本未递增**：根 `scripts/bump-version.ps1` 不存在，工具待补（见 [`CHANGELOG.md`](CHANGELOG.md)） |
| 未发版 | 2026-10-06 起 | 拆出 `@oblivion/core`（认知层内核，Phase 2–6 合并）+ `@oblivion/http-bridge`（浏览器扩展接入）；知识库根裁定为 `C:\Library\那些渐渐被遗忘`（DEC-029） |
| 未发版 | 2026-10-06 起 | 新增 `@oblivion/panel`（侧栏观测面板）、`@oblivion/daily-life`（有数）、`@oblivion/bundle`（安装入口） |
| 未发版 | 2026-10-17 | `@oblivion/core` **0.2.12**：`mcp-channel-diag.json` 落盘**串行化**（`apply:done` 不再被后发先至吞掉）+ 失败不再静默；工具链加**构建守卫**（DSH 活着拒绝构建）。**产品版本未递增**：patch-only 规则下各插件自行递增，见 [`CHANGELOG.md`](CHANGELOG.md) |
| 未发版 | 2026-10-17 | `@oblivion/core` **0.2.13**：`mdRoot` 默认值回到 **`~/OblivionKB`**（C 方案原意），本机既有知识库改由 **profile 用户层覆盖**（DEC-029 的语义从「代码默认值」降级为「本机配置」） |
| 未发版 | 2026-10-17 | `@oblivion/core` **0.2.14**：**工具注册可注销** —— 重新装载不再撞 `already registered`、不再让 `apply()` 整个失败（真机现场见 [`CHANGELOG.md`](CHANGELOG.md)） |
| 未发版 | 2026-10-17 | `@oblivion/panel` **0.0.16**：知识库条目的日期**拆成「入库 + 更新于」两段**（各标来源）；兜底知识库路径改为 `~/OblivionKB` |

## 许可证

MIT，详见 [LICENSE](LICENSE)。
