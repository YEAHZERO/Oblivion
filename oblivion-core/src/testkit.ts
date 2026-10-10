/**
 * 测试探针入口（子路径导出 `@oblivion/core/testkit`）。
 *
 * 主入口只暴露 Cordis 插件所需的 name / inject / apply / default；
 * 纯函数在这里单独导出，让自检脚本与单元测试能直接验证行为，
 * 而不必为了可测性把内部实现挂到主入口上污染插件契约。
 */
export { isOblivionOriginated, compareByOverlap, fourLayerFilter, checkL3Rules } from './knowledge/filter.js';
export { heuristicScore, evaluate } from './knowledge/evaluate.js';
export { tokenize, jaccard } from './knowledge/search.js';
export { effectiveWeight, reinforce } from './graph/decay.js';
export { extractEntities } from './graph/index.js';
export { pruneGraph } from './graph/prune.js';
export type { PruneLimits, PruneOutcome } from './graph/prune.js';
export { extractQAPair, textOfMessage, isHumanUserMessage, userMessageSourceKind } from './qa-loop/extract.js';
export { registerQaLoop } from './qa-loop/index.js';
export { classifyDir, ensureMdDirs, mdDirNames, safeDirName, safeName, MD_FALLBACK_DIR, writeMD, fileNameOf } from './qa-loop/md-writer.js';
export {
  appendRelatedLinks,
  renderConflict,
  renderFrontmatter,
  renderIndex,
  writeIndexNote,
  CONFLICTS_DIR,
  INDEX_DIR,
  RELATED_HEADER,
} from './qa-loop/md-writer.js';
export { findRelatedItems } from './graph/backlink.js';
export { deriveTitle, deriveTopic } from './knowledge/index.js';
export { tagsFromQA, sanitizeTags, titleFromQA, isWeakTitle, topicFromQuestion, TAG_MAX, TOPIC_MAX } from './knowledge/naming.js';
export { applyRetitle, contentSection, createRetitleService, listNotes, parseNote, renderNote } from './knowledge/retitle.js';
export type { NoteRef, NoteMeta, ParsedNote, RetitleEntry, RetitleIndexHost, RetitleResult, RetitleService } from './knowledge/retitle.js';
export { createWikiService, listWikiPages, renderWikiPage, writebackWikiLink, WIKI_DIR_FALLBACK } from './knowledge/wiki.js';
export type { WikiCandidate, WikiCluster, WikiClusterResult, WikiMember, WikiPageRef, WikiService } from './knowledge/wiki.js';
export { ENTRY_FILE_RE, KnowledgeStore } from './knowledge/store.js';
export { registerKnowledge } from './knowledge/index.js';
export { registerFeedback } from './feedback/index.js';
export { defaultProfile, mergeProfile } from './profile/schema.js';
export { extractStyleSignal } from './profile/index.js';
export { registerPerspective } from './perspective/index.js';
export { analyzeCoverage, DIMENSIONS } from './perspective/tracker.js';
export { generatePerspectives } from './perspective/maker.js';
export { adaptStyle } from './perspective/adapter.js';
export { tune } from './feedback/tuner.js';
export { registerDigest, composeDigest, safeFileName } from './digest/index.js';
export { summarize, suggest } from './stats/summary.js';
export { createTraceStore } from './stats/trace.js';
export { registerStats } from './stats/index.js';
export { registerTools } from './tools.js';
export type { ToolDeps } from './tools.js';
export {
  MCP_API_VERSION,
  MCP_CHANNEL,
  MCP_OWNER,
  PROTOCOL_VERSION,
  channelKey,
  clearMcpChannel,
  createMcpEndpoint,
  describeMcpChannel,
  handleMcpMessage,
  publishMcp,
  registerMcp,
  resolveMcp,
  TOOLS as MCP_TOOLS,
  toolNames as mcpToolNames,
  toolSchemas as mcpToolSchemas,
} from './mcp/index.js';
export type { McpEndpoint, McpEndpointInfo, McpFacade, McpTool } from './mcp/index.js';
export { DEFAULT_CONFIG, resolveConfig } from './config.js';
export { expandHome } from './util/paths.js';
export { normalizeForHash, sha1, shortHash } from './util/hash.js';
export { ageDays, newId, isoDate, MS_PER_DAY } from './util/time.js';