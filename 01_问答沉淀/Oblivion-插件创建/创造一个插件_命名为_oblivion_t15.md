# 创造一个插件（命名为@oblivion · 轮 15

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

core 走热挂（落盘即装载）
文档为C:\Library\那些渐渐被遗忘。内部按 01_问答沉淀/ 分类
如下是最新的：# @oblivion/core 设计书

## 结论

`@oblivion/core` 是 Oblivion 认知插件组的内核插件：**一个包，六个模块，JSON 文件存储，`turn/end` 单触发，防回灌，无定时任务。** 它不 Fork DSH，只补 DSH 没有的认知层。

---

## 一、设计目标与边界

### 目标

| # | 目标 |
|---|---|
| 1 | 问答即生长：每次问答自动筛选、沉淀、建边 |
| 2 | 认知陪伴：理解用户风格，在合适时机提供扩展视角 |
| 3 | 可溯源：所有知识条带来源，所有冲突保留不合并 |
| 4 | 零侵入：不阻塞主问答链路，不引入后台任务 |

### 边界（明确不做）

| 不做 | 原因 |
|---|---|
| 不 Fork DSH | DEC-024 |
| 不造 LLM/会话/工具/UI | DSH 已有 |
| 不引入 SQLite | 沿用现有 JSON 文件存储 |
| 不引入向量切片 | FTS5 关键词 + 共现图替代 |
| 不跑 cron / Worker | 时间逻辑惰性计算 |
| 不做实时画像微调 | 累积触发，防过拟合 |
| 不做全局知识图谱 | 只做局部共现边 |

### 依赖

```yaml
inject: ['tools', 'llm', 'systemPrompt', 'session']
```

---

## 二、模块设计

### 模块总览

| 模块 | 职责 | 关键接口 |
|---|---|---|
| `knowledge` | 存储、检索、四层筛选、冲突记录 | `capture / query / evaluate / inject` |
| `qa-loop` | 捕获 Q/A，串联全流程 | `registerQaLoop` |
| `perspective` | 风格感知、维度追踪、激荡生成 | `registerPerspective` |
| `feedback` | 👍/👎/⏺ 捕获与画像微调 | `registerFeedback` |
| `graph` | 共现建边、惰性衰减、双链 | `recordCooccurrence / effectiveWeight` |
| `profile` | 用户思维档案读写 | `read / update / updateFromQA` |

### 数据流

```text
turn/end
  │
  ▼
qa-loop.extractQAPair
  │
  ▼
knowledge.exactDuplicate ──重复──▶ 丢弃
  │
  ▼
knowledge.semanticSimilar
  ├─ duplicate ──▶ 仅补来源
  ├─ conflict  ──▶ 写入 conflicts/
  └─ new
  │
  ▼
knowledge.evaluate ──低分──▶ 丢弃
  │
  ▼
knowledge.inject ──▶ 写 JSON + 落 MD
  │
  ▼
graph.recordCooccurrence ──▶ 建边/强化
  │
  ▼
profile.updateFromQA ──▶ 更新档案
  │
  ▼
perspective.generate（异步，不阻塞）
  │
  ▼
systemPrompt.section ──▶ 下一轮生效
```

### 1. `knowledge`

| 项 | 设计 |
|---|---|
| 存储 | `<dataRoot>/<id>.json`，`id` 时间戳前缀 |
| 索引 | 内存构建关键词倒排，启动时加载 |
| 检索 | 关键词匹配 → 共现图扩展，返回带来源 |
| 冲突 | 与旧条目矛盾 → 写 `conflicts/<id>.json`，双版本保留 |
| 精确去重 | 规范化文本 hash + 来源 hash |
| 语义去重 | 关键词重合 + LLM 判定（阈值 0.85） |
| 价值评估 | LLM 打分 0–1，< 0.5 丢弃 |

### 2. `qa-loop`

| 项 | 设计 |
|---|---|
| 触发 | `ctx.on('session/eve

> （已截断，原长 20693 字符；问题全文见会话原始日志）

## 回答

收到三条裁定：**core 保持热挂**、**文档根 = `C:\Library\那些渐渐被遗忘`**、**内部按 `01_问答沉淀/` 分类**。先看现有实现里要改的两处（落盘路径与图溯源）：

裁定已收到。先把**落盘路径与分类**落进实现（`mdRoot` = 你的知识库根，内部 `01_问答沉淀/`）：

19/19 全绿（新增分类落盘与防误伤两项）。递增版本并把**你给的最新设计书**存进仓库：

⚠️ 抓到一个错：`DEC-025` 在设计书里**已被占用**（品牌让位机制）。查现有 DEC 编号并重编我的两条决策：

三条裁定都已落地（代码 + 文档），提交 `698d992` 已推送。

## 一、按你的裁定做了什么

| 裁定 | 落地 |
| --- | --- |
| **core 走热挂** | 记为 **DEC-028**（设计书 §22 DEC 表 + §33.6）。**不声明 `dsh.bundle`**，继续用 profile 的 insert 行 → 改 config 落盘即生效。代价（换机器/重置 profile 静默失效 = DSH-COMPAT **R1**）由你接受，缓解措施随包提交：安装片段写进 `oblivion-core/cordis.patch.yml` 与 README §9.1，且 `pnpm run verify:dsh` 的 `mount profile.dependencies` 断言会在装载缺失时报 FAIL |
| **文档根 = `C:\Library\那些渐渐被遗忘`** | 记为 **DEC-029**。`config.mdRoot` 默认由 `~/OblivionKB` 改为该路径；**不再单开 `oblivion_docs/`**（§12.12 / §25.3 已标注被取代） |
| **内部按 `01_问答沉淀/` 分类** | 新增 `config.mdClassify`（来源类型 → 子目录）：`session`·`qa_loop` → **`01_问答沉淀`**、`doc` → `00_导入文件`、`wiki` → `02_Wiki页面`、`content_creator` → `03_创作产物`，未命中 → `99_其他`（§25.3 兜底） |

**实测你的知识库根已在位**：`C:\Library\那些渐渐被遗忘` 存在（含 `_kb`、`08-计算机知识`、`09-编程`、`61-AI Tech` …）；`01_问答沉淀\` **尚未创建** —— 插件首次落盘时按需创建。

## 二、改代码时顺手加的一道保险

你的知识库是**既有资产**，同名文件很可能是你自己的笔记，所以加了 **防误伤**：

> 目标文件已存在且**不含 `oblivion:` 标记** → 判定为你的笔记，**不追加、不改写**，改写 `<topic>-oblivion.md`。

自检里有一条用例专门守这个行为（先放一份「不要动我」的同名笔记，再落盘，断言原文件逐字未变）。

## 三、闸门（全绿）

```
core:  build ✅ v0.1.3 · typecheck ✅ · test 12/12 ✅ · selfcheck 19/19 ✅ · check:version 0.1.3 ✅
工作区 pnpm run check → 全部通过（compat: brand 10/10 · core 8/8 · vimc 6/6；vimc test 42/42）
```

新增两项自检：**§25.3 分类落盘**（问答沉淀 → `01_问答沉淀/`，未知来源 → `99_其他/`）与**共用知识库防误伤**。

## 四、你给的最新设计书已入库

存为 **[`.design/core-认知内核.md`](C:\Projects\Oblivion\.design\core-认知内核.md)**（507 行，原文保留），文末附**现状对账**。对账时发现：

| 类别 | 内容 |
| --- | --- |
| 已落地 | 六模块齐全（含你要求的 5 个工具、四层筛选、图谱权重与时钟保护、档案 `user_override`、90 天惰性保留） |
| **偏差 10 条** | ①`systemPrompt.section` 真实字段是 `{name,order,text}` + 需 `ctx.effect()`；②无 `event.turnId`（用 `data.turn`）；③落盘位置（本次按你裁定改）；④价值阈值 **0.5 → 0.30**（0.5 会让正常问答全被丢弃）；⑤无 `source_type` 字段；⑥`inject` 只留 `tools`+`systemPrompt`（无 `llm`/`session`）；⑦`lib/` + 不声明 bundle；⑧LLM 判定未接（确定性实现）；⑨**不能读 `eventsSnapshot`**（private + 已废弃 → 改为自累积事件流）；⑩`perspective` 的「与旧结论冲突」触发未接 |
| **未做 3 项** | ① **双链写回**（`graph/backlink.ts` 不存在，MD 文末 `[[条目]]` 未做）；② **冲突/对立视角生成**（`maker` 定义了 `counter-view`/`conflict` 但只产出 `missing-dimension`/`unexplored`/`to-verify`）；③ **非阻塞量化验收**（100 次 capture 首字延迟 <5%，需真机测量） |

顺带纠了一个编号冲突：我最初写的 DEC-025/026 **与设计书既有的「品牌让位机制」「版本凭据」撞号**，已重编为 **DEC-028/029**，既有的两条未动。

## 五、还差最后一步验证（需要你）

```
1) 重启 DSH Desktop（Host 侧 JS 改动只有重启才重新导入）
2) 在会话里正常问一句（≥10 字、有实质回答）
3) 查：
   Get-ChildItem "$env:USERPROFILE\.oblivion\data"          # 期望 ts-*.json
   Get-ChildItem 'C:\Library\那些渐渐被遗忘\01_问答沉淀'      # 期望 <主题>.md
```

出现两边的文件 = `turn/end → 捕获 → 落盘` 整条链通了（在那之前只声称 `SOURCE_BUILT`，不声称 `RUNTIME_VERIFIED`）。

**仍待你裁定**（设计书 §33.5 ③④⑤）：Phase 2 与已有 knowledge 模块的划界（并入式 / 拆分式）、Phase 6·7 去留、DSH-COMPAT 是否升格为设计书正式机制。

- 涉及工具: `edit`, `grep`, `pwsh`, `read`, `write`

---