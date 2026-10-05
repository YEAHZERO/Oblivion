/**
 * @oblivion/vimc — Vimium-C 兼容层。
 *
 * 两件事：
 *
 *   ① **解析 `map` / `run` 文本**（Vimium-C 的 `keyMappings` 格式）成本插件的键位表；
 *   ② **导入 Vimium-C 的选项导出 JSON**，把它能对应的选项映射到本插件配置，
 *      并把「本插件没实现的部分」逐条列清楚 —— 兼容不等于假装支持。
 *
 * ## 为什么不直接照搬全部命令
 *
 * Vimium-C 是浏览器扩展，命令面覆盖标签页/历史/书签/Vomnibar/标记/查找/下载/剪贴板
 * 等浏览器能力。DSH 是应用外壳：这些东西要么不存在（标签页），要么在应用页面上执行
 * 会**弄坏当前界面**（`goUp`/`goToRoot` 会改地址栏 URL、`reload` 会重载整个会话界面）。
 * 所以这里采取「**能对应的对应上，其余逐条列出并说明原因**」的策略，
 * 导入报告会把这些命令原样呈现给用户（设置页可见）。
 *
 * ## 兼容口径（实测 `vimium_c-20251214_001720.json`）
 *
 * | Vimium-C 选项 | 本插件 | 说明 |
 * | --- | --- | --- |
 * | `keyMappings`（字符串数组） | `keyMappings`（文本） | 续行（行尾 `\`）会先合并；`#` 开头为注释；`unmapAll` 会清空内置默认 |
 * | `linkHintCharacters` | `linkHintCharacters` | 链接提示字母表（顺序即优先级） |
 * | `scrollStepSize` | `scrollStepSize` | 像素步长：`scrollUp/Down/Left/Right`、`scrollPx*` |
 * | `keyLayout` | `ignoreKeyboardLayout` | `0` = 按产出字符匹配（与「始终忽略键盘布局」停用一致）；非 0 = 按物理位置 |
 * | `smoothScroll` | `smooth` | 该导出里没有，存在时才采纳 |
 * | `exclusionRules.pattern` | `exclusions` | 命中即整体停用（模式语言的子集，见 `matchesExclusion`） |
 * | 其余（`searchEngines`/`clipSub`/`vimSync`/…） | — | 报告里逐条给出「为什么不适用」 |
 */

import type { VimcCommand } from './keys.js';

/** 需要的修饰键（`shift` 只在命名键上表达）。 */
export type VimcModifier = 'control' | 'alt' | 'shift' | 'meta';

export interface VimcBinding {
  readonly command: VimcCommand;
  /** 显示用键帽：`w` / `Shift+W` / `Ctrl+↑`。 */
  readonly label: string;
  /** 物理键 `KeyboardEvent.code`（`KeyW` / `ArrowUp` / `F1` / `Escape`）。 */
  readonly code: string;
  /** 单字符键位产出的小写字符；命名键（方向键/功能键）为 `undefined`。 */
  readonly char?: string;
  /** 该键位是否要求物理 Shift（单字符由字符本身推出，命名键由 `<s-…>` 推出）。 */
  readonly requiresShift: boolean;
  /** 需要同时按下的 control/alt/meta。 */
  readonly modifiers: readonly ('control' | 'alt' | 'meta')[];
  /** 来源行（设置页回显与排错用）。 */
  readonly source: string;
}

export interface UnsupportedMapping {
  /** Vimium-C 的命令名（去掉参数后的第一段）。 */
  readonly command: string;
  /** 为什么本插件不接管它。 */
  readonly reason: string;
  /** 首次出现的原文行。 */
  readonly text: string;
}

export interface KeyMappingParse {
  readonly bindings: readonly VimcBinding[];
  readonly unsupported: readonly UnsupportedMapping[];
  readonly errors: readonly { readonly text: string; readonly message: string }[];
  /** 文本里出现过 `unmapAll`（内置默认键位被清空）。 */
  readonly unmapAll: boolean;
}

/** Vimium-C 命令 → 本插件命令 + 不适用理由。 */
const COMMANDS: Readonly<Record<string, { command: VimcCommand } | { reason: string }>> = {
  // ---- 滚动 ----
  scrollpageup: { command: 'scrollPageUp' },
  scrollpagedown: { command: 'scrollPageDown' },
  scrollup: { command: 'stepUp' },
  scrolldown: { command: 'stepDown' },
  scrollleft: { command: 'stepLeft' },
  scrollright: { command: 'stepRight' },
  scrollpxup: { command: 'stepUp' },
  scrollpxdown: { command: 'stepDown' },
  scrollpxleft: { command: 'stepLeft' },
  scrollpxright: { command: 'stepRight' },
  scrolltotop: { command: 'scrollToTop' },
  scrolltobottom: { command: 'scrollToBottom' },
  // ---- 焦点 ----
  focusinput: { command: 'focusInput' },
  // ---- 链接提示 ----
  'linkhints.activate': { command: 'linkHints' },
  'linkhints.activatehover': { command: 'linkHints' },
  // ---- 历史（SPA 安全；只动 history，不改地址栏路径） ----
  goback: { command: 'goBack' },
  goforward: { command: 'goForward' },

  // ---- 本插件自己的命令名（恒等映射）----
  // 让设置页里的键位文本既可以用 Vimium 的词，也可以直接用本插件的词。
  // （`scrollToTop`/`scrollToBottom`/`focusInput` 等本来两边同名，上面已覆盖。）
  stepup: { command: 'stepUp' },
  stepdown: { command: 'stepDown' },
  stepleft: { command: 'stepLeft' },
  stepright: { command: 'stepRight' },
  linkhints: { command: 'linkHints' },
  previousturn: { command: 'previousTurn' },
  nextturn: { command: 'nextTurn' },
  openfind: { command: 'openFind' },
  findnext: { command: 'findNext' },
  findprevious: { command: 'findPrevious' },

  // ---- 页面内查找（所有者导出里的 `map / enterFindMode`、`.` performFind、`,` performBackwardsFind）----
  enterfindmode: { command: 'openFind' },
  performfind: { command: 'findNext' },
  performanotherfind: { command: 'findNext' },
  performbackwardsfind: { command: 'findPrevious' },

  // ---- 明确不适用：理由要具体，设置页会逐条显示 ----
  reload: { reason: '重载会重建整个会话界面；请用 Ctrl+R' },
  reloadgiventab: { reason: 'DSH 没有标签页' },
  reopentab: { reason: 'DSH 没有标签页' },
  createtab: { reason: 'DSH 没有标签页' },
  reloadtab: { reason: 'DSH 没有标签页' },
  removetab: { reason: 'DSH 没有标签页' },
  previoustab: { reason: 'DSH 没有标签页' },
  nexttab: { reason: 'DSH 没有标签页' },
  movetableft: { reason: 'DSH 没有标签页' },
  movetabright: { reason: 'DSH 没有标签页' },
  restoretab: { reason: 'DSH 没有标签页' },
  restoregiventab: { reason: 'DSH 没有标签页' },
  duplicatetab: { reason: 'DSH 没有标签页' },
  togglepintab: { reason: 'DSH 没有标签页' },
  togglecs: { reason: 'DSH 没有标签页级的内容脚本开关' },
  enablecstemp: { reason: 'DSH 没有标签页级的内容脚本开关' },
  clearcs: { reason: 'DSH 没有标签页级的内容脚本开关' },
  closeothertabs: { reason: 'DSH 没有标签页' },
  closertab: { reason: 'DSH 没有标签页' },
  closelttab: { reason: 'DSH 没有标签页' },
  closetabsonleft: { reason: 'DSH 没有标签页' },
  closetabsonright: { reason: 'DSH 没有标签页' },
  movetabtonewwindow: { reason: 'DSH 没有窗口级标签操作' },
  movetabtoincognito: { reason: 'DSH 没有无痕窗口' },
  movetabtonextwindow: { reason: 'DSH 没有多窗口标签操作' },
  openincognito: { reason: 'DSH 没有无痕窗口' },
  vomnibar: { reason: 'DSH 没有浏览器地址栏/搜索引擎界面' },
  'vomnibar.activate': { reason: 'DSH 没有 Vomnibar' },
  'vomnibar.activateintab': { reason: 'DSH 没有 Vomnibar' },
  'vomnibar.activateinnewtab': { reason: 'DSH 没有 Vomnibar' },
  'vomnibar.activatetabselection': { reason: 'DSH 没有 Vomnibar' },
  'vomnibar.activatehistoryinnewtab': { reason: 'DSH 没有 Vomnibar' },
  'vomnibar.activatebookmarksinnewtab': { reason: 'DSH 没有 Vomnibar/书签' },
  'vomnibar.activateurl': { reason: 'DSH 没有 Vomnibar' },
  clearfindhistory: { reason: '查找历史未做持久化，无需清除' },
  enterinsertmode: { reason: '本插件的输入框进出由 i / Esc 负责，不需要插入模式' },
  entervisualmode: { reason: '可视模式未实现' },
  entervisuallinemode: { reason: '可视模式未实现' },
  'marks.activate': { reason: '标记（Marks）未实现' },
  'marks.create': { reason: '标记（Marks）未实现' },
  'marks.clearglobal': { reason: '标记（Marks）未实现' },
  'marks.clearlocal': { reason: '标记（Marks）未实现' },
  showhelp: { reason: '本插件在设置页（设置 → Oblivion 键盘导航）给出全部键位' },
  showtip: { reason: '提示气泡未实现' },
  passnextkey: { reason: '按键透传未实现（本插件默认就不抢输入框里的键）' },
  goup: { reason: '会改写应用页面 URL，可能弄坏当前界面' },
  gotoroot: { reason: '会改写应用页面 URL，可能弄坏当前界面' },
  parentframe: { reason: 'DSH 主界面没有子框架导航' },
  nextframe: { reason: 'DSH 主界面没有子框架导航' },
  mainframe: { reason: 'DSH 主界面没有子框架导航' },
  simbackspace: { reason: '模拟退格未实现' },
  switchfocus: { reason: '焦点切换未实现' },
  focusorlaunch: { reason: '启动/聚焦外部窗口不适用' },
  debugbackground: { reason: '调试面板未实现' },
  opendownloadbar: { reason: '没有下载栏' },
  togglelinkhintcharacters: { reason: '链接提示字符集请在设置页改（不需热键）' },
  copycurrenturl: { reason: '剪贴板类命令未实现' },
  copycurrenttitle: { reason: '剪贴板类命令未实现' },
  opencopiedurlincurrenttab: { reason: '剪贴板类命令未实现' },
  opencopiedurlinnewtab: { reason: '剪贴板类命令未实现' },
  autocopy: { reason: '自动复制不适用' },
  autoopen: { reason: '搜索类命令不适用' },
  searchas: { reason: '搜索类命令不适用' },
  searchinanother: { reason: '搜索类命令不适用' },
  visitprevioustab: { reason: 'DSH 没有标签页' },
  togglemutetab: { reason: 'DSH 没有标签页音频' },
  togglevomnibarstyle: { reason: 'DSH 没有 Vomnibar' },
  openurl: { reason: '打开外部 URL 不在本插件职责内' },
  lh: { reason: '链接提示的子动作（复制/下载/图片等）未实现，只实现了 activate' },
  key: { reason: '按键宏（key=）未实现' },
};

/** 单字符键位 → 物理 code（忽略键盘布局模式与排除法用）。 */
const CHAR_CODES: Readonly<Record<string, string>> = {
  '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight',
  '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash',
  ' ': 'Space', '<': 'Comma', '>': 'Period', '?': 'Slash', ':': 'Semicolon', '"': 'Quote',
  '{': 'BracketLeft', '}': 'BracketRight', '|': 'Backslash', '+': 'Equal', '_': 'Minus',
  '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', $: 'Digit4', '%': 'Digit5', '^': 'Digit6',
  '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0', '~': 'Backquote',
};

/** 需要 Shift 才能产出的字符（US 布局，够用即可）。 */
const SHIFTED_CHARS = new Set([...'~!@#$%^&*()_+{}|:"<>?']);

/** Vimium-C 的命名键 → 规范 `event.key` 名。 */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  backspace: 'Backspace', enter: 'Enter', esc: 'Escape', escape: 'Escape',
  space: 'Space', tab: 'Tab', delete: 'Delete', del: 'Delete', insert: 'Insert',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
  ...Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`f${index + 1}`, `F${index + 1}`])),
};

/** 键帽显示名（设置页用）。 */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Space: 'Space',
};

/** Vimium-C 的修饰键字母 → 本插件修饰键。 */
const MODIFIER_LETTERS: Readonly<Record<string, VimcModifier>> = {
  c: 'control', a: 'alt', m: 'meta', s: 'shift',
};

const ORDERED_MODIFIERS: readonly ('control' | 'alt' | 'meta')[] = ['control', 'alt', 'meta'];

function modifierPrefix(modifiers: readonly ('control' | 'alt' | 'meta')[], shift: boolean): string {
  const parts: string[] = [];
  if (modifiers.includes('control')) parts.push('Ctrl');
  if (modifiers.includes('alt')) parts.push('Alt');
  if (modifiers.includes('meta')) parts.push('Meta');
  if (shift) parts.push('Shift');
  return parts.length === 0 ? '' : `${parts.join('+')}+`;
}

function labelFor(keycap: string, modifiers: readonly ('control' | 'alt' | 'meta')[], shift: boolean): string {
  return `${modifierPrefix(modifiers, shift)}${KEY_LABELS[keycap] ?? keycap}`;
}

interface ParsedKey {
  readonly code: string;
  readonly char?: string;
  readonly requiresShift: boolean;
  readonly modifiers: readonly ('control' | 'alt' | 'meta')[];
  readonly label: string;
}

/**
 * 解析 Vimium-C 的一个键位记号：`w`、`W`、`<a-t>`、`<c-up>`、`<s-f1>`、`<backspace>`、`>`。
 *
 * @returns 解析结果；无法识别返回 `undefined`。
 */
export function parseKeyToken(token: string): ParsedKey | undefined {
  const text = token.trim();
  if (text === '') return undefined;
  if (text.startsWith('<') && text.endsWith('>')) {
    const parts = text.slice(1, -1).toLowerCase().split('-');
    const last = parts.pop() ?? '';
    const modifiers: ('control' | 'alt' | 'meta')[] = [];
    let shift = false;
    for (const part of parts) {
      const modifier = MODIFIER_LETTERS[part];
      if (modifier === undefined) return undefined;
      if (modifier === 'shift') shift = true;
      else if (!modifiers.includes(modifier)) modifiers.push(modifier);
    }
    const ordered = ORDERED_MODIFIERS.filter((name) => modifiers.includes(name));
    const named = NAMED_KEYS[last];
    if (named !== undefined) {
      const keycap = KEY_LABELS[named] ?? named.replace(/^Arrow/, '');
      return { code: named, requiresShift: shift, modifiers: ordered, label: labelFor(keycap, ordered, shift) };
    }
    if (last.length === 1) {
      const char = last;
      const requiresShift = /[A-Z]/.test(char);
      const code = charCode(char);
      if (code === undefined) return undefined;
      return { code, char: char.toLowerCase(), requiresShift, modifiers: ordered, label: labelFor(char, ordered, requiresShift) };
    }
    return undefined;
  }
  if (text.length !== 1) return undefined;
  const requiresShift = /[A-Z]/.test(text) || SHIFTED_CHARS.has(text);
  const code = charCode(text);
  if (code === undefined) return undefined;
  return {
    code,
    char: SHIFTED_CHARS.has(text) ? text : text.toLowerCase(),
    requiresShift,
    modifiers: [],
    label: labelFor(text, [], requiresShift),
  };
}

function charCode(char: string): string | undefined {
  if (/^[a-zA-Z]$/.test(char)) return `Key${char.toUpperCase()}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  return CHAR_CODES[char];
}

/** 把 `run` 的键位段（可能含 `<a-?> <a-/>` 这种多键）拆成记号。 */
function splitKeyTokens(text: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === '<') {
      const end = text.indexOf('>', index);
      if (end < 0) return [...tokens, text.slice(index)];
      tokens.push(text.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    tokens.push(char);
    index += 1;
  }
  return tokens;
}

/** 合并续行（Vimium-C 文本里行尾 `\` 表示下一行是续行）。 */
export function joinContinuations(lines: readonly string[]): string[] {
  const joined: string[] = [];
  let buffer = '';
  for (const raw of lines) {
    const line = buffer === '' ? raw : `${buffer}${raw.trimStart()}`;
    if (line.trimEnd().endsWith('\\')) {
      buffer = `${line.trimEnd().slice(0, -1)}`;
      continue;
    }
    buffer = '';
    joined.push(line);
  }
  if (buffer !== '') joined.push(buffer);
  return joined;
}

function commandKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 解析 Vimium-C 的 `keyMappings` 文本。
 *
 * @param text 多行文本（字符串数组请先用 `joinContinuations` 再 `join('\n')`）。
 */
export function parseKeyMappings(text: string): KeyMappingParse {
  const lines = joinContinuations(text.split(/\r?\n/));
  const bindings: VimcBinding[] = [];
  const unsupported = new Map<string, UnsupportedMapping>();
  const errors: { text: string; message: string }[] = [];
  /** 单键 → 已解析出的命令，供 `run q i` 这类「按键转发」二次解析。 */
  const mapTable = new Map<string, VimcCommand>();
  const pendingRuns: { keys: string[]; target: string; text: string }[] = [];
  let unmapAll = false;

  const pushUnsupported = (command: string, reason: string, lineText: string): void => {
    const key = commandKey(command);
    if (unsupported.has(key)) return;
    unsupported.set(key, { command, reason, text: lineText.trim() });
  };

  const addBinding = (token: string, command: VimcCommand, source: string): void => {
    const parsed = parseKeyToken(token);
    if (parsed === undefined) {
      errors.push({ text: source.trim(), message: `无法识别的键位记号：${token}` });
      return;
    }
    bindings.push({
      command,
      code: parsed.code,
      ...(parsed.char === undefined ? {} : { char: parsed.char }),
      requiresShift: parsed.requiresShift,
      modifiers: parsed.modifiers,
      label: parsed.label,
      source: source.trim(),
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const parts = trimmed.split(/\s+/);
    const verb = parts[0]!.toLowerCase();
    if (verb === 'unmapall') {
      unmapAll = true;
      continue;
    }
    if (verb !== 'map' && verb !== 'run') {
      errors.push({ text: trimmed, message: `未知指令：${parts[0]}` });
      continue;
    }
    const keySection = parts[1];
    const rhs = parts[2];
    if (keySection === undefined) {
      errors.push({ text: trimmed, message: '缺少键位' });
      continue;
    }
    if (rhs === undefined) {
      errors.push({ text: trimmed, message: '缺少命令' });
      continue;
    }

    const tokens = splitKeyTokens(keySection);
    if (tokens.length === 0) {
      errors.push({ text: trimmed, message: '缺少键位' });
      continue;
    }
    // 多键序列（`Xx` / `Gg` / `Fq`）本引擎不实现，明确列出而不是悄悄丢掉。
    if (tokens.length > 1) {
      pushUnsupported(commandNameOf(rhs), '多键序列（sequence）未实现', trimmed);
      continue;
    }

    // RHS 是「另一个按键」时（`run q i`、`run <a-c> c`），交给第二遍按 map 表解析。
    if (parseKeyToken(rhs) !== undefined) {
      pendingRuns.push({ keys: tokens, target: rhs, text: trimmed });
      continue;
    }

    const spec = [rhs, ...parts.slice(3)].join(' ');
    const name = commandNameOf(spec);
    const entry = COMMANDS[commandKey(name)];
    if (entry === undefined || !('command' in entry)) {
      pushUnsupported(name, entry === undefined ? '本插件未实现该命令' : entry.reason, trimmed);
      continue;
    }
    addBinding(tokens[0]!, entry.command, trimmed);
    mapTable.set(tokens[0]!, entry.command);
  }

  // 第二遍：`run <键> <另一个键>` —— 另一个键已映射到受支持命令时，等价于该命令。
  for (const pending of pendingRuns) {
    const target = mapTable.get(pending.target);
    if (target === undefined) {
      pushUnsupported(`→ ${pending.target}（按键转发）`, '被转发的键没有映射到本插件支持的命令', pending.text);
      continue;
    }
    const parsed = parseKeyToken(pending.keys[0]!);
    if (parsed !== undefined) mapTable.set(pending.keys[0]!, target);
    addBinding(pending.keys[0]!, target, pending.text);
  }

  return { bindings, unsupported: [...unsupported.values()], errors, unmapAll };
}

function commandNameOf(rhs: string): string {
  return rhs.trim().split(/[\s(:$=]/)[0] ?? rhs.trim();
}

/** 从 `focusInput:(...)%cfocusInput o.select="all-line" o.prefer="…"` 里取选项。 */
export function parseFocusInputOptions(spec: string): { select?: string; prefer?: string[] } {
  const result: { select?: string; prefer?: string[] } = {};
  const select = /o\.select=["']?([a-z-]+)["']?/i.exec(spec);
  if (select?.[1] !== undefined) result.select = select[1];
  const prefer = /o\.prefer=["']([^"']+)["']/i.exec(spec);
  if (prefer?.[1] !== undefined) {
    result.prefer = prefer[1].split(',').map((item) => item.trim()).filter((item) => item !== '');
  }
  return result;
}

// ---------------------------------------------------------------------------
// 选项导出导入
// ---------------------------------------------------------------------------

export interface VimiumImportReport {
  /** 采纳的选项。 */
  readonly adopted: { readonly key: string; readonly detail: string }[];
  /** 未采纳的选项与原因。 */
  readonly ignored: { readonly key: string; readonly reason: string }[];
  /** 源文件元信息（名称/时间/环境）。 */
  readonly source: { readonly name?: string; readonly time?: string; readonly environment?: string };
  /** `keyMappings` 的解析结果。 */
  readonly parse?: KeyMappingParse;
}

export interface VimiumImportResult {
  readonly patch: Record<string, unknown>;
  readonly report: VimiumImportReport;
}

const IGNORED_OPTIONS: Readonly<Record<string, string>> = {
  searchEngines: '搜索引擎列表属于浏览器地址栏能力',
  searchUrl: '同上',
  clipSub: '剪贴板 URL 重写属于浏览器能力',
  allBrowserUrls: '扩展级开关',
  exclusionListenHash: '扩展级开关',
  grabBackFocus: '本插件不接管页面焦点回收（DSH 自己管理焦点）',
  nextPatterns: '`]]` / `[[` 翻页模式未实现',
  previousPatterns: '同上',
  showActionIcon: '扩展 UI 开关',
  vimSync: '扩展同步开关',
  exclusionRules: '仅采纳其 pattern（其余字段不适用）',
};

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * 导入 Vimium-C 的选项导出 JSON。
 *
 * @param raw 解析后的 JSON（对象）。
 * @param current 当前配置（用于把 `prefer` 选择器**追加**在本插件默认之后）。
 */
export function importVimiumConfig(raw: unknown, current: { prefer: readonly string[] }): VimiumImportResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('不是 Vimium-C 的选项导出对象');
  }
  const source = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const adopted: { key: string; detail: string }[] = [];
  const ignored: { key: string; reason: string }[] = [];

  const mappings = source.keyMappings;
  let parse: KeyMappingParse | undefined;
  if (Array.isArray(mappings) && mappings.every((line) => typeof line === 'string')) {
    const text = joinContinuations(mappings as string[]).join('\n');
    parse = parseKeyMappings(text);
    patch.keyMappings = text;
    adopted.push({
      key: 'keyMappings',
      detail: `解析出 ${parse.bindings.length} 个可用键位；${parse.unsupported.length} 个命令本插件不接管；${parse.errors.length} 行语法问题`,
    });
  } else if (mappings !== undefined) {
    ignored.push({ key: 'keyMappings', reason: '不是字符串数组' });
  }

  const hintChars = readString(source, 'linkHintCharacters');
  if (hintChars !== undefined) {
    patch.linkHintCharacters = hintChars;
    adopted.push({ key: 'linkHintCharacters', detail: `链接提示字母表 = ${hintChars}` });
  }

  const step = source.scrollStepSize;
  if (typeof step === 'number' && Number.isFinite(step) && step > 0) {
    patch.scrollStepSize = Math.min(2000, Math.max(1, Math.round(step)));
    adopted.push({ key: 'scrollStepSize', detail: `像素步长 = ${patch.scrollStepSize}px` });
  }

  const keyLayout = source.keyLayout;
  if (typeof keyLayout === 'number') {
    patch.ignoreKeyboardLayout = keyLayout !== 0;
    adopted.push({
      key: 'keyLayout',
      detail: keyLayout === 0 ? '按产出字符匹配（「始终忽略键盘布局」停用）' : `按物理位置匹配（keyLayout=${keyLayout}）`,
    });
  }

  if (typeof source.smoothScroll === 'boolean') {
    patch.smooth = source.smoothScroll;
    adopted.push({ key: 'smoothScroll', detail: `平滑滚动 = ${String(source.smoothScroll)}` });
  }

  if (typeof source.regexFindMode === 'boolean') {
    patch.regexFindMode = source.regexFindMode;
    adopted.push({
      key: 'regexFindMode',
      detail: source.regexFindMode ? '页面内查找按正则解释（`/`）' : '页面内查找按普通子串（`/`）',
    });
  }

  // `exclusionRules` 在导出里是**数组**（`[{ passKeys, pattern }]`）；也容忍单对象写法。
  const rules = source.exclusionRules;
  const ruleList = Array.isArray(rules) ? rules : rules !== null && typeof rules === 'object' ? [rules] : [];
  const patterns = ruleList
    .map((rule) => (rule !== null && typeof rule === 'object' ? (rule as Record<string, unknown>).pattern : undefined))
    .filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim() !== '')
    .map((pattern) => pattern.trim())
    .slice(0, 20);
  if (patterns.length > 0) {
    patch.exclusions = patterns;
    adopted.push({ key: 'exclusionRules.pattern', detail: `命中即整体停用：${patterns.join(' | ')}` });
  }

  for (const [key, reason] of Object.entries(IGNORED_OPTIONS)) {
    if (key === 'exclusionRules') continue;
    if (source[key] !== undefined) ignored.push({ key, reason });
  }
  for (const key of Object.keys(source)) {
    if (['name', '@time', 'time', 'environment'].includes(key)) continue;
    if (key in patch) continue;
    if (Object.keys(IGNORED_OPTIONS).includes(key)) continue;
    if (['keyMappings', 'linkHintCharacters', 'scrollStepSize', 'keyLayout', 'smoothScroll'].includes(key)) continue;
    ignored.push({ key, reason: '本插件没有对应选项' });
  }

  const prefer = parse === undefined ? undefined : focusInputPrefer(source, current);
  if (prefer !== undefined) {
    patch.prefer = prefer;
    adopted.push({ key: 'keyMappings → focusInput o.prefer', detail: `追加为回退选择器：${prefer.slice(1).join(', ') || '（无）'}` });
  }

  return {
    patch,
    report: {
      adopted,
      ignored,
      source: {
        ...(readString(source, 'name') === undefined ? {} : { name: readString(source, 'name') as string }),
        ...(readString(source, '@time') === undefined ? {} : { time: readString(source, '@time') as string }),
        ...(source.environment === undefined ? {} : { environment: JSON.stringify(source.environment) }),
      },
      ...(parse === undefined ? {} : { parse }),
    },
  };
}

/** 把 Vimium 的 `o.prefer`（GitHub 专用选择器）**追加**在本插件默认之后。 */
function focusInputPrefer(source: Record<string, unknown>, current: { prefer: readonly string[] }): string[] | undefined {
  const mappings = source.keyMappings;
  if (!Array.isArray(mappings)) return undefined;
  const text = (mappings as unknown[]).filter((line): line is string => typeof line === 'string').join(' ');
  const options = parseFocusInputOptions(text);
  if (options.prefer === undefined) return undefined;
  const merged = [...current.prefer];
  for (const selector of options.prefer) if (!merged.includes(selector)) merged.push(selector);
  return merged.slice(0, 8);
}

/**
 * 排除规则匹配（Vimium-C 模式语言的子集）。
 *
 * - `/正则/flags`：按正则匹配
 * - `:字面串`：按**前缀**匹配（导出里 `exclusionRules.pattern` 常见这种写法）
 * - 其余：`*` 通配
 */
export function matchesExclusion(pattern: string, href: string): boolean {
  const text = pattern.trim();
  if (text === '') return false;
  if (text.startsWith('/') && text.lastIndexOf('/') > 0) {
    const end = text.lastIndexOf('/');
    const body = text.slice(1, end);
    const flags = text.slice(end + 1).replace(/[^gimsuy]/g, '');
    try {
      return new RegExp(body, flags).test(href);
    } catch {
      return false;
    }
  }
  if (text.startsWith(':')) return href.startsWith(text.slice(1));
  if (text.includes('*')) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
    try {
      return new RegExp(`^${escaped}$`).test(href);
    } catch {
      return false;
    }
  }
  return href === text;
}
