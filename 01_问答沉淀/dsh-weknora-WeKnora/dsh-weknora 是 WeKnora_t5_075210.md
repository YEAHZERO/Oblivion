# dsh-weknora 是 WeKnora · 轮 5

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

如何开启开发者模式，本dsh desktop未发现在哪里，然后新安装的dshmarket怎么在软件里搜索？我想要安装https://dshmarket.com/p/Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl/

## 回答

三件事我逐个查。先并行取事实。

关键发现：`lib/official-desktop.js` 明确写着 **「Never fall back to `dsh plugin --profile desktop`: that CLI is forbidden」**。你是桌面端，这条会影响安装通道。先找准市场 UI 在界面里的位置。

市场 UI 的注册点找到了。再确认桌面端的安装通道 —— 这是能否装成那个挂件的关键。

桌面端的安装通道搞清楚了。做几个实测确认市场是否已生效。

市场**已在运行** —— `GET /dsh-market/status` 返回 HTTP 200，version 1.66.8。我已顺手帮你打开了 Windows 的开发者选项页面。再确认桌面端能否通过市场安装。

三个问题都查清了，其中两个我用实测确认了（不是读文档猜的）。

## 1. 开发者模式 —— 这是 **Windows** 的设置，不在 DSH 里

你在 DSH Desktop 里当然找不到，它属于操作系统。我已经帮你把设置页打开了（`Start-Process ms-settings:developers`）。

**手动路径**：`设置 → 系统 → 开发者选项` → 打开「**开发人员模式**」

> 顺带纠正一个容易搞混的点：你机器的注册表 `ProductName` 写的是 `Windows 10 Home China`，但构建号 **26200.9457 / DisplayVersion 25H2** —— 实际是 **Windows 11 25H2**（Windows 11 的 ProductName 一直没改）。所以位置是「系统 → 开发者选项」，不是 Win10 的「更新和安全」。

**或者**管理员 PowerShell 一行搞定：

```powershell
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v AllowDevelopmentWithoutDevLicense /d 1
```

⚠️ **开完必须重启 DSH App**。符号链接权限在进程令牌创建时确定，正在跑的进程不会自动获得 —— 不重启我实测照样 `EPERM`。

## 2. 插件市场在「设置 → 插件市场」

实测市场**已经在运行**了：

```
GET http://127.0.0.1:19387/dsh-market/status  →  HTTP 200
{ "version": "1.66.8", "channel": "stable", "pnpm": true, "region": "china", ... }
```

它的客户端注册的是一个 `settings.section`，**id = `market`，中文名「插件市场」**，并且会把自己那块网格图标替换进设置导航。所以路径是：

**设置（齿轮） → 插件市场** → 面板内有搜索框 + 分类标签（UI 增强 / 主题 / …）

如果左边找不到这一项：**先硬刷新页面（Ctrl+F5）**。市场是 client 插件，host 侧已就绪但浏览器可能还持着旧的 bundle。

## 3. 装那个鲸鱼挂件

两条路，桌面端都通：

| 路径 | 说明 |
|---|---|
| **设置 → 插件市场** → 搜 `Whale` 或 `Balance` | 可视化，推荐 |
| **设置 → 插件** | 官方插件页，粘贴 `github:Witherwithwinter/DeepSeek-Balance-Whale-Widget-Bowl` |

我读了市场源码，桌面端的安装通道是这样的（[index.js:170-177](C:/Users/liveu/.dsh/profiles/desktop/node_modules/dshmarket/lib/index.js)）：官方 Electron 宿主下走 `createOfficialDesktopRuntime`，把 `add`/`remove` **交给 App 自己的 `pluginManager.installBundle()`**，不碰命令行。

**几个会踩的坑，先说在前面：**

- **桌面端市场不接受附加参数**。源码里 `acceptsMarketPnpmFlags: false`，只认纯 `add <target>`；带选项会直接报错并让你去「设置 → 插件」。
- **别和上游版同时装**。它用 `/dsh-whale/` 路由前缀，与 `MeteorNOX/DeepSeek-Balance-Whale-Widget` 完全相同 —— 同一 profile 装两个会冲突（它自己的 README 也这么写）。
- **需要 `DEEPSEEK_API_KEY` 环境变量**才能读余额。桌面 App 从 GUI 启动、不继承 shell 环境，这个变量得让 App 能读到才算数。
- **装完要重启 DSH**，挂件出现在**右下角**。
- **安全**：第三方代码，21 stars，是 MeteorNOX 作品的修改再分发版。市场页面自己也提示「先审源码、能锁 commit 就锁（`github:owner/repo#sha`）」。要不要装你定，我不替你决定。

**一个对你有利的发现**：市场的 status 里有 `"githubProxy": "https://gh-proxy.com"`、`"region": "china"`。我之前推送被 reset、`github.com:443` 连不上，用市场的这个代理通道装 GitHub 源插件应该比我走 git 直连稳。

---

需要我直接帮你装吗？我可以走市场的 HTTP 接口（`POST /dsh-market/install`）来装，装完再验一遍状态；也可以你先在界面上试，卡住了我再介入。另外 `da941ca` 那个提交还欠一次 `git push`（GitHub 当时断线），网络恢复后我随时补推。

- 涉及工具: `grep`, `pwsh`, `read`, `web_fetch`

---