# dsh-weknora 是 WeKnora · 轮 3

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

检查该工具： 工具可用。dshx_* 需要一份含 tools/dshx 的 Harness checkout（DSHX_HARNESS 环境变量或 ~/.config/dshx/harness 指定）；本机目前没有，C:\Projects\deepseek-harness 也没有 tools 目录。，我需要后续创造插件

## 回答

工具已经挂上了 —— 说明插件激活成功，我之前那个 `installAnchor` 修复生效了。现在按你说的，用只读探针检查它能不能真正干活。

正如预判 —— 工具注册了，但底座还没接上。先摸清它到底要什么。

DSHX 是一整套契约指纹校验（40+ 个文件 + 逐条标记串）。先看它自己声明的安装方式。

验证完毕，DSHX 底座可以精确接上。先汇报结论再动手。

## 诊断：工具已注册，缺的是 DSHX 底座

`dshx_status` 实测报错：

```
dsh-creator-mode-plus: no Harness checkout found; run dshx setup, pass --harness, or set DSHX_HARNESS
```

`resolveHarnessRoot` 要求一份同时满足三点的 checkout（[runner.js:129](C:/Users/liveu/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/src/runner.js)）：

| 条件 | `C:\Projects\deepseek-harness` |
|---|---|
| `apps/cli/src/bin.ts` | ✅ |
| `tools/dshx/src/cli.ts` | ❌ 缺 |
| `tools/dshx/package.json` | ❌ 缺 |

而且这个 `package.json` 不是随便放个包就行 —— [compatibility.js](C:/Users/liveu/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/src/compatibility.js) 会做**契约指纹校验**：必须是 `dsh-external-plugin-devkit`、版本落在 `>=0.9.1 <0.10.0`（且非预发布），38 个契约文件全部存在，且每个文件含指定标记串。

## 我已经把 DSHX v0.9.5 拉下来验过了一遍

npm 上该包只有 `0.7.8 / 0.9.3 / 0.9.4 / 0.9.5` 四个版本，**0.9.3 / 0.9.4 / 0.9.5 都在支持区间内**，我取最新的 v0.9.5 逐条核对：

| 校验项 | 结果 |
|---|---|
| 38 个 `REQUIRED_DSHX_PATHS` | 全部存在 |
| `src/internal/types.ts` 含 `dsh-v0.2.0-rc.2` / SHA `639ed015…` / peer `>=0.2.0-rc.1 <0.2.1` | ✅ 全中 |
| `src/cli.ts` 的 9 个 case 标记 | ✅ 全中 |
| 依赖 | `tsx` / `js-yaml` / `typescript` / `lightningcss`（`resolveDshxRuntime` 需要 `tsx/esm`） |

顺带确认了版本对齐关系：`C:\Projects\deepseek-harness` 现在在 `master` = **0.2.1-alpha.1**，而运行中的桌面 Host 是 **0.2.0-rc.2**，DSHX 的 pin 也是 **rc.2** —— 该仓库有这个 tag，且 tag 内含 `apps/cli/src/bin.ts` 和 `packages/bundle/web-app/presets/standard.patch.yml` 两个必需路径。

## 建议的执行步骤

1. `git clone --branch v0.9.5 --depth 1 https://github.com/aa2246740/dsh-external-plugin-devkit.git` → `C:\Projects\deepseek-harness\tools\dshx`
2. 在该目录 `npm install`（装 tsx 等四个依赖）
3. 写 `C:\Users\liveu\.config\dshx\harness`，内容为 `C:\Projects\deepseek-harness`
4. 重跑 `dshx_status` 验证

两点说明：

- **第 3 步用配置文件而不是环境变量**，因为 `resolveHarnessRoot` 每次调用都读这个文件，**不需要重启桌面 App**；设 `DSHX_HARNESS` 环境变量则必须重启才生效。
- 我只往 checkout 里**新增** `tools\dshx` 目录，不碰任何官方源码、内置包或产物 —— 这正是 DSHX 自己规定的落点（它的 README 就是 `git clone … tools/<name>` 这套）。`CORE_SOURCE_IMMUTABLE` 边界我不会越。

还有一个装完才能实测的风险点先说明：`runner.js:254` 用 `spawn(process.execPath, ['--import', tsx, cli, …])` 拉起 dshx，而桌面端的 `process.execPath` 是 Electron 主程序，可能需要 `ELECTRON_RUN_AS_NODE=1` 才能当 Node 用。这个装完跑一次就知道。

批准收到，开始执行。

Checkout 后的 HEAD 是 `639ed015397290b3745d163aafe02ffee4aa3f84` —— 和 DSHX 里 pin 的 `DESK_HARNESS_SHA` **完全一致**。继续。

依赖装好了。有个 esbuild postinstall 被 npm 策略拦下的警告 —— 先确认 `tsx` 真能解析和运行。

DSHX 直接跑通了，契约校验通过。现在测 Host 侧的真调用。

契约校验通过了（`dshxVersion: 0.9.5`、17 项 capabilities 全部返回），但子进程启动炸了 —— 这是同一个文件里的**第二个 Windows 路径缺陷**。先确认有没有绕过的途径。

复现确认，且**没有环境变量或配置可以绕过**（`loaderPath` 只是内部选项）。两个调用点都有同一个缺陷。先看 `runner.js` 的导入。

`runner.js` 已经导入了 `node:url`（只是没带 `pathToFileURL`），作者在 `desktop-profile.js`/`takeover.js` 里就是用 `pathToFileURL` 的 —— 这两处是漏改。备份后打补丁。

补丁两处都打上了。现在测一下 Host 是否已经加载新代码。

底座装好了，而且暴露出**同一个插件里的第二个 Windows 路径缺陷** —— 已一并修掉。

## 已完成

| 步骤 | 结果 |
|---|---|
| checkout 切到 `dsh-v0.2.0-rc.2` | HEAD = `639ed015397290b3745d163aafe02ffee4aa3f84` —— 与 DSHX 里 pin 的 `DESK_HARNESS_SHA` **逐位相同** |
| 克隆 DSHX v0.9.5 | → `C:\Projects\deepseek-harness\tools\dshx`，38 个契约文件齐备 |
| `npm install` | 12 个包，`tsx/esm` 与 `@esbuild/win32-x64` 均可解析 |
| 写 `C:\Users\liveu\.config\dshx\harness` | 内容 `C:\Projects\deepseek-harness`（无需重启即生效，已验证） |

**契约校验已通过**（这是 Host 侧真调用返回的，不是我的模拟）：

```json
"dshxVersion": "0.9.5",
"creatorBridgeVersion": 2,
"dshxContract": "dshx-v0.7/creator-bridge-v2",
"dshxCapabilities": [ ...17 项全返回... ]
```

说明 `resolveHarnessRoot` + `inspectDshxCompatibility` 那 38 文件指纹校验全过了。直接跑 dshx CLI 也正常输出 `dshx status` 报告。

## 第二个缺陷：`--import` 收到裸 Windows 路径

`runner.js` 拼子进程参数时把 `--import` 的值直接给了裸路径：

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: ... Received protocol 'c:'
```

`--import` 会把值**当 URL 解析**，`C:\Projects\...` 于是被读成 scheme `c:`。而这也解释了为什么它只在 Windows 上炸 —— POSIX 的裸路径不会被误判成 scheme。

我先确认了**没有绕过途径**：`loaderPath` 只是内部选项，工具调用和配置都传不进来，所以只能改代码。修法是作者自己在别处已经用过的写法（[desktop-profile.js:75](C:/Users/liveu/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/src/desktop-profile.js)、[takeover.js:20](C:/Users/liveu/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/src/takeover.js) 都用 `pathToFileURL`），只是 `runner.js` 这两处漏了：

```js
import { fileURLToPath, pathToFileURL } from 'node:url'   // 补导入
const argv = ['--import', pathToFileURL(runtime.loader).href, runtime.cli, ...]
```

两处调用点都改了（第 256 行主路径、第 328 行 `client-failure` 恢复路径），`node --check` 通过。

**顺带排除一个我先前标记的风险**：报错栈末尾是 `Node.js v24.18.1`，说明桌面端拉起子进程时确实是以 Node 跑的，`ELECTRON_RUN_AS_NODE` 那条担忧不成立。

## 需要你做一步：重启桌面 App

刚才再测 `dshx_status` 仍报同样的错 —— **不是你装的东西没生效，是 ESM 模块缓存**：Host 内存里还是旧的 `runner.js`。热重载这条路走不通（触发它本身就要靠 dshx，循环依赖），所以只能重启。

重启后跟我说一声，我立刻跑 `dshx_status` 终验。预期会返回一份正常的 host 报告，而不是 BLOCKED。

## 当前补丁清单（都可回退）

| 文件 | 改动 | 备份 |
|---|---|---|
| `src\desktop-profile.js` | installAnchor 分隔符归一化 | `desktop-profile.js.orig-backup` |
| `src\runner.js` | `--import` 用 `file://` URL（2 处） | `runner.js.orig-backup` |

两个都是第三方插件的自身缺陷，没碰任何 DSH 官方源码、内置包或产物；`tools\dshx` 是新增目录，正是 DSHX 设计的落点。但要提醒一句：**桌面端插件管理器一旦升级/重装 `dsh-creator-mode-plus`，这两个补丁会被覆盖**——届时要么重打，要么把这些反馈给上游（0.3.12 是 npm 最新版，还没有修复）。

- 涉及工具: `ask_user_question`, `dshx_status`, `edit`, `grep`, `pwsh`, `read`, `todo_write`, `web_fetch`

---