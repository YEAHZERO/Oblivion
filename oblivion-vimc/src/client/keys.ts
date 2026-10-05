/**
 * @oblivion/vimc — 键位模型与匹配规则。
 *
 * 键位**不再是硬编码表**：默认键位本身就用 Vimium-C 的 `map` 文本表达
 * （`DEFAULT_KEY_MAPPINGS`），用户可以在设置页里直接编辑这段文本，
 * 或粘贴自己 Vimium-C 导出的 `keyMappings`。解析与兼容性归 `vimium.ts`，
 * 这里只负责「文本 → 生效键位」的合并，以及事件匹配。
 *
 * ## 匹配规则
 *
 * | 情况 | 行为 | 理由 |
 * | --- | --- | --- |
 * | 事件声明了 `Ctrl/Alt/Meta` | 只有**同样声明了**这些修饰键的键位才匹配 | `Ctrl+S`、`Ctrl+W` 等系统快捷键原样通过 |
 * | 单字符键位 | 比较**产出字符**（不分大小写）+ 物理 Shift | 大写锁定不会把 `w`（上翻）变成 `W`（到顶） |
 * | 命名键位（方向键/F 键/Esc） | 比较 `event.code`（物理位置），与键盘布局无关 | 方向键本来就与布局无关 |
 * | `ignoreKeyboardLayout` | 单字符键位改为比较 `event.code` | 非拉丁布局下唯一可用的匹配方式 |
 * | IME 组合期 / 已被 `preventDefault` | 不匹配 | 选词不能被打断，不抢优先级更高的处理者 |
 */

import { parseKeyMappings, type KeyMappingParse, type VimcBinding } from './vimium.js';
import type { KeyEventLike } from './types.js';

export type { VimcBinding } from './vimium.js';
export type { KeyMappingParse, UnsupportedMapping } from './vimium.js';

export type VimcCommand =
  | 'scrollPageUp'
  | 'scrollPageDown'
  | 'stepUp'
  | 'stepDown'
  | 'stepLeft'
  | 'stepRight'
  | 'scrollToTop'
  | 'scrollToBottom'
  | 'focusInput'
  | 'linkHints'
  | 'previousTurn'
  | 'nextTurn'
  | 'openFind'
  | 'findNext'
  | 'findPrevious'
  | 'goBack'
  | 'goForward'
  | 'escapeToPage';

/**
 * 内置默认键位 —— 就是需求里给出的那份 Vimium-C 配置（受支持子集）+ 本插件特有的轮次跳转。
 *
 * 用 `map` 文本而不是 TS 常量表，是为了让「设置页里编辑的文本」与「内置默认」
 * 走**同一条解析路径**：默认值就是这段文本，改它等于改默认。
 */
export const DEFAULT_KEY_MAPPINGS = [
  '# Oblivion vimc 内置默认键位（Vimium-C map/run 语法；改动会覆盖同键位的默认值）',
  'map w scrollPageUp',
  'map s scrollPageDown',
  'map a scrollLeft',
  'map d scrollRight',
  'map W scrollToTop',
  'map S scrollToBottom',
  'map [ previousTurn',
  'map ] nextTurn',
  'map / openFind',
  'map . findNext',
  'map , findPrevious',
  'map f LinkHints.activate',
  'map i focusInput',
  'map <c-up> scrollPxUp',
  'map <c-down> scrollPxDown',
  'map <c-left> scrollPxLeft',
  'map <c-right> scrollPxRight',
].join('\n');

/** 翻页/滚动类命令（`allowWhileEditing` 只对这些命令放行）。 */
export const SCROLL_COMMANDS: ReadonlySet<VimcCommand> = new Set<VimcCommand>([
  'scrollPageUp',
  'scrollPageDown',
  'stepUp',
  'stepDown',
  'stepLeft',
  'stepRight',
  'scrollToTop',
  'scrollToBottom',
]);

/** 两个键位的「同一格」判据（合并默认与用户键位时用）。 */
export function bindingKey(binding: VimcBinding): string {
  return [binding.code, binding.char ?? '', binding.requiresShift ? 's' : '-', [...binding.modifiers].sort().join('+')].join('|');
}

/**
 * 把用户键位文本与内置默认合并：**同键位以用户为准**；文本里出现 `unmapAll` 时清空默认。
 *
 * @param text 用户键位文本（空串视为只用默认）。
 */
export function resolveBindings(text: string): KeyMappingParse {
  const parsed = parseKeyMappings(text.trim() === '' ? DEFAULT_KEY_MAPPINGS : text);
  if (parsed.unmapAll) return parsed;
  const defaults = parseKeyMappings(DEFAULT_KEY_MAPPINGS);
  const merged = new Map<string, VimcBinding>();
  for (const binding of defaults.bindings) merged.set(bindingKey(binding), binding);
  for (const binding of parsed.bindings) merged.set(bindingKey(binding), binding);
  return {
    bindings: [...merged.values()],
    unsupported: parsed.unsupported,
    errors: parsed.errors,
    unmapAll: parsed.unmapAll,
  };
}

function normalizedNamedKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  return key;
}

/**
 * 匹配一个键盘事件。
 *
 * @param event 事件的可读字段。
 * @param bindings 生效键位表。
 * @param ignoreKeyboardLayout 单字符键位改按物理位置（`event.code`）匹配。
 * @returns 命中的键位；未命中返回 `undefined`。
 */
export function matchBinding(
  event: KeyEventLike,
  bindings: readonly VimcBinding[],
  ignoreKeyboardLayout = false,
): VimcBinding | undefined {
  if (event.isComposing === true || event.keyCode === 229) return undefined;
  if (event.defaultPrevented === true) return undefined;

  const control = event.ctrlKey === true;
  const alt = event.altKey === true;
  const meta = event.metaKey === true;
  const shift = event.shiftKey === true;
  const code = typeof event.code === 'string' ? event.code : undefined;
  const key = typeof event.key === 'string' ? event.key : undefined;

  for (const binding of bindings) {
    if (binding.modifiers.includes('control') !== control) continue;
    if (binding.modifiers.includes('alt') !== alt) continue;
    if (binding.modifiers.includes('meta') !== meta) continue;
    if (binding.char !== undefined) {
      if (ignoreKeyboardLayout || key === undefined) {
        if (code !== binding.code) continue;
        if (shift !== binding.requiresShift) continue;
        return binding;
      }
      if (key.length !== 1 || key.toLowerCase() !== binding.char.toLowerCase()) continue;
      if (shift !== binding.requiresShift) continue;
      return binding;
    }
    if (code !== undefined) {
      if (code !== binding.code) continue;
    } else if (normalizedNamedKey(key) !== binding.code) {
      continue;
    }
    if (shift !== binding.requiresShift) continue;
    return binding;
  }
  return undefined;
}

/** 键位表的可读形式（设置页与 `window.oblivionVimc.keys()` 共用一份口径）。 */
export function describeBindings(bindings: readonly VimcBinding[]): Array<{
  command: VimcCommand;
  key: string;
  source: string;
}> {
  return bindings.map((binding) => ({ command: binding.command, key: binding.label, source: binding.source }));
}
