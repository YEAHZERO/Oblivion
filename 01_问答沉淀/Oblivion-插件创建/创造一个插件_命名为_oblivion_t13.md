# 创造一个插件（命名为@oblivion · 轮 13

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

按照如下继续创造插件@oblivion/core（已经做好了一些）
运行时	~/.oblivion/data / OblivionKB/10-Topics	⏳ 尚未产生 —— 捕获挂在 turn/end 上，而本轮还没结束
最后一项会自己验证：turn/end 在本轮结束时触发。所以下一轮我直接查这两个目录，就能确认「一问一答结束 → 自动沉淀」这条闭环真的通了（这也是设计书里 RUNTIME_VERIFICATION_REQUIRED 的那一项）。

如果下一轮仍是空的，extractQAPair 依赖的 subject.eventsSnapshot 就是那个缺口 —— 我会据此定位。
验证结果改变了答案的形状。先给你**修正一处设计书错误**和**新会话的准确起点**。

## 一、最重要：设计书有一个不存在的钩子

`.memory/TODO.md` Phase 3 写的是「四层筛选 + **`session:complete`** + 防回灌（RISK-117）」。实测：

| 检查 | 结果 |
|---|---|
| `session:complete` 在官方 287 个包里 | **0 命中** |
| `dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES`（59 个事件） | **没有任何 complete 类事件** |
| `turn` 类事件 | 只有 `turn/start` / `turn/end`（73 个文件在用） |

**请把设计书这一处改掉**——否则接下来的会话会去找一个不存在的钩子。`@oblivion/core` 用的是 `turn/end`，这是对的。

## 二、一个必须先承认的偏差

你的 `TODO.md` 把认知层拆成 **8 个独立插件**，而 `@oblivion/core` 实际是**把 Phase 2–6 合并成了一个包**。所以"第二个插件"这个问题本身需要重新定义。对账如下：

| Phase | 计划插件 | 现状 |
|---|---|---|
| 2 | `@oblivion/knowledge` | ⚠️ 已并入，但**向量检索 / anydoc WASM / `md_rules.yaml` / `oblivion_docs/` 未做** |
| 3 | `@oblivion/qa-loop` | ⚠️ 已并入，触发事件改为 `turn/end` |
| 4 | `@oblivion/perspective` | ⚠️ 已并入，**F3 深度模式降级** |
| 5 | `@oblivion/graph-growth` | ✅ 已并入，权重规则与 §25.6 逐条一致（0.3 / +0.05 / cap 1.0 / 30 天 ×0.95） |
| 6 | `@oblivion/feedback` | ⚠️ 已并入，**90 天保留期未做** |
| 7–9 | content-creator / adapter-obsidian / 发布工程 | ❌ 未做 |

## 三、后面要做的事（新会话照这个走）

### 第 0 步：先验收已落地的（不能跳）

```powershell
# ① 装（用户执行）
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-core'
# ② 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾追加
#    - insert:
#        - id: '@oblivion/core'
#          name: '@oblivion/core'
# ③ 说一句话触发一轮问答，然后查
Get-ChildItem "$env:USERPROFILE\.oblivion\data", "$env:USERPROFILE\OblivionKB\10-Topics" -ErrorAction SilentlyContinue
```

**在 `ts-*.json` 出现之前，`@oblivion/core` 只能算 `SOURCE_BUILT`，不能算能用的东西。** 后面所有工作都建立在这条链真的通了之上。

### 第 1 步（建议）先补内核的 4 个差距，而不是开新包

| #

> （已截断，原长 24975 字符；问题全文见会话原始日志）

## 回答

先做侦察：读交接单、看现有 `oblivion-core` 的实现，并验证那条 `turn/end` 闭环到底通没通。

现有实现比交接单描述的更完整，**而且 profile 里已经装上了**（`link:` 依赖 + 插入行都在）。但**运行时目录是空的** —— 闭环确实还没通。继续读实现与真实 API：

框架包在手（做真实 API 对账）。查 `turn/end`、`eventsSnapshot`、`session/event` 的真实形状：

关键发现：`eventsSnapshot` 在 TS 里是 **private**，而公开的 `eventAt()`/快照读取已被**废弃**（"new calls are prohibited"）；正确做法是**自己在 `session/event` 事件流里累积本轮事件**。先确认它是不是懒加载的（这决定了空落盘的根因）：

**根因确认**：`eventsSnapshot` 只在**已废弃的** `snapshotEvents()` 里懒加载（`??= Object.freeze(...)`），而我们的插件直接读它 → 永远是 `undefined` → 每轮都提取不到问答 → 落盘为空。这是必须换掉的实现方式。先看设计书里 4 个差距的原文：

设计书原文到手。**先确认 `user/message` 的 `source` 取值**（防回灌与「只取真人提问」都要用它），然后开始改：

侦察完成，根因与设计书原文都拿到了。立个目标跟踪这项多步工作，然后开始改：

开始改代码。**第一处（根因）**：把「读 `session.eventsSnapshot`」换成「在 `session/event` 流里自累积本轮事件」：

现在补 **F3 深度触发 + F2 §25.4 闸门**（perspective）：

Typecheck 通过。现在修设计书里那个不存在的钩子（用户明确要求）：

设计书 4 处已改正（余下的是「此处原写错」的说明本身，故意保留）。现在扩展测试与自检：

三处失败都在我新写的**断言语料**上（实现是对的），其中一处很重要：F5 用例误用了默认 `dataRoot`（会指向真实 `~/.oblivion/data`）。修掉：

**selfcheck 17/17 全绿**（含真实事件流端到端、注入上下文被忽略、L3 四规则、F3 深度 ≥3 候选、F2/F3 闸门、F5 惰性裁剪）。接着跑其余闸门：

`dshx check` 全绿。但 `test/` 里有一条断言失败（与我的改动无关的一处契约断言）。看清楚：

`oblivion-core` 缺版本递增脚本（交接单 A1 说的那笔债之一）。按其他插件的既有实现补上，再递增：

版本已递增到 **0.1.2**（位置参数 `minor` 被拒 ✓），全闸门绿。补脚本项与配置文档：

更新交接单与根 CHANGELOG：

又要补回被我吃掉的标题（同一个错误）：立刻修：

全闸门绿。提交并推送：

`@oblivion/core` 已按设计书修实到 **v0.1.2**，并推送到 GitHub（`de2d74e`）。

## 一、最重要的一件事：闭环为什么一直是空的

我先去查了**真实的 `dsh-session` 产物**（不信任设计书与文档）：

| 检查 | 实测结果 |
| --- | --- |
| `session.eventsSnapshot` | 是 **private** 字段，且只在标着 `deprecated`（*"new calls are prohibited"*）的 `snapshotEvents()` 里 `??=` 懒加载 |
| 插件旧实现 | **直读** `subject.eventsSnapshot` → 真实 Host 里**恒为 `undefined`** |
| 后果 | 每轮提取不到问答 → `~/.oblivion/data`、`~/OblivionKB/10-Topics` **永远为空且不报错**（正是你观察到的那两个空目录） |
| 事件形状 | `session/event(session, event)`；`event = { type, seq, time, data }`；`turn/end` 的 `data.turn` 是轮次号（没有 `turnId`） |

**修法**：订阅公开的 `session/event`，**在事件流里自累积本轮事件**（`turn/start` → `user/message`/`assistant/message` → `turn/end`），`eventsSnapshot` 只作兜底并打一次告警。

顺带抓出第二个静默 bug：`user/message` 里**混着 `agent.inject()` 注入的上下文**（文件变更通知、子目录 AGENTS.md、cron 通知…），靠 `source.kind` 区分 —— 现在**只把真人提问当问题**，否则一堆机器上下文会被当成「用户的问题」沉淀。

> 教训（已写进 README 第五节）：**旧自检也用 `eventsSnapshot` 造数据**，所以「自检 11/11 全绿」和「真实库永远为空」能同时成立。现在自检走真实事件流（`emitTurn()`），不再绕过真实链路。

## 二、设计书 4 个差距全部补齐（都带自检断言）

| # | 设计书 | 0.1.2 实现 | 自检断言 |
| --- | --- | --- | --- |
| 1 | §25.1 L3 | 四条规则：答案 **<5 字** / 仅无意义词 / **回答开头 40 字内**「不知道」/ 纯寒暄；每条带 `reason` | 四类逐一验 `reason`；**正文提及「不知道」「感谢」不误杀** |
| 2 | §25.4 F3 | 改为**连续同维度计数**：连续 ≥3 次同维度追问 → **≥3 个候选视角**；闸门单会话 ≤5 次 | 普通=2 / 深度=3 |
| 3 | §25.4 F2 | 三通道：**主动**（会话 ≤3 + 问题 ≥10 字 + 有来源）/ **深度** / **陪伴期**；共用安全闸门：置信度 ≥0.3、被拒 ≥2 次不再提 | 会话 9 时前 2 轮不动手、第 3 轮深度通道触发 |
| 4 | §25.7 F5 | **90 天保留期**，**读取时惰性裁剪**（不引入定时任务，与图衰减同一招），裁剪结果落盘 | 100 天前那条被裁掉、磁盘同步 |

两点口径说明（都写进代码注释，避免下一轮再判）：**「含不知道」收紧为「开头 40 字内」**（逐字实现会误杀正文）；**§25.4「≤3 会话」与既有「≥4 会话才观察」方向相反** → 保留为不同通道（主动 / 陪伴）。

## 三、设计书那个不存在的钩子（你点名要改的）

| 落点 | 处理 |
| --- | --- |
| [`.design/ARCHITECTURE.MD`](C:\Projects\Oblivion\.design\ARCHITECTURE.MD)（4 处） | `session:complete` → **`turn/end`**，并保留「⚠️ 实测 `session:complete` 在官方 287 个包里 0 命中」的注记 |
| [`.memory/TODO.md`](C:\Projects\Oblivion\.memory\TODO.md)（1 处） | 同上 |
| 新增第 5 条设计书遗漏 | **`eventsSnapshot` 不能直读**（private + deprecated），正确姿势是自累积事件流 |

## 四、闸门（本机实测，全绿）

```
build      ✅ @oblivion/core v0.1.2: lib/index.js 51296 B + lib/testkit.js
typecheck  ✅ 0 错误（strict）
test       ✅ 12/12   （修了一条过期断言：dsh.compat 是兼容声明，不是 dsh.bundle）
selfcheck  ✅ 17/17   （11 → 17：真实事件流端到端 / 注入过滤 / 兜底 / L3 四规则 / F3 深度 / F2·F3 闸门 / F5 保留期）
check:version ✅ 0.1.2 一致    dshx check ✅ manifest / object-form / boot-marker
```

顺带补了 `oblivion-core/scripts/bump-version.mjs`（该插件此前**没有递增器**）并加了 `version:bump` / `check:version`：默认只加第三位、位置参数 `minor` 被拒。

---

## 五、使用方法

### 1. 装与激活（profile 里**已经在位**，只差重启）

```powershell
$dsh  = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
$core = 'C:\Projects\Oblivion\oblivion-core'

& $node $pnpm -C $core run build          # Host 侧改码后必做
& $node $pnpm -C $core run selfcheck      # 可选：17 项端到端自证
& $dsh plugin --profile desktop add "link:$($core -replace '\\','/')"   # 正斜杠！

# 然后【重启 DSH Desktop】—— Host 侧 JS 只会在重启后重新导入 ESM 缓存
```

补丁行（`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 末尾）**已经在位**：

```yaml
- insert:
    - id: '@oblivion/core'
      name: '@oblivion/core'
```

### 2. 验证闭环（一问一答 → 自动沉淀）

重启后**在会话里正常问一句**（≥10 字、有实质回答），然后：

```powershell
Get-ChildItem "$env:USERPROFILE\.oblivion\data"          # 期望：ts-*.json（知识条目）
Get-ChildItem "$env:USERPROFILE\OblivionKB\10-Topics"    # 期望：<主题>.md（笔记）
Get-Content   "$env:USERPROFILE\.oblivion\data\profile.json" -ErrorAction SilentlyContinue
```

出现 `ts-*.json` + `10-Topics\*.md` = 整条链通了。**在此之前只声明 `SOURCE_BUILT`，不声明 `RUNTIME_VERIFIED`** —— 这也是我现在如实报告的层级。

### 3. 五个模型面工具

| 工具 | 用途 |
| --- | --- |
| `oblivion_query` | 关键词 + 共现扩展检索，带来源 |
| `oblivion_capture` | 手工沉淀一条问答（走同一套四层筛选） |
| `oblivion_profile` | 读/改思维档案（`user_override` 优先） |
| `oblivion_feedback` | 对某视角记 👍/👎/⏺（累积 3 条同向才微调；👎 两次的维度不再提示） |
| `oblivion_graph_neighbors` | 查实体共现邻居（带惰性衰减后的有效权重） |

### 4. 调参（改 config，不动代码）

`cordis.patch.yml` 里补 `config:`（**整段替换**，缺省键自动补默认），常改的：

```yaml
      config:
        dataRoot: '~/.oblivion/data'
        mdRoot: '~/OblivionKB'
        valueThreshold: 0.3               # 勿改回 0.5（会让一切被丢弃）
        enablePerspective: true
        perspectiveActiveSessionMax: 3    # §25.4 主动触发窗口
        perspectiveDeepTriggerRepeats: 3  # §25.4 深度触发
        feedbackRetentionDays: 90         # §25.7 保留期
```

### 5. 故障排查

| 症状 | 先查 | 原因 |
| --- | --- | --- |
| 库仍为空 | App 重启过吗 | Host 侧代码改后未重启（ESM 缓存） |
| 日志出现 `turn/end 时没有任何可读事件` | 上游事件形状是否又变 | 按 README 第五节「API 对账」重读 `dsh-session` 类型并登记结论 |
| 条目很少 | L3/L4 闸门 | 答案 <5 字、纯寒暄/不知道/无意义词被拦；或 `valueThreshold` 0.3 |
| 想让某维度别再提 | `oblivion_feedback` 记两次 👎 | 被拒 ≥2 次的维度写入 `resistant_dimensions` |
| 想重置画像 | 删 `~/.oblivion/data/profile.json` | 档案在 `dataRoot`（**不在** KB 目录，避免随笔记外泄） |

**下一步**（已写进 [HANDOFF.md](C:\Projects\Oblivion\HANDOFF.md) 第二节）：重启 App → 按第 2 步验证 → 再决定「继续补内核（`oblivion_docs/` 目录结构、LLM 判定接入）」还是「按设计书开 Phase 2（**必须先重新划界**，否则两个包抢同一条 `turn/end`）」。

- 涉及工具: `create_goal`, `edit`, `get_goal`, `grep`, `pwsh`, `read`, `todo_write`, `update_goal`, `write`

---