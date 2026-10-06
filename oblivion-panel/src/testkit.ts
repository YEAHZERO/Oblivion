/**
 * 测试探针入口（子路径导出 `@oblivion/panel/testkit`）。
 *
 * 主入口只暴露 Cordis 插件所需的 `name` / `inject` / `apply` / `default`；
 * 纯函数与可测逻辑在这里导出，供 `scripts/selfcheck.mjs` 与 `test/` 直接验证。
 */
export {
  buildSnapshot,
  parseNoteHead,
  summarizeDecisions,
  DIGEST_NOTE_DIR,
  QA_NOTE_DIR,
  WIKI_NOTE_DIR,
  type DecisionStats,
  type ItemRow,
  type NoteHead,
  type NoteRow,
  type PanelSnapshot,
  type SnapshotOptions,
} from './snapshot.js';
export {
  percent,
  relativeTime,
  actionLabel,
  hintLine,
  formatValue,
  statNumber,
  topBlocker,
  scoreText,
  reasonLabel,
} from './client/format.js';
export {
  openNoteInSidebar,
  type OpenFileCapable,
  type OpenNoteInput,
  type OpenNoteOutcome,
  type SessionScopeLike,
} from './client/open-note.js';
export {
  mergeKnowledge,
  knowledgeView,
  itemStatusLabel,
  implLabel,
  sourceLabel,
  detailParts,
  detailText,
  keywordText,
  wikiText,
  dateText,
  KEYWORD_MAX,
  WIKI_MAX,
  KNOWLEDGE_ITEM_LIMIT,
  type DetailPart,
  type KnowledgeItemLike,
  type KnowledgePage,
  type KnowledgeRow,
  type KnowledgeSource,
  type KnowledgeView,
  type NoteLike,
  type WikiPageLike,
} from './client/knowledge.js';
export {
  buildScoreCurve,
  curveCaption,
  thresholdOf,
  type CurveDot,
  type CurveGeometry,
  type CurveOptions,
  type CurveRow,
} from './client/chart.js';
export {
  PANEL_TAB_ID,
  panelDescriptor,
  registerPanelTab,
  type BetterSidebarLike,
  type ClientCtxLike,
  type RegisterResult,
  type TabDescriptorLike,
} from './client/register.js';
