# @oblivion/brand

Oblivion 品牌插件：把 DSH 侧栏与会话 Hero 的品牌换成**北极星**（或你自己的图片），品牌名文字与图形都可在设置里改；可以把**可嵌入的插件面板**挂到左侧栏；随时可以**关闭接管**让 DSH 恢复原生外观。

全部走 DSH 的公开槽位 API，没有改任何官方包。

## 设置项

入口：**设置 → Oblivion 品牌**

| 设置 | 作用 |
| --- | --- |
| **接管 DSH 品牌** | 关闭即 **dispose** 本插件的品牌槽位注册，官方鲸鱼图标与 wordmark **立即恢复**（无需卸载插件、无需刷新） |
| **品牌图形** | 上传任意浏览器可解码的图片（PNG / JPEG / WebP / GIF / SVG / AVIF / BMP / ICO）。>256px 的位图自动缩放，SVG 保持矢量；也可一键「恢复北极星」 |
| **品牌名文字** | 侧栏品牌行的文字，留空则只显示图形 |
| **面板显示** | 内容是否居中限宽。同一面板会出现在两个宽度差异极大的容器里（设置弹窗很窄、挂到左侧栏后是整窗宽），居中时限宽 620px 并水平居中，关闭则贴左。**只作用于本面板**，不影响其它插件的面板 |
| **左侧栏面板** | **多选**：勾选的插件面板以独立条目出现在左侧栏「插件」下方 |

## 个人已安装插件

设置面板里的「个人已安装插件」列出本 profile 装过的第三方插件，每条旁边一个「复制」，得到重装命令：

```powershell
dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-core'
dsh plugin --profile desktop add ^0.24.1
```

- 数据来源是 profile 目录**本身**（`package.json` 的 `dependencies` 与 `dsh.profile.bundles`、
  `cordis.patch.yml`），由宿主路由 `GET /obl-brand/plugins` 读出来。**不生成清单文件、不导出脚本** ——
  要让 DSH 装回来，把命令粘回终端即可（所有者 2026-10-06 裁定的形式）。
- 「已启用」= 在 `dsh.profile.bundles` 里**或**在 `cordis.patch.yml` 里有补丁行；只装了依赖的包
  显示「已装未启用」—— 宿主确实不会加载它（本机实测样本：`dsh-creator-mode-plus`、`dsh-whale-widget`）。
- 本地链接显示为「本地链接」并带上 `link:` 规格；npm 包显示磁盘上**实际装到**的版本。
- 路由只回本机调用方（`isTrustedCaller`），因为清单里含本机绝对路径；非 GET 一律 405。

## 直接重启应用

设置面板底部有「应用重启 → 重启 DSH」（两步确认）。服务端（Node 半边）的改动需要重启才加载，而本机热重载在 Windows 上不可用，所以这个入口是刚需。

### 为什么必须由 Node 半边做

客户端半边跑在渲染进程，而 DSH 的 `contextBridge` **没有暴露任何重启接口**。实测 `app.asar/lib/preload-app.cjs` 的 `createProductApi()` 只有：

```
protocolVersion / browser / deviceInfo / keyboard / shortcuts / updates
```

主进程里那个 `restart: () => { app.relaunch(); quitWithoutConfirmation() }` 属于**崩溃恢复专用面**，渲染进程够不着；而「重启应用与 Host」菜单项被 `...development ? [...] : []` 包着，**生产构建里根本不显示**。

所以路径是：宿主半边派生一个**游离** PowerShell 进程 → 回 202 给浏览器 → 停掉应用进程 → 重新拉起。参考实现是社区的 `dsh-tray`（按 PID `Stop-Process` 再 `Start-Process`），区别是它本身独立于 dsh 进程，而我们跑在 dsh 里面，必须 `detached`。

### 身份判据：为什么不能用进程名

重启即杀进程，**误杀后果严重**，因此脚本不做任何「名字像不像」的启发式，只用一条文件系统验证：

> 祖先的可执行文件所在目录里，必须存在 `resources\app.asar` 这个**文件**。

`explorer.exe` 的目录（`C:\Windows`）永远不满足；找不到就**拒绝重启**，绝不猜。

### ⚠️ 一个实测踩到的坑：宿主与主进程同路径

本机进程树：

```
17864  DeepSeek Harness.exe        ← Electron 主进程
├── 20440  DeepSeek Harness.exe    ← DSH 宿主（ELECTRON_RUN_AS_NODE=1）
│   └── 11008  ...                 ← 工具子进程
```

**宿主用的是同一个可执行文件**，所以标记在 `depth 0` 就命中。若「首个命中即锁定」，杀的会是宿主子进程而不是主进程 —— 主进程因失去子进程而异常，随后 `Start-Process` 又拉起第二个实例，撞上 `Another DSH instance is running`。

因此脚本命中后**继续上溯**，取这条链上**最外层**的匹配者（实测最终锁定 17864，正确）。

### 已知行为

- **强制结束**：`Stop-Process -Force`，不弹 DSH 自身的退出确认，正在运行的会话与任务会被中断。
- 脚本与日志在临时目录：`%TEMP%\obl-brand-restart.log`（启动时由 watcher 写）。失败时先看日志。
- 路由 `POST /obl-brand/restart` 校验 `Origin` 必须是本机回环，挡掉跨站页面发起的重启。
- 重启前会先清掉 web-login 遗留的无头 Edge 传输进程（见「孤儿进程清扫」一节）—— 它们本来会在这次硬杀之后变成孤儿。
- 另有 `POST /obl-brand/orphans`：**不重启**，只做那一次清扫（面板「清理孤儿进程」按钮用它）。

### v2.1 守夜人（2026-10-18）

v2.1 把「重新拉起」这一步从 helper 里剥离出来，改成「**守夜人**」：一个经 WMI 创建的**游离 cmd 进程**，跑在 Electron 的 job 之外，主进程怎么死都牵连不到它。逻辑链：

```
POST /obl-brand/restart
  → 删旧锁
  → 写 %TEMP%\obl-brand-watch-restart.cmd
  → ARM：WMI 拉起 cmd（armWatcher）
  → 202 + 面板遮罩
  → window.close()（两帧后）
  → 900ms 后 process.kill(ppid, SIGTERM)
  → watcher 轮询 tasklist 等镜像消失
  → start "" <exe> 拉起
  → curl 探 42081（http-bridge 固定端口）
  → netstat 反查 host pid + 列监听口
  → 逐口探活，取第一个 HTTP 应答口写日志
```

**顺序是结论的一部分**：先 ARM 再清扫/杀。反过来（先杀后 arm）在实测里就是「关了就回不来」—— arm 与 app 共享 job。ARM 失败（无 PowerShell / WMI 不可用）仍回退到旧的 helper 路径。

四个坑钉在 `WATCH_CMD` 正文里并由自检守卫：

| 坑 | 现象 | 修法 |
| --- | --- | --- |
| `for /f` 命令形式在 WMI 游离子进程整体空产出 | `host pid=` 永远空、端口清单永远不打印 | 先 `netstat > 文件`，再 `for /f "usebackq" … in ("文件")` |
| `%DATE%` 含中文星期（GBK） | 按 UTF-8 读日志乱码 | 时间戳切片：`%DATE:~0,10% %TIME%` |
| web 口每次启动都变 | 按固定端口探活永远等不到 | 只认镜像名判消失；拉起后按 42081 验活，再现场发现 web 口 |
| 陈旧守夜人 / 连点 | 以后每次宿主退出都被「重启」一次 | 锁文件 + 20s TTL（应用 20s 没消失 → `expired`） |

实测（2026-10-18）：3/3 全绿；宿主空窗约 **1.5s**；`ready` **9.9–12.7s**（大头是冷启动）；托盘退出不会被误拉起；事后无残留 watcher。**限制照实说**：强杀丢未落盘增量；`app.quit()` 那条优雅链插件够不着（只有托盘退出走）。

面板「点完即消失」：收到 202 后 `BrandSettingsPanel` 铺全屏遮罩 + 等两帧再 `window.close()`。

### 三条新路由（v2.1 同批）

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/obl-brand/tasks` | `GET` | **只读**：有 `running` agent 或 `running|stopping` 后台 job → `active: true`；服务缺失回 503（面板按「无法确认就不弹」处理）。**2026-10-18 收窄**：不再把 `inbox.nextTurn/nextStep` 积压算「正在跑」—— 队列空闲后仍留一条消息，会误报中断提醒 |
| `/obl-brand/updates` | `GET` | **只读**：读 profile `package.json` 依赖 → 跳过 `link:` / `file:` / `workspace:` / `npm:`、`@oblivion/*`、`@deepseek-ai/*` → 逐个查 `registry.npmjs.org/<pkg>/latest` → 回 `{ ok, items:[{ name, current, latest }] }`。首次约 8s |
| `/obl-brand/updates/apply` | `POST` | 白名单校验 → 备份 `package.json.bak-before-updates-<ms>` → 写 latest → 用**内置 pnpm**（`resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs`，经 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`）跑 `pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0` → **回读安装版本**（不信 pnpm 退出码）→ 失败回滚。首次升级约 8s |

**这一轮刻意不做兼容预检**：不兼容的插件（`dsh-web-search-pro`、`@anweat/dsh-browser`，最新版仍是 `0.2.1` 且 peers `<0.2.1-0`）更新后仍会被 DSH 0.2.1 的预检跳过，等作者发版 —— 面板如实提示，不假装能修。

⚠️ **又一次同一类坑**：`server.register(...)` 返回的是 **dispose 函数**，`ctx.effect` 必须**返回**它；写成 `() => { check(); apply(); }` 会在挂载瞬间把路由自己注销掉 —— 现象正是「路由 404，但日志还打了 `mounted`」。自检里加了一条 fiber 语义断言把这条钉住。

### ⚠️ 三个实测踩出来的坑

**① 脚本正文必须纯 ASCII，且写入要带 UTF-8 BOM**

脚本交给 `powershell.exe`（Windows PowerShell **5.1**）执行，而 5.1 对**无 BOM** 的 `.ps1` 默认按 ANSI/GBK 解码。脚本里只要出现中文就会被误解码并在**解析期失败** —— 连 `try` 块都进不去。现场表现极具误导性：

```
脚本文件写出来了（3019 B），日志却一个字节都没有。
PowerShell 报：Write-Log ("澶辫触锛歿0}" -f $_)   ← "失败：" 被按 GBK 解码
                The string is missing the terminator: ".
```

双保险：正文全 ASCII + 写入时前置 `\uFEFF`。

**② 身份判据的「取最外层」不是优化，是必需**

宿主与 Electron 主进程**共用同一个可执行文件**，标记在 `depth 0` 就命中。若首个命中即锁定，杀的是宿主子进程而非主进程。实测最终锁定的是最外层的 `8316`（主进程）。

**③ 桌面端转发会删除 `Origin`**

页面来源是 `dsh-app://app`，非文档路径经 `forwardWebRequest` 转发给本地 webserver，而它在转发前执行了 `headers.delete("origin")`。所以到达路由时 `Origin` **是缺失的** —— 按「必须等于回环来源」判会把桌面端自己的请求拒成 403。

### 自查：`-DryRun`

脚本支持只识别不动作，用来在不结束应用的前提下验证身份判据：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\obl-brand-restart.ps1" `
  -HostPid <任意进程 PID> -LogPath "$env:TEMP\obl-brand-restart.log" -DryRun
```

日志会打印完整祖先链与最终锁定的 PID。

`-DryRun` 也**跳过清扫** —— dry run 的语义是「只识别不动作」，而清扫会杀进程。为此清扫排在 dry-run 分支之后。

## 孤儿进程清扫（web-login 遗留的无头 Edge）

### 现场

`dsh-deepseek-web-login`（第三方，`cv-superding`）用一个独立 profile 目录跑无头 Edge 做传输进程：`<DSH_HOME>/web-login/transport-profile`。它每次启动传输前先 `rmSync(PROFILE_DIR, { recursive, force })`，而它注册的关停动作（关 CDP + `child.kill()`）**只有优雅退出才跑得到**。

于是硬杀（本插件的重启按钮、任务管理器结束进程、崩溃）之后，那些 msedge 全部活了下来 —— Windows **不会**在父进程死亡时连带杀死子进程。它们继续持有 profile 目录里的文件句柄，下一次探活 `rmSync` 抛 EPERM，被 web-login 写进每个账号的 `lastCheckError`。面板上的表现是「几个账号全部校验失败」，但账号本身没有任何问题。

我们改不了第三方插件的拉起方式（升级会覆盖），所以清扫只能在外面做。

### 三个时机（缺一不可）

| 时机 | 模式 | 为什么必须在这里 |
| --- | --- | --- |
| 装载时（`apply`） | `orphans` | 覆盖**不经过本插件按钮**的重启：崩溃、任务管理器、安装器升级。这是「以后不再复发」的那一条 |
| `POST /obl-brand/restart` | `orphans` | 让面板能立刻显示这次清掉了几个，且不影响正在跑的传输进程 |
| 重启 helper 内 | `all` | 补刀。DSH 马上要被硬杀，**当前**宿主拉起的传输进程此刻还健康，但硬杀之后必然变成孤儿 —— 所以这里必须全杀 |

清扫脚本落在 `%TEMP%\obl-brand-orphans.ps1`，由 Node 半边写出、helper 用 `& $SweepScript -Mode all` 调用 —— 判据只有一份实现。

### 判据（为什么不会误杀你自己的 Edge）

- **只认命令行里出现 transport profile 目录**的 msedge。那个目录在用户目录下（`%USERPROFILE%\.dsh\...`），正常使用的 Edge 命令行里不会出现。
- `orphans` 模式的**种子**只取父进程已死的；两种模式共用的收尾规则是「父进程在待杀集合里的一起收进来」（msedge 的子进程挂在浏览器进程下，不在 DSH 下）。杀父不杀子，就是在亲手制造这个脚本要清除的那种孤儿。
- 全部**失败开放**：查询抛错、脚本缺失、超时都只是不清理，绝不阻断重启或装载。

### 运营者开关：`OBLIVION_BRAND_ORPHAN_SWEEP`

设成 `off` / `0` / `false` / `no` 时，**装载期**的清扫一个进程都不动（重启路径不受影响 —— 那一条是重启正确性的一部分）。这是本插件最越界的动作，所以留一个开关，与「品牌接管可完全关闭」同一套理念。

### ⚠️ 三个实测踩出来的坑（都在 `src/orphans.ts` 里钉着）

1. **脚本里不许写 `exit`。** 它会被 helper 用 `& $SweepScript` 在**同一个会话**里调用，而 `exit` 结束的是整个会话 —— helper 会在「准备重启」的中途直接退出。现象：面板说「已受理」，应用却一直不重启。
2. **`Get-CimInstance -Property` 是白名单。** 没列进 `-Property` 的字段取回来是 `$null`：只写 `ProcessId, CommandLine` 时，实测 347 个进程的 `ExecutablePath` **全是空**，于是过滤器把所有进程都 `continue` 掉，清扫静默变成空操作。
3. **`$PID` 是只读自动变量。** `foreach ($pid in ...)` 直接抛 `VariableNotWritable`；若它出现在 helper 的 `try` 里，会被外层 catch 捕获 → 记一行 `failed:` → `exit 1` → 永远走不到「拉起应用」那一步。

另外：**杀父进程会带走子进程**，所以「已经不在了」必须算清理成功而不是失败，否则报告里会出现一堆假失败。

设置存在浏览器 `localStorage`（键 `oblivion-brand:settings:v1`）。0.1.0 的裸字符串键 `oblivion-brand:name` 会在首次读取时自动迁移。

## 向指定会话注入一条用户消息

```
POST /obl-brand/session/message
{ "sessionId": "session-10837d9b-…", "text": "继续", "mode": "queue" }
```

把一条消息写进**某一个 DSH 会话**并立刻驱动一轮 agent，用于「在别的工具里继续这条会话」。
走的是 App 自己的会话接口 `sessionController.prompt`（UI 的「发送」按钮、DSH 给 agent 注入
审批通知，用的都是同一条），所以消息会像真人输入一样**实时**出现在会话里。

| 字段 | 说明 |
| --- | --- |
| `sessionId` | 会话目录名（`~/.dsh/sessions/<工作区>/session-…/` 里面那一段） |
| `text` | 消息正文，上限 20000 字符；只支持纯文本 |
| `mode` | `queue`（默认，排到下一轮）或 `steer`（插入正在跑的这一轮） |
| `requestId` | **可选**幂等键。给了就按它幂等（脚本重试安全），不给则由服务端 `randomUUID()` 铸造 |

响应 `200 {"ok":true,"accepted":true,"requestId":…,"sessionId":…,"mode":…}`；
错误码：`400` 请求体/字段不合法、`403` 外来 Origin 或开关关闭、`404` 会话不存在、
`502` 会话接口拒绝（响应里带远端 `code`）、`503` 宿主里取不到 `sessionController`。

### 为什么不直接往会话日志追加一帧

运行中的 DSH 用**内存状态**渲染、不重读 `session.v4.jsonl.zstd`：追加的帧既不会实时显示
（只有重启/重新加载会话才可能读到），宿主的 seq 计数器还会与它冲突。更糟的是读取器对
完整帧做严格校验（坏 JSONL / 坏帧结构 → 整个会话 `open()` 失败），**写坏一帧可能让整条
会话读不出来**。走 `prompt` 这三条全都没有。

### 运营者开关：`OBLIVION_BRAND_SESSION_INJECT`

设成 `off` / `0` / `false` / `no` 时整条路由回 403。这条路由能把指令投喂给一个**拥有完整
工具权限**的 agent，所以与孤儿清扫同样留一个开关；另外它与其它三条路由一样只回**本机调用方**
（`isTrustedCaller`）。

### 为什么这条路由在家（而不是 `@oblivion/panel`）

`panel` 是刻意**只读**的数据面（没有写路径、不接受用户输入拼路径，自检里有对应不变量）。
本路由与它的两个近亲 —— 重启、孤儿清扫 —— 是同一类动作：宿主侧、有副作用、由面板或外部
工具触发，所以长在本插件的路由表里，共用同一套安全口径。

### ⚠️ 服务从哪来：Cordis 的**服务访问守卫**

`sessionController` 由 api 层提供，与本插件不在同一个注入批次里。取它只有两条**合法**通道：

| 通道 | 语义 |
| --- | --- |
| `ctx.inject(['sessionController'], (scope) => …)` | 声明过的依赖；就绪才回调（没就绪就一直挂着等），在回调里读 `scope.sessionController` 才合法 |
| `ctx.get('sessionController')` | 不参与响应式的原始取用；拿不到返回 `undefined`，因此适合**逐请求**兜底 |

**不要**在 `inject(['webServer'])` 的作用域里读 `scope.sessionController`：Cordis 对「未声明 inject
的服务属性读取」是**抛错**（`vendor/cordis/src/reflect.ts:144`，`cannot get property "x" without
inject`），不是给 `undefined`。v0.1.5 正是栽在这一行上 —— 路由在 `register` 之前就炸了，
表现是**这条路径 404、其余三条正常**，且异常不会出现在任何看得见的地方。

由此两条规矩：① 作用域里只读 `inject` 声明过的东西；② 挂载期任何动作都要能把异常降级成一条
`warn`（`apply` 里已经兜了一层）——「路由静默消失」从外部看和「这个版本没装」一模一样。
自检的桩现在也按真机实现（作用域带守卫、依赖没就绪就不回调），这类写法会直接判红。

## 从指定会话读回最近的问答

```
GET /obl-brand/session/tail?session=session-10837d9b-…&limit=6
```

返回该会话最近的问答：`{"ok":true,"sessionId":…,"messages":[{"seq":…,"at":…,"role":"user|assistant","text":…}],"stats":{…}}`。

上一条注入是**只写**的 —— 回答留在 DSH 里，调用方看不到。这条把它读回来，于是可以闭环：
**注入 → 等一轮 → 读回**（在别的 agent / 脚本里继续一条 DSH 会话，双向都成立）。

| 参数 | 说明 |
| --- | --- |
| `session` | 会话目录名（`~/.dsh/sessions/<工作区>/session-…/` 里面那一段）；只允许字母数字与 `. _ -` |
| `limit` | 返回条数，`1..50`，默认 `6`；单条正文另有 20000 字符上限（超出标 `truncated`） |

错误码：`400` 参数不合法（含会话 id 带路径分隔符）、`403` 外来 Origin 或开关关闭、`404` 找不到该会话日志、
`405` 非 GET。**只读**，与注入路由共用开关 `OBLIVION_BRAND_SESSION_INJECT`。

### 数据源：App 自己一直在写的会话日志（只读）

`<DSH_HOME>/sessions/<工作区>/<会话 id>/session.v4.jsonl.zstd`。宿主的会话服务没有公开的读接口，
但这份日志是**活**的（实测最后一条记录距请求只差几秒），而且只读 ⇒ 不可能像注入那样写坏会话。

### ⚠️ 两个实测踩出来的坑（都在 `src/session-tail.ts` 里钉着）

1. **文件是多帧 zstd 拼接**：一帧装一段 JSONL，帧之间**没有分隔符**，只能按 magic（`28 B5 2F FD`）切。
   而 **Node 的 `createZstdDecompress` 只解第一帧** —— 必须逐帧 `zstdDecompressSync`。会话可以几十 MB，
   因此只读**尾部 1 MB**；首/尾两块都可能是半帧，解不开就跳过（不是损坏），中间的坏帧才计数上报。
2. **只取 `text` 块**：`assistant/message` 里的 `reasoning` 是思维链，不是回答 —— 自检里有这条断言
   （把推理块当答案沉淀过一次，见 `CHANGELOG.md` 的 core 0.2.10 那条）。

## 槽位

| 槽位 | 组件 | 何时注册 |
| --- | --- | --- |
| `sidebar.brand.mark` | `OblivionBrandMark` | 「接管 DSH 品牌」为开 |
| `sidebar.brand.name` | `OblivionBrandName` | 同上 |
| `conversation.hero.brand.mark` | `OblivionBrandMark` | 同上 |
| `settings.section` | 设置分节 | **永远**（否则关掉接管后无法再打开） |
| `sidebar.panellist` + `main` | 面板条目 / 正文 | 勾选了对应提供方 |

### priority 为什么是 -10

官方 `@deepseek-ai/dsh-client-ui-brand-official` 在默认 priority(0) 占了 `sidebar.brand.mark` / `sidebar.brand.name`。`ui-slots` 对 `single` 槽的规则是：

```
同 priority 重复注册 → 抛错
不同 priority       → 遮蔽，且 lowest renders
```

所以 `-10` 稳定覆盖官方；而**关闭接管只要 dispose 本插件的注册**，官方那条立刻重新成为渲染者 —— 这正是槽位系统设计好的机制，不需要改官方包。

### 为什么每处都包 `slots.inject`

注册未声明过的槽位会在加载时抛错。用 `ctx.slots.inject(name, cb)` 等声明方就位，再在 `sync()` 里统一对账（按需 register / dispose）。因此本插件无论先于还是后于 `ui-sidebar` / `ui-layout` / `ui-conversation` 都成立。

## 两条已知边界

### 1. 会话 Hero 的 headline 文字改不了

那行「探索未至之境」**不是槽位，是 i18n 字符串**。`ui-conversation` 的渲染处写死：

```js
children: [jsx("span", { children: t("hero.headline") }), ...]   // "hero.headline": "探索未至之境"
```

hero 区只暴露 `brand.mark` / `agentPreset` / `workspace` 三个槽位，没有文字槽位。从外部覆盖这个 key 也不行 —— locale 服务对同 namespace+locale 重复注册**直接抛错**：

```js
if (locales.has(localeKey(locale))) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
```

所以可自定义的文字落在 **`sidebar.brand.name`**（我们能完全掌控的文字槽位）；hero 区只换图形。

### 2. 侧栏只能放「可嵌入的提供方」，不是任意设置页

`sidebar.panellist`（`{kind:"list", scope:"root"}`）的机制是：注册图标 + `id`/`order`/`label`，**同一个 id 再寻址布局中 root 作用域 `main` keyed slot 的组件**，后者是面板正文。

但设置页正文是由设置弹窗用它**自己那个窄化过的 `renderSlot`** 渲染的，而 `main` 声明为 `{kind:"keyed", scope:"root"}` 且**没有 children** —— 从 `main` 或 `sidebar.panellist` 里没有任何公开途径去渲染别的设置分节正文。

因此能搬进侧栏的，是那些**主动暴露可渲染控制面**的插件。`dshmarket` 就是：

```js
ctx.provide('market', { render: (props = {}) => buildMarketElement(props) })
// 其注释：「for a host that renders it inside its own container」
```

本插件**自动发现**这类提供方：cordis 的 `ctx.reflect.provide()` 把服务登记在 `ctx.reflect.store`，枚举它、筛出带 `render()` 的服务即可（反射不可用时退回已知名单探测）。装了更多这类插件，候选列表会自动变长 —— 无需改本插件。

顺序：`插件` 面板 `order:0`、任务面板 `order:10`，本插件从 `5` 起递增，因此落在「插件」正下方。

> 布局约束（内边距、限宽、居中）写在**本面板自己**身上，不写进通用的嵌入容器 ——
> 那个容器是所有提供方共用的，在那里加约束会把插件市场这类需要撑满宽度的面板挤成窄列。

## 构建

```powershell
# 依赖在仓库根安装一次（pnpm workspace；插件目录里只留符号链接）
cd C:\Projects\Oblivion
pnpm install

# 构建本插件
pnpm -C oblivion-brand run build        # esbuild 双产物
pnpm -C oblivion-brand run typecheck    # tsc --noEmit
```

产出：

- `lib/index.js` —— Node 半边，ESM，给 Cordis Loader 留座
- `lib/client.js` —— 浏览器半边，包成 `window.__ModuleLoader__.load({ id, factory })` 工厂闭包

浏览器半边用 esbuild 打包，把 `react` / `react-dom` / `react/jsx-runtime` / `ui-primitives` 标为 **external** —— 它们由宿主客户端模块表提供（官方品牌插件同样是 `require("react/jsx-runtime")`）。

## 安装

桌面端的 profile 由 Electron 应用独占管理，普通 CLI 会拒绝：

```
error: profile "desktop" is managed exclusively by the Electron application
```

但桌面自带的 CLI 以 `manageDesktopProfile: true` 调 `runCli`，**`plugin` 子命令是放行的**：

```powershell
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-brand'
```

> `link:` 的路径必须用**正斜杠**：桌面包管理器的目标校验正则不含反斜杠，写 `link:C:\...` 会被拒。

该命令会同时更新 `dependencies` 与 `dsh.profile.bundles`。因为是 `link:` 安装（junction 指向源码目录），**改完源码只要重跑 `pnpm run build` 再重启 App**，不需要重新安装。

## 目录

```
oblivion-brand/
├── package.json           # dsh.bundle + dsh.client 声明
├── cordis.patch.yml       # Bundle 层：把本插件的行插进组合树
├── tsconfig.json
├── scripts/
│   ├── build.mjs          # esbuild 双产物构建
│   └── selfcheck.mjs      # 不依赖 DSHX 的自检（判据全在纯函数上）
└── src/
    ├── index.ts           # Node 半边：四条宿主路由 + 游离 helper 派生
    ├── paths.ts           # 路由路径（宿主半边与浏览器半边共用，只放常量）
    ├── orphans.ts         # 孤儿传输进程清扫：脚本正文 + 判据 + 三时机
    ├── session-inject.ts  # 会话消息注入：请求解析 + 开关 + 失败归类
    ├── profile-plugins.ts # 读取 profile 目录，列出已装插件与恢复命令
    └── client/
        ├── index.ts       # 槽位注册 + 设置驱动的 register/dispose 对账
        ├── Brand.tsx      # OblivionBrandMark({size}) + OblivionBrandName()
        ├── polaris.ts     # 北极星 SVG path 与渐变常量
        ├── settings.ts    # 设置存储 + 迁移 + useBrandSettings 钩子
        ├── BrandSettingsPanel.tsx
        └── panels.tsx     # 提供方发现 + 面板条目/正文
```

### 重启功能的第四个坑：`detached` 必须为 false

`spawn` 的 `detached: true` 在 Windows 上用 `DETACHED_PROCESS` 创建进程，而
**Windows PowerShell 5.1 需要控制台** —— 无控制台时它初始化失败、**以退出码 0 直接结束，
脚本一行都不执行**。现象极具迷惑性：spawn 成功、子进程创建、退出码 0、日志却一个字节都没有。

逐个参数隔离实测（HostPid 用 `explorer.exe`，走拒绝分支，不杀任何进程）：

| 派生方式 | 结果 |
| --- | --- |
| `detached: true` + powershell 5.1 | 退出 0，**未写日志** |
| `detached: false` + powershell 5.1 | 退出 1，**已写日志** ✅ |
| `detached: true` + `cmd /c start` + powershell | 退出 0，未写日志 |
| `detached: true` + pwsh 7 | 可用，但 pwsh 只存在于版本化的 `WindowsApps\Microsoft.PowerShell_<版本>_x64__<hash>\` 下，该目录 `readdir` 返回 **EPERM**，无法可靠发现，不能依赖 |

去掉 `detached` 不会让子进程随父进程消失 —— 已单独实测：**父进程退出后 6 秒内心跳仍在继续**
（Windows 本就不会因父进程结束而终止子进程）。

### 重启功能的第五个坑：helper 与主进程同作业对象，会一起被杀

第一次真实点击的日志停在半路：

```
23:02:54 target confirmed: pid=25388
23:02:56 stopped pid=25388        ← 到此为止，没有 relaunched
```

应用被关掉后再没起来，是用户手动重开的。原因：**helper 与 Electron 主进程处在同一个作业对象里**，
杀掉主进程的同时把自己也带走了，脚本最后那步 `Start-Process` 根本没机会执行。

**修法：把「重新拉起」这一步派到作业对象之外。** 经 WMI 创建的进程，其父是 WMI provider host，
不在我们的作业对象内，因此能在主进程死后存活。

但这里又踩到同一个根因的第二面 —— **经 WMI 创建的 PowerShell 同样跑不起来**（无控制台），
实测：

| 经 WMI 创建的目标 | 结果 |
| --- | --- |
| `cmd.exe /c echo … > file` | ✅ 写入成功 |
| `powershell.exe -Command …` | ❌ 无输出 |
| `powershell.exe -File …` | ❌ 无输出 |
| `cmd /c start "" powershell -File …` | ❌ 无输出 |
| `cmd.exe /c <等待批处理>` | ✅ 等待循环 + `start` 全部生效 |

所以**重新拉起改用纯批处理**（`obl-brand-relaunch.cmd`）：轮询 `tasklist` 直到该镜像名的进程全部消失
（上限 60 次，避免死循环），再用 `start ""` 拉起。批处理里用 `ping -n 2 127.0.0.1` 代替
`timeout` —— `timeout` 同样需要控制台。

> 另一个陷阱：`RESTART_SCRIPT` 是 `String.raw` 模板，**注释里不能出现反引号** ——
> 一个 `` `goto` `` 就会提前终止模板，报出一堆莫名其妙的 TS 语法错误。

### 不弹控制台窗口 + 压缩耗时

WMI 创建的 `cmd.exe` 会闪一个控制台窗口。`Win32_ProcessStartup.ShowWindow = 0` 能把它隐藏，
但**不能走 `Invoke-CimMethod`** —— 它无法为嵌入式实例推断 CimType，会报
「无法从提供的 .NET 对象推断 CimType」。必须用 WMI v1 的调用形式：

```powershell
$startup = ([wmiclass]'Win32_ProcessStartup').CreateInstance()
$startup.ShowWindow = 0
([wmiclass]'Win32_Process').Create($cmdLine, $cwd, $startup)
```

`wscript` + VBS 这条常见的「无窗口」路子在这里**行不通**：`wscript.exe` 是 GUI 子系统程序，
经 WMI 创建时根本不启动（实测 VBS 直接跑正常、经 WMI 则无任何输出）。

耗时也从 ~5.1s 压到 ~3s：

| 环节 | 改动 |
| --- | --- |
| killer 杀进程前的等待（让 202 先回到浏览器） | 1200ms → **700ms** |
| 批处理在「进程已消失」后的额外沉降延时 | **删除** —— 循环已经等到该镜像名全部消失，端口与单实例锁此时就是空的 |

另外把批处理里的日志改成 `%DATE% %TIME%`：原先是在 PowerShell 侧取一次时间戳写死，
三行日志显示同一秒，**根本无法回读真实耗时**（我一度据此误判「等待循环没生效」）。

### ⚠️ 一次「优化」反而更慢，已回退

为了压缩祖先遍历，我一度把它从「一次全表枚举」改成「逐级过滤查询」。实测结果相反：

| 方案 | 耗时 |
| --- | --- |
| 全表枚举 `Get-CimInstance Win32_Process -Property …` | ~**1.0 s** |
| 逐级过滤 `Get-CimInstance -Filter "ProcessId = $cursor"` × 4 | ~**2.0 s** |

原因：`Get-CimInstance` **每次调用都付一份固定的会话开销**，分成 4 次反而比 1 次全表更贵。
已回退到全表枚举（脚本总耗时 3.25s → 2.19s）。

另一处真正有效的压缩在批处理轮询：`ping -n 2 127.0.0.1` 每轮要 ~1.3s（两个 echo 间隔 1 秒），
换成 `ping -n 1 -w 200 192.0.2.1` —— `192.0.2.0/24` 是 TEST-NET-1，保证不可路由，
`-w 200` 因此真的只等 ~200ms。

## 版本管理

沿用主仓 `Oblivion_deepseek/scripts/bump-version.ps1` 的做法，语言换成 Node
（本插件工具链本就是 esbuild + `node scripts/*.mjs`，不引入 PowerShell 依赖）：

**`VERSION` 是单一真源**，`scripts/bump-version.mjs` 读它、递增、再用**正则替换**
（不是 `JSON.parse` + `stringify` —— 后者会把整个 `package.json` 重排，产生与版本无关的巨大 diff）
同步到 `package.json`。

```powershell
pnpm run version:bump               # 默认加第三位（patch）
pnpm run version:bump -- --minor    # 仅在明确要求时
pnpm run version:bump -- --major    # 仅在明确要求时
pnpm run check:version              # 只校验 VERSION 与 package.json 是否漂移
```

**客户端（浏览器半边）拿不到 `package.json`**，所以版本由 `scripts/build.mjs` 在打包时
经 esbuild 的 `define` 注入 —— 因此不需要第三个同步点：

```js
define: { __OBLIVION_BRAND_VERSION__: JSON.stringify(version) }
```

两处都显示同一版本：**设置面板标题**（`Oblivion 品牌 v0.1.0`）与 **helper 日志每一行**。

> 日志里带版本号是刚需，不是装饰：`node` 半边只在**应用启动**时加载，刷新页面不会更新它。
> 这个功能 debug 时最费时间的一环就是「无法判断日志来自哪一版代码」—— 我因此白跑了两轮。

## 来源

北极星几何与素材来自 `Oblivion_deepseek/assets/brand/`（`polaris-path.ts` / `polaris.svg` 同源）。`src/client/polaris.ts` 是该 path 的副本，两边更新时需同步。
