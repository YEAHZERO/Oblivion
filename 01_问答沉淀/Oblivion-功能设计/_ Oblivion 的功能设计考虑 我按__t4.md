# # Oblivion 的功能设计考虑 我按* · 轮 4

- 来源会话: `session-b7218394-e243-46e6-9baf-bad738d8a61b`

## 问题

<goal_round>
Objective: "# Oblivion 的功能设计考虑\r\n\r\n我按**六大类**整理，每一类都说明：**它是什么、为什么要这么设计、设计时权衡了什么**。全部从设计书 `architecture.md` v4.0.2 + UI 三份 + ERRATA 台账中提取。\r\n\r\n---\r\n\r\n## 一、核心认知功能（\"自学习\"三组件 + 反馈）\r\n\r\n这是 Oblivion 区别于普通 RAG 的根本。\r\n\r\n### 1.1 问答闭环（REQ-004~006）\r\n\r\n| 设计考虑 | 具体做法 | 为什么这么设计 |\r\n|---|---|---|\r\n| **问答即沉淀** | 每次问答完成后自动捕获「问题 + 答案 + 引用」 | 让知识库随使用自然生长，不用人工整理 |\r\n| **四层筛选** | L1 精确去重（SHA256）→ L2 语义去重（hybrid-search >0.85）→ L3 基础规则 → L4 价值评估 | 分层过滤：便宜的（哈希）先跑，贵的（LLM）后跑 |\r\n| **L3 阈值中文适配** | 从\"答案 <10 字\"改为\"**<5 字或仅含无意义词**\" | 中文一个字信息量大，\"用 pgvector\"（11 字符）其实是有效答案，原阈值会误杀 |\r\n| **L4 首版纯规则** | 不引入外部评估 API | 单机自用场景，用户即评估者；引入外部 API 增加依赖成本 |\r\n| **注入走 Manual** | `POST /knowledge/manual`，Markdown body | 路径确定、权限明确，与 `md_sync` 配合最好 |\r\n| **防回灌死循环（RISK-117）** | `source_type: qa_loop` 豁免标记，`qa_loop` 来源的知识跳过下一轮捕获 | 否则\"问答沉淀 → 注入知识库 → 又被捕获\"会无限循环 |\r\n\r\n### 1.2 思维激荡（REQ-014）\r\n\r\n| 设计考虑 | 具体做法 | 为什么这么设计 |\r\n|---|---|---|\r\n| **双模式触发** | 主动触发（单次提问后自动附加 1 个新视角）+ 深度触发（连续 ≥3 次追问同维度 → 生成 ≥3 候选） | 主动模式体现\"认知陪伴\"；深度模式在用户卡住时出手 |\r\n| **触发闸门精细** | 主动：会话 ≤3 次 + 问题 ≥10 字 + 必须有引用 | 防止无价值触发（如\"你好\"）、防止打扰 |\r\n| **四策略落地** | 时间拉伸 / 对立视角 / 角色扮演 / 边界测试 | 每种策略有明确的触发场景，不泛泛而谈 |\r\n| **必须可关闭（AC-020）** | 未加载插件即完全无开销 | 保底验收：用户有完全的控制权 |\r\n| **单会话上限** | `OBLIVION_MAX_STIMULATIONS_PER_SESSION=5` | 防噪音（RISK-019） |\r\n| **输出走流内事件** | `session:thinking` 事件 + `ext_think` 渲染，不混入主回答 | 参考 DSH 的 `thought` 事件先例，天然异步 |\r\n\r\n### 1.3 图谱生长（REQ-015）\r\n\r\n| 设计考虑 | 具体做法 | 为什么这么设计 |\r\n|---|---|---|\r\n| **共现建边** | 问答引用了哪些文档，这些文档两两建边 | 借鉴 KnowledgeX「问答即生长」 |\r\n| **权重规则精确** | 0.3 起步 / 每次共现 +0.05（cap 1.0）/ 30 天未更新 ×0.95 衰减 | 防权重膨胀；30 天衰减模拟知识遗忘 |\r\n| **双链写回** | `[[目标文档标题]]` 追加文末 | 与 Obsidian 语法兼容，可在 Obsidian 中直接打开 |\r\n| **首版不动 search.go** | 图增强检索后置 | 沉淀知识后上游混合检索天然能命中，\"图增强\"是锦上添花 |\r\n| **降级策略** | Neo4j 不可用 → 只写 `oblivion_cooccurrence_edges` 快照表，MD 双链不写 | 主问答链路零影响 |\r\n\r\n### 1.4 反馈画像（REQ-016）\r\n\r\n| 设计考虑 | 具体做法 | 为什么这么设计 |\r\n|---|---|---|\r\n| **三态评价** | 👍 / 👎 / ⏺ | 不评价即中性，用户不必被迫选择

> （已截断，原长 23527 字符；问题全文见会话原始日志）

## 回答

Now I'll implement the qa-loop. First let me check the existing test patterns and the knowledge service shape more carefully.

Now I'll implement the qa-loop. Let me write the full implementation:

Now let me update the web-handler to emit `session:complete` events, and update the qa-loop package.json:

Now let me update the qa-loop package.json to add `oblivion-session` as a peer dep (it's in the inject list), and update cli.ts to pass emit:

The issue is `ctx.emit` is typed strictly. I need to use `ctx.events.emit` directly with a cast. Let me fix both files:

Phase 5 问答闭环已完成。让我汇报进度并继续推进。

---

## Phase 5 完成：`oblivion-qa-loop`

**实现内容：**
- **L1 精确去重**：SHA256 哈希比对，<10ms（`node:crypto` 内置）
- **L2 语义去重**：首版无向量后端，跳过（留 `void config.semanticThreshold` 占位）
- **L3 规则过滤**：答案 <5 字 / `不知道`等拒绝模式 / 纯寒暄（`嗯嗯，好的` 式多词匹配）
- **L4 价值评估**：`^好的?$` / `^收到?$` / `^嗯+$` 等低价值正则（防御性保险，实际被 L3 先拦截）
- **RISK-117 防回灌**：注入时打 `source_type: qa_loop` 标记，in-memory `seenHashes` 跨会话去重
- **事件链路**：`chat/send` → `session:complete` → qa-loop → `knowledge:created`

**门禁**：901 → **912 条全绿**（+11 条 qa-loop 专用测试）

**变更文件：**
- `packages/oblivion-qa-loop/src/index.ts` — 完整实现（270 行）
- `packages/oblivion-core/src/web-handlers.ts` — 新增 `emit` 参数 + `session:complete` 发射
- `packages/oblivion-core/src/cli.ts` — 透传 `emit`
- `tests/unit/qa-loop.test.mjs` — 11 条测试
- `registry.json` — `implemented: true`

---

## 下一步选项

| # | 方向 | 工作量 |
|---|---|---|
| **1** | **Phase 6 `graph-growth`** — 共现建边 + 双链写回 MD | ~200 行 |
| **2** | **4c 剩余四项** — Menu / HoverCard / SettingsForm / DOM 工具 | ~300 行 |
| **3** | **MarkdownText** — 消费 4a 已落地的 102 个 markdown 令牌 | ~400 行 |
| **4** | **提交当前工作区** — 912 绿，干净 checkpoint | 1 步 |

要继续哪个方向？

- 涉及工具: `edit`, `glob`, `grep`, `pwsh`, `read`, `todo_write`, `write`

---