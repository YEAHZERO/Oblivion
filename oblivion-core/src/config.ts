/**
 * 运行时配置。
 *
 * 用纯字面量默认值而不是 schemastery：本机让 `@deepseek-ai/schemastery`
 * 在插件包的解析路径里可得，需要把它放进 peerDependencies，而 WORKSPACE.md
 * 的铁律是「框架包只放 peer、框架包解析必须显式」。这里不需要 schema 校验
 * 能力（Host 已按 Config 形状传参），所以用最薄的实现。
 */

export interface Config {
  readonly dataRoot: string;
  readonly mdRoot: string;
  /**
   * §25.3 MD 分类规则：**来源类型 → mdRoot 下的子目录**。
   *
   * 2026-10-06 所有者裁定：文档根 = `C:/Library/那些渐渐被遗忘`（既有知识库），
   * **内部按 `01_问答沉淀/` 分类**（即设计书 §25.3 的编号目录方案，不再用 `oblivion_docs/`）。
   * 未命中任何规则 → `99_其他/`（§25.3 的兜底）。
   */
  readonly mdClassify: Readonly<Record<string, string>>;

  readonly semanticThreshold: number;
  readonly valueThreshold: number;

  readonly enablePerspective: boolean;
  readonly enableFeedback: boolean;
  readonly perspectiveMinSessions: number;
  readonly perspectiveMinConfidence: number;
  readonly perspectiveMinMisses: number;
  readonly perspectiveDeepDiveTurns: number;
  /** §25.4 主动触发闸门：只在最早这些次会话里做主动激荡。 */
  readonly perspectiveActiveSessionMax: number;
  /** §25.4 主动触发闸门：问题至少多少字。 */
  readonly perspectiveMinQuestionLength: number;
  /** §25.4 深度触发：连续多少次追问同一维度。 */
  readonly perspectiveDeepTriggerRepeats: number;
  /** §25.4 深度触发：至少给几个候选视角。 */
  readonly perspectiveDeepMinCandidates: number;
  /** §25.4 深度触发闸门：单会话总激荡次数上限。 */
  readonly perspectiveDeepSessionMax: number;
  /** §25.7 反馈保留期（天）；读取时惰性裁剪，不用定时任务。 */
  readonly feedbackRetentionDays: number;

  readonly graphInitialWeight: number;
  readonly graphReinforceDelta: number;
  readonly graphWeightCap: number;
  readonly graphDecayBase: number;
  readonly graphDecayPeriodDays: number;
  /**
   * 共现图上限（`graph/prune.ts`）：留不住的边按有效权重从低到高丢。
   *
   * 为什么要上限（实测 2026-10-07）：单次捕获最多抽 24 个实体 ⇒ 一次就是 `C(24,2)=276` 条边，
   * 图长到 23,253 条边 / 3.64 MB 时，**每一轮捕获都要整份读盘 + `JSON.parse`**，而绝大多数是
   * 「只共现过一次」的弱边（权重 0.3、`reinforce_count` 0）。上限让代价封顶，收益靠强边。
   * `<= 0` 表示不限制（不推荐：那是一次实验用的开关）。
   */
  readonly graphMaxEdges: number;
  /** 节点数上限；超限时先丢「节点强度」最低的节点及其边。`<= 0` 表示不限制。 */
  readonly graphMaxNodes: number;

  readonly feedbackTuneThreshold: number;
  readonly promptSectionOrder: number;
  readonly maxPerspectivePerTurn: number;

  readonly minAnswerLength: number;
  readonly logPrefix: string;

  /** 判定留痕（「为什么没收 / 为什么收了」）总开关。 */
  readonly enableStats: boolean;
  /** 留痕保留期（天）；读取时惰性裁剪，与反馈保留期同一招。 */
  readonly statsRetentionDays: number;
  /** 留痕最多保留多少条（超出丢最旧的）。 */
  readonly statsMaxEntries: number;
  /** `oblivion_status` 默认返回多少条最近判定。 */
  readonly statusRecentLimit: number;
  /**
   * **临时诊断**：把收到的每个 `session/event` 记一行到 `<dataRoot>/events-probe.jsonl`。
   *
   * 为什么需要它：`turn/end → 捕获` 这条路在真实 Host 里是否真的接通，无法靠日志确认
   * （本机没有可读的 Host 日志目录）。探针能一眼区分三种情况：
   *   ① 一行都没有 → 事件面根本没到我们这里；
   *   ② 有事件但没有 `turn/end` → 订阅时机或事件名不对；
   *   ③ 有 `turn/end` 但 `session.id` 不是字符串 → 是我们自己的守卫把事件丢了。
   * 链路验证通过后请设成 `false`。
   */
  readonly enableEventProbe: boolean;
  /** 探针文件最多保留多少行（超出重写为尾部）。 */
  readonly eventProbeMax: number;
  /**
   * **盲区修正**：同一 `topic` 出现新版本时，自动把仍为 `active` 的旧条目降级为 `superseded`
   * （不删除，写 `supersededBy`），并在笔记 frontmatter 里如实标注。
   */
  readonly autoSupersede: boolean;
}

export const DEFAULT_CONFIG: Config = {
  dataRoot: '~/.oblivion/data',

  /**
   * 文档根（所有者裁定 2026-10-06）：直接写进既有的知识库，不再单开 `oblivion_docs/`。
   * 用正斜杠书写：Windows 上 `path.isAbsolute('C:/…')` 成立，`expandHome()` 原样放行，
   * 且写进 YAML 时不需要转义反斜杠。
   */
  mdRoot: 'C:/Library/那些渐渐被遗忘',
  mdClassify: {
    // 问答沉淀（我们的捕获来源是 session；qa_loop 是设计书的原始命名，一并兼容）
    session: '01_问答沉淀',
    qa_loop: '01_问答沉淀',
    // 设计书 §25.3 的其余分类（后续文档导入/创作能力落地后直接生效）
    doc: '00_导入文件',
    wiki: '02_Wiki页面',
    content_creator: '03_创作产物',
    // 用户显式要求的「整理当前对话」产物（`oblivion_digest` 工具）
    session_digest: '04_会话整理',
  },

  /**
   * 价值阈值 —— **已按实测重标定，不要改回设计书原值 0.5**。
   *
   * 实测分布（heuristicScore）：
   *   真实 233 字技术回答（有来源 + 结构 + 代码）  0.370
   *   500 字普通回答                              ~0.42
   *   900 字低信息密度（大量重复）                 0.454
   *   "ok"                                      0.113
   *
   * 原值 0.5 落在「真实回答之上、重复文本之下」，会让正常问答**一律被丢弃**
   * ——症状是插件装好了但知识库永远为空，且不报错。0.30 把「ok 类噪声」
   * 挡住，同时放行正常回答。这是端到端自检用例抓出来的，改动请同步更新
   * test/ 与 scripts/selfcheck.mjs 的断言。
   */
  semanticThreshold: 0.85,
  valueThreshold: 0.3,

  enablePerspective: true,
  enableFeedback: true,
  perspectiveMinSessions: 4,
  perspectiveMinConfidence: 0.3,
  perspectiveMinMisses: 3,
  perspectiveDeepDiveTurns: 5,

  // §25.4 双模式闸门（设计书原值）
  perspectiveActiveSessionMax: 3,
  perspectiveMinQuestionLength: 10,
  perspectiveDeepTriggerRepeats: 3,
  perspectiveDeepMinCandidates: 3,
  perspectiveDeepSessionMax: 5,

  // §25.7 保留期（读取时惰性裁剪，满足「无定时任务」约束）
  feedbackRetentionDays: 90,

  graphInitialWeight: 0.3,
  graphReinforceDelta: 0.05,
  graphWeightCap: 1.0,
  graphDecayBase: 0.95,
  graphDecayPeriodDays: 30,
  /**
   * 上限按本机实测标定（23,253 条边 / 1,437 个节点、权重中位数就是初始值 0.3）：
   * 留 8,000 条边 ≈ 保留「共现过 ≥2 次或较新」的那部分，文件降到 ~1 MB；
   * 600 个节点保住 `graph_neighbors` 最常查的中心节点，弱节点连边一起走。
   */
  graphMaxEdges: 8000,
  graphMaxNodes: 600,

  feedbackTuneThreshold: 3,
  promptSectionOrder: 50,
  maxPerspectivePerTurn: 2,

  /**
   * L3 最低答案长度 —— **设计书 §25.1 原值 5**（旧实现用 20，等于把 L3 当成了价值闸门）。
   * 5 字以下直接判无意义；「短但可能有用」留给 L4 价值评估（`valueThreshold`）兜底。
   */
  minAnswerLength: 5,
  logPrefix: '[oblivion-core]',

  // 观测面（调参要靠真实数据：先跑够几天，再用 oblivion_status 看建议）
  enableStats: true,
  statsRetentionDays: 90,
  statsMaxEntries: 5000,
  statusRecentLimit: 20,

  // 临时事件探针（链路验证通过后设 false）
  enableEventProbe: true,
  eventProbeMax: 200,

  // 盲区修正：同主题新版本自动降级旧版本（不删，只标 superseded）
  autoSupersede: true,
};

/** 部分覆盖：只接受显式给出的键，缺省落回 DEFAULT_CONFIG。 */
export function resolveConfig(input?: Partial<Config>): Config {
  if (!input) return DEFAULT_CONFIG;
  const out = { ...DEFAULT_CONFIG } as Record<string, unknown>;
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as unknown as Config;
}