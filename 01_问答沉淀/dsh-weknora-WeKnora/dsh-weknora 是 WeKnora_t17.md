# dsh-weknora 是 WeKnora · 轮 17

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

可以了，但是重启后等了好几秒，而且关闭后没有再次打开，是我手动打开的

## 回答

日志说明了问题 —— 而且这次排除了一半可能：

| 观察 | 结论 |
|---|---|
| 脚本文件在 **22:57:47** 被改写 | 你点击后 `writeFileSync` 成功了 |
| 前 3 字节 `EF BB BF`、正文非 ASCII 为 0（那 1 个是 BOM） | **写入的确实是修好的纯 ASCII + BOM 脚本** ✓ |
| 日志最后一条仍是 **22:56:46**（我的 DryRun） | helper **依然没有执行** |
| 应用主进程 22:57:38 启动、产物 22:56:43 | 新代码已加载 |

所以编码那条已经修好，但卡在更前面：`spawn` 之后子进程根本没跑起来。最可能是 **PATH 里没有 `powershell.exe`**（DSH 宿主的环境是 `desktopNodeEnvironment` 构造的）。我改成绝对路径，并加上宿主侧自诊断日志。

在让你再重启一次之前，我要**先在这台机器上复现这个 spawn 失败**，确认诊断而不是又赌一次。查 `desktopNodeEnvironment` 是否改了 PATH，并实测 PATH 缺 powershell 时的行为。

`desktopNodeEnvironment` 只在传了 `bin` 时才改 PATH，而宿主是以 `bin = void 0` 启动的 —— 所以 PATH 原样继承。**关键推论：我的 pwsh 是由宿主经 subprocess runner 派生的，它的 PATH 就反映宿主的 PATH。** 这个能立刻验证，不用重启。

PATH **包含** WindowsPowerShell —— 所以 ENOENT 不成立，我的假设错了。宿主也确实能派生进程（我的 pwsh 就是它派生的）。那就用**和生产完全相同的参数**，从当前环境跑一次 spawn，看是哪一层断的。

**关键结果**：spawn 成功、子进程创建了（pid 8672）、**退出码 0** —— 但**什么都没写**。

退出码 0 + 零输出，说明 PowerShell 根本没执行脚本体。而我手动跑同样参数（只少了 `-WindowStyle Hidden` 和 detached/stdio）时是**成功的**。所以嫌疑集中在 `detached` / `-WindowStyle Hidden` / `stdio:'ignore'` 这三者的组合上。逐个隔离。

**完美隔离出来了** —— 罪魁是 `detached: true`：

| 变体 | detached | 结果 |
|---|---|---|
| A / B / E | ✅ | 退出 **0**，**未写日志** |
| **C / D** | ❌ | 退出 1，**✅ 已写入** |

Node 的 `detached: true` 在 Windows 上用 `DETACHED_PROCESS` 创建进程，而 **Windows PowerShell 5.1 需要控制台**，没有控制台就初始化失败、直接以 0 退出，脚本一行都不跑。`-WindowStyle Hidden` 和 `stdio` 都无关。

但 `detached` 不能简单去掉 —— 它正是「主进程死后 helper 还活着」的保障。找能兼顾两者的方案。

**找到了可用组合**：

| 变体 | 结果 |
|---|---|
| F `detached + cmd /c start /min powershell` | ❌ |
| **G `detached + pwsh 7`** | ✅ **已写入** |
| H 非 detached + powershell（对照） | ✅ 已写入 |
| I `detached + cmd /c start /b powershell` | ❌ |

PowerShell **7** 能正确处理 `DETACHED_PROCESS`，5.1 不能。但去掉 `detached` 会带来「父进程死后 helper 是否还活着」的问题 —— 这个必须先验证，否则会出现「应用被关掉但没人拉起」的最坏结果。

**验证通过**：非 detached 的子进程在父进程退出后**继续存活**（6 秒内心跳 5 次）。所以 fallback 也是安全的。

确定最终方案前，再测一个更省事的候选：`detached` + **裸名 `pwsh.exe`**（走 PATH，避免写死版本号路径）。

`pwsh` 只能通过**版本化的 WindowsApps 存储路径**访问（裸名、ProgramFiles、WindowsApps 别名都不可用），而版本号不能写死。先确认能否枚举出来。

枚举被拒（`EPERM`），`pwsh` 路径无法可靠发现。**最终方案定为 `powershell.exe`（5.1，恒存在）+ `detached: false`** —— 脚本执行与「父进程死后存活」两条都已实测通过。

构建产物确认无误（`detached: false` + 绝对路径）。把这条发现写进文档。

找到了，而且这次是**逐参数隔离实测**出来的，不是猜的。已修复并推送（`6380944`）。

## 根因：`detached: true` 让 PowerShell 5.1 静默退出

日志给出的线索是关键：

| 观察 | 结论 |
|---|---|
| 脚本 22:57:47 被改写、BOM 正确、正文纯 ASCII | 编码那条**已经修好了** |
| 日志最后一条仍是我的 DryRun | helper **依然没执行** |

于是我**用完全相同的 spawn 参数**在本机复现，拿到决定性结果：

```
✅ spawn 事件：子进程已创建, pid = 8672
子进程退出 code = 0 signal = null        ← 退出码 0！
❌ 仍然没有日志
```

**spawn 成功、退出码 0、零输出** —— 说明 PowerShell 根本没执行脚本。逐个参数隔离：

| 派生方式 | 结果 |
|---|---|
| `detached: true` + powershell 5.1 | 退出 **0**，**未写日志** |
| `detached: false` + powershell 5.1 | 退出 1，**✅ 已写日志** |
| `detached: true` + `cmd /c start` + powershell | 退出 0，❌ |
| `detached: true` + pwsh 7 | ✅ 可用 |
| `detached: false` + powershell（去 WindowStyle） | ✅ 已写日志 |

**Node 在 Windows 用 `DETACHED_PROCESS` 实现 `detached`，而 Windows PowerShell 5.1 需要控制台** —— 没有控制台就初始化失败、以 0 退出，脚本一行都不跑。`-WindowStyle Hidden` 和 `stdio` 都无关，我先前怀疑的 PATH/ENOENT **也不成立**（实测 PATH 含 WindowsPowerShell）。

## 为什么不用「pwsh 7 + detached」这个可用组合

实测本机 `pwsh` 只存在于版本化路径 `WindowsApps\Microsoft.PowerShell_7.6.6.0_x64__8wekyb3d8bbwe\`，而：

```
readdir('C:\Program Files\WindowsApps')  →  EPERM
裸名 pwsh.exe / WindowsApps 别名 / ProgramFiles\PowerShell\7  →  均不存在
```

版本号不能写死、目录无法枚举 → **不可靠，不能作为方案**。所以选了恒存在的 PowerShell 5.1。

## 去掉 `detached` 会不会「杀掉应用后 helper 也死掉」？

这正是我不敢直接去掉它的原因，所以单独验了：**父进程退出后 6 秒内心跳仍在继续（5 次）** —— Windows 本就不会因为父进程结束而终止子进程。

## 现在请再试一次

**设置 → Oblivion 品牌 → 应用重启 → 重启 DSH → 确认**

**仍需手动重启一次**（`detached` 的修改在 node 半边，得靠重启加载）。这是最后一次手动。

如果这次还不行，日志会直接给出答案 —— 我加了宿主侧自诊断，三种故障会区分得很清楚：

| 日志内容 | 含义 |
|---|---|
| 连 `[host] spawning helper:` 都没有 | 路由/处理器没跑到 |
| 有 `[host] spawning helper:` 但无后续 | 子进程没起来 → 看 `spawn error:` 行 |
| 有 helper 的 `helper start:` 但停在 `stopped pid=` | helper 随主进程一起死了 → 我改用计划任务（`schtasks`）从作业对象外拉起 |

---

说明一下这次的教训。上一轮我说「脚本写出来了不等于脚本能跑」，这一轮我又犯了同类错误 —— **我看到 spawn 成功、退出码 0 就以为派生这层没问题**，直到把参数逐个隔离才找到真凶。两次的共性是：**我依赖了「看起来正常」的表象，而没有做真正的端到端执行验证**。现在这套隔离测试脚本留在 `.cache/` 下（不进 git），后续再碰类似问题可以直接复用。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---