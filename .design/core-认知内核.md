# @oblivion/core 设计书

> **这是 `@oblivion/core` 的最新设计书**（2026-10-06 由所有者提供，取代 `.design/ARCHITECTURE.MD` §12.1–§12.6 / §25.1–§25.7 中关于 core 的分散描述）。
>
> **实现现状**：`oblivion-core` **v0.1.3**（`object` 形态 / Host 侧）。落地与偏差见文末 **§十 现状对账**；
> 计划与缺口的统一对账入口仍是 [`.design/ARCHITECTURE.MD` §33](ARCHITECTURE.MD)。

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

> **实现口径**：真实只 `inject: ['tools', 'systemPrompt']`，`session` 通过公开的 `session/event` 事件面使用（不需要把它声明成服务依赖），
> `llm` 暂未接入（LLM 打分留了显式注入点）。见 §十 偏差 6。

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
| 触发 | `ctx.on('session/event')` → `turn/end` |
| 防回灌 | `source_type === 'qa_loop'` 直接 return |
| MD 落盘 | 按 `action` 分派：新建/追加/冲突/补来源 |
| 异步性 | 全程不 `await` 主链路；失败静默降级 |
| 幂等 | 同一 `turnId` 只处理一次 |

### 3. `perspective`

| 项 | 设计 |
|---|---|
| 阶段 | 观察（<4）→ 试探（4–10）→ 陪伴（>10） |
| 触发条件 | 遗漏维度 ∈ 盲区 且 ≥3 次；或与旧结论冲突；或连续深挖 ≥5 轮 |
| 输出类型 | 遗漏维度 / 对立视角 / 未想到方向 / 冲突 / 待验证 |
| 注入 | `ctx.systemPrompt.section()`，order 60 |
| 降权 | 被拒绝 2 次后不再提示该维度 |
| 置信度闸门 | profile 置信度 < 0.3 不发 |

### 4. `feedback`

| 项 | 设计 |
|---|---|
| 信号 | `+1`（👍）/ `-1`（👎）/ `0`（⏺） |
| 中性 | 不触发微调，但记录 |
| 触发 | 累积 3 条同类型 |
| 权重 | 第 N 条 `1/N` |
| 上下文 | 记录 `target`（对哪个视角） |
| 治理 | 查看/编辑/重置/随备份 |

### 5. `graph`

| 项 | 设计 |
|---|---|
| 建边 | 同次问答的实体对 |
| 强化 | `+0.05`，cap 1.0，刷新 `last_reinforced_at` |
| 衰减 | `weight × 0.95^(days/30)`，读取时算 |
| 时钟保护 | `max(0, ageDays)` + `min(stored, computed)` |
| 溯源 | 状态表 + 事件表 |
| 双链 | 写入 MD 的 `[[条目]]` |

### 6. `profile`

| 项 | 设计 |
|---|---|
| 字段 | inquiry_style / followup_patterns / blind_spots / receptive / resistant / language_style / active_goals |
| 更新源 | `qa-loop` 捕获时同步 |
| 置信度 | < 0.3 不用 |
| 用户覆盖 | `user_override` 优先 |
| 存储位置 | `<dataRoot>/profile.json`，**不在 KB 目录** |
| 隔离 | 不注入原文给模型，只注入摘要规则 |

---

## 三、数据模型

```ts
// 知识条目
interface KnowledgeItem {
  id: string                  // ts-xxxxx
  topic: string
  title: string
  content: string
  sources: Source[]
  tags: string[]
  status: 'active' | 'conflict' | 'archived'
  impl?: 'implemented' | 'designed' | 'placeholder'
  created_at: number
  updated_at: number
  version: number
}

// 来源
interface Source {
  type: 'doc' | 'session' | 'url' | 'qa_loop'
  ref: string
  hash: string
}

// 共现边
interface CooccurrenceEdge {
  source_id: string
  target_id: string
  weight: number
  last_reinforced_at: number
  reinforce_count: number
}

// 强化事件
interface EdgeEvent {
  edge_id: string
  event_type: 'create' | 'reinforce'
  weight_delta: number
  created_at: number
}

// 用户档案
interface UserProfile {
  inquiry_style: { primary: string; secondary: string; confidence: number }
  followup_patterns: string[]
  blind_spots: string[]
  receptive_dimensions: string[]
  resistant_dimensions: string[]
  language_style: { tone: string; prefers: string[]; dislikes: string[] }
  active_goals: string[]
  sessions_observed: number
  user_override?: Partial<UserProfile>
}

// 维度覆盖
interface CoverageRecord {
  topic: string
  session_id: string
  covered: string[]
  missing: string[]
  created_at: number
}

// 反馈
interface FeedbackEntry {
  id: string
  target: string              // 对哪个视角
  signal: -1 | 0 | 1
  context: string
  created_at: number
}
```

---

## 四、目录结构

```text
packages/oblivion-core/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
├── README.md
└── src/
    ├── index.ts              # apply(ctx)
    ├── config.ts             # Config + DEFAULT_CONFIG
    ├── prompt.ts             # OBLIVION_SYSTEM_PROMPT
    ├── knowledge/
    │   ├── index.ts          # registerKnowledge
    │   ├── store.ts          # JSON 文件读写
    │   ├── search.ts         # 关键词 + 共现扩展
    │   ├── filter.ts         # 四层筛选
    │   └── conflict.ts       # 冲突记录
    ├── qa-loop/
    │   ├── index.ts          # registerQaLoop
    │   ├── extract.ts        # 提取 Q/A
    │   └── md-writer.ts      # MD 落盘
    ├── perspective/
    │   ├── index.ts          # registerPerspective
    │   ├── sensor.ts         # 风格感知
    │   ├── tracker.ts        # 维度追踪
    │   ├── maker.ts          # 激荡生成
    │   └── adapter.ts        # 风格适配
    ├── feedback/
    │   ├── index.ts
    │   └── tuner.ts          # 画像微调
    ├── graph/
    │   ├── index.ts
    │   ├── decay.ts          # 惰性衰减
    │   └── backlink.ts       # 双链写入
    ├── profile/
    │   ├── index.ts
    │   └── schema.ts
    └── util/
        ├── fs.ts
        ├── hash.ts
        └── time.ts
```

> **实现口径**：包在仓库根的 `oblivion-core/`（不是 `packages/`）；`conflict.ts` 的能力内联在 `knowledge/{store,index}.ts`；
> `graph/backlink.ts` 与 `util/fs.ts` **尚未创建**（见 §十 未做 3）。其余目录一一对应。

---

## 五、代码实现（节选，以设计原样保留）

> 下列片段是**设计原稿**，用于说明意图；**以仓库源码为准**（`oblivion-core/src/**`）。
> 已知与真实 API 的差异集中在 §十 偏差表（例如 `systemPrompt.section` 的真实字段、`event.data.turn`、`inject` 列表）。

### `package.json`

```json
{
  "name": "@oblivion/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "peerDependencies": {
    "@deepseek-ai/dsh": "^0.2.0-rc.2",
    "cordis": "^4.0.0"
  },
  "oblivion": { "bundle": "cordis.patch.yml" }
}
```

### `src/index.ts`

```ts
import type { Context } from 'cordis'
import { Config, DEFAULT_CONFIG } from './config.js'
import { registerKnowledge } from './knowledge/index.js'
import { registerProfile } from './profile/index.js'
import { registerGraph } from './graph/index.js'
import { registerFeedback } from './feedback/index.js'
import { registerQaLoop } from './qa-loop/index.js'
import { registerPerspective } from './perspective/index.js'
import { OBLIVION_SYSTEM_PROMPT } from './prompt.js'
import { registerTools } from './tools.js'

export const name = '@oblivion/core'
export const inject = ['tools', 'llm', 'systemPrompt', 'session']

export function apply(ctx: Context, config: Config = DEFAULT_CONFIG): void {
  const knowledge = registerKnowledge(ctx, config)
  const profile = registerProfile(ctx, config)
  const graph = registerGraph(ctx, config, knowledge)
  const feedback = config.enableFeedback
    ? registerFeedback(ctx, config, profile)
    : null

  registerQaLoop(ctx, config, { knowledge, graph, profile })

  if (config.enablePerspective) {
    registerPerspective(ctx, config, { profile, knowledge, graph })
  }

  ctx.systemPrompt.section({ order: 50, content: OBLIVION_SYSTEM_PROMPT })

  registerTools(ctx, { knowledge, profile, feedback, graph })
}
```

### `src/config.ts`

```ts
export interface Config {
  readonly dataRoot: string
  readonly mdRoot: string
  readonly semanticThreshold: number
  readonly valueThreshold: number
  readonly enablePerspective: boolean
  readonly enableFeedback: boolean
  readonly perspectiveMinSessions: number
  readonly graphInitialWeight: number
  readonly graphReinforceDelta: number
  readonly graphDecayBase: number
  readonly graphDecayPeriodDays: number
}

export const DEFAULT_CONFIG: Config = {
  dataRoot: '~/.oblivion/data',
  mdRoot: '~/OblivionKB',
  semanticThreshold: 0.85,
  valueThreshold: 0.5,
  enablePerspective: true,
  enableFeedback: true,
  perspectiveMinSessions: 4,
  graphInitialWeight: 0.3,
  graphReinforceDelta: 0.05,
  graphDecayBase: 0.95,
  graphDecayPeriodDays: 30,
}
```

> **2026-10-06 所有者裁定**（已落地 v0.1.3）：
> `mdRoot` = **`C:/Library/那些渐渐被遗忘`**（既有知识库），**内部按 `01_问答沉淀/` 分类**；
> 新增 `mdClassify`（来源类型 → 子目录）与 `99_其他/` 兜底。见 §十 偏差 3。

### `src/knowledge/store.ts`

```ts
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export class KnowledgeStore {
  constructor(private root: string) {}

  async init() {
    await mkdir(this.root, { recursive: true })
    await mkdir(join(this.root, 'conflicts'), { recursive: true })
  }

  async loadAll(): Promise<KnowledgeItem[]> {
    const files = await readdir(this.root)
    const items: KnowledgeItem[] = []
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const raw = await readFile(join(this.root, f), 'utf8')
      items.push(JSON.parse(raw))
    }
    return items
  }

  async save(item: KnowledgeItem): Promise<void> {
    const path = join(this.root, `${item.id}.json`)
    await writeFile(path, JSON.stringify(item, null, 2), 'utf8')
  }

  async saveConflict(id: string, payload: unknown): Promise<void> {
    const path = join(this.root, 'conflicts', `${id}.json`)
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8')
  }
}
```

### `src/qa-loop/md-writer.ts`

```ts
export async function writeMD(root: string, item: InjectedItem): Promise<void> {
  const dir = join(root, '10-Topics')
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${item.topic}.md`)

  switch (item.action) {
    case 'created':
      await writeFile(path, renderTemplate(item), 'utf8')
      break
    case 'appended': {
      const existing = await readFile(path, 'utf8').catch(() => '')
      await writeFile(path, appendSection(existing, item), 'utf8')
      break
    }
    case 'duplicate':
      await appendSource(path, item.source)
      break
  }
}
```

> **实现口径**（v0.1.3）：目录改为 `<mdRoot>/<mdClassify[来源类型]>`（问答沉淀 → `01_问答沉淀/`），
> 并增加**共用知识库防误伤**：同名文件若不含 `oblivion:` 标记（= 用户自己的笔记）则改写 `<topic>-oblivion.md`，绝不覆盖。

### `src/graph/decay.ts`

```ts
const MS_PER_DAY = 86_400_000

export function effectiveWeight(
  edge: CooccurrenceEdge,
  config: { base: number; periodDays: number },
  now = Date.now()
): number {
  const ageDays = Math.max(0, (now - edge.last_reinforced_at) / MS_PER_DAY)
  const decayed = edge.weight * Math.pow(config.base, ageDays / config.periodDays)
  return Math.min(edge.weight, decayed)
}

export function reinforce(
  edge: CooccurrenceEdge,
  config: { delta: number; cap: number },
  now = Date.now()
): CooccurrenceEdge {
  return {
    ...edge,
    weight: Math.min(config.cap, edge.weight + config.delta),
    last_reinforced_at: now,
    reinforce_count: edge.reinforce_count + 1,
  }
}
```

### `src/prompt.ts`

```ts
export const OBLIVION_SYSTEM_PROMPT = `
## Oblivion 认知陪伴规则

- 表达：表格优先、结论先行、不客套、不铺垫
- 扩展思考：遗漏维度频繁出现时，在回答末尾追加「🧭 扩展思考」
- 冲突处理：与知识库旧结论矛盾时，明确指出差异，不静默合并
- 隐私：不暴露用户思维档案原文
- 输出模板（默认）：
  ## 结论
  ## 要点
  ## 盲区
  ## 下一步
`
```

### `src/tools.ts`（五个模型面工具的签名）

```ts
ctx.tools.register({ name: 'oblivion_capture',  … })   // question / answer / sources / topic_hint
ctx.tools.register({ name: 'oblivion_query',    … })   // query / limit
ctx.tools.register({ name: 'oblivion_profile',  … })   // action: read|update / signal
ctx.tools.register({ name: 'oblivion_feedback', … })   // target / signal: -1|0|1 / context
ctx.tools.register({ name: 'oblivion_graph_neighbors', … }) // id / limit
```

### `cordis.patch.yml`

```yaml
- insert:
  - id: oblivion-core
    name: '@oblivion/core'
    config:
      dataRoot: '~/.oblivion/data'
      mdRoot: '~/OblivionKB'
      semanticThreshold: 0.85
      valueThreshold: 0.5
      enablePerspective: true
      enableFeedback: true
      perspectiveMinSessions: 4
      graphInitialWeight: 0.3
      graphReinforceDelta: 0.05
      graphDecayBase: 0.95
      graphDecayPeriodDays: 30
```

> **2026-10-06 裁定**：core **走热挂**（用户层 `cordis.patch.yml` 的 insert 行，落盘即装载，**无需重启**），
> **不**声明 `dsh.bundle`。代价：换机器/重置 profile 需要重装（安装片段在本包 `cordis.patch.yml` 与 README §9.1）。

---

## 六、测试

| 测试 | 目的 | 判定 | 现状 |
|---|---|---|---|
| 精确去重 | 同 Q/A 二次捕获 | 第二次 `duplicate` | ✅ 自检 |
| 语义去重 | 改写 Q/A | 阈值内 `duplicate` | ✅ 自检（Jaccard 口径） |
| 冲突保留 | 新答案与旧矛盾 | 写 `conflicts/`，主库不变 | ✅ 实现（自检未逐条断言） |
| 防回灌 | `source_type: qa_loop` | 直接丢弃 | ✅ 自检 |
| 惰性衰减 | 时间回退 1 天 | 权重不增加 | ✅ 自检 |
| 惰性衰减 | 30 天后 | 权重 ≈ 0.95 × 原值 | ✅ 自检 |
| 幂等 | 同 `turnId` 两次 | 只处理一次 | ✅ 自检 |
| 无残留 | 卸载插件 | 无 timer / 无连接 | ✅ 结构断言（effect 清理位） |
| 非阻塞 | 100 次 capture | 主链路首字延迟差异 < 5% | ⏳ 未做（需真机测量） |

---

## 七、风险

| ID | 风险 | 应对 | 现状 |
|---|---|---|---|
| R-201 | JSON 文件千条级检索变慢 | 内存倒排索引，启动时加载 | ✅ 已实现（`loadIndex`） |
| R-202 | 时钟回退导致权重异常 | `max(0, ageDays)` + `min(stored, computed)` | ✅ 自检断言 |
| R-203 | 激荡打扰用户 | 三阶段 + 拒绝 2 次降权 + 置信度闸门 | ✅ 已实现 |
| R-204 | 反馈被误点刷偏 | `1/N` 权重 + 上下文记录 | ✅ 已实现 |
| R-205 | 档案隐私外泄 | 存 `~/.oblivion/data/`，不进 KB 目录 | ✅ 已实现 |
| R-206 | 插件卸载副作用残留 | 所有副作用走 `ctx.effect()` | ✅ 已实现（无 timer） |

---

## 八、落地状态 / 九、实施顺序

设计原稿的「落地状态」表写的是 `designed`，实施顺序为 1–8 步。
**实际落地情况以 §十 为准**（截至 v0.1.3：八步全部完成，另有 4 处设计偏差与 3 项未做）。

---

## 十、现状对账（2026-10-06 · `oblivion-core` v0.1.3）

### 已落地

| 模块 | 实现 |
|---|---|
| `config` / `prompt` / `tools` | `src/config.ts`（含实测标定注释）、`src/prompt.ts`、`src/tools.ts`（5 工具） |
| `knowledge` | `store`（JSON + `conflicts/`）、`search`（倒排 + 共现扩展）、`filter`（四层）、`evaluate`、`index`（capture/query/recordConflict） |
| `qa-loop` | `index`（`turn/end` 单触发 + 自累积事件 + 防回灌 + 幂等）、`extract`（只取真人提问）、`md-writer`（分类落盘 + 防误伤） |
| `graph` | `index`（建边/强化 + 事件表 `events()`）、`decay`（惰性衰减 + 时钟保护） |
| `profile` | `index`（read/update/updateFromQA/`user_override` 优先）、`schema`（`defaultProfile`/`mergeProfile`） |
| `perspective` | `index`（三通道闸门 + 深度 ≥3 候选 + 拒绝降权）、`tracker`（维度覆盖）、`maker`（确定性生成）、`adapter`、`sensor` |
| `feedback` | `index`（记录 + **90 天惰性裁剪**）、`tuner`（累积 3 条 + `1/N` 权重） |
| 测试面 | `test/core.test.mjs` 12 项 + `scripts/selfcheck.mjs` **19 项**（含真实事件流端到端） |

### 偏差（实现 ≠ 设计原稿，均为实测/工程原因）

| # | 设计原稿 | 实现 | 原因 |
|---|---|---|---|
| 1 | `systemPrompt.section({ order, content })` | `{ name, order: getSectionOrder(NAME), text }`，且包在 `ctx.effect()` 里 | 真实 API 字段不同；order 60 要走真实槽位映射 |
| 2 | 幂等键 `event.turnId` | `sessionId + event.data.turn` | 事件里没有 `turnId` |
| 3 | 落盘 `10-Topics/`（早期 §25.3：`oblivion_docs/` 分类） | **`mdRoot = C:/Library/那些渐渐被遗忘`** + `mdClassify`（问答沉淀 → `01_问答沉淀/`，兜底 `99_其他/`） | **2026-10-06 所有者裁定** |
| 4 | 价值阈值 0.5 | **0.30** | 实测 0.5 会让正常问答一律被丢弃（真实 233 字技术回答仅 0.370），是「装好了但库永远为空」的静默 bug |
| 5 | `` `source_type === 'qa_loop'` `` 判防回灌 + 分类 | 防回灌判 `sources[].type === 'qa_loop'` / `ref` 前缀；分类按来源类型映射 | 事件里没有 `source_type` 字段 |
| 6 | `inject: ['tools','llm','systemPrompt','session']` | `inject: ['tools','systemPrompt']` | `session` 走事件面即可；`llm` 的稳定调用面未确认，留成 `evaluate(llmScore)` 注入点 |
| 7 | `main: './dist/index.js'` + `oblivion.bundle` | `main: './lib/index.js'`（esbuild 双入口）+ **不声明** `dsh.bundle` | 本仓约定 `lib/`；`dsh.bundle` 会让挂载变成需重启的 bundle 层，而裁定是**热挂** |
| 8 | 语义去重/价值评估「LLM 判定」 | 确定性实现（token Jaccard + 否定翻转；规则打分） | `ctx.llm` 公开面只有注册类方法（见 README 已知边界） |
| 9 | 读取会话事件（隐含 `eventsSnapshot`） | 订阅 `session/event` **自累积本轮事件** | `eventsSnapshot` 是 private 且只在 deprecated 的 `snapshotEvents()` 里懒加载 → 直读恒为空 |
| 10 | `perspective` 触发含「与旧结论冲突」 | 三通道（主动 ≤3 会话 / 深度同维度连击 / 陪伴期） | 深度触发按 §25.4 落地；冲突触发的数据源（知识冲突）尚未接进 perspective → 见未做 2 |

### 未做（3 项）

| # | 项 | 说明 |
|---|---|---|
| 1 | **双链写回**（`graph/backlink.ts`、MD 文末追加 `[[条目]]`） | 目录里不存在该文件；§25.6 的双链规则只做了一半 |
| 2 | **冲突驱动的视角**（设计的「或与旧结论冲突」）与「对立视角 / 待验证」生成 | `maker` 定义了 `counter-view` / `conflict` 类型，但目前只产出 `missing-dimension` / `unexplored` / `to-verify` |
| 3 | **非阻塞量化验收**（100 次 capture 与首字延迟差异 < 5%） | 需要真机测量；现有自检是结构断言（无 timer / 全 fire-and-forget） |

### 与其它文档的关系

- 计划级缺口与优先级：[`.design/ARCHITECTURE.MD` §33](ARCHITECTURE.MD)
- 宿主契约（升级后是否还活着）：[`.design/DSH-COMPAT.md`](DSH-COMPAT.md) —— core 现为 **8/8 PASS**
- 安装 / 调参 / 排查：[`oblivion-core/README.md`](../oblivion-core/README.md) §九
