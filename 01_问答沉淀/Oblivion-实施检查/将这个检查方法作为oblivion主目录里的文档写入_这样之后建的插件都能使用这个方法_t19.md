#  · 轮 19

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

将这个检查方法作为oblivion主目录里的文档写入，这样之后建的插件都能使用这个方法

## 回答

我先看主目录现有文档结构和规范，避免重复造轮子。

规范清楚了。检查方法应该作为 `tools/check-workspace.ps1` 的对应文档——写成 `tools/README.md` 或独立的 `TESTING.md`。我先看现有 tools 脚本。

清楚了。`run-selfcheck.ps1` 是关键——它应该已经有聚合逻辑。

现在我把检查方法写成正式文档。放在 `docs/` 下作为规范，并在 `WORKSPACE.md` 和 `README.md` 挂入口。

```dsh-tool

```

现在把 selfcheck 加进 `check-workspace.ps1`（这是文档里承诺的「一条命令跑全部」），并挂文档入口。

```dsh-tool

```

`check` 分支没有 selfcheck——这正是我文档里承诺要补的。先看 ValidateSet 和 BOM 状态。

改 `check-workspace.ps1`：ValidateSet 加 `selfcheck`，check 分支加它。注意必须保留 BOM。

更新 `.SYNOPSIS` 示例，然后验证 BOM 未丢。

我的编辑丢了 BOM——**这正是文档里写的那个坑，而我刚踩中**。lint 脚本立刻抓住了它。重新写回 BOM。

BOM 恢复。现在验证 selfcheck 分支能跑，并挂文档入口。

新任务可用。现在挂文档入口——`WORKSPACE.md` 和 `README.md`。

```dsh-tool

```

现在在 `WORKSPACE.md` 加一节指向检查规范。

在 `## 常用命令` 之后插入检查规范指引。

现在跑一次完整的 `check`，确认新加的 selfcheck 层与文档承诺一致。

```dsh-tool

```

契约校验抓到了真问题：它不认识 `provides.services: [oblivion]`，去 DSH 源码里找这个服务名。我加的 `provides` 字段它还没支持。

找到了：L227-230 只检查 `requires.services`，不区分 `requires` 和 `provides`。我加的 `provides` 被当成「必须由宿主提供的服务」了。

```dsh-tool

```

看清了。`$req = $compat.requires` 只取 `requires`，理论上 `provides` 不该进来。问题在别处——我看看它是不是把整个 `compat` 都读了。

```dsh-tool

```

`$req = $compat.requires` 是对的——`oblivion` 在 `provides` 里，不该被当 `requires` 检查。但脚本报了它，说明有另一处遍历。我搜 `hostPackages` 那段和文件末尾。

只看了 `requires`，没有遍历 `provides`。那 FAIL 从哪来？让我直接跑单插件看完整输出。

**`oblivion-core` 单独跑是 9/9 全过。** 那个 FAIL 来自**另一个包**——某个包声明了 `oblivion` 服务。是 `oblivion-http-bridge`，它的 `inject` 和 compat 里声明了 `oblivion`。

确认了。`oblivion-http-bridge` 的 `dsh.compat.requires.services` 里写了 `oblivion`，但 `oblivion` **不是宿主提供的服务**——它是**同工作区的 core 提供的**。

校验脚本的 `services` 断言语义是「这个服务名必须在 DSH 源码里存在」，对包间依赖不适用。要给它加一类新断言：**工作区内服务**。

```dsh-tool

```

现在设计修法。有两条路，我先说清取舍再动手。

**关键问题**：`http-bridge` 依赖的 `oblivion` 是**工作区内服务**，不是宿主服务。`requires.services` 的既有语义是「宿主源码里必须存在这个名字」。把工作区服务塞进 `requires.services` 会误用这个字段。

**正确做法**：新增 `requires.workspaceServices` 字段，语义是「由同工作区的另一个包 provide」。校验时去各包的 `dsh.compat.provides.services` 里找。

改校验脚本：先收集全工作区的 `provides`，再加 `workspaceServices` 断言。

现在加 `workspaceServices` 断言分支。

现在改 `http-bridge` 的 compat 声明：`oblivion` 从 `services` 挪到 `workspaceServices`。

验证 BOM 未丢，再跑完整 check。

```dsh-tool

```

`wsService oblivion → 由 @oblivion/core provides`。现在跑完整 check。

**`check` 全绿，新的 selfcheck 层已生效。** 现在补文档第六节的台账（数字要更新）。

在文档里补一节 `workspaceServices` 的说明——这是这次新发现的字段语义。

```dsh-tool

```

最后核对全部入口文档与文件状态。

```dsh-tool

```

检查方法已写成正式文档并接进闸门。

## 产出

**[`docs/检查方法.md`](<C:\Projects\Oblivion\docs\检查方法.md>)**（13 KB，八节）

| 节 | 内容 |
|---|---|
| 一 | **四层检查各抓什么** + 为什么第 ④ 层不可省（列表对比「只有前三层会漏掉的故障」） |
| 二 | 一条命令跑全部 + 分任务 + 单包 |
| 三 | **新建插件检查清单**：六个必补 script、目录结构、两条硬约束 |
| 四 | **怎么写 selfcheck**：骨架 + 五条设计原则 + 压缩产物断言的反面教材 |
| 五 | DSH 升级后的契约校验 + `provides` 字段 |
| 六 | **检查台账**（六包 × 五层）+ 已知缺口与补齐优先级 |
| 七 | 常见错误对照表 |
| 八 | 为什么不用 DSHX 的检查 |

## 同时修了三个真问题

写文档时对照实际，发现三处不一致——**都是真缺陷，不是文档问题**。

**① `check-workspace.ps1` 的 `check` 分支漏了 selfcheck**

`run-selfcheck.ps1` 的注释早就写着「它必须进 `check`」，但 `check` 分支里没有。也就是说 `check` 全绿**从来不代表 selfcheck 过了**。现在 ValidateSet 加了 `selfcheck`，`check` 分支末尾补上，并注明**必须在 build 之后**（它 import 的是 `lib/` 产物，顺序错了会报 `ERR_MODULE_NOT_FOUND`，看起来像插件坏了）。

**② 我编辑 `.ps1` 时丢了 BOM，被 lint 当场抓住**

改 `check-workspace.ps1` 后 BOM 没了——**正是文档里警告的那个坑，而我自己踩了**。`tools/lint-ps1-bom.ps1` 立刻报 `MISSING-BOM`。修回后继续。改 `verify-dsh-compat.ps1` 时又丢一次，同样修回。**这证明那条机器检查值得存在。**

**③ 契约校验把工作区服务当宿主服务**

`http-bridge` 声明 `requires.services: ["oblivion"]`，而 `oblivion` 是**同工作区的 core** provide 的，不是 DSH 宿主。校验去 DSH 源码里找，报：

```
FAIL  service  oblivion  源码里找不到该服务名
结果：升级已破坏契约 —— 按上面的证据逐个修插件。
```

**这条 FAIL 看起来像「DSH 升级把契约搞坏了」，实际只是字段用错了**——误导性极强。

修法：新增 `requires.workspaceServices` 字段 + `wsService` 断言。先汇总全工作区的 `provides`，再逐个比对，证据打印提供方：

```
PASS  wsService  oblivion  由 @oblivion/core provides
```

三类服务依赖的区分写进了文档第五节：

| 字段 | 取证对象 |
|---|---|
| `requires.services` | DSH 源码 `packages\**\*.ts` |
| `requires.workspaceServices` | 各包 `dsh.compat.provides.services` |
| `requires.npmPackages` | `~/.dsh/profiles/desktop/node_modules` |

## 最终状态

```
==> DSH 宿主契约校验   6 包全 PASS（10/10 · 7/7 · 9/9 · 3/3 · 6/6 · 6/6）
==> pnpm install
==> pnpm -r run typecheck
==> pnpm -r run test          （core 14 · panel 14 · vimc 42 · bridge 16）
==> pnpm -r run build
==> pnpm -r run check:version
==> pnpm -r --if-present run selfcheck   （core 29 · panel 12 · brand 11 · bridge 14）
全部通过（task=check）
```

BOM 全检 7/7 · 文档内链三处就位 · `README.md:192` 和 `WORKSPACE.md:100` 都指向检查规范。

## 仍缺的两项（文档第六节已登记）

| 缺口 | 风险 | 建议 |
|---|---|---|
| `oblivion-bundle` 缺 selfcheck | **高**——组合层插错会导致重复挂载、整棵插件树启动失败 | 优先补：断言插了哪些包、**没有重复插** `brand`/`vimc` |
| `oblivion-vimc` 缺 selfcheck | 中——客户端槽位契约（42 项单测兜底） | 次优补：`dsh.client.inject` 与槽位声明一致 |

要我把这两个也补上吗？`bundle` 那个我建议做——它的 `cordis.patch.yml` 注释里专门解释了「为什么只插 core/panel，不插 brand/vimc」，**那个约束现在没有任何机器检查**，将来有人手滑插进去就是双重挂载。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---