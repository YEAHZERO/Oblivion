# 创造一个插件（命名为@oblivion · 轮 11

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

将这个pnpm 模型（workspace + 一份依赖，靠 store 去重，而不是每个插件一份 node_modules/ 实体）和版本规则写入C:\Projects\YEAHZERO\alphα——
版本规则已改（0.0.1 起步 · 每次先加第三位）
规则	落点
新版本线从 0.0.1 起步；已有版本不回改；每次只加第三位	.action/AGENTS.MD（规范）+ CHANGELOG.md 开头
第二位/第一位只在明确要求时：--minor / --major；位置参数写 minor 直接被拒	scripts/bump-version.mjs
本轮已按新规则执行：@oblivion/vimc 0.2.0 → 0.2.1（不是 0.3.0）。已有版本号一律没动（根 VERSION 仍 0.0.2、@oblivion/brand 仍 0.1.0）。

## 回答

明白：把这两件事**沉淀到 alphα 模板**，这样以后 `alpha-init` 生成的新项目天生就是 pnpm workspace + 新版本规则。先摸模板结构：

模板是**开发模板仓**（npm workspaces + `scripts/bump-version.ps1` + `alpha-init` 脚手架）。看关键的两份结构文件：

模板的 `stackDetection.node.packageManager` 现在写的是 `npm`，根 `package.json` 用的是 npm workspaces。逐项改造前先读版本脚本与相关模板：

现在改版本脚本 —— 把「每次先加第三位 + 位置参数直接拒」做成硬校验：

版本脚本行为全部符合新规则（默认加第三位、位置参数被拒、`-Minor`/`-Major` 才动）。现在做 pnpm 侧 —— 先确认脚手架流程顺序：

模板自身已跑通（install + 各级检查 exit 0）。补齐文档与 `.gitignore`：

BOM 掉了 —— 我用编辑工具改 `alpha-init.ps1` 时把它的 UTF-8 BOM 弄丢了，PS 5.1 于是按 ANSI 读、中文变乱码。（正是我上一轮记下的那个坑，这次踩在模板自己身上。）修：

脚手架已能生成 pnpm 模型 + 版本规则 ✅。但暴露出两个**模板既有缺陷**（会让我的 README 改动落不了地）：README 模板路径找不到 + 一处空路径参数。查一下：

两个都是**模板既有缺陷**（与我的改动无关，但会让 README 那部分落不了地）：`README.template.md` 实际在 `.alpha/templates/` 下却按根目录找；`-DesignDocPath` 为空时未做守卫。一并修：

脚手架现在完整交付（README 也渲染出来了 ✓）。最后把新规范挂进 `alpha-init` 的「待完善清单」，并更新模板 CHANGELOG：

模板已按你给的两条规则改造完，并**验证到「新生成的项目天生就是 pnpm workspace + 新版本规则」**。

## 一、写入的 pnpm 模型

| 位置 | 内容 |
| --- | --- |
| 模板根 | [`package.json`](C:\Projects\YEAHZERO\alphα\package.json)（`packageManager: pnpm@11.7.0`，**移除 npm `workspaces`**）· [`pnpm-workspace.yaml`](C:\Projects\YEAHZERO\alphα\pnpm-workspace.yaml)（`packages: ['packages/*']` + `allowBuilds` 安装脚本审批）· [`.npmrc`](C:\Projects\YEAHZERO\alphα\.npmrc)（`auto-install-peers=false` · `strict-peer-dependencies=false` · `hoist=false`）· [`pnpm-lock.yaml`](C:\Projects\YEAHZERO\alphα\pnpm-lock.yaml) |
| 入口脚本 | [`scripts/check-workspace.ps1`](C:\Projects\YEAHZERO\alphα\scripts\check-workspace.ps1)：按 **`DSH_PNPM` → `PATH` → DSH 受控运行时** 解析 pnpm（所以「pnpm 不在 PATH」也能跑）；递归任务带 `--if-present`，并额外跑根级 `typecheck:root`/`test:root` |
| 规范 | [`.action/AGENTS.MD`](C:\Projects\YEAHZERO\alphα\.action\AGENTS.MD) 新增**《包管理器规范》**（依赖只存一份 · 框架包只放 peer · `allowBuilds` 审批 · `hoist=false` · lockfile 入库 · **禁止子包 `npm install`**） |
| 脚手架 | [`.alpha/manifest.json`](C:\Projects\YEAHZERO\alphα\.alpha\manifest.json)：`configFiles` 新增 4 条（`pnpm-workspace.yaml` / `.npmrc` / `scripts/check-workspace.ps1` / `CHANGELOG.md`）· `stackDetection.node.packageManager`：**npm → pnpm** · 模板版本 `3.0.0 → 3.0.1`（按新规则加第三位）；源文件放在 [`.alpha/sources/`](C:\Projects\YEAHZERO\alphα\.alpha\sources) |
| 其它 | [`.action/GUIDE.MD`](C:\Projects\YEAHZERO\alphα\.action\GUIDE.MD) · [README 模板](C:\Projects\YEAHZERO\alphα\.alpha\templates\README.template.md) · [alphα.README.md](C:\Projects\YEAHZERO\alphα\alphα.README.md)（结构图补根文件） · [CONTRIBUTING](C:\Projects\YEAHZERO\alphα\alphα.CONTRIBUTING.md) · `.gitignore`/`alpha.gitignore`（`.pnpm-store/`、`pnpm-debug.log*`，并注明 **`pnpm-lock.yaml` 必须入库**） |

## 二、写入的版本规则（三处落地，含硬校验）

| 落点 | 内容 |
| --- | --- |
| [`.action/AGENTS.MD`](C:\Projects\YEAHZERO\alphα\.action\AGENTS.MD)《版本管理规范》 | 删掉旧的「`fix/docs/chore → patch`；`feat → minor`」映射，改为：**0.0.1 起步 · 已有不回改 · 每次先加第三位 · 第二位/第一位只在明确要求时（`-Minor`/`-Major`）· 位置参数一律拒绝**；并把 `CHANGELOG.md` 开头列为落地位置 |
| [`scripts/bump-version.ps1`](C:\Projects\YEAHZERO\alphα\scripts\bump-version.ps1) | 默认加第三位；**位置参数直接拒绝（退出码 2、版本不变）**；只有 `-Minor` / `-Major` 才动高位 |
| [`.alpha/sources/alpha.CHANGELOG.md`](C:\Projects\YEAHZERO\alphα\.alpha\sources\alpha.CHANGELOG.md) | 脚手架源：**新项目生成即带**「CHANGELOG 开头写明规则」 |

实测行为矩阵：默认 `0.2.0 → 0.2.1` ✅ ｜ `bump-version.ps1 minor` → **拒绝、版本仍 0.2.1** ✅ ｜ `-Minor` → `0.3.0` ✅ ｜ `-Major` → `1.0.0` ✅

## 三、顺手修掉的模板既有缺陷（不修的话上面的改动落不了地）

1. **README 从不渲染**：脚本按模板根找 `README.template.md`，实际在 `.alpha/templates/` → 生成的项目一直没有 README（我加的 pnpm 指引也就白写）。新增 `Get-ReadmeTemplatePath`（优先 `.alpha/templates/`，回退旧位置），bootstrap 也按它解析。
2. **`-DesignDocPath` 为空报错**：`Test-Path`/`Get-Content` 收到空字符串 → 加空值守卫。
3. **`Merge-ConfigFiles` 不支持子目录**：`scripts/check-workspace.ps1` 这类要落在子目录 → 自动创建父目录。
4. **新增 [`scripts/ensure-utf8bom.ps1`](C:\Projects\YEAHZERO\alphα\scripts\ensure-utf8bom.ps1)**（`-Check` 可入提交前检查）：本轮我自己就踩了 —— 用「整文件写入」改 `.ps1` 会把 **UTF-8 BOM 冲掉**，PowerShell 5.1 立刻按 ANSI 读、中文乱码、`alpha-init.ps1` 直接解析失败。
5. `Write-InitChecklist` 增 3 项：pnpm 依赖未安装（缺 `pnpm-lock.yaml`）、缺 `CHANGELOG.md`、有 `.ps1` 缺 BOM。

## 四、验证

| 项 | 结果 |
| --- | --- |
| 模板自身工作区 | `powershell -File scripts/check-workspace.ps1` → **全部通过**（pnpm 11.7.0：install + 各包/根级检查），exit 0 |
| `.ps1` 兼容性 | 5/5 带 UTF-8 BOM；PowerShell **5.1 解析全绿**（`ensure-utf8bom.ps1 -Check` exit 0） |
| **端到端脚手架** | `alpha-init.ps1` 生成临时项目 → `VERSION=0.0.1`、`CHANGELOG.md`（含规则）、`README.md`（**已渲染**，含 pnpm 指引）、`pnpm-workspace.yaml`、`.npmrc`、`scripts/{check-workspace,bump-version,ensure-utf8bom}.ps1`、`.action/AGENTS.MD`（含两条新规范）全部就位；清单正确提示「pnpm 工作区未安装依赖」 |
| 临时目录 | 已清理 |

一点说明：`C:\Projects\YEAHZERO\alphα` **不是 git 仓库**（`fatal: not a git repository`），所以没有提交/推送这步。要不要我给它 `git init` + 首次提交（或你给个远端，我按 Conventional Commits 提一个 `feat(template): pnpm workspace + 版本规则改为 0.0.1 起步·每次先加第三位` 并推送）？

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---