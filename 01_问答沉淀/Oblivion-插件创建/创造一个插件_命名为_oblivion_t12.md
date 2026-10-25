# 创造一个插件（命名为@oblivion · 轮 12

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

C:\Projects\YEAHZERO\alphα该文件夹加入版本号和日期，这样下次更新的时候也知道

## 回答

理解：给模板本身加**版本号 + 日期**，并让「哪个模板版本、什么时候生成的」写进生成的项目里，便于下次比对。先看 README 渲染与日志写入的现有实现：

方案：**模板自身 `VERSION` + 日期**，并让**生成的项目留下可追溯记录**（README/CHANGELOG/日志 + 机器可读的 `.alpha/provenance.json`）。先落文件级改动：

BOM/解析/JSON 全部正常。现在把「模板发版」也自动化（版本+日期同步），并让 `bump-version.ps1` 支持模板自身：

模板现在自带**版本号 + 日期**，并且**生成的项目会记住自己是从哪个模板版本、哪一天生成的**——下次更新时能直接比对。

## 一、模板自身的版本与日期（当前：**alphα v3.0.2 · 2026-10-05**）

| 位置 | 内容 |
| --- | --- |
| [`VERSION`](C:\Projects\YEAHZERO\alphα\VERSION) | **模板版本唯一真源** = `3.0.2`（此前模板没有版本文件，只藏在 manifest 里） |
| [`package.json`](C:\Projects\YEAHZERO\alphα\package.json) | `version` 作为**镜像**同步为 `3.0.2`（禁止手改） |
| [`.alpha/manifest.json`](C:\Projects\YEAHZERO\alphα\.alpha\manifest.json) | `"version": "3.0.2"` + **新增 `"date": "2026-10-05"`** |
| [`CHANGELOG.md`](C:\Projects\YEAHZERO\alphα\CHANGELOG.md) | 每条记录**必带日期**：`## [未发布] — 3.0.2 · 2026-10-05 · 模板版本与日期可追溯`、`## [3.0.1] — 2026-10-05 · pnpm workspace + 版本规则` |
| [`scripts/bump-version.ps1`](C:\Projects\YEAHZERO\alphα\scripts\bump-version.ps1) | 新增 **`-SyncTemplateManifest`**：模板仓发版时一次同步 `VERSION` + `package.json.version` + manifest 的 `version`/`date` |
| [`.action/AGENTS.MD`](C:\Projects\YEAHZERO\alphα\.action\AGENTS.MD) | 新增《模板版本与溯源》规范（写清「模板发版带 `-SyncTemplateManifest`，生成项目**不要**带」的原因） |

## 二、生成的项目会留下什么（这才是「下次更新也知道」的关键）

`alpha-init` 现在把溯源写进生成的项目（已实测）：

| 产物 | 例子 |
| --- | --- |
| `.alpha/provenance.json`（新增，机器可读） | `{ template: "alphα", version: "3.0.2", date: "2026-10-05", generatedAt: "2026-10-05 10:50:54", generatedBy: "alpha-init.ps1", project: "ProvTest", stacks: ["node"] }` |
| `README.md` 页脚 | `本文件由 alphα 模板 v3.0.2（模板日期 2026-10-05）于 2026-10-05 10:50:54 渲染生成` + 升级比对提示 |
| `CHANGELOG.md` 开头 | `项目：ProvTest ｜ 本文件由 alphα 模板 v3.0.2（2026-10-05）于 … 生成`（新增渲染策略 `render: "provenance"`） |
| `.memory/daily/*-alpha-init.md` | `模板版本: alphα v3.0.2（模板日期 2026-10-05）` + `溯源记录: .alpha/provenance.json` |
| 控制台/日志开头 | `模板版本: alphα v3.0.2（模板日期 2026-10-05 · 本次生成 …）` |
| `.alpha/manifest.json`（随 `.alpha/` 一并带过去） | `version 3.0.2` + `date 2026-10-05` —— 即「生成时的模板版本」 |
| **项目自己的 `VERSION`** | `0.0.1`（与模板版本无关，走新版本规则从 0.0.1 起） |

## 三、下次更新怎么做（新流程）

```powershell
# 1) 模板仓改了东西 → 发版（默认只加第三位；第二/第一位要 -Minor/-Major）
.\scripts\bump-version.ps1 -SyncTemplateManifest
#    → VERSION 3.0.2 → 3.0.3，package.json 同步，manifest 的 version+date 一并更新
# 2) 在 CHANGELOG.md 追加带日期的条目：## [3.0.3] · YYYY-MM-DD · 摘要

# 3) 老项目里对比 .alpha/provenance.json 的 version/date 与当前模板，
#    按 CHANGELOG 决定补哪些改动（该文件就是为此存在的）
```

实测：`-SyncTemplateManifest` → `VERSION: 3.0.2 -> 3.0.3`、`package.json 已同步`、`模板溯源已同步：.alpha/manifest.json version=3.0.3 date=2026-10-05`；在没有 `.alpha/manifest.json` 的普通项目里用它会**只提示、不乱改**（`未找到 .alpha/manifest.json：不是模板仓？已跳过模板溯源同步`）。

## 四、验证

| 项 | 结果 |
| --- | --- |
| 端到端脚手架 | `alpha-init` 生成临时项目 → `provenance.json` / README 页脚 / CHANGELOG 抬头 / 日志行 / manifest 版本+日期**全部落位**；项目 `VERSION=0.0.1` |
| 模板自身 | `scripts/check-workspace.ps1` 全部通过（exit 0）；5/5 `.ps1` 带 UTF-8 BOM；PowerShell 5.1 解析全绿 |
| 版本脚本 | 默认只加第三位 ✅ ｜ 位置参数被拒 ✅ ｜ `-Minor`/`-Major` 显式才动 ✅ ｜ `-SyncTemplateManifest` 同步三处 ✅ |
| 临时目录 | 已清理 |

> 提示：`C:\Projects\YEAHZERO\alphα` 仍然**不是 git 仓库**，所以版本+日期的历史目前只存在于 `CHANGELOG.md`。要真正「下次能 diff 出来」，建议给它 `git init` 并首次提交（我也可以顺手打上 `v3.0.2` tag）——你说一声我就做。

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---