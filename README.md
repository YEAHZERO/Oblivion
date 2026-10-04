# Oblivion · 遗忘

**可编程的认知运行环境** —— 一个能自动把问答沉淀为结构化文档、具备自学习能力的本地知识库系统。

| 字段     | 值                                               |
| -------- | ------------------------------------------------ |
| 版本     | **0.0.2**（Phase 5 问答闭环落地）                |
| 状态     | alpha — 设计基线已定，实现按路线图推进            |
| 桌面框架 | Electron                                         |
| 插件内核 | Cordis（参考架构 `@deepseek-ai/dsh@0.2.0-rc.2`） |
| 品牌图标 | 北极星（Polaris）                                |
| 许可证   | MIT                                              |
| 维护者   | YEAHZERO                                         |

---

## 本仓库现状（先读这一段）

本仓库是**重新生成的空仓**，目前只承载三类东西：

| 目录 | 内容 | 说明 |
| --- | --- | --- |
| `.design/ARCHITECTURE.MD` | **设计书**（v4.0-baseline，1960 行） | 项目的意图、决策与验收基线。**它是规范，不是现状描述** |
| `.action/` · `.memory/` | **AI Agent 协作框架** | 工作流、业务规则、记忆库与版本记录规则 |
| `oblivion-brand/` | **`@oblivion/brand` 插件** | 已实现并装入 DSH Desktop：北极星品牌接管、可换图片、可关闭接管、侧栏嵌入面板、直接重启 |
| `tools/` | 快捷方式图标脚本等 | 与本机环境相关的运维脚本 |

- DSH 插件工作区的**操作细节**（环境前置、DSHX 安装、具体命令、已踩过的坑）在
  [WORKSPACE.md](WORKSPACE.md)，不在本文件重复。
- 插件自身的完整文档在 [`oblivion-brand/README.md`](oblivion-brand/README.md)。

> ⚠️ **下文「二、功能」里列出的 26 个能力包（`oblivion-*`）当前不在本仓库中。**
> 它们存在于上一份检出（`C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek`）。
> 保留这份功能设计是因为**它是目标而不是现状** —— 别读成「仓库里已经有这些」。
> 结构事实以本节表格与下文「四、本仓库实际结构」为准。

---

## 概览

Oblivion 的功能设计围绕**三条主线**：

> ① **知识自动生长**（问答闭环 + 思维激荡 + 图谱生长 + 反馈画像）
> ② **可编程组合**（一切皆插件 + YAML 声明 + 双形态共享）
> ③ **长期可维护**（勘误不删 + 变更控制 + 发布工程学 + 源码沉淀）

功能可以概括为：**一个内核 + 三种部署形态 + 五项核心认知能力 + 三层 UI 设计 + 一套发布工程学**。

| 维度 | 说明 |
| --- | --- |
| **内核** | Cordis DI + YAML Patch 声明式组合（六层叠加） |
| **部署形态** | CLI（npm） / Desktop（Electron） / （已移除的 Docker） |
| **核心认知** | 问答闭环 · 思维激荡 · 图谱生长 · 反馈画像 · 内容创作 |
| **UI 三层** | 视觉语言（427 令牌） / 界面结构（三栏 + 槽位） / 组件（57 组件 + 188 图标） |
| **发布工程学** | 三级版本（alpha/rc/热修）· 破坏性变更契约 · 迁移工具 · 镜像三级兜底 |

贯穿所有设计的隐含原则：**能配置就不硬编码，能标注就不删除，能共享就不复制，能降级就不阻断**。

---

## 一、设计理念

### 北极星

> Oblivion 不只是知识库应用，而是**可编程的认知运行环境**。

它不替你决定该有什么功能。用户通过 YAML 声明式地组合自己的能力集：

```yaml
# 纯问答机器人
- oblivion-core
- oblivion-llm-deepseek
- oblivion-web-ui

# 完整认知陪伴体验
- oblivion-core
- oblivion-llm-deepseek
- oblivion-qa-loop
- oblivion-perspective
- oblivion-graph-growth
- oblivion-content-creator
- oblivion-web-ui
```

### 「自学习」是被界定的，不是什么都往里装

| 组件     | 作用                   |
| -------- | ---------------------- |
| 问答闭环 | 问答沉淀为新知识       |
| 思维激荡 | 在回答中主动提供新视角 |
| 图谱生长 | 问答频次强化知识关联   |

**明确不纳入**：检索排序优化 —— 它需要反馈闭环收敛，首版数据量不足，留到有真实使用数据后重评。

### 插件图写在 YAML 里，不写在代码里

代码只负责按层叠加、按 id 覆盖。配置经六层按优先级合成：

| #   | 层        | 位置                                           | 入库 |
| --- | --------- | ---------------------------------------------- | ---- |
| ①   | 空根      | `cordis.yml = []`（每次启动重写）              | —    |
| ②   | Bundle 层 | 每个能力包自带的 `cordis.patch.yml`            | ✅   |
| ③   | 用户层    | `~/.oblivion/profiles/<name>/cordis.patch.yml` | ❌   |
| ④   | Home 层   | `~/.oblivion/cordis.patch.yml`                 | ❌   |
| ⑤   | `--patch` | 命令行额外指定                                 | —    |
| ⑤′  | 项目层    | 仓库内 `profiles/<name>/cordis.patch.yml`      | ✅   |

三条必须记住的语义：

1. **patch 替换整段 `config`，不是合并** —— 每层都必须写全量默认值
2. **行顺序不携带加载语义** —— 激活由服务可用性驱动，不由声明顺序驱动
3. **`!!js` 让配置变成代码** —— 代价是纯静态校验做不到，因此必须有可导出的事实源

### 插件契约：包边界就是 `exports`

每个能力包导出同一组东西：

```ts
import type { Context } from '@deepseek-ai/cordis';

export const name = 'oblivion-qa-loop';
export const inject = ['llm', 'knowledge', 'session']; // 等待就绪的服务

export interface Config {
  readonly semanticThreshold: number;
}
export const DEFAULT_CONFIG: Config = { semanticThreshold: 0.85 };

export function apply(ctx: Context, config: Config = DEFAULT_CONFIG): void {
  /* … */
}
```

`inject` 声明的是**服务**，不是包 —— `inject: ['llm']` 说的是「等 `ctx.llm` 可用」，
至于 `llm` 由谁提供与本包无关。这是可替换性的来源。

### 双部署形态：同包，字节相同

|          | CLI（npm）                           | Desktop（Electron）                                   |
| -------- | ------------------------------------ | ----------------------------------------------------- |
| 代码载体 | npm 全局目录                         | asar 内 `oblivion/node_modules`（**同包，字节相同**） |
| 运行时   | 系统 Node                            | 内嵌 Node（锁版本）                                   |
| Profile  | `~/.oblivion/profiles/web/`          | `~/.oblivion/profiles/desktop/`                       |
| 入口约束 | **CLI 显式拒绝 `--profile desktop`** | 必须经 `oblivion-desktop-host` 进入                   |
| UI 来源  | `oblivion-web-ui` 插件               | 同左（renderer 仅欢迎页）                             |

**数据完全共享，配置平级隔离**：

```
              oblivion web            Desktop
插件来源   npm 全局 node_modules    asar 内 oblivion/node_modules
                 └──────────┬──────────────┘
                            ▼
                OBLIVION_HOME = ~/.oblivion
        .credentials.yaml · sessions/ · storages/ · data/
              profiles/web · profiles/desktop   ← 平级隔离
```

**业务 UI 不在 Electron renderer 里** —— 一旦长在壳里，CLI 形态就永远拿不到，
双形态共享随之破产。

### 平面分离：按「谁读它」划界

> 一个被 preset 外部行读取的服务属于 **Host plane**（如会话、知识库单例）；
> 只被 agent 消费的才是 **Agent plane**（如 `tool-*`）。

这条判据决定了一个能力该常驻还是按会话挂载 —— 而不是靠感觉。

### 权限：少权优先，降级必须显式

沙箱档位与审批策略是**两条独立表达式**，各自读同一个环境变量，互不调用：

| 档位                 | sandbox            | approval |
| -------------------- | ------------------ | -------- |
| `read-only`          | read-only          | ask      |
| `workspace-write`    | workspace-write    | ask      |
| `danger-full-access` | danger-full-access | never    |

用户面对三个词，底层保持两轴独立 —— 将来要加一轴（比如网络访问）不必重设计界面。

### 品牌图形是代码，不是图片

同一个 `POLARIS_PATH` 常量同时供侧栏品牌位（静态）、对话页 hero（动画）、
托盘、favicon 复用。几何真源是一个脚本，一次产出 `polaris-path.ts` / svg / 各档 png / ico / icns ——
**改图标 = 改脚本里的常量再重跑**，不存在「改了 png 忘了改 svg」。

> 本仓库的 `oblivion-brand/` 是这条理念的落地：北极星几何以 `polaris.ts` 常量形式存在，
> 侧栏与 Hero 两个槽位共用同一个组件。

### 文档也分层：同一件事只留一份真源

设计文档按**关注点**拆成四份，而不是写成一本越来越厚的书：

| 文档              | 只管         | 权威范围                                                       |
| ----------------- | ------------ | -------------------------------------------------------------- |
| `architecture.md` | **架构**     | 插件体系、双部署形态、Profile 组合、安全模型、部署、风险与验收 |
| `DESIGN.MD`       | **视觉语言** | 品牌图标、设计令牌（427）、排版（8 档）、主题、焦点与平台差异  |
| `LAYOUT.MD`       | **界面结构** | 三栏框架、几何契约、断点降级、槽位地图、拖拽与偏好持久化       |
| `COMPONENTS.MD`   | **组件**     | 组件名单、Props、状态与变体命名、文案与可访问性                |

**冲突优先级是写死的**，因此不需要每次争论：

- 颜色 / 字号 / 圆角 / 阴影 → 以 `DESIGN.MD` 为准
- 栏宽 / 断点 / 轨道 → 以 `LAYOUT.MD` 为准
- 组件的名字与 Props → 以 `COMPONENTS.MD` 为准

两条纪律让这套分层站得住：

1. **文档之间只给指针，不复制论证** —— 复制出来的第二份，迟早和第一份不一致
2. **发现偏差写进勘误台账，不静默改写原文** —— 否则后人再也看不出「当初为什么这么写、什么时候被推翻的」

---

## 二、功能

> 再次提醒：以下能力包**当前不在本仓库**。这一节是功能设计，不是现状。

### 能力总览（26 个能力包）

| 分组 | 能力包 |
| --- | --- |
| A 内核与架构 | `oblivion-core`（DI 容器 / patch 引擎 / 事件总线契约）· `oblivion-desktop-host` · `oblivion-dump-config` |
| B LLM 适配 | `oblivion-llm-deepseek` · `oblivion-llm-openai` · `oblivion-llm-ollama` |
| C 会话管理 | `oblivion-session` · `oblivion-session-sqlite` |
| D 知识库 | `oblivion-knowledge` · `oblivion-knowledge-sqlite` · `oblivion-knowledge-vector` |
| E 工具集 | `oblivion-tool-web-search` · `oblivion-tool-file` · `oblivion-tool-doc-parse` |
| F 核心认知功能 | `oblivion-qa-loop` · `oblivion-perspective` · `oblivion-graph-growth` · `oblivion-feedback` |
| G 内容创作 | `oblivion-content-creator` —— 四种形态 podcast-script / study-guide / faq / summary |
| H 界面 | `oblivion-web-ui` · `oblivion-tray` |
| I 插件管理 | `oblivion-plugin-manager` |
| J 插件适配层 | `oblivion-adapter-obsidian` · `oblivion-adapter-dsh` |
| K 品牌与部署 | `oblivion-updater` |
| L 遥测 | `oblivion-telemetry`（默认关闭） |

### 问答闭环：四层筛选

捕获的问答要过四道关才允许沉淀，因为**知识库的价值取决于不往里放什么**：

| 层          | 机制                   | 阈值                               |
| ----------- | ---------------------- | ---------------------------------- |
| L1 精确去重 | SHA256 比对            | 完全相同 → 丢弃（< 10 ms）         |
| L2 语义去重 | 向量相似度             | > `semanticThreshold`（默认 0.85） |
| L3 规则过滤 | 长度 / 无意义词 / 寒暄 | 命中 → 丢弃                        |
| L4 价值评估 | 首版纯规则             | 低价值 → 不注入 + **留痕**         |

被丢弃不是静默的：每次丢弃都发一条运行信号，否则「为什么这条没进知识库」永远查不清。

### 思维激荡：两种触发，共用闸门

| 模式     | 触发条件             | 闸门                                            |
| -------- | -------------------- | ----------------------------------------------- |
| 主动触发 | 单次提问后           | 开关 + 会话次数上限 + 问题长度 + **必须有引用** |
| 深度触发 | 连续 ≥3 次追问同维度 | 单会话总次数上限                                |

输出通过独立事件注入界面，**不改写原答案**；并且必须能一键完全静默。

### 图谱生长：权重会衰减

首次共现建边 0.3，之后每次 +0.05（上限 1.0），30 天未更新 ×0.95。
边只影响展示与双链写回 Markdown —— 首版**不参与检索排序**。

### 内容创作

播客脚本 / 学习指南 / FAQ / 摘要。刻意做成默认关闭：能力在，但启动成本不付。

### 界面：三栏框架，降级有先后

主界面是**三栏**：左栏（宽 / 轨两态）· 中央 · 右栏（两种呈现）。

窄下去的时候**不是一起挤**，而是有明确的让步顺序：

```
右栏先收缩  →  右栏再丢轨道  →  才轮到中央让步
（左栏不在这一步让步 —— 它只在响应式折叠里改变形态）
```

而且**响应式让步是瞬态的，绝不回写用户的宽度偏好** —— 窗口拉回宽尺寸时恢复原样。
两条偏好规则的语义刻意相反：左栏「关闭即遗忘」，右栏「跨 resize / close 保留」。

扩展靠**槽位**而不是改壳：左栏 7 个子槽、右栏 4 个扩展位，其中 `shell.overlay` 是**加法位** ——
新增 id 是并列，不是替换。

### 组件：不碰 Cordis 的纯展示层

组件层的来源是一句文件头注释，它同时是三条硬约束：

> **`Cordis-free React primitives styled only through --dsw-* tokens.`**

也就是：不认识 Cordis、只能用令牌取色、不携带业务数据。
把这三条守住，组件才能在两个部署形态、任意主题下复用而不长出分支。

数量是可核对的：**57 个 React 组件 + 12 个 hook + 21 个常量 + 188 个图标**
（`57+12+21+1+1 = 92`；`188+3 = 191`，两本账都闭合）。
固化常量直接可断言：`Toast` 默认停留 3000 ms、`Button` 两档 36px/12r 与 28px/8r、
四个内容块默认截断 **16 行**。

---

## 三、协作与文档框架

本仓库带一套**结构无关**的 Agent 协作框架。原则：**规则与模板入库，逐日记录不入库**
（后者随个人与机器而异，入库只会制造噪音与冲突）。

| 路径 | 作用 |
| --- | --- |
| `.design/ARCHITECTURE.MD` | 设计书（意图 / 决策 / 验收基线） |
| `.action/` | Agent 协作规范、工作流、业务规则、技能与执行顺序 |
| `.memory/` | 共用记忆库：`daily/` `review/` `design/` `specs/` `release/` 的**规则与模板** |
| `CHANGELOG.md` | 对外的版本说明（**唯一**公开的发布记录） |
| `VERSION` | 产品版本单一真源 |
| `CONTRIBUTING.md` | 贡献指南 + **第三方复用登记**（唯一登记载体） |
| `WORKSPACE.md` | DSH 插件工作区的操作细节（环境前置、命令、已知限制） |

`.memory/` 的**每轮三步固定动作**（`daily/` → `release/alpha/` → `TODO.md`）见
[`.memory/README.md`](.memory/README.md)。

> ⚠️ **版本有两条轴，别混**：**产品版本**在根 `VERSION` / `CHANGELOG.md`；
> **插件版本**在 `oblivion-brand/VERSION`。两者独立递增。

---

## 四、本仓库实际结构

```
Oblivion/
├── .action/                 # Agent 协作框架（规则 / 工作流 / 技能）
├── .memory/                 # 记忆库：规则与模板入库，逐日记录不入库
├── .design/                 # 设计书 ARCHITECTURE.MD
├── oblivion-brand/          # @oblivion/brand 插件（当前唯一已实现的能力）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ · lib/ · scripts/
│   └── README.md            #   插件完整文档
├── tools/                   # 本机运维脚本
├── CHANGELOG.md             # 对外版本说明
├── CONTRIBUTING.md          # 贡献指南 + 第三方复用登记
├── LICENSE · SECURITY.md
├── VERSION                  # 产品版本单一真源
├── WORKSPACE.md             # DSH 插件工作区操作细节
└── README.md
```

---

## 版本历史

| 版本      | 日期       | 说明                                                                |
| --------- | ---------- | ------------------------------------------------------------------- |
| **0.0.1** | 2026-10-02 | 起点基线：目录结构对齐设计书 §10，26 个能力包契约就位，品牌资产生成 |
| **0.0.2** | 2026-10-04 | Phase 5 问答闭环落地 + 三条主线 README 重写                         |
| 未发版    | —          | 重新开仓：只保留设计书、协作框架与 `@oblivion/brand` 插件           |

## 许可证

MIT，详见 [LICENSE](LICENSE)。
