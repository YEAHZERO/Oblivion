# Oblivion

DeepSeek Harness（DSH）**外部插件开发工作区**。

本仓库只存放用 Creator Mode+ / DSHX 开发的外部插件源码 —— 不包含、也不修改 DSH 官方源码。

## 插件放在哪

`dshx_scaffold` 把插件源码建在**本工作区根目录**下，一个插件一个目录：

```
Oblivion/
└── <plugin-name>/                 ← 插件源码，本仓库跟踪
    ├── src/<plugin-name>.ts
    ├── src/client/index.tsx       ← kind=client 时
    ├── package.json
    ├── dshx.yml                   ← id / entry / marker / kind
    ├── cordis.yml                 ← 相对路径 overlay
    └── tsconfig.json, tsdown.config.ts   ← kind=client 时
```

同时在 Harness checkout 里建一个**符号链接**指回工作区：

```
C:\Projects\deepseek-harness\my-plugins\<plugin-name>
    ->  C:\Projects\Oblivion\<plugin-name>
```

源码只存在于工作区，harness 侧只有链接 —— 所以**本仓库是插件源码的唯一事实源**。

## 环境前置

| 项 | 值 |
| --- | --- |
| Harness checkout | `C:\Projects\deepseek-harness`（tag `dsh-v0.2.0-rc.2`，HEAD `639ed01539`） |
| DSHX | `C:\Projects\deepseek-harness\tools\dshx`（v0.9.5） |
| 指向配置 | `C:\Users\liveu\.config\dshx\harness`，内容为 Harness checkout 路径 |
| 备选 | 环境变量 `DSHX_HARNESS`（需重启 DSH 才生效；配置文件方式无需重启） |
| **包管理器** | **DSH 分发的受控 pnpm**：`%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\{node\bin\node.exe, pnpm\bin\pnpm.mjs}`（pnpm 11.7.0）—— 不要求系统装 Node/pnpm |

Windows 需要**开发者模式**才能创建符号链接（DSHX 全程使用 `symlinkSync`，无 junction 回退）。

## 依赖模型：pnpm workspace（2026-10-05 起）

本仓库的**开发期依赖**走 pnpm workspace，与 DSH 的 Profile 模型同源（依赖只存一份、框架包只放 peer）：

```
Oblivion/
├── package.json           # private 根；packageManager: pnpm@11.7.0；-r 聚合脚本
├── pnpm-workspace.yaml    # packages: ['oblivion-*'] + allowBuilds: { esbuild: true }
├── .npmrc                 # auto-install-peers=false · strict-peer-dependencies=false · hoist=false
├── pnpm-lock.yaml         # 工作区唯一 lockfile（入库）
└── oblivion-*/            # 各插件包（依赖在各自 node_modules 里只是符号链接）
```

```powershell
# 推荐：工作区统一入口（运行时解析 DSH 运行时位置，不要求 pnpm 在 PATH 上）
powershell -File tools/check-workspace.ps1              # install + typecheck + test + build + 版本一致性
powershell -File tools/check-workspace.ps1 -Task test   # 只跑测试

# 或者直接调运行时
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
& $node $pnpm install
& $node $pnpm -r run build
& $node $pnpm -C oblivion-vimc run test
```

迁移前后（同一台机器实测）：

| 指标 | npm（迁移前） | pnpm workspace（迁移后） |
| --- | --- | --- |
| `oblivion-brand/node_modules` | 38.0 MB / 313 文件 | **0.02 MB / 12 项（5 个符号链接）** |
| `oblivion-vimc/node_modules` | 54.7 MB / 3626 文件 | **0.02 MB / 12 项（9 个符号链接）** |
| 实体依赖 | 两处各自一份（合计 ~92.7 MB） | 根 `node_modules/.pnpm` **一份**（~55 MB，两插件共享） |
| lockfile | 每插件一个 `package-lock.json` | 一个 `pnpm-lock.yaml` |

**铁律**（与 DSH Profile 一致，违反会让工具调用崩）：

1. 框架包 `@deepseek-ai/*` **只放 `peerDependencies`**，绝不放 `dependencies`；配套 `auto-install-peers=false`。
2. 依赖安装脚本默认不执行；需要时在 `pnpm-workspace.yaml` 的 `allowBuilds` 里**逐包显式放行**（当前仅 `esbuild`）。
3. `hoist=false`：插件必须显式声明依赖，不允许"碰巧 require 到"。
4. **不要在插件目录里跑 `npm install`** —— 会重新长出每目录一份的实体 `node_modules`。

## 常用命令

Creator Mode+ 会话里直接说需求即可，Agent 会调用固定的 `dshx_*` 工具。手工核对时也可以用 CLI：

```powershell
$dshx = 'C:\Projects\deepseek-harness\tools\dshx'
node --import "file:///$($dshx -replace '\\','/')/node_modules/tsx/dist/esm/index.mjs" `
     "$dshx\src\cli.ts" status --harness 'C:\Projects\deepseek-harness'
```

> 注意 `--import` 必须接收 `file://` URL：裸 Windows 路径会被当成 `c:` 协议而报
> `ERR_UNSUPPORTED_ESM_URL_SCHEME`。

### 搜索链路的密钥自检：`tools/key-search.ps1`

`dsh-free-search` / `dsh-web-search-pro` 重装、换引擎，或改了 profile 补丁之后，用它**绕过插件路由**直连带密钥的搜索 API，把"key 还在"和"网络通"分开验证：

```powershell
powershell -NoProfile -File tools\key-search.ps1 -KeyStatus                        # key 有没有、来自哪一层
powershell -NoProfile -File tools\key-search.ps1 -Query '关键词' -Provider all -N 5  # exa + tavily + firecrawl 并发合并
powershell -NoProfile -File tools\key-search.ps1 -Query '关键词' -Text -MaxChars 4000 # 取正文
```

也可以走工作区脚本别名（参数直接追加，不需要 `--`；本机 `pnpm` 不在 PATH 上，用 `corepack` 带着走）：

```powershell
corepack pnpm key-search -KeyStatus
corepack pnpm key-search -Query '关键词' -Provider all -N 5
```

引擎用的环境变量名与 `dsh-free-search/lib/index.js:2903-2921` 的映射一致（`EXA_API_KEY` / `TAVILY_API_KEY` / `FIRECRAWL_API_KEY`）。**读 key 顺序 = 显式参数 > User 注册表 > Machine > Process**：DSH 给 agent shell 做了脱敏，会话里 `$env:EXA_API_KEY` 是空的，只有 User 层注册表拿得到，所以 User 排最前。

退出码 `0` 有结果 / `1` 引擎失败或零结果 / `2` 用法错误。两个坑别踩：5.1 的 `-File` **不能绑定名为 `-Engine` 的参数**（exit `-1`、零输出），所以参数叫 `-Provider`；`opencode` 引擎在 5.1 下要转义 JSON 里的引号（脚本内已按版本处理）。

### 向运行中的 DSH 会话发一条消息：`POST /obl-brand/session/message`

`@oblivion/brand` v0.1.5 起，宿主半边多了一条本地路由：把一条消息写进**指定会话**并立刻驱动一轮 agent。
它走 App 自己的 `sessionController.prompt`（UI 的「发送」按钮、DSH 给 agent 注入审批通知用的都是同一条链），
所以消息会**实时**出现在 DSH 里 —— 这是「在别的工具里继续这条会话」的正路；**不要**去改
`session.v4.jsonl.zstd`（运行中的 DSH 用内存状态渲染、不重读日志，追加帧既不会实时显示还会撞 seq、
更有让整条会话读不出来的风险。理由见 [`CHANGELOG.md`](CHANGELOG.md) 与
[`oblivion-brand/README.md`](oblivion-brand/README.md)）。

宿主 webserver 的端口每次启动都可能变（本机实测同时监听两个端口，另一个是 CDP），用
`/obl-brand/plugins` 探出对的那个：

```powershell
$host_pids = (Get-Process | Where-Object ProcessName -like '*Harness*').Id
$port = (Get-NetTCPConnection -State Listen |
  Where-Object { $host_pids -contains $_.OwningProcess } | ForEach-Object {
    try { if ((Invoke-WebRequest "http://127.0.0.1:$($_.LocalPort)/obl-brand/plugins" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { $_.LocalPort } } catch { }
  }) | Select-Object -First 1

$body = @{ sessionId = 'session-…'; text = '继续'; mode = 'queue' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/obl-brand/session/message" `
  -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

- `mode`：`queue`（默认，排到下一轮）/ `steer`（插入正在跑的这一轮）；`text` 上限 20000 字符。
- `requestId` 可选幂等键：重试用同一个 id 才不会重复投递。
- 状态码：`400` 参数不合法 · `403` 外来 Origin 或开关关闭 · `404` 会话不存在 · `502` 会话接口拒绝
  （带远端 `code`）· `503` 宿主里取不到会话服务。
- 只回本机调用方；`OBLIVION_BRAND_SESSION_INJECT=off|0|false|no` 可整条关掉。

## 检查：四层闸门

工作区的检查规范在 **[`docs/检查方法.md`](docs/检查方法.md)**。要点：

| 层 | 抓什么 | 脚本 |
| --- | --- | --- |
| ① 版本一致性 | `VERSION` 与 `package.json` 漂移 | `scripts/bump-version.mjs --check` |
| ② 类型 | 类型错误、接口不匹配 | `tsc -p tsconfig.json --noEmit` |
| ③ 单元测试 | 纯逻辑、边界值、异常输入 | `node --test`（`test/*.test.mjs`） |
| ④ **端到端自检** | **产物能否被真实装载**、契约形状、装载副作用 | `scripts/selfcheck.mjs` |

```powershell
powershell -File tools/check-workspace.ps1                # 全部四层
powershell -File tools/check-workspace.ps1 -Task selfcheck# 只跑第 ④ 层
```

**第 ④ 层不可省**：前三层验源码，它验产物 + 装载行为。2026-10-06 的 App 崩溃、
路由数变化、缺失导入，全是它抓出来的。典型只有它能抓的故障：`inject` 声明了宿主
没有的服务（不报错，静默 pending）、`lib/` 裸导入解析失败、`effect` 没返回 disposer
导致 HMR 重载泄漏端口。

> ⚠️ **`pnpm -r --if-present` 对缺 script 的包静默跳过** —— 新建插件时若不补
> `scripts.selfcheck`，`check` 会显示全绿而实际没检查它。当前哪些包缺哪一层，
> 见 `docs/检查方法.md` 第六节的台账。

## 红线

DSH 官方源码、内置包、官方构建产物一律**只读**，临时副本和 worktree 也不例外。
缺少公开接口时调整插件方案，不要改 Host。构建产物留在插件目录内部。

## 已知限制（本机实测，2026-10-04）

### 1. 服务端热重载在 Windows 桌面端不可用

DSHX 的 host discovery 依赖 POSIX 工具（`tools/dshx/src/internal/host-discovery.ts`）：

```js
spawnSync('ps',   ['-axo', 'pid=,ppid=,command='])   // 进程表
spawnSync('ps',   ['-o', 'lstart=', '-p', pid])      // 进程启动时间
spawnSync('lsof', ['-a', '-p', pid, '-Fn'])          // 打开的文件
```

Windows 上没有支持 `-o`/`-axo` 的 `ps`，`lsof` 也不存在，因此 `discoverWebHosts`
恒为 `complete: false`。实测影响：

| 流程 | 影响 |
| --- | --- |
| `dshx scaffold` / `check` | 不受影响 |
| `dshx activation-plan` | 优雅降级：`activation.ts` 在 discovery 不完整时保守置 `hasHost = true` |
| `dshx activate-new-client` | 不受影响（走桌面桥接，不经 host discovery） |
| `dshx hot-reload` | **硬抛**：`hot-reload.ts` 的 desktop identity 与 process-start 两处校验 |
| `dshx update apply/rollback` | 硬抛；但源码变更阶段在 Creator Mode+ 里本就已禁用 |

> **约定：服务端代码改完重启 DSH App 生效，不要依赖热重载。**

### 3. DSHX 的 MCP 工具面在本机全废，但 CLI 的 `check` 可用（2026-10-05 实测补充）

`dshx_check` / `dshx_activate_new_client` / `dshx_activation_plan` / `dshx_scaffold` /
`dshx_browser_open` 在本会话**全部**返回同一句：

```
dshx creator
ERROR  creator   Creator+ Host identity is incomplete: process start time unavailable for pid <pid> (exit-1)
```

原因与第 1 条同源：这些工具在桥接层**先跑 `dshx creator claim`**，而 claim 依赖
`ps -o lstart=`（`internal/host-discovery.ts`）→ Windows 上恒失败。也就是说
**Creator Mode+ 的整条「scaffold → claim → check → activate」链路在本机走不通**，
不只是 hot-reload。

但**同样的 `check` 用 CLI 直接跑是好的**（它不经过 claim 包装）：

```powershell
$dshx = 'C:\Projects\deepseek-harness\tools\dshx'
node --import "file:///$($dshx -replace '\\','/')/node_modules/tsx/dist/esm/index.mjs" `
     "$dshx\src\cli.ts" check '<插件目录>' --harness 'C:\Projects\deepseek-harness'
```

本机可用的替代挂载路径（`@oblivion/vimc` 就是这么装的，**不需要重启 App**）：

```powershell
# ① 官方 CLI 装 link: 依赖（正斜杠；反斜杠会被桌面包管理器拒掉）
& 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd' `
  plugin --profile desktop add 'link:C:/Projects/Oblivion/<插件目录>'

# ② 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 追加插入行
#    （@ 开头的 YAML 标量必须加引号）
# - insert:
#     - id: '@oblivion/<插件>'
#       name: '@oblivion/<插件>'
```

实测结论（对未来的会话很重要）：

| 事项 | 结论 |
| --- | --- |
| profile 补丁层是否被监视 | **是**。补丁落盘同一秒，新行就被 Host 装载（插件自身的启动自证文件立刻出现） |
| 客户端半边是否需刷新页面 | **不需要**。图重算后客户端模块表增量重组，插件在活动页面里自动重挂 |
| 宿主半边改代码 | **需重启 App**（Host 复用 ESM 缓存里的模块命名空间，禁用再启用不会重新导入） |
| 清单里的 `dsh.bundle` | 有它 = profile 层（改一次要重启）；没有 = 普通依赖 + 补丁插入行（可热挂）。两者别混 |
| 本仓库怎么选 | `brand` = bundle 层；**`vimc` 2026-10-06 由所有者裁定从 bundle 层改回热挂**（迭代免重启 > 换机器不丢）；`core`/`panel` 的行由 `@oblivion/bundle` 的 patch 提供。热挂缺行由 `verify-dsh-compat.ps1` 的 `patchInsert` 断言抓（包在 `dsh.compat.requires.patchInsert` 里声明自己的 id） |
| 桌面 profile 的 CLI 权限 | `dsh plugin` 子命令放行（普通 `dsh` 会拒绝「由 Electron 独占管理」） |

### 2. `dsh-creator-mode-plus` 在本机打了两个 Windows 补丁

补丁位于 `~/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/`，
原文件备份为同目录 `*.orig-backup`。**插件升级或重装会覆盖它们**，届时需重打：

| 文件 | 问题 | 修法 |
| --- | --- | --- |
| `src/desktop-profile.js` | `installAnchor` 由 `path.join` 生成，Windows 下是反斜杠，`endsWith('/node_modules/…')` 恒假 → 整个插件激活失败 | 归一化分隔符后再比较 |
| `src/runner.js` | `--import` 收到裸 Windows 路径被当作 `c:` 协议 → `ERR_UNSUPPORTED_ESM_URL_SCHEME` | 改用 `pathToFileURL(loader).href`（两处调用点） |

两者都是插件自身的跨平台缺陷，与本仓库无关，建议反馈上游
（`dsh-creator-mode-plus` 0.3.12 为 npm 最新版，尚未修复）。

### 4. `dshmarket` 在本机打了一个补丁（热挂 `id` 引号解析）

`~/.dsh/profiles/desktop/node_modules/dshmarket/lib/hot.js:161` 把解析 `id` 的 `\S+`
改成与同文件 `:168` 一致的可选引号写法；原文件备份为同目录 `lib/hot.js.orig-backup`。
**市场升级会覆盖它**，重打用脚本（幂等、自动备份、上游改写了那一行时拒绝执行并 exit 1）：

```powershell
pwsh -File tools\patch-dshmarket-hot-id.ps1            # 默认 desktop
pwsh -File tools\patch-dshmarket-hot-id.ps1 -DryRun    # 只看不做
```

不打补丁的症状：经市场热挂**任何 `@` 作用域插件**都会失败（它写回的热点 YAML 被拼坏），
表现为「退化成重启」，功能不受损但每次都要重启。补丁在 App 重启后生效。
细节与实证见 [`HANDOFF.md`](HANDOFF.md) 坑 12 与 [`CHANGELOG.md`](CHANGELOG.md)。

### 5. `dsh-deepseek-web-login` 的子进程不随宿主退出（不补丁，改由 `@oblivion/brand` 清扫）

`~/.dsh/profiles/desktop/node_modules/dsh-deepseek-web-login`（第三方，`cv-superding`）
用无头 Edge 跑传输，profile 在 `~/.dsh/web-login/transport-profile`。它在 DSH **被硬杀**
（brand 的重启按钮 / 任务管理器 / 崩溃）时来不及关子进程，那些 msedge 变成孤儿并继续占着
profile 目录，于是下一次探活 `rmSync` 抛 EPERM，**面板上几个账号全部校验失败**（`lastCheckError` 被写脏）。

这里**不打第三方补丁**：拉起方式改不动（升级即覆盖），清扫放在外面更稳。归属与判据在
[`oblivion-brand/README.md`](oblivion-brand/README.md) 的「孤儿进程清扫」一节（`src/orphans.ts`）：
装载时、重启前、重启 helper 内三处清扫，面板另有「清理孤儿进程」按钮（`POST /obl-brand/orphans`，不重启）。
装载期清扫可用 `OBLIVION_BRAND_ORPHAN_SWEEP=off` 关掉。

手工核对命令（把 profile 目录换成任何一次性目录即可安全试）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\obl-brand-orphans.ps1" `
  -Mode orphans -ProfileDir "$env:USERPROFILE\.dsh\web-login\transport-profile"
```

## 应用图标：只能改快捷方式，改不了窗口/任务栏

DSH 桌面端有三处「图标」，来源各不相同（依据 `app.asar/lib/main.js`）：

| 界面位置 | 图标来源 | 代码 |
| --- | --- | --- |
| **窗口 / 任务栏 / Alt-Tab / 开始菜单** | **exe 内嵌 PE 资源** | `main.js:11075` 创建主窗口时**未传 `icon`** → Electron 回退到可执行文件图标 |
| 「关于」面板 | `resources\icon.png` | `main.js:11845` → `setAboutPanelOptions` |
| 系统托盘 / 退出确认框 | `resources\tray.ico` | `main.js:11937` / `:11967` |

**窗口与任务栏图标无法替换**：它编译在 `DeepSeek Harness.exe` 的 PE 资源里。
客户端插件跑在渲染进程（`dsh-client-modules` 里零处触达 `electron`/`ipcRenderer`），
`dsh-desktop-host` 也没有暴露任何图标 API（`setIcon`/`nativeImage`/`icon:` 一处都没有）；
而且主窗口创建时压根没传 `icon`。后两者虽是普通文件，但位于官方安装目录，
属于随发行版附带的产物，**不改**。

可以合法替换的是**用户自己的快捷方式**（`.lnk` 的 `IconLocation`），
它决定桌面与开始菜单的显示：

```powershell
# 换成你自己的 .ico（默认用 %LOCALAPPDATA%\Oblivion\polaris.ico）
pwsh -File tools\set-shortcut-icon.ps1 -Icon 'C:\path\to\your.ico'

# 还原成 exe 自带图标
pwsh -File tools\set-shortcut-icon.ps1 -Restore
```

首次运行会把现有 `.lnk` 备份到 `%LOCALAPPDATA%\Oblivion\shortcut-backup\`。

> ⚠️ 备份**必须按来源命名**（`desktop-` / `startmenu-` 前缀）。两个快捷方式同名，
> 不带前缀时第二个会命中「已备份」而跳过，而第一份如果是在改动**之后**才拷的，
> 备份里记录的就是**已改动**的状态 —— `-Restore` 会还原不回原样。
> 脚本已按来源命名；若手工操作请照此办理。

换完如果资源管理器仍显示旧图标，那是图标缓存：注销重登，或运行 `ie4uinit.exe -show`。
已固定到任务栏的项、以及运行中的窗口，用的仍是 exe 内嵌图标，不受影响。
