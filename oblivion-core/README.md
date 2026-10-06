# @oblivion/core

Oblivion 认知插件组的**内核插件**。一个包，六个模块，JSON 文件存储，`turn/end` 单触发，防回灌，无定时任务。
它不 Fork DSH，只补 DSH 没有的认知层。

| 维度 | 值 |
| --- | --- |
| 版本 | 0.1.1 |
| 形态 | Cordis object 插件（Host 侧，无浏览器半边） |
| 注入 | `tools`、`systemPrompt` |
| 触发 | `session/event` → `turn/end`（幂等键 = sessionId + turn） |
| 存储 | `<dataRoot>/*.json` + `conflicts/`，笔记按分类落 `<mdRoot>/01_问答沉淀/*.md`（DEC-029） |
| 依赖 | 运行时只用 node 内置 + `@deepseek-ai/dsh-tools`（Host 提供） |
| 无 | SQLite / 向量切分 / cron / Worker / setInterval / MutationObserver |

## 一、六个模块

| 模块 | 职责 | 落盘 |
| --- | --- | --- |
| `knowledge` | 存储、检索、四层筛选、冲突记录 | `<dataRoot>/<id>.json`、`conflicts/` |
| `qa-loop` | 捕获 Q/A，串联全流程 | 笔记 `<mdRoot>/01_问答沉淀/<topic>.md`（同名外来笔记改写 `-oblivion.md`） |
| `perspective` | 风格感知、维度追踪、激荡生成 | 内存队列（下一轮注入） |
| `feedback` | 👍/👎/⏺ 捕获与画像微调 | `<dataRoot>/feedback.json` |
| `graph` | 共现建边、惰性衰减 | `<dataRoot>/graph.json`、`graph-events.json` |
| `profile` | 用户思维档案 | `<dataRoot>/profile.json`（**不在 KB 目录**） |

数据流：`turn/end` → 提取 Q/A → 四层筛选（精确去重 → 重合度 → 规则 → 价值）→ 写 JSON + 落 MD → 建共现边 → 更新档案 → 排队下一轮的「🧭 扩展思考」。

## 二、快速开始

```powershell
# 运行时（不要求系统装 Node/pnpm）
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"

cd C:\Projects\Oblivion
& $node $pnpm install          # 工作区依赖只存一份
& $node $pnpm -C oblivion-core run build
& $node $pnpm -C oblivion-core run typecheck
& $node $pnpm -C oblivion-core run test       # 12 项，测 lib/ 产物
& $node $pnpm -C oblivion-core run selfcheck  # 11 项，端到端 + 纯函数行为
```

`selfcheck` 是本机唯一能自证的验收面（原因见第五节）：它会在临时目录里真跑一遍
`turn/end → 捕获 → JSON + MD 落盘 → 幂等 → 去重 → 防回灌`，不碰你的真实数据。

## 三、安装与激活

本机 Creator Mode+ 的 MCP 工具面走不通（claim 依赖 POSIX `ps -o lstart=`），
但 **CLI 的 `check` 与「profile 补丁插入行」这条路径是好的**（`@oblivion/vimc` 就是这么挂的）。

```powershell
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
$dshx = 'C:\Projects\deepseek-harness\tools\dshx'
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

# ① 静态检查（CLI 直跑，不经 claim）
& $node --import "file:///$($dshx -replace '\\','/')/node_modules/tsx/dist/esm/index.mjs" `
     "$dshx\src\cli.ts" check 'C:\Projects\Oblivion\oblivion-core' --harness 'C:\Projects\deepseek-harness'

# ② 装链接（正斜杠！反斜杠会被桌面包管理器拒掉）
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-core'

# ③ 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾追加（@ 开头必须加引号）：
#     - insert:
#         - id: '@oblivion/core'
#           name: '@oblivion/core'
```

profile 补丁层**被监视**：落盘同一秒新行就会被 Host 装载，**不需要重启 App**。

| 目的 | 做法 |
| --- | --- |
| 临时停用 | 同一 patch 里给本 id 加 `disabled: true` |
| 彻底卸载 | 删掉那段 `insert`，再 `& $dsh plugin --profile desktop remove @oblivion/core` |

> **本包刻意不声明 `dsh.bundle`**：有 `dsh.bundle` = 走 profile 的 bundle 层（改一次要重启），
> 没有 = 普通依赖 + profile 插入行（可热挂）。认知层要频繁迭代，所以选后者。
> `test/core.test.mjs` 有一条断言锁住这个决定。

## 四、模型面工具与使用

自动沉淀不需要你操作：一问一答结束（`turn/end`）就自动走全流程。下面五个工具用于显式操作。

| 工具 | 用法 | 说明 |
| --- | --- | --- |
| `oblivion_capture` | `question` / `answer` / `sources[]` / `topic_hint` | 手动沉淀一条；返回 `action`（created/appended/duplicate/conflict/ignored）与 `reason` |
| `oblivion_query` | `query` / `limit` | 检索知识库，返回条目 + 来源 |
| `oblivion_profile` | `action: read\|update`、`signal` | 读/改思维档案（读是唯一会把档案返回给模型的入口） |
| `oblivion_feedback` | `target` / `signal: 1\|-1\|0` / `context` | 对某维度表态：`0` 只记录、永不微调；同向累积到阈值才调 |
| `oblivion_graph_neighbors` | `id` / `limit` | 查某实体的共现邻居（权重读取时惰性衰减） |

典型用法：

```
oblivion_query  "FTS5 倒排 关键词"        # 先查有没有沉淀过
oblivion_capture question=… answer=… sources=["https://…"] topic_hint="DSH"
oblivion_graph_neighbors cordis
oblivion_profile action=read
oblivion_feedback target=cost signal=-1    # 同一维度连点 2 次后不再提示它
```

## 五、与设计书的必要偏离（都经真实 API 核对或实测）

| # | 设计书 | 实际 | 处理 |
| --- | --- | --- | --- |
| 1 | `systemPrompt.section({ order, content })` | 真实字段是 `{ name, order, text }`，且要包在 `ctx.effect()` 里；`order` 走 `getSectionOrder('NAME')` | 按真实 API 实现 |
| 2 | 幂等用 `event.turnId` | 事件里**没有** `turnId`，turn 号在 `event.data.turn` | 幂等键 = `sessionId + event.data.turn` |
| 3 | 防回灌判 `qa.source_type === 'qa_loop'` | 会话事件里没有该字段 | 改为判 `sources[].type === 'qa_loop'` / `ref` 前缀 |
| 4 | 语义去重与价值评估用 LLM（0.85 / 0.5） | `ctx.llm` 公开面只有 `registerAdapter` 等注册类方法；`llm.stream(request)` 需要完整 provider/model 请求体 | 先做**确定性**实现（token Jaccard + 规则打分），LLM 判定留成 `evaluate(ctx.llmScore)` 注入点 |
| 5 | `config: '~/.oblivion/data'` | Host 的 cwd 不可假定 | `expandHome()` 自己展开 `~` |
| 6 | 价值阈值 0.5 | **实测会让正常问答一律被丢弃**（真实 233 字技术回答只有 0.370） | 重标定为 **0.30**（`src/config.ts` 有实测分布注释） |
| 7 | `package.json` 的 `oblivion.bundle` | 工作区规范是 `dshx.yml` + `cordis.patch.yml`；且 `dsh.bundle` 会让激活变成需重启的 bundle 层 | 不声明 `dsh.bundle`，走可热挂路径 |
| 8 | 「订阅会话完成事件，读会话里的问答」 | **`session:complete` 不存在**（287 个官方包里 0 命中）；`eventsSnapshot` 是 private 字段，只在**已废弃**的 `snapshotEvents()` 里懒加载 → 直读它恒为 `undefined` | 订阅公开的 `session/event`，在**事件流里自累积本轮事件**（`turn/start` → 消息 → `turn/end`）；`eventsSnapshot` 仅作兜底 |
| 9 | `user/message` 就是用户提问 | 该事件还承载 `agent.inject()` 注入的上下文（文件变更通知 / 子目录 AGENTS.md / cron 通知…），靠 `source.kind` 区分 | 只把 `source.kind === 'user'` 当提问（形状未知时按真人处理，避免上游改形状后**静默不收**） |
| 10 | L3「含"不知道"→ 丢弃」、`minAnswerLength` 20 | 逐字实现会误杀正文提及（「不校验就不知道 Y」）；20 字等于把 L3 当价值闸门 | 「不知道」只在**回答开头 40 字内**判；`minAnswerLength` 回到设计书的 **5**，短而有的由 L4 价值层兜底 |

### 自检抓到的真实 bug（保留在注释里防止回退）

1. **首跑装载顺序**：`loadAll()` 若在 `init()` 之前跑，`dataRoot` 不存在时 `readdir` 失败会被静默当成「索引为空」。已在 `loadIndex()` 里改为先 `init()` 再 `loadAll()`。
2. **价值阈值 0.5 过高**：见上表第 6 条。原值会让插件「装好了但知识库永远为空，且不报错」。
3. **`eventsSnapshot` 恒为空（0.1.2 修）**：见上表第 8 条。症状与第 2 条一样是**静默不落盘**；
   更值得记住的是**旧自检也用了 `eventsSnapshot` 造数据**，所以「自检 11/11 全绿 + 真实知识库永远为空」同时成立。
   现在自检走的是真实事件流（`emitTurn()`），不会再出现「自检绕过真实链路」。

## 六、已知边界

1. **没有 LLM 判定**：语义去重是 token Jaccard + 否定翻转启发式，价值评估是确定性打分。等 `@deepseek-ai/dsh-llm` 的稳定调用面确认后再接（注入点已留好）。
2. **实体抽取是正则级的**：latin 标识符 + CJK 2–8 字串，没有 NER。共现图因此偏「词共现」而非「概念共现」。
3. **`@deepseek-ai/dsh-tools` 的解析有两条路径**（实测都成立且版本一致为 `0.2.0-rc.2`）：
   从插件目录加载会解析到工作区那份 `C:\Projects\Oblivion\node_modules\.pnpm\...`；
   Host 从 profile 加载会解析到宿主那份 `...\dsh\node_modules\@deepseek-ai\dsh-tools`。
   因此它同时放在 `devDependencies`（本地类型/解析）与 `peerDependencies`（运行时由 Host 提供），并标为 esbuild `external`。
4. **`profile.json` 的数组字段是追加去重、上限 40 条**：要剔除某维度得显式走 `user_override`。
   **反馈条目有 90 天保留期（§25.7）**：读取时惰性裁剪（不跑定时任务），裁剪结果直接落盘；裁剪次数见 `feedback.stats()`。
5. **`lib/index.js` 里的裸导入 `@deepseek-ai/dsh-tools`** 是唯一的外部依赖。若某天 Host 的模块解析不提供它，症状是插件装载即失败（缺依赖），而不是静默降级 —— 这是刻意的失败姿势。
6. **本机 Creator Mode+ 全链路不可用**：`dshx_check` / `scaffold` / `activate` / `hot_reload` 都先跑 `claim`，而 claim 依赖 POSIX `ps -o lstart=`。这四类操作请走 CLI 与 profile 补丁（第三节）。

## 七、目录结构

```
oblivion-core/
├── package.json          name / exports（含 ./testkit）/ peer 与 dev 的分工
├── dshx.yml              id / entry / marker / kind（与 package.json 的 name 逐字一致）
├── cordis.patch.yml      组合插入行声明（供手工追加到 profile 补丁）
├── tsconfig.json         strict + noEmit；只 include src
├── scripts/
│   ├── build.mjs         esbuild 双入口，框架包 external
│   ├── bump-version.mjs  VERSION ↔ package.json 同步（只加第三位；位置参数被拒）
│   └── selfcheck.mjs     端到端 + 纯函数自检（本机主验收面，17 项）
├── src/
│   ├── index.ts          apply()：装配六个模块 + 提示段落 + 工具面
│   ├── testkit.ts        纯函数子路径导出（自检/测试用，不污染插件契约）
│   ├── config.ts         Config + DEFAULT_CONFIG（含实测标定注释）
│   ├── prompt.ts         OBLIVION_SYSTEM_PROMPT
│   ├── core-types.ts     Cordis 的最小结构化类型（不 import 框架包）
│   ├── knowledge/        store / search / evaluate / filter / index
│   ├── qa-loop/          index / extract / md-writer
│   ├── perspective/      index / sensor / tracker / maker / adapter
│   ├── feedback/         index / tuner
│   ├── graph/            index / decay
│   ├── profile/          index / schema
│   └── util/             fs（无）/ hash / paths / time
├── test/core.test.mjs    12 项，测 lib/ 产物
└── lib/                  构建产物（index.js / testkit.js / VERSION）
```

## 八、验收状态

| 项 | 结果 |
| --- | --- |
| `pnpm run build` | ✅ `lib/index.js` 132,862 B + `lib/testkit.js`（v0.2.7） |
| `pnpm run typecheck` | ✅ 0 错误（strict） |
| `pnpm run test` | ✅ **34/34**（含「装载即建目录 + 自定义 mdRoot + 目录名消毒 + 9 工具注册 + 整理结构 + 改名打标签 + **双链单段化** + **双链按文件名** + **prune 清陈旧双链** + **主题页落盘/回链/重跑** + **`normalize-links.mjs` 巡检**」） |
| `pnpm run selfcheck` | ✅ **32/32**（真实事件流端到端落盘、幂等 ×2、注入上下文过滤、兜底路径、防回灌、L3 四条规则、F2/F3 闸门、F3 深度 ≥3 候选、F5 保留期、§25.3 分类落盘、共用知识库防误伤、装载即建目录、自定义知识库位置、目录名消毒、**判定留痕**、**oblivion_status 快照**、**调参建议边界**、**会话整理落盘**、**盲区修正（superseded + 00-Index）**、**冲突并列页**、**图谱双链**、**命名与打标签**、**关联知识单段化**、**双链按文件名**、**主题页**） |
| `pnpm run check:version` | ✅ `0.2.7` 一致 |
| `dshx check`（CLI） | ✅ manifest / object-form / boot-marker 全绿 |
| `pnpm run verify:dsh`（根） | ✅ 契约 **8/8**（host / `tools`·`systemPrompt` / `session/event`·`turn/end` / `dsh-tools`·`dsh-system-prompt` / mount `dependencies`） |
| 真实 Host 装载 | ⏳ **仍未验证**：`agent/created` + `agents.list()` 两条作用域订阅已上线（v0.1.7/v0.1.8），但探针仍为空；v0.1.10 的 `mount-diag.json` 需要**重启一次 App** 才能上机 |

> ⚠️ **Host 侧改码必须重启 App**（2026-10-06 用四种手段实测确认）：只构建 lib / 重写补丁层 /
> 摘掉再插回补丁行 / `dsh plugin add` 同一 link **全部无效**；补丁层只负责**新行的首次装载**。
> 改 Host 半边 → `build` → 重启；改浏览器半边 → `build` → 硬刷新页面。

## 九、使用方法（速查）

### 9.1 装与激活（一次性）

```powershell
$dsh  = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
$core = 'C:\Projects\Oblivion\oblivion-core'

# ① 构建（Host 侧改动后必做；改代码后要重启 App 才生效）
& $node $pnpm -C $core run build
& $node $pnpm -C $core run selfcheck      # 想先确认逻辑没问题

# ② 装链接（正斜杠！反斜杠会被桌面包管理器的目标校验拒掉）
& $dsh plugin --profile desktop add "link:$($core -replace '\\','/')"
```

```yaml
# ③ 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾追加（@ 开头必须加引号）
- insert:
    - id: '@oblivion/core'
      name: '@oblivion/core'
```

profile 补丁层被监视、落盘即装载（**无需重启**）；但 **Host 侧 JS 代码只有在 App 重启后才会重新导入** ——
捕获链路的修复与「装载即建目录」都是 Host 侧代码，改完请**重启一次 DSH Desktop**。

### 9.2 验证闭环（一问一答 → 自动沉淀）

**先看目录是否就位**：`mdRoot` 一经配置，插件**装载时就会自动创建**知识库根与全部分类目录
（`01_问答沉淀\`、`00_导入文件\`、`02_Wiki页面\`、`03_创作产物\`、`99_其他\`）—— 不必等第一次落盘：

```powershell
Get-ChildItem 'C:\Library\那些渐渐被遗忘' -Directory       # 期望看到 01_问答沉淀 等 5 个目录
```

然后**在会话里正常问一句**（≥10 字、有实质回答），再查落盘：

```powershell
Get-ChildItem "$env:USERPROFILE\.oblivion\data"            # 期望出现 ts-*.json（知识条目）
Get-ChildItem 'C:\Library\那些渐渐被遗忘\01_问答沉淀'        # 期望出现 <主题>.md（笔记）
Get-Content   "$env:USERPROFILE\.oblivion\data\profile.json" -ErrorAction SilentlyContinue
```

出现 `ts-*.json` + `01_问答沉淀\*.md` = `turn/end → 捕获 → 落盘` 整条链通了。
**在此之前只应声称 `SOURCE_BUILT`，不要声称 `RUNTIME_VERIFIED`。**

例：把知识库换到别处（并让它自动建好分类目录）：

```yaml
- insert:
    - id: '@oblivion/core'
      name: '@oblivion/core'
      config:
        mdRoot: 'D:/Knowledge/OblivionKB'      # 自定义位置；装载时自动创建该根 + 01_问答沉淀 等
        dataRoot: '~/.oblivion/data'
```

### 9.3 用九个模型面工具

| 工具 | 用途 | 例 |
| --- | --- | --- |
| `oblivion_digest` | **整理当前对话**：模型产出结构（章节/决策/待办/未决/双链），插件落成**一篇整理笔记 + 一条可检索条目**（并建共现边） | 「整理一下当前对话」 |
| `oblivion_retitle` | **给沉淀件改名打标签**：先给候选（现名/原问句/答案摘要），模型起内容名 + 标签，插件改名并同步条目与索引 | 「把这些笔记的名字改成讲什么」 |
| `oblivion_wiki` | **把同一主题的笔记合成一页主题页**：先给候选（现名/原问句/状态/已属哪页），模型判簇 + 写概述，插件落 `02_Wiki页面/` 并在成员笔记里留一行回链 | 「把讲 cordis 作用域的笔记合成一页」 |
| `oblivion_status` | **观测与调参入口**：生效配置 + 真实统计 + 「该改哪个键」建议 + 最近判定 | 「这几天的捕获率多少？该调什么？」 |
| `oblivion_query` | 关键词 + 共现扩展检索，带来源 | 「库里关于 cordis 注入的记录」 |
| `oblivion_capture` | 手工沉淀一条问答（走同一套四层筛选） | 把一段读书笔记沉淀成条目 |
| `oblivion_profile` | 读/改思维档案（`user_override` 优先） | 查当前风格画像 |
| `oblivion_feedback` | 对某个视角记 👍/👎/⏺（累积 3 条同向才微调） | 标记「risk 维度有用」 |
| `oblivion_graph_neighbors` | 查某实体的共现邻居（带惰性衰减后的有效权重） | 查 `cordis` 的邻居 |

#### 9.3.1 整理当前对话（`oblivion_digest`）

**分工**：**模型负责读懂并产出结构**（它本来就把整场对话握在上下文里，是天然的摘要器），
**插件负责落成两样东西** —— 一篇人读的整理笔记 `04_会话整理/<日期>-<标题>.md`，
以及一条可被 `oblivion_query` 检索、能进共现图的条目。所以这个工具**不把历史重放给插件**，
也**不走四层筛选**（用户点名要沉淀的内容不该被 L3/L4 拦掉，走 `knowledge.saveStructured()` 直写）。

结构固定成：**章节（heading + body）** / **决策** / **待办** / **未决问题** / **关联知识（`[[…]]` 双链）**
—— 模型不必猜格式，人也能一眼扫完。触发方式就是在对话里说一句：

> 「整理一下当前对话」「把这次讨论整理成一篇笔记」

#### 9.3.2 给沉淀件改名打标签（`oblivion_retitle`）

管线里的命名规则（`src/knowledge/naming.ts`）是**纯字符串**的：答案里有小标题就取小标题，
否则是「去掉水词的整句问句」。所以散文式答案的名字仍然像问题 —— 真摘要只能由模型给。
`oblivion_retitle` 就是这条路，分工与整理件完全一致：**模型起名，插件落盘**。

两段式，一次对话里自洽：

1. **不带 `items` 调一次** → 返回候选（按修改时间倒序，只含我们自己的笔记）：
   `id` / 现文件名 / `topic` / **原问句**（老笔记回退到 `title`）/ 答案摘要（前 80 字）。
2. **带 `items` 再调一次** → `[{ id, title, tags }]`，插件：改文件名（重名自动 `-2`）、
   改正文 `# H1` 与 frontmatter 的 `title`/`tags`、**把原问句留在 `ask:` 与 `>Ask：`**、
   同步条目 `<dataRoot>/<id>.json`、重建 `00-Index/索引.md`。

三条不变量：只动带 `<!-- oblivion:id=… -->` 的笔记（用户自有的 md 一个字不改）；
改名不丢信息（原问句进 `ask`）；改名必须同步条目 JSON（落盘路径是按名字算的，
只改文件名不同步条目，下一次同条目写入会按旧名再起一份）。

模型起的名会写 frontmatter `named_by: "model"`，**规则管线看到就让路**：`rename-notes.mjs`
跳过这类笔记（要强行覆盖用 `--force`）—— 否则下一次回填会把内容名重新算回
「去水词后的整句问句」，等于把模型的工作抹掉。文件名另有一层保护：首尾的点与空白会被清掉，
因为以 `.` 开头的笔记会被 `listNotes()` 跳过（面板与工具都看不见它）。

存量回填用同一套读写逻辑，走脚本（默认 dry-run）：

```powershell
node scripts/rename-notes.mjs --dirs 01_问答沉淀                  # 先看计划
node scripts/rename-notes.mjs --dirs 01_问答沉淀 --apply          # 落地 + 重建索引
node scripts/rename-notes.mjs --dirs 01_问答沉淀 --apply --clean-tmp --tmp-age-min 2   # 顺手清临时文件
```

`--clean-tmp` 只删**早于 `--tmp-age-min` 分钟**的 `*.tmp`（默认 10），避免删掉正在写的那一个。

#### 9.3.3 合成主题页（`oblivion_wiki`）

条目上的 `topic` 字段**不是主题**：它只是问句里第一个词串（`deriveTopic()`），
实测 56 篇沉淀正好落在 55 个 topic 上 —— 靠字段自动合并等于合不出东西。
所以「哪些笔记在讲同一件事、该怎么概述」只能由**模型**判；插件只负责落盘、回链、重建索引
（分工与 `oblivion_digest` / `oblivion_retitle` 完全一致，插件不调 LLM）。

两段式：

1. **不带 `clusters` 调一次** → 候选：`id` / 现文件名 / `title` / **原问句** / `status` /
   `tags` / 已属哪个主题页 / 答案摘要；另有 `pages`（现有主题页与成员数）。
2. **带 `clusters` 再调一次** → `[{ title, summary, members: [id…], tags? }]`，插件为每个簇：
   落一页 `<mdRoot>/02_Wiki页面/<标题>.md`（frontmatter + `# 标题` + `>Members` +
   `## 概述`（模型的 `summary`）+ `## 来源笔记`（双链到每篇成员，`superseded`/`conflict`
   等状态会就地标注）+ 有非 active 成员时再加 `## 口径提示` + `## 标签` + 尾标
   `<!-- oblivion:wiki title=… members=… at=… -->`），再往每篇成员笔记的元信息块插一行
   `> Wiki： [[主题页文件名]]`（双向可追溯：页面能下去，笔记能上来）。

**双链一律指向文件名，不指向标题**：`[[X]]` 在 Obsidian 里按**文件名**解析，而文件名要消毒
（`safeName()` 把 `:` `/` 换成 `_`）—— 用标题当链接就会点出「未创建的笔记」
（现场出现过 `[[清理死进程残留 + cordis:group 形状核对]]`）。所以页面里的成员链接取
`linkTargetOf(member)` = 落盘文件名去掉 `.md`，笔记里的回链取 `apply()` 落下的那个文件名。

三条不变量：只动带 `<!-- oblivion:id=… -->` 的笔记；**主题页是新增物**，成员笔记的正文一个字不改
（只在元信息行后插一行）；重跑同一簇 = **更新那一页**（认尾标，不会长出 `<标题>-2.md`），
已指过的回链不重复写。用户自有的同名 md 会让路成 `<标题>-oblivion.md`。空标题、
或成员 id 一个都不认识时不写空文件，直接回 `error`。

#### 9.3.4 关联知识不再堆重复段（`appendRelatedLinks`）

老行为是每写一批双链就**追加一段** `## 关联知识（自动）`：现场见过同一篇笔记堆到 **26 段**，
里面还混着 `[[OK]]`、`[[继续]]` 这种被连进来的弱标题。现在：把所有同名段落合成**一段**、
链接去重、丢掉 `isWeakTitle()` 判定的弱标题（`findRelatedItems()` 的候选池也一起过滤）、
上限 30 条；内容没有变化时直接返回 `false` **不写盘**（幂等 —— 重试与重跑不会把笔记改出 diff）。
写出去之前，链接文本统一过一遍 `safeName()`（`safeName` 已导出）—— 于是**按文件名解析**，
且「从文件里读出的旧链接」与「新链接」在归一化之后能正确去重。

**链向真实存在的笔记**：候选来自**条目**（`findRelatedItems()` 拿 `item.title`），而条目 `title`
会被改名回填改掉 ⇒ 只用 `notePathFor()` 找得到笔记的条目做双链，找不到就不连。
现场实测（v0.2.6 前）：56 篇笔记里 513 条双链只有 35 条能对上文件 —— 全是"条目名改过、链接没跟着改"
留下的。维护时用 `appendRelatedLinks(path, titles, { prune: true })` **重建**该段
（丢掉不在 `titles` 里的旧链接；`titles` 为空则把段整个去掉）；重建后现场剩 381 条、全部可解析、
复跑写盘 0 篇。

整库巡检与就地修好（幂等，可随时重跑）：

```bash
node scripts/normalize-links.mjs                                    # 干跑：只打印「段 N → 1 / 链接 X → Y」
node scripts/normalize-links.mjs --apply                            # 执行（并段 + 丢悬空 + 丢弱标题）
node scripts/normalize-links.mjs --json                             # 结构化报告（含整库复核 audit）
node scripts/normalize-links.mjs --root "D:/我的库" --dirs "01_问答沉淀,02_Wiki页面"
```

它扫 `--root`（默认 `C:/Library/那些渐渐被遗忘`）下 `--dirs`（默认 `01_问答沉淀,02_Wiki页面`）里
**带 `oblivion:` 标记**的笔记，只保留「文件真的在盘上」的链接，末尾复核多段数 / 悬空数 / 弱标题数。
现场（2026-10-06）复核：多段笔记 0 篇、悬空链接 0 条、相关链接 388 条。

### 9.4 调参（改 config，不写代码）

`cordis.patch.yml` 里补 `config:`（**整段替换**，缺省键由 `resolveConfig` 补默认）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `dataRoot` / `mdRoot` | `~/.oblivion/data` / **`C:/Library/那些渐渐被遗忘`** | JSON 存储 / 笔记落盘根。**`mdRoot` 可自由自定义**（绝对路径或 `~/` 写法都行）；**一经配置，装载时就自动创建**该根与全部分类目录 |
| `mdClassify` | `session`·`qa_loop` → `01_问答沉淀`、`doc` → `00_导入文件`、`wiki` → `02_Wiki页面`、`content_creator` → `03_创作产物` | 来源类型 → 子目录；未命中落 `99_其他/`（§25.3）。目录名会**消毒**（去掉 `..`／盘符／非法字符），不会逃出 `mdRoot` |
| `valueThreshold` | `0.3` | L4 价值闸门；**勿改回 0.5**（会让一切被丢弃） |
| `enablePerspective` / `enableFeedback` | `true` | 认知陪伴 / 反馈微调开关 |
| `perspectiveActiveSessionMax` | `3` | §25.4 主动触发只在最早 3 个会话 |
| `perspectiveMinQuestionLength` | `10` | §25.4 问题长度闸门 |
| `perspectiveDeepTriggerRepeats` | `3` | §25.4 连续同维度几次算深度触发 |
| `perspectiveDeepMinCandidates` | `3` | 深度触发至少给几个候选视角 |
| `perspectiveDeepSessionMax` | `5` | 单会话激荡次数上限 |
| `feedbackRetentionDays` | `90` | §25.7 反馈保留期（读取时惰性裁剪） |
| `enableStats` | `true` | 判定留痕开关（关掉就没有统计，也就没法调参） |
| `statsRetentionDays` / `statsMaxEntries` / `statusRecentLimit` | `90` / `5000` / `20` | 留痕保留期（读取时惰性裁剪）、最多几条、`oblivion_status` 默认返回几条 |
| `graphInitialWeight` / `graphReinforceDelta` / `graphWeightCap` / `graphDecayBase` / `graphDecayPeriodDays` | `0.3` / `0.05` / `1.0` / `0.95` / `30` | §25.6 共现图权重规则 |

### 9.5 观测与调参（先跑够几天，再动阈值）

**留在磁盘上的三样东西**（都在 `dataRoot`）：

| 文件 | 内容 |
| --- | --- |
| `decisions.jsonl` | **判定留痕**：一轮一行 —— `action` / `pass` / `reason` / `score` / 问题与答案字数 / 判定耗时。含被拦下的轮次（AC-008）与「本轮没有问答」的 `no-qa` |
| `status.json` | **装载快照**：生效配置 + 现有统计 + 调参建议（每次装载刷新） |
| `profile.json` / `<ts-*>.json` / `feedback.json` / `graph*.json` | 档案 / 知识条目 / 反馈 / 共现图 |

**在会话里问模型即可**（它会调 `oblivion_status`）：

> 「看一下 oblivion 的捕获率，这几天都拦下了什么，我该调哪个参数？」

返回的是三件东西：① **生效配置全清单**（31 个键 —— 这就是「需要修改的参数」）；② 统计（捕获率、被谁拦下、价值分 p50/p90、
`no-qa` 占比）；③ **建议**（`{key, current, suggested, why}` —— 例如「valueThreshold 0.3 → 0.25，因为捕获率 0.03 且 78% 被价值层拦下」）。

**调参闭环**：`oblivion_status` 看建议 → 改 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 的 `config:` →
**落盘即生效**（补丁层被监视，改 config 不需要重启 App；只有改 JS 代码才要重启）→ 过几天再看一次。

**建议的两个边界**（避免拿三四轮数据瞎调）：样本 <20 个可评估轮**不开口**；「完全重复」占比高时**明确告诉你不用调**。

### 9.6 故障排查

| 症状 | 先查 | 常见原因 |
| --- | --- | --- |
| 知识库永远为空 | App 是否重启过 | Host 侧代码改了没重启（ESM 缓存）；或 `~/.oblivion/data` 权限 |
| 空且日志有 `turn/end 时没有任何可读事件` | —— | 自累积与兜底都拿不到事件（上游事件形状变了）：按第 9.1 节重装并在 README 第五节登记 |
| 条目很少 | `dataRoot` 里被忽略的条目 | L3/L4 闸门拦下：`valueThreshold` 0.3、答案 <5 字、纯寒暄/不知道/无意义词 |
| 想让某维度别再提示 | `feedback` 记两次 👎 | 被拒绝 ≥2 次的维度不再提示（写进 `resistant_dimensions`） |
| 想重置画像 | 删 `~/.oblivion/data/profile.json` | 档案在 `dataRoot`（**不在** KB 目录，避免随笔记外泄） |