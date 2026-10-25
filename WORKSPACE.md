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

### 平台登录态采集：`tools/dsh-browser-login.mjs`

`dsh-web-search-pro` 的平台搜索（知乎 / 微博）要**浏览器登录态**。这个脚本用 `dsh-browser` 自带的 Playwright + 本机 Edge 打开登录页，**你自己**扫码/输密码；脚本每 2 秒轮询会话 cookie，一出现就把 `storageState`（cookies + localStorage）原子写到输出路径并关窗。它**不接触账号密码**，只搬运浏览器已经拿到的 cookie：

```powershell
corepack pnpm dsh-browser-login zhihu                      # 默认 10 分钟等待、输出到 $DSH_HOME/data/dsh-browser/auth/zhihu.json
corepack pnpm dsh-browser-login weibo --timeout 15
corepack pnpm dsh-browser-login zhihu --out D:/secrets/zhihu.json
```

也可以直接调运行时 node（PATH 上没有 `node` 时）：

```powershell
& "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" tools\dsh-browser-login.mjs zhihu
```

拿到 JSON 之后写两处 profile 补丁：`dsh-browser` 的 `authProfiles.<平台>.storageStatePath` 指向它（`allowedDomains` 用该平台的域），`dsh-web-search-pro` 的 `browserBindings.<平台>.authProfile` 绑定同名 profile —— 脚本结束时会把这句提示连同 cookie 条数一起打出来。

| 选项 | 含义 |
| --- | --- |
| `--timeout <分钟>` | 等登录的上限，默认 10 |
| `--channel <名字>` | Playwright 通道，默认 `msedge`（与 `dsh-browser` 的 `channel` 保持一致） |
| `--edge <exe>` | 改用显式可执行文件（等价 `dsh-browser` 的 `executablePath`） |
| `--out <文件>` | 输出路径，默认 `$DSH_HOME/data/dsh-browser/auth/<平台>.json`（`DSH_HOME` 缺省 `~/.dsh`） |
| `--playwright <目录>` | playwright 包目录，默认 `<profile>/node_modules/playwright` |
| `--headless` | 无头；**无法人工登录**，只用于确认内核找得对 |

退出码：`0` 已保存 · `1` 用法/平台名/内核或 playwright 目录有问题 · `2` 超时未见登录 cookie。

### 向运行中的 DSH 会话发一条消息：`POST /obl-brand/session/message`

`@oblivion/brand` **v0.1.6** 起（v0.1.5 的这条路由在挂载期就被 Cordis 守卫炸掉了 —— 见已知限制 6），
宿主半边多了一条本地路由：把一条消息写进**指定会话**并立刻驱动一轮 agent。
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
- **它到底挂上了没有**：`GET` 这条路径。`405` = 已注册（handler 只收 POST，其余方法回 405）；
  `404` = 没注册成 —— 磁盘上的版本没被装载（node 半边要**重启 DSH** 才换），或挂载期抛了异常
  （后者会在 `%TEMP%\obl-brand-restart.log` 与宿主日志里留下一条 warn）。

### 每轮一条正式摘要：`tools/push-to-dsh.ps1`

把「在别处（OpenCode）做完一轮 → 这一轮的内容要能在 DSH 里看见」收成**一个动作**
（2026-10-17 所有者选定；上一节的手工 `Invoke-RestMethod` 仍然有效，但日常用这个）：

```powershell
# 摘要从文件读（多行、带引号/反引号/中文，别在命令行里转义）
powershell -NoProfile -ExecutionPolicy Bypass -File tools/push-to-dsh.ps1 `
  -Session session-10837d9b-ba07-420d-a8d3-3e14e1972481 -TextFile $env:TEMP\round.md

# 只认端口、只回显要发什么，不注入
powershell -File tools/push-to-dsh.ps1 -Session session-… -Text '一句话' -DryRun
```

| 它替你做的 | 为什么手工版容易踩 |
| --- | --- |
| **自己认端口**：`-Port` → 缓存 `<data>\brand-endpoint.json` → 心跳/装载留痕里的宿主 pid → 逐个探 `GET /obl-brand/plugins` | 端口每次启动都变，手工版每次都要重跑一遍认端口的循环 |
| **从文件读正文**（`-TextFile`） | 摘要是多行文本 + 引号 + 中文，命令行转义极容易发出去才发现少了一段 |
| **`requestId` 按内容算**（`sha1(session + 正文)` 前 12 位） | 同一段摘要重推两次不会在会话里出现两条 ⇒ 脚本重试是安全的 |

- **代价**：注入一条 = 驱动 DSH 跑一轮 agent（花额度、会真的产出回答）⇒ 它是「**每轮一条**」，不是「每步一条」。
- 认端口用的探测是 `GET /obl-brand/plugins`（只读，无副作用）；缓存**复用前也会重探一次**，
  所以宿主重启换了端口不会打到旧端口上。
- 实现里踩过的坑写在脚本注释里：`Get-ListeningPorts` 不能用 `$pid` 当循环变量
  （只读自动变量，PS 5.1 抛 `VariableNotWritable` —— 与 2026-10-16 的孤儿清扫同一个坑）。

### 从运行中的会话读回最近的问答：`GET /obl-brand/session/tail`

上一条是**只写**的：消息进 DSH、回答留在 DSH，调用方看不到 —— 「在别的工具里继续这条会话」只能走一半。
`@oblivion/brand` **v0.1.7** 起多了读回这一半，于是 `注入 → 等一轮 → 读回` 可以闭环：

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# 端口每次启动可变：GET /obl-brand/plugins 200 认端口（见上一节）
$port = 19387
$session = 'session-10837d9b-ba07-420d-a8d3-3e14e1972481'

Invoke-RestMethod "http://127.0.0.1:$port/obl-brand/session/tail?session=$session&limit=4" |
  Select-Object -ExpandProperty messages |
  ForEach-Object { "[$($_.role)] $($_.text)" }
```

| 参数 | 说明 |
| --- | --- |
| `session` | 会话 id（必填，`~/.dsh/sessions/<工作区>/<会话 id>/` 那个目录名） |
| `limit` | 返回条数，1..50，默认 6；单条正文上限 20000 字符（超出标 `truncated`） |

返回 `{ok, sessionId, messages:[{seq, at, role, text}], stats:{fileBytes, windowBytes, frames, brokenFrames}}`。
**只读**、只回本机调用方、与注入共用开关（`OBLIVION_BRAND_SESSION_INJECT`）；错误码 `400`（参数）/
`404`（无此会话）/ `405`（非 GET）/ `403`（外来 Origin 或开关关闭）。

两个坑写在 `oblivion-brand/README.md` 的「从指定会话读回最近的问答」一节：会话日志是**多帧 zstd**
（**Node 的 `createZstdDecompress` 只解第一帧**，必须按 magic 切帧逐帧解），以及回答要只取 `text` 块
（`reasoning` 是思维链，不算回答）。

实测（2026-10-17，v0.1.7 上机后）：读回 `session-10837d9b` 尾部 3 条，`stats = {fileBytes: 20032535,
windowBytes: 1048576, frames: 579, brokenFrames: 0}`；无参数 `400`、`limit=999` `400`、
`session=../../etc` `400`、不存在的会话 `404`、`POST` `405`、外来 Origin `403` —— 全部与设计一致。

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

> 🚧 **构建守卫（2026-10-17 加）**：`check` 与 `build` 都会**重写插件 client 产物**，而「DSH 运行中重写产物」
> 会让正在启动/刷新的界面起不来（根因与实测见已知限制 9）。所以这两个 task 在 DSH 活着时**默认直接拒绝**：
>
> ```powershell
> powershell -File tools/check-workspace.ps1 -Task build                  # DSH 开着 → 拒绝（并说明因果）
> powershell -File tools/check-workspace.ps1 -Task build -AllowRunning    # 覆盖：跑完立刻完全重启 DSH
> powershell -File tools/check-workspace.ps1 -Task build -Filter '@oblivion/core'   # 只构建无 client 半边的包
> ```
>
> 守卫的判词是「**这次构建会不会重写插件产物**」，不是「是不是构建」：`-Filter`（逗号分隔的**精确包名**）
> 把范围收窄到没有 client 半边的包时（纯 Host 插件只产出 `lib/*.js`），它一个插件产物都不碰，
> DSH 活着也安全 —— 这不是豁免，是把判定算准（**过度的规则会被绕过**，那才是真风险）。
> client 半边按 `exports["./client"]` 认（宿主找客户端就只认这一个字段），全工作区里带它的正好是
> `brand` / `daily-life` / `panel` / `vimc` 四个。
> `-Filter` 只对 `-Task build` 有意义，喂给别的 task 会**报错而不是静默忽略**。
>
> `typecheck` / `test` / `version` / `selfcheck` / `compat` / `install` 不受影响（它们不写 `lib/client.js`）。
> 守卫认两类证据：进程名 `DeepSeek Harness`，以及心跳/装载留痕里那个还活着的插件宿主 pid
> （后者让「从 DSH 内部跑构建」也会被拦下 —— 那同样是高危动作）。

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

### 6. Cordis「服务访问守卫」：读**未声明的服务**会**抛错**（挂载期的隐形杀手）

插件 `apply` 里拿到的 `ctx` 是带**服务访问守卫**的代理：读一个**没在本作用域 `inject` 过**的服务，
得到的是**异常**而不是 `undefined` ——

```
vendor/cordis/src/reflect.ts:144   cannot get property "x" without inject
```

`@oblivion/brand` v0.1.5 就栽在这上面：它在 `inject(['webServer'])` 的作用域里顺手读了一次
`scope.sessionController`（想当快路径）。结果是 `apply` 在那一步中断 —— 前三条路由已挂上、
会话注入那条没有，而外部表现是 **404**：与「这个版本根本没装」完全同形，且 **Cordis 不会把这条异常
冒到任何看得见的地方**（宿主日志、面板都没有痕迹）。v0.1.6 修掉，并把判据钉进自检。

跨插件的服务（如 api 层提供的 `sessionController`）只有两条**合法**通道：

| 通道 | 语义 | 出处 |
| --- | --- | --- |
| `ctx.inject(['sessionController'], (scope) => …)` | 声明过的依赖；就绪才回调（没就绪就一直挂着等） | `registry.ts:300` |
| `ctx.get('sessionController')` | 不参与响应式的原始取用，拿不到返回 `undefined`（作用域无关） | `reflect.ts:233` |

两条规矩由此而来：**① 作用域里只读 `inject` 声明过的东西**；**② 挂载期任何动作都要能把异常变成一条 warn**
——「路由静默消失」这种故障从外部看和「没装」一模一样，不留下痕迹就只能靠重启 + 猜测排查。

> 同族的第二种死法见 **已知限制 8**：这次不是「读服务」抛，而是**宿主的接口按自己的表校验入参**时抛
> （`systemPrompt.section()` 的 `order` 非有限数）—— 同样在 `apply` 半路掐断装载、同样在外部看只像
> 「某条功能没装」。两处都指向同一条工程规矩：**`apply()` 半路的 action 必须有留痕**。

### 7. `billion-context`（lane）从自己那份会话库**重建每个请求**：Anthropic 形状会把一对 `tool_use`/`tool_result` 拆开（2026-10-17 收窄）

现场：会话 `session-10837d9b` 在 `deepseek-account/deepseek-flash` 上**每轮 400**，报错永远指向同一次调用：

```
messages.<N>.1: `tool_use` ids were found without `tool_result` blocks immediately after: call_271ef71a7fed425c8482
```

`<N>` 随请求数组规模漂移（实测 1097 → 713 → 65 → 47），**call id 不变**；同一会话切到 `agnes-2.5-flash`
（OpenAI 形状、本机私网上游）一切正常 ⇒ 与「会话坏了」无关，是**请求形状相关**的问题。

**触发形态**（全部只读取证，没动任何数据）：会话 surface 里只有一条 assistant 消息的内容在两条 `tool-call`
之间**夹了 `text`**（`seq=18087`，`2026-10-10T14:22:49Z` 写入；它的两条 result 在日志里紧跟着 `18089`/`18091`，
内容非空）。它进日志后 **12 小时**才第一次 400（`2026-10-11T02:39:02Z`）⇒ **形态本身不是触发点**，
「每轮都把请求重写一遍」的那个动作才是（`session.v4.jsonl.zstd` 的 `time` 是 epoch 毫秒，此处与 lane 日志
一样按 UTC 记；DSH 界面按本地时区显示）。

**同一类 400 在别的会话也出现过**：`2026-10-06T09:08Z`（lane `0.1.185`）`session-70941d46…` 与
`session-e8a4ca50…` 报的是同一句措辞、另一条 call id（`call_436f4aeb9f78477a9544`）⇒ 不是这条会话独有的
形态问题，而是 lane 的 Anthropic 重建**会在某些历史形态下让 `tool_use` 丢掉紧跟的 `tool_result`**。

| 取证对象 | 事实 | 指向 |
| --- | --- | --- |
| DSH 的会话日志 `session.v4.jsonl.zstd` | tool-call 与两条 tool-result 三份记录俱全 | 磁盘上的历史是好的 |
| DSH 自己的 Anthropic 序列化器 `packages/llm/llm-deepseek/src/serialize.ts` | **在本地就校验配对**：孤儿会抛 `LlmError(… need immediate results)`，不会走到上游 | 拆配对发生在**序列化之后** |
| lane 自己那份会话库（`index.db`） | 那条消息被拆成 `assistant/tool-call` → `assistant/text` → `assistant/tool-call` 三条记录，其 `wireIndex=65` **正好等于**上游报的下标 | lane 的重建是唯一同时解释「下标吻合」+「形状相关」的一环 |
| lane 对**同一会话、同一请求**的 **OpenAI** 形状重建（本轮实验：压缩打开、T1 nudge + fold 生效） | `request: 311 msgs, inbound=652.4KiB → outbound=500.4KiB`，上游接受，`turn/end reason={"kind":"completed"}` | lane 的重建在 OpenAI 形状下是健康的 ⇒ 故障在其**Anthropic 形状的渲染** |

**这是本轮能做到的最强推断，不是逐字节实证**：lane 每请求都从自己的库重建数组（日志里每次都有
`dsh native compaction detected (…) → rebasing ACP state onto the compacted history (#2432)`）；
Anthropic 形状要求 `tool_result` **紧跟**其 `tool_use`，而它把夹在中间的 `text` 渲染成了一个独立消息 ⇒
上游看到「`tool_use` 后面没有 `tool_result`」。

**最小修复（已落配置，一条命令可回退）**：让这条上游的流量**不经过 lane 的会话状态重建**。

`~/.config/billion-context/billion-context.json`：

```json
{
  "dsh": { "allowDshCompaction": true },
  "passthrough": true,
  "providers": { "https://api.deepseek.com": { "passthrough": true } }
}
```

| 开关（依 lane 的 `CONFIGURATION.md`） | 语义 | 实测效果 |
| --- | --- | --- |
| `providers.<上游>.passthrough` | **路由级**：该上游逐字节转发、**不带会话状态** | 针对本故障的那一条（待验证，见下） |
| `providers.<上游>.direct` | **路由级**：该上游流量**完全不指向 lane**（客户端豁免） | 备选；若 `passthrough` 无效，用它区分「lane 的重建」与「链上别的拦截器」 |
| 顶层 `passthrough` | **全局**：不做压缩/工具注入/nudge，**但仍持有会话状态** | 实测**不足以**修这条 400（孤儿依旧、下标漂到 65）；对 agnes 形状有效（会话恢复可答） |
| `dsh.allowDshCompaction` | 放行 **DSH 原生压缩**（默认被 lane 以 422 拒） | 让那对被顶到边界外的 tool 对能被压缩**覆盖**掉（`selectCompactableRange`：region 取前缀 + `toolPairingBalancedBefore` 不切对，构造上拆不开配对）；实测占用 199% → 40% |

改动前都留了带时间戳的备份：`billion-context.json.bak-before-allow-dsh-compaction-*` ·
`.bak-before-passthrough-*` · `.bak-before-verdict-*`（同目录）。

> ⚠️ **别把顶层 `passthrough` 当成「关掉 lane」**：文档只承诺它「forward without compression / tool injection /
> nudging」，**会话状态仍在** —— 所以它对这条 400 无效（有实测）。`dsh.allowDshCompaction` 也只解决「DSH 想压缩但
> 被拒」，不解决「lane 每次重建」。

**还没定的一条**：路由级豁免到底够不够。`providers` 的键必须与上游**逐字**匹配 —— 没匹配上时 lane 会打
`[route] no provider route matched <host:…>`（匹配上就不打）。验证必须**把会话模型切回
`deepseek-account/deepseek-flash` 再发一轮**（本机没有别的 deepseek 流量能替代）。三种结果各有含义：

| 验证结果 | 结论 |
| --- | --- |
| 不再 400 | 定案：lane 的 Anthropic 重建是肇事者；deepseek 路由恢复（代价：这条上游不再被 lane 压缩） |
| 仍旧同一个 400 | 反证：不是 lane 的重建 ⇒ 回头查 DSH 侧，那时唯一的路是让 DSH 原生压缩**覆盖**那条消息（`/compact` 用 `retainTokens=0`、损失大；或临时降 `compaction-basic` 的 `thresholdRatio`/`retainTokens` 触发一次更激进的压缩）—— **两条都要先问所有者**，那是牺牲历史 |
| 换成别的错（例如 `reasoning_content` 类） | lane 的重写对本会话的 deepseek 路由是**必需**的（它会修 reasoning 配对，见下）⇒ 只能等 lane 修 Anthropic 重建，规避回到「覆盖那条消息」 |

**复核配方**（都不碰数据）：

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8        # 控制台是 GBK，中文乱码先修这一行
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# ① lane 的逐请求日志：400 原文、rebasing、路由匹配、nudge/usage
Get-Content "$env:USERPROFILE\.local\state\billion-context\bili.log" -Tail 60

# ② 会话日志是多帧拼接（一个 zstd 帧一段），Node 的 createZstdDecompress 只解第一帧 ——
#    必须自己按 magic 28 B5 2F FD 切帧、再逐帧 zstdDecompressSync（本轮用 %TEMP%\opencode\tail-frames.mjs）

# ③ lane 那份会话库（~8.8 MB SQLite）里这条消息被拆成几条、wireIndex 是多少：
#    运行时 node v24 自带 node:sqlite（DatabaseSync），不需要装 sqlite3
$db = "$env:USERPROFILE\.local\share\billion-context\sessions\index.db"

# ④ 宿主端口每次启动都会变：GET /obl-brand/plugins 200 认端口（见上一节）
```

**同一份日志里另外两处值得上报的 lane 缺陷**：
`reasoning-pair-violated: 121 assistant tool-call message(s) lack reasoning_content while 1 carry it — strict-echo
upstreams (DeepSeek thinking mode) will reject the request`；以及每请求重复的
`DIGEST DRIFT … migration parity broken`。报告草稿见
[`docs/上游问题报告-billion-context.md`](docs/上游问题报告-billion-context.md)（lane 版本 **0.1.197**）。

### 8. 「桥接一直 `present:false`」的两层死法：`apply()` 半路抛错（真机根因）+ 槽写不进候选作用域（2026-10-17 结案）

**症状**：`GET http://127.0.0.1:42081/oblivion/mcp/health` 一直
`endpoint.present:false, reason:"未找到通道"`，但 core 的捕获 / 图谱看着正常（照着「通道两端不同 realm」查了很久）。

**真机根因**：`apply()` 死在**注册认知段落那一行** ——

```js
// core（旧）：把「宿主会认识我们的段落名」当了真
order: host.systemPrompt.getSectionOrder('OBLIVION_COGNITION');   // → undefined
// DSH：getSectionOrder 只是查它自己的表（HARNESS_IDENTITY / PLAN_POLICY / TOOL_* / …）
//      section() 对非有限 order 直接抛：
//      TypeError: prompt section "OBLIVION_COGNITION" order must be a finite number
```

抛错位置在**发布通道之前** ⇒ 9 个工具、认知段落、`provide('oblivion')`、MCP 通道全都没跑；
宿主（Electron utility process）里读不到 `console` ⇒ 外部唯一可见的症状就是「通道不见了」。
修法见 [`CHANGELOG.md`](CHANGELOG.md)（`resolveSectionOrder` + 兜底位 `650`），并给 `apply()` 加了
`stage`/`error` 留痕。

**为什么四层闸门全绿**：桩 ctx 把 `getSectionOrder` 写成 `() => 50`，替宿主答了一个它**不会给**的数。
**教训：桩不许比真宿主更强** —— 未知名就回 `undefined`，并断言段落 `order` 是有限数（两处桩都已改，
core 自检的这条现在是回归位）。

**复核配方**（都不碰数据）：

```powershell
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# ① 两侧对照之一 —— 桥接视角（健康路由故意公开、不需要 token）
Invoke-RestMethod http://127.0.0.1:42081/oblivion/mcp/health | ConvertTo-Json -Depth 8
#    present / owner / version / tools[] / pid / scopes[]{scope,available,hasKey,valueTag,mapLike,slots}
#    两侧 hasKey 都 false ⇒ 发布侧根本没发布（往下看 ②）
#    valueTag 不是 [object Map] ⇒ 键被别的东西占住了
#    mapLike:true 而 slots:-1 ⇒ 表在、但读不出来（跨 realm 认表失败的旧病）

# ② 两侧对照之二 —— core 视角（装载走到哪、抛了什么）
Get-Content "$env:USERPROFILE\.oblivion\data\mcp-channel-diag.json" -Raw
#    stage=apply:failed ⇒ error 就是装载死因（本轮靠它一句话定案）
#    stage=apply:done 而 ① 仍 present:false ⇒ 两侧不同进程/作用域（比 pid）
#    writeError 字段 ⇒ **上一次**落盘失败过（原因原文就在字段里；这一笔是成功的）—— 0.2.12 起才有
#    pid 应与 ① 的 endpoint.pid 相同；不同 ⇒ 这份文件是测试进程写的（见「假证据警报」）
#
#    历史坑（core **0.2.12 已修**，留档防复现）：三处调用是即发即忘的（`void`），两笔写入并发
#    rename 到**同一路径**时后发的可能先落地，文件于是停在 apply:mcp 而 apply:done 明明已经发过；
#    换句话说「看到 apply:mcp」曾经**不能**判「没走到最后」。现在落盘按调用顺序串行 + 失败重试 +
#    失败留痕，文件里的 stage 就是最后发出的那一笔。复核：core 单测
#    「MCP 通道诊断文件（diag.ts：串行落盘 + 失败留痕）」两条。
#
#    上机实测（2026-10-17，core 0.2.12 重启后）：version=0.2.12 且 stage=apply:done —— 此前这个文件长期
#    停在 apply:mcp；同一时刻桥接 /oblivion/mcp/health 也回到 present:true / version 0.2.12 / ready:true。
#    这是两侧对照第一次同时给出**正向**证据（不是靠推断排除）。

# ③ 通道真活着的端到端证据（要 token；别把 token 打进日志/分享）
$h = @{ 'Content-Type'='application/json'; 'Accept'='application/json, text/event-stream';
        'Authorization'="Bearer $([Environment]::GetEnvironmentVariable('OBLIVION_BRIDGE_TOKEN','User'))" }
Invoke-WebRequest -UseBasicParsing -Method POST http://127.0.0.1:42081/oblivion/mcp -Headers $h `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | Select-Object -Expand Content
```

**假证据警报**：诊断文件分两类，都先核对再下结论 ——

| 文件 | 谁写 | 核对什么 |
| --- | --- | --- |
| `data/mcp-channel-diag.json`、`data/status.json`、`data/mount-diag.json` | 真机 = 插件宿主；也可能被测试写 | `pid` / `env.electron`（测试进程 `electron` 为空串）；`mountedAt` 贴着启动时刻才是真机的 |
| `bridge-heartbeat.json` | 真机 = bridge 插件；也可能被自检写 | `resolvedPort` 是否是 42081（实测自检会把它写成自检端口）。**注意里面的 `mcpEndpoint` 是「装载瞬间」的快照**：桥接可能比 core 先装载，此时 `present:false` 属正常 —— **判断通道活着要用 `/oblivion/mcp/health`**，不是看这个文件 |

`test/core.test.mjs` 原有 4 处 `mod.apply(ctx, {})` 走 `DEFAULT_CONFIG`（真数据目录 + 真知识库，
面板上 `status.json` 撕裂的根因），现已改 `applyInTemp()`（系统临时目录）；bridge 的心跳同理
（`heartbeatPath` 配置 + 两侧自检断言）。即便如此，**看完 `pnpm test` 的任何诊断结论前先核对上面两列**
—— 本轮就被这条误导过一次。真机心跳若被写坏，**下次 DSH 启动时 bridge 会自己重写**
（`apply()` 一进来就写，不用等端点解析）。

### 9. 应用运行中重建插件 ⇒ 界面起不来（`web boot: N entries did not activate`，2026-10-17 结案）

**症状**：更新插件后 DSH 弹「DeepSeek Harness 无法使用 / 应用无法启动或已意外停止」，详情里是
`web boot: 4 entries did not activate` 与 `client-modules: bundle script plugins/??…&rev=… failed to load`。
一直靠「禁用第三方插件、备份 profile patch 并重启」救回来（每次都这么干很烦）。

**根因**（DSH 侧的机制，逐条可核）：

| # | 机制 | 位置 |
| --- | --- | --- |
| ① | client 产物的 `rev = sha1(mtimeMs, ctimeMs, size)` ⇒ **任何重写都换 rev** | `dsh-client-modules/lib/index.js:193` |
| ② | 路由按**含 rev 的完整 URL** 精确查表，查不到就是 `404` | 同上 `:958` |
| ③ | `compose()` 只保留**上一代** batch 响应 | 同上 `:681` |
| ④ | 一个脚本加载失败 ⇒ **整条 combo 批被跳过**（"skipped after an earlier failure of this bundle"） | `dsh-client-modules/lib/client.js:629` |

⇒ 应用**运行中**重建插件：界面手里仍是旧 rev 的 URL，而宿主只认当前一代 ⇒ `404` ⇒ 那一批全废 ⇒
`web boot: N entries did not activate`。**2026-10-17 01:48Z 实测**：4 个未激活 entry 与当时被重写的
4 个 client 包**逐一对应**（`panel` / `brand` / `daily-life` / `vimc`）；崩溃日志
`%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-2026-10-17T01-48-07-569Z-web-boot.log`。

**所以 `pnpm check` 本身就是高危动作**（它含 build）—— 现在构建前会被拦，见「检查：四层闸门」的构建守卫。

**它不是我们插件独有的**：同一天 02:25Z 又崩了一次（`crash-2026-10-17T02-25-13-030Z-web-boot.log`），
这次 4 个未激活 entry **全是第三方插件**（`billion-context` / `dsh-free-search` / `dsh-better-sidebar` /
`dsh-cost-meter`），我们的四个一个都没事。对上时间线就看得很清楚：

| 时刻 | 事情 |
| --- | --- |
| 10:21:50 / 10:22:05 | 第三方插件 `dsh-better-sidebar` / `dsh-cost-meter` 的 `lib/client.js` 被写入（更新插件） |
| 10:25:13 | web 界面启动，手里是旧 rev ⇒ 404 ⇒ 4 个 entry 未激活 ⇒ 弹「无法使用」 |
| 10:28:40 | 重启后一切正常（rev 按当前文件重算） |

（`dsh-free-search` 的 `lib/client.js` mtime 还是 10-06，但同一次 install 会改 `ctime` —— 而 rev 把
`ctimeMs` 也算进去，所以它照样换了 rev；这正是「别只看 mtime」的原因。）

⇒ **规则与谁在写无关**：任何插件（官方 / 第三方 / 我们的）的 client 产物在「界面启动或刷新」附近被重写，
都会有这一幕。构建守卫只能管住我们自己那一半；第三方插件的更新要靠**「更新完立刻完全重启 DSH」**这条规程。

**上游侧另有两条可核的机制缺陷**（issue 草稿： [`docs/上游问题报告-dsh-client-modules.md`](docs/上游问题报告-dsh-client-modules.md)，正文英文）：

- **一个脚本失败连坐整条 combo 批** —— `failedBundleUrls` 记的是「整条批」，此后**所有**用这条批的行
  都直接 `skipped after an earlier failure of this bundle`（`lib/client.js:629-637`）。于是「某一条 URL 陈旧」
  会扩散成「四个无关包不激活」。
- **只保留一代 batch 响应，且不留上一代的单包 URL** —— `previousBatchResponses` 只装上一代的 combo
  （`lib/index.js:681`，查表在 `:962`），而单包 URL 只有**当前**一代（`:668-680` 只把 chunk 类带过去）。
  页面手里的单包 URL 只要落后一代就是 404 —— 而它正是 `client.js:595-608` 注释里承诺的兜底路径。

另外两条更轻的、也写进草稿里：`artifactRevision` 把 **`ctimeMs`** 算进去（`lib/index.js:193-199`），
所以「字节完全相同的重写」也换 rev（`dsh-free-search` mtime 还是 10-06 却照样换了 rev 就是这个原因）；
失败文案只说 `failed to load`，**不带 HTTP 状态**，404 与真脚本报错长得一模一样。

**怎么办**：① 完全退出 DSH → 构建 → 再开（最稳）；② 或构建完**立刻完全重启** DSH（不是只刷新窗口）。
弹了那张对话框时，先确认没有 node/pnpm 还在写文件，再点「**重启**」；
「禁用第三方插件、备份 profile patch」是最后手段，不该成为常规步骤。

**复核配方**（一行就能换掉 rev，但**别在真机上随手试** —— 它会把界面打掉，只能靠重启救回来）：

```powershell
(Get-Item oblivion-brand\lib\client.js).LastWriteTime = Get-Date   # rev 变 → 旧 rev 的 URL 将 404
```

### 9b. 渲染进程 OOM 后 web 层重启连带失败（2026-10-25 未结案）

**症状**：renderer OOM（`Desktop renderer exited: oom`），42 秒后 web 层重启时核心 client 包加载失败
`desktop web: failed to load plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=1e8e9ecd5d2e`。

**根因推断**：与 9a 同机制（rev 不匹配 ⇒ 404），但触发链不同——
不是「我们重建插件导致 rev 变化」，而是「renderer OOM 后宿主重启 web 层，
而核心 client 包恰好在 OOM 前后被重建（mtime/ctime 变了，rev 也随之变了），
宿主手里握的是旧 rev 的 URL，加载时 404」。属于**启动竞态**，不是配置损坏。

**与 9a 的区别**：

| | 9a（2026-10-17） | 9b（2026-10-25） |
|---|---|---|
| 触发源 | 我们重建插件（mtime 变化） | renderer OOM + 宿主重启 web 层 |
| 未激活 entry | 4 个（panel/brand/daily-life/vimc） | 4 个（全是第三方） |
| 共同点 | rev 不匹配 ⇒ 404 ⇒ 整条 combo 批跳过 | 同左 |

**处理动作**（用户执行）：
1. 关闭挂掉的 DeepSeek Harness 进程（5 个）；
2. 重新启动 `C:\Programs\AITech\DeepSeekHarness\DeepSeek Harness.exe`；
3. 验证：进程 5 个全 Responding、端口 16887 / 42081 可访问、无新崩溃日志。

**后续提醒**：若再次出现同类崩溃，先确认 OOM 原因（renderer 内存泄漏 or 超大会话日志），
再决定是否清 Code Cache（`rev` 依赖 Code Cache，清 cache 会强制重新生成）。
直接点弹窗第三个按钮「禁用第三方插件、备份 profile patch 并重启」最稳。

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
