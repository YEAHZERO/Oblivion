# Oblivion（遗忘）知识库系统 — 设计书

## v4.1-baseline（DSH 宿主化决策版）

> **✅ BASELINE / 基线声明**
> 本文档于 **2026-10-02** 由用户显式批准转为 **Baseline（v4.0）**；**v4.1 为宿主化范式重构**：基于 2026-10-04 的深度分析，明确 **Oblivion 不 Fork DSH，而是作为 DSH 的插件生态存在**。这是自 v3.0 以来最重要的一次范式修正。
> 此后的设计变更走变更控制（§28）：修订需留痕并递增 Baseline 版本。

| 字段 | 值 |
|---|---|
| 文档版本 | **v4.1-baseline（DSH 宿主化决策版）** |
| 成熟度 | **`Baseline`** |
| 最近更新 | 2026-10-04（范式修正：明确"Oblivion = DSH 宿主 + `@oblivion/*` 插件生态"） |
| 设计负责人 | 用户（单人多角色，Owner = Self-review） |
| **宿主** | **`@deepseek-ai/dsh`（源码或 npm 安装，上游版本）** |
| 本项目 | `@oblivion/*` 插件生态（8 个插件） |
| 品牌图标 | **北极星（Polaris / North Star）图案** |
| 项目起点 | **新分支起点（不继承既有代码）**；已提交根提交 `e6289d525`（alpha-init 分支） |
| 证据基线 | `C:\Users\liveu\dev\dsh-ref\versions\0.2.0-rc.2\` |
| **DSH 源码基线** | `C:\Projects\deepseek-harness @ 0.2.1-alpha.1`（tag `dsh-v0.2.1-alpha.1`） |


## 0. 项目定位

### 0.0 命名约定

> **本文命名约定**：
> - `DSH` / `@deepseek-ai/*` / `dsh-ref` / `dsh-*` = **参考架构/宿主**（已存在，证据来源）
> - `Oblivion` / `@oblivion/*` / `oblivion-ref` = **本项目**（DSH 插件生态）
> - 全文证据路径指向**真实存在的** `dsh-ref/`（`C:\Users\liveu\dev\dsh-ref`）

### 0.1 北极星

> **「Oblivion（遗忘）」是一个基于 DeepSeek Harness 宿主构建的、具备自学习能力的本地知识库插件生态。**

### 0.2 "自学习"的范围界定（DEC-005）

| 组件 | 作用 | 插件形态 |
|---|---|---|
| 问答闭环 | 问答沉淀为新知识 | `@oblivion/qa-loop` |
| **思维激荡** | 在回答中主动提供新视角 | `@oblivion/perspective` |
| **图谱生长** | 问答频次强化知识关联 | `@oblivion/graph-growth` |
| **反馈画像** | 点赞/点踩/中性信号，累积后微调用户画像 | `@oblivion/feedback` |
| **MD 沉淀** | 知识自动落盘为分类 Markdown | `@oblivion/knowledge` |

**明确不纳入**：检索排序优化（DEC-008，Deferred）。

### 0.3 架构愿景

> **Oblivion 不是一个独立应用，而是 DSH 的一个"认知增强插件组"。**

用户通过 DSH 宿主启动，加载 `@oblivion/*` 插件组后，即获得"遗忘"的完整认知能力：

```yaml
# DSH 宿主原生
- @deepseek-ai/dsh-base
- @deepseek-ai/dsh-web-app

# + Oblivion 认知插件组
- @oblivion/knowledge
- @oblivion/qa-loop
- @oblivion/perspective
- @oblivion/graph-growth
- @oblivion/feedback
- @oblivion/content-creator
- @oblivion/adapter-obsidian
- @oblivion/brand
```

### 0.4 代码起点

> **新分支起点，不继承既有代码。**

**事实澄清**：

| 项 | 事实 |
|---|---|
| 仓库 | `C:\Projects\Oblivion` 是 git 仓库 |
| origin | `YEAHZERO/Oblivion` |
| weknora remote | `Tencent/WeKnora` |
| 分支 | 5 个：`main` / `feature/desktop-wails` / `feature/md-sync` / `feature/sync-md` / `feature/upstream-sync` |
| HEAD 树 | Go + Wails 知识引擎，3388 个已跟踪文件 |
| **关键发现** | HEAD 里已有 `packages/dsh-weknora/` —— **一个现成的 DSH Cordis 插件** |
| 新分支起点 | 新根提交 `e6289d525`（alpha-init 分支） |
| 原分支处理 | 5 个分支**完整保留、未做任何破坏** |

**DEC-013（孤儿分支决策）**：

> **决策**：Oblivion v4.1 从**新根提交 `e6289d525`** 开始构建，原 5 分支完整保留。
> **理由**：新架构（DSH 宿主 + `@oblivion/*` 插件）与原分支（Go + Wails）在技术栈和组织范式上完全不同，孤儿分支避免继承债务。
> **可复用成果**：原分支的 `packages/dsh-weknora/` 是现成的 DSH 插件先例，其 `test/e2e/run-in-dsh.mjs` 是**"插件在真 DSH 中跑通"的现成验证范式**。

### 0.5 单机自用假设

> **首版范围 = 单机自用。** 多租户/企业级特性全部 Deferred。
> **复评条件**：≥3 名独立用户或团队共用诉求时重开。

### 0.6 证据基线

本设计书的所有技术决策均基于 `C:\Users\liveu\dev\dsh-ref\versions\0.2.0-rc.2\` 与 `C:\Projects\deepseek-harness @ 0.2.1-alpha.1` 的**逐字取证**。

### 0.7 证据清单（PF-01~PF-43）

| 编号 | 事实 | 验证等级 |
|---|---|---|
| PF-01 | `dsh-ref/versions/0.2.0-rc.2/` 完整快照已建立 | ✅ 逐字取证 |
| PF-02 | `api/cordis/*.d.ts` 9 个类型定义文件 | ✅ 逐字取证 |
| PF-03 | `*reflect.d.ts`（8.3 KB）是反射 API | ✅ 逐字取证 |
| PF-04 | `dump-config-web.yaml` 完整组合树（183 行） | ✅ 逐字取证 |
| PF-05 | `dump-config-schema-web.json`（850 KB） | ✅ 逐字取证 |
| PF-06 | `ui-tokens.md`（427 令牌逐值表） | ✅ 逐字取证 |
| PF-07 | `manifest.json`（287 包清单） | ✅ 逐字取证 |
| PF-08 | DSH 桌面版 = npm 版源码 + Electron 壳 + `dsh-desktop-host` | ✅ 逐字取证 |
| PF-09 | `desktop-runtime.json`（2.8 MB sha256 清单） | ✅ 逐字取证 |
| PF-10 | `app-update.yml`（306 B）4 道锁 | ✅ 逐字取证 |
| PF-11 | `immediately` 标记不存在 | ✅ 逐字取证 |
| PF-12 | `openAt` 枚举是真正的延迟激活机制 | ✅ 逐字取证 |
| PF-13 | 287 包 3005 文件 SHA256 完全一致 | ✅ 逐字取证（DSH 主体） |
| PF-14 | 244 处差异仅 package.json 键序 | ✅ 逐字取证（DSH 主体） |
| PF-15 | 唯一真差异：libreoffice-kit 版本号 | ✅ 逐字取证（DSH 主体） |
| PF-16 | `setEnvironmentData` 是 Worker 上下文传递的统一做法 | ✅ 逐字取证 |
| PF-17 | 破坏性变更只在 rc.1「其他变更」章节 | ✅ 逐字取证 |
| PF-18 | `resolveBundleDir()` 先锚定 install，再回退 profile | ✅ 逐字取证 |
| PF-19 | `--host 0.0.0.0` 被 CLI 显式拒绝，但 schema 层允许 | ✅ 逐字取证 |
| PF-20 | `--profile desktop` 被 CLI 显式拒绝 | ✅ 逐字取证 |
| PF-21 | `dump-config-schema` 退出码 1 | ✅ 逐字取证 |
| PF-22 | web 层禁用 22 行（Host/Agent 平面边界） | ✅ 逐字取证 |
| PF-23 | 四套 preset（standard/minimal/ptc/cordis） | ✅ 逐字取证 |
| PF-24 | `alias` 层 107 个语义别名 | ✅ 逐字取证 |
| PF-25 | 用户可调 UI 参数只有 2 个 | ✅ 逐字取证 |
| PF-26 | 既有仓库含可复用 DSH 插件 `packages/dsh-weknora/` | ✅ 逐字取证 |
| PF-27 | DSH_HOME 优先级：显式配置 > `$DSH_HOME` > `$HOME/.dsh` | ✅ 逐字取证 |
| PF-28 | 唯一原生模块 `node-pty` | ✅ 逐字取证 |
| PF-29 | `engines: null`；Desktop 内嵌 Node 24.18.1 | ✅ 逐字取证 |
| PF-31 | `resolveLanTrust()` 绑 `0.0.0.0` 时自动收 LAN IPv4 | ✅ 逐字取证 |
| PF-32 | DSH 包形态：`main=lib/index.js`、`types=lib/types/index.d.ts` | ✅ 逐字取证 |
| PF-33 | 孤儿分支 `alpha-init` 根提交 `e6289d525`（173 文件） | ✅ 逐字取证 |
| PF-34 | alphα 模板 5 个缺陷 | ✅ 逐字取证 |
| **PF-36** | DSH 有官方品牌槽位：`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark` | ✅ 逐字取证 |
| **PF-37** | `ui-brand-official/src/client/index.ts:17` 有 `DSH_CLIENT_BUILD_PROFILE !== 'official'` 门卫 | ✅ 逐字取证 |
| **PF-38** | `packages/bundle/web-app/package.json:75` 声明了官方品牌包，可通过 profile patch 摘除 | ✅ 逐字取证 |
| **PF-39** | DSH **没有** md 沉淀能力：`knowledge` / `notes` / `wiki` / `obsidian` / `vault` / `graph` / `rag` / `vector` 0 个包 | ✅ 逐字取证 |
| **PF-40** | `dsh-plugin-create` 脚手架与 `dshloader` 兼容层**均不存在** | ✅ 逐字取证 |
| **PF-41** | 包名被 `cordis.patch.yml` 的 `name:` 字段和 profile 的 `bundles` 引用；真正绑定"插件↔宿主"的是**服务名** | ✅ 逐字取证 |
| **PF-42** | 品牌字符串 ≥25 个文件命中；`system-prompt:429` 是 **agent 身份声明**，不是 UI 文案 | ✅ 逐字取证 |
| **PF-43** | `@oblivion/brand` 已装入 DSH Desktop 并生效：`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark` 三槽位实测接管成功（补于 2026-10-04） | ✅ **本机实测** |

### 0.8 宿主化决策（v4.1 核心）

> **DEC-024：Oblivion 不 Fork DSH，只做插件。**

| 问题 | 结论 |
|---|---|
| 宿主从哪来 | **上游 `@deepseek-ai/dsh`**（源码或 npm 安装）。本项目**不修改**其源码、预设、已安装包与其构建产物 |
| 本项目产出什么 | `@oblivion/*` 插件（8 个），装在 `~/.dsh/profiles/<name>/node_modules/` |
| 宿主已有的能力 | **一律不重造**（见 §2.2 A 组的 20 项） |
| 品牌化怎么改 | **占用官方槽位**（§5.9），不改官方包 |
| 升级怎么办 | 插件在 `~/.dsh/`，DSH 更新只替换程序本体，**插件自动保留**（§5.4） |

**为什么这么定**：

1. 宿主已提供 20 项基础能力，Fork 等于**接下全部维护成本**；
2. 品牌化有**官方槽位**（PF-36），官方 README 明文「Occupying a slot is the only composition route」；
3. Fork 会在**每次上游升级时产生不可控的 merge 冲突**。

**推论**：自建内核 / `oblivion-core` / `session` / `llm` / 内置 `ui-*` **全部取消**（§18.2）。


## 1. 品牌与图标

### 1.1 品牌定案

| 项 | 值 |
|---|---|
| 英文名 | **Oblivion** |
| 中文名 | **遗忘** |
| 图标 | **北极星（Polaris）图案** |
| 定位 | 基于 DSH 的认知增强插件生态 |

### 1.2 图标设计规范（DSH 实证校准）

**核心隐喻**：北极星是航海者的**导航锚点**——在知识的海洋中，Oblivion 是用户**认知方向的指引**。

**DSH 的图标实现方式**：**不用图片文件，图标是导出常量 + React 组件**。

```typescript
export declare const POLARIS_VIEWBOX: { width: number; height: number };
export declare const POLARIS_PATH = 'M22.9168 1.43018C22.6713 ...';

export declare function PolarisLogo({ size, className }: IconProps): JSX.Element;
```

**三层结构**：

| 层 | 形态 | 职责 |
|---|---|---|
| `POLARIS_PATH` | SVG path 常量 | 几何唯一真源，供 mask / entrance effect 复用 |
| `PolarisLogo` / `OfficialBrandMark` | React 组件 | 只处理渲染（size 保持比例、aria-hidden） |
| `ctx.slots.register({name:"sidebar.brand.mark"}, OfficialBrandMark)` | 槽位注入 | 宿主面决定放哪、放多大 |

**动画分工原则**：

| 位置 | 形态 | 谁决定 |
|---|---|---|
| 侧栏品牌位 | **静态** `OfficialBrandMark` | 官方包 `slots.register` |
| 对话页 hero | **动画**（animated polaris fallback） | 保留声明包的回退，官方不注册 |
| 加载/重连指示器 | **动画** | 组件内自带 |

**关键原则**：**动画属于宿主面，静态属于品牌位**。两者共享同一个 `POLARIS_PATH` 常量。

**视觉规范**：

| 规范 | 值 |
|---|---|
| 源文件尺寸 | 1024×1024 px |
| 图标主体占比 | 70-80% |
| 导出尺寸 | macOS 512 / Windows 256 / Linux 256 |
| 对比度 | ≥ 4.5:1（深色背景） |
| 圆角 | 22%（macOS 标准圆角） |

**组合方案**：

| 方案 | 内容 | 场景 |
|---|---|---|
| A（完整标识） | 北极星图标 + "OBLIVION" 文字 | 启动页、关于页 |
| B（纯图形） | 仅北极星图标 | 桌面 dock、浏览器 favicon、托盘图标 |
| C（极简徽标） | 仅八芒星中心，无光晕 | 通知栏、状态栏、加载动画 |

**生成提示词**：

> Minimalist logo of a polar star (eight-pointed octagram) for an AI knowledge base called "Oblivion". Center is a small bright dot. Four faint diamond-shaped halos radiate outward. Color: deep space blue (#0A1628) background with starlight gold (#E8D5A3) and aurora cyan (#7EC8E3) accents. Style: modern, tech-oriented, calm and guiding.

> **⚠️ 实现偏离（ERRATA-05）**：提示词里的「Four faint diamond-shaped halos」**未照做**。菱形完整包住星体需半对角线 ≥ 半径 × √2；要同时满足「主体占比 70–80%」，星体须缩到约 52%，违反本节占比规范。故改用**径向光晕**表达同一意图。

**渐变与几何常量（v4.1 落地事实）**：

| 常量 | 值 | 用途 |
|---|---|---|
| `POLARIS_VIEWBOX` | `1024 × 1024` | 几何坐标空间 |
| `POLARIS_CENTER_DOT_RADIUS` | `33.792` | 中心亮点半径 |
| `POLARIS_GRADIENT_FROM` | `#E8D5A3` | 星光金（渐变起点） |
| `POLARIS_GRADIENT_TO` | `#7EC8E3` | 极光青（渐变终点） |

### 1.3 图标在多端的应用

| 端 | 尺寸 | 场景 |
|---|---|---|
| Electron 窗口 | 256×256 | 窗口图标、任务栏 |
| 系统托盘 | 32×32（macOS）/ 16×16（Windows） | 托盘常驻 |
| 安装包 | 512×512 | macOS `.icns` / Windows `.ico` |
| Web UI | 128×128 | 登录页、侧边栏 |
| favicon | 32×32 | 浏览器标签页 |

> **⚠️ 宿主边界（v4.1 实测补充）**：窗口图标与任务栏图标来自 **exe 的 PE 资源**，插件**无法**接管。
> `resources/icon.png` 只喂 `setAboutPanelOptions`，`resources/tray.ico` 只喂托盘与退出对话框。
> 因此 `@oblivion/brand` 能接管的是**界面内槽位**（侧栏 + Hero），**不是**桌面图标。
> 桌面图标的可行替代是改快捷方式（`.lnk`）的 `IconLocation`，见 `tools/set-shortcut-icon.ps1`。


## 2. 功能总览

### 2.1 功能统计

| 类别 | 数量 |
|---|---:|
| **DSH 宿主提供（不重复造）** | 20 项 |
| **Oblivion 独特领域能力（需新写插件）** | 8 项 |
| **品牌化定制（走槽位）** | 2 项 |
| **合计** | **30 项** |

### 2.2 功能清单

#### A. DSH 宿主提供的功能（不重复造）

| # | 功能 | 提供方 |
|---|---|---|
| A1 | Cordis 依赖注入容器 | DSH `@deepseek-ai/cordis` |
| A2 | YAML Patch 组合引擎 | DSH `boot` |
| A3 | 插件加载器 | DSH `boot` |
| A4 | 副作用生命周期管理 | DSH `boot` |
| A5 | 双部署形态支持 | DSH `apps/desktop` |
| A6 | 配置导出命令 | DSH `dsh --dump-config` |
| A7 | 共享根目录 | DSH `~/.dsh` |
| A8 | Profile 平级隔离 | DSH `profiles/` |
| B1 | DeepSeek 适配器 | DSH `llm` |
| B2 | OpenAI 兼容适配器 | DSH `llm` |
| B3 | Ollama 本地适配器 | DSH `llm` |
| C1 | 会话核心服务 | DSH `session` |
| C2 | SQLite 持久化 | DSH `storage-sqlite` |
| E1 | 网络搜索工具 | DSH `tools/web` |
| E2 | 文件读写工具 | DSH `tools/fs` |
| H1 | React Web UI | DSH 56 个 `ui-*` 包 |
| H2 | 系统托盘 | DSH `apps/desktop` |
| I1 | 插件清单 + 安装器 | DSH `plugin-manager` |
| L1 | 遥测 | DSH `telemetry` |
| S1-S5 | 安全沙箱 / 审批 / 权限 / 网络围栏 | DSH `sandbox-*` |

#### F. Oblivion 独特领域能力（DSH 没有的，需新写插件）

| # | 功能 | 插件形态 | 依据 |
|---|---|---|---|
| F1 | **问答闭环** | `@oblivion/qa-loop` | PF-39 |
| F2 | **思维激荡** | `@oblivion/perspective` | PF-39 |
| F3 | **图谱生长** | `@oblivion/graph-growth` | PF-39 |
| F4 | **反馈画像** | `@oblivion/feedback` | PF-39 |
| F5 | **知识库** | `@oblivion/knowledge` | PF-39 |
| D1 | **文档解析** | `@oblivion/knowledge`（含） | PF-39 |
| D2 | **向量检索** | `@oblivion/knowledge`（含） | PF-39 |
| G1 | **内容创作** | `@oblivion/content-creator` | PF-39 |
| J1 | **Obsidian 适配** | `@oblivion/adapter-obsidian` | PF-39 |

#### K. 品牌化定制（走槽位，不 Fork）

| # | 功能 | 实现方式 | 依据 |
|---|---|---|---|
| K1 | 北极星图标 + 品牌名"遗忘" | `@oblivion/brand` 插件占用 3 个品牌槽位 | PF-36 |
| K2 | 让官方品牌让位 | 路 A：`DSH_CLIENT_BUILD_PROFILE=local`；路 B：profile patch `disabled: true` | PF-37、PF-38 |


## 3. 总体架构

### 3.1 三层结构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     L1: DSH 宿主层（不 Fork）                        │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  DSH Desktop（Electron）/ DSH Web（CLI）                        ││
│  │  • 窗口管理 / 系统托盘 / 原生菜单                              ││
│  │  • Cordis 内核（官方）                                          ││
│  │  • Profile 配置（官方）                                         ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  DSH Web UI（56 个官方 ui-* 包）                                ││
│  │  • 三栏框架（sidebar / main / rightbar）                        ││
│  │  • 品牌槽位（sidebar.brand.mark / name + hero）                 ││
│  │  • 由 @oblivion/brand 插件占用（覆盖官方）                      ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L2: Oblivion 插件层（新增）                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  @oblivion/* 插件生态（8 个插件）                               ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          ││
│  │  │knowledge │ │ qa-loop  │ │perspective│ │graph-*   │          ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────────────┐   ││
│  │  │feedback  │ │content-* │ │adapter-obsidian              │   ││
│  │  └──────────┘ └──────────┘ └──────────────────────────────┘   ││
│  │  ┌─────────────────────────────────────────────────────────────┐││
│  │  │brand（品牌槽位占用）                                        │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L3: 数据与外部资源层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│
│  │ DSH SQLite   │  │ Oblivion     │  │  外部 API                ││
│  │ (会话)       │  │ 向量存储     │  │ (LLM/搜索)               ││
│  └──────────────┘  └──────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 启动链

```
dsh（DSH 官方 CLI）
  └─ profile-boot: runProfile()
       ├─ composeProfile()  ← 叠加 DSH 官方 6 层 patch
       ├─ boot()            ← 挂载 Cordis 插件树
       │                       ├─ DSH 原生插件
       │                       └─ @oblivion/* 插件（通过 profile bundles 声明）
       └─ createProcessShutdown()
```

**关键变化**：Oblivion **不接管启动链**，而是作为 DSH 的插件被加载。


## 4. `ctx` 概念说明

### 4.1 `ctx` 是什么

**`ctx` 是 Cordis 框架注入的「上下文对象」（Context）**，是插件与宿主、插件与插件之间交互的**唯一入口**。

### 4.2 通俗理解

把 Cordis 想象成一个**国家**：
- 每个插件是**一个公民**
- `ctx` 是这个公民的**身份证 + 通讯录 + 工具箱**
- 公民想用电力系统，不是自己去发电，而是通过 `ctx.电力` 拿到服务
- 公民想给其他公民发消息，不是直接喊话，而是 `ctx.emit('事件名', 数据)`

### 4.3 技术定义

```typescript
export function apply(ctx: Context) {
  // ctx 是 Cordis 传入的上下文对象
}
```

`ctx` 是一个**代理对象**（Proxy），具有以下特性：

| 特性 | 说明 | 示例 |
|---|---|---|
| **服务访问** | 通过属性名访问已注册的服务 | `ctx.llm`、`ctx.knowledge`、`ctx.tools` |
| **依赖声明** | 通过 `inject` 声明需要哪些服务 | `export const inject = ['llm', 'knowledge']` |
| **事件系统** | `ctx.on()` 订阅、`ctx.emit()` 发布 | `ctx.on('session/event', (session, event) => { if (event.type !== 'turn/end') return; /* handler */ })` |
| **副作用管理** | `ctx.effect()` 注册清理函数 | `ctx.effect(() => { const t = setInterval(...); return () => clearInterval(t); })` |
| **服务注册** | 插件通过 `ctx.provide()` 对外暴露能力 | `ctx.provide('knowledge', knowledgeService)` |
| **子上下文** | `ctx.isolate()` 创建隔离作用域 | 用于多会话隔离 |
| **反射 API** | `ctx.get(name, strict)` / `ctx.set(name, value)` | **可绕过 inject 要求读服务** |

### 4.4 反射 API（DSH 实证）

```typescript
const service = ctx.get('some-service', false);
if (service) {
  // 使用 service
}
```

`strict = false` 时，服务不存在返回 undefined 而非崩溃。这是 **`--dump-config` 实现的地基**——无需启动服务即可遍历容器。

### 4.5 具体到 `ctx.tools`

```typescript
export function apply(ctx: Context) {
  const tools = ctx.tools;

  tools.register({
    name: 'web_search',
    description: 'Search the web',
    handler: async (query) => { /* ... */ },
  });
}
```

`ctx.tools` 不是"工具本身"，而是**工具注册中心**（Tool Registry）。

### 4.6 为什么这样设计

- **解耦**：插件 A 不需要知道插件 B 在哪、怎么调用
- **可替换**：`ctx.llm` 背后是 DeepSeek 还是 OpenAI，调用方不关心
- **可测试**：测试时注入 mock 的 `ctx.tools`，无需启动整个应用


## 5. 双部署形态

### 5.1 两种形态对比

| 维度 | DSH Web（npm 形态） | DSH Desktop（Electron 形态） |
|---|---|---|
| **宿主** | DSH 官方 | DSH 官方 |
| **Oblivion 的角色** | 插件生态 | 插件生态 |
| **插件安装** | `dsh plugin --profile web add` | 同上 |
| **Profile** | `~/.dsh/profiles/web/` | `~/.dsh/profiles/desktop/` |
| **UI 来源** | DSH 56 个 `ui-*` 包 + `@oblivion/brand` | 同左 |

### 5.2 两种形态共享什么

```
              DSH Web                DSH Desktop
插件代码来源   ~/.dsh/profiles/web/    ~/.dsh/profiles/desktop/
                 node_modules/           node_modules/
                 └──────────┬──────────────┘
                            ▼
                DSH_HOME = ~/.dsh  （完全共享）
        .credentials.yaml · sessions/ · storages/
        profiles/web · profiles/desktop  ← 平级隔离
```

### 5.3 Desktop 独有部分

| 组件 | 提供方 |
|---|---|
| `dsh-desktop-host` | DSH 官方 |
| Electron 壳 | DSH 官方 |
| `renderer/` | DSH 官方（仅欢迎页 + 更新对话框） |
| `resources/runtime/` | DSH 官方 |
| `dsh-runtime.json` | DSH 官方 |

**Oblivion 不提供 Desktop 独有部分**——这是 DSH 宿主的职责。

### 5.4 更新机制

| | DSH Web | DSH Desktop |
|---|---|---|
| **升级动作** | `npm i -g @deepseek-ai/dsh@x` | `electron-updater` |
| **Oblivion 插件** | **不动**（在 `~/.dsh/`） | **不动** |
| **Profile** | 不动 | 不动 |

**关键**：DSH 更新只替换程序本体，`~/.dsh/` 数据目录不受影响。**Oblivion 插件自动保留。**

### 5.5 双形态数据共享

#### 5.5.1 共享根目录设计

```
~/.dsh/                                   # DSH_HOME（两形态共享）
├── cordis.patch.yml                      # Home 层配置（机器级）
├── .credentials.yaml                     # 凭据（权限 0600）
├── profiles/                             # Profile 层（平级隔离）
│   ├── web/
│   │   ├── cordis.yml
│   │   ├── cordis.patch.yml
│   │   └── package.json
│   └── desktop/
│       ├── cordis.yml
│       ├── cordis.patch.yml
│       └── package.json
├── sessions/                             # 会话（两形态共享）
├── storages/                             # 工作区（两形态共享）
├── data/
├── logs/
└── plugins/
    └── node_modules/                     # 插件安装位置
```

**环境变量解析**：

```
DSH_HOME 未设置 → 默认 ~/.dsh
DSH_HOME 已设置 → 使用指定路径（用于测试/多实例）
```

#### 5.5.2 凭据共享

**存储位置**：`~/.dsh/.credentials.yaml`（权限 0600）

**共享机制**：

| 特性 | 说明 |
|---|---|
| **两形态共用** | CLI 与 Desktop 读取同一个凭据文件 |
| **逐请求解析** | 每次 API 调用时从文件读取，不缓存在进程环境 |
| **永不写入环境变量** | 避免凭据泄漏到子进程 |
| **权限保护** | 文件权限 0600 |

#### 5.5.3 会话共享

**存储结构**：

```
sessions/
└── <session-id>/
    ├── meta.json
    └── messages.jsonl
```

**共享机制**：

| 特性 | 说明 |
|---|---|
| **两形态共用** | 同一份会话文件被 CLI 与 Desktop 读取 |
| **平级视图** | 任一形态的会话列表都显示全部会话 |
| **Profile 标记** | `meta.json` 的 `profile` 字段记录来源 |
| **冲突处理** | last-write-wins |

#### 5.5.4 工作区共享

**存储结构**：

```
storages/
├── workspace-<hash>/
│   ├── knowledge.db
│   ├── vectors/
│   └── meta.json
└── session_projcache/
```

**工作区命名规则**：

```
workspace 名 = "--" + 路径中所有非字母数字字符替换为 "-" + "--"
```

**共享机制**：

| 特性 | 说明 |
|---|---|
| **两形态共用** | 同一工作区的知识库被两形态访问 |
| **路径寻址** | 工作区按**物理路径**哈希，与形态无关 |
| **增量写入** | SQLite WAL 模式保证并发写入安全 |
| **互斥锁** | 同一工作区同时被两形态写入时，通过文件锁串行化 |

#### 5.5.5 Profile 平级隔离

**共享的是数据（凭据/会话/工作区），隔离的是配置（Profile）**。

**入口约束**：

**CLI 显式拒绝 `--profile desktop`**：

```typescript
const RESERVED_PROFILES = ['desktop'];

export function runProfile(profileName: string) {
  if (RESERVED_PROFILES.includes(profileName)) {
    throw new Error(
      `Profile "${profileName}" is reserved for Electron. ` +
      `Please use the desktop application instead.`
    );
  }
}
```

**Desktop 必须经 `desktop-host` 进入**：

```typescript
export function bootDesktop() {
  const home = resolveDshHome();
  const profile = path.join(home, 'profiles', 'desktop');
  registerHooks();
  return runProfile('desktop');
}
```

### 5.6 Electron 安全设计（DSH 实证）

**DSH 用 `dsh-app://` 协议 + MessageChannel port，不开监听端口**：

| 机制 | 实现 |
|---|---|
| **自定义协议** | `event.origin !== 'dsh-app://app'` 直接丢弃 |
| **进程边界** | 嵌入页只通过 MessageChannel port 与 preload 通信 |
| **一次性 port 移交** | `window.parent !== window` + `event.isTrusted` + 一次性 port 移交 |
| **IPC 白名单** | 按 origin / isMainFrame 放行 |

### 5.7 Web 通道的落地顺序（DEC-017）

**先补 HTTP `/api` 单元 RPC（覆盖面约 80%），再补唯一 WS `/api/remote.mux`。**

三条理由：

1. **不退回 SSE。** 已在 `src/webserver/index.ts` 的 upgrade 路径上调了 `fence.admit()`，Origin 同源校验也在。改用 SSE 等于把 upgrade 席位与围栏一起闲置。
2. **顺序不能反。** mux 的 `streamInboxBytes`（默认 262144）上行缓冲与双向流语义是第二阶段的事；先做 mux 会把复杂度提前。
3. **当前最大的洞不是安全，是「有壳无信道」。** 三席位、围栏、profile 行、`--dump-config` 全齐，但**没有任何业务流量穿过它们**。

### 5.8 HTTP `/api` 一元面的形状提案（R1）

> 依据：上游 `dsh-api-gateway/lib/index.js:623-625` 的挂载点——**不是**一条路由一个功能，而是**单端点 + 端点名在载荷里**。

#### 与上游一致的三条

1. **路径只有 `/api` 一条**（一元请求/响应信封）；实时流将来走唯一的 `/api/remote.mux`。
2. **信封**：请求 `{ id, endpoint, payload }` → 响应 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。
3. **强制 `content-type: application/json`，否则 415**。

#### R1 的最小端点集

| 端点 | 载荷 | 响应 |
|---|---|---|
| `core/status` | `{}` | `{ profile, version, rows: { loaded, pending, skipped, failed }, fence: { trustedHosts, rejections }, web: { port, uptimeMs } }` |

#### 测试口径（DEC-022：同批带 e2e）

| 层 | 用例 |
|---|---|
| 单元 | 信封形状 · 非 JSON → 415 · `claimsEndpoint` · 未知端点 → 404 错误码 |
| 围栏 | 同一组 Host / Origin / `Sec-Fetch-Site` 用例对 `/api` 再跑一遍 |
| **端到端** | 起服务 → UI 发一次真实 `fetch` → 断言返回的 `profile` 与 `--dump-config` 一致 |

### 5.9 品牌化走槽位（v4.1 关键决策）

> **决策：Oblivion 品牌化走 DSH 官方槽位，不 Fork DSH 源码。**

**依据**：DSH 官方 README 明文（`ui-brand-official/README.md`）：

> A deployment with its own identity leaves this package out and composes another package that occupies the sidebar slots — and the hero slot, which this package leaves on its fallback. **Occupying a slot is the only composition route; there is no brand configuration surface here.**

**三个品牌槽位**（PF-36）：

| 槽位 | 声明方 | 契约真源 | 当前占用者 |
|---|---|---|---|
| `sidebar.brand.mark` | `ui-sidebar/src/client/index.ts:80` | `contract/slots.ts:25` | `OfficialBrandMark` |
| `sidebar.brand.name` | `ui-sidebar/src/client/index.ts:81` | `contract/slots.ts:30` | `OfficialBrandName` |
| `conversation.hero.brand.mark` | `ui-conversation/src/client/apply.ts:318` | `contract/slots.ts:191` | **空**（官方故意不占） |

**`@oblivion/brand` 插件的形态**：

```typescript
// packages/brand-oblivion/src/client/index.ts
export const inject = ['slots']

export function apply(ctx) {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OblivionBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, OblivionBrandName)
    }))
}
```

**让官方品牌让位的三条路**：

| 路 | 做法 | 优缺点 |
|---|---|---|
| **A（推荐）** | 构建时设 `DSH_CLIENT_BUILD_PROFILE=local` → 官方包直接 `return` | ✅ 最干净、零冲突 |
| B | profile patch `disabled: true` 摘官方包 | ✅ 有效；⚠️ 需维护 profile |
| C | 优先级选举（`priority?: number`） | ❌ 动态注册 priority 低于 shipped 条目，默认官方会赢 |

**三类例外**（槽位管不到，需单独处理，PF-42）：

| 类别 | 位置 | 处置 |
|---|---|---|
| 浏览器标题 | `scripts/client-build-environment.ts:23` `DSH_CLIENT_TITLE` | 构建期设 `DSH_CLIENT_TITLE=遗忘` |
| 桌面端 locale | `apps/desktop/src/locale.ts`（26 处）+ `main.ts:928` | 单独改；⚠️ git merge 会冲突 |
| **agent 身份声明** | `system-prompt:429` `'You are an AI agent powered by DeepSeek Harness.'` | **单独决策**——影响模型自我认知，不轻易改 |

## 6. Host / Agent 双平面

### 6.1 平面分离原则

> **一个被 preset 外部行读取的服务属于 Host plane；只被 agent 消费的才是 preset 行。**

### 6.2 Oblivion 的平面划分

| 平面 | 职责 | 示例 |
|---|---|---|
| **Host plane** | 进程单例、跨会话服务 | DSH `session`、DSH `llm`、DSH `credentials` |
| **Agent plane** | 按会话挂载的工具与能力 | `@oblivion/qa-loop`、`@oblivion/perspective`、`@oblivion/knowledge` |

### 6.3 Agent Presets

| Preset | 工具集 | 适用场景 |
|---|---|---|
| **standard** | 完整工具集 + 思维激荡 + 图谱生长 | 日常使用 |
| **minimal** | 仅核心问答工具 | 快速响应 |
| **research** | 完整工具集 + 内容创作 + 深度分析 | 研究场景 |

支持 `cordis:group` 隔离（`isolate: {planMode: true}` 等）。


## 7. 配置导出能力

### 7.1 命令

```bash
dsh --dump-config              # 导出完整组合树
dsh --dump-config-schema       # 导出配置 schema
dsh --dump-config-default      # 导出默认配置
```

**核心价值**：**不启动即可导出完整组合树**。这是最有价值的架构事实，且随版本自动更新。

### 7.2 实现机制

通过 Cordis 容器的反射能力（`ctx.get(name, strict)`），遍历已注册插件、依赖关系、配置项，生成结构化输出。

**DSH 实证**：
- `--dump-config` → 46 KB 组合树（无运行服务也能跑）
- `--dump-config-schema` → 850 KB schema

### 7.3 已知坑与应对（DSH 实证）

**DSH 自己也没修好的 bug**：

```
dump-config-schema-web.json → exit=1
3 × "unrecognized Loader tree carrier; use cordis:group or cordis:include
     for native child collection"
```

**Oblivion 的应对**：

> **schema 生成失败时降级到只导出 `dump-config`**


## 8. 源码沉淀流水线

### 8.1 四段流水线

```
① 采集 snapshot        ② diff             ③ 蒸馏 distill         ④ 引用 consume
────────────────       ─────────────      ─────────────────      ──────────────
触发: 全局版本号变化     git diff           按主题(非按包)重排       做成 skill
dsh-ref/versions/x/  prev..cur         sandbox/approval/       或 docs 目录
  ├ composition/       自动分类:           credential/preset/      其他项目直接读
  │  所有 *.patch.yml   · 新增包            session/hmr/...
  ├ api/               · 组合变更          每条标注 版本+文件+行号
  │  所有 *.d.ts        · API 变更
  ├ dump-config.yaml   · 工具 schema 变更
  ├ dump-config-schema.json
  ├ manifest.json      → changes.md        → 主题笔记
  └ src/ 关键 lib/*.js
```

### 8.2 核心原理

**源码本身不用复制多份**——每个版本一个 commit，`git diff` 天然就是"这次更新改了哪些源码细节"，而蒸馏层负责把它变成其他项目能直接抄的**模式**。

### 8.3 已验证的形态（照搬 dsh-ref）

```
dsh-ref/
├── tools/
│   ├── snapshot-dsh.ps1    ← 幂等捕获，跑完自动触发 changes
│   ├── index-dsh.ps1       ← 两遍线性扫描，产出 ground truth 表
│   └── changes-dsh.ps1     ← 分类差异 → changes-<from>-to-<to>.md
├── versions/<ver>/
├── notes/01..06-*.md     ← 设计要点，不是抄源码
└── INDEX.md  README.md   ← 生成物
```

**关键设计**：

1. **notes 不抄源码** —— topic notes 承载设计意图，文件承载事实
2. **`# == 溯源头`** 从 dump-config 解析出组合图（ground truth）
3. **diff 必须分类**（composition / api / src / inventory）
4. **先用假版本端到端验证** changes 脚本


## 9. 插件体系设计

### 9.1 插件清单（8 个插件）

| 子系统 | 插件包 | 职责 | 依赖 |
|---|---|---|---|
| **品牌** | `@oblivion/brand` | 占用 3 个品牌槽位 | DSH `slots` |
| **知识** | `@oblivion/knowledge` | 知识库核心 + 文档解析（anydoc WASM）+ 向量检索 | DSH `session` / `tools` |
| **核心功能** | `@oblivion/qa-loop` | 问答闭环（四层筛选 + 注入） | `knowledge` / DSH `llm` / `session` |
| | `@oblivion/perspective` | 思维激荡（双模式触发） | DSH `llm` / `session` |
| | `@oblivion/graph-growth` | 图谱生长（共现建边 + 双链写回） | `knowledge` |
| | `@oblivion/feedback` | 反馈画像（👍/👎/⏺） | DSH `session` |
| **内容** | `@oblivion/content-creator` | 内容创作（播客/学习指南/FAQ） | DSH `llm` / `knowledge` |
| **适配** | `@oblivion/adapter-obsidian` | Obsidian 插件适配 | DSH `tools` |

### 9.2 插件契约（基于 Cordis）

**① 导出 `apply(ctx)` 函数**

```typescript
import type { Context } from '@deepseek-ai/cordis';

export const name = 'oblivion-qa-loop';
export const inject = ['llm', 'knowledge', 'session'];  // ← 用 DSH 的服务名

export function apply(ctx: Context) {
  ctx.on('session/event', async (session, event) => {
    if (event.type !== 'turn/end') return;
    // turn/end 的 data.turn 是轮次号（没有 event.turnId）
    const answer = session.lastAnswer;
    if (await isHighValue(answer, ctx)) {
      await ctx.knowledge.inject(answer);
    }
  });
}
```

**② `package.json` 声明清单**

```json
{
  "name": "@oblivion/qa-loop",
  "version": "0.1.0",
  "oblivion": {
    "bundle": "cordis.patch.yml"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "~4.0.4"
  },
  "devDependencies": {
    "@deepseek-ai/cordis-plugin-loader": "~1.0.5"
  },
  "dependencies": {}
}
```

**关键**（PF-41 修正）：

- **不改包名的真正理由**：包名被 `cordis.patch.yml` 的 `name:` 字段和 profile 的 `bundles` 引用（**不是**"服务查找"）。
- **真正绑定"插件↔宿主"的是服务名**：`super(ctx,'name')` + `inject = ['llm','session']`。
- 使用 **`~`（patch 级）而非 `^`（minor 级）**。
- **跨包依赖走 `peerDependencies`**；第三方库依赖（如 `zod`）正常写 `dependencies`。

**③ `cordis.patch.yml` 声明依赖与配置**

```yaml
- insert:
    - id: oblivion-qa-loop
      name: '@oblivion/qa-loop'
      config:
        semanticThreshold: 0.85
        autoInject: true
```

### 9.3 插件的生命周期与热插拔

```typescript
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => { /* ... */ }, 1000);
    return () => clearInterval(timer);
  });

  ctx.on('session/event', (session, event) => { if (event.type !== 'turn/end') return; /* handler */ });
}
```

### 9.4 启动优化三层（RISK-103 实证）

**⚠️ 前提纠正**：`immediately` 标记**不存在**——只出现在 2 处英文文档注释里，不是配置项。

**DSH 真正的启动优化是这 3 层**：

| 机制 | 形态 | 实例 |
|---|---|---|
| **① 条件禁用** | `disabled: !!js <表达式>` | `!ctx.get('profileContext')` / `process.platform === 'win32'` |
| **② 配置级延迟激活** | `openAt` 枚举（zod schema） | `session-query-sqlite: openAt: z.union([...])` |
| **③ preset 分层** | preset 块内重新列 `tool-*` | `preset-standard @ L625` → L640 起重列 |

### 9.5 插件脚手架（v4.1 新增 —— 修正 PF-40）

> **事实**：`dsh-plugin-create` 与 `dshloader` **均不存在**（PF-40，全仓 0 命中）。
>
> **对策**：
> 1. **通用 npm 脚手架**：`npm create @oblivion/plugin` 或 `pnpm create @oblivion/plugin`。
> 2. **手动模板**：参考 DSH 的 `ui-brand-official/package.json` 结构，自己建包。
> 3. **DSH 官方 `dsh plugin` 命令**：只负责安装，不负责创建。

### 9.6 实测结论（v4.1，2026-10-04）

> 本节把 2026-10-04 装机过程中**实测得到**的插件↔宿主边界收拢在一起。
> 它们不是实现细节，是**任何 `@oblivion/*` 插件作者都会撞上的事实**。
> 结论来自 `@oblivion/brand`（当前唯一落地的插件，PF-43）。

#### 9.6.1 槽位遮蔽的真实规则

`@deepseek-ai/dsh-client-ui-slots` 的槽位有四种 kind：`single` / `list` / `keyed` / `chain`。
品牌槽位是 **`single`**：

```
同 priority 重复注册 → 抛错
不同 priority       → 遮蔽，且 lowest renders
```

**因此 `priority = -10` 稳定覆盖官方（官方为默认 `0`）**；而**关闭接管只需 dispose 本插件的注册** ——
官方那条立刻重新成为渲染者。这是槽位系统设计好的机制，**不需要改官方包，也不需要 profile patch**。

> **⚠️ 对 §5.9「路 C」的修正**：原判断「动态注册 priority 低于 shipped 条目、默认官方会赢」**是错的** ——
> priority 可以压过 shipped 条目。**推荐顺序更新为：priority 遮蔽（零侵入） > profile patch `disabled` > 构建期摘除。**
> 决策记录见 DEC-025。

#### 9.6.2 八条硬边界

| # | 事实 | 后果 |
|---|---|---|
| 1 | **node 半边只在应用启动时加载**；client 半边在**页面刷新**时重新读取 | 改 node 半边**必须重启应用**；只刷新页面会表现为「路由 404 / 405」而看不出原因 |
| 2 | 桌面端页面来源是 `dsh-app://app`，非文档路径经 `forwardWebRequest` 转发给本地 webserver，**转发前会删除 `origin` 头** | 自作主张校验 `Origin` 的插件会**误拒**合法请求（判据见 9.6.3） |
| 3 | preload 的 `createProductApi()` 只暴露 `protocolVersion` / `browser` / `deviceInfo` / `keyboard` / `shortcuts` / `updates` | **没有重启接口**；`app.relaunch()` 只在崩溃恢复路径和开发模式菜单里 |
| 4 | 插件的 `dsh.client.inject` 必须列全所依赖的客户端包 | 注册未声明的槽位**在加载时抛错**；正确做法是 `ctx.slots.inject(name, cb)` 等声明方就位 |
| 5 | 外部插件装在 `<profile>/node_modules/` 并写进 `dsh.profile.bundles`；`link:` 安装的路径**必须用正斜杠** | 反斜杠会被目标校验正则拒绝 |
| 6 | `dsh plugin --profile desktop` 被**普通 CLI 拒绝**（"managed exclusively by the Electron application"） | 必须用桌面自带 CLI（`resources/runtime/cli/bin/dsh.cmd`，以 `manageDesktopProfile: true` 调用） |
| 7 | 设置页的 `main` 槽位是 `keyed` 且**没有 `children`** 声明 | **任意设置页无法被嵌入**；只有显式 `ctx.provide()` 出 `render()` 的「可嵌入提供方」才行 |
| 8 | 客户端 bundle 不能用 `window.__ModuleLoader__` 之外的模块格式 | 必须包成 `.load({ id, factory })` 工厂闭包；`react` / `react-dom` / `jsx-runtime` / `ui-primitives` 走宿主模块表（标 external） |

#### 9.6.3 插件侧的信任判据

`@oblivion/brand` 暴露了一条 HTTP 路由（重启），必须自己判断调用方是否可信：

| 调用来源 | `Origin` 头 | 处置 |
|---|---|---|
| 桌面端页面 `dsh-app://app` | `dsh-app://app` | ✅ 放行 |
| 桌面端页面经 `forwardWebRequest` 转发 | **被宿主删除，缺失** | ✅ **必须放行** —— 见 9.6.2 第 2 条 |
| 浏览器直连回环 `http://127.0.0.1:<port>` | 存在且为回环 | ✅ 放行 |
| 其他站点跨源 POST | 存在且非回环 | ❌ 403 |

> **结论**：**「缺 `Origin`」不能当拒绝理由**。宿主转发会删掉它，按常规「无 Origin 即拒绝」会把自家页面挡在外面。
> 正确做法：**缺 `Origin` 视为内部调用放行，只拒绝「存在且非本机」的 `Origin`**。
> 另：浏览器对跨源 POST **一定**会带 `Origin`，所以这条判据对 CSRF 仍然有效。

#### 9.6.4 插件能用什么样式

| 能依赖 | 说明 |
|---|---|
| `--dsw-*` CSS 令牌 | DSH 的令牌层，随主题自动切换 |
| React / react-dom / jsx-runtime | 由宿主客户端模块表提供（须标 external） |
| `ui-primitives` | 宿主提供的原语组件 |

| 不能依赖 | 后果 |
|---|---|
| 宿主内部 CSS class 名 | 版本间不稳定，随时改名 |
| 其他插件提供的组件 | 无跨插件组件契约，只有**槽位**与**服务**两种连接方式 |
| 官方包的源码路径 | 升级即失效 |

> **实践**：`@oblivion/brand` 的设置面板样式**全部内联**（`style={{...}}`），只用令牌取色，不引入样式表 ——
> 这样在任何主题下都不会长出分支。

#### 9.6.5 槽位之外的文案归宿主所有

**能改**：`conversation.hero.brand.mark`（槽位，官方故意留空）。
**改不了**：Hero 下方那行标题「探索未至之境」。

| 项 | 事实 |
|---|---|
| 该字符串 | 是 i18n key `hero.headline`，位于 `ui-conversation` 的 locale 资源 |
| 渲染方式 | `t("hero.headline")`，**没有对应槽位** |
| 为什么不能覆盖 | locale 服务对**重复的 `ns + locale` 注册直接抛错**，外部无法抢先注册同名 key |
| 结论 | **这是宿主文案，不是插件扩展点**。要改只能改官方包 —— 违反「不覆盖宿主源码」的原则，故不做 |

> 这与 §5.9 的「三类例外」属同一类问题：**槽位之外的文案归宿主所有**。

## 10. 项目目录结构

```
oblivion/                              # Oblivion 插件仓库（独立于 DSH 宿主）
├── packages/                          # 所有插件
│   ├── brand/                         # @oblivion/brand
│   │   ├── src/
│   │   │   ├── index.ts              # 空 node 半边
│   │   │   └── client/
│   │   │       ├── index.ts          # 注册 3 个槽位
│   │   │       └── Brand.tsx         # OblivionBrandMark / OblivionBrandName
│   │   ├── package.json
│   │   └── cordis.patch.yml
│   ├── knowledge/                     # @oblivion/knowledge
│   ├── qa-loop/                       # @oblivion/qa-loop
│   ├── perspective/                   # @oblivion/perspective
│   ├── graph-growth/                  # @oblivion/graph-growth
│   ├── feedback/                      # @oblivion/feedback
│   ├── content-creator/               # @oblivion/content-creator
│   └── adapter-obsidian/              # @oblivion/adapter-obsidian
├── config/
│   └── oblivion/                      # 业务配置
│       ├── md_rules.yaml
│       ├── qa_rules.yaml
│       ├── perspective_rules.yaml
│       ├── graph_growth.yaml
│       └── feedback_rules.yaml
├── assets/
│   └── brand/
│       ├── polaris-path.ts
│       ├── PolarisLogo.tsx
│       ├── polaris.svg
│       ├── polaris-*.png
│       ├── polaris.icns
│       └── polaris.ico
├── profiles/                          # 项目层 patch（随仓库）
│   ├── web/
│   │   └── cordis.patch.yml
│   └── desktop/
│       └── cordis.patch.yml
├── scripts/
│   └── init_oblivion.sh
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── pnpm-workspace.yaml
└── README.md
```

**关键变化**：
- **不包含** `apps/electron/`、`packages/core/`、`packages/session/` 等 DSH 宿主组件。
- **不包含** `packages/*/ui-*`（DSH 宿主提供）。
- **新增** `packages/brand/`（品牌槽位插件）。

### 10.1 本仓库实际结构与规划偏离（v4.1，2026-10-04）

> **⚠️ 事实**：`@oblivion/brand` 首版**没有**落在上面的 `packages/brand/` 布局，
> 而是以**单包仓库**形态落地在 `C:\Projects\Oblivion\oblivion-brand\`。

| 项 | §10 规划 | 实际落地 | 理由 |
|---|---|---|---|
| 仓库根 | 插件 monorepo | **产品仓**（设计书 + 协作框架 + 插件） | 本仓同时承载设计与实现 |
| 插件位置 | `packages/brand/` | `oblivion-brand/` | 首版只有一个插件，`packages/` 分层暂不引入 |
| 工作区 | `pnpm-workspace.yaml` | 无（单包 `npm`） | 同上 |
| 版本真源 | 根 `VERSION` | 根 `VERSION`（产品） + `oblivion-brand/VERSION`（插件） | **两条版本轴**，见 §28.2 |

**何时回到 `packages/` 布局**：当第 2 个插件（预计 `@oblivion/knowledge`）落地时启用，
届时用 `pnpm-workspace.yaml` 收敛，并按本节的路径迁移。

**本仓库当前的实际结构**（与上面 §10 的规划布局的差异见本节表格）：

```
Oblivion/
├── .action/                 # Agent 协作框架（规则 / 工作流 / 技能）
├── .memory/                 # 记忆库：规则与模板入库，逐日记录不入库
├── .design/                 # 设计书 ARCHITECTURE.MD + 设计笔记
├── oblivion-brand/          # @oblivion/brand（第一个落地的插件）
│   ├── VERSION              #   插件版本单一真源
│   ├── src/ lib/ scripts/
│   └── README.md
├── tools/                   # 本机运维脚本（如快捷方式图标）
├── CHANGELOG.md             # 对外版本说明
├── CONTRIBUTING.md          # 贡献指南 + 第三方复用登记
├── LICENSE · SECURITY.md
├── VERSION                  # 产品版本单一真源
├── WORKSPACE.md             # DSH 插件工作区操作细节
└── README.md
```


## 11. Profile 组合设计

### 11.1 六层 Patch 叠加

| 层 | 位置 | 入库? |
|---|---|---|
| ① 空根 | `cordis.yml = []`（每次启动重写为空） | — |
| ② Bundle 层 | `package.json` 的 `dsh.profile.bundles` 顺序声明 | ✅ 随仓库 |
| ③ 用户层 | `~/.dsh/profiles/<name>/cordis.patch.yml` | ❌ 机器级 |
| ④ Home 层 | `~/.dsh/cordis.patch.yml`（机器级，跨 profile） | ❌ 机器级 |
| ⑤ `--patch` 覆盖 | 命令行额外指定，可重复 | — |
| **⑤′ 项目层** | **`<repo>/profiles/<name>/cordis.patch.yml`** | **✅ 随仓库** |

### 11.2 预置 Profile

**minimal（DSH + 品牌）**：

```yaml
# DSH 原生
- insert:
    - id: core
      name: '@deepseek-ai/dsh-base'
- insert:
    - id: llm
      name: '@deepseek-ai/dsh-llm-deepseek'
      config:
        apiKey: '${env:DEEPSEEK_API_KEY}'
- insert:
    - id: session
      name: '@deepseek-ai/dsh-session'
# Oblivion 插件
- insert:
    - id: oblivion-brand
      name: '@oblivion/brand'
```

**standard（完整认知陪伴）**：

```yaml
# DSH 原生（继承 minimal）
# + Oblivion 认知插件组
- insert:
    - id: oblivion-knowledge
      name: '@oblivion/knowledge'
- insert:
    - id: oblivion-qa-loop
      name: '@oblivion/qa-loop'
      config:
        semanticThreshold: 0.85
- insert:
    - id: oblivion-perspective
      name: '@oblivion/perspective'
      config:
        autoTriggerEnabled: true
- insert:
    - id: oblivion-graph-growth
      name: '@oblivion/graph-growth'
- insert:
    - id: oblivion-feedback
      name: '@oblivion/feedback'
```

### 11.3 条件加载

```yaml
- insert:
    - id: telemetry
      name: '@oblivion/telemetry'
      disabled: !!js process.env.OBLIVION_TELEMETRY_ENABLED !== 'true'
```

### 11.4 根配置重写机制

**`cordis.yml` 每次启动都重写为空数组 `[]`**，防止 Loader 的写回把组合结果固化。


## 12. 核心功能插件规格

### 12.1 `@oblivion/qa-loop`（问答闭环）

| 项 | 内容 |
|---|---|
| 依赖 | DSH `llm`、`session`、Oblivion `knowledge` |
| 触发 | 订阅 DSH `session/event` 的 `turn/end` 事件（**没有** `session:complete`，实测 0 命中） |
| 逻辑 | 捕获问答 → 四层筛选 → 注入知识库 |
| 配置 | `semanticThreshold`（默认 0.85）、`autoInject`（默认 true） |

### 12.2 `@oblivion/perspective`（思维激荡）

| 项 | 内容 |
|---|---|
| 依赖 | DSH `llm`、`session` |
| 触发 | 主动触发（`turn/end`）+ 深度触发（连续 3 次同维度） |
| 输出 | 通过 DSH `session:thinking` 事件注入 UI |
| 配置 | `autoTriggerEnabled`、`maxAutoPerSession`（默认 3）、`maxStimulationsPerSession`（默认 5） |

### 12.3 `@oblivion/knowledge`（知识库）

| 项 | 内容 |
|---|---|
| 依赖 | DSH `session`、`tools` |
| 能力 | 知识库核心 + 文档解析（anydoc WASM）+ 向量检索 |
| 状态 | **这是 DSH 完全没有的能力**（PF-39） |

### 12.4 `@oblivion/graph-growth`（图谱生长）

| 项 | 内容 |
|---|---|
| 依赖 | `knowledge` |
| 逻辑 | 问答共现建边、权重累积、双链写回 MD |
| 权重规则 | 0.3 起步 / +0.05（cap 1.0）/ 30 天 ×0.95 衰减 |

### 12.5 `@oblivion/adapter-obsidian`（Obsidian 适配）

**核心原则**：适配层只做"翻译"，不做"模拟"。

| Obsidian API | Oblivion 服务 | 兼容级别 |
|---|---|---|
| `vault.read/write` | `ctx.knowledge.read/write` | ✅ 完全 |
| `workspace.getActiveFile` | `ctx.ui.activeDocument` | ✅ 完全 |
| `addCommand` / `addRibbonIcon` | `ctx.command` / `ctx.ui.ribbonIcon` | ✅ 完全 |
| `metadataCache` | — | ❌ 明确报错 |
| `app.plugins`（插件间调用） | — | ❌ 明确报错 |

### 12.6 `@oblivion/feedback`（反馈画像）

| 项 | 内容 |
|---|---|
| 依赖 | DSH `session` |
| 评价入口 | 每个问答后 👍 / 👎 / ⏺ |
| 不评价即中性 | 中性信号记录但不触发微调 |
| 触发条件 | 累积 ≥3 条同类型评价 → 触发画像微调 |
| 保留期 | 90 天 + 定时清理 |

### 12.7 `@oblivion/content-creator`（内容创作）

| 项 | 内容 |
|---|---|
| 依赖 | DSH `llm` / `knowledge` |
| 能力 | 播客脚本 / 学习指南 / FAQ / 摘要 |
| 状态 | **默认不加载**（Profile 中显式声明才启用） |

### 12.8 `@oblivion/brand`（品牌槽位）

见 §5.9 与 §9.6。**这是当前唯一已实现的插件**（PF-43）。

**已实现的完整能力**（v4.1 补，2026-10-04）：

| 能力 | 说明 |
|---|---|
| 三槽位品牌接管 | `sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark` |
| 品牌名可自定义 | 设置面板内编辑，持久化到 `localStorage` |
| 品牌图形可替换 | 支持上传图片（多格式），自动缩到 256px 边、限 512 KB |
| **可完全关闭接管** | 关闭后 dispose 本插件注册，官方鲸鱼外观**立即恢复**（§9.6.1） |
| 侧栏嵌入面板 | 把「可嵌入提供方」挂到侧栏「插件」下方，可多选，顺序从 `order: 5` 起递增 |
| 面板居中开关 | 进入侧栏后的界面观感与设置页对齐 |
| **直接重启 DSH** | 设置页一键重启（含游离 helper 与 WMI 派生的重新拉起） |

### 12.9 业务配置目录

> **Cordis 配置（`cordis.patch.yml`）与业务配置（`config/oblivion/*.yaml`）分离。**

```
config/oblivion/                  # 业务配置（独立于 Cordis）
├── md_rules.yaml                 # MD 分类规则
├── qa_rules.yaml                 # 四层筛选规则（含 L3 无意义词表）
├── perspective_rules.yaml        # 思维激荡规则（含 auto_trigger 块）
├── graph_growth.yaml             # 图谱生长规则
└── feedback_rules.yaml           # 反馈画像配置
```

### 12.10 环境变量模板

```bash
# .env.oblivion.example
OBLIVION_ENABLED=true
OBLIVION_DOCS_DIR=./oblivion_docs
OBLIVION_MD_RULES=./config/oblivion/md_rules.yaml
OBLIVION_QA_RULES=./config/oblivion/qa_rules.yaml
OBLIVION_PERSPECTIVE_RULES=./config/oblivion/perspective_rules.yaml
OBLIVION_GRAPH_GROWTH_RULES=./config/oblivion/graph_growth.yaml
OBLIVION_FEEDBACK_ENABLED=true
OBLIVION_FEEDBACK_RETENTION_DAYS=90
OBLIVION_MAX_STIMULATIONS_PER_SESSION=5
```

### 12.11 初始化脚本

```bash
# scripts/init_oblivion.sh
#!/bin/bash
set -e

echo "🔧 初始化 Oblivion..."

# 1. 创建目录
mkdir -p oblivion_docs/{00_导入文件,01_问答沉淀,02_Wiki页面,03_创作产物,99_其他}
mkdir -p config/oblivion

# 2. 复制默认配置
cp config/oblivion/*.yaml.example config/oblivion/*.yaml 2>/dev/null || true

# 3. 初始化数据库
oblivion migrate --init

echo "✅ Oblivion 初始化完成！"
```

### 12.12 `oblivion_docs/` 目录结构

> ⚠️ **2026-10-06 裁定（DEC-029）**：**不再单开 `oblivion_docs/`** —— 直接写进既有知识库根
> `C:/Library/那些渐渐被遗忘`，内部目录结构（`00_导入文件/01_问答沉淀/02_Wiki页面/03_创作产物/99_其他/`）与下方一致。

```
oblivion_docs/
├── 00_导入文件/              # 用户手动上传的原始文档
├── 01_问答沉淀/              # 问答闭环新增的知识
├── 02_Wiki页面/              # Wiki 产物的只读导出
├── 03_创作产物/              # 内容创作产物
└── 99_其他/                  # 兜底目录
```

### 12.13 版本号的两条轴（v4.1 新增）

> **产品版本与插件版本是两条独立轴，不要混。**

| 轴 | 真源 | 递增器 | 记录位置 |
|---|---|---|---|
| **产品版本** | 根 `VERSION` | （待补，参考 `scripts/bump-version.mjs`） | `CHANGELOG.md`、`.memory/release/` |
| **插件版本** | `oblivion-brand/VERSION` | `npm run version:bump -- <patch\|minor\|major>` | 插件 `package.json`、设置面板标题、helper 日志 |

插件的版本同步机制沿用主仓 `bump-version` 的做法：**`VERSION` 单一真源 + 正则替换同步到
`package.json`**（不用 `JSON.parse` + `stringify`，那会把整个文件重排、产生与版本无关的巨大 diff）。
客户端拿不到 `package.json`，故由构建期经 esbuild `define` 注入。

> **⚠️ 当前缺口**：根 `VERSION`（产品轴）**尚无递增器** —— 主仓的 `bump-version.ps1` 会同步
> `packages/*/package.json`、`registry.json`、`oblivion-core/src/version.ts`，这些在本仓**都不存在**。
> 补一个根级 `scripts/bump-version.mjs` 是待办（§23 OPEN）。


## 13. 分层组合模型

### 13.1 核心思想

> **插件图不写在代码里，写在 YAML 里。** 代码只负责按层叠加、按 id 覆盖。

### 13.2 三条必须记住的语义

**① patch 替换整段 config，不是合并**

> A patch replaces the targeted row's whole `config` rather than merging into it.

**② 行顺序不携带加载语义**

> Row order carries no load semantics (activation is service-availability driven).

**③ 配置即代码：`!!js` 表达式**

```yaml
- id: sandbox-policy
  name: '@oblivion/sandbox-policy'
  config:
    mode: !!js process.env.OBLIVION_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()
```

**代价**：纯静态校验做不到。**Oblivion 的应对**：提供 `--dump-config` 作为可验证的事实源。

### 13.3 行的来源链

```
# == @oblivion/base
- id: skill
  name: '@oblivion/skill'
# == @oblivion/base, patched by @oblivion/web-app
- id: tool-skill
  name: '@oblivion/tool-skill'
  disabled: true
```


## 14. 安全模型

### 14.1 三个独立插件，不是一个开关

| 行 id | 包 | 职责 |
|---|---|---|
| `sandbox-local` | DSH `sandbox-local` | 沙箱执行后端 |
| `sandbox-policy` | DSH `sandbox-policy` | **决定沙箱档位** |
| `approval` | DSH `user-approval` | **决定是否弹窗** |
| `permission` | DSH `permission-presets` | 把两者绑成预设 |

**Oblivion 不重复实现这些安全能力**——它们由 DSH 宿主提供。

### 14.2 值得抄的四个设计

| # | 设计 | 说明 |
|---|---|---|
| 1 | **沙箱档位与审批策略是两条独立表达式** | 各自读同一环境变量，互不调用 |
| 2 | **`approval` 默认值是 `ask`** | **少权优先，降级必须显式声明** |
| 3 | **沙箱后端按平台互斥启用** | 新增平台只需加一行 `disabled` |
| 4 | **预设把二维空间压成一维档位** | 用户面对三个词，底层保持两轴独立 |

### 14.3 Web profile 的信任围栏

**DI 可解析性 + 四层网络机制是两个独立维度，缺一不可。**

| 层 | 机制 | 证据 |
|---|---|---|
| ① **绑定字面量白名单** | schema 只收 `127.0.0.1` / `0.0.0.0` | `dsh-host-webserver/lib/index.js:142` |
| ② **CLI 拒绝 `--host 0.0.0.0`** | CLI 层硬拒全接口（RCE 面） | `dsh-web-app/lib/startup.js:40` |
| ③ **trustedHosts + `--trusted-host`** | Host 头校验 | `startup.js:6` 旗标族 |
| ④ **`resolveLanTrust()` 防 DNS rebinding** | 绑 `0.0.0.0` 时自动收集本机全部 LAN IPv4 | `index.js:83`、`:173` |
| 补充：**canonical URL** | `DSH_WEB_URL` 环境变量 | `index.js:35` |

**⚠️ 注意**：默认是 `127.0.0.1` 而非"只能是"—— `0.0.0.0` 在 **schema 层合法**，被挡在 **CLI 层**。

## 15. Host / Agent 双平面

### 15.1 判据

> **一个被 preset 外部行读取的服务属于 Host plane；只被 agent 消费的才是 preset 行。**

### 15.2 结构

```
Host 平面（进程单例，web 层保留）
  session · llm · credentials · storage · subagent registry · api-* …

Agent 平面（按会话由 preset 挂载）
  tool-bash/pwsh · tool-fs · tool-fs-search · tool-jobs · skill-* ·
  tool-skill · command-goal · plan-mode · compaction-basic · agent-instructions …
```

### 15.3 关键提醒

**同一个包在两层有不同 disabled 语义**——"patch 替换整段"的直接后果：**不能指望继承，必须完整重述**。


## 16. 部署形态

### 16.1 一图对比

| | DSH Web | DSH Desktop |
|---|---|---|
| 载体 | npm 全局包 | Electron 安装包 |
| Node | 系统 Node | 内嵌 Node + pnpm |
| profile | `~/.dsh/profiles/web` | `~/.dsh/profiles/desktop` |
| 入口 | `dsh web` | `dsh-desktop` |
| 端口 | `127.0.0.1:3080` | 同 |
| **Oblivion** | **插件生态** | **插件生态** |

### 16.2 共享什么

```
              DSH Web                DSH Desktop
插件来源   ~/.dsh/profiles/web/    ~/.dsh/profiles/desktop/
                 node_modules/           node_modules/
                 └──────────┬──────────────┘
                            ▼
                DSH_HOME = ~/.dsh  （完全共享）
```

### 16.3 依赖解析：`resolveBundleDir`

**先锚定 dsh 自己的安装目录，再回退 profile。**

### 16.4 Module 解析拦截

Desktop 侧靠 `dsh-desktop-host/lib/index.js` 的 `registerHooks` 把 Node 的 ESM/CJS resolver 接管。

**可复用结论**：**拦截 resolver 比改代码可靠**。

### 16.5 更新时各发生什么

| | `dsh web` | Desktop |
|---|---|---|
| profile | **不动** | **不动** |
| Junction / 解析 | 路径寻址 → 下次启动自动生效 | asar 内路径稳定 |
| Node 版本 | 跟随系统 | 随包切换 |
| 回滚 | `npm i -g` 旧版本 | `dsh-runtime.json` 校验 |

### 16.6 入口约束

```
$ dsh --profile desktop --dump-config
error: profile "desktop" is managed exclusively by the Electron application
```

### 16.7 Desktop 独有组件

| 组件 | 位置 | 作用 |
|---|---|---|
| `dsh-desktop-host` | asar `dsh/node_modules/@deepseek-ai/` | Node-mode 宿主 |
| `lib/main.js` | asar 根 | 窗口、更新器、profile 定位 |
| `dsh-runtime.json` | asar `dsh/` | 逐文件 sha256 |
| `renderer/` | asar 根 | 仅欢迎页与更新弹窗 |


## 17. UI 设计系统

### 17.1 三层令牌架构

```
① obl-static-*   77 个   原始调色板，明暗主题完全相同
② obl-alias-*   107 个   语义别名 → 指向 static，按主题切换
③ obl-*         243 个   字体/圆角/阴影/焦点/渐变/组件专用
    obl-*         8 个   组件级（**③ 的子集，不是额外一层**）
```

### 17.2 用户可调的 UI 参数（**只有 2 个**）

```ts
export declare const THEME_PREFERENCES: readonly ['light', 'dark', 'system'];
export declare const FONT_SIZE_MIN = 10;
export declare const FONT_SIZE_MAX = 22;
export declare const DEFAULT_FONT_SIZE = 14;
export declare const DEFAULT_PREFERENCE: ThemePreference; // = "system"

export interface ThemeSettings {
  preference: ThemePreference;
  fontSize: number;
}
export declare const ThemeSettingsSchema: z<ThemeSettings>;
```

### 17.3 字号驱动排版

```css
body {
  --obl-content-font-delta: calc(var(--obl-content-font-size, 14px) - 14px);
}
--obl-font-markdown-h1-font-size: calc(21px + var(--obl-content-font-delta));
```

### 17.4 排版刻度（8 档）

| token | weight | size / line-height |
|---|---|---|
| `--obl-font-xxxs-11` | 400 / 500 | 11px / 14px |
| `--obl-font-xxs-12` | 400 / 500 | 12px / 18px |
| `--obl-font-xs-13` | 400 / 500 | 13px / 20px |
| `--obl-font-s-14` | 400 / 500 | 14px / 22px |
| `--obl-font-base-16` | 400 / 500 | 16px / 24px |
| `--obl-font-m-18` | 500 | 16px / 28px |
| `--obl-font-l-20` | 500 | 20px / 28px |
| `--obl-font-xl-24` | 600 | 24px / 32px |

### 17.5 焦点与平台差异

```css
:root {
  --obl-focus-ring-width: 2px;
}
html[data-input-modality='pointer'] body :focus-visible:not(:read-write) {
  --obl-focus-ring-color: transparent;
}
```

### 17.6 UI 插件清单

> **Oblivion 不重复实现 DSH 的 56 个 `ui-*` 包**，而是：
> - 使用 DSH 的 56 个 UI 包作为基础
> - `@oblivion/brand` 插件占用 3 个品牌槽位
> - 未来如需扩展 UI，写 `@oblivion/ui-*` 插件占用 DSH 的槽位

## 18. 实施路线图（v4.1 重构）

| 阶段 | 任务 | 产出 | 工时 |
|---|---|---|---|
| **Phase 0** | **DSH 宿主准备**：安装 pnpm + `pnpm install` + `pnpm build:lib`（PF-40 前提） | 可运行的 DSH 宿主 | 0.5 天 |
| **Phase 0.5** | **阶段实测**：反射 API / `openAt` / `!!js` / `ctx.slots` / Worker / Electron 协议 / 4 道锁 | 实测结论 + OPEN 关闭依据 | 0.5 天 |
| **Phase 1** | **`@oblivion/brand`**：写品牌插件占用 3 个槽位；验证 `DSH_CLIENT_BUILD_PROFILE=local` 或 profile patch | 品牌化生效，零 Fork | 1 天 |
| **Phase 2** | **`@oblivion/knowledge`**：知识库核心 + anydoc WASM + 向量检索 | **DSH 完全没有的能力** | 5 天 |
| **Phase 3** | **`@oblivion/qa-loop`**：问答闭环（四层筛选 + 注入） | **最小可用闭环** | 3 天 |
| **Phase 4** | **`@oblivion/perspective` + `@oblivion/feedback`** | 核心认知功能 | 3 天 |
| **Phase 5** | **`@oblivion/graph-growth`** | 增强功能 | 2 天 |
| **Phase 6** | **`@oblivion/content-creator`** | 内容创作 | 2 天 |
| **Phase 7** | **`@oblivion/adapter-obsidian`** | 插件生态扩展 | 2 天 |
| **Phase 8** | 发布工程学：三级版本 + 破坏性变更契约 + 迁移工具 | **可发布的插件生态** | 2 天 |
| **Phase 9** | 端到端测试 + 文档 | **可交付** | 2 天 |
| **合计** | | | **~23 天** |

**关键原则**：**Phase 3 完成后（约 9 天）**，应该有一个**能跑通"上传文档 → 问答 → 沉淀"的 DSH + Oblivion 插件组**。

### 18.1 已完成（v4.1，2026-10-04；**2026-10-06 补记**）

| 阶段 | 状态 | 证据 |
|---|---|---|
| Phase 1 `@oblivion/brand` | ✅ **已落地并装机** | PF-43；三槽位接管、品牌名/图形可配、可关闭接管、侧栏嵌入面板、一键重启 |
| 超出计划的能力 | ✅ 侧栏嵌入面板 + 面板居中 + 直接重启 DSH | §12.8 |
| **Phase 2~6（合并）** | ⚠️ **已并入 `@oblivion/core`**（0.1.2）：knowledge / qa-loop / perspective / feedback / graph / profile 六模块 | `oblivion-core`：契约 8/8、test 12/12、selfcheck 17/17；**向量检索 / anydoc / `md_rules.yaml` / `oblivion_docs/` 未做**；真实 Host 待重启验证 |
| **超出设计书的插件** | ✅ `@oblivion/vimc` 0.2.9（Vimium 式键盘导航 + 页面内查找） | 契约 6/6 + 真实按键计数 |
| **工程化（Phase 8 的一部分）** | ✅ pnpm workspace（依赖只存一份，`allowBuilds` 审批）；✅ DSH-COMPAT 三件套（`dsh.compat` 契约 + `tools/verify-dsh-compat.ps1` + 升级台账） | 根 `README.md`「构建与测试」；`.design/DSH-COMPAT.md` |
| 未做 | ❌ Phase 6 内容创作、Phase 7 Obsidian 适配、Phase 9 真机 e2e；详见 **§33.3** | — |

### 18.2 相对 v4.0 路线图的收敛

| 项 | v4.0 | v4.1 | 原因 |
|---|---|---|---|
| 插件数 | 26 个能力包 | **8 个插件** | 20 项基础能力由宿主提供，不再重造（§2.2 A 组） |
| 工时 | ~42 天 | **~23 天** | 同上；且 Phase 1 已提前完成 |
| 内置 UI | 57 组件 + 188 图标自建 | **复用宿主 56 个 `ui-*` 包** | 宿主已有完整 UI，自建等于重复劳动 |
| 内核 / 会话 / LLM | 自建 `oblivion-core` / `session` / `llm` | **全部用 DSH 宿主的** | v4.1 的核心决策：**不 Fork，只做插件** |

## 19. 风险登记（v4.1 修正）

| ID           | 风险                               | 影响                                       | 应对                                                                                                                              | 状态           |
| ------------ | ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| RISK-101     | Cordis 生态不成熟                  | 开发受阻                                   | 读 DSH 已打好类型的 Cordis 源码；**不需要 fork**                                                                                  | 已有解         |
| RISK-102     | Electron 体积                      | 下载成本                                   | DSH 三件套：自定义协议 + 运行时分离 + 增量更新                                                                                    | Open（有解）   |
| RISK-103     | 插件数量爆炸                       | 启动慢                                     | **⚠️ 前提纠正**：`immediately` 不存在。真机制：`disabled: !!js` + `openAt` 枚举 + preset 分层                                     | 前提纠正       |
| RISK-104     | TS 全栈性能瓶颈                    | 卡顿                                       | `node:worker_threads`；参考 `libreoffice-kit`；`setEnvironmentData`                                                               | Open（有模板） |
| RISK-105     | 插件版本兼容性                     | 生态碎片化                                 | **`~`（patch 级）而非 `^`**；`dependencies` 为空                                                                                  | 已验证         |
| RISK-106     | 图标多端渲染一致性                 | 品牌识别                                   | **图标 = 导出常量 + React 组件 + 槽位注入**                                                                                       | 方案升级       |
| RISK-107     | 双形态维护成本                     | 双链路                                     | 287 包 3005 文件 SHA256 一致                                                                                                      | 已证明（Low）  |
| RISK-108     | Desktop 体积膨胀                   | 下载成本                                   | `autoDownload = false` + `publisherName`                                                                                          | Open（有解）   |
| RISK-109     | 配置导出命令维护                   | 需随插件更新同步                           | 自动生成可行，但 **DSH 自己 exit=1**；**必须预留降级**                                                                            | 方向对+留退路  |
| RISK-110     | 双形态并发写入同一工作区           | 数据损坏                                   | SQLite WAL + 文件锁串行化                                                                                                         | Open           |
| RISK-111     | 破坏性变更被淹没                   | 升级后崩溃                                 | 强制契约：只在 rc.1「其他变更」                                                                                                   | Open           |
| RISK-112     | 持久化格式升级无迁移工具           | 数据丢失                                   | **第 1 版就带迁移工具**                                                                                                           | Open           |
| RISK-113     | 插件系统顺序错误                   | 用户觉得"功能被删"                         | 先砍动态 → 再补管理 UI → 最后补声明/校验/治理                                                                                     | Open           |
| RISK-114     | 镜像源不可用                       | 中国用户安装失败                           | 三级兜底：自动选源 → 手动选源 → 失败后改道                                                                                        | Open           |
| RISK-115     | 遥测与免责声明不同版               | 隐私透明化不完整                           | 同版本发布                                                                                                                        | Open           |
| RISK-116     | Electron 图形入口缺登录 shell 环境 | 工具路径和代理失效                         | 首版显式处理 PATH；远期菜单栏安装命令                                                                                             | Open           |
| RISK-117     | 知识回灌死循环                     | 无限循环                                   | `source_type: qa_loop` 豁免标记                                                                                                   | Open           |
| **RISK-120** | `.gitignore` 忽略 `/.github/`      | CI 静默失效                                | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-121** | `.gitignore` 忽略 `/.action/`      | manifest 标 required 却被忽略              | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-122** | Python 段 `lib/` 无锚点            | 连带忽略 `packages/<pkg>/lib/`             | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-123** | manifest 与实际目录不一致          | `src/` required 但不存在                   | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1） + 需持续回归           |
| **RISK-124** | `.gitattributes` 多 pattern 同行   | 6 行 `*.tgz is not a valid attribute name` | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-126** | DSH 品牌槽位被官方变更 | 品牌化失效 | 关注 DSH Release Notes；槽位是公共契约，变更频率低 | Open |
| **RISK-127** | DSH 服务名破坏性变更 | 插件失效 | 用 `~`（patch 级）依赖；关注 DSH 破坏性变更公告 | Open |
| **RISK-128** | `@oblivion/brand` 与官方品牌包冲突 | 品牌显示混乱 | 用 `DSH_CLIENT_BUILD_PROFILE=local` 或 profile patch 摘官方包 | Open |
| **RISK-129** | DSH 更新导致插件不兼容 | 用户升级后无法使用 | 每次 DSH 更新后跑插件回归测试；建立版本兼容矩阵 | Open |
| **RISK-130** | agent 身份声明改动影响模型行为 | 模型自称改变，可能影响行为 | `system-prompt:429` 单独决策，不轻易改 | Open |

## 20. 变更日志（v4.1 追加）

| 版本     | 日期           | 变更                                                                                                                                                   |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v3.0     | 2026-10-02     | 架构范式：Electron + Cordis 插件化                                                                                                                     |
| v3.1     | 2026-10-02     | OPEN-101~104 裁定 + 北极星图标定案 + 适配层设计                                                                                                        |
| v3.2     | 2026-10-02     | 新增功能总览 + `ctx` 概念说明                                                                                                                          |
| v3.3     | 2026-10-02     | 融合 DSH 特性：双部署形态、Host/Agent 双平面、配置导出、源码沉淀                                                                                       |
| v3.4     | 2026-10-02     | 新增双形态数据共享 + 验收标准                                                                                                                          |
| v3.5     | 2026-10-02     | RISK-101~109 实证校准；OPEN-105~110 全部裁定；新增 UI 设计系统                                                                                         |
| v3.6     | 2026-10-02     | 发布工程学融合；整合 v3.0~v3.6 全部裁决                                                                                                                |
| v3.7     | 2026-10-02     | 补回 v1-v2 的 9 项必补内容 + 29 条 AC（AC-009 拆 a/b，共 30 行） + 运维/方法论元内容                                                                                              |
| v3.8     | 2026-10-02     | 融合 DSH 部署形态完整对比 + Docker 硬限制 + 参考库结构                                                                                                 |
| v3.9     | 2026-10-02     | 融合 DSH 全部 6 篇参考文档 + README + INDEX                                                                                                            |
| **v4.0** | **2026-10-02** | **事实校准：A1 事实矛盾修正 + A2 主体标注 + B1/B2 证据升级 + C1/C2/C3 结构补全 + D1/D2 命名一致性；新增 PF-26~PF-35、DEC-013、OPEN-021、RISK-120~124** |
| **v4.0.1** | **2026-10-02** | **增量校准：并入 ERRATA-01~21（依赖名加 `@deepseek-ai/` scope、loader 移 devDependencies、`dependencies` 表述修正、telemetry 表达式取反、图标改径向光晕、AC-030/031、RISK-120~124 状态、§17.1 子项澄清、§17.4 改 8 档，以及 UI 三份的 4 条硬缺陷）** |
| **v4.0.3** | **2026-10-02** | **需求体系补全：新增 §21.0 需求定义（从 §21.1 的 AC 反推 REQ-001~023，填补 ERRATA-29 的体系缺口）；Docker 相关 6 处标注作废（ERRATA-33/34 确认）；右栏内容清单由 LAYOUT.MD 上移为 OPEN-111** |
| **v4.0.2** | **2026-10-02** | **内部一致性校准：并入 ERRATA-22~28、32（五/六层统一为六层、§18 补 Phase 0.5、`updaterCacheDirName` 拼写、§20 AC 计数、证据等级标注、插件名去 scope 统一、证据路径统一 `dsh-ref`、§9.1 插件数 26）** |
| **v4.0.4** | **2026-10-03** | **Web 交付通道裁定 + 内部矛盾修正：`§3.1` 图称 React UI「通过 IPC 与 Main Process 通信」，与 `§5.3`「主界面由 `oblivion-web-ui` 经本地 web 服务提供」冲突 → 改为双通道事实（HTTP `/api` unary + 单条 WS `/api/remote.mux`）；新增 DEC-014/015/016 与 ERRATA-48；`notes/04` 与 DSH `host-webserver` 头注释证明「桌面也走 web 服务、仅壳页用 IPC」** |
| **v4.0.5** | **2026-10-03** | **宿主服务接线审查：新增 §5.7 通道落地顺序（DEC-017：先 HTTP `/api` 单元 → 再唯一 WS mux，**不退回 SSE**）；并入 ERRATA-49/50（`SERVICE_NAME` 是死常量且文档承诺与事实不符；profile↔registry 不一致被测试白名单豁免）；新增 DEC-018~022（六类服务各定最小 provider 让 pending 归零、例外从测试挪进 registry 当数据、**停止按 DSH 粒度铺新包**、CSP 与上游一致降级但抄一行到静态响应、通道落地同批带 e2e）、OPEN-112（index 注入形状）、RISK-125（账本维护成本超过它防住的 bug）** |
| **v4.1** | **2026-10-04** | **宿主化范式修正**：明确 Oblivion = DSH 宿主 + `@oblivion/*` 插件生态；**废弃原 §9.1 的 26 包清单**，改为 DSH 宿主 + **8 个领域插件**；新增 §0.8 宿主化决策、§5.9 品牌化走槽位、§9.5 插件脚手架；**§18 Phase 0-9 全部重写**（工时从 42 天降至 **23 天**）；新增 PF-36~PF-42、RISK-126~RISK-130 |

## 21. 验收标准

### 21.0 需求定义（REQ 编号体系）

> **本节为 v4.0.3 新增（2026-10-02）**，用于填补 `ERRATA-29` 指出的体系缺口：
> 此前 `REQ-nnn` 在全文出现 37 次、**行首定义 0 处**，§21.1 的 32 行 AC 全部挂在**未定义**的需求号上，
> 追溯链是断的。本节从 §21.1 的 AC 描述**反推**需求语义，使 `REQ-nnn` 从「悬空引用」变为「可追溯定义」。
>
> **反推口径**：需求语句取自其关联 AC 的**断言对象**（AC 是「怎么验」，REQ 是「要什么」），
> 不引入 AC 之外的任何新要求。**关联 AC 为空的 5 个编号未被发明** —— 见文末说明。

| REQ | 需求（要什么） | 类别 | 关联 AC |
| --- | --- | --- | --- |
| **REQ-001** | 界面与标题完成品牌化；且项目骨架自身**结构可验证**（能力包与清单一一对应、结构契约不脱节） | 品牌 / 结构 | AC-001、AC-030、AC-031 |
| **REQ-002** | 上传的文档被解析并转换为 Markdown，落入 `00_导入文件/`；落盘成功率 > 99%，且不阻塞交互 | 导入 | AC-002、AC-018、AC-019、AC-026 |
| **REQ-003** | 按规则对 MD 分类；**未命中任何规则**的知识落入 `99_其他/`，且兜底比例 ≤ 20%（分类健康度） | 分类 | AC-003、AC-015 |
| **REQ-004** | 问答结果呈现完整的「问题 + 答案 + 引用」三元组 | 问答 | AC-004 |
| **REQ-005** | **四层筛选**：L1 精确去重（SHA256，< 10ms）、L2 语义去重（> 0.85）、L3 规则过滤、L4 价值评估（含留痕）；20 条标注样本准确率 > 90% | 筛选 | AC-005 ~ AC-008、AC-014 |
| **REQ-006** | 高价值问答注入知识库（`01_问答沉淀/`），落盘 MD 符合格式规范、互链使用 `[[slug]]` | 沉淀 | AC-009a、AC-009b |
| **REQ-007** | 对上游的定制侵入**仅限登记在册的 N 处** | 上游同步 | AC-010 |
| **REQ-008** | 能合并上游版本且构建通过 | 上游同步 | AC-011 |
| **REQ-009** | — **无 AC 关联**（见文末说明） | — | — |
| **REQ-010** | — **无 AC 关联**（见文末说明） | — | — |
| **REQ-011** | 4 项健康度告警均可触发 | 可观测 | AC-016 |
| **REQ-012** | 知识入库到 MD 落盘耗时 < 5 秒；L1 精确去重单次判定 < 10ms | 性能 | AC-012、AC-013 |
| **REQ-013** | 筛选与分类参数**全部来自 YAML 配置**，不硬编码 | 可配置 | AC-017 |
| **REQ-014** | 思维激荡：**可一键完全关闭**；支持主动触发与深度触发；延伸思考内容包含首版策略之一 | 认知 | AC-020、AC-021、AC-022、AC-026 |
| **REQ-015** | 图谱生长的权重规则可验证 | 图谱 | AC-024 |
| **REQ-016** | 档案治理三承诺可验证 | 画像 | AC-023 |
| **REQ-017** | — **无 AC 关联**（见文末说明） | — | — |
| **REQ-018** | — **无 AC 关联**（见文末说明） | — | — |
| **REQ-019** | 主观倾向档案**可查看、可重置** | 画像 | AC-023 |
| **REQ-020** | 小程序混合访问可验证 | 多端 | AC-025 |
| **REQ-021** | — **无 AC 关联**（见文末说明） | — | — |
| **REQ-022** | 桌面客户端基础验收（**候选**，尚未转正） | 桌面 | AC-027 |

**关于 5 个无 AC 关联的编号（REQ-009 / 010 / 017 / 018 / 021）**：

它们**在全文只出现在编号序列中，没有任何 AC 引用它们，也没有任何正文描述**。
本节**刻意不发明它们的内容** —— 按证据分级，它们属于 `Open`（见 `ERRATA-29`）。
处置建议：由作者确认这三个可能之一 —— ① 曾被规划但已废弃 → 标 `Superseded`；
② 遗漏了 AC → 补 AC；③ 编号跳号 → 注明「未使用」。


### 21.1 AC 验收表（四状态轴）

> ⚠️ **本表 AC-001~031（28 条）未随落地更新**：仍全部是 `Not started / Last checked 2026-10-02`。
> 实际状态以 **§33 现状对账与缺口（2026-10-06）** 为准；AC-032~035 已在表内更新为 ✅。
> 全表重写属独立修订（涉及 REQ-001~023 重新映射），且必须与 §9.1 插件清单同批修改。

> **四状态轴 + 证据 + 缺口**：Impl.（实现）/ Verif.（验证）/ Owner acceptance（验收）/ Evidence（证据）/ Gap·Blocker（缺口与阻塞项）/ Last checked（最后核对日）

| AC-ID      | 描述                                                                                                                                                              | 关联             | Impl.       | Verif.  | Owner acceptance | Evidence | Gap/Blocker | Last checked |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- | ------- | ---------------- | -------- | ----------- | ------------ |
| AC-001     | 界面与标题完成品牌化                                                                                                                                              | REQ-001          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-002     | 上传 1 份 PDF → `00_导入文件/` 出现 1 个 `.md`                                                                                                                    | REQ-002          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-003     | 不匹配任何规则的知识 → 落入 `99_其他/`                                                                                                                            | REQ-003          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-004     | 问答后可见完整「问题+答案+引用」三元组                                                                                                                            | REQ-004          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-005     | 完全相同的问答被精确去重丢弃                                                                                                                                      | REQ-005 L1       | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-006     | 语义相似（>0.85）问答被判定重复并丢弃                                                                                                                             | REQ-005 L2       | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-007     | L3 规则：答案 <5 字或仅含无意义词 → 丢弃                                                                                                                          | REQ-005 L3       | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-008     | 价值评估为纯规则时，命中低价值规则的不注入且留痕                                                                                                                  | REQ-005 L4       | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-009a    | 高价值问答注入知识库，`01_问答沉淀/` 新增的 `.md` 符合格式规范                                                                                                    | REQ-006          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-009b    | 问答沉淀 `.md` 的互链使用 `[[slug]]` 语法                                                                                                                         | REQ-006          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-010     | 定制侵入仅限登记在册的 N 处                                                                                                                                       | REQ-007          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-011     | 上游版本合并，构建通过                                                                                                                                            | REQ-008          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-012     | 知识入库到 MD 落盘耗时 < 5 秒                                                                                                                                     | REQ-012          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-013     | L1 精确去重单次判定耗时 < 10ms                                                                                                                                    | REQ-012          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-014     | 20 条人工标注样本跑 L1+L2，判定准确率 > 90%                                                                                                                       | REQ-005          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-015     | 分类健康度：落入 `99_其他/` 比例 ≤ 20%                                                                                                                            | REQ-003          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-016     | 4 项健康度告警均可触发                                                                                                                                            | REQ-011          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-017     | 筛选与分类参数全部来自 YAML 配置                                                                                                                                  | REQ-013          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-018     | MD 分类准确率 > 95%                                                                                                                                               | REQ-002/003      | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-019     | 文档落盘成功率 > 99%                                                                                                                                              | REQ-002          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-020     | 思维激荡功能可一键关闭                                                                                                                                            | REQ-014          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-021     | 主动触发 + 深度触发                                                                                                                                               | REQ-014          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-022     | 延伸思考内容包含首版策略之一                                                                                                                                      | REQ-014          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-023     | 档案治理三承诺可验证                                                                                                                                              | REQ-016, REQ-019 | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-024     | 图谱生长权重规则可验证                                                                                                                                            | REQ-015          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-025     | 小程序混合访问可验证                                                                                                                                              | REQ-020          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-026     | 后台任务异步非阻塞，首字延迟差异 < 5%                                                                                                                             | REQ-002, REQ-014 | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| AC-027     | 桌面客户端基础验收（候选）                                                                                                                                        | REQ-022          | Not started | Not run | Not requested    | -        | - | 2026-10-02 |
| **AC-030** | **结构基线可验证**：26 个能力包与 §9.1/§10 清单一一对应；`registry.json` 的 `pluginCount` 与实际目录数一致；`npm run typecheck` / `npm run lint` 通过 | REQ-001 | Not started | Not run | Not requested | - |
| **AC-031** | **结构契约不脱节**：结构契约声明的每个 `required` 模块都在磁盘上存在（RISK-123 回归检查） | REQ-001 | Not started | Not run | Not requested | - |
| **AC-032** | **品牌接管可开可关（v4.1）**：开启时侧栏品牌位与 Hero 品牌位渲染北极星；**关闭后官方鲸鱼外观立即恢复**（dispose 本插件注册即可，不重启、不改官方包） | REQ-001 | ✅ Implemented | ✅ Run | ✅ Passed | PF-43、§9.6.1 |
| **AC-033** | **品牌可自定义（v4.1）**：① 品牌名文字可改成任意文本（持久化，重启后保留）；② 可上传图片替换图形（多格式，超限自动缩放或拒绝）；③ 可一键恢复北极星默认 | REQ-001 | ✅ Implemented | ✅ Run | ✅ Passed | §12.8 |
| **AC-034** | **侧栏可嵌入面板（v4.1）**：① 自动发现「可嵌入提供方」并列出；② 可多选挂到侧栏「插件」下方；③ **不把 `@Remote` RPC 误判为提供方**（`officeToPdf` 反例）；④ 面板正文与设置页观感一致，可选居中 | REQ-001 | ✅ Implemented | ✅ Run | ✅ Passed | §9.6.2 第 7 条 |
| **AC-035** | **一键重启 DSH（v4.1）**：① 从设置页触发，应用**自动关闭并重新拉起**（无需手动）；② 全流程**不弹控制台窗口**；③ 失败时日志能定位到具体阶段（版本号 + 阶段行） | REQ-001 | ✅ Implemented | ✅ Run | ✅ Passed | §12.8 |

> ⚠️ **已知不一致（v4.1 登记）**：上表 `AC-030` / `AC-031` 仍写「**26 个能力包**与 §9.1/§10 一一对应」，
> 而 v4.1 已把插件清单收敛为 **8 个**（§9.1）。本表**尚未随 v4.1 重写** —— 涉及 `REQ-001~023` 的重新映射，
> 是一次独立修订，不在本次范围内。**改 §9.1 或本表时，两处必须同批修改**，否则追溯链再次断裂
> （这正是 §21.0 当初为修 `ERRATA-29` 才补的体系）。

## 23. 待决问题

| ID           | 问题                      | 裁定                                         |
| ------------ | ------------------------- | -------------------------------------------- |
| OPEN-105     | registry.json 托管        | **npm 内嵌**                                 |
| OPEN-106     | 插件安全沙箱策略          | **预设分档**（不做 fs 沙箱）                 |
| OPEN-107     | Obsidian 适配层测试集     | **3 tier**：core / standard / extended       |
| OPEN-108     | 图标动画场景              | **做，限定位**                               |
| OPEN-109     | Desktop 强制更新          | **全开 4 锁**                                |
| OPEN-110     | oblivion-ref 托管与频率   | **本地 git + skill，暂不上远端；升级后必跑** |
| **OPEN-022** | **包管理器统一为 npm 还是 pnpm** | ~~裁定：npm 为运行器（CI/构建）；`pnpm-workspace.yaml` 仅作目录契约~~ → ✅ **2026-10-06 改判：pnpm workspace 为唯一运行器**（依赖只存一份、`allowBuilds` 显式审批、`auto-install-peers=false`、`hoist=false`；见根 `README.md` §四·五 与 `.action/AGENTS.MD`《包管理器规范》） |
| **OPEN-023** | **是否迁移到 `@oblivion/` scope** | **裁定：暂不迁移**，发布公共 npm 前再整体迁 |
| **OPEN-024** | **lockfile 何时入库** | ~~关闭：v0.0.1 已提交 `package-lock.json`，CI 已恢复 `npm ci`~~ → ✅ **2026-10-06 改判**：工作区唯一 `pnpm-lock.yaml` 入库，`package-lock.json` 已删除 |
| **OPEN-111** | **Oblivion 右栏放什么**（tab 内容清单） | **未裁定** —— 由 `LAYOUT.MD` §12 `OPEN-LAYOUT-03` **上移**而来（2026-10-02）。<br>理由：`LAYOUT.MD` 只管「怎么摆」，已完整给出右栏的**扩展机制**（`sidebar.right.pane.tab` 按类型注册）；「放什么」是**产品决策**。<br>⚠️ 该裁定会反向影响 `RIGHTBAR_DEFAULT_RATIO = 0.45`（现为**暂定**）|
| **OPEN-113** | **产品版本轴缺递增器** | **未裁定（v4.1 新增）** —— 根 `VERSION` 是真源，但主仓 `bump-version.ps1` 的同步目标（`packages/*/package.json`、`registry.json`、`oblivion-core/src/version.ts`）**在本仓都不存在**。<br>**待定**：① 只同步根 `VERSION` + 自动补一行 `CHANGELOG.md`？② 还是让产品轴跟随插件轴一起递增？<br>**倾向**：方案 ① —— 两条轴独立（§12.13），产品轴管「整个仓库的对外版本」，插件轴管「单个插件包」。<br>**临时对策**：手改 `VERSION` + `CHANGELOG.md`，并在提交信息里注明。 |

## 24. 图例

| 前缀       | 含义             |
| ---------- | ---------------- |
| `REQ-nnn`  | 需求             |
| `DEC-nnn`  | 决策             |
| `AC-nnn`   | 验收标准         |
| `RISK-nnn` | 风险             |
| `OPEN-nnn` | 待决项           |
| `PF-nnn`   | 项目事实（证据） |

**验证等级标注**：

- ✅ **逐字取证**：读到源码/文件原文
- 🟡 **间接推断**：由结构推得，未逐行确认
- 🔴 **未取证**：提出但未验证（转 OPEN）

## 25. 核心业务机制

### 25.1 四层筛选细节

| 层              | 机制                   | 阈值/规则                                                 |
| --------------- | ---------------------- | --------------------------------------------------------- |
| **L1 精确去重** | SHA256 哈希比对        | 完全相同 → 丢弃；性能 <10ms                               |
| **L2 语义去重** | `hybrid-search` 相似度 | >0.85 → 判定重复                                          |
| **L3 规则过滤** | 基础规则               | 答案 <5 字 或 仅含无意义词 或 含"不知道" 或 纯寒暄 → 丢弃 |
| **L4 价值评估** | 首版纯规则             | 命中低价值规则 → 不注入 + 决策留痕                        |

### 25.2 问答沉淀 MD 格式规范

```markdown
---
title: '[问答标题]'
source: 'qa_loop'
created_at: '2026-10-02T10:30:00Z'
tags: ['tag1', 'tag2']
related_wiki: ['[[相关Wiki页面slug]]']
---

## 问题

[用户原始问题]

## 答案

[模型回答正文]

## 引用来源

- [文档A标题](引用链接或本地路径)

## 关联知识

- [[相关文档1]]

## 摘要

[LLM 生成的 1-2 句摘要]
```

### 25.3 MD 分类规则 YAML

> ⚠️ **2026-10-06 裁定（DEC-029）**：`base_dir` **不是** `./oblivion_docs`，而是所有者既有的知识库根
> **`C:/Library/那些渐渐被遗忘`**；分类规则与下表**逐条一致**（`01_问答沉淀/` 等），已在 `oblivion-core` v0.1.3 落地。
> 下表保留 YAML 形态的设计意图；实现的载体是 cordis config 的 `mdClassify`（而不是 YAML 文件）—— 见 §33.3 第 8 条。

```yaml
md_sync:
  base_dir: './oblivion_docs'
  classification_rules:
    - name: '导入文件'
      match: { source_type: 'upload' }
      path: '00_导入文件/'
    - name: '问答沉淀'
      match: { source_type: 'qa_loop' }
      path: '01_问答沉淀/'
    - name: 'Wiki页面'
      match: { source_type: 'wiki' }
      path: '02_Wiki页面/'
    - name: '创作产物'
      match: { source_type: 'content_creator' }
      path: '03_创作产物/'
    - name: '默认'
      match: {}
      path: '99_其他/'
```

### 25.4 思维激荡双模式触发闸门

| 模式         | 触发条件             | 闸门                                              |
| ------------ | -------------------- | ------------------------------------------------- |
| **主动触发** | 单次提问后           | `enabled` + 会话 ≤3 次 + 问题 ≥10 字 + 必须有引用 |
| **深度触发** | 连续 ≥3 次追问同维度 | 单会话总次数 ≤5                                   |

### 25.5 维度映射表

| 维度       | 判定关键词示例                    |
| ---------- | --------------------------------- |
| 技术可行性 | 方案、实现、性能、兼容、架构      |
| 长期维护性 | 维护、扩展、升级、债务、文档      |
| 用户体验   | 易用、交互、反馈、学习成本        |
| 业务价值   | 成本、收益、优先级、ROI、替代方案 |

**未识别语句不参与维度覆盖判定**。

### 25.6 图谱生长权重规则

| 项                   | 值                          |
| -------------------- | --------------------------- |
| 首次共现建边         | `weight = 0.3`              |
| 后续每次共现         | `+0.05`（cap 1.0）          |
| 30 天未更新          | `×0.95` 衰减                |
| 双链格式             | `[[目标文档标题]]` 追加文末 |
| 首版是否改 search.go | **否**                      |

### 25.7 反馈画像机制

| 项               | 内容                                |
| ---------------- | ----------------------------------- |
| **评价入口**     | 每个问答后 👍 / 👎 / ⏺              |
| **不评价即中性** | 中性信号记录但不触发微调            |
| **触发条件**     | 累积 ≥3 条同类型评价 → 触发画像微调 |
| **保留期**       | 90 天 + 定时清理                    |

### 25.8 档案治理三承诺

| 承诺              | 实现                                  |
| ----------------- | ------------------------------------- |
| ① 档案可查看/重置 | REQ-019 档案管理页                    |
| ② prompt 注入上限 | 最近 3 次标注样本 + top3 关键词       |
| ③ 随备份          | 档案 JSON 随 `~/.oblivion` 卷自动备份 |

### 25.9 内容创作能力

| 能力     | 参考实现              |
| -------- | --------------------- |
| 播客脚本 | notex                 |
| 学习指南 | notex                 |
| FAQ      | notex / 复用 auto_tag |
| 摘要     | notex                 |

### 25.10 事件总线设计（适配 Cordis）

> ⚠️ **2026-10-06 实测更正**：下表的 6 个事件名里，`session:thinking` / `knowledge:created` / `knowledge:updated` /
> `md:generated` / `feedback:collected` 在**真实 DSH 里 0 命中**（与 `session:complete` 同类错误：设计自造了宿主不存在的名字）。
> 它们只能作为**本插件自定义事件**（自己 `ctx.emit()` / 自己订阅），或者改用现有通道 ——
> `@oblivion/core` 0.1.2 走的是后者：**陪伴内容通过 `systemPrompt.section` 注入下一轮**，不发自定义事件。
> 唯一真实存在的是**订阅**方向：`session/event` 的 `turn/end`（§33.4 第 1、2 条）。

| 事件                 | 触发时机     | 载荷                                          | 真实存在？ |
| -------------------- | ------------ | --------------------------------------------- | --- |
| `turn/end`（原写 `session:complete`） | 一轮问答结束 | `{ sessionId, turn, question, answer, references }` | ✅ 宿主事件（`dsh-session`） |
| `session:thinking`   | 思维激荡生成 | `{ sessionId, perspective }`                  | ❌ 需插件自 emit（现状：不做） |
| `knowledge:created`  | 知识创建     | `{ knowledgeId, sourceType }`                 | ❌ 需插件自 emit（现状：不做） |
| `knowledge:updated`  | 知识更新     | `{ knowledgeId }`                             | ❌ 需插件自 emit（现状：不做） |
| `md:generated`       | MD 落盘      | `{ path, sourceType }`                        | ❌ 需插件自 emit（现状：不做） |
| `feedback:collected` | 评价收集     | `{ signal, knowledgeId }`                     | ❌ 需插件自 emit（现状：不做） |

### 25.11 知识注入通道

```typescript
await ctx.knowledge.inject({
  content: markdownContent,
  sourceType: 'qa_loop', // RISK-117 豁免标记
  metadata: { sessionId, tags },
});
```

### 25.12 知识源定义

| 来源         | 说明                       |
| ------------ | -------------------------- |
| 用户手动导入 | `00_导入文件/`             |
| 问答闭环沉淀 | `01_问答沉淀/`             |
| Wiki 页面    | `02_Wiki页面/`（只读导出） |
| 内容创作产物 | `03_创作产物/`             |

### 25.13 明确排除项（DEC-008）

| 项                     | 状态         |
| ---------------------- | ------------ |
| 反馈驱动的检索排序优化 | **Deferred** |

## 26. 运维与可观测性

### 26.1 运行信号

| 信号                                  | 触发条件             | 用途             |
| ------------------------------------- | -------------------- | ---------------- |
| `oblivion.md_sync.failed`             | 落盘异常             | 定位文档丢失     |
| `oblivion.qa_loop.dropped`            | 任一层丢弃           | 回溯筛选         |
| `oblivion.md_sync.consecutive_failed` | MD 连续 5 次失败     | 检查磁盘空间     |
| `oblivion.classifier.fallback_rate`   | `99_其他/` 占比 >20% | 提示优化分类规则 |
| `oblivion.kb.growth_stalled`          | 连续 7 天无新增      | 检查问答闭环     |
| `oblivion.perspective.rejected`       | 激荡忽略率 >80%      | 调整激发策略     |

### 26.2 Prometheus 指标命名

| 指标                                | 类型      |
| ----------------------------------- | --------- |
| `oblivion_qa_captured_total`        | Counter   |
| `oblivion_md_generated_total`       | Counter   |
| `oblivion_feedback_collected_total` | Counter   |
| `oblivion_agent_tool_calls_total`   | Counter   |
| `oblivion_md_sync_duration_seconds` | Histogram |

### 26.3 降级策略表

| 故障场景                | 降级行为               |
| ----------------------- | ---------------------- |
| 外部价值评估 API 不可用 | 降级为纯规则过滤       |
| 语义去重服务超时        | 跳过语义层，仅精确去重 |
| Neo4j 不可用            | 图谱生长降级           |
| MD 落盘失败             | 重试 + 错误日志        |

## 27. Git 工作流与追新策略

### 27.1 分支模型

```
upstream (DSH 官方仓库)
    │
    ▼ 定期合并
custom/oblivion (稳定分支)
    ▲
    │ 合并（功能完成时）
feature/xxx (功能开发分支)
```

### 27.2 标准操作流程

```bash
# 1. 检查工作区状态
git status --short --branch

# 2. 获取最新远程信息
git fetch upstream

# 3. 切换到并更新稳定的定制分支
git switch custom/oblivion
git pull --ff-only origin custom/oblivion

# 4. 创建功能分支
git switch -c feature/xxx

# 5. 开发、测试、提交
git add <相关文件>
git commit -m "✨ feat(module): 功能描述"

# 6. 合并前再次更新定制分支
git switch custom/oblivion
git pull --ff-only origin custom/oblivion

# 7. 合并功能分支（保留历史）
git merge --no-ff feature/xxx

# 8. 运行验证
pnpm test

# 9. 推送（需授权）
git push origin custom/oblivion

# 10. 清理本地分支
git branch -d feature/xxx
```

### 27.3 追新策略

| 官方发布类型 | 应对策略              | 预期工作量  |
| ------------ | --------------------- | ----------- |
| 小版本       | 直接 `git merge`      | 1-2 小时    |
| 中版本       | 先读 Release Notes    | 半天 - 1 天 |
| 大版本       | 先在 feature 分支试验 | 2-3 天      |

### 27.4 阶段 0.5 实测清单

| #   | 实测项                               | 目的                     |
| --- | ------------------------------------ | ------------------------ |
| ①   | Cordis 容器反射 API 可用性           | `--dump-config` 实现依据 |
| ②   | `openAt` 枚举行为验证                | 启动优化依据             |
| ③   | `disabled: !!js` 表达式求值          | 条件加载依据             |
| ④   | `ctx.slots` 槽位注入机制             | 图标/UI 扩展依据         |
| ⑤   | Worker Thread `setEnvironmentData`   | 文档解析性能依据         |
| ⑥   | Electron 自定义协议 + MessageChannel | 安全设计依据             |
| ⑦   | `app-update.yml` 4 道锁              | 强制更新依据             |

## 28. 变更控制

### 28.1 变更流程

1. 每条新输入判定为 delta 类型
2. 只更新受影响的章节；**不动未受影响章节，不静默改写历史理由**
3. 每次实质性变更递增版本号，并在 §20 变更日志留痕
4. 若新输入介于"补充"与"替换"之间，**同时保留两种解读并先问再动手**

### 28.2 版本递增规则

**设计书版本**（本文档的 `vX.Y[-baseline]`）：

| 版本变化 | 触发条件                         |
| -------- | -------------------------------- |
| v4.x     | 增量更新（补回、澄清、修正）     |
| v5.0     | 架构范式级改判（需用户显式批准） |

> v4.1 属于 **v4.x 增量**，但它是一次**范式修正**（宿主化）：按本表仍走 v4.x，
> 因为「Oblivion 是插件生态」这一结论在 v4.0 已隐含（§2.2 已列 A 组「宿主提供」），
> v4.1 只是把它**明确化并贯彻到底**（收敛插件数、取消自建内核）。真正的范式改判在 v3.0（Electron + Cordis 插件化）。

**产品与插件的版本轴**（§12.13 的规则在此登记，二者独立递增）：

| 轴 | 真源 | 递增命令 | 记录位置 | 递增器状态 |
|---|---|---|---|---|
| **产品版本** | 根 `VERSION` | （待补） | `CHANGELOG.md`、`.memory/release/` | ❌ **缺**（OPEN-113） |
| **插件版本** | `oblivion-brand/VERSION` | `npm run version:bump -- <patch\|minor\|major>` | 该插件 `package.json`、设置面板标题、helper 日志 | ✅ 已有 |

**递增级别与提交类型的映射**（两轴通用）：`fix/docs/chore → patch`；`feat → minor`；破坏性变更或首个正式版 → `major`；0.x 阶段视为不稳定。

**触发点**：每批改动完成验收并写入 changelog 后，执行改动的 agent **必须**运行对应轴的递增命令。
**真源判定顺序**：有 `VERSION` 用 `VERSION`；没有但有 `package.json.version` 则以其为源并补建 `VERSION` 镜像。

## 29. 升级参考工作流

### 29.1 设计前提

1. **每次升级，源码细节的变化是可机械定位的**
2. 但"文件变了"不等于"该重读"，需要**分类**
3. 而"该重读"也不等于"能抄"，需要**按主题重排**

### 29.2 四段流水线

```
① 采集 snapshot        ② diff             ③ 蒸馏 distill         ④ 引用 consume
```

### 29.3 采集产物（五类事实）

| 产物                      | 回答的问题                       |
| ------------------------- | -------------------------------- |
| `composition/*.patch.yml` | **组合关系**变了什么？           |
| `manifest.json`           | 新增/删除/升级了哪些包？         |
| `dump-config-web.yaml`    | 组装出来的**最终树**变了哪些行？ |
| `api/*.d.ts`              | 对外 **API 面**变了什么？        |
| `src/*.js`                | 具体**行为**怎么改的？           |

### 29.4 变更报告四分类

| 分节               | 含义                       |
| ------------------ | -------------------------- |
| Package inventory  | 新包 / 删包 / 包内版本跳变 |
| Composition graph  | 哪些 `.patch.yml` 变了     |
| Public API surface | 哪些 `.d.ts` 变了          |
| Implementation     | 哪些 `lib/*.js` 变了       |

### 29.5 完整操作序列

```powershell
# 1. 升级（参考架构）
npm i -g @deepseek-ai/dsh@latest        # 或让 Desktop 自更新

# 2. 采集 + 自动 diff
cd C:\Users\liveu\dev\dsh-ref
./tools/snapshot-dsh.ps1

# 3. 重建架构索引
./tools/index-dsh.ps1

# 4. 读报告，决定哪些笔记要更新
code .\changes-<old>-to-<new>.md

# 5. 更新受影响的 notes/，标注新版本号
# 6. 提交
git add -A && git commit -m "dsh <new>: snapshot + changes"
```

### 29.6 已知采集缺口

- `dump-config` 只覆盖 **web profile**
- 浏览器 bundle（`client*.js`，约 26 MB）**不采集**
- **⚠️ 已知例外**：**UI 令牌不经 `src/` 采集通道**，由 `tools/ui-tokens-*.ps1` 单独从 theme 包的浏览器 bundle 提取

## 30. 参考库结构

### 30.1 `dsh-ref/` 目录结构

```
dsh-ref/                        # 参考架构的实际名称（已存在）
├── INDEX.md                    最新版本的架构总览（自动生成，勿手改）
├── README.md                   结构说明 + 为什么 npm 快照即为可信源
├── notes/                      手写蒸馏笔记，按主题而非按包组织
│   ├── 01-composition-model.md
│   ├── 02-security-model.md
│   ├── 03-host-agent-plane.md
│   ├── 04-deployment-profiles.md
│   ├── 05-upgrade-reference-workflow.md
│   └── 06-ui-design-system.md
├── tools/
│   ├── snapshot-dsh.ps1        采集一个版本快照（幂等）
│   ├── index-dsh.ps1           从快照生成 INDEX.md
│   ├── changes-dsh.ps1         两快照之间生成 changes-*.md
│   └── ui-tokens-dsh.ps1       令牌提取器
└── versions/<version>/
    └── ...
```

### 30.2 为什么快照 npm 包就够了（主体标注）

> **下表为参考架构 DSH 的实测**（`@deepseek-ai/dsh@0.2.0-rc.2` vs Desktop 0.1.2）；**Oblivion 达到同等分发形态后需自行复测**。

|                            | 数量 | 说明                                         |
| -------------------------- | ---: | -------------------------------------------- |
| 逐字节相同                 | 3005 | 含全部核心 `cordis.patch.yml` 与启动器       |
| 仅 `package.json` 键序不同 |  244 | 构建工具产物，语义一致                       |
| 仅 CSS Modules 哈希不同    |   46 | 浏览器 bundle 的构建盐，行数一致             |
| 版本不同                   |    2 | `libreoffice-kit`：Desktop 0.1.2 / npm 0.1.5 |
| npm 侧缺失                 |    0 | —                                            |

**结论**：因此**对 DSH 而言** npm 安装即为可信源；**Oblivion 需在达到同等分发形态后自行复测**。

### 30.3 Skill 注册

```
~/.agents/skills/dsh-reference/     # 参考架构的实际 skill 名称
├── SKILL.md
└── ...
```

### 30.4 参考库采集基线

- DSH `0.2.0-rc.2`
- 287 个包 · 183 行组合树 · 14 个组合层 · 1967 个 `.d.ts` · 391 个实现文件
- 约 14 MB 文本

## 31. 方法论与元内容

### 31.1 YEAHZERO-Thought-Design 流程

| Stage   | 内容                                     |
| ------- | ---------------------------------------- |
| Stage 1 | 意图锚定（北极星、用户旅程、交付边界）   |
| Stage 2 | 证据清单（本地事实、上游核实、外部研究） |
| Stage 3 | 解决方案边界（能力分层、分类、边界地图） |
| Stage 4 | 决策记录（DEC 编号体系）                 |
| Stage 5 | 需求与验收（REQ / AC 编号体系）          |

### 31.2 决策记录（DEC 编号体系）

| DEC         | 决策                          | 状态                                 |
| ----------- | ----------------------------- | ------------------------------------ |
| DEC-001     | 事件总线订阅                  | Confirmed（适配 Cordis，见 §25.10）  |
| DEC-002     | 知识源定义                    | Confirmed（适配 Cordis，见 §25.12）  |
| DEC-003     | 知识注入通道                  | Confirmed（适配 Cordis，见 §25.11）  |
| DEC-004     | 分类规则引擎                  | Confirmed（YAML 驱动，见 §25.3）     |
| DEC-005     | "自学习"范围界定              | Confirmed（见 §0.2）                 |
| DEC-006     | 激荡输出注入方式              | Confirmed（`session:thinking` 事件） |
| DEC-007     | 档案存储与治理                | Confirmed（JSON + 三承诺，见 §25.8） |
| DEC-008     | 反馈驱动检索排序              | **Deferred**（阶段八重评）           |
| DEC-009     | 架构范式（Electron + Cordis） | Confirmed（v3.0 核心决策）           |
| DEC-010     | 双部署形态                    | Confirmed（CLI + Desktop 共享）      |
| DEC-011     | 图标实现方式                  | Confirmed（代码即资源 + 槽位注入）   |
| DEC-012     | 发布工程学                    | Confirmed（三级版本分层）            |
| **DEC-013** | **孤儿分支决策**              | **Confirmed（见 §0.4）**             |
| DEC-014     | Web 交付通道形状              | Confirmed（HTTP `/api` unary + 单条 WS `/api/remote.mux`；**UI 不使用 SSE**，见 §5.3/§5.7） |
| DEC-015     | webserver 的形态              | Confirmed（**宿主编**：`host`/`port`/`compression` 入 schema，占 fallback 席 + `register`/`registerUpgrade` 两席） |
| DEC-016     | UI 交付通道的唯一说法         | Confirmed（以 §5.3 为准；`§3.1` 图的 IPC 表述已删除，见 ERRATA-48） |
| DEC-017     | Web 通道落地顺序              | Confirmed（**先 HTTP `/api` 单元 RPC，再唯一 WS `/api/remote.mux`**；不退回 SSE，见 §5.7） —— 已写入 §5.7 |
| DEC-018     | 六类服务的 provider           | Confirmed（`knowledge` / `command` / `ui` / `llm` / `session` / `tools` **各定一个最小 provider**（内部可返 stub），让 `boot()` 的「等待依赖 13」归零） |
| DEC-019     | profile↔registry 的例外归属   | Confirmed（例外**从测试代码挪进 `registry.json` 当数据**；不允许把豁免写死在 `yaml-validity.test.mjs`） —— **已落实 2026-10-03** |
| DEC-020     | 包粒度                        | Confirmed（**停止按 DSH 粒度铺新包**；能力先做在 `oblivion-core` 内部，等某个能力真的需要独立发布再分包） —— **已落实 2026-10-03** |
| DEC-021     | CSP                           | Confirmed（与上游一致：**不做文档级 CSP**；但把静态/媒体响应那条 `default-src 'self'` 顺手加到 `static.ts`，不扩成安全专项） —— **已落实 2026-10-03** |
| DEC-022     | 通道落地的测试要求            | Confirmed（通道落地那一批**必须同批带端到端**，覆盖 upgrades 表「单 socket 单协议独占」这类只在单测里活着的不变量） |
| DEC-023 | web 默认端口 | Confirmed（**42081**）—— 与上游 DSH 的 `3080` **刻意区分**：DSH 默认 3080 是其生态事实标准，本项目同机共存时不应沿用；`引用/证据` 里的 3080 一律仍指上游 |
| **DEC-024** | **是否 Fork DSH** | **Confirmed：不 Fork**（2026-10-04，v4.1 核心决策）。Oblivion 只做 `@oblivion/*` 插件，宿主用上游 `@deepseek-ai/dsh`。**理由**：① 宿主已提供 20 项基础能力（§2.2 A 组），Fork 等于接下全部维护成本；② 品牌化有官方槽位（PF-36）；③ Fork 会在每次上游升级时产生不可控的 merge 冲突。<br>**推论**：自建内核 / `oblivion-core` / `session` / `llm` / `ui-*` 全部**取消**（§18.2） |
| **DEC-025** | **品牌接管的让位机制选哪条路** | **Confirmed：`priority` 遮蔽（路 C 修正后）**（2026-10-04）。实测 `ui-slots` 的 `single` 槽规则是「同 priority 重复注册抛错 / 不同 priority 遮蔽 / **lowest renders**」，故 `priority = -10` 稳定覆盖官方（默认 0）。<br>**并且**：关闭接管只需 **dispose 本插件注册**，官方那条立刻重新成为渲染者 —— 零侵入、不重启、不改官方包。<br>**修正**：§5.9 原判断「动态注册 priority 低于 shipped 条目、默认官方会赢」**是错的**（见 §9.6.1）。推荐顺序更新为 priority 遮蔽 > profile patch > 构建期摘除 |
| **DEC-026** | **插件如何给用户可见的版本凭据** | **Confirmed：日志每行 + 设置面板标题都带版本号**（2026-10-04）。<br>**理由（代价换来的）**：node 半边**只在应用启动时加载**，刷新页面不更新它。v4.1 开发中因此**连续误判两轮**（以为代码没生效，实为旧版仍在跑）。<br>**配套**：`VERSION` 单一真源 + `bump-version.mjs` 正则同步到 `package.json`；客户端由构建期 esbuild `define` 注入（§12.13） |
| **DEC-027** | **插件能否接管桌面图标** | **Confirmed：不能，且不做替身**（2026-10-04）。窗口/任务栏图标来自 **exe 的 PE 资源**，`resources/icon.png` 只喂 `setAboutPanelOptions`、`resources/tray.ico` 只喂托盘。**拒绝**改写官方安装目录内的资源（越界且升级即失效）。<br>**替代**：改快捷方式 `.lnk` 的 `IconLocation`（`tools/set-shortcut-icon.ps1`，支持 `-Restore`）——明确告知这是**壳层替代**，不是应用图标接管（RISK-129） |
| **DEC-028** | **`@oblivion/core` 的挂载策略** | **Confirmed：走热挂**（2026-10-06）。用户层 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 的 insert 行，**不声明 `dsh.bundle`** —— 改 config 落盘即装载、不必重启（Host 侧 JS 代码改动仍需重启 App 才重新导入）。<br>**代价**：换机器 / 重置 profile 会静默失效（正命中 `DSH-COMPAT.md` 的 **R1**）。<br>**缓解**：安装片段随包提交（`oblivion-core/cordis.patch.yml` + `oblivion-core/README.md` §9.1）；`pnpm run verify:dsh` 的 `mount profile.dependencies` 断言会在装载缺失时报 FAIL。详见 §33.6 |
| **DEC-029** | **知识库落盘位置与分类** | **Confirmed：写进既有知识库**（2026-10-06）。文档根 = **`C:/Library/那些渐渐被遗忘`**（**不再**单开 `oblivion_docs/`）；内部按编号目录分类：`01_问答沉淀/`（问答闭环）、`00_导入文件/`（文档导入）、`02_Wiki页面/`、`03_创作产物/`、`99_其他/`（兜底）。<br>**实现**：`config.mdRoot` + `config.mdClassify`（来源类型 → 子目录），已在 `oblivion-core` v0.1.3 落地。<br>**安全约束**：目标文件若不含 `oblivion:` 标记（= 用户自有笔记）则改写 `<topic>-oblivion.md`，**绝不覆盖**。详见 §33.6 |

### 31.3 变更日志 delta 类型

| 类型              | 说明     |
| ----------------- | -------- |
| addition          | 新增内容 |
| clarification     | 澄清说明 |
| correction        | 修正错误 |
| replacement       | 替换方案 |
| removal           | 移除内容 |
| rename            | 重命名   |
| scope change      | 范围变更 |
| acceptance change | 验收变更 |
| operational gap   | 运维缺口 |

## 32. 本版修订汇总（v3.9 → v4.0）

| #        | 修订项                                                        | 位置                         | 类型          |
| -------- | ------------------------------------------------------------- | ---------------------------- | ------------- |
| **A1**   | 事实矛盾：`§0.4 从零构建` → **新分支起点（不继承既有代码）**  | §0.4 + 基线声明 + 元信息表   | 🔴 必改       |
| **A2**   | SHA256 表主体标注：DSH 实测，Oblivion 需自测                  | §30.2                        | 🔴 必改       |
| **B1**   | 网络侧四层叠加围栏（原只写 1/3）                              | §14.3                        | 🟠 证据升级   |
| **B2**   | PF-19 扩写：schema 允许 / CLI 拒绝双层区分 + 行号             | §0.7 PF-19                   | 🟠 证据升级   |
| **B3**   | Docker 部署能力：从"保留"→**实证章节** + 两条路径             | （已移除）                        | 🟠 证据升级   |
| **C1**   | 五层模型补"⑤′ 项目层 patch"                                   | §13.2 + §11.1                | 🟡 结构补全   |
| **C2**   | 项目目录权威性声明 + alphα 模板 5 缺陷入风险登记              | §10                  | 🟡 结构补全   |
| **C3**   | 单机自用假设补"首版不承诺网络部署"                            | §0.5                         | 🟡 结构补全   |
| **D1**   | 命名一致性                                                    | §0.0 + §29.5 + §30.1 + §30.3 | ⚪ 命名一致性 |
| **D2**   | UI 令牌采集例外说明                                           | §29.6                        | ⚪ 命名一致性 |
| **附录** | PF-26~PF-35 新增；DEC-013；OPEN-021；RISK-120~124；AC-028/029 | 全文                         | ✅ 证据扩充   |

---

## 33. 现状对账与缺口（2026-10-06）

> **本节是「设计书 vs 落地」的唯一对账入口**。§21.1 的 AC 表（AC-001~031 共 28 条）**未随落地更新**，
> 仍全部是 `Not started / Last checked 2026-10-02` —— 实际状态以本节为准；AC-032~035（brand v4.1 特性）在 §21.1 里已是 ✅。

### 33.1 三个插件现状

| 插件 | 版本 | 形态 | 挂载 | 验收层级 |
| --- | --- | --- | --- | --- |
| `@oblivion/brand` | 0.1.0 | client | **bundle 层**（`dsh.bundle.patch` + `dsh.profile.bundles`） | 契约 10/10 + 目视（AC-032~035 ✅） |
| `@oblivion/vimc` | 0.2.9 | client | **bundle 层** | 契约 6/6 + 真实按键计数（RUNTIME_VERIFIED） |
| `@oblivion/core` | 0.1.3 | object（Host） | ✅ **热挂**（用户层 insert 行，落盘即装载，**不重启**；DEC-028） | 契约 8/8 + test 12/12 + selfcheck 19/19；**真实 Host 待重启验证** |

> `@oblivion/core` 把设计书的 Phase 2–6（knowledge / qa-loop / perspective / feedback / graph）**合并成一个包**，
> 理由与遗留项见 `HANDOFF.md` §六。它**按 DEC-028 保持热挂**（不声明 `dsh.bundle`，改参数落盘即生效），
> 代价正中 `DSH-COMPAT.md` 的 **R1**（挂用户层 → 换机器/重置 profile 即静默失效）——**已由所有者裁定接受**，
> 缓解措施随包提交（安装片段 + `verify:dsh` 的 mount 断言），见 §33.6 DEC-028。

### 33.2 已完成（相对设计书的映射）

| 设计书条目 | 落地 |
| --- | --- |
| Phase 1 / REQ-001 / AC-032~035 | `@oblivion/brand`：三槽位 + 面板嵌入 + 品牌可配 + 一键重启 |
| REQ-005 L1/L3/L4 / AC-005·AC-007·AC-008 | 四层筛选：SHA256 精确去重、L3 四条规则（<5 字 / 无意义词 / 开头「不知道」/ 纯寒暄）、L4 规则打分（阈值 0.30，实测标定） |
| REQ-005 L2 / AC-006（部分） | 语义去重为 **token Jaccard + 否定翻转启发式**（LLM 判定留注入点）——**不是**设计的向量检索 |
| REQ-004 / REQ-006（部分） | `turn/end` 捕获 → 条目 JSON + MD 落盘；**问答三元组**在条目 sources 里（无 UI 呈现） |
| REQ-014 / AC-020·021 | 思维激荡：一键关闭（`enablePerspective`）+ 主动/深度双通道（§25.4 闸门已按设计实现） |
| REQ-015 / AC-024 | 图谱权重：0.3 / +0.05 / cap 1.0 / 30 天 ×0.95 + 时钟保护（自检逐条断言） |
| REQ-016 / REQ-019 / AC-023（部分） | 档案：`profile.json` + `user_override` 优先 + `oblivion_profile` 工具可读可改；**无界面** |
| REQ-012 / AC-012·013（部分） | 自检测了阈值分布与时钟；**未固化**「入库→落盘 <5s」「L1 <10ms」的正式记录 |
| — | 超出设计书：`@oblivion/vimc`（Vimium 式键盘导航 + 页面内查找）、pnpm workspace、DSH-COMPAT 三件套 |

### 33.3 未完成清单（按建议优先级）

| # | 缺口 | 设计书出处 | 阻塞/代价 |
| --- | --- | --- | --- |
| 1 | **DSH 升级兼容台账缺 core 一行**（校验已覆盖：**8/8 PASS**，台账只记了 brand/vimc） | `DSH-COMPAT.md` §五 | 无（本节同批补） |
| 2 | **core 挂载策略不一致**（brand/vimc 走 bundle 层，core 走用户层插入行） | DSH-COMPAT R1 | 换机器即静默失效 vs bundle 层每次改要重启 |
| 3 | **KB 目录结构已裁定并对齐**：**根 = `C:/Library/那些渐渐被遗忘`**（既有知识库），**内部按 `01_问答沉淀/` 分类**（`00_导入文件/` `02_Wiki页面/` `03_创作产物/` `99_其他/` 兜底） | §25.3、§12.3、REQ-002/003/006 | ✅ **已落地**（`oblivion-core` v0.1.3：`mdRoot` + `mdClassify`；见 §33.5 ①、§33.6） |
| 4 | **MD 格式规范未落地**：无 YAML frontmatter（`title/source/created_at/tags/related_wiki`）、无「摘要」段、无 `[[slug]]` 互链 | §25.2、REQ-006、AC-009a/b | 需要 LLM 摘要能力（能力缺口） |
| 5 | **图谱双链写回未实现**（`graph/backlink.ts` 不存在） | §25.6、§12.4 | 小改动，可与 4 同批 |
| 6 | **文档导入与解析未实现**（PDF/Word → MD、anydoc WASM） | REQ-002、§12.3、D1 | 依赖选型 + **许可证登记** |
| 7 | **向量检索未实现** | F5/D2、AC-006 | 依赖选型 + **许可证登记** + 与 core 的 knowledge 模块划界 |
| 8 | **筛选/分类参数未走 YAML**（现状是 TS 默认值 + cordis config，分类已可配：`mdClassify`） | REQ-013、AC-017、`md_rules.yaml`/`qa_rules.yaml` | 分类规则**已可配**；阈值仍在 `config.ts`（cordis config 可覆盖） |
| 9 | **健康度告警 4 项未实现** | REQ-011、AC-016 | 需要可观测面（§26） |
| 10 | **20 条标注样本准确率 >90% 未做** | AC-014 | 需要标注集（人工） |
| 11 | **评价入口 UI 缺失**（👍/👎/⏺）—— 现只有 `oblivion_feedback` 工具 | §12.6、§25.7、REQ-019 | 需要 client 插件（object 插件无 UI） |
| 12 | **内容创作未做**（播客脚本/学习指南/FAQ/摘要） | Phase 6、G1、§25.9 | 设计书自注「默认不加载」「需先实测 notex REST API」 |
| 13 | **Obsidian 适配未做**，且服务存在性未对账 | Phase 7、J1、§12.5 | `ctx.knowledge` / `ctx.ui.ribbonIcon` 在真实 DSH **0 命中**（只有 `activeDocument` 命中）→ 先对账再开工 |
| 14 | **发布工程学剩余部分**：破坏性变更契约文档化、迁移工具 | Phase 8 | DSH-COMPAT 已实现「契约声明 + 校验 + 台账」，缺「写进设计书 + 迁移工具」 |
| 15 | **跨插件/真机 e2e 未做**（Phase 9） | Phase 9 | 各插件已独立 test/selfcheck |
| 16 | **根 `VERSION` 递增器未做** | OPEN-113、REQ-001 | 倾向方案 ①：只同步根 `VERSION` + CHANGELOG |
| 17 | **`oblivion_docs/` 目录结构** | §12.12 | ✅ **已被裁定取代**：不再单开 `oblivion_docs/`，直接写进既有知识库根（见 3 与 §33.5 ①） |
| 18 | **双部署 / Web 通道未落地**（§5.7 落地顺序、§5.8 HTTP `/api` 一元面） | DEC-017、§5 | 另见 `.design/web通道与webserver形态.md` |
| 19 | **预置 Profile / 条件加载 / 根配置重写未落地**（仓库 `profiles/` 为空） | §11.2·11.3·11.4 | 需要 profile 分发模型 |
| 20 | **Agent Presets 未落地** | §6.3 | 依赖 Host 平面能力 |

### 33.4 设计书自身失真（本版已更正 4 处，其余待裁定）

| # | 失真 | 处理 |
| --- | --- | --- |
| 1 | **`session:complete` 不存在**（Phase 3、§4.4、§12.1、§25.10 共 4 处） | ✅ **已改为 `turn/end`**（实测该事件在官方 287 个包里 0 命中） |
| 2 | **事件总线 6 个事件名**（`session:thinking` / `knowledge:created` / `knowledge:updated` / `md:generated` / `feedback:collected`）在真实 DSH **0 命中** —— 与 1 同类错误 | ⚠️ **§25.10 加注**：这些是**插件自定义事件**，宿主不会 emit，需要本插件自己 `ctx.emit()` 或改为 systemPrompt 注入（现状即后者） |
| 3 | **§12.5 的服务映射**（`ctx.knowledge.read/write`、`ctx.ui.ribbonIcon`、`ctx.command`）真实 DSH 0 命中 | ⚠️ 标注为「**待服务存在性对账**」，不得据此开工 |
| 4 | **§23 OPEN-022 / OPEN-024** 仍裁定「npm 为运行器 / lockfile 用 `package-lock.json`」 | ✅ **已被 2026-10-06 的 pnpm workspace 裁定取代**（`pnpm-lock.yaml` 入库、`allowBuilds` 审批、`auto-install-peers=false`） |
| 5 | **§21.1 AC 表 28 条未随落地更新** | ⚠️ 本节为对账入口；AC 表重写是一次独立修订 |
| 6 | **设计书 0 处提到 DSH-COMPAT 机制**（`dsh.compat` 契约 + `verify-dsh-compat.ps1` + 升级台账） | ⚠️ 它就是 Phase 8「破坏性变更契约」的落地物，**待纳入设计书**（见 33.5-⑤） |
| 7 | **§18.1「已完成」只记 Phase 1** | ✅ 已补记 Phase 2–6（并入 core）、vimc、pnpm workspace、DSH-COMPAT |

### 33.5 待所有者裁定（5 项）

| # | 待裁定 | 选项 |
| --- | --- | --- |
| ① | ~~**KB 目录结构以哪边为准**~~ | ✅ **已裁定（2026-10-06）**：根 = **`C:/Library/那些渐渐被遗忘`**（既有知识库），**内部按 `01_问答沉淀/` 分类**（`00_导入文件/02_Wiki页面/03_创作产物/99_其他`）。已落地 v0.1.3（`mdRoot` + `mdClassify`），见 §33.6 |
| ② | ~~**core 挂载策略**~~ | ✅ **已裁定（2026-10-06）**：**走热挂**（用户层 `cordis.patch.yml` 的 insert 行，落盘即装载、不重启）；**不声明 `dsh.bundle`**。代价：换机器/重置 profile 需重装 —— 安装片段已写进 `oblivion-core/cordis.patch.yml` 与 README §9.1，见 §33.6 |
| ③ | **Phase 2 与已有 knowledge 模块的划界** | (a) 并入式（向量检索/anydoc 作为 core 的可选子模块，`enableVector: false` 默认关）；(b) 拆分式（新包只做解析+检索，先设计服务接口） |
| ④ | **Phase 6/7 是否保留** | 保留（先补前置：notex 实测、服务存在性对账）／降级为 `Superseded` 并写明理由 |
| ⑤ | **DSH-COMPAT 是否升格为设计书正式机制**（§8 Phase 8 的「破坏性变更契约」） | 是（推荐：它已在运行，含 PASS 矩阵与证据 `文件:行`）／否（仅作运维台账） |

### 33.6 决策记录（2026-10-06）

| ID | 决策 | 内容与代价 |
| --- | --- | --- |
| **DEC-028** | **`@oblivion/core` 走热挂** | 用户层 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 的 insert 行；**不声明 `dsh.bundle`**。收益：改代码落盘即装卸载载（Host 侧代码改动仍需重启 App 才重新导入）。代价：换机器 / 重置 profile 会**静默失效**（DSH-COMPAT R1）→ 缓解：安装片段随包提交（`oblivion-core/cordis.patch.yml` + README §9.1），并由 `pnpm run verify:dsh` 的 `mount profile.dependencies` 断言兜底 |
| **DEC-029** | **知识库落盘位置与分类** | 文档根 = **`C:/Library/那些渐渐被遗忘`**（所有者既有知识库，不再单开 `oblivion_docs/`）；内部按编号目录分类：`01_问答沉淀/`（问答闭环）、`00_导入文件/`（文档导入）、`02_Wiki页面/`、`03_创作产物/`、`99_其他/`（兜底）。实现：`config.mdRoot` + `config.mdClassify`。**安全约束**：目标文件若不含 `oblivion:` 标记（= 用户自有笔记）则改写 `<topic>-oblivion.md`，绝不覆盖 |

---

_本文件由 YEAHZERO-Thought-Design 维护；2026-10-02 经用户显式批准转为 Baseline v4.0；2026-10-04 升级为 v4.1（DSH 宿主化决策版）；2026-10-06 补 §33 现状对账。_
