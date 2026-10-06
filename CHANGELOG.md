# 变更日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)，版本单一真源是仓库根的
[`VERSION`](VERSION) 文件，由 [`scripts/bump-version.ps1`](scripts/bump-version.ps1) 写入。
发布流水（三级分层：alpha / rc / patch）记在 `.memory/release/`（本机目录，不入库）。

> **版本递增规则（2026-10-05 所有者裁定）**：任何新版本线从 **`0.0.1`** 起步；**已有版本号不回改**；
> 此后**每次只加第三位**（patch，例如 `0.2.0 → 0.2.1`）；第二位/第一位**只在明确要求时**才动
> （`--minor` / `--major`），不再由提交类型自动推断。规则同时记在 [`.action/AGENTS.MD`](.action/AGENTS.MD)。
>
> 注：三个插件的 `bump-version.mjs` 现已**全部**按新规则实现 —— 默认只加第三位，`--minor` / `--major`
> 必须显式开关，位置参数写 `minor` / `major` 会被拒绝（exit 2）。`oblivion-brand` 于 v0.1.1 同步完成
> （此前它仍写着旧映射 `feat → minor`）。

## [未发布] — `@oblivion/core` v0.2.8 + v0.2.7 + v0.2.6 + v0.2.5 + v0.2.4 + v0.2.3 + `@oblivion/http-bridge` v0.1.1 + `@oblivion/brand` v0.1.3 + `@oblivion/panel` v0.0.14 + v0.0.13：MCP 端点搬进 core（浏览器扩展那条路）、桥接插件改成纯传输（修掉从未激活的根因）、主题页 `oblivion_wiki`（模型判簇、插件落盘回链）、双链只指向真实存在的笔记文件、关联知识单段化、沉淀件按内容命名 + 打标签、存量回填与模型面改名工具、删掉「最近判定」区域、挂载层判定修正、知识库「仅入库」折叠、rename EPERM 退回直接写、知识库每篇文档下方显示「相关主题 / 关键词 / 日期」

### `@oblivion/core` v0.2.8 —— MCP 成为 core 的内部模块 + 进程内通道（修掉桥接插件从未激活的根因）

所有者指令（引，m04080）：『针对 `C:\Projects\Oblivion\oblivion-core` 这个插件……按照这个构建 mcp 插件，看看哪个方案好』
『mcp 变成 oblivion 的内部模块，bridge 还是外部插件。固定 42081』。

**为什么必须改**：`@oblivion/http-bridge` 从装上那天起就**从未激活过**（`apply()` 一次没跑）。两条独立证据：
`C:\Users\liveu\.oblivion\bridge-heartbeat.json` 不存在、`Get-NetTCPConnection -LocalPort 42081` 无监听；
Cordis 4.0.4 的 `@deepseek-ai/cordis/src/fiber.ts:597-623` 里 `_refresh()` 遍历 `Object.keys(fiber.inject)`，
任一服务在自己作用域解析不到就把 epoch 置 INACTIVE ⇒ 插件停在 pending。而 `src/reflect.ts:277-289`
的 `provide()` 把 key 写在 `ctx.root[symbols.isolate]`、`:233-243` 的 `_getImpl()` 按 `this.ctx[symbols.isolate][name]`
取 ⇒ **服务可见性随作用域而变**：core 把门面 provide 到自己所在上下文（并且历史上就是为了"别人也能取到"
才往根上挂），桥在自己的 fiber 里读同一个名字却拿到 undefined。两条修法方向相反，合起来是死锁。

**决策（回答所有者让我定的 A/B/C）**：选 **A 改良版** —— 桥 `inject: []`，端点经
`globalThis[Symbol.for('@oblivion/core/mcp')]` 的**进程内通道**传递。B（端点写文件、桥读文件）因每请求 IO
与陈旧风险被否；C（把 core 的 provide 挪到 bundle group 共享 scope）因**未验证、历史上正是它失败**、
并且把「桥能不能激活」重新耦合回加载顺序而被否。风格上**沿用仓库既有 TS + esbuild**，但采纳所有者贴的
参考里真正有价值的那条：桥**不依赖任何 DSH 服务**（自带 `node:http` + 固定端口），于是它永远能激活。

**新增**（core 内部模块，`oblivion-core/src/mcp/`）：

| 文件 | 职责 |
| --- | --- |
| `types.ts` | `McpFacade` / `McpKnowledge` / `McpTool` / `McpEndpoint` / `McpEndpointInfo`（刻意不 import cordis 与 dsh 类型） |
| `channel.ts` | `MCP_CHANNEL = '@oblivion/core/mcp'`、`MCP_API_VERSION = 1`、`channelKey()`、`publishMcp()`、`resolveMcp()`、`describeMcpChannel()`、`clearMcpChannel()` |
| `tools.ts` | 两个浏览器场景工具：`oblivion_capture_page`、`oblivion_search`（从桥搬来，走同一个 `knowledge` 门面 ⇒ 去重/建图/画像照常） |
| `protocol.ts` | `handleMcpMessage({ facade, rawBody, log })`：与传输无关的 JSON-RPC 分发 |
| `index.ts` | `createMcpEndpoint()` / `registerMcp()` + re-export |

**通道的四条不变量**：① `Symbol.for` 是跨 realm 的全局注册表键 ⇒ 谁调都拿到同一个键；
② 槽里放的是**端点对象**（不是快照数据）⇒ core 重载后桥下一次请求就拿新端点，不会拿旧门面写盘；
③ `publishMcp()` 返回 disposer 并被 core 挂进 `ctx.effect` ⇒ 重挂/卸载不留僵尸端点；
④ 契约有版本（`apiVersion` 1），传输层只认版本匹配的槽、**不猜着调**，两侧各自的测试都断言这两个字面量。

**协议口径**：`initialize` 回 `protocolVersion '2025-06-18'` + `serverInfo.version` = core 版本；
通知（无 `id`）不回；未知工具 **-32602**（invalid params）、未知方法 -32601、坏 JSON -32700、
门面未就绪 **-32603**；**工具异常回 `isError: true` 的正常响应**（MCP 规范：业务失败不是协议错误）。

**顺带修的一处**：`QAPair` 新增 `tagsHint?: string[]`，`oblivion_capture_page` 的 `tags` 走它合流进
`tagsFromQA()`（仍过形状闸门：ASCII、单项 ≤40 字）——历史上出现过"整句问句被当标签打上"的坏数据。

**接线**：`oblivion-core/src/index.ts` 在 `provide('oblivion', facade)` 之后
`const mcpDispose = publishMcp(createMcpEndpoint({ facade, log: … })); ctx.effect(() => mcpDispose, 'oblivion-core: mcp channel');`。
端到端探针（假 ctx 跑 `apply()`，再从**全局通道**视角驱动协议，`mdRoot`/`dataRoot` 都指临时目录）实测：
槽 `{ apiVersion: 1, owner: '@oblivion/core', at: number }`、`describe()` 报
`{"version":"0.2.8","tools":["oblivion_capture_page","oblivion_search"],"ready":true}`、`initialize` 回
`{ name: 'oblivion', version: '0.2.8' }` + `2025-06-18`、`tools/list` 两个工具、通知 `null`、
未知工具 `-32602`、`effect` 注册 10 个、跑完 disposer 后通道为空。

**闸门**：`tsc -p tsconfig.json` 0 错误（曾报 `src/mcp/tools.ts(63,9) TS2353 … 'tagsHint' does not exist`，
把门面的 `tags` 改名 `tagsHint` 后消失）；`node --test` = **51/51**（新增 `test/mcp.test.mjs` 17 项：
协议分发 / 工具面 / 进程内通道）；`node scripts/selfcheck.mjs` = **33 项失败 0**（新增「MCP 端点：发布到
进程内通道 → 协议应答 → 契约版本把关」）；`build` ⇒ `lib/index.js` 141,305 B；`check:version` = 0.2.8。

### `@oblivion/http-bridge` v0.1.1 —— 只做传输：`inject: []`，端点从进程内通道取

**根因**：本包自装上起**从未激活**（`apply()` 一次没跑）。旧版声明 `inject: ['oblivion']`，
而 Cordis 的 `fiber._refresh()` 遍历 `Object.keys(this.inject)`，任一服务在自己作用域解析不到就把
epoch 置 INACTIVE ⇒ 插件停在 pending。`~/.dsh/logs` 里的实证是同一个机制的另一种声明形态：
`outcome: { kind: 'pending', missing: ['webServer'] }`、`fiberState: 0`，条目挂在
`Plugins waiting for services (10)` 下。**声明了取不到的服务 = 一次静默的 pending**，端口不开、
无 error 日志、连「起来又失败」都没有。

**改法**：`inject = []`（永远能激活）＋ 每请求惰性 `resolveOblivionEndpoint()` 从
`globalThis[Symbol.for('@oblivion/core/mcp')]` 取端点。

| 变化 | 说明 |
| --- | --- |
| `src/index.ts` | 重写：`inject = []`；删 `ctx.inject(['oblivion'])` / `ctx.get('oblivion')` / `readFacade()` 及其死代码 `const getter = ctx.get ?? ctx.root?.get; getter.call(ctx.get ? ctx : ctx.root, 'oblivion')`（`ctx.get` 恒存在 ⇒ 退路永不生效）；每请求惰性解析；端点缺席回 **503 + `-32603`**（中文原因）；新增只读健康路由 `GET /oblivion/mcp/health`（免 token，回 `ok/version/port/path/uptimeMs/endpoint`）；心跳文件加 `inject: []` 与 `mcpEndpoint`，端点**首次**解析成功时再刷一次 |
| `src/channel.ts` | **新增**：读侧契约（`MCP_CHANNEL = '@oblivion/core/mcp'`、`MCP_API_VERSION = 1`、`McpEndpointLike`、`resolveOblivionEndpoint()` 永不抛、`describeOblivionChannel()` 带中文 reason） |
| `src/types.ts` | 重写：删 `OblivionFacade` / `KnowledgeLike` / `McpTool` 与 `AppContext.get/provide/inject/root` |
| 删除 | `src/mcp.ts`、`src/tools.ts`（协议与工具面已在 `oblivion-core/src/mcp/`） |
| `test/bridge.test.mjs` | 重写为纯传输面：**24 用例 / 6 套件**（401 三态、404/405/OPTIONS 204+CORS、413、503+`-32603`、假端点 200、健康路由 present 跟随通道、契约版本不匹配 → null） |
| `scripts/selfcheck.mjs` | 16 项断言，其中一条**逐字比对**本包与 `oblivion-core/src/mcp/channel.ts` 的契约字面量（改一处忘另一处会当场红），并断言 `inject` 为空、产物里没有 `ctx.get("oblivion")` 残留 |
| `dsh.compat.requires.workspaceServices: ["oblivion"]` | **删除** —— `inject: []` 后它不再消费 core 的 Cordis 服务（耦合改由契约字面量 + selfcheck 断言承担），留着就是一句与事实不符的声明 |

**实测**（默认配置现场）：`GET /oblivion/mcp/health` → 200 `{"ok":true,"version":"0.1.1","port":42081,…,"endpoint":{"present":false,…,"reason":"未找到通道"}}`；
`POST /oblivion/mcp/health` → 405 `Allow: GET`；`POST /oblivion/mcp`（Bearer）→ 503 `-32603`；
无 token → 401；启动日志 `[oblivion-http-bridge] loaded` + `listening · http://127.0.0.1:42081/oblivion/mcp`
+ `MCP 端点尚未就绪：未找到通道（请求会如实回 503）`。
闸门：`tsc` **exit 0**、`node --test` **24/24**、`build` ⇒ `lib/index.js` **15,087 B**、
`selfcheck` **16 项失败 0**、`check:version` **0.1.1**、`verify-dsh-compat.ps1 -Plugin oblivion-http-bridge` **2/2**。

> 现场核实的一条**否定结论**：port 42081 不是 DSH 的默认端口（web profile 的 `webserver` 配置是
> `ctx.webStartup.port ?? 3080`），旧日志里的 `EADDRINUSE 42081` 来自一个残留进程，不是端口方案撞车。
> 同理那条 `JsonSchemaError: schema.additionalProperties must be explicitly true or false` 出自
> `profiles/web/node_modules/@oblivion/core` 的**旧安装副本**（该 profile 现已没有 `@oblivion/*`）；
> 当前 core 的 4 个 DSH 工具 schema 与 2 个 MCP schema 都显式声明了 `additionalProperties`。

### `@oblivion/core` v0.2.7 —— 双链巡检脚本 `normalize-links.mjs`（把「26 段重复」这类旧账一次扫平）



所有者报的 bug（引）：

> bug：appendRelatedLinks 每批追加一个新段而不是合并，一篇笔记里堆了 26 个重复的 ## 关联知识（自动）（激活排查…md 226 行里大半是这个），双链里还混进 [[OK]]、[[继续]] 这种垃圾。把「合并成一段 + 去重 + 过滤弱标题」一起修掉

**核实**：这段话是**旧进展报告被当成待办读到了** —— 那段文字逐字出自笔记
`01_问答沉淀/① 存量改名回填 + ② 清理 .28424- .tmp.md` 第 91 行（第 34 行也有一份），
是我在 0.2.4 之前写下的「发现但没动的问题」。磁盘现状（实测）：

| 文件 | 报告里的样子 | 现在 |
| --- | --- | --- |
| `激活排查：schema 方言与 inject 服务名.md` | 226 行 / 26 段 | **142 行 / 1 段 / 19 条链接** |
| `① 存量改名回填 + ② 清理 .28424- .tmp.md` | 混 `[[OK]]`/`[[继续]]` | 106 行 / 1 段 / 6 条（剩下两处 `[[OK]]` 在第 34/91 行的**正文引用**里） |

代码侧确认：全仓只有 `src/qa-loop/md-writer.ts` 的 `appendRelatedLinks()` 写 `## 关联知识（自动）`
（`src/digest/index.ts:165` 写的是另一个标题 `## 关联知识`），**单段合并 + 去重 + `isWeakTitle()` 过滤**
都在里面（v0.2.4 起），`src/graph/backlink.ts` 的候选池也已过滤弱标题；v0.2.6 起还能
`{ prune: true }` 清掉改名回填后悬空的旧链接。

**新增**：`oblivion-core/scripts/normalize-links.mjs` —— 把这件事做成可随时重跑的巡检入口：

```bash
node scripts/normalize-links.mjs                 # 干跑：段 N → 1 / 链接 X → Y（丢 Z 条指不到文件的）
node scripts/normalize-links.mjs --apply         # 执行
node scripts/normalize-links.mjs --json          # 结构化报告（含整库复核 audit）
```

扫 `--root`（默认 `C:/Library/那些渐渐被遗忘`）下 `--dirs`（默认 `01_问答沉淀,02_Wiki页面`）里
带 `oblivion:` 标记且非 `oblivion:digest` 的笔记，`keep = links ∩ 文件名集合`，写盘走
`appendRelatedLinks(path, keep, { prune: true })`（幂等：没变化不写），末尾复核多段 / 悬空 / 弱标题。

现场结果：**多段笔记 0 篇、悬空链接 0 条、相关链接 388 条**；`--apply` 再跑写盘 0 篇。

闸门：typecheck 0 错、`node --test` **34/34**、selfcheck **32 项失败 0**、`check:version` `0.2.7` 一致、
`lib/index.js` 132,862 B。

### `@oblivion/core` v0.2.6 —— 双链只指向**真实存在的笔记文件**（现场 513 条里 478 条点不开）

- 真机复核实测：`01_问答沉淀` 的 56 篇笔记里共 **513 条** `## 关联知识（自动）` 双链，
  其中能对上磁盘文件的只有 **35 条** —— 因为候选来自**条目**（`findRelatedItems()` 拿 `item.title`
  当链接文本），而条目的 `title` 会被改名回填改掉，**旧链接就永远定格在旧名字上**；
  合并语义（`appendRelatedLinks` 只增不减）又让它永远清不掉。于是"双向可追溯"只剩纸面。
- `src/qa-loop/index.ts`：正向与反向双链都改成**落盘文件名**——先用 `notePathFor()` 找笔记，
  找不到（`''`）就**不连**（绝不新建、绝不写悬空链接）；反向那条改用新笔记自己的文件名。
- `src/qa-loop/md-writer.ts`：`appendRelatedLinks(notePath, titles, options?)` 新增
  `options.prune`（**重建**语义：丢掉段里已有的链接，只留本次给的；空列表则把段整个去掉）。
  合并语义仍是默认（一次捕获要往里加一条，不能被下一次捕获擦掉）。
- 现场修数据（一次性脚本，走同一份 shipped 代码）：按「条目 id ↔ 笔记文件名」重建关系图
  （246 对相关关系），`prune` 写回 56 篇 ⇒ 清掉约 **462 条悬空链接**，剩 **381 条全部可解析**、
  再跑一次写盘 **0 篇**（幂等）；`## 关联知识（自动）` 仍是每篇一段，正文一个字未动。
- 闸门：typecheck 0 错；build `lib/index.js` 132,862 B（v0.2.6）；test **34/34**
  （新增「prune 模式：陈旧双链可以被清掉」）；selfcheck **32/32**（双链项加 prune + 幂等断言）。

### `@oblivion/core` v0.2.5 —— 双链按文件名（标题里的 `:` `/` 会让链接悬空）

- 真机回归发现：主题页的成员链接与笔记回链用的是**标题**，而文件名是消毒过的
  （`safeName` 把 `:` `/` 换成 `_`）—— 于是本机出现了
  `[[清理死进程残留 + cordis:group 形状核对]]`、`[[Oblivion 认知层…（C 方案 → 0.1.x / 0.2.x）]]`
  这种链接：在 Obsidian 里点开是「未创建的笔记」，所有者要的**双向可追溯当场断掉**。
- `src/qa-loop/md-writer.ts`：`safeName()` 改为 `export`（文件名消毒只有一套口径），
  `appendRelatedLinks()` 写出去之前先把链接文本过一遍 `safeName()`（已有链接也一起归一化，
  于是「同一篇笔记的旧链接」与「新链接」能正确去重）。
- `src/knowledge/wiki.ts`：新增私有 `linkTargetOf(member)`（**取落盘文件名去掉 `.md`**，
  没有 `file` 时才退回 `safeName(title)`），`renderWikiPage()` 的来源笔记与口径提示都用它；
  `writebackWikiLink(raw, wikiLink)` 的参数语义改成「主题页的落盘文件名」，
  `apply()` 传 `file.replace(/\.md$/i, '')`（同名让路成 `<标题>-oblivion.md` 时链接也跟着对）。
- 测试 **33/33**（新增一项：标题里带 `:` 的成员 → 页面链接是 `cordis_group 形状核对`、
  回链用落盘页名、`appendRelatedLinks` 同样按文件名；并把纯函数夹具改成「文件名与标题不一致」）；
  自检 **32/32**（双链项加一条「链接按文件名」断言）。

### `@oblivion/core` v0.2.4 —— 第 9 个工具 `oblivion_wiki`（主题页）+ 关联知识不再堆重复段

- 所有者 2026-10-06 问：「那什么时候才能将差不多主题的合并，甚至生成 wiki 呢？」
  裁定「全做」（加工具 + 修双链 + 真跑一轮聚合），并要求主题页与原笔记**双向可追溯**。
- **为什么必须由模型判簇**（现场数据）：`01_问答沉淀` 56 篇正好落在 **55 个 `topic`** 上，
  只有一个 topic 有 2 版。而 `topic` 只是问句里第一个词串（`deriveTopic()`），
  靠字段自动合并等于合不出东西。所以「哪些笔记在讲同一件事 + 该怎么概述」交给模型，
  插件只落盘 / 回链 / 重建索引 —— 与 `oblivion_digest`、`oblivion_retitle` 同一分工，插件不调 LLM。
- **新增 `src/knowledge/wiki.ts`**：`renderWikiPage()`（frontmatter `source:"wiki"`/`generated_by:"model"` +
  `## 概述`（模型的 `summary`）+ `## 来源笔记`（成员双链，`superseded`/`conflict` 等状态就地标注）+
  非 active 成员时的 `## 口径提示` + `## 标签` + 尾标 `<!-- oblivion:wiki title=… members=… at=… -->`）、
  `writebackWikiLink()`（往成员笔记元信息行后插 `> Wiki： [[标题]]`，已有则并入去重、上限 5 页）、
  `listWikiPages()`、`createWikiService()`（`list()` / `apply()`，复用 `listNotes` 与 `freeName`）。
  三条不变量：只动带 `<!-- oblivion:id=… -->` 的笔记；**主题页是新增物**，成员正文一个字不改
  （只插一行回链）；重跑同一簇**更新那一页**（认尾标），不会长出 `<标题>-2.md`。
  用户自有的同名 md 让路成 `<标题>-oblivion.md`；空标题或成员 id 全不认识时不写空文件，直接回 `error`。
- **第 9 个模型面工具 `oblivion_wiki`**（两段式，与 `oblivion_retitle` 同形）：不带 `clusters` 给候选
  （`id`/现名/`title`/原问句/`status`/`tags`/已属哪页/摘要 + 现有页清单），带 `clusters`
  才落地；`description` 里明确「按**含义**分簇，不要按 `topic` 字段」。
- **修掉关联知识堆重复段**：老行为每批双链**追加一段** `## 关联知识（自动）`，现场有笔记堆到 **26 段**，
  还混着 `[[OK]]`、`[[继续]]` 这类弱标题。现在 `appendRelatedLinks()` 把同名段合并成一段、
  去重、丢 `isWeakTitle()` 的弱标题、上限 30，并在内容没变化时返回 `false` **不写盘**；
  `findRelatedItems()` 的候选池也一起过滤弱标题（垃圾就是从这里漏进去的）。
- 测试 **32/32**（新增 7 项：双链单段/去重/丢弱/幂等/不动正文/不动用户自有笔记 + 主题页纯函数、落地回链、
  重跑同页、防误伤同名、两段式工具、两个错误分支）；自检 **32/32**。
  `src/index.ts` 的 `createWikiService(...)` 与两处 `registerTools` 接线随并行工作流提交。

### `@oblivion/core` v0.2.3 —— 模型起的名不再被规则管线改回去（`named_by`）+ 文件名不带头尾的点

- 所有者要的「让模型……顺手给最近的笔记改名打标签」在 `v0.2.2` 交付了工具，本次**真的用它改了名**：
  对**最近 24 篇**逐篇读「原问句 + 答案小标题 + 首段」后给出内容名与 2–5 个标签，
  24/24 成功、索引重建 73 条。例：
  `还是不行.md → 三条证据推翻环境变量假说.md`、
  `继续查并修掉这个激活问题.md → 激活排查：schema 方言与 inject 服务名.md`、
  `%LOCALAPPDATA%_ms-playwright_ch.md → ms-playwright 版本错配：1234 不是 1243.md`、
  `是哪个插件.md → 截图里的插件是 dsh-better-sidebar.md`、
  `C__Programs_AITech_CodexCLI_npm.md → CodexCLI 缓存调查：插件接口细节与三个坑.md`。
- **新增 `named_by` 标记（`"model"`）**：`NoteMeta.namedBy` / `NoteRef.namedBy` / `RetitleEntry.namedBy`，
  `renderNote()` 写 frontmatter `named_by`；`oblivion_retitle` 落地时一律带 `named_by: "model"`；
  `scripts/rename-notes.mjs` 见到这个标记**直接跳过**（打印前 5 条 + 「另有 N 篇」，`--force` 可覆盖）。
  理由：字符串命名只会把内容名重新算回「去水词后的整句问句」—— 那是倒退，
  一次回填就会把模型的工作全部抹平。实测现在的 dry-run 输出是
  `共 0 篇需要动：改名 0、只改标签 0` + `另有 24 篇是模型起的名（named_by: model），规则管线让路，不改`。
- **修掉 `safeName()` 的首尾点/空格**（本机真实撞到）：模型给的名字「`.gitignore` 整棵忽略 + 搜索插件分工」
  落成的文件以 `.` 开头，而 `listNotes()` 有意跳过点开头的文件（避免 `.tmp` 之类）⇒
  这篇笔记**从插件视野里消失**：面板不显示，改名工具对它报 `note-not-found`（24 条里唯一一条失败）。
  现在 `safeName()` 先清首尾 `.` 与空白、再截断、清空了就退回 `untitled`（Windows 也会吃掉结尾的点与空格）。
  已把那份笔记手工改成不带点的名字并重新落地。
- `test/core.test.mjs` **25/25**（新增：`named_by` 写入与保住 / 文件名不带首尾点 / 工具落地也带标记）。

### `@oblivion/core` v0.2.2 —— 存量回填（53 篇）+ 清临时文件 + 模型面改名工具 `oblivion_retitle`

- 所有者 2026-10-06（看过 0.2.1 的命名效果后）：「存量 53 篇的改名回填，清理 `.28424-*.tmp`。
  让模型用 `oblivion_digest` 那种方式顺手给最近的笔记改名打标签」。
- **新增 `src/knowledge/retitle.ts`**（回填脚本与工具共用的一层）：`parseNote` / `renderNote` /
  `contentSection` / `listNotes` / `applyRetitle` / `createRetitleService`。三条不变量：
  ① 只动正文带 `<!-- oblivion:id=… -->` 的笔记（用户自有的 md 一个字不改）；
  ② 改名**不丢信息** —— 原问句写进 frontmatter `ask:` 与正文 `>Ask：`；
  ③ 改名**必须同步条目 JSON** 的 `title`（落盘路径 `notePathFor` 是按名字算的，只改文件名的话，
  下一次同条目写入会按旧名再起一份笔记）。
- **新增脚本 `scripts/rename-notes.mjs`**：默认 dry-run 打印计划，`--apply` 落地；
  `--dirs`（本次用 `01_问答沉淀`）、`--root/--data/--limit/--no-tags/--json`、
  `--clean-tmp --tmp-age-min <分钟>` 顺手清临时文件（**只删早于该年龄的**，不碰正在写的那一个）。
- **实测落地（本机真实知识库）**：计划 `54 篇需要动：改名 47、只改标签 7` → `成功 54 / 计划 54`；
  `00-Index/索引.md` 重建为 **73 条**；临时文件删除 **1488 个 / 45,241,120 字节**，
  知识库与 `~/.oblivion/data` 两处的 `*.tmp` 事后均为 **0**。
  效果例：`给出实施的具体方案.md → Oblivion C 方案 · 具体实施计划.md`、
  `查看这个方案.md → Oblivion C 方案完整设计书.md`、`key.md → 方式 2 读 key + 直连 Exa_Tavily_Fire.md`。
- **新增第 8 个模型面工具 `oblivion_retitle`**（两段式）：不带 `items` 返回候选
  （`id` / 现名 / `topic` / **原问句** / 答案摘要前 80 字）；带 `items: [{ id, title, tags }]`
  落地改名 + 打标签 + 同步条目 + 重建索引。**模型起名、插件落盘**，与其他工具一致地不调 LLM。
- 过程中发现并修掉的问题：
  - `renderNote()` 写了 `next.ask ?? parsed.meta.ask ?? parsed.meta.title`，而 `parseNote()` 把缺失字段
    读成**空串**，`??` 认它「已给值」⇒ `ask` 恒空。**那 54 篇被改名的笔记因此漏写了 `ask:` / `>Ask：`**，
    原问句在笔记里丢了。已改成 `||`，并用回填计划日志里保存的原问句（每条计划的 `ask`）一次性补回 54 篇。
  - `listNotes()` 的 `ask` 回退到 `title`：0.2.1 之前的笔记没有 `ask:`，那时的 `title` 就是问句 ——
    模型在候选列表里必须能看到「这篇原来在问什么」。
  - `fileNameOf()` 加**弱名字守卫**：`继续`/`不行`/`untitled` 这类名字之间没有信息差，
    两个都弱时守住 `topic`，否则会出现 `untitled.md → 继续.md` 这种倒退。
  - 标签：`extra` 只收「技术词形状」的串（回填时 `topic` 本身是整句问句，会把整句话当标签）；
    `#tag` 正则加前缀守卫（`## 内容` 曾被当成标签「内容」）；`cleanTitle()` 去掉 URL。
- **测试 23/23**（新增 4 项：只认自己的笔记 / 改名 + 同步 + 索引重建 / `ask` 只写第一次 /
  工具两段式与「服务缺席只回 skipped」），自检 **30 项**（工具注册面断言由 7 改为 8）。
- 一处**接线说明**：`createRetitleService` 的构造与两处 `registerTools` 依赖在 `src/index.ts`
  （该文件此刻同时在另一条工作流手里，未随本次提交）。
- 诚实的边界：纯字符串命名对**散文式答案**只能给出「去水词后的整句问句」，不是真摘要 ——
  所以 `oblivion_retitle` 才是这条诉求的落点（原名如 `memory整个文件夹都是.gitignore.md`
  这类候选，交给模型起名）。

### `@oblivion/core` v0.2.1 —— 沉淀件的名字与标签：「我问了什么」→「这里讲了什么」

- 所有者 2026-10-06 看了一眼知识库目录：
  「这些沉淀的文档，命名上看不出是什么内容，单纯只是我的问题的简写而已，需要在沉淀整理的时候顺便命名 + 打标签」。
  —— 那时文件名是 `给出实施的具体方案.md`、`查看这个方案.md`、`我的0.md`、`key.md`、`profile.md`。
- **根因**（两处，都在 core）：`deriveTitle()` = 问句第一行的**前 60 字**；而 `md-writer` 的文件名
  取自 `safeName(item.topic)`，`topic` 又 = 问句里**第一个 3–20 字词串**。于是名字是「我问了什么」，
  不是「这里讲了什么」。
- **修法**：新增纯模块 `src/knowledge/naming.ts`（不调模型 —— `qa-loop` 每轮自动跑，设计书禁止
  在主线里调 LLM）：
  - `titleFromQA(question, answer)`：① 答案里第一个**不像套话**的小标题（`## 怎么装 bundle`、
    行首加粗 `**结论**：…`）；② 否则问句**去水词**（请/帮我/查看/给出/这个/关于/如何…）；
    ③ 再不行退回问句原文，绝不产出空名。名字上限 32 字；
  - `tagsFromQA(question, answer, extra)`：扫**问句 + 答案**（旧实现只扫答案，问句里点名的插件
    反而没被打上），来源 = 技术词 + 包名（`@scope/name`、`dsh-*`）+ 正文 `#tag` +
    **一张中文词表**（插件→plugin、面板→panel、知识库→knowledge-base、密钥→credential、
    配置/补丁→config、搜索→search、图谱/双链→graph …），上限 8。
- 文件名改由**标题**决定（`md-writer.ts` 新增 `fileNameOf(item)`：标题优先、没有标题才退回 `topic`），
  `topic` 的语义回归本位 —— 它继续管「同一主题的多版聚合」与索引分组，不再兼任文件名。
- 一处**记下来的错误**：第一版让名字「在第一个标点处截断」，实测把好名字截没了 ——
  「查看opencode的配置，里面有API和密钥」被截成「opencode的配置」，而「里面有API和密钥」
  恰恰是这条沉淀的内容。现在保留整句，只按 32 字上限收尾。
- 存量笔记（本机 53 篇）的**改名回填**在同一天完成，见上面的 `v0.2.2`：笔记里只存了问句前缀
  （`title`/`topic`）与答案正文，回填用 frontmatter 的 `title` 当问句重算，并同步条目 JSON 与 `00-Index/索引.md`。
- 测试 **19/19**（新增 5 项命名/标签用例）、自检 **30 项**（新增一项：真实 `writeMD()` 落一篇，
  断言文件名取自标题、不含 `topic` 的问句简写）。

### `@oblivion/panel` v0.0.14 —— 知识库每篇文档下方显示「相关主题 / 关键词 / 日期」

- 所有者 2026-10-06：「知识库，将每个文档下方显示：相关主题和关键词、日期」。
  合栏之后每行只有两行（标题 + `刚刚 · 当前版本 · 已落地 · 主题 …`），「这篇归到哪个主题下、
  讲了什么、什么时候的」全靠点开才知道。补的第三行就是这三问：
  `相关主题：… · 关键词：… · 日期：…`。
- **`相关主题` 是回链，不是 topic 字段**（关键设计点）：取笔记里的 `> Wiki： [[标题]]`
  （`oblivion_wiki` 写回的那条），由宿主半边 `src/snapshot.ts` 的 `parseNoteHead()` 把标题
  **解析成主题页真实路径**，所以它渲染成 `<a>`、点一下直接在侧边栏打开那页 —— 这与「`topic` 字段」
  是两件事，`topic` 仍留在第二行，两种「相关主题」的解读都看得见。
  没有回链的写「**未归并**」：这本身就是「该跑一轮 `oblivion_wiki`」的信号（现场 10 篇里 6 篇已归并）。
- **`关键词`** = 笔记 frontmatter 的 `tags` 并上**同主题条目**的 `tags`（去重保序，最多 5 个，
  其余折成 `+N`）；**`日期`** = 笔记自己写的 `updated_at`（退化 `created_at`），笔记没写就按 mtime /
  条目时间折算成**本地**日期；整理件（`04_会话整理/*.md`）没有 frontmatter，日期取自它的 `>Date :` 行。
- **实现分半**（与合栏、曲线同一套路）：解析在宿主半边（能读文件，`readNoteHead()` 只读每篇
  **头部 8 KB**、`finally close`，快照多一路 `wikis`），文案在浏览器半边
  （`src/client/knowledge.ts` 的 `detailParts()` / `detailText()` / `keywordText()` / `wikiText()` /
  `dateText()` 都是纯函数，`KEYWORD_MAX = 5`、`WIKI_MAX = 2`）。
- **解析要认两种布局**：`parseNoteHead()` 同时认 frontmatter（`tags/related_wiki/created_at/updated_at`）
  与正文元信息行（`>Date :`、`>Tags：`、`> Wiki：`），大小写与全半角冒号都容忍；
  `> Wiki： [[甲]] [[甲]] [[乙]]` 这类重复按序去重。
- 测试 **34/34**（0.0.13 为 28/28，新增 describe 6 项 + 快照 9 条断言）、自检 **15 项**（0.0.13 为 14 项，
  新增「笔记头部解析 + 回链解析成路径」一项，状态路由断言 `wikis` 数组）、客户端包 46,133 B（+3,886 B）。
- **真机只读探针**（真实知识库，不启动 App）：`notes=10 digests=1 wikis=10 items=81 problems=0`、
  63 行（笔记 10、其中未归并 4；仅入库 52）、可点开主题页 6；
  样例行 `相关主题：DSH 插件激活与作用域：事件收不到、服务读不到 · 关键词：#restart #dsh #json · 日期：2026-10-06`。
- **实测暴露的噪声（留作待办，未修）**：关键词里混着 `#js #md #ts #json #api #15044` ——
  来自 `oblivion-core/src/knowledge/naming.ts` 的 `tagsFromQA` 把文件扩展名/路径片段也当标签，
  主题页 tags 同样受影响；要治得改 core 并重跑一轮 `oblivion_wiki`。

### `@oblivion/panel` v0.0.13 —— 删掉「最近判定」整个区域

- 所有者 2026-10-06（先看到只显示 6 条 + 展开按钮的那一版）：「我的意思是删掉『最近判定』这个区域」
  —— 不是再缩，是**不要**。逐条判定与曲线看的是同一批留痕数据，曲线已经能回答「在往哪走」。
- 删除：`<div>最近判定</div>`、那份 `<ul>` 列表、`展开全部 N 条` 按钮，以及只为它存在的
  `RECENT_LIST_LIMIT`、`expanded` 状态、`newest`/`shown` 计算和 `actionLabel`/`scoreText` 两个 import。
- 逐条信息并未消失：曲线上的每一个点鼠标停上去仍显示「时间 · 动作 · 分值」（`ScoreChart` 的 `<title>`），
  「为什么没沉淀」看上面的「主要拦截原因」。
- 快照契约不动：`trace.recent` 仍在（宿主照发），只是面板不再渲染它 —— 日后想恢复列表不用改后端。
- 测试仍 **28/28**、自检 **14 项**（这两道闸门本来就没覆盖列表渲染，正好证明删得干净：typecheck 通过
  说明没有留下未使用的 import）。

### `@oblivion/panel` v0.0.12 —— 知识库一栏再收一层：「仅入库」默认只列最近几条

- **症状**：合栏之后本机 65 个条目合成 **47 行**，其中 36 行是「仅入库」（没有笔记文件的纯条目），
  一屏列表里它们把能点开的 11 行笔记挤到看不见 —— 与「最近判定」是同一句话：
  所有者要的是「不需要这么多」，不是「都列出来」。
- **修法**：新增纯函数 `knowledgeView(rows, { itemLimit = KNOWLEDGE_ITEM_LIMIT(5), showAll })`
  → `{ backbone, itemOnly, visible, hidden }`。默认**有笔记的行全部显示**、「仅入库」只留最近 5 行，
  其余一个按钮展开（`展开全部 47 行（另有 36 行仅入库）` ↔ `只看有笔记的 11 行`）。
- **顺序不变**：`visible` 是「按原数组过滤」得来的（不是「先 backbone 再 itemOnly」拼接），
  折叠与展开之间行位置不跳；展开时 `hidden` 归零。
- 测试 **28/28**（新增 3 项折叠用例：默认切分与顺序 / 展开 / itemLimit 与空输入）、
  自检 14 项（「知识库合栏」一项里补默认折叠断言）。

### `@oblivion/panel` v0.0.11 —— 去掉「最近判定」标题里的窗口说明

- 所有者 2026-10-06：「不显示：最近判定 （窗口 10 条，显示最近 6 条）」—— 标题只要说「这是最近判定」，
  窗口大小再写进标题就是噪音：列表长度看得见，曲线下面那行「最近 N 条判定 …」已经说清了。
- 改动只有一处：`src/client/Panel.tsx` 里那个 `<span>` 连同「窗口 N 条，显示最近 M 条」一起删掉；
  默认 6 条 + 「展开全部 N 条」按钮不变。

### `@oblivion/brand` v0.1.3 —— 挂载层判定：组合层补丁也算「已启用」

- **症状**（所有者要求复核「个人已安装插件」时实测到）：`@oblivion/core`、`@oblivion/panel`、
  `@oblivion/http-bridge` 显示「已装未启用」，而它们的路由当时正在正常响应 ——
  **清单说没跑、实际在跑**，这比少显示一条更坏。
- **根因**：判据只扫了 **profile 用户层** 的 `cordis.patch.yml`。这三个包是被 **`@oblivion/bundle`
  自己 `dsh.bundle.patch`**（组合层）里的 insert 行 / `cordis:group` 子行挂载的，用户层里没有它们的名字。
- **修法**：`src/profile-plugins.ts` 新增 `bundlePatchOf(dir, name)`（读包 `package.json` 的
  `dsh.bundle.patch`，值形如 `"./cordis.patch.yml"`）与 `bundleLayerPatch()`（把
  `dsh.profile.bundles` 里每个 bundle 的补丁拼成一段文本），判定改为「用户层 ∪ 组合层」；
  新增 `layer` 字段（`bundles` / `bundle-patch` / `user-patch` / `none`）与 `layerLabel()`，
  界面在「已启用」后标出是哪一层 —— 组合层改配置**必须重启**，用户层补丁才是可热挂的那一层。
- 旧宿主没有 `layer` 字段时按 `bundled` / `patched` 退化推断（`asLayer()`），不编造新层；
  自检夹具补上「bundle 自带 patch 又插了另一个包」这一路，断言它必须判为已启用。
- 复核结果（本机 16 条）：`dsh-creator-mode-plus` 正确显示「已装未启用」；core / panel / http-bridge
  修正为「已启用 · 组合层补丁」。

### `@oblivion/core` v0.2.0 —— rename 失败退回直接写（EPERM）

- **症状**（所有者截图，面板「最近判定」里那条「判定异常」）：
  `Error: EPERM: operation not permitted, rename 'C:\Library\那些渐渐被遗忘\01_问答沉淀\.28424-muwoxqso-bj0uwe.tmp' -> 'C:\Library\那些渐渐被遗忘\01_问答沉淀\最近判定也不需要这.md'`
  —— 整条捕获被判「判定异常」，**笔记一个字都没落盘**。
- **根因**：0.1.20 起 core 的默认写盘入口是「临时文件 + 同目录 rename」，而 Windows 上 rename 会被
  杀毒 / 索引器 / 同步盘的**瞬时占用**挡下（临时文件刚建、目标文件正被读）。追求原子性时把内容一起赔了进去。
- **修法**：`src/util/fs.ts` 的 `writeTextAtomic()` —— rename 失败 → 清理临时文件 → **退回直接写**
  （`node:fs/promises.writeFile`），让调用方的日志体现这次降级。取舍写进注释：
  **宁可「写进去但不原子」，也不要「原子但什么都没写」**。同路径的 `writeJsonAtomic()` / `writeFile()`
  一并受益（status.json / feedback / profile / graph / 笔记 / 索引页 / 整理件 / 冲突页）。
- 本次只改 `src/util/fs.ts`（core 0.2.0 的其余内容属另一个并行工作流）。

### `@oblivion/panel` v0.0.10 —— 判定曲线（「最近判定」缩到最近几条）

- **症状**：所有者 2026-10-06 贴了一屏「最近判定」（10 行，每行都是「已沉淀 · 分值 0.8」）说
  「最近判定也不需要这么多，可以给个图表曲线看看」。列表把每一行都当同等重要地铺开，
  而真正想看的是**分值在往哪走**。
- **列表**：默认只列最近 **6** 条（`RECENT_LIST_LIMIT`），其余一个按钮展开/收起；标题写清
  「窗口 N 条，显示最近 M 条」—— 窗口大小来自 `config.recentLimit`，不偷偷多显示。
- **曲线**：新增 `src/client/chart.ts`（纯几何，不引 React、不引 `node:`）+ `src/client/ScoreChart.tsx`（只画）。
  纵轴**恒为 0..1**（core 的价值分就是 0..1 的加权分），不按数据自适应 —— 这样两次刷新之间、
  两条曲线之间可以直接比，阈值线才有意义；横轴按**行序**等距（不是按时间：留痕里有的行没有 `at`，
  `no-qa` 也占一行）；没有分值的行**不落点**、只计入 `skipped`（不编造 0 分）。
- **三层线**：分值折线 + 折线下填充 + 滑动均值趋势线（默认窗口 5；**少于 3 个点不出趋势线**，
  两个点的「趋势」是假的）+ 阈值红色虚线（取自 core 写进 `status.json` 的 `config.valueThreshold`，
  实测 0.30；不在 0..1 内就不画 —— 宁可不画，也不画一条假的）。
- **窗口**：快照新增 `trace.series`（与列表同一次读盘取尾部，上限 240 点），列表仍用 `trace.recent`；
  曲线看趋势、列表看「刚才」，两者同源不重复读盘。
- 测试 **25/25**（新增 5 项曲线用例：y 映射 / 阈值线 / 趋势线门槛 / 坏行与越界分值 / 文案数字来源）、
  自检 **14 项**（新增「判定曲线」；路由断言补 `trace.series`）。

### `@oblivion/panel` v0.0.9 —— 知识库合成一栏（方案 A）

- **症状**：面板把「最近沉淀」（条仓库 `<dataRoot>/ts-*.json`）与「知识库笔记」（磁盘
  `<mdRoot>/01_问答沉淀/*.md`）并排列成两栏，绝大多数情况下一一对应 ⇒ 同一批标题列了两遍，
  看起来就是冗余。所有者 2026-10-06 问「这个最近沉淀和笔记有何区别，感觉最近沉淀无必要」，
  并裁定**方案 A：合并成一栏**。
- **但条目栏不是多余的**：它独有三件事 —— ① 同主题出新版时旧条目转 `superseded`（不删），
  而笔记按主题只有一篇；② 没有笔记的条目（`oblivion_digest` 的笔记落在 `04_会话整理/`，
  另有主题没落成文件）；③ `status` / `impl` / 版本数等结构化字段。合并不是删栏，是换一种承载。
- **实现**：新增纯函数模块 `src/client/knowledge.ts` 的 `mergeKnowledge({ notes, digests, items })`
  —— 以笔记为骨架，按「主题 == 笔记名 或 标题 == 笔记名」把同主题条目聚上去（版本数、状态取当前版本），
  匹配不到的条目按主题归组补成一行并标「仅入库」/「会话整理」。匹配规则刻意保守：宁可多一行，也不乱并。
- **快照侧三处配合**：`ItemRow` 增加 `impl` 与 `sourceTypes`（识别整理件用）；条目改成**宽窗口**读
  （`max(limit*8, 100)`），否则「共 N 版」永远显示不出来；新增 `digests`（读 `04_会话整理/*.md`），
  整理件从此在面板上可点开。
- **展示**：一栏「知识库（N）」+ 来源计数行（问答笔记 x · 会话整理 y · 条目 z），
  每行第二行是 `时间 · 状态 · 落地 · 共 N 版 · 来源 · 主题`；`itemStatusLabel` / `implLabel` / `sourceLabel`
  把 `active/superseded`、`implemented/designed/placeholder` 说成人话。
- 测试 **20/20**（新增 6 项合栏用例）、自检 **13 项**（新增「知识库合栏」；路由断言补 `digests`）。

### `@oblivion/brand` v0.1.2 —— 「个人已安装插件」清单 + 一键复制重装命令

- **意图**：重建环境时不必回忆「装过什么、装的是哪个规格」。面板里列出本 profile 的
  `dependencies`，每条给出可复制的重装命令；**不写清单文件、不导出 `.ps1`**（所有者 2026-10-06 裁定）。
- **数据源就是 profile 目录本身**：`package.json` 的 `dependencies` 与 `dsh.profile.bundles`、
  外加 `cordis.patch.yml` 文本。宿主新路由 `GET /obl-brand/plugins`（只读、只回本机调用方：
  `isTrustedCaller` 不过即 403，非 GET 即 405）返回 JSON，浏览器半边只渲染与复制。
- **「已启用」判据 = `bundled || patched`**：实测本机 `dsh-creator-mode-plus`、`dsh-whale-widget`
  在 `dependencies` 里但既不在 `bundles` 也没有补丁行 ⇒ 宿主**不会**加载它们，面板显示
  「已装未启用」；`@oblivion/core` / `@oblivion/panel` 靠 `@oblivion/bundle` 的 `insert:` 挂载，
  判定为已启用。
- **恢复命令的引号规则**：`link:C:/Projects/Oblivion/oblivion-core` 含冒号必须加引号（`'…'`，
  PowerShell 规则）；`^1.2.3` 这类 semver **不**加引号 —— `^` 在 PowerShell 里不是元字符，
  而 cmd.exe 里单引号不是引号，多此一举的引号反而更糟（规则与理由写在 `src/plugin-list.ts`）。
- **顺手收口两处重复**：配色与卡片样式抽到 `src/client/theme.ts`（原来只有 `BrandSettingsPanel.tsx`
  一份，新区要与它长得一样）；路径常量抽到 `src/paths.ts`（原来宿主与浏览器半边各写一遍
  `RESTART_PATH`）。清单校验与恢复命令放在**中立层** `src/plugin-list.ts`（不引 `node:`），
  两侧共用同一份实现、不是副本。
- 自检 **11 项**（新增：临时 profile 上读规格/启用态/版本、清单路由真跑 200/405/403、
  profile 定位四条路径）；断言直接打在宿主产物导出的纯函数上（`scripts/selfcheck.mjs` import `lib/index.js`）。

### `@oblivion/panel` v0.0.8 —— 顶部统计不再「冻结在重启那一刻」

- **症状**：顶部四个 KPI（捕获率 / 判定轮数 / 已评估 / 已沉淀）与「主要拦截原因」来自 core 的
  `status.json`，而它**只在 core 装载那一刻写一次**（`writeBootSnapshot`）⇒ 实测同一屏上顶部写
  「已沉淀 2」、下面「最近沉淀 (4)」，顶部写「判定轮数 2」、下面留痕 5 行。
- **改法**（不动 core，按所有者裁定）：面板自己读 `<dataRoot>/decisions.jsonl` **现算** —— 新增
  `summarizeDecisions(rows, extra)` 逐行**镜像** core `src/stats/summary.ts:40` 的 `summarize()` 口径
  （`no-qa` 不计入分母、`captured` = `pass`、`score` 只收数字、`captureRate` 三位小数取整、`percentile`
  同公式），并做与 `stats/trace.ts` 的 `read()` **相同**的保留期（`statsRetentionDays = 90`）与条数上限
  （`statsMaxEntries = 5000`）过滤；**只读，绝不重写 core 的文件**，裁掉多少条如实报 `dropped`。
- **「主要拦截原因」名不副实**：`topReason()` 取 `byReason` 计数最大者，通过时 `captured` 计数最大
  ⇒ 把「通过」显示成「主要拦截原因」。改为 `topBlocker()`：**排除 `captured`**，一条拦截都没有就显示
  「全部通过，无拦截」。
- 调参建议仍显示 core 装载时算的那份，并在标题里注明「样本不足 20 轮时 core 刻意不开口」。
- 自检 12 项（新增「留痕现算统计与 core 同口径」），`node --test` 14/14。

### `@oblivion/core` v0.1.20 —— 写盘一律原子、版本号只留一处真源

- **原子写成为默认**：`src/util/fs.ts` 新增 `writeFile`（与 `node:fs/promises.writeFile` **同名同签名**，
  内部走 `writeTextAtomic`：写临时文件 → 同目录 rename）。此前只有 `status.json` 接了原子写，
  其余 8 处仍是裸 `writeFile`（feedback / profile / graph / store / 笔记 / 索引页 / 整理件 / 冲突页、
  `decisions.jsonl` 的惰性裁剪、`mount-diag.json`）—— 它们全是「另一个进程随时会读」的文件。
  现在这些文件一律从 `'../util/fs.js'` 取 `writeFile`（8 个文件各改一行 import，**调用点一行没动**）。
  追加（`appendFile`，留痕每条一行的小写入）**刻意不原子**，理由写在 `stats/trace.ts` 的 `record` 注释里。
- **诊断不再整体丢失**：`mount-diag.json` 的 `routing` 一直是 `null` —— 整个 `describeScopeRouting()` 被
  外层 `safeRead` 包住时，里面**任何一处**抛错都会让整块取证变成 `null`。现在每处可疑读取各自
  `attempt()`（Cordis 的 `Fiber`/`Context` 是 Proxy：读未声明属性、`Object.getPrototypeOf`、
  取 `fiber.parent` 都可能抛错），**看到多少算多少**。
- **版本号第二来源清除**：`oblivion-core/lib/VERSION` 与 `oblivion-panel/lib/VERSION` 被 git 跟踪、
  由构建脚本写出 ⇒ 与 `VERSION` / `package.json` 组成三个来源。两个文件删除、两个构建脚本的写入删掉，
  `tools/check-workspace.ps1` 新增 `Assert-NoLibVersion`：**产物里再出现 `oblivion-*/lib/VERSION` 就直接失败**。

### `@oblivion/panel` v0.0.7 + `@oblivion/core` v0.1.19：左栏入口点不动、链路真正连通、笔记可点开

### `@oblivion/panel` v0.0.7 —— 笔记可点开、版本号不再漂、判定行说人话

- **知识库笔记「点了在侧边栏打开」不生效**：`props.onOpenFile` 是 `TabComponentProps` 的**可选**字段
  （`dsh-better-sidebar@0.24.1` 的 `lib/types/client/service.d.ts:136`），side bar 不一定递，而组件是
  裸透传 `(props) => createElement(OblivionPanel, props)`。改为在包装层**自己注入**，并优先走服务级 API
  `openFile(scope, path)`（`service.d.ts:586`，能力位 `'openFile'`；作用域取 `props.scope`，
  缺席时问 `getSnapshot().sessionId`），宿主 prop 只当退路。新增 `src/client/open-note.ts`
  （纯函数，五条路径均入自检）与诊断段 `where:'open-note'`。
- **「最近沉淀」的条目也能点**：条目本身不带路径，用 `notePathForItem()` 按 `topic` / `title` 去比
  `01_问答沉淀/<name>.md`；**匹配不到就不做链接**（绝不凭空造路径）。
- **面板标题栏一直显示 `v0.0.1`**：`src/index.ts` 曾写死 `export const VERSION = '0.0.1'`，而 bump 脚本
  只改 `VERSION` / `lib/VERSION` / `package.json` ⇒ **版本号有了第二个来源就一定会漂**。现在运行时读包根
  `VERSION`（`readVersion()` 依次试 `../VERSION` → `./VERSION` → `../../VERSION`），构建脚本里那个
  `__OBLIVION_PANEL_VERSION__` define 已删除；自检加了「`VERSION` === 包根 VERSION 文件」回归。
- **判定行说人话**：`reasonLabel()` 映射 core 真实 reason（`captured` → 通过：已沉淀 等 12 条，
  `exception:` / `本轮没有` 前缀单列，**未知键原样露出**，不在面板里编解释）；`scoreText()` 按三位小数
  取整，不再露出 `0.7000000000000001`。

### `@oblivion/panel` v0.0.6 —— 左下角 Oblivion 图标「点了没反应」

- **真凶**：`registerPanelTab` 里 `ctx.inject(['betterSidebar'], cb)` 的回调**可能异步触发**，
  而回调写的是 `result = attach(...)`（**换引用**）⇒ 调用方手里那个对象永远是 `{status:'no-service'}`，
  左栏入口拿到的 `service === undefined`，点击走 `no-service` 分支、只留一条日志。
- **改法**：`Object.assign(result, attach(...))` 写回**同一个对象**；左栏入口改为**点击那一刻**才读 `result.service`。
- **新增 `unknown-type` 判定**：better-sidebar 对未注册的 type 是**静默 no-op**（不抛错、不返回状态），
  故先 `getTab(type)` 探测，把「点了没反应」翻译成一个可上报的结论。
- **诊断自报**（`POST /oblivion-panel/diag` → `<dataRoot>/panel-client-diag.json`）新增
  `panelTab` / `leftbar` / `leftbar-click` 三段读数 —— 下一次点击即可判定卡在哪一环，不必开 DevTools。

### `@oblivion/core` v0.1.12 → v0.1.19

- **v0.1.12**：修「未声明服务裸读即抛错」导致的**装载崩溃**（`cannot get property "agents" without inject`）；
  诊断全部走 `safeRead`，**诊断不得拖垮装载**。
- **v0.1.13**：`pickAgent()` 载荷容错（支持 `{agent}` / agent 本体 / 嵌套）+ 无定时器的 `reconcileAgents()` 兜底。
- **v0.1.14**：① 双链**反向回填**（`notePathFor` 定位旧笔记，找不到就跳过，绝不新建）；
  ② 整理件**建边限流**（`DIGEST_EDGE_TEXT_BUDGET = 1200` —— 一次整理曾抽出 ~24 个实体、`C(24,2)=276` 条边成团）。
- **v0.1.15**：③ 检索命中注入下一轮提示词（`src/prompt-inject.ts`，TTL 15 分钟、最多 3 条、读取不消费）。
- **v0.1.16**：留痕移到 `context.agent === undefined` 守卫**之前**（否则连「回调没被调用」都看不到）。
- **v0.1.17**：加**工具执行入口**（第二张网）：包住 `tools.register` 的 `execute`，从中捕获 agent。
- **v0.1.18**：`inject` 声明 `agents`；拿到 agent 后在**它自己的 ctx** 上注册段落与工具（官方
  `file-reference-local` 的写法）。
- **v0.1.19（决定性）**：DSH 的**事件按作用域过滤**。`packages/core/scope/src/index.ts:170-185` 的
  `scopeTarget` 只放行「作用域标签落在派发键祖先链上」的监听者；本插件挂在 profile 插入行之下、
  **不在任何 agent 链上** ⇒ `agent/created`、`session/event` 全收不到，段落/工具也进不了 agent 的分层视图
  （一个原因解释全部症状）。改为**在根上下文注册**（`usableHost(ctx.root)` 守卫 + `host.agents.list()`
  + `host.on('agent/created')`）后实测：`injectAgentCount=6 mountedAgents=6 rootSeen=274 agentSeen=274`，
  并产出**第一次真实捕获**（`01_问答沉淀/Read.md` + `decisions.jsonl` 一行 `reason:"captured", score:0.8`）。

### 已知的非插件问题（排查记录，避免下次误判）

- **新会话上方没有「标准模式」等选项**：DSH 的 Agent 预设切换 UI 由设置项
  **「显示代码工作视图」（developerTools）** 控制 —— `ui-agent-preset/src/client/AgentPresetSeat.tsx:134`
  `if (!main || !developerTools || !ready) return null`。本机 profile 该值为 `false`
  （`cordis.patch.yml` 的 `ui-settings: { enabled: false }`），与 Oblivion 插件无关。
  **2026-10-06 已打开**：第 22 行 `ui-settings: { enabled: false }` → `true`，另把第 13 行
  `ui-settings-account: { developerTools: false }` → `true` 一并同步；备份
  `cordis.patch.yml.bak-before-devtools-20261006-130319`，改后用 `node -e` + `yaml@2` 验过仍是 4 条目数组。
  **补丁在 App 重启后才生效**（宿主启动时读补丁层）。判据：`DEVELOPER_TOOLS_NAMESPACE = 'ui-settings'`
  （`packages/client/ui-settings/src/developer-tools-settings.ts:5`）+
  `DeveloperToolsSettingsFields = { enabled: z.boolean().default(true) }`（`:14-16`）⇒ 那一行的
  `config.enabled` **就是** developerTools 偏好本身。

## [未发布] — `@oblivion/vimc` v0.2.10：交付层从 bundle 层**改回热挂**

**所有者 2026-10-06 裁定**：vimc 的迭代频率高于「换机器重装一次」的成本，放弃 bundle 层，
改回「普通依赖 + profile 用户层插入行」。

### 改了什么

- `oblivion-vimc/package.json`：**删掉 `dsh.bundle`** —— 声明它 = 安装器把本包写进 `dsh.profile.bundles`
  = 启动时组合、改一次要重启。
- `oblivion-vimc/cordis.patch.yml`：头注释从「为什么**必须**走 bundle 层」改写为「这是**热挂**插入行」。
  该文件仍是**插入行的正本**，同时是插件市场热挂按钮的读取源 ——
  `dshmarket/lib/hot.js:522-525` 在未声明 `dsh.bundle.patch` 时**回退到包根的这份文件**，所以必须保留它；
  配合本机 `hot.js:161` 补丁，市场面板才热挂得动 `@` 作用域插件。
- 本机 profile：从 `dsh.profile.bundles` 摘掉 `@oblivion/vimc`，用户层 `cordis.patch.yml` 追加 insert 行。
  改前备份 `*.bak-before-vimc-hot`；两份文件都用**解析器**复验（`JSON.parse` + `yaml.parse` 通过）。
- **新增契约断言种类 `patchInsert`**：包在 `dsh.compat.requires.patchInsert` 里写出自己的 id，
  `tools/verify-dsh-compat.ps1` 就去 profile 用户层补丁里找那一行，**找不到即 FAIL**；
  同一条断言还拦住「热挂包又出现在 `dsh.profile.bundles`」＝双重挂载。
  这正面回答了当初迁去 bundle 层的理由（换机器静默失效），把「静默」变成 check 阶段就红。

### 验证

| 项 | 结果 |
| --- | --- |
| 负向（改 profile **之前**） | `@oblivion/vimc` **FAIL 2/7**、exit 1 —— 新断言确实会红（`patchInsert` 缺行 ＋ 仍在 bundles） |
| 改 profile **之后** | ✅ PASS **6/6**、exit 0（证据 `patchInsert → cordis.patch.yml:24`） |
| `verify:dsh` 全量 | brand 10/10 · bundle 7/7 · core 8/8 · panel 6/6 · vimc **6/6** |
| 版本 | `0.2.9 → 0.2.10`（只加第三位）；`check:version` 一致；构建产物 `lib/client.js` 123189 B |

## [未发布] — 本机修复：`dshmarket` 热挂 `@` 作用域插件必失败（`hot.js:161` 单行补丁 + 重打工具）

承下一节的「附带发现」，**所有者 2026-10-06 裁定采用本机补丁**：上游修复不可控，而「每次升级重打一次」
的成本由脚本兜住。

### 补丁

`dshmarket/lib/hot.js:161` 一行：

```js
- const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);
+ const id = /^\s+-\s+id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
```

改后与同一解析器里 `:168` 的 `name` 解析、`:659` 的 profile 行解析**写法一致**。
备份 `lib/hot.js.orig-backup`（SHA256 `6FDAAB8F…`，改动前逐字节相同）；与备份 `Compare-Object`
**只有这 1 行**不同。**补丁在 App 重启后生效**（市场模块随宿主进程加载）。

### 证据（跑市场自己的模块，不靠推断）

探针必须落在包内（`hot.js` 的 import 是相对路径），故把备份整包复制进 `lib/` 再动态 import 对比，
YAML 用 `yaml@2.9.1`：

| | `parseSimplePatch` 得到的 id | 写回串（`:568`） | `YAML.parse` |
| --- | --- | --- | --- |
| 修复前 | `"'@oblivion/panel'"` | `- id: 'mkt-'@oblivion/panel''` | 抛 `Unexpected scalar at node end at line 1, column 13` |
| 修复后 | `"@oblivion/panel"` | `- id: 'mkt-@oblivion/panel'` | `[{id:'mkt-@oblivion/panel',name:'@oblivion/panel'}]` |

未加引号的 `id: plain` 修复前后都正常（无回归）。

### 重打工具 `tools/patch-dshmarket-hot-id.ps1`

市场升级会重装 `node_modules`，补丁随之丢失，所以这次留下一件工具而不是一段手工步骤：

- **幂等**：已打过 → `already patched` + exit 0；
- 改动前按**内容哈希**复用或新建备份（`hot.js.orig-backup-<版本>`），不会一次升级堆一个；
- **上游改写了那一行就拒绝执行并 exit 1**，同时打印当前哈希供人工重推 —— 不盲目打补丁；
- 打完让 node 动态 import 真跑一次 `parseSimplePatch` 断言（**文本改了 ≠ 行为对了**）；
- `-DryRun` 只看不做；`-Path` / `-Profile web` 可指向别的 profile；
- 只动**本机 profile 里的第三方包**，不碰 DeepSeek Harness 安装本身；纯 ASCII（丢 BOM 也不会坏）。

五种情形（DryRun / 实打 / 幂等 / 上游改写 / 已补丁）均以 `%TEMP%` 下的整包副本实测通过。

### 一处自纠：`catch` 把失败藏起来的又一例

工具初版用 `Get-Content -Raw | ConvertFrom-Json` 读 `package.json` 取版本号。PowerShell 5.1 下
`Get-Content` 按 ANSI 解码无 BOM 文件，而该 `package.json` 含中文描述 → `ConvertFrom-Json` 抛
`Invalid object passed in, ':' or '}' expected. (188)` → 被 `catch` 吞掉 → 版本号**静默退化成 `unknown`**
（备份文件名也跟着变成 `hot.js.orig-backup-unknown`）。改用 `[IO.File]::ReadAllText(...)`（显式 UTF-8）后
读回 `1.66.8`。**教训与 `lint-ps1-bom.ps1` 同源：一个把失败吞掉的 `catch`，比没有这条逻辑更危险。**

## [未发布] — `@oblivion/brand` v0.1.1：插件市场 registry 覆盖为 npmmirror（另报一处市场自身缺陷）

按所有者指令落地：「修复插件市场，使用 `registry.npmmirror.com`。或者在我的 `oblivion/brand` 里面对此进行覆盖」。

### 先查清楚：市场没坏，是它按「下载区域」选了**腾讯云**镜像

`profiles/desktop/.dsh-market/state.json` 里 `region: "china"` / `regionAuto: true`（2026-10-04 自动探测决定）。
对应 `dshmarket/lib/regions.js:35` 的 `const NPM_CHINA = 'https://mirrors.cloud.tencent.com/npm';`
—— **区域表里根本没有 npmmirror 这个选项**，想用它只能覆盖。

市场自己留了逃生口，且优先级高于区域表（`regions.js:176`）：

```js
const npmMirror = override(env, 'DSHM_NPM_MIRROR');
// routesFor() 里：npmRegistry = npmMirror ?? base.npmRegistry
```

`regions.js` 的文件头注释把这条口子写成了**设计意图**：
「a user whose routes have died needs a way out that is not wait for the next release」。

### 实测（直接跑市场自己的模块，不靠推断）

```
routesFor('china', {})                                  → https://mirrors.cloud.tencent.com/npm
routesFor('china', { DSHM_NPM_MIRROR: '…npmmirror…' })  → https://registry.npmmirror.com
```

一个变量同时管住三处，因为它们都问 `routesFor()`：

| 处 | 效果 |
| --- | --- |
| 市场自己的浏览 / 搜索 / 更新检查 | 走 npmmirror |
| **安装** | `dsh-cli.js:140` 派生 pnpm 时写入 `npm_config_registry` → 走 npmmirror |
| 目录源 `dsh-plugin-catalog` | `base.catalog` 按解析结果重建 → 也走 npmmirror |

GitHub 那三条路由**不受影响**（本覆盖不碰 `DSHM_GITHUB_PROXY`），仍是区域表的 `gh-proxy.com`。

### 实现：覆盖写在 brand 里，但用的是市场文档化的那个变量

`oblivion-brand/src/index.ts`：

- `export const MARKET_REGISTRY_ENV = 'DSHM_NPM_MIRROR'`（:46）
- `export const MARKET_REGISTRY_MIRROR = 'https://registry.npmmirror.com'`（:49）
- `installMarketRegistryOverride(ctx)`（:487），在 `apply()` 的**第一步**调用（:508）—— 越早越好，赶在市场第一次发请求前
- **非破坏性**：已经有人设过（非空白）就**一个字都不改**，只记一行日志 —— 运营者的环境变量是「对自己网络的声明」，优先级高于本插件；想换回去，把它设成空串或别的镜像即可
- **不改任何安装包**：走环境变量 → 市场升级后本覆盖依然有效

### 自证

`oblivion-brand/scripts/selfcheck.mjs`（新增；纯 node，不依赖 DSHX）：**8 项，失败 0** ——
导出形状 / 重启路由已挂载 / 未设时填 npmmirror / 运营者优先 / 空白视同未设 / 幂等 /
**交叉验证：拿刚 `apply()` 过的 `process.env` 去喂市场自己的 `routesFor()`，断言 npmRegistry 真的换成了 npmmirror、且 `githubProxy` 没被动**。
`check:version` ✅ `0.1.1`。

### 附带发现：市场自身有一处缺陷（**与 registry 无关，换镜像治不了**）

`dshmarket/lib/hot.js` 的**同一个解析器里两行不一致**：

```js
// :161  解析 id：\S+ 会把引号一起吃进去
const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);
// :168  解析 name：这里正确地剥掉了可选引号
const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
// :170
rows.push({ id: pending, name: name[1] });
// :568  写回热点文件
.map(row => `- id: 'mkt-${row.id}'\n  name: '${resolveProfileEntry(profileDir, row.name)}'\n`)
```

读取路径：`hot.js:525` 读**被热挂的那个包自己的** `cordis.patch.yml`（或它声明的 `dsh.bundle.patch`），
`:534` 交给 `parseSimplePatch`。于是**带引号的 `@` 作用域 id**（`- id: '@oblivion/panel'`，YAML 里 `@` 开头必须加引号）
被解析成 `'@oblivion/panel'`（含引号），写回时拼出 `- id: 'mkt-'@oblivion/panel''` → **YAML 坏掉** →
`bad indentation of a mapping entry` → 热挂失败、退化成重启。市场日志 `log.ndjson` 里**同一形态出现 9 次**
（01:55 / 02:14 / 02:35×2 / 02:36×2 / 03:34 / 03:38 / 03:42）。

同一文件里另一个读 profile 行的解析器（`:659`）用的却是**正确**写法
`/^\s*-?\s*id:\s*['"]?([A-Za-z0-9._/@-]+)/` —— 两个解析器不一致，这正是缺陷的形状。

- **影响面**：任何 `@` 作用域插件（我们的 `@oblivion/*` 全是）经市场热挂都会踩到。
- **这条无法靠调整我们自己的包绕过**：`hot.js:522-525` 读的是**被热挂那个包自己的** `cordis.patch.yml`
  （或它 `dsh.bundle.patch` 声明的文件），而 YAML 里 `@` 开头的标量**必须**加引号 —— 换交付层、
  把 insert 行搬去别处都没用。
- **本包没有去改市场的 `node_modules`**（改安装包 = 升级即丢，且越界）；出路两条曾列在 `HANDOFF.md` 坑 12：
  ① 上游把 `:161` 的 `\S+` 换成与 `:168` 一致的可选引号写法（一处字符类的改动）；
  ② 本机给 `hot.js:161` 打最小补丁并留 `.orig-backup`（代价：市场每次升级都要重打）。
  → **所有者 2026-10-06 裁定走 ②**：已落地并留下一件重打工具，见上一节
  （`[未发布] — 本机修复：dshmarket 热挂 @ 作用域插件必失败`）。① 仍是正解，值得上报。

---

## [未发布] — 新增 `@oblivion/bundle` 安装入口；`@oblivion/core` v0.1.11：盲区修正（status/impl + 00-Index + 50-Conflicts + 双链写回）

### 新增：`@oblivion/bundle`（不是插件，是安装入口）

- 形态与官方 `@deepseek-ai/dsh-base` 一致：**没有 `apply(ctx)`**，`lib/index.js` 就是 `export {};`，只有 `cordis.patch.yml`
- 一条命令装齐：`dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-bundle'`（依赖声明四个包）
- **只插 core / panel 两行**：brand 与 vimc 自带 `dsh.bundle.patch`、由安装器写进 `dsh.profile.bundles`；
  bundle 再插一次同名行 = 挂载两次 = 整棵插件树启动失败（重复前缀路由）→ 对它们只做依赖声明
- 安装后**必须删掉用户层那两行**（否则就是上面那个重复挂载）——本次已迁走，用户层补丁现在 0 条 insert
- `content-creator` 已在 patch 里留好注释位；契约断言用 `npmPackages`（四个成员包都在 profile 里）

### `@oblivion/core` v0.1.11：盲区修正

起因是一次真实口径漂移：同一主题在文档里有 26 / 28 / 3 三个版本，读的人无法判断哪个权威。
解法不是「记得更新」，而是**让每个条目自己带状态**：

| 机制 | 实现 |
| --- | --- |
| **文档状态** | 笔记与整理件一律带 **YAML frontmatter**：`status`、`impl`、`topic`、`ref`、`tags`、`superseded_by` |
| **权威层** | 新增 `00-Index/索引.md`：**只放指针**（主题 / 条目 id / 标题 / 状态 / 落地 / 更新时间），每次写库自动重建 |
| **落地状态** | `ItemStatus` / `ImplStatus` 落地（`types.ts`），自动捕获与整理都写入 `impl` |
| **自动降级** | 同一 `topic` 出现新版本 → 旧条目转 `superseded` 并写 `supersededBy`（**不删除**；配置 `autoSupersede`） |
| **冲突页** | 冲突不再只写 `dataRoot/conflicts/*.json`：同时在知识库写 **`50-Conflicts/<主题>.md`**，新旧并列、**不合并**、幂等 |
| **双链写回** | 新增 `graph/backlink.ts` + `appendRelatedLinks()`：token Jaccard 找相关条目（只连 `active`、不连自己、上限 5），追加「## 关联知识（自动）」段 |

### 输出模板 T1 / T2 / T3 写进常驻提示词

默认 **T1**（结论 / 要点 / 盲区 / 下一步）；设计决策类 **T2**（方案对比表 + 风险 + 落地状态）；
文档整理类 **T3**（status / 权威版本 / 冲突 / 归档建议）。写进提示词而不是文档 —— 它必须每轮生效。

### 验证

`typecheck` ✅ / `test` **14/14** ✅ / `selfcheck` **29/29** ✅ / `verify:dsh` **5/5 全 PASS**（brand 10/10 · bundle 7/7 · core 8/8 · panel 5/5 · vimc 6/6）

> 事故留痕：中途用 PowerShell 脚本改本文件时写坏过两次（`-like` 把 `[未发布]` 当字符类、`0..-1` 反向切片复制全文），
> 均已 `git checkout` 完整恢复，最终改用内容锚点编辑。**仓库文档一律不要用切片/正则脚本改。**

---

## [未发布] — `@oblivion/core` v0.1.10：**会话整理（`oblivion_digest`）** + 挂载自诊断；附一次 profile 补丁事故

### 新增：整理当前对话

- 新工具 **`oblivion_digest`**：在对话里说「整理一下当前对话」，模型产出结构
  （**章节 / 决策 / 待办 / 未决问题 / `[[双链]]`**），插件负责落成
  **① 一篇人读的整理笔记** `<mdRoot>/04_会话整理/<日期>-<标题>.md`
  **② 一条可检索的知识条目**（进 JSON 库、进共现图、能被 `oblivion_query` 查到），并回填条目 id 到笔记标记
- **分工的取舍**：摘要由**模型**做（它本来就把整场对话握在上下文里，是天然摘要器），
  插件不调 LLM、不重放历史 —— 否则要新开授权面、处理重试，收益全是重复劳动
- **绕过四层筛选**：用户显式要求的沉淀不该被 L3「答案太短」/L4 价值分拦下，走新增的
  `knowledge.saveStructured()` 直写（仍进索引，因此照常可检索）
- 新增分类目录 **`04_会话整理/`**（`mdClassify.session_digest`）—— 装载即建目录会自动带上它
- 同一天同标题重复整理：**不覆盖**，追加一节（保历史，不静默丢）

### 新增：挂载自诊断（`mount-diag.json`）

`console` 日志在本机读不到，而「事件收不到」有四种可能（没有 inject / agents 服务不存在 / 列表为空 /
订阅上了但派发被过滤），空探针无法区分。现在挂载那一刻与三个关键节点落盘：
`hasOn`·`hasInject`·`hasGet`、`agentsDirect`·`agentsDirectCount`、`injectFired`·`injectAgentCount`、
`rootSeen`·`agentSeen`·`mountedAgents`。

### ⚠️ 事故与教训：别用正则改 profile 补丁

我用 `-replace "(?ms)…\s*"` 摘除补丁行时把换行一起吃掉，补丁变成 `disabled: false- insert:`，
**App 直接启动失败**（`parsePatchList` 抛错，弹出崩溃窗口）。已按备份修复并用 YAML 解析器验证
（6 条目、两行 insert 都在）。教训写进 `HANDOFF.md` 坑清单 8：**先备份 → 改完必须 YAML 解析验证 → 再重启**。

### 验证

`typecheck` ✅ / `test` **14/14** ✅ / `selfcheck` **26/26** ✅（新增：会话整理落盘 + 条目 id 回填 + 建边）

---

## [未发布] — `@oblivion/core` v0.1.7 / v0.1.8：**结案「问答没被捕获」—— `session/event` 是作用域过滤派发**

### 根因（逐字取证）

`packages/core/session/src/index.ts:70`：

> Scope-filtered dispatch（`@deepseek-ai/dsh-scope`）：**agent-scoped listeners receive only events
> from sessions entered through that agent's context.**

`session/event`（含 `session/created`、`agent/*`）**只派发给在该 agent 作用域内的监听者**。
我们把订阅挂在 **profile 根上下文**上 —— 事件名、写法、时机全对，但**根上下文不在 agent 作用域里**，
所以**一个事件都收不到**。这解释了全部症状：插件装载正常、`status.json` 每次 apply 都写、只读路由 200，
而 `stats.turns` 恒为 0、`decisions.jsonl` 从未生成。

排除的旁支：① 没装载；② 订阅写法错（官方 14 处同写法）；③ 写盘失败；④ 会话在别的进程
（进程取证：Host PID 27188 同时监听 19387 / 写 `host-mount.json` / 跑会话，只有一个 Host）。

### 修法

- **v0.1.7**：先听 `agent/created`，再在 **`agent.ctx`** 里订阅 `session/event`
  （官方 `context/file-reference-local/src/index.ts:92` 的写法；`Agent.ctx` 见 `core/agent/src/runtime-types.ts:174`）
- **v0.1.8**：**装载时也给「已在运行」的 agent 补挂一次**（`ctx.inject(['agents'], ctx => ctx.agents.list().forEach(attach))`）
  —— 热重挂时当前会话的 agent 早已创建，只听 `agent/created` 会漏掉它
- 探针保留并增强：每条记录带 `origin`（`root` / `agent`），一眼看出哪条订阅收到；链路稳定后关掉 `enableEventProbe`

### 验证

`typecheck` ✅ / `test` 13/13 ✅ / `selfcheck` 25/25 ✅ / 热重挂实测：构建后 **4 秒** `status.json` 变为 `0.1.8`

---

## [未发布] — 新增 `@oblivion/panel` v0.0.1（认知面板）+ `@oblivion/core` v0.1.6（事件探针）

### 新增插件：`@oblivion/panel`（client 双半，热挂）

把 `@oblivion/core` 的观测数据做成一个 tab，嵌进第三方插件 `dsh-better-sidebar` 的那一列：
**捕获率 / 拦截原因 / 调参建议 / 最近沉淀 / 知识库笔记**。**不自己造文件树** —— 文件夹树、编辑器、
侧边对话都由 `dsh-better-sidebar` 提供，本插件只在它的座位上加「认知层观测」页。

- Node 半边：一条**只读**路由 `GET /oblivion-panel/status`（GET-only、`no-store`、读入有上限、
  **不含会话原文**）+ 自证据文件 `%TEMP%\oblivion-panel\host-mount.json`
- 浏览器半边：`ctx.betterSidebar.registerTab({ id: 'oblivion:panel', order: 70, single: true, … })`
- **降级**：`betterSidebar` 缺席 → 不注册、只记日志、不抛错（三种结局都有测试钉住）
- 闸门：`test` 13/13、`selfcheck` 8/8、`dshx check` 全绿、契约 **5/5**
- **真机已验**：装链接 + 补丁插入行后，路由**立刻** `HTTP 200`（**无需重启**），自证据文件已写

### `@oblivion/core` v0.1.6：一次性事件探针（定位「`turn/end` 到没到」）

现象：v0.1.5 自 08:53:05 装载后 `stats.turns` 一直为 0、`decisions.jsonl` 从未生成，
而这期间**至少两轮问答走完了 `turn/end`**。已排除「没装载」（`status.json` 每次 apply 都写、路由 200）、
「订阅姿势写错」（官方 14 处 Host 侧代码用的都是同一写法）、「写盘失败」。

新增 `enableEventProbe`（默认开，验证后关）：**在守卫之前**把每个 `session/event` 记一行到
`<dataRoot>/events-probe.jsonl`（只记 `type` / `seq` / `sessionIdOk` / `subjectKeys` / `dataKeys`，**不含正文**），
用判读表区分四种情况 —— 见 `HANDOFF.md` 坑清单 5.5。

### 顺带修正一条错误结论

「Host 侧改码必须重启 App」**不成立**（对 link 挂载的插件）：实测 `lib/index.js` 构建于 `09:10:19`，
`status.json` 在 `09:10:20` 被重写为 `version 0.1.6`（**1 秒**）。仍然正确的是：bundle 层改一次要重启；
浏览器半边要**硬刷新页面**。

### 其它

- `tools/verify-dsh-compat.ps1` 新增断言种类 **`npmPkg`**（第三方 npm 包在 profile 里是否存在 + 版本），
  用于 `@oblivion/panel` 对 `dsh-better-sidebar` 的依赖；台账补 panel 一行（5/5）

---

## [未发布] — `@oblivion/core` v0.1.5：观测面（判定留痕 + `oblivion_status` + 调参建议）

**动机**：认知层现在最缺的不是界面，而是**先跑够几天的真实数据** —— 阈值该不该调、陪伴频率吵不吵，
没有留痕就只能靠感觉。所以这一版补的是「感知」：

### 新增

- **判定留痕** `<dataRoot>/decisions.jsonl`：**每一轮都记一条**（一轮一行 JSON）——
  `action` / `pass` / `reason` / L4 分值 / 问题与答案字数 / 判定耗时；
  **包括被拦下的轮次**（AC-008 要求「不注入但留痕」）与 `no-qa`（工具轮 / 纯注入轮 / 无回答）。
  保留期 90 天 + 最多 5000 条，**读取时惰性裁剪**（无定时任务）
- **装载快照** `<dataRoot>/status.json`：每次装载刷新 —— 生效配置 + 现有统计 + 调参建议
- **新工具 `oblivion_status`**（第 6 个模型面工具）：一次返回
  ① **生效配置全清单**（31 个键 = 「需要修改的参数」）② 统计（捕获率、拦截原因分布、价值分 p50/p90、`no-qa` 占比）
  ③ **调参建议** `{key, current, suggested, why}` ④ 最近若干条判定
- **调参建议的边界**（避免拿三四轮数据瞎调）：可评估轮 <20 **不开口**；
  「完全重复」占比高时**明确告诉你不用调**；阈值贴着分布中位数（±0.05）才建议动

### 验证

- 自检 22 → **25**（新增：判定留痕完整性、`oblivion_status` 快照形状、调参建议边界）
- 单元测试 13/13（工具数 5 → 6 的断言同步）
- `build` ✅ v0.1.5（`lib/index.js` ~67 KB）/ `typecheck` ✅ / `check:version` `0.1.5` ✅

---

## [未发布] — `@oblivion/core` v0.1.4：知识库位置可自定义 + 装载即自动建分类目录

### 变更

- **`mdRoot` 可自由自定义**（任何绝对路径或 `~/` 写法），不再只有默认那一个知识库
- **装载即建目录**：`mdRoot` 一经配置，插件装载时就把知识库根与全部分类目录一次性创建出来 ——
  `01_问答沉淀\`、`00_导入文件\`、`02_Wiki页面\`、`03_创作产物\`、`99_其他\`（**不必等第一次落盘**）。
  幂等（`recursive: true`）、非阻塞（失败只记日志，不影响装载与问答链路）、只创建不删除
- **目录名消毒**：`mdClassify` 的值会去掉 `..` 片段、盘符与非法字符 → 配置里的目录名**不可能逃出 `mdRoot`**
- 新增 `ensureMdDirs()` / `mdDirNames()` / `safeDirName()`（经 `@oblivion/core/testkit` 导出，可测）

### 验证

- 单元测试 12 → **13**（新增：自定义 `mdRoot` 后 `01_问答沉淀` 等 5 个目录在 `apply()` 后即存在 + 消毒规则）
- 自检 19 → **22**（新增：装载即建目录、自定义知识库位置后落盘跟着走、分类目录消毒）
- `build` ✅ v0.1.4 / `typecheck` ✅ / `check:version` `0.1.4` ✅ / `verify:dsh` core 8/8 ✅

---

## [未发布] — `@oblivion/core` v0.1.3：知识库落盘位置与分类按所有者裁定落地 + 两份决策记录

### 决策（设计书 §33.6）

| ID | 决策 |
| --- | --- |
| **DEC-028** | `@oblivion/core` **走热挂**（用户层 `cordis.patch.yml` insert 行，落盘即装载、不重启），**不声明 `dsh.bundle`**。代价（换机器/重置 profile 静默失效，DSH-COMPAT R1）由所有者接受，缓解措施随包提交 |
| **DEC-029** | 知识库**根 = `C:/Library/那些渐渐被遗忘`**（既有知识库，不再单开 `oblivion_docs/`），**内部按 `01_问答沉淀/` 分类**（`00_导入文件/` `02_Wiki页面/` `03_创作产物/` `99_其他/` 兜底） |

### 变更

- `config.mdRoot` 默认 `~/OblivionKB` → **`C:/Library/那些渐渐被遗忘`**；新增 **`config.mdClassify`**（来源类型 → 子目录，§25.3）
- `qa-loop/md-writer` 落盘路径由硬编码 `10-Topics/` 改为 **按 `mdClassify` 分类**；未命中规则落 `99_其他/`
- **共用知识库防误伤**：目标文件若不含 `oblivion:` 标记（= 用户自有笔记）则改写 `<topic>-oblivion.md`，**绝不覆盖**同名笔记
- 新增两份决策记录与设计书同步：`.design/ARCHITECTURE.MD` §33.5（①② 标记已裁定）+ **§33.6 决策记录**；§12.12 / §25.3 标注 `oblivion_docs/` 已被取代
- **新增 `.design/core-认知内核.md`**：所有者提供的 `@oblivion/core` 最新设计书入库，文末附「现状对账」（已落地 / 10 条偏差 / 3 项未做）
- 同步更新：`oblivion-core/README.md`（路径、版本、19 项自检、verify:dsh 8/8）、`oblivion-core/cordis.patch.yml`（调参注释 + DEC-028 说明）、`HANDOFF.md`（验证命令）、`.design/DSH-COMPAT.md`（R1 与 core 行）

### 验收

`build` ✅（v0.1.3）/ `typecheck` ✅ / `test` 12/12 ✅ / `selfcheck` **19/19** ✅（新增：§25.3 分类落盘、共用知识库防误伤）/ `check:version` `0.1.3` ✅ / `verify:dsh` core **8/8** ✅。

---



### 修复：`turn/end` 捕获恒为空（插件首版的致命 bug）

**症状**：插件装好了、自检全绿，但 `~/.oblivion/data` 与 `~/OblivionKB/10-Topics` **永远是空的**，且不报错。

**根因**（实测 `@deepseek-ai/dsh-session` 产物）：
`session.eventsSnapshot` 是 **private** 字段，且只在标着 `deprecated`（"new calls are prohibited"）的
`snapshotEvents()` 里 `??=` 懒加载 → 插件直读它**恒为 `undefined`** → 每轮提取不到问答 → 静默不落盘。

**修法**：订阅公开的 `session/event`，**在事件流里自累积本轮事件**
（`turn/start` → `user/message`/`assistant/message` → `turn/end`）；`eventsSnapshot` 只作兜底并打一次告警。
同时按实测的 `source.kind` **只把真人提问当问题**（`agent.inject()` 注入的上下文不再被沉淀）。

> **教训（已写进 README 第五节）**：旧自检也用 `eventsSnapshot` 造数据 → 「自检 11/11 全绿」与
> 「真实知识库永远为空」同时成立。现在自检走真实事件流（`emitTurn()`），不再绕过真实链路。

### 补齐：设计书 4 个遗留差距

| # | 差距 | 设计书 | 0.1.2 |
| --- | --- | --- | --- |
| 1 | L3 只判长度 | §25.1 | 四条规则全实现（<5 字 / 仅无意义词 / 开头 40 字内「不知道」/ 纯寒暄），每条带 reason |
| 2 | F3 深度触发降级 | §25.4 | 连续同维度计数：≥3 次 → **≥3 个候选视角**；闸门单会话 ≤5 次 |
| 3 | F5 无保留期 | §25.7 | **90 天保留期 + 读取时惰性裁剪**（不引入定时任务），裁剪结果落盘，`feedback.stats()` 可查 |
| 4 | F2 闸门与设计不同 | §25.4 | 三通道：主动（会话 ≤3 + 问题 ≥10 字 + 有来源）/ 深度 / 陪伴期；共用置信度 ≥0.3 与「被拒 ≥2 次不再提」 |

### 修正：设计书里不存在的钩子

- `.design/ARCHITECTURE.MD` 4 处、`.memory/TODO.md` 1 处：`session:complete` → **`turn/end`**
  （实测 `session:complete` / `session/complete` 在官方 287 个包里 **0 命中**；`turn` 类只有 `turn/start` / `turn/end`）
- 保留「⚠️ 此处原写 `session:complete`，实测不存在」的注记，防止后来者照旧写法实现

### 其它

- 补 `oblivion-core/scripts/bump-version.mjs` + `version:bump` / `check:version` 脚本项（此前该插件缺递增器）
- 修一条过期测试：`dsh.compat` 是**兼容声明**（宿主范围 + 依赖服务/事件），不是 `dsh.bundle`；断言收紧到 bundle 本身
- 自检 11 → **17 项**（新增：真实事件流端到端、注入上下文过滤、兜底路径、L3 四规则、F3 深度候选、F2/F3 闸门、F5 保留期）

**验收**：`build` ✅ / `typecheck` ✅ / `test` **12/12** ✅ / `selfcheck` **17/17** ✅ / `check:version` `0.1.2` ✅ / `dshx check` ✅。
真实 Host 装载待**重启 App** 后验证（Host 侧改码不会靠禁用再启用重新导入）。

---

## [未发布] — 仓库工程化：依赖改用 pnpm workspace（与 DSH Profile 同一模型）

### 变更：npm 单包 → pnpm workspace

所有者要求「本 oblivion 也使用同样的 pnpm，不然反复出现不同文件夹的 node_modules」。落地：

| 文件 | 作用 |
| --- | --- |
| `package.json`（根，private） | `packageManager: pnpm@11.7.0`；`-r` 聚合脚本（`build`/`typecheck`/`test`/`check:version`/`check`） |
| `pnpm-workspace.yaml` | `packages: ['oblivion-*']` + `allowBuilds: { esbuild: true }`（依赖安装脚本**显式审批**） |
| `.npmrc` | `auto-install-peers=false`（框架包只放 peer）、`strict-peer-dependencies=false`、`hoist=false` |
| `pnpm-lock.yaml` | 工作区唯一 lockfile（入库）；删除两个 `package-lock.json` |

**实测收益（同机迁移前后）**

| 指标 | npm | pnpm workspace |
| --- | --- | --- |
| `oblivion-brand/node_modules` | 38.0 MB / 313 文件 | **0.02 MB / 12 项（5 个符号链接）** |
| `oblivion-vimc/node_modules` | 54.7 MB / 3626 文件 | **0.02 MB / 12 项（9 个符号链接）** |
| 实体依赖 | 两处各一份（~92.7 MB） | 根 `node_modules/.pnpm` 一份（~55 MB，两插件共享） |

### 与 DSH 一致的铁律（写进 `.action/AGENTS.MD` 的《包管理器规范》）

1. **框架包 `@deepseek-ai/*` 只放 `peerDependencies`**，绝不放 `dependencies`（否则运行时两个模块实例、symbol 分裂）。
2. 依赖的 install/postinstall **默认不执行**，只在 `allowBuilds` 里逐包放行（当前仅 esbuild）。
3. `hoist=false`：未声明的依赖一律解析失败。
4. 依赖安装/脚本执行走 **DSH 分发的受控 pnpm 11.7.0**（不要求系统装 Node/pnpm）；
   **禁止**在插件目录里 `npm install`。

### 新增：工作区统一入口 `tools/check-workspace.ps1`

- 本机 `pnpm` **不在 PATH**（DSH 只把 `pnpm.mjs` 作为受控运行时分发），所以根 `package.json` 里
  **不能**写嵌套的 `pnpm run xxx`（实测 `'pnpm' is not recognized`）
- 入口脚本在**运行时**解析运行时位置（可用 `DSH_RUNTIME_ROOT` / `DSH_NODE` / `DSH_PNPM` 覆盖），
  按 `install → typecheck → test → build → check:version` 顺序执行并在任一环失败时中止
- 两个坑记下来：① 脚本必须兼容 **Windows PowerShell 5.1**（`$x = if (...) {...}` 是 pwsh 7 语法，5.1 直接解析失败）；
  ② `.ps1` **必须带 UTF-8 BOM**，否则 5.1 按 ANSI 读、中文变乱码导致 `UnexpectedToken`
- 根脚本 `check`/`build`/`test`/`typecheck`/`check:version` 全部指向它；实测 `pnpm run build|test|check:version`
  与 `powershell -File tools/check-workspace.ps1` 全部 **exit 0**

### 验收

- `pnpm install` 退出 0（esbuild 的 postinstall 经审批执行，`esbuild.transform` 实测可用）
- `pnpm run check`：`typecheck` ✅（brand + vimc）、`test` ✅（vimc **42/42**）、`build` ✅（两插件产物正常）
- `pnpm -r run check:version`：`oblivion-brand 0.1.0` / `oblivion-vimc 0.2.8` 一致
- `dshx check oblivion-vimc` 仍全绿（源码契约不受包管理器影响）

### 顺带更正

- `CONTRIBUTING.md`《第三方复用登记》第 1 行：vimium-c 的许可证由误记的「MIT」更正为 **Apache-2.0**
  （`LICENSE.txt`：Copyright 2023-present Gong Dahan），并补上本地源码版本（2.12.3）与被参考的具体文件；
  其余行「package-lock 锁定」改为「pnpm-lock 锁定」。
- `README.md` / `WORKSPACE.md` / `CONTRIBUTING.md` / `.action/AGENTS.MD` / `.action/GUIDE.MD` / 两个插件 README：
  命令与结构说明统一改成 pnpm workspace。

---

## [未发布] — `@oblivion/vimc` v0.2.8：落点标记跟随滚动 + 内联引用独立一档 + 上游署名修正

### 修复：落点标记错位（所有者实测「搜『高亮』，黄框出现在『结果』旁边」）

- 根因：标记用**视口坐标**，而 `present()` 是**先画后滚**，滚动（尤其 `smooth` 平滑滚动动画）之后坐标就过期了
- 修法：改成**先滚再画**，并在标记存活期间监听 `scroll`/`resize`（捕获 + rAF 节流）**持续重摆**；
  标记寿命 900ms → 1200ms（覆盖平滑滚动动画）；自检新增 `find.repositions`（重摆次数）
- 参考上游 `dom_ui.ts` 的 `flash_()`：单个活动标记 + 寿命 + 淡出；差别是它把矩形换算成页面坐标
  （`.AbsF`），而 DSH 正文是嵌套滚动容器、不能假定宿主定位上下文，所以用「跟随重摆」替代

### 变更：内联引用单独提一档（排在消息操作按钮之前）

- 三档改为：**① 内联引用 → ② 正文其它（含消息操作按钮）→ ③ 外部按钮**
- 引用的判据（依据所有者截图：悬停内联引用会显示它指向的文件路径）：真链接，或 `title`/`aria-label`
  含 `/`、以 `@` 开头、或以**已知文件扩展名**结尾
- 判据刻意收紧：`aria-label` 带版本号（`v4.1`）的按钮**不会**被误判（曾用「点 + 短串」的宽泛规则，实测误判）
- 自检新增 `hints.referenceSignals`（`link`/`path`/`at`/`ext`，只报信号名、不报属性值）；
  **真机实测**：某一时刻 `references 1 / content 25 / outer 20`、信号 `path` —— 引用确实被提到最前

### 修正：上游许可证写错了

- README「参考与许可」原写 vimium-c 是 MIT —— **实际是 Apache-2.0**（`LICENSE.txt`：Copyright 2023-present Gong Dahan）
- 补上「读了哪个文件、复用了什么理念、哪里故意不一样」的对照表（提示串短在前、`flash_` 落点、
  查找的大小写/`postOnEsc`/反向查找），并注明：本插件是独立实现、**未复制上游代码**；
  若将来直接拷贝上游代码，必须保留 Apache-2.0 声明

验收：`npm test` **42/42**（新增：三条优先级/判据用例 + 滚动跟随重摆用例）；
`dshx check` 全绿；版本 `0.2.6 → 0.2.8`。

---

## [未发布] — `@oblivion/vimc` v0.2.6：`f` 候选优先级 + 查找落点靠上 + 翻页 0.6

### 变更：`f` 的候选按优先级排序，前面的拿单字母（所有者要求）

- 三档：**会话正文里的链接 → 正文里其它元素 → 正文之外（外部按钮，排最后）**，档内仍按「行 → 左」
- 提示串改为**短提示优先**：候选 ≤ 字母表长度时全单字母；更多时前面的拿单字母，其余用
  **被保留首字母**的两位串（`15 个候选 → 10 个单字母 + zd zs za zv ze`），因此**前缀依然无歧义**：
  按 `d` 立即触发，按 `z` 才需要第二个字母；两级放不下时退回统一长度
- 自检新增 `hints.tiers`（三档数量）与 `hints.sampleAttrs`（前几个候选的**属性名**，不含值）
- **实测发现**：DSH 的内联引用是 `button[data-variant]`，**不是 `<a href>`** —— 所以真实页面上
  「正文链接」档为 0、正文元素落在第二档（实测 `content 28 / outer 20`），整体仍排在外部按钮之前

### 变更：查找落点从居中改为「靠上留一点距离」

- 所有者反馈「太靠中了不好看」→ 落点比例由 1/2 改回 **1/4**（像自己那条提问的位置）

### 变更：翻页距离默认 0.6

- 理由（所有者）：输入框占掉一部分可视高度，比例要小一点
- 历史默认（0.9 → 0.7 →）0.6 的**定向迁移**：判据是存储里有没有 v0.2.2 才引入的 `regexFindMode`
  字段；没有 = 那份配置只可能带历史默认值 → 迁移；用户自己改过的值不动

验收：`npm test` **40/40**（新增：多候选时前 10 个单字母 + 前缀无歧义 + 两字母两段触发；
正文链接/正文按钮/外部按钮的优先级与 `hints.tiers`）；`dshx check` 全绿；版本 `0.2.4 → 0.2.6`
（0.2.5 为优先级实现、0.2.6 加 `sampleAttrs` 诊断）。
线上实测：`tiers { links: 0, content: 28, outer: 20 }`、`config.pageRatioVertical 0.6`、
前几个候选全来自正文档。

---

## [未发布] — `@oblivion/vimc` v0.2.4：查找落点「一定看得见」

所有者反馈：`/点击 (1 处)` 跳过去之后**没有高亮该词，不知道落在哪**。逐项查证后改了四处：

- **`::highlight()` 只认长写属性**：原来的 `background:` 简写在某些构建里会被整条丢弃（＝完全没有高亮），
  改为 `background-color:`（`color` 保留）
- **新增落点标记（ping）**：每次跳转在当前命中四周画一圈会淡出的琥珀色框（900ms，`position: fixed` 覆盖层）。
  它**不依赖 Custom Highlight**，所以「高亮不可用 / 命中在折叠内容里」时也一定看得见落点
- **落点从容器 1/3 改到 1/2（居中）**：长回答里更醒目
- **折叠分组里的命中**：DSH 把工具调用收进 `<details>`，文字在 DOM 里但不可见。
  现在跳转先找已渲染的命中；都不渲染就**点开 `<summary>`**（官方开关，React 状态跟着变）展开该组，
  重新定位后再跳 —— 与浏览器原生查找一致（此前会「跳到一个看不见的地方」，正是反馈的现象）
- 自检新增 `find.highlight`（`custom`/`none`）与 `find.pings`（累计标记数），这类问题以后能直接从证据文件判断

验收：`npm test` **39/39**（新增两条：每次跳转都画标记 + 关闭时清理；折叠区命中跳转前先展开）；
`dshx check` 全绿；版本 `0.2.3 → 0.2.4`。
线上实测：`find.highlight = custom`（页面里 Custom Highlight 可用）、`keys.active 17 / turns 3`。

---

## [未发布] — `@oblivion/vimc` v0.2.3：查找条对齐 Vimium 形态（回车后失焦）

按所有者给出的参照（浏览器/Vimium-C 的查找条 `基础 (3 处)`）：

- **紧凑形态**：查找条改为 `[/] 查询 (N 处)`，去掉原来那行长帮助文字（键位改在设置页/README 说明）；
  全部命中浅琥珀、当前命中深琥珀（图四那种橙色高亮）
- **`Enter` = 提交**：跳到下一个之后**收起输入框、焦点回到页面** —— 这样 `,` / `.` 能**立刻**前后跳
  （此前输入框一直持有焦点，`,`/`.` 会被当成普通字符吞掉，这是本轮要修的核心手感）
- **HUD 形态**：提交后查找条变成只读文本（不聚焦），仍显示查询与 `(N 处)`；
  再按 `/` 回到编辑态并**全选**查询；`Esc` 在编辑态与 HUD 形态下都能关闭（查询与命中保留）
- 自检新增 `find.committed`，便于在证据文件里看出当前处于哪种形态

验收：`npm test` **37/37**（查找用例按新形态重写：计数写法、回车后失焦、HUD 只读、`/` 重新编辑并全选、
HUD 形态下 Esc 关闭、`.`/`,` 直接前后跳）；`dshx check` 全绿；版本 `0.2.2 → 0.2.3`（按新规则加第三位）。
线上实测：`openFind=2 · findPrevious=1`（已在真实页面里用过），`keys.active 17 / turns 3`。

---

## [未发布] — `@oblivion/vimc` v0.2.2：页面内查找（`/` `.` `,`）+ 翻页距离 0.7

### 新增：页面内查找（对应 Vimium-C 的 `enterFindMode` / `performFind` / `performBackwardsFind`）

- `/` 打开查找框（带上次查询），**边打边找**并显示 `当前/总数`；`Enter` / `Shift+Enter` 前后跳；
  `Esc` 关闭并把焦点还给打开前的元素（**查询与命中保留**）；关掉后 `.` / `,` 继续前后跳（到端回绕）
- **不侵入 DOM**：命中用 `Range` + **CSS Custom Highlight API**（`::highlight(vimc-find)`），
  不包 `<mark>`、不改文本节点 —— DSH 输入框是 Lexical 宿主，外部动选区会导致状态不同步；
  浏览器不支持该 API 时退化为「只滚动、不高亮」
- 落点放在容器高度的 1/3；查找范围 = 会话正文滚动容器（不搜侧栏）
- 大小写按 Vimium 的**智能大小写**；`regexFindMode`（已从「不采纳」改为**采纳**，所有者那份为 `true`）
  打开时按正则解释，非法正则按无命中处理
- 查找框本身是 `<input>`，插件其它快捷键在框内靠**可编辑区守卫**自动让位（无需额外状态机）

### 变更：翻页距离默认 0.7（0.6–0.8 区间）

- 所有者要求把「平滑滚动的距离」设在 0.6–0.8 之间；Vimium-C 导出里**没有**这一项
  （它只有 `scrollStepSize = 90` 像素步长，本插件已沿用），所以这是本插件自己的选项
- 取值 **0.7**（区间中点）；v0.1 那个「从没被用户改过」的 0.9 会**自动迁移**到 0.7，
  用户真正改过的值原样保留

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `npm test` | **37/37**（新增：查找开关/边打边找/回绕/Esc 后继续/正则/非法正则、翻页比例默认与旧值迁移；原有 34 条在 0.7 口径下全绿） |
| `dshx check`（CLI） / 类型 / 版本一致 | 全绿 / ✅ / `0.2.2` |
| 真实页面自检 | `keys.active 17 / unsupported 0 / errors 0`、`turns 2`、`hints.candidates 46`（命中 605）`/ scanMs 7.5`、`find` 计数与耗时字段就位 |
| 真实使用 | 宿主计数器（截至本轮）：`scrollPageUp 20 · scrollPageDown 22 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 6 · escapeToPage 1` |
| 版本规则 | 本轮按新规则加第三位：`0.2.1 → 0.2.2`（不是 `0.3.0`） |

---

## [未发布] — `@oblivion/vimc` v0.2.1：轮次跳转 + 性能自证与优化 + 版本规则变更

### 新增：轮次跳转（`[` / `]`）

- 按 `[` 跳到**上一条提问**、`]` 跳到**下一条提问**，落点与 DSH 右侧轮次导航条一致 ——
  用的是**同一批官方锚点** `ui-chat` 的 `[data-chat-turn]`（不依赖任何 class 名或组件内部结构）
- 语义照所有者描述：**读到回答中间按一次回到本轮提问；已在提问顶部再按一次继续往上**；
  已在最上面那条时**不动作也不吞键**（往上滚仍交给 `w`/`W`）
- 落点贴容器顶 + 2px，并对目标做 700ms 描边（用完还原行内样式）
- 边界：DSH 会话分页加载，跳转只覆盖已加载轮次（滚到顶会触发它自己的分页，再按即可继续）

### 新增：插件自身开销的**可观测**证据

- `oblivionVimc.probe().perf` / `hints.{matched,candidates,scanMs,sessions}`：按键处理耗时与候选扫描漏斗
- **每条命令心跳都带 `perf`**：真实页面里按几下就能看到实测延迟（设置页也直接列成表格）
- 设置页「运行只读自检」新增：已加载轮次数、选择器命中数、扫描耗时、按键耗时（平均/峰值/采样数）

### 变更：性能（实测 111.8ms → 11.2ms）

第一版在真机上量到候选扫描 **111.8ms**，逐项拆开后修掉四处：

| 优化 | 原因 |
| --- | --- |
| `checkVisibility()` 快路径替代 `getComputedStyle` | DSH 样式表极大，逐元素读计算样式在真机上是毫秒级；`checkVisibility()` 是引擎内部一次判定 |
| 一次 `closest()` 替代两次祖先遍历 | 排除浮层与 `aria-hidden` 子树 |
| 每个元素只读一次矩形，样式只给幸存者 | 筛序改成「便宜的在前」 |
| 挂载自检跳过扫描 | 挂载那刻外壳未渲染完，扫描没用且白花时间（交给 1.5s 后的自检） |

另外把按键路径**按开销重排**：先做纯计算（比对 ≤14 条键位），**没命中就立刻返回**，
只有命中命令时才问 DOM 焦点 —— 于是最常见的「在输入框里打字」一次 DOM 查询都不做。
宿主侧心跳落盘也从「每条一次同步写」改为**750ms 合并窗口**（该项需重启 App 生效）。

### 变更：版本规则（所有者 2026-10-05 裁定）

- 任何新版本线从 **`0.0.1`** 起步；**已有版本号不回改**；此后**每次只加第三位**（patch）
- 第二位/第一位**只在明确要求时**动：`--minor` / `--major`；位置参数写 `minor` 会被脚本拒绝
- 规则落点：[`.action/AGENTS.MD`](.action/AGENTS.MD)（规范）+ 本文件开头 + 插件 `scripts/bump-version.mjs`
- 本轮按新规则：`@oblivion/vimc` `0.2.0 → 0.2.1`（不是 `0.3.0`）

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `npm test` | **34/34**（新增：轮次跳转 4 条语义/边界、性能字段 1 条、快捷路径重排后原有用例全绿） |
| `dshx check`（CLI） / 类型 / 版本一致 | 全绿 / ✅ / `0.2.1` |
| 扫描耗时（真机） | **11.2ms**（选择器命中 1220 → 视口候选 42）；优化前同页 **111.8ms** |
| 按键耗时（真机，重排前样本） | 平均 **1.825ms** / 峰值 **3ms**（4 次采样）；重排后打字路径不再做 DOM 查询 |
| 真实使用 | 宿主计数器：`scrollPageUp 18 · scrollPageDown 21 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 5 · escapeToPage 1` |
| 真实页面锚点 | 竖向容器 `div[data-conversation-scroll]`、输入框 `div[data-composer-input]`、已加载轮次 **3**、`keys.active 14` |

---



按所有者要求，把插件从「几个固定快捷键」升级为「Vimium-C 语义的可配置层」，并提供设置页面。

### 新增：链接提示（`f` → `LinkHints.activate`）

- 视口内可点击元素浮出琥珀色字母标签；候选 ≤ 字母表长度时**每个 1 个字母**，更多时**全部 2 个字母**
  （统一长度，避免「`d` 与 `da` 并存」的前缀歧义）
- 字母表取 `linkHintCharacters`（默认 `dsavewrqcxz`），按「行 → 左」分配（顺序即优先级）
- 触发时依次派发 `pointerdown → mousedown → pointerup → mouseup → click`（React `onMouseDown`/`onClick`
  与 `<a href>` 默认跳转都能生效）；`Esc` 或字母表之外的键取消；浮层随滚动/缩放重排；不注入常驻 DOM

### 新增：DSH 设置页（`settings.section`，id `oblivion-vimc`，order 46）

七块：启用与版本 / 键位文本（Vimium `map`·`run` 语法，含生效键位与**未接管命令逐条理由**）/ 滚动
（平滑、翻页比例、`scrollStepSize`）/ 输入框（`Esc` 退出、编辑中允许翻页、选区模式、优先选择器）/
链接提示（字母表、就地试跑）/ 兼容导入（选文件或粘贴 JSON，显示已采纳·未采纳报告）/ 排除规则与只读自检。

### 新增：Vimium-C 兼容层（`src/client/vimium.ts`）

- **键位解析**：`map` / `run` 文本（含续行 `\`、`#` 注释、`unmapAll`）、修饰键写法 `<a-t>`/`<c-up>`、
  命名键 `<backspace>`/`<left>`/`<f1>`、标点键、`run <键> <另一个键>` 的单层别名（`run q i` → `focusInput`）
- **命令映射**：`scrollPageUp/Down`、`scrollUp/Down/Left/Right`、`scrollPx*`、`scrollToTop/Bottom`、`focusInput`、
  `LinkHints.activate`、`goBack`/`goForward`；其余（标签页 / Vomnibar / 查找 / Marks / 剪贴板 / 下载 /
  序列键 / `reload` / `goUp`…）**逐条列出并给出不适用理由**，绝不静默忽略
- **选项导入**：`keyMappings`、`linkHintCharacters`、`scrollStepSize`、`keyLayout`→`ignoreKeyboardLayout`、
  `smoothScroll`、`exclusionRules[].pattern`→`exclusions`、`focusInput` 的 `o.select`/`o.prefer`
  （`o.prefer` 追加在本插件默认 `[data-composer-input]` 之后）；导入报告含「已采纳 / 未采纳 / 源信息」
- 键位文本进入设置页后**内置默认不再硬编码**：`DEFAULT_KEY_MAPPINGS` 就是一段 `map` 文本，与用户文本走同一条解析路径

### 变更（破坏性：键位语义）

- **`a`/`d` 改为像素步进**（Vimium 语义：`scrollLeft`/`scrollRight` = `scrollStepSize` 像素，实测导出值 90），
  不再是「一屏」；要一屏请调大 `scrollStepSize`
- **`Esc` 退出输入框默认开启**（`i` 进去之后必须能原路退出）；有菜单/弹窗打开时让位
- 新增 `Ctrl+↑↓←→` → 像素级竖向/横向步进（与导出配置一致）

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `dshx check`（CLI） | **全绿**（新增 `client-inject` 检查通过） |
| 构建 / 类型 / 版本一致 | ✅ / ✅ / `0.2.0` |
| `npm test` | **31/31**（含**真实 `vimium_c-20251214_001720.json` 的导入断言**：`linkHintCharacters=dsavewrqcxz`、`scrollStepSize=90`、`keyLayout=0`→按字符匹配、排除规则、`o.prefer` 合并、`w/s/a/d/W/S/f/i/q` 全部解析出命令、未支持命令逐条有理由） |
| 客户端半边在真实页面运行 | `client-beat.json`：`clientVersion 0.2.0`、UA `@deepseek-ai/dsh-desktop/0.2.0-rc.2 … Electron/44.0.0` |
| **真实按键已被处理** | 宿主计数器：`scrollPageUp 9 · scrollPageDown 7 · focusInput 2 · scrollToTop 1 · scrollToBottom 1` |
| 真实页面自检 | `keys.active 12 / unsupported 0 / errors 0`、`hints.characters dsavewrqcxz`、视口内可点击元素 155 个、竖向容器 `div[data-conversation-scroll]` |
| 设置页在线 | `Slots` 只读查询：`settings.section` 占用者含 `{ registrant: "@oblivion/vimc-client", id: "oblivion-vimc", order: 46, active: true }` |

---



### 新增：`@oblivion/vimc` v0.1.0（`oblivion-vimc/`）

第二个已落地的 `@oblivion/*` 插件（不在设计书 §9.1 的 8 项能力清单内，是按所有者需求新增的**交互工具类**插件）。

- **键位**（照搬需求里给出的 Vimium-C 自定义配置）：`w/s` 上/下翻页、`a/d` 左/右移屏、
  `W/S` 到顶/到底、`i` 聚焦输入框；`Esc` 退出输入框（默认关）。
- **核心约束**：焦点在输入框 / 终端里时**一个键都不接管**（`contenteditable` 的 Lexical 宿主、
  `input`、`textarea`、`select`、`[role=textbox]`、`.xterm` 全部识别）；`Ctrl/Alt/Meta`、
  IME 组合期、已被 `preventDefault` 的事件一律放行；**没找到可滚容器时不吞键**。
- **滚动目标发现**：视口中心探测 → DSH 正文滚动区 `[data-conversation-scroll]` → 上次容器 → 根滚动元素。
  弹窗打开时自然滚弹窗；横向轴会先滚宽代码块/表格/终端块自己的横向条。
- **为什么不走 `ctx.shortcuts`**：桌面端 Windows/macOS 的原生键盘桥会**先于**本地处理拦截已接受的组合键，
  且 `ShortcutRegistry.dispatch()` 在 priority 为真时跳过 region 判定 —— 注册裸字母会让用户在输入框里
  打不出 `w/s/a/d/i`。故改为页面级 keydown + 自判焦点区域（与 Vimium 同类做法）。详见插件 README 第三节。
- **宿主半边**：启动标记、卸载自证、`POST /oblivion-vimc/beat` 诊断路由（限长 8 KiB + 来源校验）。

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `dshx check`（CLI） | **全绿**（manifest / `export apply` / 无默认导出 / boot-marker / cordis overlay 可移植 / `dsh.client.platform=web` / 构建产物存在） |
| 构建与类型 | `npm run build` ✅、`npm run typecheck` ✅ |
| 行为测试 | `npm test` → **20/20**（对构建产物 `lib/client.js` 派发真实 `KeyboardEvent`） |
| 宿主半边挂载 | `%TEMP%\oblivion-vimc\host-mount.json`（DSH 宿主自身写入，pid 24220 / node 24.18.1） |
| 客户端半边挂载 | `client-beat.json`：UA 为 `@deepseek-ai/dsh-desktop/0.2.0-rc.2 …Electron/44.0.0` |
| 真实页面锚点自检 | `div[data-conversation-scroll]`（可滚 range 随会话增长，实测 1824 → 2157px）、`div[data-composer-input]`（命中优先选择器） |
| 挂载方式 | profile `link:` 依赖 + `cordis.patch.yml` 插入行，**无需重启应用**（补丁落盘同一秒宿主即装载） |

### 记录：两条本机环境事实（已写入 `WORKSPACE.md`）

- **DSHX 的 MCP 工具面在本机全废**：`dshx check` / `activate-new-client` / `verify-boot` / `browser open`
  都先跑 `dshx creator claim`，而 claim 依赖 POSIX `ps -o lstart=` → 恒报
  `Creator+ Host identity is incomplete`。**但 `dshx` CLI 的 `check` 子命令可用**（本轮即用它取得源码契约证据）。
- **宿主半边的代码改动需要重启 DSH App**：Host 复用 ESM 缓存里的同一模块命名空间，禁用再启用不会重新导入；
  浏览器半边不受此限（改完 `npm run build` + 触发一次补丁重算即可自动重挂）。

### 记录：产品版本递增工具缺失

本轮**未改动根 `VERSION`（0.0.2）**：本文件与 `.action/AGENTS.MD` 都引用 `scripts/bump-version.ps1`，
但仓库根**没有** `scripts/` 目录（只有 `oblivion-brand/scripts/bump-version.mjs`）。产品版本的递增工具待补，
补上之前产品版本无法按规范递增。

---

## [0.0.2] — Phase 5 问答闭环落地 + README 三条主线

### 新增：问答闭环（`oblivion-qa-loop`）

- **四层筛选**（L1–L4）：
  - L1 精确去重：`SHA256(question+answer)`，in-memory `Set` 跨会话去重
  - L2 语义去重：首版无向量后端，跳过（配置字段留位）
  - L3 规则过滤：答案 <5 字 / 拒绝模式（`不知道`等）/ 纯寒暄多词匹配
  - L4 价值评估：`^好的?$` `^收到?$` `^嗯+$`（防御性保险，实际被 L3 先拦截）
- **事件链路**：`chat/send` → `session:complete` → qa-loop → `knowledge:created`
- **RISK-117 防回灌**：注入条目打 `source_type: qa_loop` 标记，已在知识层过滤链里消费

### 新增：核心认知·思维激荡（`oblivion-perspective`）

- `elaborate()` 服务：主动触发（每次回答末尾追加视角）与深度触发（用户明确要求）
- 闸门逻辑：深度触发在「思考中」状态时不阻塞主对话；主动触发由调用方驱动

### 变更：`oblivion-core` 通信增强

- `web-handlers.ts` 的 `createChatHandlers` 新增可选 `emit` 参数，`chat/send` 完成后发射 `session:complete`
- `cli.ts` 透传 `booted.ctx.events.emit` 到 handler 工厂

### 变更：README 重写概览节

- 插入三条主线（知识自动生长 / 可编程组合 / 长期可维护）
- 一行概括：一个内核 + 三种部署形态 + 五项核心认知能力 + 三层 UI 设计 + 一套发布工程学
- 「现状」节补充 Phase 5 落地状态说明

### 门禁

- 测试 **901 → 912**（+11 条 qa-loop 专项测试：沉淀路径、L1 去重、L3 短答案、拒绝模式、寒暄、异常隔离、非空引用、标题截断）

---

## [未发布] — Web 形态可构建可服务 + 188 图标 + 退役 .alpha

### 新增：Web 形态（pnpm/npm 之外的第一个「可交付产物」）

- **`scripts/build-web.mjs`**：用 **esbuild** 把 `oblivion-web-ui/src/app/main.tsx` 打成
  `.build/web/{index.html,app.js,app.js.map,build-manifest.json}`
  - **令牌 CSS 在构建期内联进 `index.html` 的 `<head>`，且在 `<script>` 之前** ——
    这是 §3.4 的无闪烁要求：先亮后暗/先大后小都源于把令牌放到运行时注入
  - CSS 从**构建产物**（`lib/index.js` 的 `renderEarlyInjectionCss`）取，
    因此页面上的令牌与 `--dump-config`、测试看到的令牌**同源**
  - `build-manifest.json` 记录版本、文件与字节数、**令牌数（427）**、入口
  - `--build/` 已在 `.gitignore`（与 `/build/` 分开：一个是要交付的产物，一个是临时目录）
  - ⚠️ **生成产物必须同时进 `.prettierignore`**：否则 `prettier --write .` 会改写它，
    让 `tokens:check` / `icons:check` 立刻报「产物已过期」—— 同一个坑在令牌表上踩过一次，图标表上又踩了一次
- **`oblivion-core/src/serve.ts`**：静态服务 + `/healthz` + `/metrics`
  - 这补上了 TODO 里记的缺口：「prometheus.yml 抓 127.0.0.1:42081/metrics，但该端点尚不存在」
  - **路径穿越防御**（原始与百分号编码两种写法），默认只绑 127.0.0.1
  - `close()` 里同时调用 `closeIdleConnections()` —— 否则 keep-alive 会让进程关不掉
  - 指标：`oblivion_web_ready` / `oblivion_web_build_info` / `oblivion_http_requests_total`
    （**服务自身**指标；§26.2 的业务指标由各自的插件提供）
- **CLI**：`web` 新增 `--port`（默认 42081，占用时自动改随机端口）与 `--web-dir`；
  服务在**内核就绪之后**启动，并与内核共享同一条退出链（`RunProfileOptions.shutdownTargets`）
- **帧层的真 bug（React 接入才暴露）**：`createLayoutStore()` 的快照每次调用都新建对象 ——
  `useSyncExternalStore` 会判定「一直在变」并无限重渲染。已改为**变更时才重建的快照**

### 新增：188 个图标字形（Phase 4c）

- **`scripts/generate-ui-icons.mjs`**：从证据包
  `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 的 `lib/index.js` **机械提取几何**，
  并与 `lib/types/icons/index.d.ts` 的导出清单**交叉核对**；对不上就拒绝产出
- 实测：**94 字形 / 188 导出 / 95 条声明**（多出的 `ChatLinesOutline` 是不被直接导出的共享基座，
  被 `QueueOutline` 转发，产出时已内联）；`ICON_REGULAR_STROKE 1` / `ICON_MEDIUM_STROKE 1.3`
- 提取过程踩到并修好的四个坑（都由对账或测试抓出）：
  1. **五种声明形态**（常规/纯填充/两种转发/块体）—— 只认一种会静默少 4 个字形；
  2. **默认尺寸不止 16**（还有 10 / 14 / 20）—— 写死 16 会让一票图标偏大偏小；
  3. **节点必须递归**：94 个里 **75 个**含嵌套 `children`（mask / g），拍平会让 mask 变空、
     子节点跑到根上 —— 不报错，只是画错；
  4. **模板字符串要跳过**：其中的花括号会打乱括号配对计数
- `Icon.ts` 手写渲染器：两档共用几何、`useId()` **无条件调用**（遮罩 id 必须每实例唯一）、
  运行期解析 `{id}` 与 `{strokeWidth+N}` 占位符（静态数据表达不了）

### 变更：`.alpha/` 退役，结构契约入库

- **删除 `.alpha/`**（alphα 模板的本机元数据：`manifest.json` + sources + templates + alpha-init 工具）——
  产品侧对它**零依赖**；唯一的实际用途是给 `structure-contract.test.mjs` 提供结构契约
- **新增入库的 `structure.contract.json`** 取代那份本机 manifest。这是一次**加强**而不是妥协：
  原契约在本机目录缺失时**整段跳过**（新克隆/无模板环境下守卫自行消失），
  迁入入库契约后那条检查在任何环境都必然运行（34 条断言）
- `.gitignore` 保留 `/.alpha/` 并注明退役原因：模板目录若再次出现，仍然不该入库

### 门禁

- 测试 **638 → 645**；新增 `tests/integration/web-build.test.mjs`（6 条：无闪烁、令牌同源、
  产物清单、服务可用性、穿越防御、附加指标）与 `tests/unit/ui-icons.test.mjs`（11 条）
- CI 增补 `Build web bundle` 步骤 —— 否则「带界面的 Web 版本」会一直只是本机能跑的东西

---

## [未发布] — Phase 4c · UI 组件层（第一批）

> Phase 4 的第三个子阶段。本批交付**组件层的基础设施 + 29 个组件**，
> 并把 COMPONENTS.MD 的四条纪律变成**机器检查**而不是自觉。

### 新增：React 接线

- **React 19 接入**：`react` / `react-dom` / `@types/react` / `@types/react-dom` 进根 `devDependencies`；
  `oblivion-web-ui` 把它们声明为 **`peerDependencies`** —— 宿主提供**单实例** React，
  这与 §9.2「跨包依赖走 peerDependencies」同一条口径
- **依赖本体不入库**：`node_modules/` 继续整体忽略（含 React 源码），仓库只保留
  `package.json`（依赖是什么）与 `package-lock.json`（确切版本与完整性哈希）。
  新克隆 `npm ci` 即自动安装 React；`.gitignore` 里记下了这条决策
- 该包 `tsconfig` 增补 `jsx: react-jsx` 与 `lib: ES2022 + DOM` —— DOM 只给这一个
  **浏览器侧**包，其余包仍是纯 Node

### 新增：29 个组件

| 分组           | 组件                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 基础控件（12） | `Button` `Input` `Checkbox` `Switch` `SegmentedControl` `SegmentedTabs` `Pill` `Tag` `DisclosureRow` `PathLabel` `StateDot` `TextShimmer` |
| 浮层（8）      | `Tooltip` `Modal` `RiskConfirmation` `Toast` `ShortcutKeys` `MenuSurface` `MenuItemButton` `MenuGroup`                                    |
| 反馈（1）      | `ConnectionIndicator`                                                                                                                     |
| 品牌（2）      | `PolarisLogo`（+ `POLARIS_PATH`）、`BrandWordmark`                                                                                        |
| 内容块（6）    | `CodeBlock` `ReadBlock` `DiffBlock` `SearchBlock` `TerminalBlock` `JsonBlock`                                                             |

- **`lib/contracts.ts`**：§7 的全部固化常量集中一处（16 行截断 ×4、Toast 3000ms、Button 36/12 与 28/8、
  24px 过程行、Tooltip gap 8 与延迟 0/0、HoverCard 500ms、StateDot 五态默认尺寸、图标描边 1 / 1.3），
  外加五个命名字段的**封闭集合**
- **`lib/tokens.ts`**：`tok()` / `px()` / `ms()` —— 刻意**不提供带兜底值的 tok**，
  否则硬编码会以「兜底」的名义回来
- **可访问性写在契约里**：`Modal` 的 `headless` 可辨识联合（非 headless 必须给 `closeLabel`）、
  `data-modal-autofocus` 代替 `autoFocus`、`SegmentedControl` 的 `id` → `id-value` / `id-value-panel` 映射、
  `StateDot` 的 `aria-hidden`、`RiskConfirmation` 的「未确认则锁住确认按钮」

### 新增：把纪律变成断言（38 条测试）

- **机械守卫**：Cordis-free、只用 `--obl-*` 令牌（注释与品牌资产除外）、文案不写死（CJK 扫描）、不 import `oblivion-*`
- **固化常量**：逐条与 §7 对账；`StateDot` 里 `ongoing=14` 而其余为 10 的不对称被显式断言
- **渲染契约**：用 `react-dom/server` 做**无头**渲染（仓库没有浏览器，组件是纯展示原语，
  其契约本来就该在标记层可断言），覆盖像素尺寸、a11y 属性、**16 行截断**、**无文案席位时不渲染截断说明**
- **品牌几何防漂移**：`src/brand/polaris.ts` 与 `assets/brand/polaris-path.ts` 逐字比对

### 测试抓到的一类真 bug

过渡时长最初被写成 `px(120)`。**这类错误不会报错**——浏览器直接丢掉非法声明，
动画静默失效。现在 `ms()` 与 `px()` 是两个函数，7 个组件里的时长全部改走 `ms()`，
并加了「慢脉冲 1.5s」这一共享常量（TextShimmer / DisclosureRow running / StateDot 都是它）。

### 两处刻意的实现偏离

1. **内联 `style` + `var(--obl-*)`，而非参考实现的 CSS Modules** —— 后者需要打包器，
   而仓库目前没有；迁移时变的是样式承载方式，**令牌契约不变**。
2. **浮层只做呈现、不做定位** —— 锚点定位需要 DOM 与滚动观测，属后续批次。

---

## [未发布] — Phase 4a · UI 令牌层

> 设计书 §18 Phase 4 的第二个子阶段。产出是 `oblivion-web-ui` 的样式基础：
> **427 个令牌**、2 个用户旋钮、8 档排版刻度与无闪烁早期注入。

### 新增

- **`scripts/generate-ui-tokens.mjs`**：从证据快照（`versions/<ver>/ui-tokens.md`，
  36290 B / SHA256 记录在产物头部）**生成** 427 个令牌的逐值表，并把旧前缀族
  （`--dsw-` / `--dsh-` / `--ds-` / `--shiki-`）统一改名到 `--obl-*`。
  `npm run tokens:generate` / `tokens:check`
- **`theme/tokens.generated.ts`**：机械解析结果与文档账目**逐节吻合** ——
  11 节 / 427 行 / ① 77 + ② 107 + ③ 243，含 `Component level` 8 个属 ③ 子集的澄清（`ERRATA-16`）
- **`theme/settings.ts`**：`THEME_PREFERENCES` / `FONT_SIZE_MIN 10` / `MAX 22` / `DEFAULT 14` /
  `DEFAULT_PREFERENCE 'system'` / 命名空间 `ui-theme`，以及**同时充当持久化 schema、wire 校验与默认值来源**的
  `ThemeSettingsSchema`（按 Standard Schema 形状实现，不引入依赖）
- **`theme/scale.ts`**：8 档刻度（`48 + 30 + 2 + 102 = 182` 的账目落成断言）、
  `fontDeltaExpression()`、`secondarySizeExpression()`（`ERRATA-19` 的修正公式）、
  markdown 17 个样式位、`strongTokenOf()`（`-strong` 在数字之前，`ERRATA-47`）
- **`theme/css.ts`**：令牌 → CSS。调色板落 `:root`、参与主题切换的落 `body`、
  深色落 `body[data-ob-dark-theme]`、darwin 落 `html[data-platform='darwin'] body`（权重更高）；
  外加 §6.1 焦点环、§7 的 `@supports` 超椭圆圆角，以及 `renderEarlyInjectionCss()` 的**无闪烁**载荷
- **两处显式偏离机制**：`TOKEN_CORRECTIONS`（`ERRATA-19`）与 `SCOPED_TOKENS`（`ERRATA-46`）——
  生成产物保持对证据的忠实，修正集中在一处，可分别核对
- **测试 579 → 599**：账目闭合、改名彻底、`m-18` 陷阱、`ERRATA-19` 公式、深色/darwin 结构、
  限定作用域、无闪烁三态、宿主属性解析

### 发现并登记（`.design/ERRATA-v4.0.1-draft.md` §N）

| ID          | 发现                                                                                                                             | 影响                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ERRATA-45` | §2.1 称调色板「明暗主题完全相同」，但 77 个里有 **1 个**不同（`static-neutral-bluish-60`）                                       | 「新主题只需动 alias 层」不是无条件成立；实现侧把反例清单**算出来**而非写死     |
| `ERRATA-46` | §6.1 的焦点环规则依赖 `--obl-focus-ring-color` **未被定义**才回落到 business-primary，而逐值表把它记在基值层且值是 `transparent` | 按「全量注入基值层」实现会让**键盘焦点环永远不可见**且无报错 → 改为指针模态覆盖 |
| `ERRATA-47` | strong 变体命名是 `--obl-font-<name>-strong-<n>`（`-strong` 在数字**之前**）                                                     | 按「基础名 + `-strong`」拼接会得到不存在的令牌，CSS 拼错静默失效                |

> 三条都是**把令牌真正渲染成 CSS 才会暴露**的问题：纸面上读不出来。

---

## [未发布] — Phase 4b · UI 帧层

> 设计书 §18 的 Phase 4 已按裁定拆成 **4a 令牌层 / 4b 帧层 / 4c 组件层**。
> 先做 4b 的理由：它是**纯 TypeScript**（几何、偏好、槽位、tab 注册），不依赖 React，
> 因此可以不引入新依赖就落地，并被测试逐条钉死。

### 新增

- **`layout/columns.ts`**：九个几何常量（`CENTER_MIN 400` / `SIDEBAR_* 264·420·280·56·1024` /
  `RIGHTBAR_MIN 300` / `RIGHTBAR_MAX_RATIO 0.7` / `RIGHTBAR_DEFAULT_RATIO 0.45`）、
  `clampWidth()`、`defaultRightbarWidth()` 与 `computeColumns()`
- **让步顺序照字面实现**：右栏先收缩 → 再丢轨道 → 中央才允许低于 `CENTER_MIN`；**左栏不让步**。
  响应式折叠（<1024 自动塌成 56px 图标轨、窄屏覆盖位展开）并入同一个纯函数，
  因此「几何」只有一处真源
- **`layout/stores.ts`**：`createLayoutStore()` —— `LayoutInfo` 8 个既有字段 + **新增偏好 `rightbarOpen`**
  （`OPEN-LAYOUT-03` ② 的落地前提；原 `LayoutInfo` 不含它）。两条语义相反的偏好规则各有一条回归用例：
  **左栏关闭即遗忘拖拽宽度**、**右栏跨 resize / close 保留 px 偏好**
- **`layout/service.ts`**：`ILayout` 服务面，含 `beginNavigation()` 的 AbortSignal 纪律
  （下一次导航 abort 上一次，layout 卸载也 abort），并补上 §4.2 明记的缺口 `setRightbarOpen`
- **`slots.ts`**：槽位地图 root 5 + 左栏 7 + 右栏 5 = **17**，配一个最小注册器
  （声明即独占渲染权、`single` 重复即抛、`keyed`/`list` 按键去重）
- **`tab-registry.ts`**：右栏 tab 类型注册 —— 三优先级带（`extension` > `builtin` > `fallback`）、
  glob 地址识别（含 `:` 的模式匹配整个地址，这是对 VS Code 规则的唯一本地改动）、
  `canOpen` 否决权、**thunk 标题每次重读**
- **测试 537 → 579**：几何常量与让步顺序、两条相反的偏好规则、
  「响应式让步不回写偏好」、§7「先折叠左栏右栏才开得出来」、槽位账目与注册器、tab 解析优先级

### 刻意不做

- **不实现完整的 `ctx.slots` 注入机制**：`.memory/TODO.md` §E④ 把它列为 Phase 4 的关键未知，
  本包只承诺有证据支撑的那部分语义（声明表 + 注册器）
- **不接 React**：4c 组件层需要它；帧层不碰 DOM 是设计约束（COMPONENTS.MD §1 的四条纪律）

---

## [未发布] — Phase 1 · 内核可加载插件

> 设计书 §18 的 **Phase 1**：`oblivion-core` 从契约骨架变为真正的内核。
> 交付门禁是「`--dump-config` 能导出组合树」，且 `typecheck` / `lint` / 测试全绿。

### 新增

- **六层 Patch 引擎**（`src/patch/`）：① 空根 → ② Bundle → ③ 用户层 → ④ Home 层 →
  ⑤′ 项目层 → ⑤ `--patch` 覆盖。实现的两条关键语义来自 §13.3：
  **`patch` 替换整段 `config`（不是深合并）**、**行顺序不携带加载语义**
- **`!!js` 条件加载与 `${env:...}` 插值**：自定义 js-yaml Type，把 `!!js` 解析成
  **未求值的表达式对象**而不是立刻执行 —— 这样 `--dump-config` 能在不启动插件的前提下
  求值 `disabled` 并把表达式原样打印回去（可再次作为输入）。求值失败时保守地「不加载」并留警告
- **来源链**（§13.4）：每行记录「谁插入了它、后来哪几层改写过它」，`--dump-config` 输出可直接回答
  「这个值是哪来的」
- **启动链**（`src/profile/`）：`composeProfile()` → 重写空根 `cordis.yml` → `boot()` → 有界退出。
  「有界」= 正常卸载与 5 秒超时赛跑，超时强制结束
- **配置导出**（`src/dump/`）：`--dump-config` / `--dump-config-schema` / `--dump-config-default`，
  `--json` 可切换格式。**schema 不完整时降级为组合树并以 0 退出**（§7.3 / RISK-109；参考架构此处是 exit=1）
- **CLI**（`apps/cli/oblivion.mjs` + `oblivion-core/src/cli.ts`）：`web` / `init` / 三个 dump 命令 /
  `--profile` / `--patch` / `--home` / `--root` / `--version` / `--help`
- **网络暴露护栏**：`--host 0.0.0.0` 默认被 CLI 拒绝，必须显式 `--allow-network-exposure`，
  且必须同时给出至少一个 `--trusted-host`（§14.4 / PF-19 / RISK-118 应对③）
- **`oblivion.profile.bundles`**：根 `package.json` 显式声明 26 个 bundle 的叠加顺序；
  未声明时按目录名字典序兜底并告警（兜底是猜测，不该长期依赖）
- **测试 478 → 536**：patch 引擎（层序 / 替换语义 / `!!js` / 来源链 / 降级）、有界退出、
  CLI 端到端、真实仓库组合集成

### 变更

- `oblivion-core` 的 `dependencies` 从空变为 `{ "js-yaml": "^4.3.2" }` —— 按 §9.2 的口径，
  **跨包（插件间）依赖走 `peerDependencies`，第三方库才进 `dependencies`**。
  对应的结构测试从「dependencies 必须为空」改为「白名单 + 禁止 `oblivion-*`」
- `npm test` 增加 `pretest`（先 `npm run build`），使测试始终跑在最新构建产物上
- `README.md` / `packages/oblivion-core/README.md` / `docs/快速开始.md` 同步 Phase 1 现状

### 已知遗留（不属于 Phase 1 的验收范围）

- `profiles/web/cordis.patch.yml` 改写的 `webserver` / `web-app` 两行**在 Oblivion 里不存在**
  （它们是参考架构的行）。合成时被记为**警告**而不是崩溃 —— 这正是降级姿态要暴露的事实
- 26 个行里 13 个处于 `pending`（`inject` 的服务尚无提供者），属预期：服务由后续阶段引入
- 右栏内容清单、Profile 的行集合仍待产品裁定（`OPEN-111` / §11.2）

---

## [0.0.1] — 2026-10-02 · 起点基线

> **这是 Oblivion 的真正起点。** 孤儿分支 `alpha-init` 的根提交 `e6289d525` 是模板骨架，
> `0.0.1` 把目录结构对齐到设计书 §10，让 26 个能力包的契约就位，并把仓库边界划清。

### 新增

- **版本基线**：`VERSION` = `0.0.1`（单一真源）；根 `package.json`、26 个能力包、
  `registry.json` 与 `oblivion-core` 源码常量全部同步，由测试钉死一致性
- **25 个能力包**（与既有 `oblivion-core` 合计 26 个）—— 每个含
  `package.json` / `tsconfig.json` / `src/index.ts` / `cordis.patch.yml` / `README.md`：
  `oblivion-desktop-host`、`oblivion-adapter-{obsidian,dsh}`、
  `oblivion-llm-{deepseek,openai,ollama}`、`oblivion-session{,-sqlite}`、
  `oblivion-knowledge{,-sqlite,-vector}`、`oblivion-tool-{web-search,file,doc-parse}`、
  `oblivion-{qa-loop,perspective,graph-growth,feedback,content-creator}`、
  `oblivion-web-ui`、`oblivion-tray`、`oblivion-plugin-manager`、`oblivion-updater`、
  `oblivion-dump-config`、`oblivion-telemetry`
- **`apps/electron/`**：Electron 宿主壳骨架 —— `src/{main,preload,ipc}.ts`、
  `renderer/`（欢迎页 + 强制更新页）、`resources/runtime/`、`electron-builder.yml`。
  `renderer/` **不含业务 UI**：主界面归 `oblivion-web-ui`，否则 CLI 形态永远拿不到界面
- **`assets/brand/`**：北极星资产。**几何真源是 `generate-brand-assets.py`**，
  一次产出 `polaris-path.ts` / `polaris.svg` / 5 档 PNG / `.ico` / `.icns` / 品牌规范
- **`registry.json`**：插件清单（26 条），npm 内嵌，零托管成本
- **`pnpm-workspace.yaml`**：对齐设计书 §10 的目录契约
- **`.design/`**：设计书 Baseline 与勘误清单（Draft）—— 架构决策与使用说明分家，且**不入库**
- **`docs/`**：新增《快速开始》《插件开发指南》《目录结构说明》，删除模板残留
- **`CHANGELOG.md`**（本文件）、`VERSION`、`npm run version:bump` / `npm run brand:generate`

### 移除

- **`.docs/` 目录**：alphα 模板本就标注它「已废弃」（`.action/GUIDE.MD`：全项目只保留
  `docs/` 一个文档目录）。其唯一文件 `DESIGN.MD` 并入 `.design/`，空目录删除
- **`docs/README.md`**：与顶层 `README.md` 重复。`docs/` 不再有索引文件 ——
  入口只有一个，两边不会不同步
- **Docker 支持**：`docker/`、`.dockerignore`、`profiles/docker/`、CI 的 docker job。
  首版范围是**单机自用**（设计书 §0.5），且 §22 自己就指出「`-p 42081:42081` 单独使用不成立」——
  在没有真实容器部署需求前，维护一套跑不通的配置只会误导人。需要时按 §22 两条路径重做
- **本机协作层移出版本控制**：`.action/` `.alpha/` `.memory/` `.skills/` `.cache/` `.design/`
  改为 `.gitignore` 忽略（**磁盘保留**）。它们随个人与机器而异，入库只制造冲突。
  ⚠️ **`.github/` 明确保留入库** —— 忽略它会让 CI 静默失效（设计书 RISK-120）
- **weknora 痕迹**：移除 `weknora` remote 与 `legacy/weknora-main` 备份分支
  （其提交 `887e64920` 仍可从 `feature/sync-md` 到达，无信息丢失）。
  不再在 WeKnora 基础上 fork 修改

### 变更

- **`tsconfig.base.json`**：把 `declarationDir` 下放到各包 `tsconfig.json`。
  写在 base 里会按 base 所在目录解析，`.d.ts` 全落到仓库根 `lib/`，
  与各包 `exports.types` 指向的 `lib/types/` 完全不符（ERRATA-09）
- **根 `tsconfig.json`** references 从 1 项扩到 26 项
- **`docs/design/` → `.design/`**：使用说明与架构决策分家，`docs/` 只留「怎么用」。
  随后 `.design/` 一并划入本地协作层（不入库）—— 设计文档是**决策依据**而非**项目产物**。
  `.docs/DESIGN.MD`（UI 设计）**已并入** `.design/`，设计文档不再分散在两处
- **`.alpha/manifest.json`**：移除 `docker/`，新增 `apps/` `assets/` `.design/` `monitoring/`
- **`.gitignore`**：本地协作层段（6 个目录）；`/logs/` `/data/` 改为 `/logs/*` `/data/*`；
  新增 `/apps/*/lib/`
- **`.prettierignore`**：忽略本机协作层与生成的品牌资产；移除 Docker 相关条目
- **`README.md`**、**`packages/README.md`**、**`profiles/README.md`**、
  **`docs/目录结构说明.md`**：按新边界重写
- **`.env.example`**：从 Python Web（Postgres/Redis/SMTP）模板重写为 Oblivion 变量集
- **`monitoring/`**：重写为 Oblivion 指标（设计书 §26.2）
- **`.github/workflows/ci.yml`**：恢复 `npm ci`（补了 lockfile），移除 docker job

### 修复

- **`monitoring/grafana-dashboard.json` 是非法 JSON**（含 `#` 注释），
  `prettier --check` 直接抛 SyntaxError，`npm run lint` 必然失败 → 注释移入 panel 的 `description`
- **各包 `exports.types` 指向不存在的文件** → 修正 `declarationDir`
- **`.gitignore` 的 `!/logs/.gitkeep` 是死规则**（Git 不能重新包含被排除父目录下的文件）
  → 改为 `/logs/*` + `!/logs/.gitkeep`
- **CI 首次运行即红**：`setup-node` 的 `cache: npm` 与 `npm ci` 都需要 lockfile，
  而仓库没有 → 补 `package-lock.json`（工作区 + 10 个外部依赖，integrity 完整），CI 5/5 转绿
- **品牌生成器在 Windows 写出 CRLF**，导致工作区与索引永久不一致 → 改为强制写 LF

### 发现（设计书勘误，详见 `.design/ERRATA-v4.0.1-draft.md`）

- §9.2 的 `cordis` / `cordis-plugin-loader` **缺 npm scope**，且 `cordis@4.0.4`
  在 npm 上不存在（`cordis` 的 latest 是 `4.0.0-rc.10`）；真实包名是 `@deepseek-ai/*`，
  且参考架构把 loader 放 `devDependencies` 而非 `peerDependencies`
- §11.3 的 telemetry `disabled` 表达式**语义取反** —— 变量未设置时遥测反而开启，
  与 §2.2「默认关闭」冲突
- §1.2 的「四道菱形光晕」在 70–80% 主体占比下**几何不可行** → 改为径向光晕并留痕

### 已知遗留

- 26 个包均为**契约骨架**，运行时实现按设计书 §18 路线图推进
- `apps/electron` **未纳入构建**（需 Electron 二进制，Phase 7 接入）
- `scripts/bump-version.ps1` 只同步根 `package.json`，不同步各能力包与 `registry.json`
  （漏改由测试兜底）
- `.design/ERRATA-v4.0.1-draft.md` 为 **Draft** 且**不入库**，待批准后并入 Baseline v4.0.1
- **仓库里没有架构文档**：设计书在 `.design/`（本机）。对外只有 README 与 `docs/` 的使用说明。
  要对外开放协作时，需把设计书重新并回仓库
