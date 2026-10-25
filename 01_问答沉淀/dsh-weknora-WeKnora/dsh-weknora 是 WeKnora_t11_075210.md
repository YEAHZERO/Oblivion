# dsh-weknora 是 WeKnora · 轮 11

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

那比如说在我点击接管后，自动将我的图标替换名称到C:\Programs\AITech\DeepSeekHarness\resources\icon.png，然后取消接管后又恢复默认的图标呢？

## 回答

这个方案我必须先讲清楚：**它在技术上不成立，而且踩了我明确声明不碰的那条线**。先把事实查实。

`resources/icon.png` 在 asar 里**零引用**（命中的那几处是 `dsh-host-open-in-app` 在临时目录生成的同名文件，用途无关），而 `BrowserWindow` / `nativeImage` / `setIcon` 在 `@deepseek-ai` 全树**一处都没有**。再确认 asar 根和 Electron 入口。

Electron 外壳是 `@deepseek-ai/dsh-desktop`，入口 `lib/main.js`。直接读它看图标怎么设的。

**关键发现** —— 我先前说"零引用"是错的，得纠正。`lib/main.js` 第 11845 行确实读它：

`applicationIconPath` 用在 `setAboutPanelOptions` —— 那是**「关于」面板**的图标，不是窗口图标。继续追窗口和托盘。

`resources/icon.png` 的用途查清了 —— 而且**我上一条回复说错了，需要纠正**。再确认最后一点：窗口图标到底从哪来。

先纠正我上一条回复里的一个错误：我说 `resources/icon.png`「在 asar 里零引用」——**那是错的**。我当时只 grep 了 `dsh/` 前缀，而 Electron 主进程在 asar **根**的 `lib/main.js`，不在那个前缀下。查全之后的真实情况如下。

## 三个图标面各自读哪个文件

| 界面位置 | 图标来源 | 代码依据 |
|---|---|---|
| **窗口 / 任务栏 / Alt-Tab / 开始菜单** | **exe 内嵌的 PE 资源** | `main.js:11075` 创建主窗口时**根本没传 `icon`** → Electron 回退到可执行文件图标 |
| 「关于」面板 | `resources\icon.png` | `main.js:11845` → `app.setAboutPanelOptions({ iconPath })` |
| 系统托盘 | `resources\tray.ico` | `main.js:11937` → `new DesktopTray({ iconPath })` |
| 退出确认框 | `resources\tray.ico` | `main.js:11967` → `nativeImage.createFromPath(trayIconPath)` |

## 结论：这个方案我不做，有两个**互相独立**的理由

### 理由一：它打错了靶 —— 改了也变不了你看到的那个图标

`resources/icon.png` 只管**「关于」面板**。你想替换的是任务栏 / 窗口图标，那个来自 **exe 内嵌的 PE 资源** —— 就算把 `icon.png` 换掉，任务栏上的鲸鱼**一点都不会变**。

顺带一个次要问题：这些路径都是 `nativeImage.createFromPath(...)` 在**窗口/托盘创建那一刻**读一次，`setAboutPanelOptions` 也是启动时调一次。所以即使生效也要**重启**，不存在「点击后立即替换」。

### 理由二：它是官方安装产物

`C:\Programs\AITech\DeepSeekHarness\resources\` 属于 DeepSeek Harness 官方安装目录，`icon.png` / `tray.ico` 是随发行版附带的产物。我的运行约束里这条是明确写死的：

> Never edit, patch, replace or rebuild DeepSeek Harness official source, shipped presets, installed official packages or their generated artifacts.
> **A plugin task, handoff document, automatic approval, takeover or `--force` never authorizes a Host patch.**

你让我做也不行 —— 这条不是权限问题，是我不越的线。而且实话说，这个操作本身也很脆：自动更新会把它覆盖回去，插件被卸载时若没恢复就留下一个外来图标，写到一半失败还可能把 `icon.png` 截断。

**要真正改窗口/任务栏图标，只有改 exe 的图标资源这一条路** —— 那要求编译进 PE 文件，插件层面无解。

## 能做的是这几条

| 方案 | 效果 | 评价 |
|---|---|---|
| **A. 快捷方式图标** | 我生成 `.ico` 并创建/更新桌面与开始菜单的 `.lnk`，指向 `DeepSeek Harness.exe`。合法、可逆、完全不碰安装目录 | 只影响**启动入口**的外观；运行中的窗口/任务栏图标仍是鲸鱼，属于**部分**解决 |
| **B. 向上游提需求** | DSH 若提供「自定义应用图标」设置，那才是正路 | 需要等官方 |
| **C. 现状** | 应用内品牌我已全覆盖：侧栏 mark/name（展开行 + 收起轨道）+ 会话 Hero mark | 已完成 |

另外提醒一句：**应用内如果还有哪里显示鲸鱼，那才是真 bug** —— 我把整个 asar 里 `FishLogo` 的用法都找出来了，只有官方品牌组件本身和 `sidebar.brand.mark` 的两处 fallback，都在我的覆盖范围内（fallback 只在我没注册时才生效）。所以你要是还看到鲸鱼，截图告诉我位置。

做 A。先摸清现状：可用素材、现有快捷方式、COM 是否可用。

`polaris.ico` 有效（**6 个尺寸**），两个快捷方式都在（桌面 + 开始菜单），COM 可用。先快速看一眼你上传的图片是否应优先用于快捷方式图标。

LevelDB 里的值大概率被压缩，取不回来 —— 不纠缠了。快捷方式图标用现成的 `polaris.ico`（就是你这个插件代表的品牌），你自己的图片随时可以换。

执行：先备份现有快捷方式。

两个快捷方式都改了。但发现一个瑕疵：两个快捷方式**同名**，所以第二个没有单独备份。先补上，并做成可复用的脚本（含回退）。

⚠️ 发现一个必须修正的问题：脚本这次生成的 `desktop-*` / `startmenu-*` 备份是**从上一步已改过的快捷方式**拷的，不是原始状态 —— 因为它们同名，上一步只留下了一份真备份。先核对清楚。

`CreateShortcut` 拒绝 `.bak` 后缀。复制成 `.lnk` 再读。

确认了：只有 2114 B 那份是**真原始**（`exe,0`），另外两份是我改动后的状态 —— 也就是说 `-Restore` 现在还原不回原样。修掉，并用「还原 → 重设」往返验证。

往返验证通过：`-Restore` 能真正还原到 `exe,0`，重新应用也正常。写进仓库文档。

PowerShell 语法错误（`foreach` 语句不能直接接管道），**整段都没执行**，包括提交。拆开重做。

方案 A 已完成。

## 做了什么

| 项 | 结果 |
|---|---|
| 图标文件 | `%LOCALAPPDATA%\Oblivion\polaris.ico`（46,801 B，**6 个尺寸**的合法 ICO，取自你 `assets/brand/polaris.ico`） |
| 桌面快捷方式 | `IconLocation` → `…\Oblivion\polaris.ico,0` ✅ |
| 开始菜单快捷方式 | 同上 ✅ |
| 备份 | `%LOCALAPPDATA%\Oblivion\shortcut-backup\`（三份，2114 B） |
| 脚本 | [set-shortcut-icon.ps1](C:/Projects/Oblivion/tools/set-shortcut-icon.ps1)，支持 `-Icon <自己的.ico>` 与 `-Restore` |
| 提交 | `6959bb1` |

**往返验证过**：`-Restore` → 两个快捷方式都回到 `exe,0`；再应用 → 都变成 `polaris.ico,0`。

## 过程中踩到并修掉的一个坑

两个快捷方式**同名**（都叫 `DeepSeek Harness.lnk`），导致备份路径撞车：第二个会命中「已备份」而跳过，而第一份又是在我改动**之后**才拷的 —— 结果三份备份里只有一份是真原始（`exe,0`），另外两份是我改动后的状态。**照那个状态 `-Restore` 是还原不回原样的。**

我用「把真原始分发给两份按来源命名的备份」修掉了，并把 `desktop-` / `startmenu-` 前缀写进脚本和文档 —— 否则以后手工操作还会踩同一个坑。

顺带：`foreach (...) { } | Format-List` 在 PowerShell 里是语法错误，整段命令**解析期就失败、一行都没跑**（我一开始那条提交命令就是这么没执行的）。得先收集到变量再接管道。

## 生效范围（说清楚边界）

| 位置 | 效果 |
|---|---|
| 桌面图标 | ✅ 立即生效 |
| 开始菜单图标 | ✅ 立即生效 |
| **任务栏已固定项** | ❌ 仍用 exe 内嵌图标 |
| **运行中的窗口 / Alt-Tab** | ❌ 同上 |

后两行不是没做，是**做不到** —— 它们读的是 `DeepSeek Harness.exe` 的 PE 资源。

如果桌面还显示旧图标，那是资源管理器缓存：我跑过 `ie4uinit.exe -show`，不够的话注销重登一次。

## 想换成你自己的图

`settings` 里上传的那张存在浏览器 localStorage（LevelDB 里被 Snappy 压缩了，从文件系统取不回来），所以快捷方式这边得单独指定：

```powershell
pwsh -File tools\set-shortcut-icon.ps1 -Icon 'C:\你的图.ico'
```

需要的是 `.ico`。你给一张 PNG（建议 256×256 以上、方图）我可以转 —— 不过先提醒：ICO 是**位图**格式，SVG 不能直接用，得先栅格化。

---

顺便说一句，这个方案本质上是「绕」：真正的解法是 DSH 上游提供「自定义应用图标」设置，那样插件在设置里点一下就能全局生效。你要的话我可以把「三处图标各自的来源 + 为什么插件改不了 + 可行的上游做法」整理成一份 issue 说明，你拿去提。

另外仍欠一次 git push（`3312af4`、`1a2f47e`、`71dfff4`、`6959bb1` 都在本地，GitHub 当时断线）。

- 涉及工具: `ask_user_question`, `edit`, `pwsh`, `read`, `write`

---