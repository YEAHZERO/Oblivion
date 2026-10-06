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
| `.design/DSH-COMPAT.md` | **DSH 升级兼容台账**（契约声明 + 校验矩阵 + 升级 SOP） | 已运行（三插件全 PASS） |
| `.action/` · `.memory/` | **AI Agent 协作框架**（工作流 / 业务规则 / 记忆库与版本规则） | 已入库（规则与模板） |
| `oblivion-brand/` · `oblivion-vimc/` · `oblivion-core/` | **三个插件**（见下） | ✅ 已实现（core 待重启验证） |
| `tools/` | 运维脚本（`check-workspace.ps1` / `verify-dsh-compat.ps1` / `lint-ps1-bom.ps1` …） | 可用 |

**已实现的包（5 个：4 个插件 + 1 个安装入口）**：@oblivion/bundle 是安装入口（不是插件：没有 pply(ctx)，只有 cordis.patch.yml），一条命令装齐其余四个。

① [`@oblivion/brand`](oblivion-brand/README.md) v0.1.0：

- 侧栏与会话 Hero 的**品牌换成北极星**（占用官方槽位，**零 Fork**）
- 品牌名文字可自定义；品牌图形可上传替换；**接管可完全关闭**（关闭后官方外观立即恢复）
- 可把「插件市场」这类**可嵌入面板挂到侧栏**「插件」下方（支持多选）
- 设置页**一键重启 DSH**（自动重新拉起，无控制台窗口，约 2.7 秒）

② [`@oblivion/vimc`](oblivion-vimc/README.md) v0.2.9（**清单外新增**，交互工具类）：

- 把 DSH 当浏览器用：`w/s` 上/下翻页（距离 **0.6 屏**）、`a/d` 横向像素步进、`W/S` 到顶/到底、
  `[`/`]` **上一条/下一条提问**、`/` **页面内查找**（`.`/`,` 前后跳，落点靠上 + 落点标记）、
  `f` **链接提示**（**正文内联引用优先拿单字母**，消息操作按钮其次，外部按钮最后）、`i` 聚焦输入框、**`Esc` 退出输入框**；
  `Ctrl+方向键` 像素级滚动
- **焦点在输入框里时一个键都不接管**；键位与选项按 [Vimium-C](https://github.com/gdh1995/vimium-c) 语义实现
  （**Apache-2.0，未复制代码**，对照表见其 README §11），**可直接导入 `vimium_c-*.json` 选项导出**
- **自带设置页**（设置 → Oblivion 键盘导航）：键位文本、滚动、输入框、查找、链接提示、导入、排除规则与只读自检
- **开销可自证**：真实页面里候选扫描 7.5–19ms（优化前 111.8ms）、按键平均 1.8ms/峰值 3ms；无轮询、无常驻注入 DOM

③ [`@oblivion/core`](oblivion-core/README.md) v0.1.6（**认知层内核**，Host 侧 `object` 插件）：

- 设计书的 **Phase 2–6 合并成一个包**：knowledge / qa-loop / perspective / feedback / graph / profile
- **问答即生长**：`turn/end` 单触发 → 四层筛选（精确去重 / 语义重合 / L3 四条规则 / 价值打分）→ JSON 条目 + 笔记落盘 + 共现建边 + 档案更新
- **落盘位置（所有者裁定）**：笔记写进既有知识库 **`C:\Library\那些渐渐被遗忘`**，**内部按 `01_问答沉淀/` 分类**
  （`00_导入文件/` `02_Wiki页面/` `03_创作产物/` `99_其他/` 兜底）；**位置可由 config 自定义**，且**装载时自动创建**这些目录；
  **同名外来笔记绝不覆盖**，改写 `<topic>-oblivion.md`
- **认知陪伴**：主动（≤3 会话）/ 深度（连续同维度 ≥3 次 → ≥3 候选）/ 陪伴期三通道，走 `systemPrompt` 下一轮注入；档案置信度 <0.3 一律不发
- **零侵入**：不阻塞主链路、无 cron/Worker/定时器（图衰减与反馈保留期都是**读取时惰性计算**）、防回灌
- **观测与调参（v0.1.5）**：每轮判定留痕 `decisions.jsonl` + 装载快照 `status.json` + `oblivion_status` 工具
  （生效配置 + 捕获率/拦截原因/分值分布 + 「该改哪个键、建议多少、依据」）—— **先在真实数据里看几天，再决定阈值**
- 模型面 **6 个工具**：`oblivion_status` / `oblivion_query` / `oblivion_capture` / `oblivion_profile` / `oblivion_feedback` / `oblivion_graph_neighbors`
- 挂载：**热挂**（profile 补丁插入行，落盘即装载，**无需重启**；决策 DEC-028）
- 闸门：契约 **8/8**、test **13/13**、selfcheck **25/25**
- 真机已验：`status.json` 跟着构建时间刷新（v0.1.6）、五个分类目录自动创建、只读路由可达
- ⚠️ **未结案**：`turn/end` 是否真的送达本插件 —— 已加一次性事件探针（`events-probe.jsonl`），判读表见 [`HANDOFF.md`](HANDOFF.md) 坑清单 5.5

④ [`@oblivion/panel`](oblivion-panel/README.md) v0.0.1（**认知面板**，client 双半）：

- 把 core 的观测数据（**捕获率 / 拦截原因 / 调参建议 / 最近沉淀**）做成一个 tab，
  嵌进第三方插件 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 的那一列 —— **不自己造文件树**
- 架构：Node 半边给一条**只读** JSON 路由（`GET /oblivion-panel/status`），浏览器半边用
  `ctx.betterSidebar.registerTab` 注册页；**不含会话原文**，仅计数、原因、标题与路径
- 降级：`betterSidebar` 缺席时不注册、只记一条日志、**不抛错**
- 闸门：契约 **5/5**（含新断言 `npmPkg dsh-better-sidebar`）、test **13/13**、selfcheck **8/8**、`dshx check` 全绿
- 真机已验：**Node 半边路由 HTTP 200**（热挂，无需重启）+ `%TEMP%\oblivion-panel\host-mount.json`；浏览器半边待**硬刷新**目视

> ⚠️ **本仓库目前没有 26 个 `oblivion-*` 能力包。** 那是 **v4.0 及更早**的计划；
> v4.1 已把它**收敛为 8 个插件**（宿主提供的不再重造）。**不要把旧计划读成现状。**
>
> **设计书写的 ≠ 已做的**：哪些做完了、哪些没做、哪些是设计书自己写错（例如 `session:complete` 这个钩子根本不存在），
> 一律看 [设计书 §33 现状对账与缺口](.design/ARCHITECTURE.MD) 与 [HANDOFF.md](HANDOFF.md)。
> 当前**未做**的主要是：文档导入解析（anydoc）、向量检索、`md_rules.yaml` 式 YAML 阈值配置、
> MD frontmatter 与 `[[双链]]` 写回、健康度告警、评价入口 UI、内容创作（Phase 6）、Obsidian 适配（Phase 7）、
> 真机 e2e（Phase 9）、根 `VERSION` 递增器。
>
> **已裁定（2026-10-06，设计书 §33.6）**：① 知识库**根 = `C:\Library\那些渐渐被遗忘`**、**内部按 `01_问答沉淀/` 分类**（DEC-029，已落地 core v0.1.3）；
> ② `@oblivion/core` **走热挂**（DEC-028）。③④⑤（Phase 2 划界 / Phase 6·7 去留 / DSH-COMPAT 是否升格）仍待裁定。

---

## 二、这个项目要做什么

> **本节只给结论与指针。设计意图、证据、决策与验收基线一律以[设计书](.design/ARCHITECTURE.MD)为准 ——
> 本项目自己的纪律是「文档之间只给指针，不复制论证」，复制出来的第二份迟早与第一份不一致。**

三条主线：

> ① **知识自动生长**（问答闭环 + 思维激荡 + 图谱生长 + 反馈画像）
> ② **可编程组合**（一切皆插件 + YAML 声明 + 双形态共享）
> ③ **长期可维护**（勘误不删 + 变更控制 + 发布工程学 + 源码沉淀）

**Oblivion 要写的 8 个插件**（宿主没有的部分）：

| 插件 | 职责 |
| --- | --- |
| `@oblivion/brand` | 品牌槽位接管 ✅ **已落地** |
| `@oblivion/vimc` | 键盘导航（**清单外新增**，交互工具类）✅ **已落地** |
| `@oblivion/knowledge` | 知识库核心 + 文档解析 + 向量检索 |
| `@oblivion/qa-loop` | 问答闭环（四层筛选 + 注入） |
| `@oblivion/perspective` | 思维激荡（双模式触发） |
| `@oblivion/graph-growth` | 图谱生长（共现建边 + 双链写回） |
| `@oblivion/feedback` | 反馈画像（👍/👎/⏺） |
| `@oblivion/content-creator` | 内容创作（播客/学习指南/FAQ/摘要） |
| `@oblivion/adapter-obsidian` | Obsidian 适配 |

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
| **Agent 协作规范与业务规则** | [`.action/`](.action/) |
| **记忆库怎么用（每轮三步固定动作）** | [`.memory/README.md`](.memory/README.md) |
| **对外版本说明** | [`CHANGELOG.md`](CHANGELOG.md) |
| **DSH 升级后我的插件还活着吗** | [`.design/DSH-COMPAT.md`](.design/DSH-COMPAT.md) + `pnpm run verify:dsh`（契约声明 / 取证校验 / 升级 SOP / 台账） |
| **怎么贡献 / 第三方复用登记** | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

> **版本有两条轴，别混**：**产品版本**在根 [`VERSION`](VERSION) / [`CHANGELOG.md`](CHANGELOG.md)；
> **插件版本**在 [`oblivion-brand/VERSION`](oblivion-brand/VERSION)、[`oblivion-vimc/VERSION`](oblivion-vimc/VERSION)
> 与 [`oblivion-core/VERSION`](oblivion-core/VERSION)（各自 `pnpm run version:bump` 只加第三位）。
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
powershell -File tools/check-workspace.ps1              # = 契约校验 + install + typecheck + test + build + 版本一致性
powershell -File tools/check-workspace.ps1 -Task test   # 只跑测试（compat/install/typecheck/test/build/version）
powershell -File tools/check-workspace.ps1 -Task compat # 只跑 DSH 宿主契约校验（升级后最该跑的一条）
```

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

## 许可证

MIT，详见 [LICENSE](LICENSE)。
