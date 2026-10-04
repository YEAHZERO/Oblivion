# Oblivion（遗忘）知识库系统 — 设计书

## v4.0-baseline（事实校准版 · 完整版）

> **✅ BASELINE / 基线声明**
> 本文档于 **2026-10-02** 由用户显式批准转为 **Baseline（v4.0）**，作为实施与验收的权威依据。
> v3.9 → v4.0 为**事实性矛盾修正 + 证据升级 + 结构补全 + 命名一致性校准**。
> 本轮修订依据：2026-10-02 当日对话的修订建议，对全文做了一次**"文档断言 vs 磁盘事实"的硬核对**。
> 此后的设计变更走变更控制（§28）：修订需留痕并递增 Baseline 版本（v4.1、v4.2…）。

| 字段       | 值                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 文档版本   | **v4.0.3-baseline（需求体系补全版）**                                                                                                    |
| 成熟度     | **`Baseline`**                                                                                                                     |
| 最近更新   | 2026-10-02（v4.0.3：新增 §21.0 需求定义补全 REQ 体系；Docker 相关 6 处标注作废；右栏内容清单上移为 OPEN-111。v4.0.2：并入 ERRATA-22~28、32 —— 五/六层计数统一、补 Phase 0.5、修 `updaterCacheDirName` 拼写、AC 计数、证据等级、插件名统一、`dsh-ref` 路径统一、插件数量 26） |
| 设计负责人 | 用户（单人多角色，Owner = Self-review）                                                                                            |
| 参考架构   | @deepseek-ai/dsh v0.2.0-rc.2（Cordis 插件系统）                                                                                    |
| 桌面框架   | **Electron**                                                                                                                       |
| 品牌图标   | **北极星（Polaris / North Star）图案**                                                                                             |
| 项目起点   | **新分支起点（不继承既有代码）**；已提交根提交 `e6289d525`（alpha-init 分支）                                                      |
| 证据基线   | `C:\Users\liveu\dev\dsh-ref\versions\0.2.0-rc.2\`（287 包 / 183 行组合树 / 14 组合层 / 1967 `.d.ts` / 391 实现文件 / ~14 MB 文本） |

## 0. 项目定位

### 0.0 命名约定

> **本文命名约定**：
>
> - `DSH` / `@deepseek-ai/*` / `dsh-ref` / `dsh-*` = **参考架构**（已存在，证据来源）
> - `Oblivion` / `@oblivion/*` / `oblivion-ref` = **本项目**（规划名，尚未创建）
> - §13~§17 中的 `@oblivion/*` 示例**沿用 DSH 同名结构**，仅作占位
> - 全文证据路径指向**真实存在的** `dsh-ref/`（`C:\Users\liveu\dev\dsh-ref`），非 `oblivion-ref/`

### 0.1 北极星

> **「Oblivion（遗忘）」是一个能自动沉淀问答为结构化文档、具备自学习能力的本地知识库系统。**

### 0.2 "自学习"的范围界定（DEC-005）

| 组件         | 作用                   | 需求条目          |
| ------------ | ---------------------- | ----------------- |
| 问答闭环     | 问答沉淀为新知识       | REQ-004 ~ REQ-006 |
| **思维激荡** | 在回答中主动提供新视角 | REQ-014           |
| **图谱生长** | 问答频次强化知识关联   | REQ-015           |

**明确不纳入**：检索排序优化（DEC-008，Deferred）。

### 0.3 架构愿景

> **Oblivion 不只是一个知识库应用，而是一个「可编程的认知运行环境」。**

用户可以通过 YAML 声明式地组合自己的 Oblivion：

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

### 0.4 代码起点（✅ 修正 A1）

> **新分支起点，不继承既有代码。**

**事实澄清**：

| 项             | 事实                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库           | `C:\Projects\Oblivion` 是 git 仓库                                                                                                     |
| origin         | `YEAHZERO/Oblivion`                                                                                                                    |
| weknora remote | `Tencent/WeKnora`                                                                                                                      |
| 分支           | 5 个：`main`（release: 0.1.1 Lite desktop）/ `feature/desktop-wails` / `feature/md-sync` / `feature/sync-md` / `feature/upstream-sync` |
| HEAD 树        | Go + Wails 知识引擎，3388 个已跟踪文件                                                                                                 |
| **关键发现**   | HEAD 里已有 `packages/dsh-weknora/` —— **一个现成的 DSH Cordis 插件**                                                                  |
| 新分支起点     | 新根提交 `e6289d525`（alpha-init 分支）                                                                                                |
| 原分支处理     | 5 个分支**完整保留、未做任何破坏**                                                                                                     |

**DEC-013（孤儿分支决策）**：

> **决策**：Oblivion v4.0 从**新根提交 `e6289d525`** 开始构建，原 5 分支完整保留。
> **理由**：新架构（Electron + Cordis）与原分支（Go + Wails）在技术栈和组织范式上完全不同，孤儿分支避免继承债务。
> **可复用成果**：原分支的 `packages/dsh-weknora/` 是现成的 DSH 插件先例，其 `test/e2e/run-in-dsh.mjs` 是**"插件在真 DSH 中跑通"的现成验证范式**——§实施路线图的插件体系应**引用而非重造**。

### 0.5 单机自用假设（OPEN-014 裁定 + 补 C3）

> **首版范围 = 单机自用。** 多租户/企业级特性全部 Deferred。
> **复评条件**：≥3 名独立用户或团队共用诉求时重开。
>
> **首版不承诺网络部署**：Docker 章节按 **headless / host 网络 / 仅回环** 三种形态给出，**`0.0.0.0` 公网暴露与反代 TLS 均列为 Deferred**，与 OPEN-014 同批复评。

### 0.6 证据基线

本设计书的所有技术决策均基于 `C:\Users\liveu\dev\dsh-ref\versions\0.2.0-rc.2\` 的**逐字取证**。

### 0.7 证据清单（PF 编号体系，PF-01~PF-35）

| 编号  | 事实                                                                                                                       | 验证等级                    | 影响                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------ |
| PF-01 | `dsh-ref/versions/0.2.0-rc.2/` 完整快照已建立                                                                              | ✅ 逐字取证                 | 所有技术决策可追溯       |
| PF-02 | `api/cordis/*.d.ts` 9 个类型定义文件                                                                                       | ✅ 逐字取证                 | RISK-101 应对依据        |
| PF-03 | `*reflect.d.ts`（8.3 KB）是反射 API                                                                                        | ✅ 逐字取证                 | `--dump-config` 实现地基 |
| PF-04 | `dump-config-web.yaml` 完整组合树（183 行）                                                                                | ✅ 逐字取证                 | 架构事实来源             |
| PF-05 | `dump-config-schema-web.json`（850 KB）                                                                                    | ✅ 逐字取证                 | 配置 schema 自动生成     |
| PF-06 | `ui-tokens.md`（427 令牌逐值表）                                                                                           | ✅ 逐字取证                 | UI 设计系统依据          |
| PF-07 | `manifest.json`（287 包清单）                                                                                              | ✅ 逐字取证                 | 双形态一致性证明         |
| PF-08 | DSH 桌面版 = npm 版源码 + Electron 壳 + `dsh-desktop-host`                                                                 | ✅ 逐字取证                 | 双形态架构依据           |
| PF-09 | `desktop-runtime.json`（2.8 MB sha256 清单）                                                                               | ✅ 逐字取证                 | 增量更新依据             |
| PF-10 | `app-update.yml`（306 B）4 道锁                                                                                            | ✅ 逐字取证                 | 供应链安全依据           |
| PF-11 | `immediately` 标记不存在                                                                                                   | ✅ 逐字取证                 | RISK-103 前提纠正        |
| PF-12 | `openAt` 枚举是真正的延迟激活机制                                                                                          | ✅ 逐字取证                 | 启动优化依据             |
| PF-13 | 287 包 3005 文件 SHA256 完全一致                                                                                           | ✅ 逐字取证（**DSH 主体**） | RISK-107 已证明          |
| PF-14 | 244 处差异仅 package.json 键序                                                                                             | ✅ 逐字取证（**DSH 主体**） | RISK-107 已证明          |
| PF-15 | 唯一真差异：libreoffice-kit 版本号（0.1.2 vs 0.1.5）                                                                       | ✅ 逐字取证（**DSH 主体**） | RISK-107 已证明          |
| PF-16 | `setEnvironmentData` 是 Worker 上下文传递的统一做法                                                                        | ✅ 逐字取证                 | RISK-104 依据            |
| PF-17 | 破坏性变更只在 rc.1「其他变更」章节                                                                                        | ✅ 逐字取证                 | 发布工程学依据           |
| PF-18 | `resolveBundleDir()` 先锚定 install，再回退 profile                                                                        | ✅ 逐字取证                 | 双形态共享机制           |
| PF-19 | `--host 0.0.0.0` 被 CLI 显式拒绝，但 schema 层允许                                                                         | ✅ 逐字取证                 | RISK-118 依据            |
| PF-20 | `--profile desktop` 被 CLI 显式拒绝                                                                                        | ✅ 逐字取证                 | 入口白名单               |
| PF-21 | `dump-config-schema` 退出码 1（3 处 Loader tree carrier）                                                                  | ✅ 逐字取证                 | RISK-109 实证            |
| PF-22 | web 层禁用 22 行（Host/Agent 平面边界）                                                                                    | ✅ 逐字取证                 | 平面分离依据             |
| PF-23 | 四套 preset（standard/minimal/ptc/cordis）                                                                                 | ✅ 逐字取证                 | Preset 机制依据          |
| PF-24 | `alias` 层 107 个语义别名                                                                                                  | ✅ 逐字取证                 | UI 令牌架构依据          |
| PF-25 | 用户可调 UI 参数只有 2 个（preference + fontSize）                                                                         | ✅ 逐字取证                 | 极简设计依据             |
| PF-26 | 既有仓库含可复用 DSH 插件 `packages/dsh-weknora/`（`cordis.patch.yml` + `test/e2e/run-in-dsh.mjs`）及 `dsh-plugin.yml` CI  | ✅ 逐字取证                 | A1 / 实施路线图          |
| PF-27 | DSH_HOME 优先级：显式配置 > `$DSH_HOME` > `$HOME/.dsh`（`dsh-home-paths:15,50,74`）                                        | ✅ 逐字取证                 | Docker 持久化            |
| PF-28 | 唯一原生模块 `node-pty`（唯一 `binding.gyp`）                                                                              | ✅ 逐字取证                 | Docker 构建链            |
| PF-29 | `engines: null`；Desktop 内嵌 Node 24.18.1；装机 453 MB / 26616 文件                                                       | ✅ 逐字取证                 | 基础镜像选型             |
| PF-30 | 无官方 Dockerfile / compose（5 层深度扫描为空）                                                                            | ✅ 逐字取证                 | 自建镜像                 |
| PF-31 | `resolveLanTrust()` 绑 `0.0.0.0` 时自动收 LAN IPv4 进 `trustedHosts`                                                       | ✅ 逐字取证                 | §14.4 网络围栏第 ④ 层    |
| PF-32 | DSH 包形态：`main=lib/index.js`、`types=lib/types/index.d.ts`、`files=[lib/**]`、`exports` 含 `./src/*`；285/287 有 `lib/` | ✅ 逐字取证                 | Oblivion 包骨架          |
| PF-33 | 孤儿分支 `alpha-init` 根提交 `e6289d525`（173 文件）；原 5 分支完好                                                        | ✅ 逐字取证                 | A1 DEC 依据              |
| PF-34 | alphα 模板 5 个缺陷（见 §22.6）                                                                                            | ✅ 逐字取证                 | 风险登记                 |
| PF-35 | `docker-compose` 的 `context: ..` 时 `.dockerignore` 必须在仓库根，模板放在 `docker/` 不生效                               | ✅ 逐字取证                 | 部署章节                 |

## 1. 品牌与图标

### 1.1 品牌定案

| 项     | 值                        |
| ------ | ------------------------- |
| 英文名 | **Oblivion**              |
| 中文名 | **遗忘**                  |
| 图标   | **北极星（Polaris）图案** |
| 定位   | 可编程的认知运行环境      |

### 1.2 图标设计规范（DSH 实证校准）

**核心隐喻**：北极星是航海者的**导航锚点**——在知识的海洋中，Oblivion 是用户**认知方向的指引**。

**DSH 的图标实现方式（照搬）**：**不用图片文件，图标是导出常量 + React 组件**。

```typescript
// 图形本身是一个导出的字符串常量
export declare const POLARIS_VIEWBOX: { width: number; height: number };
export declare const POLARIS_PATH = 'M22.9168 1.43018C22.6713 ...';

/** Render the polaris logo.
 *  @param props.size - width in px (default 24; height keeps ratio)
 *  @returns the logo svg (aria-hidden; pair with the wordmark)
 */
export declare function PolarisLogo({ size, className }: IconProps): JSX.Element;
```

**三层结构**（照搬 DSH）：

| 层                                                                   | 形态          | 职责                                         |
| -------------------------------------------------------------------- | ------------- | -------------------------------------------- |
| `POLARIS_PATH`                                                       | SVG path 常量 | 几何唯一真源，供 mask / entrance effect 复用 |
| `PolarisLogo` / `OfficialBrandMark`                                  | React 组件    | 只处理渲染（size 保持比例、aria-hidden）     |
| `ctx.slots.register({name:"sidebar.brand.mark"}, OfficialBrandMark)` | 槽位注入      | 宿主面决定放哪、放多大                       |

**槽位注入示例**：

```typescript
ctx.slots.inject('sidebar.brand.mark', () =>
  ctx.slots.inject('sidebar.brand.name', function* () {
    yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark);
    yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName);
  })
);
```

**动画分工原则**（照搬 DSH）：

| 位置            | 形态                                  | 谁决定                       |
| --------------- | ------------------------------------- | ---------------------------- |
| 侧栏品牌位      | **静态** `OfficialBrandMark`          | 官方包 `slots.register`      |
| 对话页 hero     | **动画**（animated polaris fallback） | 保留声明包的回退，官方不注册 |
| 加载/重连指示器 | **动画**                              | 组件内自带                   |

**关键原则**：**动画属于宿主面，静态属于品牌位**。两者共享同一个 `POLARIS_PATH` 常量——**不要用不同素材源**。

**仍保留的部分**：`dsh-app-boot` 里有 `[".svg", "image/svg+xml"]` MIME 映射，说明文件形态仍存在（favicon / PWA manifest）。

**视觉规范**：

| 规范         | 值                                  |
| ------------ | ----------------------------------- |
| 源文件尺寸   | 1024×1024 px                        |
| 图标主体占比 | 70-80%                              |
| 导出尺寸     | macOS 512 / Windows 256 / Linux 256 |
| 对比度       | ≥ 4.5:1（深色背景）                 |
| 圆角         | 22%（macOS 标准圆角）               |

**组合方案**：

| 方案          | 内容                         | 场景                                |
| ------------- | ---------------------------- | ----------------------------------- |
| A（完整标识） | 北极星图标 + "OBLIVION" 文字 | 启动页、关于页                      |
| B（纯图形）   | 仅北极星图标                 | 桌面 dock、浏览器 favicon、托盘图标 |
| C（极简徽标） | 仅八芒星中心，无光晕         | 通知栏、状态栏、加载动画            |

**生成提示词（AI 绘图工具参考）**：

> Minimalist logo of a polar star (eight-pointed octagram) for an AI knowledge base called "Oblivion". Center is a small bright dot. Four faint diamond-shaped halos radiate outward. Color: deep space blue (#0A1628) background with starlight gold (#E8D5A3) and aurora cyan (#7EC8E3) accents. Style: modern, tech-oriented, calm and guiding. Square format, dark background, professional brand identity.

> **⚠️ 实现偏离（ERRATA-05）**：提示词里的「Four faint diamond-shaped halos」**未照做**。
> 菱形完整包住星体需半对角线 ≥ 半径 × √2；要同时满足「主体占比 70–80%」，星体须缩到约 52%，
> 违反本节占比规范。故改用**径向光晕**表达同一意图，详见 `assets/brand/brand-guidelines.md` §四。

### 1.3 图标在多端的应用

| 端            | 尺寸                             | 场景                       |
| ------------- | -------------------------------- | -------------------------- |
| Electron 窗口 | 256×256                          | 窗口图标、任务栏           |
| 系统托盘      | 32×32（macOS）/ 16×16（Windows） | 托盘常驻                   |
| 安装包        | 512×512                          | macOS .icns / Windows .ico |
| Web UI        | 128×128                          | 登录页、侧边栏             |
| favicon       | 32×32                            | 浏览器标签页               |

## 2. 功能总览

### 2.1 功能统计

| 子系统          | 数量          |
| --------------- | ------------- |
| A. 内核与架构   | 8             |
| B. LLM 适配     | 3             |
| C. 会话管理     | 2             |
| D. 知识库       | 3             |
| E. 工具集       | 3             |
| F. 核心认知功能 | 5             |
| G. 内容创作     | 1             |
| H. 界面         | 2             |
| I. 插件管理     | 1             |
| J. 插件适配层   | 2             |
| K. 品牌与部署   | 4             |
| L. 遥测         | 1             |
| M. 源码沉淀     | 1             |
| N. UI 设计系统  | 1             |
| O. 发布工程学   | 1             |
| **合计**        | **38 项功能** |

### 2.2 功能清单

#### A. 内核与架构（8 项）

| #   | 功能                 | 说明                                                                        |
| --- | -------------------- | --------------------------------------------------------------------------- |
| A1  | Cordis 依赖注入容器  | 插件注册、依赖解析、生命周期管理                                            |
| A2  | YAML Patch 组合引擎  | 6 层叠加（空根/Bundle/用户/Home/CLI/项目）                                    |
| A3  | 插件加载器           | 按声明顺序加载，支持运行时热插拔                                            |
| A4  | 副作用生命周期管理   | `ctx.effect()` 保证插件卸载时自动清理                                       |
| A5  | **双部署形态支持**   | CLI（npm）+ Desktop（Electron），共享同一套插件包                           |
| A6  | **配置导出命令**     | `oblivion --dump-config` / `--dump-config-schema` / `--dump-config-default` |
| A7  | **双形态共享根目录** | `~/.oblivion` 作为 OBLIVION_HOME，凭据/会话/工作区互通                      |
| A8  | **Profile 平级隔离** | web / desktop 配置各自独立，数据共享                                        |

#### B. LLM 适配（3 项）

| #   | 功能              | 说明                             |
| --- | ----------------- | -------------------------------- |
| B1  | DeepSeek 适配器   | 官方 API，支持流式响应           |
| B2  | OpenAI 兼容适配器 | 支持所有 OpenAI 格式的第三方服务 |
| B3  | Ollama 本地适配器 | 本地模型推理，无需联网           |

#### C. 会话管理（2 项）

| #   | 功能          | 说明                           |
| --- | ------------- | ------------------------------ |
| C1  | 会话核心服务  | 会话创建、消息管理、上下文维护 |
| C2  | SQLite 持久化 | 会话历史持久化到本地数据库     |

#### D. 知识库（3 项）

| #   | 功能           | 说明                                |
| --- | -------------- | ----------------------------------- |
| D1  | 知识库核心服务 | 知识的增删改查                      |
| D2  | SQLite 存储    | 知识的持久化                        |
| D3  | 向量检索       | 语义检索（sqlite-vec 或纯 JS 实现） |

#### E. 工具集（3 项）

| #   | 功能         | 说明                                          |
| --- | ------------ | --------------------------------------------- |
| E1  | 网络搜索工具 | 支持 SearXNG / DuckDuckGo / Bing 等           |
| E2  | 文件读写工具 | 本地文件系统操作                              |
| E3  | 文档解析工具 | anydoc WASM，支持 PDF/Word/Markdown/HTML/EPUB |

#### F. 核心认知功能（5 项）

| #   | 功能                     | 说明                                   |
| --- | ------------------------ | -------------------------------------- |
| F1  | **问答闭环**             | 捕获问答 → 四层筛选 → 注入知识库       |
| F2  | **思维激荡（主动触发）** | 单次提问后自动附加 1 个相关新视角      |
| F3  | **思维激荡（深度触发）** | 连续 ≥3 次追问同维度后生成 ≥3 候选视角 |
| F4  | **图谱生长**             | 问答共现建边、权重累积、双链写回 MD    |
| F5  | **反馈画像**             | 点赞/点踩/中性信号，累积后微调用户画像 |

#### G. 内容创作（1 项，默认不加载）

| #   | 功能     | 说明                                 |
| --- | -------- | ------------------------------------ |
| G1  | 内容创作 | 播客脚本 / 学习指南 / FAQ / 摘要生成 |

#### H. 界面（2 项）

| #   | 功能         | 说明                              |
| --- | ------------ | --------------------------------- |
| H1  | React Web UI | 问答界面、知识库管理、MD 沉淀查看 |
| H2  | 系统托盘     | 最小化到托盘、快速访问、退出      |

#### I. 插件管理（1 项）

| #   | 功能              | 说明                                            |
| --- | ----------------- | ----------------------------------------------- |
| I1  | 插件清单 + 安装器 | npm 内嵌清单 + `oblivion plugin add <pkg>` 命令 |

#### J. 插件适配层（2 项）

| #   | 功能                | 说明                                 |
| --- | ------------------- | ------------------------------------ |
| J1  | Obsidian 插件适配器 | 将 Obsidian API 映射为 Oblivion 服务 |
| J2  | DSH 插件适配器      | 将 DSH 命名空间映射到 Oblivion 服务  |

#### K. 品牌与部署（4 项）

| #   | 功能           | 说明                                                  |
| --- | -------------- | ----------------------------------------------------- |
| K1  | 北极星图标     | 八芒星，多端适配（path 常量 + React 组件 + 槽位注入） |
| K2  | Profile 系统   | minimal / standard / research 三套预置                |
| K3  | Electron 打包  | macOS / Windows / Linux 安装包                        |
| K4  | 源码沉淀流水线 | `dsh-ref/` 参考仓库 + 四段流水线                 |

#### L. 遥测（1 项，默认关闭）

| #   | 功能 | 说明                                 |
| --- | ---- | ------------------------------------ |
| L1  | 遥测 | 默认关闭；显式启用后上报匿名使用数据 |

#### M. 源码沉淀（1 项）

| #   | 功能         | 说明                                             |
| --- | ------------ | ------------------------------------------------ |
| M1  | 配置导出能力 | `--dump-config` 系列命令，随版本自动更新架构事实 |

#### N. UI 设计系统（1 项）

| #   | 功能         | 说明                                     |
| --- | ------------ | ---------------------------------------- |
| N1  | 三层令牌架构 | static / alias / 其余（427 令牌，11 组） |

#### O. 发布工程学（1 项）

| #   | 功能         | 说明                                       |
| --- | ------------ | ------------------------------------------ |
| O1  | 三级版本分层 | alpha（增量）/ rc（汇总）/ rc 补丁（热修） |

## 3. 总体架构

### 3.1 三层结构

```
┌─────────────────────────────────────────────────────────────────────┐
│                     L1: Electron 宿主层                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Electron Main Process                                          ││
│  │  • 窗口管理 / 系统托盘 / 原生菜单                              ││
│  │  • 启动 Cordis 内核                                             ││
│  │  • 加载 Profile 配置                                            ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Renderer Process（React UI）                                   ││
│  │  • 由 oblivion-web-ui 插件经本地 web 服务提供（§5.3）           ││
│  │  • 经 HTTP /api + WS /api/remote.mux 与内核通信                 ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L2: Cordis 插件内核层                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  oblivion-core（内核，~50KB）                                   ││
│  │  • Cordis DI 容器                                               ││
│  │  • YAML Patch 解析器                                            ││
│  │  • 插件生命周期管理                                             ││
│  │  • 5 层 Patch 叠加引擎                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  插件树（由 YAML 声明组合）                                     ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          ││
│  │  │ llm-*    │ │ qa-loop  │ │perspective│ │graph-*   │          ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     L3: 数据与外部资源层                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐│
│  │ SQLite       │  │ 向量存储     │  │  外部 API                ││
│  │ (会话/知识)  │  │ (sqlite-vec) │  │ (LLM/搜索)               ││
│  └──────────────┘  └──────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 启动链

```
oblivion (bin.js, commander 解析)
  └─ profile-boot.ts: runProfile()
       ├─ composeProfile()  ← 叠加 6 层 patch
       ├─ boot()            ← 挂载 Cordis 插件树
       ├─ provideCmdline()  ← 应用自己的参数
       └─ createProcessShutdown() ← SIGINT/SIGTERM 有界退出（5s 超时强制）
```

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

| 特性           | 说明                                                  | 示例                                                                               |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **服务访问**   | 通过属性名访问已注册的服务                            | `ctx.llm`、`ctx.knowledge`、`ctx.tools`                                            |
| **依赖声明**   | 通过 `inject` 声明需要哪些服务，Cordis 会等待它们就绪 | `export const inject = ['llm', 'knowledge']`                                       |
| **事件系统**   | `ctx.on()` 订阅、`ctx.emit()` 发布                    | `ctx.on('session:complete', handler)`                                              |
| **副作用管理** | `ctx.effect()` 注册清理函数，插件卸载时自动执行       | `ctx.effect(() => { const t = setInterval(...); return () => clearInterval(t); })` |
| **服务注册**   | 插件通过 `ctx.provide()` 对外暴露能力                 | `ctx.provide('knowledge', knowledgeService)`                                       |
| **子上下文**   | `ctx.isolate()` 创建隔离作用域                        | 用于多会话隔离                                                                     |
| **反射 API**   | `ctx.get(name, strict)` / `ctx.set(name, value)`      | **可绕过 inject 要求读服务**（RISK-109 地基）                                      |

### 4.4 反射 API（DSH 实证）

**`*reflect.d.ts`（8.3 KB）是反射 API 的核心**：

```typescript
// ctx.get(name, strict) 可"绕过 inject 要求读服务"
// strict = false 时，服务不存在返回 undefined 而非崩溃
const service = ctx.get('some-service', false);
if (service) {
  // 使用 service
}
```

这正是 **RISK-109（配置导出命令的维护）** 的地基——`--dump-config` 无需启动服务即可遍历容器。

### 4.5 具体到 `ctx.tools`

```typescript
export function apply(ctx: Context) {
  const tools = ctx.tools;

  tools.register({
    name: 'web_search',
    description: 'Search the web',
    handler: async (query) => {
      /* ... */
    },
  });
}
```

`ctx.tools` 不是"工具本身"，而是**工具注册中心**（Tool Registry）。

### 4.6 为什么这样设计

- **解耦**：插件 A 不需要知道插件 B 在哪、怎么调用
- **可替换**：`ctx.llm` 背后是 DeepSeek 还是 OpenAI，调用方不关心
- **可测试**：测试时注入 mock 的 `ctx.tools`，无需启动整个应用

**一句话**：`ctx` 是插件在 Cordis 世界里的一切——它是插件的"操作系统 API"。

## 5. 双部署形态

### 5.1 两种形态对比

| 维度         | Oblivion CLI（npm 形态）           | Oblivion Desktop（Electron 形态）                          |
| ------------ | ---------------------------------- | ---------------------------------------------------------- |
| **形态**     | 纯 CLI 启动器 + 进程内 profile     | Electron 壳 + 内嵌完整运行时                               |
| **代码载体** | npm 全局目录（所有插件包）         | asar 内 `oblivion/node_modules`（同包，字节相同）          |
| **运行时**   | 系统 PATH 上的 Node                | 内嵌 Node（锁版本）+ pnpm                                  |
| **体积**     | 较小                               | 较大（含 Electron + 内嵌运行时）                           |
| **Profile**  | `~/.oblivion/profiles/web/`        | `~/.oblivion/profiles/desktop/`                            |
| **Bundles**  | `oblivion-base → oblivion-web-app` | `oblivion-base → oblivion-web-app → oblivion-desktop-host` |
| **入口约束** | CLI 直接进入                       | **CLI 显式拒绝 `--profile desktop`**                       |
| **更新**     | `npm i -g`                         | `electron-updater` 下载完整安装包                          |
| **UI 来源**  | `oblivion-web-ui` 插件             | 同左（renderer 仅欢迎页）                                  |

### 5.2 两种形态共享什么

```
                    ┌── Oblivion CLI ──┐        ┌── Desktop ──┐
插件代码来源:        npm 全局目录              asar 内 oblivion/node_modules
                    (所有插件包)              (同包，字节相同)
                          └────────┬───────────────┘
                                   ▼
                      OBLIVION_HOME = ~/.oblivion (完全共享)
              .credentials.yaml · sessions/ · storages/
              profiles/desktop · profiles/web  ← 平级隔离
```

**DSH 实证数据**（RISK-107 已证明）：

- 共享包 287 个，3005 文件 SHA256 完全一致
- 244 处差异仅 package.json 键序
- 46 处差异仅 CSS-module hash salt
- 0 npm 侧缺失
- 唯一真差异：libreoffice-kit 版本号 0.1.2 vs 0.1.5

**装配链证据**：`resolveBundleDir()` 先锚定 oblivion install，所以 web dependencies 为空、desktop 有 0 个 profile node_modules —— 两条链路共用同一个插件源。

### 5.3 Desktop 独有部分

| 组件                    | 说明                                                 |
| ----------------------- | ---------------------------------------------------- |
| `oblivion-desktop-host` | Desktop 独有桥接包（`runProfile` + `registerHooks`） |
| Electron 壳             | `main.js`（窗口管理 + 自动更新 + profile 定位）      |
| `renderer/`             | 仅欢迎页 + 更新对话框——**业务 UI 不在 renderer**     |
| `resources/runtime/`    | 自带 Node + pnpm + 原生模块                          |
| `oblivion-runtime.json` | sha256 清单，用于增量更新校验                        |

**关键原则**：**renderer 不承载业务 UI**。主界面由 `oblivion-web-ui` 插件经本地 web 服务提供。

### 5.4 更新机制

|               | Oblivion CLI                 | Oblivion Desktop                           |
| ------------- | ---------------------------- | ------------------------------------------ |
| **升级动作**  | `npm i -g @oblivion/cli@x`   | `electron-updater` 下载完整安装包          |
| **Profile**   | 不动（路径寻址，零重建）     | 不动（同上）                               |
| **运行时**    | 跟随系统 Node                | 切换到新内嵌 Node                          |
| **凭据/会话** | 不动                         | 不动                                       |
| **风险点**    | 系统 Node 版本兼容由用户负责 | `oblivion-runtime.json` 校验不过则整体回滚 |

**路径寻址机制**：Junction 是路径寻址（目标不含版本号），profile 的 bundle 声明也不锁版本。这意味着原地 `npm i -g` 升级后，profile 零重建。

### 5.5 双形态数据共享

#### 5.5.1 共享根目录设计

```
~/.oblivion/                              # OBLIVION_HOME（两形态共享）
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
│   ├── workspace-<hash>/
│   │   ├── knowledge.db
│   │   └── vectors/
│   └── session_projcache/
├── data/
│   ├── oblivion.db
│   └── vectors/
├── logs/
│   └── startup-*.log                     # 0600 权限
└── plugins/
    └── node_modules/                     # Junction → npm 全局
```

**环境变量解析**：

```
OBLIVION_HOME 未设置 → 默认 ~/.oblivion
OBLIVION_HOME 已设置 → 使用指定路径（用于测试/多实例）
```

#### 5.5.2 凭据共享

**存储位置**：`~/.oblivion/.credentials.yaml`（权限 0600）

**共享机制**：

| 特性                 | 说明                                        |
| -------------------- | ------------------------------------------- |
| **两形态共用**       | CLI 与 Desktop 读取同一个凭据文件           |
| **逐请求解析**       | 每次 API 调用时从文件读取，不缓存在进程环境 |
| **永不写入环境变量** | 避免凭据泄漏到子进程                        |
| **权限保护**         | 文件权限 0600；启动日志顶部警告可能含凭据   |

#### 5.5.3 会话共享

**存储结构**：

```
sessions/
└── <session-id>/
    ├── meta.json
    └── messages.jsonl
```

**共享机制**：

| 特性             | 说明                                                        |
| ---------------- | ----------------------------------------------------------- |
| **两形态共用**   | 同一份会话文件被 CLI 与 Desktop 读取                        |
| **平级视图**     | 任一形态的会话列表都显示全部会话                            |
| **Profile 标记** | `meta.json` 的 `profile` 字段记录来源，但不阻止另一形态访问 |
| **冲突处理**     | last-write-wins（`updatedAt` 较晚者为准）                   |

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

| 特性           | 说明                                           |
| -------------- | ---------------------------------------------- |
| **两形态共用** | 同一工作区的知识库被两形态访问                 |
| **路径寻址**   | 工作区按**物理路径**哈希，与形态无关           |
| **增量写入**   | SQLite WAL 模式保证并发写入安全                |
| **互斥锁**     | 同一工作区同时被两形态写入时，通过文件锁串行化 |

#### 5.5.5 Profile 平级隔离

**共享的是数据（凭据/会话/工作区），隔离的是配置（Profile）**。

**入口约束**：

**CLI 显式拒绝 `--profile desktop`**：

```typescript
const RESERVED_PROFILES = ['desktop'];

export function runProfile(profileName: string) {
  if (RESERVED_PROFILES.includes(profileName)) {
    throw new Error(
      `Profile "${profileName}" is reserved for Electron. ` + `Please use the desktop application instead.`
    );
  }
  // ... 正常启动
}
```

**Desktop 必须经 `desktop-host` 进入**：

```typescript
export function bootDesktop() {
  const home = resolveOblivionHome();
  const profile = path.join(home, 'profiles', 'desktop');
  registerHooks();
  return runProfile('desktop');
}
```

### 5.6 Electron 安全设计（DSH 实证）

**DSH 用 `dsh-app://` 协议 + MessageChannel port，不开监听端口**：

| 机制                 | 实现                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **自定义协议**       | `event.origin !== 'dsh-app://app'` 直接丢弃                                                                                  |
| **进程边界**         | 嵌入页只通过 MessageChannel port 与 preload 通信，绝不直接拿 IPC                                                             |
| **一次性 port 移交** | `window.parent !== window` + `event.isTrusted` + 一次性 port 移交                                                            |
| **IPC 白名单**       | "Reject IPC outside the allowed Desktop document origins" + `session.setPermissionCheckHandler` 按 origin / isMainFrame 放行 |

**Oblivion 照搬这一模式**：

- 自定义协议：`oblivion-app://app`
- 强制更新 iframe 完全无法发起任意 IPC
- 不开监听端口

### 5.7 Web 通道的落地顺序（DEC-017，2026-10-03 审查）

**先补 HTTP `/api` 单元 RPC（覆盖面约 80%），再补唯一 WS `/api/remote.mux`。**

三条理由：

1. **不退回 SSE。** 已在 `src/webserver/index.ts` 的 upgrade 路径上调了 `fence.admit()`，
   Origin 同源校验也在 —— 这套正是为 WS 准备的。改用 SSE 等于把 upgrade 席位与围栏一起闲置。
   上游自己也只在 HMR（推图重建帧）与出站 LLM 调用用 SSE，UI 主通道是 mux。
2. **顺序不能反。** mux 的 `streamInboxBytes`（默认 262144）上行缓冲与双向流语义
   是第二阶段的事（`gateway/uplink-overflow` 是它的溢出码）；先做 mux 会把复杂度提前。
3. **当前最大的洞不是安全，是「有壳无信道」。** 实测：`register()` 生产环境只被调用 3 次
   （`/healthz` / `/metrics` / static fallback），`registerUpgrade()` 生产调用 **0** 次，
   UI 侧 `fetch` / WebSocket / EventSource 全为 **0**，`/api` 探测 404。
   三席位、围栏、profile 行、`--dump-config` 全齐，但**没有任何业务流量穿过它们**。

所以下一步的判据不是「又加了一个包」，而是：**一条 `/api` 业务路由 + UI 一次 `fetch` 打通，
让已有围栏真的拦到真实流量。**

> 与上游的一处对照：`registerUpgrade` 在 DSH 全仓**也只有 1 个调用方**
> （`dsh-api-gateway` → `/api/remote.mux`）。这层本就应该薄 —— 但**薄不等于零**。


### 5.8 HTTP `/api` 一元面的形状提案（R1，2026-10-03）

> 依据：上游 `dsh-api-gateway/lib/index.js:623-625` 的挂载点 ——
> `connection.rpc.intercept("/api", (endpoint) => this.claimsEndpoint(endpoint), (endpoint, payload, signal, peer) => this.dispatchRpc(...))`。
> **不是**一条路由一个功能，而是**单端点 + 端点名在载荷里**。

#### 与上游一致的三条

1. **路径只有 `/api` 一条**（一元请求/响应信封）；实时流将来走唯一的 `/api/remote.mux`（DEC-014/017）。
2. **信封**：请求 `{ id, endpoint, payload }` → 响应 `{ ok: true, value }` 或 `{ ok: false, error: { code, message } }`。
3. **强制 `content-type: application/json`，否则 415**（上游 `dsh-client-connection/lib/index.js:679`）。
   这一条**不只是规范洁癖**：它同时挡掉 `<form>` 跨站提交那类**不需要预检**的简单请求 —— 是围栏的第二道。

#### `claimsEndpoint` 的判定（上游 `:698-705`）

- `$events/result` 恒真（它由 `/api` 承载，见 §5.7 的混合路径）
- 否则必须**恰好 2 段**且命中注册表；未命中 → `404` 而不是静默 200

#### R1 的最小端点集（只做能立刻验证信道的）

| 端点 | 载荷 | 响应 |
| --- | --- | --- |
| `core/status` | `{}` | `{ profile, version, rows: { loaded, pending, skipped, failed }, fence: { trustedHosts, rejections }, web: { port, uptimeMs } }` |

#### UI 侧（R1 的验收动作）

外壳启动时**一次** `fetch('/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, endpoint: 'core/status', payload: {} }) })`，
把结果显示在侧栏底部（替换现在写死的「内核已连接」）。这一步的意义**不是功能**，而是：
**让已有的三席位与围栏第一次拦到真实业务流量。**

#### 测试口径（DEC-022：同批带 e2e）

| 层 | 用例 |
| --- | --- |
| 单元 | 信封形状 · 非 JSON → 415 · `claimsEndpoint`（1 段 / 3 段 / 未命中） · 未知端点 → 404 错误码 |
| 围栏 | 同一组 Host / Origin / **Sec-Fetch-Site** 用例对 `/api` 再跑一遍 |
| **端到端** | 起服务 → UI 发一次真实 `fetch` → 断言返回的 `profile` 与 `--dump-config` 一致（**这是 R1 的验收证据**）|


## 6. Host / Agent 双平面

### 6.1 平面分离原则

Web patch 把 base 里约 20 个工具行 `disabled: true`，改由 agent preset 按会话挂载。判据：

> **一个被 preset 外部行读取的服务属于 Host plane（如 registry 单例）；只被 agent 消费的才是 preset 行。**

### 6.2 Oblivion 的平面划分

| 平面            | 职责                   | 示例                                                                     |
| --------------- | ---------------------- | ------------------------------------------------------------------------ |
| **Host plane**  | 进程单例、跨会话服务   | `oblivion-session`、`oblivion-knowledge`、`oblivion-core`                |
| **Agent plane** | 按会话挂载的工具与能力 | `oblivion-tool-web-search`、`oblivion-tool-file`、`oblivion-perspective` |

### 6.3 Agent Presets

| Preset       | 工具集                           | 适用场景 |
| ------------ | -------------------------------- | -------- |
| **standard** | 完整工具集 + 思维激荡 + 图谱生长 | 日常使用 |
| **minimal**  | 仅核心问答工具                   | 快速响应 |
| **research** | 完整工具集 + 内容创作 + 深度分析 | 研究场景 |

**preset 分层示例**（照搬 DSH 的 `preset-standard @ L625`）：

```yaml
- id: preset-standard
  config:
    tools:
      - tool-bash
      - tool-fs
      - tool-fs-search
      - tool-skill
      - tool-todo
      - tool-goal
      - tool-web
      - tool-subagent
```

支持 `cordis:group` 隔离（`isolate: {planMode: true}` 等）。

## 7. 配置导出能力

### 7.1 命令

```bash
oblivion --dump-config              # 导出完整组合树
oblivion --dump-config-schema       # 导出配置 schema
oblivion --dump-config-default      # 导出默认配置
```

**核心价值**：**不启动即可导出完整组合树**。这是最有价值的架构事实，且随版本自动更新。

### 7.2 实现机制

通过 Cordis 容器的反射能力（`ctx.get(name, strict)`），遍历已注册插件、依赖关系、配置项，生成结构化输出。

**DSH 实证**：

- `--dump-config` → 46 KB 组合树（无运行服务也能跑）
- `--dump-config-schema` → 850 KB schema
- schema 生成注释：_"profiles.yaml merges sibling operations by id before this schema is built"_

### 7.3 已知坑与应对（DSH 实证）

**DSH 自己也没修好的 bug**：

```
dump-config-schema-web.json → exit=1
3 × "unrecognized Loader tree carrier; use cordis:group or cordis:include
     for native child collection"
```

**Oblivion 的应对（必须写进实现）**：

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
3. **diff 必须分类**（composition / api / src / inventory）而不是 git diff
4. **先用假版本端到端验证** changes 脚本

**托管建议**：本地 git + skill 注册，暂不上远端；升级后必跑。

## 9. 插件体系设计

### 9.1 插件清单（首版 26 个）

| 子系统       | 插件包                      | 职责                              | 依赖           |
| ------------ | --------------------------- | --------------------------------- | -------------- |
| **内核**     | `oblivion-core`             | Cordis 容器、Patch 解析、生命周期 | -              |
| **桌面宿主** | `oblivion-desktop-host`     | Desktop 独有桥接                  | core           |
| **LLM**      | `oblivion-llm-deepseek`     | DeepSeek 适配器                   | core           |
|              | `oblivion-llm-openai`       | OpenAI 兼容适配器                 | core           |
|              | `oblivion-llm-ollama`       | 本地 Ollama 适配器                | core           |
| **会话**     | `oblivion-session`          | 会话管理                          | core           |
|              | `oblivion-session-sqlite`   | SQLite 持久化                     | session        |
| **知识**     | `oblivion-knowledge`        | 知识库核心                        | core           |
|              | `oblivion-knowledge-sqlite` | SQLite 存储                       | knowledge      |
|              | `oblivion-knowledge-vector` | 向量检索                          | knowledge      |
| **工具**     | `oblivion-tool-web-search`  | 网络搜索                          | core           |
|              | `oblivion-tool-file`        | 文件读写                          | core           |
|              | `oblivion-tool-doc-parse`   | 文档解析（anydoc WASM）           | core           |
| **核心功能** | `oblivion-qa-loop`          | 问答闭环                          | knowledge, llm |
|              | `oblivion-perspective`      | 思维激荡                          | llm, session   |
|              | `oblivion-graph-growth`     | 图谱生长                          | knowledge      |
|              | `oblivion-feedback`         | 反馈画像                          | session        |
|              | `oblivion-content-creator`  | 内容创作                          | llm            |
| **界面**     | `oblivion-web-ui`           | React 前端                        | core           |
|              | `oblivion-tray`             | 系统托盘                          | core           |
| **插件管理** | `oblivion-plugin-manager`   | 清单 + 安装器                     | core           |
| **更新**     | `oblivion-updater`          | 自动更新                          | core           |
| **配置导出** | `oblivion-dump-config`      | `--dump-config` 系列命令          | core           |
| **适配层**   | `oblivion-adapter-obsidian` | Obsidian 插件适配                 | core           |
|              | `oblivion-adapter-dsh`      | DSH 插件适配                      | core           |
| **遥测**     | `oblivion-telemetry`        | 遥测（默认关闭）                  | core           |

### 9.2 插件契约（基于 Cordis）

**① 导出 `apply(ctx)` 函数**

```typescript
import type { Context } from '@deepseek-ai/cordis';

export const name = 'oblivion-qa-loop';
export const inject = ['llm', 'knowledge', 'session'];

export function apply(ctx: Context) {
  ctx.on('session:complete', async (session) => {
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
  "name": "oblivion-qa-loop",
  "version": "0.0.1",
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

**关键**（RISK-105 实证）：

- 使用 **`~`（patch 级）而非 `^`（minor 级）**
- 框架 minor 升级即视为不兼容，强制显式适配
- **跨包（插件间）依赖一律走 `peerDependencies`**；第三方库依赖（如 `zod`）正常写 `dependencies`
- **`cordis-plugin-loader` 属宿主职责**，插件只需 `devDependencies` 以便本地跑通

**③ `cordis.patch.yml` 声明依赖与配置**

```yaml
- insert:
    - id: oblivion-qa-loop
      name: 'oblivion-qa-loop'
      config:
        semanticThreshold: 0.85
        autoInject: true
```

### 9.3 插件的生命周期与热插拔

```typescript
export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      /* ... */
    }, 1000);
    return () => clearInterval(timer);
  });

  ctx.on('session:complete', handler);
}
```

### 9.4 启动优化三层（RISK-103 实证）

**⚠️ 前提纠正**：`immediately` 标记**不存在**——只出现在 2 处英文文档注释里，不是配置项。

**DSH 真正的启动优化是这 3 层**：

| 机制                 | 形态                        | 实例                                                                          |
| -------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| **① 条件禁用**       | `disabled: !!js <表达式>`   | `!ctx.get('profileContext')` / `process.platform === 'win32'`                 |
| **② 配置级延迟激活** | `openAt` 枚举（zod schema） | `session-query-sqlite: openAt: z.union([...])`，取值 `never` / `first-search` |
| **③ preset 分层**    | preset 块内重新列 `tool-*`  | `preset-standard @ L625` → L640 起重列                                        |

**Oblivion 的应对**：

- 用 `disabled: !!js` 做平台/形态条件（纯表达式求值，µs 级）
- 用 `openAt: <枚举>` 做首次使用前不 import（**真正省 import 时间的那层**）
- 用 preset 做能力分层

## 10. 项目目录结构

```
oblivion/
├── packages/                        # 所有插件（Monorepo）
│   ├── oblivion-core/
│   ├── oblivion-desktop-host/
│   ├── oblivion-adapter-obsidian/
│   ├── oblivion-adapter-dsh/
│   ├── oblivion-llm-deepseek/
│   ├── oblivion-llm-openai/
│   ├── oblivion-llm-ollama/
│   ├── oblivion-session/
│   ├── oblivion-session-sqlite/
│   ├── oblivion-knowledge/
│   ├── oblivion-knowledge-sqlite/
│   ├── oblivion-knowledge-vector/
│   ├── oblivion-tool-web-search/
│   ├── oblivion-tool-file/
│   ├── oblivion-tool-doc-parse/
│   ├── oblivion-qa-loop/
│   ├── oblivion-perspective/
│   ├── oblivion-graph-growth/
│   ├── oblivion-feedback/
│   ├── oblivion-content-creator/
│   ├── oblivion-web-ui/
│   ├── oblivion-tray/
│   ├── oblivion-plugin-manager/
│   ├── oblivion-updater/
│   ├── oblivion-dump-config/
│   └── oblivion-telemetry/
├── apps/
│   └── electron/                    # Electron 宿主
│       ├── src/
│       │   ├── main.ts
│       │   ├── preload.ts
│       │   └── ipc.ts
│       ├── renderer/               # 仅欢迎页 + 更新对话框
│       ├── resources/runtime/      # 内嵌 Node + pnpm
│       ├── package.json
│       └── electron-builder.yml
├── profiles/                        # 项目层 patch（随仓库）
│   ├── web/
│   │   └── cordis.patch.yml
│   ├── desktop/
│   │   └── cordis.patch.yml
│   └── docker/
│       └── cordis.patch.yml
├── assets/
│   └── brand/
│       ├── polaris-path.ts         # SVG path 常量
│       ├── PolarisLogo.tsx         # React 组件
│       ├── polaris.svg             # favicon 用
│       ├── polaris-1024.png
│       ├── polaris-512.png
│       ├── polaris-256.png
│       ├── polaris-128.png
│       ├── polaris-32.png
│       ├── polaris.icns
│       ├── polaris.ico
│       └── brand-guidelines.md
├── docker/                          # Docker 部署
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .dockerignore               # ⚠️ 必须在仓库根才生效（PF-35）
├── registry.json                    # 插件清单（npm 内嵌）
├── .alpha/                          # alphα 模板
│   ├── tools/
│   │   └── alpha-init.ps1
│   ├── sources/
│   │   └── alpha.*
│   └── manifest.json
├── docs/                            # 合并 .doc/ 与 .docs/
├── tests/                           # 合并 .test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── logs/                            # 原 log/
├── pnpm-workspace.yaml
└── README.md
```

**⚠️ 目录权威性声明**：

> **目录结构的权威真源是已提交的 `e6289d525` 与 `.alpha/manifest.json`；本章若与之不符，以提交为准。**

## 11. Profile 组合设计

### 11.1 六层 Patch 叠加（本版补"项目层"）

| 层                    | 位置                                                  | 入库?                            |
| --------------------- | ----------------------------------------------------- | -------------------------------- |
| ① 空根                | `cordis.yml = []`（每次启动重写为空）                 | —                                |
| ② Bundle 层           | `package.json` 的 `oblivion.profile.bundles` 顺序声明 | ✅ 随仓库                        |
| ③ 用户层              | `~/.oblivion/profiles/<name>/cordis.patch.yml`        | ❌ 机器级                        |
| ④ Home 层             | `~/.oblivion/cordis.patch.yml`（机器级，跨 profile）  | ❌ 机器级                        |
| ⑤ `--patch` 覆盖      | 命令行额外指定，可重复                                | —                                |
| **⑤′ 项目层（新增）** | **`<repo>/profiles/<name>/cordis.patch.yml`**         | **✅ 随仓库，经 `--patch` 叠加** |

**用法**：

```bash
oblivion --patch profiles/web/cordis.patch.yml --profile web --dump-config
```

### 11.2 预置 Profile

**minimal（纯问答）**：

```yaml
- insert:
    - id: core
      name: 'oblivion-core'
- insert:
    - id: llm
      name: 'oblivion-llm-deepseek'
      config:
        apiKey: '${env:DEEPSEEK_API_KEY}'
- insert:
    - id: session
      name: 'oblivion-session-sqlite'
- insert:
    - id: ui
      name: 'oblivion-web-ui'
```

**standard（完整认知陪伴）**：

```yaml
- insert:
    - id: core
      name: 'oblivion-core'
- insert:
    - id: llm
      name: 'oblivion-llm-deepseek'
- insert:
    - id: session
      name: 'oblivion-session-sqlite'
- insert:
    - id: knowledge
      name: 'oblivion-knowledge-sqlite'
- insert:
    - id: vector
      name: 'oblivion-knowledge-vector'
- insert:
    - id: qa
      name: 'oblivion-qa-loop'
      config:
        semanticThreshold: 0.85
- insert:
    - id: perspective
      name: 'oblivion-perspective'
      config:
        autoTriggerEnabled: true
- insert:
    - id: graph
      name: 'oblivion-graph-growth'
- insert:
    - id: feedback
      name: 'oblivion-feedback'
- insert:
    - id: ui
      name: 'oblivion-web-ui'
```

**desktop（Electron 形态）**：

```yaml
# 继承 standard + Desktop 独有
- insert:
    - id: desktop-host
      name: 'oblivion-desktop-host'
- insert:
    - id: tray
      name: 'oblivion-tray'
- insert:
    - id: updater
      name: 'oblivion-updater'
- insert:
    - id: ui-sidebar-browser
      name: 'oblivion-client-ui-sidebar-browser'
      disabled: !!js ctx.get('profileContext')?.name !== 'desktop'
```

### 11.3 条件加载（YAML 内嵌 JS 表达式）

```yaml
- insert:
    - id: telemetry
      name: 'oblivion-telemetry'
      disabled: !!js process.env.OBLIVION_TELEMETRY_ENABLED !== 'true'
```

**DSH 实证的条件表达式**：

```yaml
disabled: !!js !ctx.get('profileContext')
disabled: !!js process.platform === 'win32'
disabled: !!js process.platform !== 'win32'
disabled: !!js ctx.get('profileContext')?.name !== 'desktop'
```

### 11.4 根配置重写机制

**`cordis.yml` 每次启动都重写为空数组 `[]`**，防止 Loader 的写回把组合结果固化。

## 12. 核心功能插件规格

### 12.1 oblivion-qa-loop（问答闭环）

| 项   | 内容                                                        |
| ---- | ----------------------------------------------------------- |
| 依赖 | `llm`、`knowledge`、`session`                               |
| 触发 | 订阅 `session:complete` 事件                                |
| 逻辑 | 捕获问答 → 四层筛选 → 注入知识库                            |
| 配置 | `semanticThreshold`（默认 0.85）、`autoInject`（默认 true） |

### 12.2 oblivion-perspective（思维激荡）

| 项   | 内容                                                                                       |
| ---- | ------------------------------------------------------------------------------------------ |
| 依赖 | `llm`、`session`                                                                           |
| 触发 | 主动触发（`session:complete`）+ 深度触发（连续 3 次同维度）                                |
| 输出 | 通过 `session:thinking` 事件注入 UI                                                        |
| 配置 | `autoTriggerEnabled`、`maxAutoPerSession`（默认 3）、`maxStimulationsPerSession`（默认 5） |

### 12.3 oblivion-content-creator（内容创作）

| 项   | 内容                                       |
| ---- | ------------------------------------------ |
| 依赖 | `llm`、`knowledge`                         |
| 能力 | 播客脚本 / 学习指南 / FAQ / 摘要           |
| 状态 | **默认不加载**（Profile 中显式声明才启用） |

### 12.4 oblivion-tool-doc-parse（文档解析）

| 项          | 内容                                          |
| ----------- | --------------------------------------------- |
| 依赖        | 无                                            |
| 实现        | **anydoc WASM**（本地解析，无需 Python/Rust） |
| 支持格式    | PDF / Word / Markdown / HTML / EPUB           |
| Worker 封装 | 参考 `libreoffice-kit` 的 worker 模板         |

**DSH 实证的 Worker 用法**（RISK-104）：

```typescript
import { Worker } from 'node:worker_threads';
// 用 setEnvironmentData 传上下文，别用共享全局
```

### 12.5 oblivion-adapter-obsidian（Obsidian 插件适配）

**核心原则**：适配层只做"翻译"，不做"模拟"。

| Obsidian API                       | Oblivion 服务              | 兼容级别    |
| ---------------------------------- | -------------------------- | ----------- |
| `this.app.vault.read/write`        | `ctx.knowledge.read/write` | ✅ 完全     |
| `this.app.workspace.getActiveFile` | `ctx.ui.activeDocument`    | ✅ 完全     |
| `this.addCommand`                  | `ctx.command.register`     | ✅ 完全     |
| `this.addRibbonIcon`               | `ctx.ui.ribbonIcon`        | ✅ 完全     |
| `this.app.metadataCache`           | —                          | ❌ 明确报错 |
| `this.app.plugins`（插件间调用）   | —                          | ❌ 明确报错 |

**测试集三层**：

| tier         | 定义                                                      | 角色                |
| ------------ | --------------------------------------------------------- | ------------------- |
| **core**     | `tool-fs` `tool-fs-search` `tool-skill` `tool-bash`       | 必测集              |
| **standard** | core + `tool-todo` `tool-goal` `tool-web` `tool-subagent` | 默认开启            |
| **extended** | base 全量 18 个                                           | nightly，不阻塞发版 |

### 12.6 oblivion-adapter-dsh（DSH 插件适配）

| DSH 命名空间  | Oblivion 服务         |
| ------------- | --------------------- |
| `ctx.tools`   | `ctx.tools`（同名）   |
| `ctx.llm`     | `ctx.llm`（同名）     |
| `ctx.session` | `ctx.session`（同名） |
| `ctx.web`     | `ctx.web`（同名）     |

**关键**：适配层**只翻译接口，不翻译语义**。

### 12.7 oblivion-plugin-manager（插件清单 + 安装器）

**npm 内嵌**（DSH 实证）

**⚠️ DSH 没有 `registry.json` —— npm 就是 registry**。

**Oblivion 的做法**：

- 托管 `@oblivion/plugin-inventory` 包，内容即清单 → **零托管成本、版本天然随升级、离线可用**
- 只有当你需要第三方插件时才加 GitHub Pages
- **"独立域名"不必考虑**

### 12.8 oblivion-dump-config（配置导出）

| 命令                             | 输出        |
| -------------------------------- | ----------- |
| `oblivion --dump-config`         | 完整组合树  |
| `oblivion --dump-config-schema`  | 配置 schema |
| `oblivion --dump-config-default` | 默认配置    |

**必须实现降级**：schema 生成失败时降级到只导出 `dump-config`（DSH 自己 exit=1）。

### 12.9 oblivion-updater（自动更新）

**全开 4 道锁**（DSH 实证）

**DSH 的 `app-update.yml`（306 B，逐字）**：

```yaml
provider: generic
url: https://download.deepseek.com/dsh-desk/feeds/win-x64/
channel: nightly
updaterCacheDirName: '@deepseek-ai/dsh-desktop-updater'
publisherName:
  - CN=Hangzhou DeepSeek Artificial Intelligence Co., Ltd.,...
```

**4 道锁**：

| 锁                | 实现                                             | 位置                                 |
| ----------------- | ------------------------------------------------ | ------------------------------------ |
| **① origin 锁死** | `event.origin !== 'oblivion-app://app'` 直接丢弃 | `renderer/mandatory-update-frame.js` |
| **② 进程边界**    | 嵌入页只通过 MessageChannel port 与 preload 通信 | 同上                                 |
| **③ 发布者锁定**  | `publisherName` = authenticode 证书主体          | `app-update.yml`                     |
| **④ 不自动下载**  | `this.updater.autoDownload = false`              | `main.js` L7000                      |

**强制更新的对外 API 只有 3 个方法**：

```typescript
window.oblivionMandatoryUpdate = {
  status:   () => state ? Promise.resolve(state) : initial.promise,
  subscribe: (listener) => ...,
  action:   (action, version, revision) => ...
}
```

### 12.10 文档解析：anydoc WASM vs Python docreader

| 维度         | anydoc WASM         | Python docreader        |
| ------------ | ------------------- | ----------------------- |
| **形态**     | 前端库（WASM）      | 独立 gRPC 微服务        |
| **依赖**     | 无（纯浏览器/Node） | Python 3.10+ + 大量依赖 |
| **部署**     | 随前端打包          | 需独立进程/容器         |
| **桌面支持** | ✅ 完全支持         | ❌ 不支持               |
| **适用场景** | Electron 桌面端     | Docker 后端             |

**Oblivion 的定案**：**桌面端用 anydoc WASM**。

### 12.11 业务配置目录

> **Cordis 配置（`cordis.patch.yml`）与业务配置（`config/oblivion/*.yaml`）分离。**

```
config/oblivion/                  # 业务配置（独立于 Cordis）
├── md_rules.yaml                 # MD 分类规则
├── qa_rules.yaml                 # 四层筛选规则（含 L3 无意义词表）
├── perspective_rules.yaml        # 思维激荡规则（含 auto_trigger 块）
├── graph_growth.yaml             # 图谱生长规则
└── feedback_rules.yaml           # 反馈画像配置
```

### 12.12 环境变量模板

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

```bash
# .env.desktop.example
OBLIVION_DESKTOP_API_URL=http://<NAS_IP>:<APP_PORT>/api/v1
OBLIVION_DESKTOP_WS_URL=ws://<NAS_IP>:<APP_PORT>/ws
OBLIVION_DESKTOP_OFFLINE_CACHE=false
OBLIVION_DESKTOP_AUTO_START=false
```

### 12.13 初始化脚本

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

### 12.14 `oblivion_docs/` 目录结构

```
oblivion_docs/
├── 00_导入文件/              # 用户手动上传的原始文档
├── 01_问答沉淀/              # 问答闭环新增的知识
├── 02_Wiki页面/              # Wiki 产物的只读导出
├── 03_创作产物/              # 内容创作产物
└── 99_其他/                  # 兜底目录
```

## 13. 分层组合模型

### 13.1 核心思想

> **插件图不写在代码里，写在 YAML 里。** 代码只负责按层叠加、按 id 覆盖。

### 13.2 六层叠加（补"项目层"）

（见 §11.1 六层 Patch 叠加表）

### 13.3 三条必须记住的语义

**① patch 替换整段 config，不是合并**

> A patch replaces the targeted row's whole `config` rather than merging into it.

**Oblivion 的可复用结论**：需要按模式取不同值的行，不要放进共享层。

**② 行顺序不携带加载语义**

> Row order carries no load semantics (activation is service-availability driven).

**激活由服务可用性驱动，不由声明顺序驱动。**

**③ 配置即代码：`!!js` 表达式**

```yaml
- id: sandbox-policy
  name: '@oblivion/sandbox-policy'
  config:
    mode: !!js process.env.OBLIVION_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()
```

**代价**：纯静态校验做不到。**Oblivion 的应对**：提供 `--dump-config` 作为可验证的事实源。

### 13.4 行的来源链

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

| 行 id                           | 包                                                | 职责             |
| ------------------------------- | ------------------------------------------------- | ---------------- |
| `sandbox-local`                 | `oblivion-sandbox-local`                          | 沙箱执行后端     |
| `sandbox-policy`                | `oblivion-sandbox-policy`                         | **决定沙箱档位** |
| `approval`                      | `oblivion-user-approval`                          | **决定是否弹窗** |
| `permission`                    | `oblivion-permission-presets`                     | 把两者绑成预设   |
| `bash-sandbox` / `pwsh-sandbox` | `oblivion-bash-sandbox` / `oblivion-pwsh-sandbox` | 平台分派         |

### 14.2 原始配置（照搬结构）

```yaml
- id: sandbox-policy
  name: '@oblivion/sandbox-policy'
  config:
    mode: !!js process.env.OBLIVION_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()

- id: bash-sandbox
  name: '@oblivion/bash-sandbox'
  disabled: !!js process.platform === 'win32'
  config:
    timeoutMs: 60000
- id: pwsh-sandbox
  name: '@oblivion/pwsh-sandbox'
  disabled: !!js process.platform !== 'win32'

- id: approval
  name: '@oblivion/user-approval'
  config:
    policy: !!js >-
      (process.env.OBLIVION_PERMISSION_MODE ?? 'workspace-write') ===
      'danger-full-access' ? 'never' : 'ask'

- id: permission
  name: '@oblivion/permission-presets'
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: ask
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
```

### 14.3 值得抄的四个设计

| #   | 设计                                   | 说明                             |
| --- | -------------------------------------- | -------------------------------- |
| 1   | **沙箱档位与审批策略是两条独立表达式** | 各自读同一环境变量，互不调用     |
| 2   | **`approval` 默认值是 `ask`**          | **少权优先，降级必须显式声明**   |
| 3   | **沙箱后端按平台互斥启用**             | 新增平台只需加一行 `disabled`    |
| 4   | **预设把二维空间压成一维档位**         | 用户面对三个词，底层保持两轴独立 |

### 14.4 Web profile 的信任围栏（✅ 扩写）

**DI 可解析性 + 四层网络机制是两个独立维度，缺一不可。**

#### 维度 1：DI 可解析性（配置能否生效）

> **配置能否生效，取决于它能不能注入到特定服务。**

#### 维度 2：网络侧四层叠加围栏

| 层                                         | 机制                                                | 证据                                                                                                            |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| ① **绑定字面量白名单**                     | schema 只收 `127.0.0.1` / `0.0.0.0`                 | `dsh-host-webserver/lib/index.js:142`<br>`host: z.union([z.const("127.0.0.1"), z.const("0.0.0.0")]).required()` |
| ② **CLI 拒绝 `--host 0.0.0.0`**            | CLI 层硬拒全接口（RCE 面）                          | `dsh-web-app/lib/startup.js:40`                                                                                 |
| ③ **trustedHosts + `--trusted-host`**      | Host 头校验                                         | `startup.js:6` 旗标族；`web-app Config trustedHosts: z.array(String).default([])`                               |
| ④ **`resolveLanTrust()` 防 DNS rebinding** | 绑 `0.0.0.0` 时自动收集本机全部 LAN IPv4 进信任列表 | `index.js:83 resolveLanTrust(bindHost, extra)`、`:173 resolveLanTrust(ctx.webServer.host, config.trustedHosts)` |
| 补充：**canonical URL**                    | `DSH_WEB_URL` 环境变量                              | `index.js:35`                                                                                                   |

**⚠️ 注意**：默认是 `127.0.0.1` 而非"只能是"—— `0.0.0.0` 在 **schema 层合法**，被挡在 **CLI 层**。绕过 CLI 即自行承担该边界。

## 15. Host / Agent 双平面

### 15.1 判据

> **一个被 preset 外部行读取的服务属于 Host plane（如 registry 单例）；只被 agent 消费的才是 preset 行。**

### 15.2 结构

```
Host 平面（进程单例，web 层保留）
  session · llm · credentials · storage · subagent registry · api-* …

Agent 平面（按会话由 preset 挂载）
  tool-bash/pwsh · tool-fs · tool-fs-search · tool-jobs · skill-* ·
  tool-skill · command-goal · plan-mode · compaction-basic · agent-instructions …
  （共 22 行）
```

### 15.3 Preset 是什么

`composition/oblivion-web-app__presets__*.patch.yml` —— 四套预设：
`standard` / `minimal` / `ptc` / `cordis`。

**三个要点**：

1. **preset 是一个行，不是一个新概念** —— `@oblivion/agent-preset` 只是普通 Cordis 插件。
2. **`order` 字段**控制多 preset 叠加时的先后。
3. **平台互斥照旧用 `disabled: !!js`**。

### 15.4 关键提醒

**同一个包在两层有不同 disabled 语义** —— "patch 替换整段"的直接后果：**不能指望继承，必须完整重述**。

### 15.5 可复用清单

- [ ] 进程级能力 vs 会话级能力，先用"谁读它"定平面
- [ ] preset 用普通插件 + `config.plugins` 实现，别造新 DSL
- [ ] 每层完整重述自己的 `disabled`
- [ ] 平台差异统一用条件表达式

## 16. 部署形态

### 16.1 一图对比

|          | `oblivion web`                           | Oblivion Desktop                              |
| -------- | ---------------------------------------- | --------------------------------------------- |
| 载体     | npm 全局包                               | Electron 安装包                               |
| Node     | 系统 Node                                | 内嵌 Node + pnpm（锁版本）                    |
| 体积     | 较小                                     | 较大                                          |
| 代码载体 | `lib/` 15 文件（启动器）                 | `app.asar` + `app.asar.unpacked`              |
| profile  | `~/.oblivion/profiles/web`（7 行 patch） | `~/.oblivion/profiles/desktop`（26 行 patch） |
| 入口     | `oblivion.cmd` → `bin.js web`            | `lib/main.js` → `oblivion-desktop-host`       |
| 端口     | `127.0.0.1:3080`（loopback）             | 同（内部托管）                                |
| 更新     | `npm i -g`                               | `electron-updater`                            |

**核心插件代码逐字节相同**。

### 16.2 共享什么

```
              oblivion web            Desktop
插件来源   npm 全局 node_modules    asar 内 oblivion/node_modules
                 └──────────┬──────────────┘
                            ▼
                OBLIVION_HOME = ~/.oblivion  （完全共享）
```

### 16.3 依赖解析：`resolveBundleDir`

**先锚定 oblivion 自己的安装目录，再回退 profile。**

### 16.4 Module 解析拦截

Desktop 侧靠 `oblivion-desktop-host/lib/index.js` 的 `registerHooks` 把 Node 的 ESM/CJS resolver 接管。

**可复用结论**：**拦截 resolver 比改代码可靠**。

### 16.5 更新时各发生什么

|                 | `oblivion web`              | Desktop                      |
| --------------- | --------------------------- | ---------------------------- |
| profile         | **不动**                    | **不动**                     |
| Junction / 解析 | 路径寻址 → 下次启动自动生效 | asar 内路径稳定              |
| Node 版本       | 跟随系统                    | 随包切换                     |
| 回滚            | `npm i -g` 旧版本           | `oblivion-runtime.json` 校验 |

### 16.6 入口约束

```
$ oblivion --profile desktop --dump-config
error: profile "desktop" is managed exclusively by the Electron application
```

### 16.7 Desktop 独有组件

| 组件                    | 位置                                    | 作用                       |
| ----------------------- | --------------------------------------- | -------------------------- |
| `oblivion-desktop-host` | asar `oblivion/node_modules/@oblivion/` | Node-mode 宿主             |
| `lib/main.js`           | asar 根                                 | 窗口、更新器、profile 定位 |
| `oblivion-runtime.json` | asar `oblivion/`                        | 逐文件 sha256              |
| `renderer/`             | asar 根                                 | 仅欢迎页与更新弹窗         |

## 17. UI 设计系统

### 17.1 三层令牌架构

```
① obl-static-*   77 个   原始调色板，明暗主题完全相同
② obl-alias-*   107 个   语义别名 → 指向 static，按主题切换
③ obl-*         243 个   字体/圆角/阴影/焦点/渐变/组件专用
    obl-*         8 个   组件级（**③ 的子集，不是额外一层**；DSH 用第二前缀 `dsh-*`，见 §2.4）
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

| token                | weight    | size / line-height |
| -------------------- | --------- | ------------------ |
| `--obl-font-xxxs-11` | 400 / 500 | 11px / 14px        |
| `--obl-font-xxs-12`  | 400 / 500 | 12px / 18px        |
| `--obl-font-xs-13`   | 400 / 500 | 13px / 20px        |
| `--obl-font-s-14`    | 400 / 500 | 14px / 22px        |
| `--obl-font-base-16` | 400 / 500 | 16px / 24px        |
| `--obl-font-m-18`    | 500       | 16px / 28px        |
| `--obl-font-l-20`    | 500       | 20px / 28px        |
| `--obl-font-xl-24`   | 600       | 24px / 32px        |

### 17.5 焦点与平台差异

```css
:root {
  --obl-focus-ring-width: 2px;
}
html[data-input-modality='pointer'] body :focus-visible:not(:read-write) {
  --obl-focus-ring-color: transparent;
}
```

### 17.6 UI 插件清单（56 个 `oblivion-client-ui-*`）

**⚠️ 唯一带 `disabled` 的 UI 行**：

```yaml
- id: ui-sidebar-browser
  name: 'oblivion-client-ui-sidebar-browser'
  disabled: !!js ctx.get('profileContext')?.name !== 'desktop'
```

## 18. 实施路线图

| 阶段                 | 任务                                                                                          | 产出                       | 工时       |
| -------------------- | --------------------------------------------------------------------------------------------- | -------------------------- | ---------- |
| **Phase 0**          | 项目骨架 + 图标资产                                                                           | 可启动空壳 + 品牌资产      | 2 天       |
| **Phase 0.5** | 阶段实测清单（§27.4：反射 API / `openAt` / `!!js` / `ctx.slots` / Worker / Electron 协议 / 4 道锁 / Bubblewrap） | 实测结论 + OPEN 关闭依据 | — |
| **Phase 1**          | `oblivion-core`：Cordis 容器 + Patch 引擎                                                     | 可加载插件的内核           | 3 天       |
| **Phase 2**          | `oblivion-llm-*` + `oblivion-session-*` + 凭据/会话共享                                       | 基础对话能力 + 共享根目录  | 4 天       |
| **Phase 3**          | `oblivion-knowledge-*` + `oblivion-tool-doc-parse` + 工作区共享                               | **最小可用闭环**           | 5 天       |
| **Phase 4**          | `oblivion-web-ui`：React 界面 + UI 令牌系统                                                   | 完整 UI                    | 5 天       |
| **Phase 5**          | `oblivion-qa-loop` + `oblivion-perspective`                                                   | 核心认知功能               | 4 天       |
| **Phase 6**          | `oblivion-graph-growth` + `oblivion-feedback`                                                 | 增强功能                   | 3 天       |
| **Phase 7**          | `oblivion-plugin-manager` + Profile + 打包                                                    | **可交付的 Electron 应用** | 3 天       |
| **Phase 8**          | `oblivion-adapter-obsidian` + `oblivion-adapter-dsh`                                          | 插件生态扩展               | 3 天       |
| **Phase 9**          | `oblivion-desktop-host` + `oblivion-updater` + `oblivion-dump-config` + 双形态支持 + 源码沉淀 | **DSH 特性完整融合**       | 4 天       |
| **Phase 10**         | 发布工程学：三级版本分层 + 破坏性变更契约 + 迁移工具 + 镜像三级兜底                           | **可发布的产品**           | 3 天       |
| **Phase 11（新增）** | Docker 部署（路径 A/B）+ 卷持久化 + 无 TLS 反代                                               | **Docker 部署能力**        | 3 天       |<br>❌ **已作废（2026-10-02）**：Docker 支持已整体移除（`docker/` `.dockerignore` `profiles/docker/` 与 CI docker job 均已删除）。**保留此行仅为历史追溯，不删除**（§28.1 第 2 条）
| **合计**             |                                                                                               |                            | **~42 天** |

**关键原则**：**Phase 3 完成后（约 14 天）**，应该有一个**能跑通"上传文档 → 问答 → 沉淀"的 Electron 应用**。

## 19. 风险登记

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
| RISK-118     | Docker 网络暴露                    | RCE                                        | ① 默认仅 loopback；② `--allow-network-exposure` 显式开关；③ 必须同时配置 `--trusted-host`；④ 照搬 DSH 的 LAN trust + 一次性 token | Open           |<br>❌ **已作废（Docker 支持移除）**
| RISK-119     | 原生模块编译                       | 镜像构建失败                               | 多阶段构建                                                                                                                        | Open           |<br>❌ **已作废（Docker 支持移除）**
| **RISK-120** | `.gitignore` 忽略 `/.github/`      | CI 静默失效                                | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-121** | `.gitignore` 忽略 `/.action/`      | manifest 标 required 却被忽略              | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-122** | Python 段 `lib/` 无锚点            | 连带忽略 `packages/<pkg>/lib/`             | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |
| **RISK-123** | manifest 与实际目录不一致          | `src/` required 但不存在                   | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1） + 需持续回归           |
| **RISK-124** | `.gitattributes` 多 pattern 同行   | 6 行 `*.tgz is not a valid attribute name` | 修正 alphα 模板                                                                                                                   | ✅ 已修（v0.0.1）           |

## 20. 变更日志

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
| **v4.0.2** | **2026-10-02** | **内部一致性校准：并入 ERRATA-22~28、32（五/六层统一为六层、§18 补 Phase 0.5、`updaterCacheDirName` 拼写、§20 AC 计数、§22.1 证据等级、插件名去 scope 统一、证据路径统一 `dsh-ref`、§9.1 插件数 26）** |
| **v4.0.4** | **2026-10-03** | **Web 交付通道裁定 + 内部矛盾修正：`§3.1` 图称 React UI「通过 IPC 与 Main Process 通信」，与 `§5.3`「主界面由 `oblivion-web-ui` 经本地 web 服务提供」冲突 → 改为双通道事实（HTTP `/api` unary + 单条 WS `/api/remote.mux`）；新增 DEC-014/015/016 与 ERRATA-48；`notes/04` 与 DSH `host-webserver` 头注释证明「桌面也走 web 服务、仅壳页用 IPC」** |
| **v4.0.5** | **2026-10-03** | **宿主服务接线审查：新增 §5.7 通道落地顺序（DEC-017：先 HTTP `/api` 单元 → 再唯一 WS mux，**不退回 SSE**）；并入 ERRATA-49/50（`SERVICE_NAME` 是死常量且文档承诺与事实不符；profile↔registry 不一致被测试白名单豁免）；新增 DEC-018~022（六类服务各定最小 provider 让 pending 归零、例外从测试挪进 registry 当数据、**停止按 DSH 粒度铺新包**、CSP 与上游一致降级但抄一行到静态响应、通道落地同批带 e2e）、OPEN-112（index 注入形状）、RISK-125（账本维护成本超过它防住的 bug）** |

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
| **REQ-023** | Docker 部署可运行 + 卷挂载生效 | 部署 | AC-028、AC-029 |

**关于 5 个无 AC 关联的编号（REQ-009 / 010 / 017 / 018 / 021）**：

它们**在全文只出现在编号序列中，没有任何 AC 引用它们，也没有任何正文描述**。
本节**刻意不发明它们的内容** —— 按证据分级，它们属于 `Open`（见 `ERRATA-29`）。
处置建议：由作者确认这三个可能之一 —— ① 曾被规划但已废弃 → 标 `Superseded`；
② 遗漏了 AC → 补 AC；③ 编号跳号 → 注明「未使用」。

**`REQ-023` 已随 Docker 支持移除而作废**（见 §18 Phase 11 与 §22 的标注）。


### 21.1 AC 验收表（四状态轴）

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
| **AC-028** | **Docker 部署可运行**：① `docker compose up` 成功；② 默认仅 loopback；③ `--allow-network-exposure` 未启用时 `0.0.0.0` 被拒绝；④ 启用后需同时配置 `--trusted-host` | REQ-023          | **Not applicable** | Not run | Not requested    | -        |
| **AC-029** | **卷挂载生效**：`~/.oblivion` 挂载到宿主机，容器重启后凭据/会话/工作区保留                                                                                        | REQ-023          | **Not applicable** | Not run | Not requested    | -        |
| **AC-030** | **结构基线可验证**：26 个能力包与 §9.1/§10 清单一一对应；`registry.json` 的 `pluginCount` 与实际目录数一致；`npm run typecheck` / `npm run lint` 通过 | REQ-001 | Not started | Not run | Not requested | - |
| **AC-031** | **结构契约不脱节**：结构契约声明的每个 `required` 模块都在磁盘上存在（RISK-123 回归检查） | REQ-001 | Not started | Not run | Not requested | - |

## 22. Docker 部署能力（实证章节）—— ❌ **历史章节，已作废**

> **本整章已作废（2026-10-02）**：Docker 支持已从项目移除。以下内容**仅作历史追溯**，
> 其冲突项（`ERRATA-33` / `ERRATA-34`）随之不再需要修正 —— 冲突对象已不存在。
> **不删除本章**，保留「当初为什么这么设计、什么时候被推翻」的记录（§28.1 第 2 条）。

### 22.1 事实与证据

| 事实                         | 证据                                                         | 对设计的影响                  |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------- |
| **无官方镜像**               | 全包 5 层深度扫描 `Dockerfile*` / `docker-compose*` 为空     | **必须自建**                  |
| `engines = null`             | `package.json`                                               | 用 `node:24-*`                |
| 装机体量 453 MB / 26616 文件 | ✅ 逐字取证                                                         | 需分 target 裁剪              |
| 唯一原生模块 `node-pty`      | 全依赖仅其带 `binding.gyp`                                   | 镜像必须带 `python3 make g++` |
| `DSH_HOME` 优先级链          | `dsh-home-paths/lib/index.js:15,50,74`                       | 卷持久化点唯一且明确          |
| **`-p` 陷阱**                | 容器内绑 `127.0.0.1` 时 Docker 转发目标是容器 IP，回环收不到 | 只有两条正路                  |
| **不带 TLS**                 | `README.zh` 逐字                                             | 需反代或仅内网                |

### 22.2 两条可行路径

#### 路径 A（推荐，仅 Linux）：`network_mode: host`

```yaml
services:
  oblivion:
    network_mode: host
    volumes:
      - ./oblivion-home:/root/.oblivion
    environment:
      - OBLIVION_HOME=/root/.oblivion
    command: ['oblivion', 'web', '--host', '127.0.0.1']
```

**优势**：容器内 `127.0.0.1` = 宿主 `127.0.0.1`，**不触碰 PF-19 禁令**。

#### 路径 B（需自行承担边界）：patch 绑 `0.0.0.0`

```yaml
services:
  oblivion:
    ports:
      - '127.0.0.1:3080:3080'
    volumes:
      - ./oblivion-home:/root/.oblivion
    environment:
      - OBLIVION_HOME=/root/.oblivion
    command: ['oblivion', 'web', '--host', '0.0.0.0', '--trusted-host', 'oblivion.example.com']
```

**+ 反代加 TLS**。

### 22.3 未取证项（转 OPEN）

> **OPEN-021**：Bubblewrap 沙箱在容器内的可用性 —— **未实际验证**。

### 22.4 基础镜像选型

| 项         | 值                 | 依据                      |
| ---------- | ------------------ | ------------------------- |
| Node 版本  | `node:24-*`        | PF-29                     |
| 构建工具链 | `python3 make g++` | PF-28                     |
| 镜像分层   | 多阶段构建         | 453 MB / 26616 文件需裁剪 |

### 22.5 Dockerfile 示例

```dockerfile
# Builder Stage
FROM node:24-bookworm AS builder
RUN apt-get update && apt-get install -y python3 make g++
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime Stage
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV OBLIVION_HOME=/root/.oblivion
VOLUME /root/.oblivion
EXPOSE 3080
CMD ["node", "dist/bin.js", "web", "--host", "127.0.0.1"]
```

### 22.6 alphα 模板 5 个缺陷（入风险登记）

| #   | 模板问题                         | 后果                                        | 风险编号 |
| --- | -------------------------------- | ------------------------------------------- | -------- |
| 1   | `.gitignore` 忽略 `/.github/`    | CI 静默失效                                 | RISK-120 |
| 2   | `.gitignore` 忽略 `/.action/`    | manifest 标 `required:true` 却被忽略        | RISK-121 |
| 3   | Python 段 `lib/` 无锚点          | 连带忽略 `packages/<pkg>/lib/`              | RISK-122 |
| 4   | manifest 与实际目录不一致        | `src/` required 但不存在、`logs/` vs `log/` | RISK-123 |
| 5   | `.gitattributes` 多 pattern 同行 | 6 行 `*.tgz is not a valid attribute name`  | RISK-124 |

## 23. 待决问题

| ID           | 问题                      | 裁定                                         |
| ------------ | ------------------------- | -------------------------------------------- |
| OPEN-105     | registry.json 托管        | **npm 内嵌**                                 |
| OPEN-106     | 插件安全沙箱策略          | **预设分档**（不做 fs 沙箱）                 |
| OPEN-107     | Obsidian 适配层测试集     | **3 tier**：core / standard / extended       |
| OPEN-108     | 图标动画场景              | **做，限定位**                               |
| OPEN-109     | Desktop 强制更新          | **全开 4 锁**                                |
| OPEN-110     | oblivion-ref 托管与频率   | **本地 git + skill，暂不上远端；升级后必跑** |
| **OPEN-021** | **Bubblewrap 容器可用性** | **随 Docker 支持移除而作废**（`docker/` 已删除），不再单独实测|
| **OPEN-022** | **包管理器统一为 npm 还是 pnpm** | **裁定：npm 为运行器**（CI/构建）；`pnpm-workspace.yaml` 仅作目录契约 |
| **OPEN-023** | **是否迁移到 `@oblivion/` scope** | **裁定：暂不迁移**，发布公共 npm 前再整体迁 |
| **OPEN-024** | **lockfile 何时入库** | **关闭**：v0.0.1 已提交 `package-lock.json`，CI 已恢复 `npm ci` |
| **OPEN-111** | **Oblivion 右栏放什么**（tab 内容清单） | **未裁定** —— 由 `LAYOUT.MD` §12 `OPEN-LAYOUT-03` **上移**而来（2026-10-02）。<br>理由：`LAYOUT.MD` 只管「怎么摆」，已完整给出右栏的**扩展机制**（`sidebar.right.pane.tab` 按类型注册）；「放什么」是**产品决策**。<br>⚠️ 该裁定会反向影响 `RIGHTBAR_DEFAULT_RATIO = 0.45`（现为**暂定**）|

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

| 事件                 | 触发时机     | 载荷                                          |
| -------------------- | ------------ | --------------------------------------------- |
| `session:complete`   | 会话完成     | `{ sessionId, question, answer, references }` |
| `session:thinking`   | 思维激荡生成 | `{ sessionId, perspective }`                  |
| `knowledge:created`  | 知识创建     | `{ knowledgeId, sourceType }`                 |
| `knowledge:updated`  | 知识更新     | `{ knowledgeId }`                             |
| `md:generated`       | MD 落盘      | `{ path, sourceType }`                        |
| `feedback:collected` | 评价收集     | `{ signal, knowledgeId }`                     |

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
| ⑧   | **Bubblewrap 容器可用性**            | OPEN-021 关闭依据        |

## 28. 变更控制

### 28.1 变更流程

1. 每条新输入判定为 delta 类型
2. 只更新受影响的章节；**不动未受影响章节，不静默改写历史理由**
3. 每次实质性变更递增版本号，并在 §20 变更日志留痕
4. 若新输入介于"补充"与"替换"之间，**同时保留两种解读并先问再动手**

### 28.2 版本递增规则

| 版本变化 | 触发条件                         |
| -------- | -------------------------------- |
| v4.x     | 增量更新（补回、澄清、修正）     |
| v5.0     | 架构范式级改判（需用户显式批准） |

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
| **B1**   | 网络侧四层叠加围栏（原只写 1/3）                              | §14.4                        | 🟠 证据升级   |
| **B2**   | PF-19 扩写：schema 允许 / CLI 拒绝双层区分 + 行号             | §0.7 PF-19                   | 🟠 证据升级   |
| **B3**   | Docker 部署能力：从"保留"→**实证章节** + 两条路径             | §22                          | 🟠 证据升级   |
| **C1**   | 五层模型补"⑤′ 项目层 patch"                                   | §13.2 + §11.1                | 🟡 结构补全   |
| **C2**   | 项目目录权威性声明 + alphα 模板 5 缺陷入风险登记              | §10 + §22.6                  | 🟡 结构补全   |
| **C3**   | 单机自用假设补"首版不承诺网络部署"                            | §0.5                         | 🟡 结构补全   |
| **D1**   | 命名一致性                                                    | §0.0 + §29.5 + §30.1 + §30.3 | ⚪ 命名一致性 |
| **D2**   | UI 令牌采集例外说明                                           | §29.6                        | ⚪ 命名一致性 |
| **附录** | PF-26~PF-35 新增；DEC-013；OPEN-021；RISK-120~124；AC-028/029 | 全文                         | ✅ 证据扩充   |

---

_本文件由 YEAHZERO-Thought-Design 维护；2026-10-02 经用户显式批准转为 Baseline v4.0（事实校准版 · 完整版）。_
