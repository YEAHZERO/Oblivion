/**
 * @oblivion/vimc — 客户端配置。
 *
 * 存在浏览器 `localStorage`，键 `oblivion-vimc:settings:v1`。
 * 读入时一律 `normalizeConfig`：坏数据（手改过的 JSON、旧版本字段、类型漂移）
 * 只会退化成默认值，**绝不让插件因为存储脏数据而挂掉**。
 *
 * ## 命名与 Vimium-C 对齐
 *
 * 能从 Vimium-C 选项导出里导入的字段**沿用上游名字**（`scrollStepSize`、
 * `linkHintCharacters`、`keyMappings`、`ignoreKeyboardLayout`），
 * 本插件特有的才另起名字（`pageRatioVertical` 等）。导入逻辑见 `vimium.ts`。
 */

import type { StorageLike } from './types.js';

/** `i` 聚焦输入框之后如何处理已有文本（对应 Vimium 的 `o.select`）。 */
export type VimcSelectMode = 'none' | 'all' | 'all-line';

export interface VimcConfig {
  /** 总开关。 */
  enabled: boolean;
  /** 竖向翻页步长 = 容器可视高度 × 该比例。 */
  pageRatioVertical: number;
  /** 横向翻页步长 = 容器可视宽度 × 该比例。 */
  pageRatioHorizontal: number;
  /** 平滑滚动（关掉则是瞬时跳转，长按连发更跟手）。 */
  smooth: boolean;
  /** 聚焦输入框后：不动选区 / 全选 / 选中光标所在行。 */
  select: VimcSelectMode;
  /**
   * 按键按**物理位置**（`event.code`）匹配而不是按产出的字符匹配。
   *
   * 对应 Vimium-C 的 `keyLayout`（0 = 停用「始终忽略键盘布局」）。
   */
  ignoreKeyboardLayout: boolean;
  /** 允许在输入框里也翻页（默认关：这就是本插件的核心约束）。 */
  allowWhileEditing: boolean;
  /** `Esc` 退出输入框（焦点回到页面）。默认开：`i` 进去之后必须能原路退出。 */
  escapeToPage: boolean;
  /** 把「已挂载 / 处理了哪个键」上报给宿主半边写自证据文件。 */
  diagnostics: boolean;
  /** `i` 聚焦输入框时的优先选择器（按顺序命中即用；对应 Vimium 的 `o.prefer`）。 */
  prefer: string[];
  /** 像素步长（对应 Vimium-C 的 `scrollStepSize`）：`scrollUp/Down/Left/Right`、`scrollPx*` 用。 */
  scrollStepSize: number;
  /** 链接提示字母表（对应 Vimium-C 的 `linkHintCharacters`；顺序即优先级）。 */
  linkHintCharacters: string;
  /**
   * 键位文本（Vimium-C 的 `map` / `run` 语法）。
   * 空串 = 使用内置默认（`DEFAULT_KEY_MAPPINGS`）；含 `unmapAll` 时清空内置默认。
   */
  keyMappings: string;
  /** 排除规则（对应 Vimium-C 的 `exclusionRules.pattern`）：命中即整体停用。 */
  exclusions: string[];
  /**
   * 页面内查找是否按**正则**解释查询（对应 Vimium-C 的 `regexFindMode`）。
   * 默认关（普通子串更符合直觉）；导入所有者那份导出时会按其设置打开。
   */
  regexFindMode: boolean;
}

export const CONFIG_STORAGE_KEY = 'oblivion-vimc:settings:v1';

/** Vimium-C 默认的链接提示字母表是 `sadfjklewcmpgh`；这里用所有者导出里的那一份。 */
export const DEFAULT_HINT_CHARACTERS = 'dsavewrqcxz';

/**
 * 翻页距离 = 容器可视尺寸 × 该比例。
 *
 * `0.6` 是**所有者指定的值**（理由：输入框/编辑器占掉一部分可视高度，翻页距离要相应小一点；
 * 曾用过 0.9 → 0.7 → 0.6，见 `migrateLegacy`）。
 */
export const DEFAULT_PAGE_RATIO = 0.6;

/** 历史默认值；只用于把「从没被用户改过」的旧配置迁移到当前默认。 */
const LEGACY_PAGE_RATIOS: readonly number[] = [0.9, 0.7];

export const DEFAULT_CONFIG: VimcConfig = {
  enabled: true,
  pageRatioVertical: DEFAULT_PAGE_RATIO,
  pageRatioHorizontal: DEFAULT_PAGE_RATIO,
  smooth: true,
  select: 'all-line',
  ignoreKeyboardLayout: false,
  allowWhileEditing: false,
  escapeToPage: true,
  diagnostics: true,
  prefer: ['[data-composer-input]'],
  scrollStepSize: 90,
  linkHintCharacters: DEFAULT_HINT_CHARACTERS,
  keyMappings: '',
  exclusions: [],
  regexFindMode: false,
};

const SELECT_MODES: readonly VimcSelectMode[] = ['none', 'all', 'all-line'];

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asRatio(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(2, Math.max(0.1, value));
}

function asStepSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(2000, Math.max(1, value)));
}

function asSelect(value: unknown, fallback: VimcSelectMode): VimcSelectMode {
  return typeof value === 'string' && (SELECT_MODES as readonly string[]).includes(value)
    ? (value as VimcSelectMode)
    : fallback;
}

function asSelectors(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const selectors = value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .slice(0, 8);
  return selectors.length > 0 ? selectors : [...fallback];
}

/** 提示字母表：去掉空白与重复字符；空则取默认。 */
function asHintCharacters(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const unique = [...new Set([...value.replace(/\s+/g, '')])].slice(0, 30).join('');
  return unique === '' ? fallback : unique;
}

function asKeyMappings(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.slice(0, 20000) : fallback;
}

function asExclusions(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 20);
}

/**
 * 把「用户从没改过、只是带着历史默认值」的翻页比例迁到当前默认。
 *
 * 判据：`regexFindMode` 字段是 v0.2.2 才有的 —— 没有它，说明这份存储写在
 * v0.2.0/v0.2.1 或更早（那时设置页里没有比例控件，值只可能来自默认）。
 * 于是把历史默认（0.9 / 0.7）迁到当前默认；用户真正改过的值（例如 0.5）原样保留。
 */
function migrateLegacy(source: Record<string, unknown>): Record<string, unknown> {
  if (source.regexFindMode !== undefined) return source;
  const next = { ...source };
  for (const key of ['pageRatioVertical', 'pageRatioHorizontal'] as const) {
    const value = next[key];
    if (typeof value === 'number' && LEGACY_PAGE_RATIOS.includes(value)) next[key] = DEFAULT_PAGE_RATIO;
  }
  return next;
}

/** 把任意输入收敛成一份合法配置（缺项取默认值，越界值夹到范围内）。 */
export function normalizeConfig(raw: unknown, fallback: VimcConfig = DEFAULT_CONFIG): VimcConfig {
  const source = migrateLegacy(raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {});
  return {
    enabled: asBoolean(source.enabled, fallback.enabled),
    pageRatioVertical: asRatio(source.pageRatioVertical, fallback.pageRatioVertical),
    pageRatioHorizontal: asRatio(source.pageRatioHorizontal, fallback.pageRatioHorizontal),
    smooth: asBoolean(source.smooth, fallback.smooth),
    select: asSelect(source.select, fallback.select),
    ignoreKeyboardLayout: asBoolean(source.ignoreKeyboardLayout, fallback.ignoreKeyboardLayout),
    allowWhileEditing: asBoolean(source.allowWhileEditing, fallback.allowWhileEditing),
    escapeToPage: asBoolean(source.escapeToPage, fallback.escapeToPage),
    diagnostics: asBoolean(source.diagnostics, fallback.diagnostics),
    prefer: asSelectors(source.prefer, fallback.prefer),
    scrollStepSize: asStepSize(source.scrollStepSize, fallback.scrollStepSize),
    linkHintCharacters: asHintCharacters(source.linkHintCharacters, fallback.linkHintCharacters),
    keyMappings: asKeyMappings(source.keyMappings, fallback.keyMappings),
    exclusions: asExclusions(source.exclusions, fallback.exclusions),
    regexFindMode: asBoolean(source.regexFindMode, fallback.regexFindMode),
  };
}

/** 读配置；存储不可用或内容损坏时返回默认值。 */
export function readConfig(storage?: StorageLike | undefined): VimcConfig {
  if (storage === undefined) return { ...DEFAULT_CONFIG };
  try {
    const raw = storage.getItem(CONFIG_STORAGE_KEY);
    if (raw === null || raw === '') return { ...DEFAULT_CONFIG };
    return normalizeConfig(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 合并写入配置并返回新值；写失败（隐私模式/配额）只影响持久化，不影响本次生效。 */
export function writeConfig(
  storage: StorageLike | undefined,
  patch: Partial<VimcConfig>,
  current: VimcConfig,
): VimcConfig {
  const next = normalizeConfig({ ...current, ...patch }, current);
  if (storage !== undefined) {
    try {
      storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 持久化失败不影响本次会话 */
    }
  }
  return next;
}

/** 诊断上报用的配置快照（不含任何可识别信息）。 */
export function publicConfig(config: VimcConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    select: config.select,
    smooth: config.smooth,
    ignoreKeyboardLayout: config.ignoreKeyboardLayout,
    allowWhileEditing: config.allowWhileEditing,
    escapeToPage: config.escapeToPage,
    pageRatioVertical: config.pageRatioVertical,
    pageRatioHorizontal: config.pageRatioHorizontal,
    scrollStepSize: config.scrollStepSize,
    linkHintCharacters: config.linkHintCharacters,
    keyMappings: config.keyMappings === '' ? '(内置默认)' : `${config.keyMappings.split('\n').length} 行`,
    exclusions: config.exclusions,
    regexFindMode: config.regexFindMode,
  };
}
