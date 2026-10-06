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
export { extractQAPair, textOfMessage, isHumanUserMessage, userMessageSourceKind } from './qa-loop/extract.js';
export { registerQaLoop } from './qa-loop/index.js';
export { classifyDir, MD_FALLBACK_DIR, writeMD } from './qa-loop/md-writer.js';
export { deriveTitle, deriveTopic } from './knowledge/index.js';
export { registerFeedback } from './feedback/index.js';
export { defaultProfile, mergeProfile } from './profile/schema.js';
export { extractStyleSignal } from './profile/index.js';
export { registerPerspective } from './perspective/index.js';
export { analyzeCoverage, DIMENSIONS } from './perspective/tracker.js';
export { generatePerspectives } from './perspective/maker.js';
export { adaptStyle } from './perspective/adapter.js';
export { tune } from './feedback/tuner.js';
export { DEFAULT_CONFIG, resolveConfig } from './config.js';
export { expandHome } from './util/paths.js';
export { normalizeForHash, sha1, shortHash } from './util/hash.js';
export { ageDays, newId, isoDate, MS_PER_DAY } from './util/time.js';