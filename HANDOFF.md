# HANDOFF — 新会话从这里开始

本文件是 Oblivion 插件工作区的**会话交接单**：记录当前状态、下一步、以及本机踩过的坑。
新会话（标准模式 / Creator Mode+ / 其他 agent）动手前请先读完「三、可复用开发流程」与「四、坑清单」。

最后更新：2026-10-06

---

## 一、已完成的插件

| 插件 | 版本 | 形态 | 状态 |
| --- | --- | --- | --- |
| `@oblivion/brand` | 0.1.1 | client | 已现役（侧栏与会话 Hero 品牌 + 重启按钮 + **插件市场 registry 覆盖为 npmmirror**） |
| `@oblivion/vimc` | 0.2.10 | client | 已现役（Vimium 式键盘导航 + 页面内查找）；**挂载走热挂**（profile 用户层 insert 行，2026-10-06 从 bundle 层改回） |
| `@oblivion/core` | **0.1.6** | **object（Host 侧）** | 已修掉「捕获恒为空」的根因；**观测面已真机验证**（`status.json` 写着 v0.1.6、分类目录已自动创建、只读路由 200）；⚠️ **`turn/end` 是否真到我们这里仍未确认**（见下）；**DEC-028 热挂 / DEC-029 知识库位置** |
| `@oblivion/panel` | **0.0.1** | **client（双半）** | **Node 半边已真机验证**（`GET /oblivion-panel/status` → 200 + `host-mount.json`）；浏览器半边待硬刷新目视 |

### `@oblivion/core` 完成了什么

一个包六个模块（knowledge / qa-loop / perspective / feedback / graph / profile），
JSON 文件存储，`turn/end` 单触发，防回灌，无定时任务。

**0.1.2 修的根因（重要）**：旧实现直接读 `session.eventsSnapshot`，而它是 **private** 字段、
只在**已废弃**的 `snapshotEvents()` 里懒加载 → 真实 Host 里恒为 `undefined` → 每轮提取不到问答 →
`~/.oblivion/data` 永远为空、且不报错。现在改为**在 `session/event` 事件流里自累积本轮事件**
（`turn/start` → 消息 → `turn/end`），`eventsSnapshot` 只作兜底；并只把 `source.kind === 'user'`
当真人提问（`agent.inject` 注入的上下文不再被当成问题）。

> 教训：旧自检也用 `eventsSnapshot` 造数据 → **「自检全绿 + 真实永远为空」同时成立**。
> 现在自检走真实事件流（`emitTurn()`），这类「绕过真实链路」的自检不会再出现。

已通过的闸门（0.1.2）：

| 项 | 结果 |
| --- | --- |
| `pnpm -C oblivion-core run build` | ✅ `lib/index.js` ~51 KB + `lib/testkit.js` |
| `pnpm -C oblivion-core run typecheck` | ✅ 0 错误（strict） |
| `pnpm -C oblivion-core run test` | ✅ 12/12（修了一条过期断言：`dsh.compat` 是兼容声明，不是 `dsh.bundle`） |
| `pnpm -C oblivion-core run selfcheck` | ✅ **25/25**（真实事件流落盘 / 幂等 / 注入过滤 / 兜底 / L3 四规则 / F2·F3 闸门 / F3 深度 ≥3 候选 / F5 保留期 / 分类落盘 / 防误伤 / 装载即建目录 / 留痕 / status 快照 / 建议边界） |
| `pnpm -C oblivion-core run check:version` | ✅ `0.1.6` |
| `dshx check`（CLI 直跑） | ✅ manifest / object-form / boot-marker |

**真实 Host 已验证的部分**：插件确实被装载（`status.json` 里 version 跟着构建时间刷新）、
分类目录自动创建、`@oblivion/panel` 的只读路由 200。
**仍未验证的部分**：`turn/end` 是否真的送达本插件 —— 见「坑清单 5.5」。

---

## 二、下一步（按顺序）

### 第 1 步：**不用重启**，先让探针收到一个 `turn/end`

2026-10-06 实测修正：**link 挂载的插件，Host 半边改完 build 就会被自动重挂**（1 秒级），
所以「重启 App 才生效」只对 bundle 层的插件成立。现在的做法：

```powershell
# ① 装链接与补丁行都已在位；只看一眼列表
& 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop list
# ② 正常用一轮（就是普通的问一句），然后看探针
Get-Content "$env:USERPROFILE\.oblivion\data\events-probe.jsonl" -Tail 10
```

**按「坑清单 5.5」的判读表处理**；若探针里出现 `turn/end` 且 `sessionIdOk: true`，则问题在 `handle()` 内部，
给 `handle` 也加一行探针即可定位。

### 第 2 步：证明闭环

```powershell
# a) 分类目录应已自动建好（DEC-029：装载即建，不必等第一次落盘）
Get-ChildItem 'C:\Library\那些渐渐被遗忘' -Directory      # 01_问答沉淀 / 00_导入文件 / 02_Wiki页面 / 03_创作产物 / 99_其他
# b) 正常问一句（≥10 字、有实质回答），再查落盘
Get-ChildItem "$env:USERPROFILE\.oblivion\data"                 # 期望 ts-*.json + decisions.jsonl
Get-ChildItem 'C:\Library\那些渐渐被遗忘\01_问答沉淀'            # 期望 <主题>.md
# c) 六个工具可调：oblivion_status / query / capture / profile / feedback / graph_neighbors
```

出现 `ts-*.json` + `01_问答沉淀\*.md` = `turn/end → 捕获 → 落盘` 整条链通了。
**在此之前只能声称 `SOURCE_BUILT`，不能声称 `RUNTIME_VERIFIED`。**

若仍为空：看 Host 日志有没有 `[oblivion-core] turn/end 时没有任何可读事件` —— 有就是上游事件形状又变了，
按「API 对账」重读 `dsh-session` 的 `lib/types/types.d.ts`，并把结论登记回 `oblivion-core/README.md` 第五节。

### 第 3 步：第二个插件

内核的 4 个差距已在 0.1.2 补齐（见第六节），所以现在的岔路口是：

* **A. 继续补内核**：`oblivion_docs/` 落盘目录结构（§12.12）、LLM 判定接入（等 `dsh-llm` 稳定调用面）、
  向量检索/anydoc WASM（**要先登记许可证**）。
* **B. 按设计书开 Phase 2** `@oblivion/knowledge`：**必须先重新划界**，否则两个包抢同一条 `turn/end`、双重落盘。
* **C. Phase 7–9**：`content-creator`（前置未满足）、`adapter-obsidian`（服务存在性待对账）、发布工程学（最独立）。
* **D. 工程债**：根 `VERSION` 的递增器（A1；`oblivion-core` 这次已随包带上 `scripts/bump-version.mjs`）。

---

## 三、可复用开发流程（本机实测顺序）

```
1. 读需求 → 在知识库检索同类实现
   python C:\Library\那些渐渐被遗忘\_kb\scripts\kb.py find <关键词>

2. 确定形态：object（Host）还是 client（浏览器）？
   client 才有设置页；object 只能通过 cordis.patch.yml 的 config 改参数

3. API 对账：**不要相信任何文档，去读 node_modules 里的真实产物**
   $nm = "$env:APPDATA\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai"
   # 找同类官方包，读它的 lib/index.js 与 lib/types/*.d.ts

4. 建包：目录名必须匹配 pnpm-workspace.yaml 的 `oblivion-*` glob

5. 写 src → build → typecheck → test → selfcheck
   & $node $pnpm -C oblivion-core run build / typecheck / test / selfcheck

6. 静态检查（CLI 直跑，MCP 工具面不可用）
   & $node --import "file:///$($dshx -replace '\\','/')/node_modules/tsx/dist/esm/index.mjs" `
        "$dshx\src\cli.ts" check '<插件目录>' --harness 'C:\Projects\deepseek-harness'

7. 写 selfcheck（端到端自证）—— 这是本机唯一能自证的验收面

8. 用户执行：dsh plugin add 'link:...' + profile 补丁插入行
```

**自检的价值已被两次证明**：`@oblivion/core` 的两个真 bug（首跑装载顺序、价值阈值过高）
都是端到端用例抓出来的，静态类型检查一个都没抓到。

---

## 四、坑清单（本机实测，每条都付过代价）

### 1. Creator Mode+ 的 MCP 工具面全废（平台限制，不是配置问题）

`dshx_check` / `dshx_scaffold` / `dshx_activate_new_client` / `dshx_activation_plan` / `dshx_hot_reload`
全部返回：

```
dshx creator
ERROR  creator   Creator+ Host identity is incomplete: process start time unavailable for pid <pid> (exit-1)
```

根因：这些工具在桥接层先跑 `dshx creator claim`，而 claim 依赖 POSIX `ps -o lstart=`。
Windows 没有支持该参数的 `ps`，`lsof` 也不存在 → `discoverWebHosts` 恒为 `complete: false`。
**跑 `dshx start` 修不好。** 绕行：CLI `check` + profile 补丁插入行。

### 2. `defineTool` 的 schema 有硬约束

`@deepseek-ai/dsh-tools` 的类型里 `ObjectValueSchemaSpec.additionalProperties` 是**必填**，
且 `execute` 返回类型由 `output.schema` 推断（`Promise<InferValue<O>>`）。
漏了 `additionalProperties` 连 `{ type: 'object' }` 都编译不过；
`output.schema` 写 `{ type: 'object', additionalProperties: true }` 才能返回结构化对象。

### 3. 框架包必须标 esbuild `external`

`@deepseek-ai/dsh-tools` 打进产物 = 330 KB，标 external = 43 KB。
理由不是体积而是**一致性**：它负责参数校验，两份 schema 分叉的症状是「明明校验过却报错」。
同时放 `devDependencies`（本地类型/解析）+ `peerDependencies`（运行时 Host 提供）。

### 4. `dsh.bundle` 决定激活方式（别混）

| package.json | 效果 |
| --- | --- |
| 有 `dsh.bundle.patch` | 走 profile 的 bundle 层，**改一次要重启 App** |
| 无 | 普通依赖 + profile 插入行，**可热挂** |

`oblivion-core` 刻意不声明 `dsh.bundle`（认知层要频繁迭代）。
`oblivion-vimc` **2026-10-06 从 bundle 层改回热挂**（同样不声明 `dsh.bundle`）—— 所有者裁定：
「迭代免重启」优先于「换机器不丢」。`@oblivion/brand` 仍在 bundle 层。

> 换机器后热挂那一行**不会自己出现**。现在有机器断言兜住：包在 `dsh.compat.requires.patchInsert`
> 里声明自己的 id，`tools/verify-dsh-compat.ps1` 就去 profile 用户层 `cordis.patch.yml` 找那一行，
> 找不到即 FAIL（同一条断言还会拦住「热挂包又出现在 `dsh.profile.bundles` 里」= 双重挂载）。

### 5. **Host 侧改代码要重启 App**（原结论正确；我中途改错过，这里更正回来）

**最终证据（2026-10-06，同一天内自证）**：

| 触发手段 | 结果 |
| --- | --- |
| 只构建 `lib/index.js` | 有时生效（08:52→08:53、09:10:19→09:10:20），**但不可靠**：09:49 构建后连续 32 秒无变化 |
| 重写 profile 补丁层（内容不变，只改 mtime） | ❌ 无效 |
| 摘掉再插回补丁行（强制树重算） | ❌ 无效 |
| `dsh plugin --profile desktop add 'link:…'`（重写 profile 清单） | ❌ 无效 |
| **重启 DSH Desktop** | ✅ 唯一可靠手段 |

**机制解释（与所有观测一致）**：profile 补丁层只负责**新行的首次装载**（`@oblivion/panel` 插入后路由立刻 200 ✓）；
对**已经装载过的插件**，改它的 `lib/` 不会被重新导入（ESM 模块命名空间缓存）。
早先那几次"自动重挂"应是同一时间窗口内的 `pnpm install` 重算了 profile 树所致，属**偶发**，不能依赖。

**结论（写死，别再试别的花招）**：
- 改 **Host 半边**代码 → `build` → **重启 App**（约 10 秒，可接受）；
- 改 **浏览器半边**代码 → `build` → **硬刷新页面**（`Ctrl+Shift+R`）；
- **新增**插件行 → 补丁落盘即装载，**不用重启**。

### 5.5 ✅ 已结案：`turn/end` 收不到 —— **`session/event` 是作用域过滤派发**（2026-10-06）

**现象**：`oblivion-core` 装载正常（`status.json` 跟着构建时间刷新、只读路由 200），但 `stats.turns` 恒为 0、
`decisions.jsonl` 从未生成；v0.1.6 的探针（守卫**之前**记录每个事件）连续几天**一行都没有**。

**根因**（逐字取证：`packages/core/session/src/index.ts:70`）：

> Scope-filtered dispatch（`@deepseek-ai/dsh-scope`）：**agent-scoped listeners receive only events
> from sessions entered through that agent's context.**

即：`session/event`（以及 `session/created`、`agent/*` 这一批）**只派发给「在该 agent 作用域内」的监听者**。
我们原来把订阅挂在 **profile 根上下文**上 —— 语法、事件名、订阅姿势全对（官方 14 处同样的写法），
但**根上下文不在任何 agent 的作用域里，所以一个事件都收不到**。这就是「路由 200 + 零事件」的全部原因。

**已排除的旁支**：① 插件没装载；② 订阅写法错；③ 写盘失败；④ 会话跑在另一个进程
（进程取证：Host PID **27188** 同时监听 19387、写 `host-mount.json`、跑会话，只有一个 Host）。

**修法（v0.1.7 / v0.1.8）**：先听 `agent/created`，再在 **`agent.ctx`** 里订阅 ——
官方 `context/file-reference-local/src/index.ts:92` 就是这么写的，`Agent` 也暴露 `ctx`（`core/agent/src/runtime-types.ts:174`）：

```ts
ctx.on('agent/created', ({ agent }) => attachAgent(agent));   // 以后新建的
ctx.inject(['agents'], (ctx) => ctx.agents.list().forEach(attachAgent));  // ★ 已在跑的（热重挂时必需）
// attachAgent: agent.ctx.on('session/event', handler)
```

★ 那一条是**实测补上的**：profile 补丁热重挂时当前会话的 agent 早就创建了，只听 `agent/created` 会漏掉它。

**探针保留 + 增强**：`events-probe.jsonl` 每条带 `origin`（`root` / `agent`），一眼看出是哪条订阅收到的。
判读：**只有 `agent` 行、没有 `root` 行 = 作用域规则如文档所述**；两边都有 = 规则放宽了。
链路稳定后把 `enableEventProbe` 设回 `false`。

### 6. `pnpm install` 会联网，可能很慢

实测一次 `@deepseek-ai/dsh-tools` 的解析耗时 72 秒（registry 缓慢）。
`pnpm-workspace.yaml` 的 `allowBuilds` 只放行 `esbuild`，不要在插件目录里跑 `npm install`。

### 7. 设置页只属于 client 插件

Host 侧（`kind: object`）**没有**可以渲染的东西，无法长出设置页。
参数调整走 profile 补丁的 `config`，且 note：**patch 里的 `config` 是整段替换而非深度合并**，
`resolveConfig` 会补默认值，所以可以只写要改的键。

### 8. profile 补丁的 YAML 细节

- `@` 开头的标量**必须加引号**：`id: '@oblivion/core'`
- `link:` 依赖**必须用正斜杠**：`'link:C:/Projects/Oblivion/<name>'`
- ⚠️ **绝对不要用正则去摘/插补丁行** —— 2026-10-06 事故：用 `(?ms)\s*` 匹配删行时把换行一起吃掉，
  结果变成 `disabled: false- insert:`，**App 直接启动失败**（`parsePatchList` 抛错，崩溃窗口弹出）。
  正确做法：
  1. **先备份**：`Copy-Item cordis.patch.yml cordis.patch.yml.bak-<时间戳>`
  2. 改完**必须用 YAML 解析器验证**（`profile/node_modules/yaml` 就有）：
     ```powershell
     node -e "const Y=require('<profile>/node_modules/yaml');const d=Y.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(Array.isArray(d)?'array ✅':'❌',d.length)" <patch>
     ```
  3. 验证通过再重启 App；崩溃窗口里**点 `Restart`**，不要点 "Disable third-party plugins…"（那会把我们的插件一起停掉）

---

## 五、验收状态分级（报告时只声明已达成的层）

```
SOURCE_BUILT            → build 通过
ARTIFACT_SYNCED         → 产物就位
NEXT_BOOT_REGISTERED    → 补丁行写入
HOST_TREE_ACTIVE        → 插件真的装进组合树
CLIENT_MANIFEST_PRESENT → 客户端清单可见（仅 client 插件）
CLIENT_LOADED           → 页面里真的加载了（仅 client 插件）
VISUAL_BEHAVIOR_VERIFIED→ 人眼/实测确认行为
```

`@oblivion/core` 当前：`SOURCE_BUILT` ✅ / 其余待第二节验证。
---

## 六、路线图对账（2026-10-06 补记）

`.memory/TODO.md` 的「C. 实现路线」把认知层拆成 **8 个独立插件**，而 `@oblivion/core` 实际把
**Phase 2–6 合并成了一个包**。这不是随手改的，必须记录理由与遗留项：

| 设计书 Phase | 计划插件 | 现状 |
| --- | --- | --- |
| 2 | `@oblivion/knowledge` | ⚠️ 已并入 `oblivion-core`（knowledge 模块），但**向量检索 / anydoc WASM / md_rules.yaml / oblivion_docs 目录结构未做** |
| 3 | `@oblivion/qa-loop` | ⚠️ 已并入（qa-loop 模块），触发事件改为 `turn/end`（原因见下） |
| 4 | `@oblivion/perspective` | ⚠️ 已并入，但 F3 深度模式**降级实现** |
| 5 | `@oblivion/graph-growth` | ✅ 已并入，权重规则与 §25.6 逐条一致（0.3 / +0.05 / cap 1.0 / 30 天 ×0.95） |
| 6 | `@oblivion/feedback` | ⚠️ 已并入，但 **90 天保留期 + 定时清理未做** |
| 7 | `@oblivion/content-creator` | ❌ 未做 |
| 8 | `@oblivion/adapter-obsidian` | ❌ 未做 |
| 9 | 发布工程学 | ❌ 未做 |

### ✅ 设计书第 3 条已修正：`session:complete` 不存在

设计书 Phase 3 原写「四层筛选 + `session:complete` + 防回灌（RISK-117）」。
**实测：`session:complete` / `session/complete` 在官方 287 个包里 0 命中**；
`dsh-session` 的 `KNOWN_SESSION_EVENT_TYPES` 共 59 个事件，**没有任何 complete 类事件**，
`turn` 类只有 `turn/start` / `turn/end`（73 个文件在用）。

**0.1.2 已把 `.design/ARCHITECTURE.MD` 的 4 处与 `.memory/TODO.md` 的 1 处全部改为 `turn/end`**
（表里保留「⚠️ 实测 `session:complete` 不存在」的注记，防止后来者又照旧写法实现）。

### 设计书遗漏的第 5 条（0.1.2 一并修正）：`eventsSnapshot` 不能直读

`dsh-session` 的 `eventsSnapshot` 是 **private** 字段，只在标着 `deprecated` 的
`snapshotEvents()` 里懒加载；公开的 `eventAt()` / `snapshotEvents()` 都注着 "new calls are prohibited"。
**正确姿势：订阅 `session/event` 自己在事件流里累积本轮事件。** 详见 `oblivion-core/README.md` 第五节第 8 条。

### 已落地内核相对设计书的 4 个遗留差距 —— **0.1.2 已全部补齐**

| # | 差距 | 设计书出处 | 0.1.2 的处理 |
| --- | --- | --- | --- |
| 1 | L3 规则过滤不全（只判长度） | §25.1 L3 | 四条规则全实现：答案 <5 字 / 仅含无意义词 / 开头 40 字内「不知道」/ 纯寒暄；每条都带 reason，自检逐条断言 |
| 2 | F3 深度触发降级（全局计数 + 单条） | §25.4 | 改为**连续同维度计数**：连续 ≥3 次同维度追问 → **≥3 个候选视角**；闸门「单会话 ≤5 次」；自检断言普通=2 / 深度=3 |
| 3 | F5 保留期未做（只做上限 40） | §25.7 | **90 天保留期**，**读取时惰性裁剪**（满足「无定时任务」约束），裁剪结果落盘；`feedback.stats()` 可查裁剪数 |
| 4 | F2 闸门与设计不同 | §25.4 | 按设计实现三通道：**主动触发**（会话 ≤3 且问题 ≥10 字且有来源）+ **深度触发**（见 2）+ 陪伴期（>10 会话且某维度 ≥3 次）；共用安全闸门：置信度 ≥0.3、被拒 ≥2 次不再提 |

> 注意 §25.4「主动触发只在最早 3 个会话」与既有「≥4 会话才观察」是**相反方向**的：0.1.2 把两者
> 都保留为**不同通道**（主动 / 陪伴），并在 `src/perspective/index.ts` 的注释里写明，避免下一轮再判一次。

### 第二个插件的两条路（需先裁定）

| 选项 | 内容 | 代价 |
| --- | --- | --- |
| **A. 继续补内核**（建议） | `oblivion_docs/` 目录结构、LLM 判定接入、向量检索（**先登记许可证**） | 不新增能力，把内核做扎实 |
| **B. 按设计书继续 Phase 2** | 做 `@oblivion/knowledge`：向量检索 + anydoc WASM + `md_rules.yaml` + `oblivion_docs/` | **职责与已落地的 knowledge 模块重叠**，必须先重新划界，否则两个包抢同一条 `turn/end` |
| C. 跳到 Phase 7 | `@oblivion/content-creator`（播客脚本/学习指南/FAQ/摘要） | 设计书自己标注"默认不加载"、"需先实测 notex REST API"，前置未满足 |
| D. 补工程债 | 根 VERSION 递增器 / 测试框架 / CI | `.memory/TODO.md` 的 A1 与 D 节（core 已自带 `bump-version.mjs`） |

**建议顺序：先做第 1 步（重启验证闭环），再 A → (D 里的根 VERSION 递增器) → 最后看 B。**

---

## 六、知识库的版本约定（盲区修正，2026-10-06）

| 位置 | 放什么 | 规则 |
| --- | --- | --- |
| `00-Index/索引.md` | **只放指针**（主题 / 条目 id / 标题 / 状态 / 落地 / 更新） | 每次写库自动重建，别手工编辑 |
| `01_问答沉淀/` | 自动捕获的问答笔记 | 带 YAML frontmatter（status/impl/topic） |
| `04_会话整理/` | `oblivion_digest` 的整理笔记 | 同上 + 决策/待办/未决/双链 |
| `50-Conflicts/` | **冲突对照页**（新旧并列） | 设计铁律：**不合并**；同一条冲突重复写不追加第二段 |
| `<dataRoot>/conflicts/` | 冲突的机器可读副本 | 与 50-Conflicts 同时写 |

**状态口径**：`active` 现行 / `superseded` 已被新版取代（不删，带 `supersededBy`）/ `draft` 草稿 / `conflict` 有冲突 / `archived` 归档。
**落地口径**：`implemented` / `designed` / `placeholder` —— 设计书里「26 个包 vs 8 个插件」那类混淆，根因就是缺这个字段。

**安装入口**：`@oblivion/bundle`（一条命令装齐四个插件；只插 core/panel 两行）——
`brand` 自带 bundle patch，由安装器写进 `dsh.profile.bundles`；
`vimc` 走**用户层热挂**，装完要在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 补一行，
`pnpm run verify:dsh` 的 `patchInsert` 断言会在缺这行时报 FAIL。

---

## 七、2026-10-06 事故与结论（三次自伤 + 一次真因）

### 坑 9：**未在 `inject` 里声明的服务，属性访问会抛错**（App 起不来 ×1）

Cordis 的守卫：`ctx.agents` / `ctx.slots` 这类服务，只要没在插件 `inject` 里声明，**读取那一刻就抛**
`cannot get property "agents" without inject`。我把这种读取**直接写在诊断对象字面量里**（无 try/catch），
结果 core 装载失败、App 崩溃窗口弹出（panel 同时因为 `inject: []` 却读 `ctx.slots` 而失败）。

**规矩**：
- 诊断代码**一律不得阻断装载** —— 所有服务访问包 `safeRead()`（core 有实现可抄）；
- 要用的服务就**写进 `inject`**（panel 的客户端半边因此改成 `inject: ['slots']`）；
- 每次动 `ctx.*` 之前先问一句：这个服务在我的 `inject` 里吗？

### 坑 10：**根上下文的事件派发整体不生效**（收不到事件 ×N）

实测 `mount-diag.json`：`rootSeen: 0`、`agentSeen: 0`、`lifecycleSeen: {}` ——
不只是 `session/event`，连 `agent/created`、`session/created`、`turn/start` **一个都收不到**。
所以"在 profile 根上下文挂 `ctx.on(...)` 收事件"这条路是死的（换 bundle 层挂载也一样）。

**唯一可靠的两个入口**（宿主主动回调我们）：
1. `systemPrompt.section` 的 `text(context)` —— 每轮都会跑，`context.agent` 就是当前 agent；
2. 工具 `execute(args, exec)` —— 工具调用必在某个 agent 会话内，`exec` 带 caller agent。

拿到 agent 后，在那**它自己的 ctx** 上 `on('session/event')` 才有事件（作用域过滤派发）。

### 坑 11：**仓库文档/配置不要用脚本改**（写坏 ×2）

- 用 `-replace '(?ms)…\s*'` 摘 profile 补丁行 → 吃掉换行 → `parsePatchList` 抛错 → **App 起不来**；
- 用 PowerShell 切片改 `CHANGELOG.md` → `-like '## [未发布]*'` 把 `[未发布]` 当字符类匹配失败 +
  `$lines[0..-1]` 反向切片复制全文 → 文件被写坏（靠 `git checkout` 救回）。

**规矩**：仓库文件只用**内容锚点**编辑；真要脚本改，先备份 + 改完立刻用解析器验证
（YAML 用 `yaml` 包 parse、Markdown 查标题计数）。profile 补丁改完必须 `yaml.parse` 通过再重启。

### 坑 12：插件市场热挂 `@` 作用域插件**一定会失败**（市场自身缺陷，换 registry 治不了）

- `dshmarket/lib/hot.js` 的**同一个解析器里两行不一致**：`:161` 解析 `id` 用 `\S+`（把引号一起吃进去），
  而 `:168` 解析 `name` 正确剥掉了可选引号。YAML 里 `@` 开头的标量**必须加引号**，于是
  `- id: '@oblivion/panel'` 被解析成含引号的 `'@oblivion/panel'`，写回时（`:568`）拼成
  `- id: 'mkt-'@oblivion/panel''` → **YAML 坏** → `bad indentation of a mapping entry` → 热挂失败、退化成重启。
- 实测证据：市场日志 `log.ndjson` 里同一形态 **9 次**（01:55 / 02:14 / 02:35×2 / 02:36×2 / 03:34 / 03:38 / 03:42）。
- 读取路径：`hot.js:522-525` —— `packageRoot = join(profileDir,'node_modules',packageName)`，读**被热挂那个包自己的**
  `cordis.patch.yml`（或它 `dsh.bundle.patch` 声明的文件）→ `:534 parseSimplePatch`。
- 同一文件里读 profile 行的另一个解析器（`:659`）写法是**对的**（`['"]?([A-Za-z0-9._/@-]+)`）——
  同一文件两个解析器不一致，这就是缺陷的形状。
- **绕不过去**：YAML 里 `@` 开头的标量**必须**加引号，而它读的就是那个包的 patch ——
  换交付层、把 insert 行搬去 `@oblivion/bundle` 之类的做法都没用，任何 `@` 作用域插件都必然踩到。
- **默认不要去改市场的 `node_modules`**（越界 + 升级即丢）。本条已被**用户 2026-10-06 显式裁定**接管：
  用户选「本机打最小补丁」，理由是上游修复不可控，而「升级后重打一次」的成本由脚本兜住。
  ① 上游修（把 `:161` 的 `\S+` 换成与 `:168` 一致的可选引号写法）仍是**正解**，值得上报；
  ② 本机补丁 = 已落地的权宜之计，产物与证据见下。
- **已落地（2026-10-06）**：`dshmarket/lib/hot.js:161` 单行改动
  `const id = /^\s+-\s+id:\s*(\S+)\s*$/` → `const id = /^\s+-\s+id:\s*['"]?([^'"\s]+)['"]?\s*$/`；
  备份 `lib/hot.js.orig-backup`（SHA256 `6FDAAB8F…`，改动前与原文件逐字节相同）。
  实测（`yaml@2.9.1`，把备份整包复制到 `lib/` 内以便动态 import 对比）：
  **修复前** `parseSimplePatch` 得 `id = "'@oblivion/panel'"`，写回串 `- id: 'mkt-'@oblivion/panel''`
  → `YAML.parse` 抛 `Unexpected scalar at node end at line 1, column 13`；
  **修复后** 得 `id = "@oblivion/panel"`，写回串 `- id: 'mkt-@oblivion/panel'` → 解析成
  `[{id:'mkt-@oblivion/panel',name:'@oblivion/panel'}]`；未加引号的 `id: plain` 修复前后都正常（无回归）。
  与备份 `Compare-Object` **只有这 1 行**不同。
- **升级后重打用脚本**：`tools/patch-dshmarket-hot-id.ps1`（`-Profile web` 换 profile、`-Path <包目录>` 指定路径、`-DryRun` 只看不做）。
  幂等（已打过 → `already patched` 且 exit 0）；改动前按**内容哈希**复用或新建备份（`hot.js.orig-backup-<版本>`）；
  **上游改写了那一行就拒绝执行并 exit 1**（不盲目打），并打印当前哈希供人工重推；
  打完再让 node 动态 import 真跑一次 `parseSimplePatch` 断言（文本改了 ≠ 行为对了）。
  DryRun / 实打 / 幂等 / 上游改写 / 已补丁五种情形均以 `%TEMP%` 下的整包副本实测通过。
  **补丁在 App 重启后才生效**（市场模块随宿主进程加载）。

### 坑 13：`developerTools` 就是 `ui-settings` 行的 `config.enabled`（外观设置，不是插件问题）

「新会话上方没有标准模式等预设切换」不是插件造成的，而是设置项**「显示代码工作视图」**关掉的结果
（`packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx:134`：`!developerTools` 就直接 return null）。
它的存储位置**不叫** developerTools：`packages/client/ui-settings/src/developer-tools-settings.ts:5`
`DEVELOPER_TOOLS_NAMESPACE = 'ui-settings'`，字段 `{ enabled: z.boolean().default(true) }` ⇒ profile 补丁里
`- id: ui-settings` 那行的 `config.enabled` **就是**它。本机已改 `true`（见 CHANGELOG），**要重启 App 才生效**。
下次再遇到「设置页 / 预设 UI 少东西」，先查这一行，别先怀疑插件。

### 工程基建

- **`status.json` 必须原子写**：实测被写成"一个完整对象 + 另一次写入的碎片"（两个写者交错，面板报 JSON SyntaxError）。
  已新增 `src/util/fs.ts` 的 `writeTextAtomic` / `writeJsonAtomic`（写临时文件 → 同目录 rename）。
  `status.json` 已接入；`decisions.jsonl` 裁剪、`feedback`/`profile`/`graph`/知识条目、笔记写入**待接入**。
- **`selfcheck` 才是抓"装载失败"的那一层**（今天的崩溃、路由数、导入缺失全靠它抓到）→ 已接进根 `check`。
- **版本号只有一处来源**：进程里一律**运行时**读包根 `VERSION`（panel 的 `readVersion()`；core 用构建期
  常量 `__OBLIVION_CORE_VERSION__`）。panel 曾写死 `export const VERSION = '0.0.1'`，于是 bump 到 0.0.6
  后面板标题栏还显示 v0.0.1。**bump 脚本改的那三处之外不准再出现版本字面量**；自检里已有
  「`VERSION` === 包根 VERSION 文件」回归。