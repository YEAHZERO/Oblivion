# dsh-weknora 是 WeKnora · 轮 14

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

chenziyu/dsh-tray查看该插件，我想将这个可以直接重启的功能加入本插件

## 回答

先找到并读懂这个插件。

`dsh-tray` 在 npm 上有（v0.1.1，"start/stop/autostart/open browser from a tray icon"），GitHub 仍连不上。从 npm 取源码，同时查 DSH 自身暴露了哪些重启能力。

主进程里**确实有重启能力**（`restartApplication`、`restartAppHostMenu: "Restart App and Host"`）。查它是怎么暴露给渲染进程的 —— 如果有 IPC，客户端半边就能调用，比外部杀进程干净得多。

`app.relaunch()` 确实存在，对应菜单项「重启应用与 Host」。关键是这个能力有没有暴露给渲染进程 —— 这决定客户端半边能不能调用。

**关键发现**（preload 第 876 行）：`window.dshDesktop` 只在页面来自 `dsh-app:` 协议时才是完整 API，否则是桩。查它暴露了哪些方法。

`createProductApi()` 的完整暴露面我读完了 —— **没有任何 `restart`**。而且那个「重启应用与 Host」菜单项被 `...development ? [...] : []` 包着，**生产构建里根本不显示**。所以重启只能靠 node 半边派生外部进程。先看 dsh-tray 是怎么做的。

`dsh-tray` 其实**不是 DSH 插件** —— 它是一个独立的 PowerShell 托盘程序（`dsh-tray.ps1`，17KB），管理 `dsh web` 进程。看它的重启实现。

`dsh-tray` 的做法是「按端口找 PID → `Stop-Process -Force` → 重新 `Start-Process`」。它是**独立进程**所以能活着干这事；我的插件跑在 DSH 里，必须派生游离进程。

但在动手前有个**致命风险**必须先排掉：如果 DSH 宿主就是 Electron 主进程本身，沿父链找「非 node 祖先」会一路找到 `explorer.exe` 并杀掉。先确认宿主是怎么被拉起的。

宿主确实是**子进程**（`spawn(this.node, [...dsh-desktop-host/lib/index.js])`）。所以父链可用 —— 但我不能用「非 node 祖先」这种启发式，必须用**精确路径匹配**。看安装根目录有什么。

设计前提确认完毕。**关键安全点**：不能用「非 node 祖先」这种启发式 —— 我在 helper 里改用**文件系统验证的身份判据**：只有祖先的可执行文件所在目录里存在 `resources\app.asar` 文件时才认它，`explorer.exe` 的目录（`C:\Windows`）永远不满足。

现在写 node 半边。

现在加客户端 UI。

node 半边需要 Node 类型声明。补上。

构建通过。现在做**最关键的安全验证**：拿真实的 DSH 宿主进程，跑一遍身份识别逻辑，确认它锁定的目标正确、且不会一路走到 `explorer.exe`。只读，不杀任何东西。

等一下 —— 探针没找到 `dsh-desktop-host` 的独立 node 进程，这是个**危险信号**。如果宿主本身就是以 Node 模式运行的 `DeepSeek Harness.exe`（另一个 PID），我的「depth 0 命中就锁定」会**杀掉宿主子进程而不是主进程**。先看清进程树。

**发现一个会造成实际故障的设计缺陷** —— 进程树是：

```
17864  DeepSeek Harness.exe        ← Electron 主进程
├── 20440  DeepSeek Harness.exe    ← DSH 宿主（ELECTRON_RUN_AS_NODE=1）
│   └── 11008  ...                 ← 子进程 runner
```

宿主**用的是同一个可执行文件**，所以 `resources\app.asar` 标记在 **depth 0 就命中**。我原来「首个命中即锁定」会**杀掉宿主子进程 20440，而不是主进程 17864** —— 结果是主进程可能报错退出，而 helper 又拉起第二个实例撞上「Another DSH instance is running」。修掉：继续上溯，取**最外层**的匹配者。

修正生效 —— 最终锁定 **17864（Electron 主进程）**，`explorer.exe` 被标记判据排除。写文档并提交。

重启功能已加入（commit `924157f`），并在**真实进程树上干燥验证过**。

## 先说 `dsh-tray` 是什么

它**不是 DSH 插件**，是一个独立的 PowerShell 托盘程序（`dsh-tray.ps1`，17KB），管理 `dsh web` 进程。它的重启就两行：

```powershell
Stop-Process -Id $pid0 -Force      # 按端口反查 PID
Start-Process powershell ...       # 重新拉起
```

关键在于**它本身独立于 dsh 进程**，所以杀了对方自己还活着。我的插件跑在 dsh **里面** —— 直接照搬会把自己一起杀掉，所以必须派生 `detached` 进程。

## 为什么必须放在 Node 半边

我把 DSH 的暴露面读完了，客户端**没有任何重启接口**：

```
createProductApi() = { protocolVersion, browser, deviceInfo, keyboard, shortcuts, updates }
```

主进程里那个 `restart: () => { app.relaunch(); quitWithoutConfirmation() }` 属于**崩溃恢复专用面**，渲染进程够不着；而「重启应用与 Host」菜单项被 `...development ? [...] : []` 包着 —— **生产构建里根本不显示**。

所以：node 半边注册 `POST /obl-brand/restart` → 派生游离 PowerShell → 回 202 → 停应用 → 拉起。客户端只是发个请求。

## 安全设计（这里我做了两次修正）

**① 身份判据不用进程名，用文件系统验证**

重启即杀进程，误杀后果严重。脚本只认一条：

```
祖先 exe 所在目录下存在 resources\app.asar 这个文件
```

`C:\Windows` 永远不满足 → `explorer.exe` 不可能被误判。找不到就**拒绝重启**，绝不猜。

**② 干燥运行时抓到一个会真出故障的缺陷**

我原设计是「父链上首个命中即锁定」。拿真实进程树一跑才发现：

```
17864  DeepSeek Harness.exe        ← Electron 主进程
└── 20440  DeepSeek Harness.exe    ← DSH 宿主（ELECTRON_RUN_AS_NODE=1）同路径！
```

**宿主与主进程用的是同一个可执行文件**，`depth 0` 就命中。原逻辑会杀掉**宿主子进程 20440 而不是主进程 17864** → 主进程因失去子进程而异常，helper 又拉起第二个实例，撞上 `Another DSH instance is running`。

改成命中后**继续上溯取最外层匹配者**，重新干燥验证：

```
[depth 0] pid=20440  标记=True  ← 暂锁
[depth 1] pid=17864  标记=True  ← 改锁这里 ✅
[depth 2] pid=10068  explorer.exe  标记=False
最终锁定: 17864
```

**这个缺陷是干燥运行抓出来的，不是靠读代码想出来的** —— 如果直接上线，你第一次点重启就会遇到一个"重启失败 + 可能开两个实例"的现场。

## 其他保护

- `Origin` 必须是本机回环，挡掉跨站页面 POST 触发重启
- 两步确认按钮，警告文案写明「强制结束、任务会中断、不弹退出确认」
- 脚本与日志落在 `%TEMP%\obl-brand-restart.ps1` / `.log`，失败可查

## 生效与验证

`link:` 安装 → 产物已更新（`lib/index.js` 5.9KB、`lib/client.js` 37.4KB），**重启 App 生效**（这次得手动重启一次，新功能才在内存里）。

重启后：**设置 → Oblivion 品牌 → 应用重启** → 点「重启 DSH」→ 确认 → 应用应当自己关掉再起来。

一个**预期内的现象**：点下去后页面会断连，因为应用真被杀了 —— 我在代码里把「fetch 失败」当作正常路径而不是错误来提示，就是这个原因。

第一次试建议先看 `%TEMP%\obl-brand-restart.log`，里面记录了完整的祖先链和最终锁定的 PID。

---

仍欠 git push（现在 **7 个提交**）。之前诊断出 HTTPS 被重置、SSH 通道通但密钥未登记。公钥我再贴一次：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH2D/f5JZYY01wmO50rzdw/sw7rK17nnkCK0FSG6NSSp liveu@Hilbert
```

加到 https://github.com/settings/keys 后说一声，我 `git push ssh main` 一条命令推完。

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---