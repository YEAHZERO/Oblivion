/**
 * 测试探针入口（子路径导出 `@oblivion/panel/testkit`）。
 *
 * 主入口只暴露 Cordis 插件所需的 `name` / `inject` / `apply` / `default`；
 * 纯函数与可测逻辑在这里导出，供 `scripts/selfcheck.mjs` 与 `test/` 直接验证。
 */
export { buildSnapshot, type PanelSnapshot, type SnapshotOptions } from './snapshot.js';
export {
  percent,
  relativeTime,
  actionLabel,
  hintLine,
  formatValue,
  statNumber,
  topReason,
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
  PANEL_TAB_ID,
  panelDescriptor,
  registerPanelTab,
  type BetterSidebarLike,
  type ClientCtxLike,
  type RegisterResult,
  type TabDescriptorLike,
} from './client/register.js';
