# 「库里关于 cordis 的记录」 · 轮 1

- 来源会话: `session-e3482c96-f2ca-49de-884e-6c772ad826c9`

## 问题

「库里关于 cordis 的记录」

## 回答

库里关于 **cordis** 的记录集中在**两篇文档 + 自建知识库索引**里。全库检索 `cordis` 命中 32 处，全部落在这三处。

## 一、核心载体

| 文档 | 角色 | 命中 |
| --- | --- | --- |
| [DSH 源码分析（@deepseek-ai-dsh v0.2.0-rc.2）.md](<DSH 源码分析（@deepseek-ai-dsh v0.2.0-rc.2）.md>) | 上游机制解剖：cordis 本体、版本约束、patch 层序 | 26 处 |
| [Oblivion-20261006-@oblivion-core 落地记录.md](<Oblivion-20261006-@oblivion-core 落地记录.md>) | 下游实操：把插件挂进 cordis profile 的 Windows 路径 | 2 处 |
| [_kb](_kb/00-总览.md)（`_kb/01-主题清单.md`、`_kb/02-分块索引.md`、`_kb/03-标签索引.md`） | 检索入口，`#Cordis` 标签下仅 1 篇 | 4 处 |

## 二、cordis 是什么、怎么被约束（DSH 源码分析）

- **定位**：`@deepseek-ai/cordis (~4.0.4)`，DSH 的依赖注入容器与「一切皆插件」内核。组合关系全由 YAML patch 声明，**代码里没有硬编码的插件图**（`DSH 源码分析…md:16`）。作者为 Shigma，9 个 vendor 包 LICENSE 全 MIT，Copyright (c) 2021-present（`:308`）。
- **不可动边界**：cordis 属 **L0 框架层**（vendor/* 9 包：cordis, cosmokit, group, hmr, include, loader, logger-console, schemastery, timer），`pnpm.overrides` 全仓链接 vendor（`package.json:144`），**动一个 = 动框架**（`:256`）。
- **强制 manifest 规则**：`check-workspace-constraints.ts:466-480` 要求 `@deepseek-ai/cordis` **必须同时是 peerDependency 和 devDependency，且两者 range 完全相同**（`:275`）——Oblivion 侧照抄为 `peerDeps: @deepseek-ai/cordis ~4.0.4`（`:575`）。
- **启动链**：`dsh (bin.js, commander) → profile-boot.js: runProfile() → composeProfile()（叠加 5 层 patch）→ boot()（挂载 Cordis 插件树）`（`:18-23`）。
- **5 层 Patch 叠加**（按行 id 最后写入胜出）：bundle 层（`dsh.profile.bundles`：dsh-base → dsh-web-app）→ profile 用户层 `~/.dsh/profiles/<name>/cordis.patch.yml` → home 层 `~/.dsh/cordis.patch.yml`（机器级，跨 profile）→ `--patch` 覆盖 → telemetry 开关（`:24-29`）。层序在 `dump-config.ts:45` 固化，profile 目录里 `cordis.patch.yml` 的开头注释原文即 "Your patch layer for this dsh profile, applied after every bundle layer"（`:710-712`）。
- **根配置 `cordis.yml` 每次启动重写为空数组 `[]`**，防止 Loader 的写回把组合结果固化（`:30`）。
- **YAML 内嵌 JS**：依赖注入用 `!!js` 表达式，如 `disabled: !!js process.platform === 'win32'`，即「配置即代码」（`:62`）。
- **隔离原语**：`cordis:group` / `cordis:include`；Agent Presets 支持 `cordis:group` 隔离（`isolate: {planMode: true}`）（`:54`、`:220`）。
- **三条官方注入路径**（不改 DSH 本体）：① bundle 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（`app-boot/src/profile.ts:10`，校验 `:59-61`，`resolveBundleDir() :706`）；② profile 激活列表 `dsh.profile.bundles`——「New bundle dependencies activate automatically」（`profile-plugins.ts`）；③ CLI overlay `--patch <file>`（`apps/cli/src/dump-config.ts:29`，现成例子 `demo:inspector = --patch ./packages/experimental/inspector/cordis.source.patch.yml`）（`:292-304`）。
- **实据**：`C:\Users\liveu\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 列 3 个 bundle 而 `dependencies: {}`，证明**包靠 bundle 声明激活，不是靠 npm dependencies**；该 profile 实际激活了源码 319 包中的 **202 个**（`:698-713`）。

## 三、cordis 在下游怎么用（Oblivion 落地记录）

- **挂载动作**（`Oblivion…md:66-78`）：先 `& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/<插件目录>'`（**必须正斜杠**，反斜杠会被桌面包管理器的目标校验正则拒掉），再在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 末尾追加 `insert` 行 —— **`@` 开头的 id/name 必须加引号**。
- **热挂能力**：改 patch 行**落盘即装载，无需重启 App**；但 Host 侧插件改代码需重启（Host 复用 ESM 缓存里的模块命名空间）。
- **`dsh.bundle` 决定激活方式**：有 `dsh.bundle.patch` → 走 profile 的 bundle 层，**改一次要重启 App**；无 → 普通依赖 + profile 插入行，**可热挂**。认知类插件频繁迭代，选后者，并用测试断言锁住该决定防止手滑加回。
- 插件侧的类型入口只有一种：`import type { Context } from '@deepseek-ai/cordis';`（`:326`、`:514`）——迁移时改 package.json 依赖即可，源码几乎不动。
- 该文档 Tags 含 `#Cordis`（`Oblivion…md:4`），是 `_kb/03-标签索引.md:214` 中 `#Cordis（1）` 的唯一归属。

**没记的**：cordis 自身的内部 API（Service 生命周期、`ctx.effect()` 等）没有成篇整理——`_kb/02-分块索引.md:3880` 只把「架构核心：Cordis 插件系统」列为 `DST 源码分析…md` 第 15 行的一个小节标题。若要补这块，缺口就在这里。

> 附带说明：本会话的 PowerShell 全部失败（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(C:\Library\那些渐渐被遗忘)`），即 DSH 无法给这个工作区根目录授予写权限；上面所有结果都是靠 read/grep/glob 工具取得的。需要我修这个文件权限问题的话说一声。

- 涉及工具: `glob`, `grep`, `pwsh`, `read`, `skill`

---