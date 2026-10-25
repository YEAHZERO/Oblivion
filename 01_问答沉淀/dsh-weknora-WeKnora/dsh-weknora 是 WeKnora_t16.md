# dsh-weknora 是 WeKnora · 轮 16

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

查看日志，还是不行

## 回答

202 收到了 —— 说明**路由已经通了**，你那次手动重启生效了。但应用没重启，所以问题在 helper 内部。看日志。

**根因找到了，而且是个经典 Windows 陷阱。**

证据：脚本写出来了（3019 B，22:54:55），但**日志一个字节都没有** —— 说明 PowerShell 连 try 块都没进。

原因：我用 `writeFileSync(..., 'utf8')` 写的是**无 BOM 的 UTF-8**，而 `powershell.exe` 是 Windows PowerShell 5.1，默认按 **ANSI/GBK** 读 `.ps1`。我的脚本里有**中文注释和中文日志字符串** → 字节被误解码 → **解析期就失败** → 什么都没执行。

两处一起修：写 **UTF-8 BOM**，并把脚本内的字符串改成纯 ASCII（双保险，任何编码、任何 PowerShell 版本都能解析）。

构建并**端到端测试脚本本身** —— 用一个安全 PID（`explorer.exe`，其父链上没有应用标记）跑，它应当拒绝并写出日志。这样能验证脚本能解析、能执行、能记录，且不会杀任何东西。

抽取脚本的 `node -e` 被 shell 的引号转义搞坏了，所以刚才测的还是**旧脚本** —— 但这反而成了**根因的直接证据**。PowerShell 把旧脚本的中文按 GBK 解码后报错：

```
Write-Log ("澶辫触锛歿0}" -f $_)      ← "失败：" 被误解码
The string is missing the terminator: ".
```

正是这个解析错误让 helper 连 `try` 都进不去。改用文件方式抽取新脚本重测。

脚本**完全跑通了**：

```
脚本长度: 2837   非 ASCII 字符数: 0      ← 纯 ASCII ✓
前 3 字节: EF BB BF                     ← UTF-8 BOM ✓
helper start: host pid=10068
ancestor pid=10068 ppid=9972 path=C:\WINDOWS\Explorer.EXE
refused: no ancestor carries the resources\app.asar marker   ← 安全拒绝生效 ✓
```

再加一个 `-DryRun` 开关 —— 既方便你现在自查，也让我能**安全地验证正向路径**（真找到应用但不杀）。

**正向路径也验证通过** —— 最外层匹配正确锁定主进程：

```
ancestor pid=22260  pwsh.exe                        （无标记）
ancestor pid=13084  DeepSeek Harness.exe            （命中，暂锁）
ancestor pid=24644  DeepSeek Harness.exe            （命中，改锁）
ancestor pid=8316   DeepSeek Harness.exe            （命中，改锁）✅
ancestor pid=10068  C:\WINDOWS\Explorer.EXE         （无标记，排除）
target confirmed: pid=8316   ← Electron 主进程
dry run: target identified, nothing stopped
```

更新文档并提交。

根因找到了，而且是个**很有欺骗性的 Windows 陷阱**。已修复、已验证、已推送（`891991c`）。

## 根因：脚本被 PowerShell 按 GBK 解码，解析期就失败

证据链：

| 观察 | 含义 |
|---|---|
| `obl-brand-restart.ps1` 存在（3019 B） | `spawn` 派生了、脚本写出来了 |
| `obl-brand-restart.log` **一个字节都没有** | helper 连 `try` 块都没进 → **解析期**就死了 |
| 手动跑一遍旧脚本，PowerShell 报错 | 见下 |

```
Write-Log ("澶辫触锛歿0}" -f $_)      ← 我的 "失败：" 被按 GBK 解码成乱码
The string is missing the terminator: ".
```

我用 `writeFileSync(..., 'utf8')` 写的是**无 BOM 的 UTF-8**，而 `powershell.exe` 是 **Windows PowerShell 5.1**，对无 BOM 的 `.ps1` **默认按 ANSI/GBK 解码**。脚本里的中文注释和中文字符串被误解码，引号配对错乱 → 直接语法错误。

**双保险修复**：脚本正文改**纯 ASCII**（日志也改成英文，任何编码下都安全）+ 写入时前置 `\uFEFF`。

## 端到端验证（两条路径都实测过）

**负向**（无限标记，应拒绝）：
```
ancestor pid=10068 path=C:\WINDOWS\Explorer.EXE
refused: no ancestor carries the resources\app.asar marker    ← 退出码 1
```

**正向**（DryRun，只识别不动手）：
```
ancestor pid=22260  pwsh.exe
ancestor pid=13084  DeepSeek Harness.exe     （命中，暂锁）
ancestor pid=24644  DeepSeek Harness.exe     （命中，改锁）
ancestor pid=8316   DeepSeek Harness.exe     （命中，改锁）✅
ancestor pid=10068  C:\WINDOWS\Explorer.EXE  （排除）
target confirmed: pid=8316
```

字节校验：前 3 字节 `EF BB BF`、非 ASCII 字符数 **0**。

## 顺手加了个 `-DryRun`

只识别不动作，你随时能自查身份判据而不必冒重启的风险：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\obl-brand-restart.ps1" `
  -HostPid <任意PID> -LogPath "$env:TEMP\obl-brand-restart.log" -DryRun
```

## 现在请你再试一次

**设置 → Oblivion 品牌 → 应用重启 → 重启 DSH → 确认**

这次脚本已经改过，**但 note 一个必要条件**：脚本内容在 `lib/index.js` 里，属于 node 半边 —— **又需要重启一次应用**才能加载新代码。所以这次仍需手动重启。这是最后一次；之后这个按钮就自举了。

如果还失败，现在排查会很直接：日志里会有具体行。可能剩下的一种情况是 **DSH 宿主进程受沙箱限制、无法派生 powershell**，那会表现为日志依然为空 —— 到时告诉我，我换个思路（比如改用 `cmd /c start` 或让 helper 由计划任务拉起）。

---

顺带说明：`origin` 已切到 SSH（HTTPS 在你机器上完全不可用），现在 `git push` 直接可用。远程 HEAD 与本地同步在 `891991c`，工作树干净。

关于我上一条回复里那个判断失误也说明一下 —— 我当时说「没找到 `dsh-desktop-host` 的独立 node 进程，这是危险信号」，方向是对的（宿主与主进程同路径确实是隐患），但**我没有对脚本本身做端到端执行测试**就交付了，而真正的 blocker 恰恰在脚本的编码上。**「脚本文件写出来了」不等于「脚本能跑」** —— 这个教训我记下了。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---