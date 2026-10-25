# dsh-weknora 是 WeKnora · 轮 21

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

将这几个里面可以拿过来的直接放在本项目C:\Projects\Oblivion中（相当于原来的项目只保留下这些精华）——"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\CONTRIBUTING.md"
"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\README.md"
"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\VERSION"
"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\CHANGELOG.md"
"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\.design\ARCHITECTURE.MD"
以及特别重要的比如这两个文件夹的创建、运行规则："C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\.memory"
"C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek\.action"

## 回答

先看日志，同时研究 `Oblivion_deepseek` 的版本管理方式。

**新代码跑通了**，日志带上厘秒了，而且**这次没有黑框**（你没提，说明 `ShowWindow` 生效了）：

```
23:22:07.687 [host] spawning helper
23:22:09     target confirmed: pid=16640
23:22:09.78  relauncher start
23:22:10     stopped pid=16640
23:22:11.48  relauncher: previous processes gone
23:22:11.52  relaunched
```

点击 → 重新拉起 = **3.8 秒**（旧代码 4.4 秒）。还有两处可压：**祖先遍历 1.3 秒**、**循环轮询间隔 1.3 秒**。先读 `Oblivion_deepseek` 的版本管理机制。

版本管理机制看懂了：**`VERSION` 单一真源 + 正则替换同步到所有引用处**（不用 `ConvertTo-Json`，避免巨大无关 diff）+ 可选打 tag + 提醒补 CHANGELOG。我按这个方式给插件做一套，同时压掉那两处耗时。

现在做版本管理。按 `Oblivion_deepseek` 的方式：**`VERSION` 单一真源 + 正则替换同步**。

客户端也要能显示版本。建一个构建期注入的常量。

又是反引号（我在批处理注释里写了 `` `ping -n 2 ...` ``）—— 同一个坑第二次。

构建通过，客户端产物里已注入 `"0.1.0"`，node 半边运行时读 `package.json`。现在**在临时副本里**验证 bump 脚本（不动真文件）。

bump 脚本全部正确（递增、同步、漂移检测）。现在验证重启脚本的**加速版祖先遍历**与**版本号入日志**。

**我这次的"优化"实测反而更慢**，得回退：

| 方案 | 祖先遍历耗时 |
|---|---|
| 全表枚举（原方案） | `23:22:08 → 23:22:09` ≈ **1.0 秒** |
| 逐级过滤查询（我刚改的） | `23:25:31 → 23:25:33` ≈ **2.0 秒** |

原因是 `Get-CimInstance` **每次调用都有固定开销**，4 次查询 × ~500ms 反而比 1 次全表枚举贵。回退。

回退后**快了一秒多**：脚本总耗时 **3.25s → 2.19s**。更新文档并提交。

两件事都完成了，已推送 `1b193f5`。

## 先看日志：新代码跑通了，黑框也没了

```
23:22:07.687 [host] spawning helper
23:22:09     target confirmed: pid=16640
23:22:09.78  relauncher start              ← 带厘秒 = 新代码 ✓
23:22:10     stopped pid=16640
23:22:11.48  relauncher: previous processes gone
23:22:11.52  relaunched
```

你没再提黑框，说明 `ShowWindow = 0` 生效了。**点击 → 重新拉起 = 3.8 秒**（旧代码 4.4 秒）。

## 压缩耗时：一处有效，一处**我改错了已回退**

**有效的**：批处理轮询从 `ping -n 2 127.0.0.1`（每轮 ~1.3s）换成 `ping -n 1 -w 200 192.0.2.1`（~200ms）。`192.0.2.0/24` 是 TEST-NET-1，保证不可路由，`-w 200` 才真的只等 200ms。

**我改错的**：为了压缩祖先遍历，我把它改成「逐级过滤查询」，**实测反而慢一倍**：

| 方案 | 耗时 |
|---|---|
| 全表枚举（原方案） | ~**1.0 s** |
| 逐级过滤 × 4（我的"优化"） | ~**2.0 s** |

原因是 `Get-CimInstance` **每次调用都付固定会话开销**，拆成 4 次反而更贵。已回退，脚本总耗时 **3.25s → 2.19s**。

预期端到端 **~2.7 秒**（原 3.8 秒）。

## 版本管理：按主仓方式做了一套

读了 `Oblivion_deepseek/scripts/bump-version.ps1`，沿用它的核心做法，只把语言换成 Node（本插件工具链本就是 esbuild + `node scripts/*.mjs`）：

**`VERSION` 是单一真源**，`scripts/bump-version.mjs` 读它、递增、用**正则替换**同步到 `package.json` —— 特意不用 `JSON.parse` + `stringify`，那会把整个 `package.json` 重排，产生与版本无关的巨大 diff。

```powershell
npm run version:bump -- patch          # fix / docs / chore
npm run version:bump -- minor          # feat
npm run version:bump -- major          # 破坏性 / 正式发版
npm run version:bump -- patch --tag    # 顺便打 git tag
npm run check:version                  # 只校验漂移
```

**在临时副本里验证过全部行为**：`patch` → 0.1.1、`minor` → 0.2.0、VERSION 与 package.json 同步、制造漂移后 `--check` 正确报错并以 exit 1 退出。

**版本号现在出现在两处**：

1. **设置面板标题** —— `Oblivion 品牌 v0.1.0`（客户端拿不到 `package.json`，由 `build.mjs` 经 esbuild `define` 注入，所以不需要第三个同步点）
2. **helper 日志每一行** —— `2026-10-04 23:25:31 v0.1.0 helper start: ...`

> 日志带版本号是**刚需不是装饰**：node 半边只在**应用启动**时加载，刷新页面不会更新它。这个功能 debug 最费时间的一环就是「无法判断日志来自哪一版代码」—— 我因此白跑了两轮。

## 需要你做

**手动重启一次**加载新代码，然后点按钮。预期 ~2.7 秒、无黑框。

这次日志能直接自证版本，不用再猜：

```
2026-10-04 23:xx:xx v0.1.0 [host] spawning helper: ...
2026-10-04 23:xx:xx v0.1.0 helper start: host pid=...
```

如果 `[host]` 那行**没有** `v0.1.0`，说明跑的还是旧代码（应用没重启成功）。

---

顺带说一句：这轮我犯的「反引号终止模板」是**同一个坑的第二次**（上次在 `goto` 那行）。已经写进 README，但更该做的是**在构建里加一道防护** —— 比如让 `bump-version` 或一个 lint 步骤检查模板内是否出现反引号。你要的话下次我加上。

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---