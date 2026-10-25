# 创造一个插件（命名为@oblivion · 轮 10

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

DSH 选择 pnpm 并非偶然，而是由其 **"一切皆插件"** 的核心架构和 **"用户目录即运行时"** 的交付模型共同决定的。它的设计考虑可以概括为：**pnpm 是 Profile 隔离机制的实现工具，而不仅仅是包管理器。**

### pnpm 在 DSH 中的角色定位

DSH 中 pnpm 的使用方式与常规项目有本质区别：

| 维度 | 常规 Node 项目 | DSH 中的 pnpm |
|---|---|---|
| **作用范围** | 项目根目录的 `node_modules` | 每个 Profile 目录独立 |
| **主要职责** | 安装项目依赖 | **管理树外插件**（out-of-tree plugins） |
| **运行位置** | 开发机或构建机 | 用户机器上的 `$DSH_HOME/profiles/<name>/` |
| **与宿主的隔离** | 不涉及 | **Profile 之间完全隔离**，宿主依赖通过 fallback 解析 |

DSH 根目录的 `package.json` 声明了 `"packageManager": "pnpm@11.7.0"`，但这只是 Monorepo 开发时的约定。真正让 pnpm 成为架构一部分的，是它在 **Profile 机制**中扮演的角色。

### 核心设计决策一：Profile 作为隔离边界

DSH 的 Profile 是一个独立目录（`$DSH_HOME/profiles/<name>/`），其中包含：

- `package.json`：由 pnpm 管理的树外插件依赖，以及 `dsh.profile.bundles` 有序列表
- `cordis.patch.yml`：用户自己的补丁层

**为什么用 pnpm 而不是 npm 或 yarn？**

官方设计笔记中明确否决了一个替代方案：**内置组合包使用 `link:` 条目**。理由是 "pnpm 无法对指向安装目录的 `link:` 做版本管理、安装或更新，它会把机器路径嵌进用户文件，并且在安装目录移动后失效"。

这揭示了 DSH 对包管理器的核心诉求：**要能管理"指向外部目录的依赖"，同时保持版本可控、路径可移植**。pnpm 对 `link:` 的处理方式恰好满足这一需求——它记录版本声明，实际解析时通过 fallback 机制指向宿主实例。

### 核心设计决策二：双锚点解析与 peerDependencies 铁律

DSH 插件生态有一条硬性规则：**框架包（`@deepseek-ai/*`）必须放在 `peerDependencies`，绝不能放在 `dependencies`**。

原因在于 DSH 的**双锚点解析机制**：

1. **第一锚点：`dsh.profile.bundles` 中的内置组合包** —— 从 DSH 安装目录解析，"因此内置组合包始终来自与运行中 dsh 相同的安装，pnpm 从不管理它们"。

2. **第二锚点：Profile 的 `node_modules`** —— pnpm 安装的树外插件从这里解析。

如果框架包被声明为 `dependencies`，pnpm 会把它们**真实拷贝**到 Profile 的 `node_modules/@deepseek-ai/` 下。运行时，宿主和这些拷贝会加载为**两个独立的模块实例**，导致 `TOOL_RUNTIME_SCHEDULER` 等 symbol 身份分裂，工具调用直接崩溃。

正确做法是声明为 `peerDependencies`，配合 `autoInstallPeers: false`，让 pnpm 不安装它们；运行时通过 `healProfilesModuleFallback` 机制，把宿主的框架包链接到 `$DSH_HOME/profiles/node_modules/`，确保插件和宿主**共享同一个实例**。

### 核心设计决策三：pnpm 作为 `dsh plugin` 的转发后端

`dsh plugin --profile <name> <args...>` 的本质是一层**薄薄的 pnpm 转发器**：

- 它在 profile 目录下执行，把 `add`、`remove`、`update` 等所有 pnpm 子命令原样传递
- pnpm 操作成功后，`dsh` 检查被安装包的 `package.json` 是否声明了 `dsh.bundle.patch`，如果是，就将其追加到 `dsh.profile.bundles`
-

> （已截断，原长 2997 字符；问题全文见会话原始日志）

## 回答

明白 —— 要的是**同一套 pnpm 模型**（workspace + 一份依赖，靠 store 去重，而不是每个插件一份 `node_modules/` 实体）。先摸清现状与可用的 pnpm 运行时：

内置 pnpm 运行时已就位（正是你描述的那份）。继续摸现状：

现状很清楚：两个插件各一份 `node_modules`（**92.7 MB / 3900 文件**的重复依赖），根目录没有 workspace 配置；而 DSH 自带 pnpm **11.7.0**。按 DSH 同一套模型迁移：

安装成功但被「构建脚本审批」拦了一下（pnpm 10+ 的供应链门），我写的键没被识别。查一下这份 pnpm 11 认的确切配置位置：

pnpm **11** 把「依赖安装脚本审批」改成了 `allowBuilds` 显式映射（它还自动往我的 yaml 里写了占位行）。改成正确写法：

每个插件的 `node_modules` 从 **54.7 MB / 3626 文件** 变成 **0.02 MB / 12 个符号链接**，实体只有根目录一份（55 MB 供给两个插件）。把审批键写对：

`pnpm install` 现在退出 **0**，esbuild 二进制落位并可用。跑完整工作流验证：

工作区全绿。确认测试数、`dshx check`，并找出文档里残留的 npm 用法：

AGENTS.md 已更新。收尾：插件 README 的命令、GUIDE 的构建块、CHANGELOG 条目：

`pnpm run check` 失败了（单独跑三步都是绿的）。查原因 —— 多半是脚本里再调 `pnpm` 时 PATH 上没有它：

根因确认：脚本里再调 `pnpm` 时 PATH 上没有它（这台机器的 DSH 运行时只有 `dependencies/`，没有把 pnpm 暴露到 PATH）。改成**不依赖 PATH** 的入口：

PowerShell 5.1 解析器不支持我写的 PS7 风格表达式（`$x = if (...) {...}`）。改成 5.1 兼容：

编码问题：PS 5.1 按 ANSI 读无 BOM 的 `.ps1`，中文被拆成乱码。加 UTF-8 BOM：

入口脚本在 PowerShell 5.1 下全绿（42/42）。验证 pnpm 入口并收尾文档：

迁移完成并已推送到 GitHub ✅（`dc644c8`）

## 做了什么

| 文件 | 作用 |
| --- | --- |
| `package.json`（根，private） | `packageManager: pnpm@11.7.0`；`check`/`build`/`test`/`typecheck`/`check:version` 全部转入口脚本 |
| `pnpm-workspace.yaml` | `packages: ['oblivion-*']` + **`allowBuilds: { esbuild: true }`**（依赖安装脚本显式审批） |
| `.npmrc` | `auto-install-peers=false`（框架包只放 peer）· `strict-peer-dependencies=false` · `hoist=false` |
| `pnpm-lock.yaml` | 工作区**唯一** lockfile（入库）；删掉两个 `package-lock.json` |
| `tools/check-workspace.ps1` | 工作区统一入口：**运行时解析** DSH 受控运行时位置 |

## 效果（同机实测）

| 指标 | npm（迁移前） | pnpm workspace（迁移后） |
| --- | --- | --- |
| `oblivion-brand/node_modules` | 38.0 MB / 313 文件 | **0.02 MB / 12 项（5 个符号链接）** |
| `oblivion-vimc/node_modules` | 54.7 MB / 3626 文件 | **0.02 MB / 12 项（9 个符号链接）** |
| 仓库内实体依赖 | 两处各一份（~92.7 MB） | 根 `node_modules/.pnpm` **一份**（55 MB，两插件共享） |
| lockfile | 2 个 | 1 个 |

> 说明：`%LOCALAPPDATA%\pnpm\store` 有 328 MB —— 那是**全机器共享**的内容寻址 store（DSH 自己的 Profile 也用同一份），不是本仓库的额外副本；仓库工作树里的重复已经消失。

## 与 DSH 一致的四条铁律（已写进 `.action/AGENTS.MD` 的《包管理器规范》）

1. **框架包 `@deepseek-ai/*` 只放 `peerDependencies`** + `auto-install-peers=false` —— 避免运行时两个模块实例、symbol 分裂（你们的两个插件本来就是这么声明的 ✓ 现在配套规则也落地了）。
2. 依赖的 install/postinstall **默认不执行**，只在 `allowBuilds` 里逐包放行（当前仅 `esbuild`）。
3. `hoist=false`：未声明的依赖一律解析失败。
4. 只用 **DSH 分发的受控 pnpm 11.7.0**（不要求系统装 Node/pnpm）；**禁止**在插件目录里 `npm install`。

## 路上踩的三个坑（都记进 CHANGELOG/日志了）

1. **pnpm 11 换了审批键**：我按 pnpm 10 的写法加 `onlyBuiltDependencies` 不生效（`ERR_PNPM_IGNORED_BUILDS`），它还会自动往 `pnpm-workspace.yaml` 写 `allowBuilds: esbuild: set this to true or false` 占位行 —— 改成 `allowBuilds: { esbuild: true }` 后 `install` exit 0。
2. **本机 `pnpm` 不在 PATH**（DSH 只分发 `pnpm.mjs` + node）：根脚本里嵌套 `pnpm run xxx` 会 `'pnpm' is not recognized` → 改成入口脚本在运行时解析路径（可用 `DSH_RUNTIME_ROOT`/`DSH_NODE`/`DSH_PNPM` 覆盖，不把机器路径写进仓库）。
3. **`.ps1` 必须带 UTF-8 BOM**：Windows PowerShell 5.1 按 ANSI 读无 BOM 脚本，中文变乱码直接 `UnexpectedToken`；顺手把 PS7 专有写法（`$x = if (...) {...}`）改成 5.1 兼容。

## 验证

| 项 | 结果 |
| --- | --- |
| `pnpm install` | exit **0**；esbuild 的 postinstall 经审批执行，`esbuild.transform` 实测可用 |
| 入口脚本 | `powershell -File tools/check-workspace.ps1` → **全部通过**（install + typecheck + test **42/42** + build + 版本一致），exit 0 |
| 根脚本入口 | `pnpm run build` / `pnpm run test` / `pnpm run check:version` / `pnpm run check` 全部 exit 0 |
| 插件契约 | `dshx check oblivion-vimc` 仍全绿；`lib/*` 重新构建后**字节无变化**（产物可复现） |
| 推送 | `cc4d184..dc644c8  main -> main`；本地与远端同点、工作区干净 |

线上 DSH **不受影响**：Profile 侧照旧是 `link:` 依赖 + `cordis.patch.yml` 插入行（消费的是插件的 `lib/`），插件**运行时依赖仍然为零**。

要不要我再加一个 GitHub Actions 工作流（用同一入口脚本跑 `-Task test`/`build`，Windows runner 上装 pnpm 11 即可），或者给这次交付打一个 `vimc-v0.2.8` tag？

- 涉及工具: `edit`, `grep`, `load_workspace_dependencies`, `pwsh`, `read`, `write`

---