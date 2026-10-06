window.__ModuleLoader__.load({
	id: "@oblivion/vimc",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  __test: () => __test,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/config.ts
var CONFIG_STORAGE_KEY = "oblivion-vimc:settings:v1";
var DEFAULT_HINT_CHARACTERS = "dsavewrqcxz";
var DEFAULT_PAGE_RATIO = 0.6;
var LEGACY_PAGE_RATIOS = [0.9, 0.7];
var DEFAULT_CONFIG = {
  enabled: true,
  pageRatioVertical: DEFAULT_PAGE_RATIO,
  pageRatioHorizontal: DEFAULT_PAGE_RATIO,
  smooth: true,
  select: "all-line",
  ignoreKeyboardLayout: false,
  allowWhileEditing: false,
  escapeToPage: true,
  diagnostics: true,
  prefer: ["[data-composer-input]"],
  scrollStepSize: 90,
  linkHintCharacters: DEFAULT_HINT_CHARACTERS,
  keyMappings: "",
  exclusions: [],
  regexFindMode: false
};
var SELECT_MODES = ["none", "all", "all-line"];
function asBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function asRatio(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(2, Math.max(0.1, value));
}
function asStepSize(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(2e3, Math.max(1, value)));
}
function asSelect(value, fallback) {
  return typeof value === "string" && SELECT_MODES.includes(value) ? value : fallback;
}
function asSelectors(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const selectors = value.filter((item) => typeof item === "string" && item.trim() !== "").slice(0, 8);
  return selectors.length > 0 ? selectors : [...fallback];
}
function asHintCharacters(value, fallback) {
  if (typeof value !== "string") return fallback;
  const unique = [.../* @__PURE__ */ new Set([...value.replace(/\s+/g, "")])].slice(0, 30).join("");
  return unique === "" ? fallback : unique;
}
function asKeyMappings(value, fallback) {
  return typeof value === "string" ? value.slice(0, 2e4) : fallback;
}
function asExclusions(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item) => typeof item === "string" && item.trim() !== "").slice(0, 20);
}
function migrateLegacy(source) {
  if (source.regexFindMode !== void 0) return source;
  const next = { ...source };
  for (const key of ["pageRatioVertical", "pageRatioHorizontal"]) {
    const value = next[key];
    if (typeof value === "number" && LEGACY_PAGE_RATIOS.includes(value)) next[key] = DEFAULT_PAGE_RATIO;
  }
  return next;
}
function normalizeConfig(raw, fallback = DEFAULT_CONFIG) {
  const source = migrateLegacy(raw !== null && typeof raw === "object" ? raw : {});
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
    regexFindMode: asBoolean(source.regexFindMode, fallback.regexFindMode)
  };
}
function readConfig(storage) {
  if (storage === void 0) return { ...DEFAULT_CONFIG };
  try {
    const raw = storage.getItem(CONFIG_STORAGE_KEY);
    if (raw === null || raw === "") return { ...DEFAULT_CONFIG };
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
function writeConfig(storage, patch, current) {
  const next = normalizeConfig({ ...current, ...patch }, current);
  if (storage !== void 0) {
    try {
      storage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch {
    }
  }
  return next;
}
function publicConfig(config) {
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
    keyMappings: config.keyMappings === "" ? "(\u5185\u7F6E\u9ED8\u8BA4)" : `${config.keyMappings.split("\n").length} \u884C`,
    exclusions: config.exclusions,
    regexFindMode: config.regexFindMode
  };
}

// src/client/beat.ts
function createBeatSender(win, getConfig, endpoint = "/oblivion-vimc/beat", intervalMs = 400) {
  let timer = null;
  let scheduled = false;
  let pending = null;
  let closed = false;
  const post = (entry) => {
    const send = win.fetch;
    if (typeof send !== "function") return;
    const payload = {
      version: "0.2.10",
      command: entry.command,
      at: Date.now(),
      userAgent: win.navigator?.userAgent ?? "",
      config: publicConfig(getConfig()),
      ...entry.extra
    };
    try {
      const result = send.call(win, endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      });
      if (result !== null && typeof result === "object" && typeof result.catch === "function") {
        void result.catch(() => void 0);
      }
    } catch {
    }
  };
  const flush = () => {
    timer = null;
    scheduled = false;
    const entry = pending;
    pending = null;
    if (closed || entry === null) return;
    post(entry);
  };
  return {
    send: (command, extra) => {
      if (closed || getConfig().diagnostics !== true) return;
      pending = extra === void 0 ? { command } : { command, extra };
      if (scheduled) return;
      const schedule = win.setTimeout;
      if (typeof schedule !== "function") {
        flush();
        return;
      }
      scheduled = true;
      timer = schedule.call(win, flush, intervalMs);
    },
    dispose: () => {
      closed = true;
      pending = null;
      scheduled = false;
      if (timer !== null && typeof win.clearTimeout === "function") win.clearTimeout(timer);
      timer = null;
    }
  };
}

// src/client/vimium.ts
var COMMANDS = {
  // ---- 滚动 ----
  scrollpageup: { command: "scrollPageUp" },
  scrollpagedown: { command: "scrollPageDown" },
  scrollup: { command: "stepUp" },
  scrolldown: { command: "stepDown" },
  scrollleft: { command: "stepLeft" },
  scrollright: { command: "stepRight" },
  scrollpxup: { command: "stepUp" },
  scrollpxdown: { command: "stepDown" },
  scrollpxleft: { command: "stepLeft" },
  scrollpxright: { command: "stepRight" },
  scrolltotop: { command: "scrollToTop" },
  scrolltobottom: { command: "scrollToBottom" },
  // ---- 焦点 ----
  focusinput: { command: "focusInput" },
  // ---- 链接提示 ----
  "linkhints.activate": { command: "linkHints" },
  "linkhints.activatehover": { command: "linkHints" },
  // ---- 历史（SPA 安全；只动 history，不改地址栏路径） ----
  goback: { command: "goBack" },
  goforward: { command: "goForward" },
  // ---- 本插件自己的命令名（恒等映射）----
  // 让设置页里的键位文本既可以用 Vimium 的词，也可以直接用本插件的词。
  // （`scrollToTop`/`scrollToBottom`/`focusInput` 等本来两边同名，上面已覆盖。）
  stepup: { command: "stepUp" },
  stepdown: { command: "stepDown" },
  stepleft: { command: "stepLeft" },
  stepright: { command: "stepRight" },
  linkhints: { command: "linkHints" },
  previousturn: { command: "previousTurn" },
  nextturn: { command: "nextTurn" },
  openfind: { command: "openFind" },
  findnext: { command: "findNext" },
  findprevious: { command: "findPrevious" },
  // ---- 页面内查找（所有者导出里的 `map / enterFindMode`、`.` performFind、`,` performBackwardsFind）----
  enterfindmode: { command: "openFind" },
  performfind: { command: "findNext" },
  performanotherfind: { command: "findNext" },
  performbackwardsfind: { command: "findPrevious" },
  // ---- 明确不适用：理由要具体，设置页会逐条显示 ----
  reload: { reason: "\u91CD\u8F7D\u4F1A\u91CD\u5EFA\u6574\u4E2A\u4F1A\u8BDD\u754C\u9762\uFF1B\u8BF7\u7528 Ctrl+R" },
  reloadgiventab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  reopentab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  createtab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  reloadtab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  removetab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  previoustab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  nexttab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  movetableft: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  movetabright: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  restoretab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  restoregiventab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  duplicatetab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  togglepintab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  togglecs: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875\u7EA7\u7684\u5185\u5BB9\u811A\u672C\u5F00\u5173" },
  enablecstemp: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875\u7EA7\u7684\u5185\u5BB9\u811A\u672C\u5F00\u5173" },
  clearcs: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875\u7EA7\u7684\u5185\u5BB9\u811A\u672C\u5F00\u5173" },
  closeothertabs: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  closertab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  closelttab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  closetabsonleft: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  closetabsonright: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  movetabtonewwindow: { reason: "DSH \u6CA1\u6709\u7A97\u53E3\u7EA7\u6807\u7B7E\u64CD\u4F5C" },
  movetabtoincognito: { reason: "DSH \u6CA1\u6709\u65E0\u75D5\u7A97\u53E3" },
  movetabtonextwindow: { reason: "DSH \u6CA1\u6709\u591A\u7A97\u53E3\u6807\u7B7E\u64CD\u4F5C" },
  openincognito: { reason: "DSH \u6CA1\u6709\u65E0\u75D5\u7A97\u53E3" },
  vomnibar: { reason: "DSH \u6CA1\u6709\u6D4F\u89C8\u5668\u5730\u5740\u680F/\u641C\u7D22\u5F15\u64CE\u754C\u9762" },
  "vomnibar.activate": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  "vomnibar.activateintab": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  "vomnibar.activateinnewtab": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  "vomnibar.activatetabselection": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  "vomnibar.activatehistoryinnewtab": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  "vomnibar.activatebookmarksinnewtab": { reason: "DSH \u6CA1\u6709 Vomnibar/\u4E66\u7B7E" },
  "vomnibar.activateurl": { reason: "DSH \u6CA1\u6709 Vomnibar" },
  clearfindhistory: { reason: "\u67E5\u627E\u5386\u53F2\u672A\u505A\u6301\u4E45\u5316\uFF0C\u65E0\u9700\u6E05\u9664" },
  enterinsertmode: { reason: "\u672C\u63D2\u4EF6\u7684\u8F93\u5165\u6846\u8FDB\u51FA\u7531 i / Esc \u8D1F\u8D23\uFF0C\u4E0D\u9700\u8981\u63D2\u5165\u6A21\u5F0F" },
  entervisualmode: { reason: "\u53EF\u89C6\u6A21\u5F0F\u672A\u5B9E\u73B0" },
  entervisuallinemode: { reason: "\u53EF\u89C6\u6A21\u5F0F\u672A\u5B9E\u73B0" },
  "marks.activate": { reason: "\u6807\u8BB0\uFF08Marks\uFF09\u672A\u5B9E\u73B0" },
  "marks.create": { reason: "\u6807\u8BB0\uFF08Marks\uFF09\u672A\u5B9E\u73B0" },
  "marks.clearglobal": { reason: "\u6807\u8BB0\uFF08Marks\uFF09\u672A\u5B9E\u73B0" },
  "marks.clearlocal": { reason: "\u6807\u8BB0\uFF08Marks\uFF09\u672A\u5B9E\u73B0" },
  showhelp: { reason: "\u672C\u63D2\u4EF6\u5728\u8BBE\u7F6E\u9875\uFF08\u8BBE\u7F6E \u2192 Oblivion \u952E\u76D8\u5BFC\u822A\uFF09\u7ED9\u51FA\u5168\u90E8\u952E\u4F4D" },
  showtip: { reason: "\u63D0\u793A\u6C14\u6CE1\u672A\u5B9E\u73B0" },
  passnextkey: { reason: "\u6309\u952E\u900F\u4F20\u672A\u5B9E\u73B0\uFF08\u672C\u63D2\u4EF6\u9ED8\u8BA4\u5C31\u4E0D\u62A2\u8F93\u5165\u6846\u91CC\u7684\u952E\uFF09" },
  goup: { reason: "\u4F1A\u6539\u5199\u5E94\u7528\u9875\u9762 URL\uFF0C\u53EF\u80FD\u5F04\u574F\u5F53\u524D\u754C\u9762" },
  gotoroot: { reason: "\u4F1A\u6539\u5199\u5E94\u7528\u9875\u9762 URL\uFF0C\u53EF\u80FD\u5F04\u574F\u5F53\u524D\u754C\u9762" },
  parentframe: { reason: "DSH \u4E3B\u754C\u9762\u6CA1\u6709\u5B50\u6846\u67B6\u5BFC\u822A" },
  nextframe: { reason: "DSH \u4E3B\u754C\u9762\u6CA1\u6709\u5B50\u6846\u67B6\u5BFC\u822A" },
  mainframe: { reason: "DSH \u4E3B\u754C\u9762\u6CA1\u6709\u5B50\u6846\u67B6\u5BFC\u822A" },
  simbackspace: { reason: "\u6A21\u62DF\u9000\u683C\u672A\u5B9E\u73B0" },
  switchfocus: { reason: "\u7126\u70B9\u5207\u6362\u672A\u5B9E\u73B0" },
  focusorlaunch: { reason: "\u542F\u52A8/\u805A\u7126\u5916\u90E8\u7A97\u53E3\u4E0D\u9002\u7528" },
  debugbackground: { reason: "\u8C03\u8BD5\u9762\u677F\u672A\u5B9E\u73B0" },
  opendownloadbar: { reason: "\u6CA1\u6709\u4E0B\u8F7D\u680F" },
  togglelinkhintcharacters: { reason: "\u94FE\u63A5\u63D0\u793A\u5B57\u7B26\u96C6\u8BF7\u5728\u8BBE\u7F6E\u9875\u6539\uFF08\u4E0D\u9700\u70ED\u952E\uFF09" },
  copycurrenturl: { reason: "\u526A\u8D34\u677F\u7C7B\u547D\u4EE4\u672A\u5B9E\u73B0" },
  copycurrenttitle: { reason: "\u526A\u8D34\u677F\u7C7B\u547D\u4EE4\u672A\u5B9E\u73B0" },
  opencopiedurlincurrenttab: { reason: "\u526A\u8D34\u677F\u7C7B\u547D\u4EE4\u672A\u5B9E\u73B0" },
  opencopiedurlinnewtab: { reason: "\u526A\u8D34\u677F\u7C7B\u547D\u4EE4\u672A\u5B9E\u73B0" },
  autocopy: { reason: "\u81EA\u52A8\u590D\u5236\u4E0D\u9002\u7528" },
  autoopen: { reason: "\u641C\u7D22\u7C7B\u547D\u4EE4\u4E0D\u9002\u7528" },
  searchas: { reason: "\u641C\u7D22\u7C7B\u547D\u4EE4\u4E0D\u9002\u7528" },
  searchinanother: { reason: "\u641C\u7D22\u7C7B\u547D\u4EE4\u4E0D\u9002\u7528" },
  visitprevioustab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875" },
  togglemutetab: { reason: "DSH \u6CA1\u6709\u6807\u7B7E\u9875\u97F3\u9891" },
  togglevomnibarstyle: { reason: "DSH \u6CA1\u6709 Vomnibar" },
  openurl: { reason: "\u6253\u5F00\u5916\u90E8 URL \u4E0D\u5728\u672C\u63D2\u4EF6\u804C\u8D23\u5185" },
  lh: { reason: "\u94FE\u63A5\u63D0\u793A\u7684\u5B50\u52A8\u4F5C\uFF08\u590D\u5236/\u4E0B\u8F7D/\u56FE\u7247\u7B49\uFF09\u672A\u5B9E\u73B0\uFF0C\u53EA\u5B9E\u73B0\u4E86 activate" },
  key: { reason: "\u6309\u952E\u5B8F\uFF08key=\uFF09\u672A\u5B9E\u73B0" }
};
var CHAR_CODES = {
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  " ": "Space",
  "<": "Comma",
  ">": "Period",
  "?": "Slash",
  ":": "Semicolon",
  '"': "Quote",
  "{": "BracketLeft",
  "}": "BracketRight",
  "|": "Backslash",
  "+": "Equal",
  "_": "Minus",
  "!": "Digit1",
  "@": "Digit2",
  "#": "Digit3",
  $: "Digit4",
  "%": "Digit5",
  "^": "Digit6",
  "&": "Digit7",
  "*": "Digit8",
  "(": "Digit9",
  ")": "Digit0",
  "~": "Backquote"
};
var SHIFTED_CHARS = /* @__PURE__ */ new Set([...'~!@#$%^&*()_+{}|:"<>?']);
var NAMED_KEYS = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  backspace: "Backspace",
  enter: "Enter",
  esc: "Escape",
  escape: "Escape",
  space: "Space",
  tab: "Tab",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  ...Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`f${index + 1}`, `F${index + 1}`]))
};
var KEY_LABELS = {
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  Escape: "Esc",
  Space: "Space"
};
var MODIFIER_LETTERS = {
  c: "control",
  a: "alt",
  m: "meta",
  s: "shift"
};
var ORDERED_MODIFIERS = ["control", "alt", "meta"];
function modifierPrefix(modifiers, shift) {
  const parts = [];
  if (modifiers.includes("control")) parts.push("Ctrl");
  if (modifiers.includes("alt")) parts.push("Alt");
  if (modifiers.includes("meta")) parts.push("Meta");
  if (shift) parts.push("Shift");
  return parts.length === 0 ? "" : `${parts.join("+")}+`;
}
function labelFor(keycap, modifiers, shift) {
  return `${modifierPrefix(modifiers, shift)}${KEY_LABELS[keycap] ?? keycap}`;
}
function parseKeyToken(token) {
  const text = token.trim();
  if (text === "") return void 0;
  if (text.startsWith("<") && text.endsWith(">")) {
    const parts = text.slice(1, -1).toLowerCase().split("-");
    const last = parts.pop() ?? "";
    const modifiers = [];
    let shift = false;
    for (const part of parts) {
      const modifier = MODIFIER_LETTERS[part];
      if (modifier === void 0) return void 0;
      if (modifier === "shift") shift = true;
      else if (!modifiers.includes(modifier)) modifiers.push(modifier);
    }
    const ordered = ORDERED_MODIFIERS.filter((name2) => modifiers.includes(name2));
    const named = NAMED_KEYS[last];
    if (named !== void 0) {
      const keycap = KEY_LABELS[named] ?? named.replace(/^Arrow/, "");
      return { code: named, requiresShift: shift, modifiers: ordered, label: labelFor(keycap, ordered, shift) };
    }
    if (last.length === 1) {
      const char = last;
      const requiresShift2 = /[A-Z]/.test(char);
      const code2 = charCode(char);
      if (code2 === void 0) return void 0;
      return { code: code2, char: char.toLowerCase(), requiresShift: requiresShift2, modifiers: ordered, label: labelFor(char, ordered, requiresShift2) };
    }
    return void 0;
  }
  if (text.length !== 1) return void 0;
  const requiresShift = /[A-Z]/.test(text) || SHIFTED_CHARS.has(text);
  const code = charCode(text);
  if (code === void 0) return void 0;
  return {
    code,
    char: SHIFTED_CHARS.has(text) ? text : text.toLowerCase(),
    requiresShift,
    modifiers: [],
    label: labelFor(text, [], requiresShift)
  };
}
function charCode(char) {
  if (/^[a-zA-Z]$/.test(char)) return `Key${char.toUpperCase()}`;
  if (/^[0-9]$/.test(char)) return `Digit${char}`;
  return CHAR_CODES[char];
}
function splitKeyTokens(text) {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === "<") {
      const end = text.indexOf(">", index);
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
function joinContinuations(lines) {
  const joined = [];
  let buffer = "";
  for (const raw of lines) {
    const line = buffer === "" ? raw : `${buffer}${raw.trimStart()}`;
    if (line.trimEnd().endsWith("\\")) {
      buffer = `${line.trimEnd().slice(0, -1)}`;
      continue;
    }
    buffer = "";
    joined.push(line);
  }
  if (buffer !== "") joined.push(buffer);
  return joined;
}
function commandKey(raw) {
  return raw.trim().toLowerCase();
}
function parseKeyMappings(text) {
  const lines = joinContinuations(text.split(/\r?\n/));
  const bindings = [];
  const unsupported = /* @__PURE__ */ new Map();
  const errors = [];
  const mapTable = /* @__PURE__ */ new Map();
  const pendingRuns = [];
  let unmapAll = false;
  const pushUnsupported = (command, reason, lineText) => {
    const key = commandKey(command);
    if (unsupported.has(key)) return;
    unsupported.set(key, { command, reason, text: lineText.trim() });
  };
  const addBinding = (token, command, source) => {
    const parsed = parseKeyToken(token);
    if (parsed === void 0) {
      errors.push({ text: source.trim(), message: `\u65E0\u6CD5\u8BC6\u522B\u7684\u952E\u4F4D\u8BB0\u53F7\uFF1A${token}` });
      return;
    }
    bindings.push({
      command,
      code: parsed.code,
      ...parsed.char === void 0 ? {} : { char: parsed.char },
      requiresShift: parsed.requiresShift,
      modifiers: parsed.modifiers,
      label: parsed.label,
      source: source.trim()
    });
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const parts = trimmed.split(/\s+/);
    const verb = parts[0].toLowerCase();
    if (verb === "unmapall") {
      unmapAll = true;
      continue;
    }
    if (verb !== "map" && verb !== "run") {
      errors.push({ text: trimmed, message: `\u672A\u77E5\u6307\u4EE4\uFF1A${parts[0]}` });
      continue;
    }
    const keySection = parts[1];
    const rhs = parts[2];
    if (keySection === void 0) {
      errors.push({ text: trimmed, message: "\u7F3A\u5C11\u952E\u4F4D" });
      continue;
    }
    if (rhs === void 0) {
      errors.push({ text: trimmed, message: "\u7F3A\u5C11\u547D\u4EE4" });
      continue;
    }
    const tokens = splitKeyTokens(keySection);
    if (tokens.length === 0) {
      errors.push({ text: trimmed, message: "\u7F3A\u5C11\u952E\u4F4D" });
      continue;
    }
    if (tokens.length > 1) {
      pushUnsupported(commandNameOf(rhs), "\u591A\u952E\u5E8F\u5217\uFF08sequence\uFF09\u672A\u5B9E\u73B0", trimmed);
      continue;
    }
    if (parseKeyToken(rhs) !== void 0) {
      pendingRuns.push({ keys: tokens, target: rhs, text: trimmed });
      continue;
    }
    const spec = [rhs, ...parts.slice(3)].join(" ");
    const name2 = commandNameOf(spec);
    const entry = COMMANDS[commandKey(name2)];
    if (entry === void 0 || !("command" in entry)) {
      pushUnsupported(name2, entry === void 0 ? "\u672C\u63D2\u4EF6\u672A\u5B9E\u73B0\u8BE5\u547D\u4EE4" : entry.reason, trimmed);
      continue;
    }
    addBinding(tokens[0], entry.command, trimmed);
    mapTable.set(tokens[0], entry.command);
  }
  for (const pending of pendingRuns) {
    const target = mapTable.get(pending.target);
    if (target === void 0) {
      pushUnsupported(`\u2192 ${pending.target}\uFF08\u6309\u952E\u8F6C\u53D1\uFF09`, "\u88AB\u8F6C\u53D1\u7684\u952E\u6CA1\u6709\u6620\u5C04\u5230\u672C\u63D2\u4EF6\u652F\u6301\u7684\u547D\u4EE4", pending.text);
      continue;
    }
    const parsed = parseKeyToken(pending.keys[0]);
    if (parsed !== void 0) mapTable.set(pending.keys[0], target);
    addBinding(pending.keys[0], target, pending.text);
  }
  return { bindings, unsupported: [...unsupported.values()], errors, unmapAll };
}
function commandNameOf(rhs) {
  return rhs.trim().split(/[\s(:$=]/)[0] ?? rhs.trim();
}
function parseFocusInputOptions(spec) {
  const result = {};
  const select = /o\.select=["']?([a-z-]+)["']?/i.exec(spec);
  if (select?.[1] !== void 0) result.select = select[1];
  const prefer = /o\.prefer=["']([^"']+)["']/i.exec(spec);
  if (prefer?.[1] !== void 0) {
    result.prefer = prefer[1].split(",").map((item) => item.trim()).filter((item) => item !== "");
  }
  return result;
}
var IGNORED_OPTIONS = {
  searchEngines: "\u641C\u7D22\u5F15\u64CE\u5217\u8868\u5C5E\u4E8E\u6D4F\u89C8\u5668\u5730\u5740\u680F\u80FD\u529B",
  searchUrl: "\u540C\u4E0A",
  clipSub: "\u526A\u8D34\u677F URL \u91CD\u5199\u5C5E\u4E8E\u6D4F\u89C8\u5668\u80FD\u529B",
  allBrowserUrls: "\u6269\u5C55\u7EA7\u5F00\u5173",
  exclusionListenHash: "\u6269\u5C55\u7EA7\u5F00\u5173",
  grabBackFocus: "\u672C\u63D2\u4EF6\u4E0D\u63A5\u7BA1\u9875\u9762\u7126\u70B9\u56DE\u6536\uFF08DSH \u81EA\u5DF1\u7BA1\u7406\u7126\u70B9\uFF09",
  nextPatterns: "`]]` / `[[` \u7FFB\u9875\u6A21\u5F0F\u672A\u5B9E\u73B0",
  previousPatterns: "\u540C\u4E0A",
  showActionIcon: "\u6269\u5C55 UI \u5F00\u5173",
  vimSync: "\u6269\u5C55\u540C\u6B65\u5F00\u5173",
  exclusionRules: "\u4EC5\u91C7\u7EB3\u5176 pattern\uFF08\u5176\u4F59\u5B57\u6BB5\u4E0D\u9002\u7528\uFF09"
};
function readString(source, key) {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : void 0;
}
function importVimiumConfig(raw, current) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("\u4E0D\u662F Vimium-C \u7684\u9009\u9879\u5BFC\u51FA\u5BF9\u8C61");
  }
  const source = raw;
  const patch = {};
  const adopted = [];
  const ignored = [];
  const mappings = source.keyMappings;
  let parse;
  if (Array.isArray(mappings) && mappings.every((line) => typeof line === "string")) {
    const text = joinContinuations(mappings).join("\n");
    parse = parseKeyMappings(text);
    patch.keyMappings = text;
    adopted.push({
      key: "keyMappings",
      detail: `\u89E3\u6790\u51FA ${parse.bindings.length} \u4E2A\u53EF\u7528\u952E\u4F4D\uFF1B${parse.unsupported.length} \u4E2A\u547D\u4EE4\u672C\u63D2\u4EF6\u4E0D\u63A5\u7BA1\uFF1B${parse.errors.length} \u884C\u8BED\u6CD5\u95EE\u9898`
    });
  } else if (mappings !== void 0) {
    ignored.push({ key: "keyMappings", reason: "\u4E0D\u662F\u5B57\u7B26\u4E32\u6570\u7EC4" });
  }
  const hintChars = readString(source, "linkHintCharacters");
  if (hintChars !== void 0) {
    patch.linkHintCharacters = hintChars;
    adopted.push({ key: "linkHintCharacters", detail: `\u94FE\u63A5\u63D0\u793A\u5B57\u6BCD\u8868 = ${hintChars}` });
  }
  const step = source.scrollStepSize;
  if (typeof step === "number" && Number.isFinite(step) && step > 0) {
    patch.scrollStepSize = Math.min(2e3, Math.max(1, Math.round(step)));
    adopted.push({ key: "scrollStepSize", detail: `\u50CF\u7D20\u6B65\u957F = ${patch.scrollStepSize}px` });
  }
  const keyLayout = source.keyLayout;
  if (typeof keyLayout === "number") {
    patch.ignoreKeyboardLayout = keyLayout !== 0;
    adopted.push({
      key: "keyLayout",
      detail: keyLayout === 0 ? "\u6309\u4EA7\u51FA\u5B57\u7B26\u5339\u914D\uFF08\u300C\u59CB\u7EC8\u5FFD\u7565\u952E\u76D8\u5E03\u5C40\u300D\u505C\u7528\uFF09" : `\u6309\u7269\u7406\u4F4D\u7F6E\u5339\u914D\uFF08keyLayout=${keyLayout}\uFF09`
    });
  }
  if (typeof source.smoothScroll === "boolean") {
    patch.smooth = source.smoothScroll;
    adopted.push({ key: "smoothScroll", detail: `\u5E73\u6ED1\u6EDA\u52A8 = ${String(source.smoothScroll)}` });
  }
  if (typeof source.regexFindMode === "boolean") {
    patch.regexFindMode = source.regexFindMode;
    adopted.push({
      key: "regexFindMode",
      detail: source.regexFindMode ? "\u9875\u9762\u5185\u67E5\u627E\u6309\u6B63\u5219\u89E3\u91CA\uFF08`/`\uFF09" : "\u9875\u9762\u5185\u67E5\u627E\u6309\u666E\u901A\u5B50\u4E32\uFF08`/`\uFF09"
    });
  }
  const rules = source.exclusionRules;
  const ruleList = Array.isArray(rules) ? rules : rules !== null && typeof rules === "object" ? [rules] : [];
  const patterns = ruleList.map((rule) => rule !== null && typeof rule === "object" ? rule.pattern : void 0).filter((pattern) => typeof pattern === "string" && pattern.trim() !== "").map((pattern) => pattern.trim()).slice(0, 20);
  if (patterns.length > 0) {
    patch.exclusions = patterns;
    adopted.push({ key: "exclusionRules.pattern", detail: `\u547D\u4E2D\u5373\u6574\u4F53\u505C\u7528\uFF1A${patterns.join(" | ")}` });
  }
  for (const [key, reason] of Object.entries(IGNORED_OPTIONS)) {
    if (key === "exclusionRules") continue;
    if (source[key] !== void 0) ignored.push({ key, reason });
  }
  for (const key of Object.keys(source)) {
    if (["name", "@time", "time", "environment"].includes(key)) continue;
    if (key in patch) continue;
    if (Object.keys(IGNORED_OPTIONS).includes(key)) continue;
    if (["keyMappings", "linkHintCharacters", "scrollStepSize", "keyLayout", "smoothScroll"].includes(key)) continue;
    ignored.push({ key, reason: "\u672C\u63D2\u4EF6\u6CA1\u6709\u5BF9\u5E94\u9009\u9879" });
  }
  const prefer = parse === void 0 ? void 0 : focusInputPrefer(source, current);
  if (prefer !== void 0) {
    patch.prefer = prefer;
    adopted.push({ key: "keyMappings \u2192 focusInput o.prefer", detail: `\u8FFD\u52A0\u4E3A\u56DE\u9000\u9009\u62E9\u5668\uFF1A${prefer.slice(1).join(", ") || "\uFF08\u65E0\uFF09"}` });
  }
  return {
    patch,
    report: {
      adopted,
      ignored,
      source: {
        ...readString(source, "name") === void 0 ? {} : { name: readString(source, "name") },
        ...readString(source, "@time") === void 0 ? {} : { time: readString(source, "@time") },
        ...source.environment === void 0 ? {} : { environment: JSON.stringify(source.environment) }
      },
      ...parse === void 0 ? {} : { parse }
    }
  };
}
function focusInputPrefer(source, current) {
  const mappings = source.keyMappings;
  if (!Array.isArray(mappings)) return void 0;
  const text = mappings.filter((line) => typeof line === "string").join(" ");
  const options = parseFocusInputOptions(text);
  if (options.prefer === void 0) return void 0;
  const merged = [...current.prefer];
  for (const selector of options.prefer) if (!merged.includes(selector)) merged.push(selector);
  return merged.slice(0, 8);
}
function matchesExclusion(pattern, href) {
  const text = pattern.trim();
  if (text === "") return false;
  if (text.startsWith("/") && text.lastIndexOf("/") > 0) {
    const end = text.lastIndexOf("/");
    const body = text.slice(1, end);
    const flags = text.slice(end + 1).replace(/[^gimsuy]/g, "");
    try {
      return new RegExp(body, flags).test(href);
    } catch {
      return false;
    }
  }
  if (text.startsWith(":")) return href.startsWith(text.slice(1));
  if (text.includes("*")) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
    try {
      return new RegExp(`^${escaped}$`).test(href);
    } catch {
      return false;
    }
  }
  return href === text;
}

// src/client/keys.ts
var DEFAULT_KEY_MAPPINGS = [
  "# Oblivion vimc \u5185\u7F6E\u9ED8\u8BA4\u952E\u4F4D\uFF08Vimium-C map/run \u8BED\u6CD5\uFF1B\u6539\u52A8\u4F1A\u8986\u76D6\u540C\u952E\u4F4D\u7684\u9ED8\u8BA4\u503C\uFF09",
  "map w scrollPageUp",
  "map s scrollPageDown",
  "map a scrollLeft",
  "map d scrollRight",
  "map W scrollToTop",
  "map S scrollToBottom",
  "map [ previousTurn",
  "map ] nextTurn",
  "map / openFind",
  "map . findNext",
  "map , findPrevious",
  "map f LinkHints.activate",
  "map i focusInput",
  "map <c-up> scrollPxUp",
  "map <c-down> scrollPxDown",
  "map <c-left> scrollPxLeft",
  "map <c-right> scrollPxRight"
].join("\n");
var SCROLL_COMMANDS = /* @__PURE__ */ new Set([
  "scrollPageUp",
  "scrollPageDown",
  "stepUp",
  "stepDown",
  "stepLeft",
  "stepRight",
  "scrollToTop",
  "scrollToBottom"
]);
function bindingKey(binding) {
  return [binding.code, binding.char ?? "", binding.requiresShift ? "s" : "-", [...binding.modifiers].sort().join("+")].join("|");
}
function resolveBindings(text) {
  const parsed = parseKeyMappings(text.trim() === "" ? DEFAULT_KEY_MAPPINGS : text);
  if (parsed.unmapAll) return parsed;
  const defaults = parseKeyMappings(DEFAULT_KEY_MAPPINGS);
  const merged = /* @__PURE__ */ new Map();
  for (const binding of defaults.bindings) merged.set(bindingKey(binding), binding);
  for (const binding of parsed.bindings) merged.set(bindingKey(binding), binding);
  return {
    bindings: [...merged.values()],
    unsupported: parsed.unsupported,
    errors: parsed.errors,
    unmapAll: parsed.unmapAll
  };
}
function normalizedNamedKey(key) {
  if (key === void 0) return void 0;
  if (key === " ") return "Space";
  if (key === "Esc") return "Escape";
  return key;
}
function matchBinding(event, bindings, ignoreKeyboardLayout = false) {
  if (event.isComposing === true || event.keyCode === 229) return void 0;
  if (event.defaultPrevented === true) return void 0;
  const control = event.ctrlKey === true;
  const alt = event.altKey === true;
  const meta = event.metaKey === true;
  const shift = event.shiftKey === true;
  const code = typeof event.code === "string" ? event.code : void 0;
  const key = typeof event.key === "string" ? event.key : void 0;
  for (const binding of bindings) {
    if (binding.modifiers.includes("control") !== control) continue;
    if (binding.modifiers.includes("alt") !== alt) continue;
    if (binding.modifiers.includes("meta") !== meta) continue;
    if (binding.char !== void 0) {
      if (ignoreKeyboardLayout || key === void 0) {
        if (code !== binding.code) continue;
        if (shift !== binding.requiresShift) continue;
        return binding;
      }
      if (key.length !== 1 || key.toLowerCase() !== binding.char.toLowerCase()) continue;
      if (shift !== binding.requiresShift) continue;
      return binding;
    }
    if (code !== void 0) {
      if (code !== binding.code) continue;
    } else if (normalizedNamedKey(key) !== binding.code) {
      continue;
    }
    if (shift !== binding.requiresShift) continue;
    return binding;
  }
  return void 0;
}
function describeBindings(bindings) {
  return bindings.map((binding) => ({ command: binding.command, key: binding.label, source: binding.source }));
}

// src/client/api.ts
var HELP = [
  "@oblivion/vimc \u2014\u2014 \u628A DSH \u5F53\u6D4F\u89C8\u5668\u7528\uFF08\u9ED8\u8BA4\u952E\u4F4D\uFF0C\u53EF\u5728\u8BBE\u7F6E \u2192 Oblivion \u952E\u76D8\u5BFC\u822A\u91CC\u6539\uFF09",
  "  w / s        \u4E0A\u7FFB / \u4E0B\u7FFB\u4E00\u9875",
  "  a / d        \u5DE6\u79FB / \u53F3\u79FB\u4E00\u5C4F\uFF08scrollStepSize \u50CF\u7D20\uFF09",
  "  W / S        \u56DE\u5230\u9876\u90E8 / \u8DF3\u5230\u5E95\u90E8",
  "  f            \u94FE\u63A5\u63D0\u793A\uFF1A\u5C4F\u5E55\u4E0A\u7684\u53EF\u70B9\u51FB\u5143\u7D20\u6D6E\u51FA\u5B57\u6BCD\uFF0C\u6309\u5B57\u6BCD\u89E6\u53D1",
  "  i            \u805A\u7126\u8F93\u5165\u6846\uFF08\u9ED8\u8BA4\u9009\u4E2D\u5149\u6807\u6240\u5728\u884C\uFF09\uFF0CEsc \u9000\u51FA\u8F93\u5165\u6846",
  "  Ctrl+\u2191\u2193\u2190\u2192    \u50CF\u7D20\u7EA7\u6EDA\u52A8",
  "  oblivionVimc.set({...}) / probe() / hints() / bindings() / importVimium(json)"
].join("\n");
function installApi(win, engine) {
  const version = "0.2.10";
  const api = {
    version,
    status: () => ({
      version,
      enabled: engine.config().enabled,
      handled: engine.handledCount(),
      keys: describeBindings(engine.bindings().bindings),
      unsupported: engine.bindings().unsupported.map((item) => item.command),
      config: engine.config()
    }),
    set: (patch) => engine.update(patch),
    enable: () => engine.update({ enabled: true }),
    disable: () => engine.update({ enabled: false }),
    toggle: () => engine.update({ enabled: !engine.config().enabled }),
    run: (command) => engine.run(command),
    probe: (options) => engine.probe(options),
    hints: () => engine.startHints(),
    bindings: () => engine.bindings(),
    importVimium: (json) => importVimiumConfig(json, { prefer: engine.config().prefer }),
    keys: () => describeBindings(engine.bindings().bindings),
    help: () => HELP
  };
  const holder = win;
  holder.oblivionVimc = api;
  return () => {
    if (holder.oblivionVimc === api) delete holder.oblivionVimc;
  };
}

// src/client/scroller.ts
var SCROLLABLE_OVERFLOW = /* @__PURE__ */ new Set(["auto", "scroll", "overlay"]);
var MIN_OVERFLOW_PX = 4;
var PREFERRED = {
  y: ["[data-conversation-scroll]"],
  x: []
};
function parentOf(element) {
  if (element.parentElement !== null) return element.parentElement;
  const root = typeof element.getRootNode === "function" ? element.getRootNode() : null;
  const host = root !== null && "host" in root ? root.host : null;
  return host ?? null;
}
function overflowAmount(element, axis) {
  return axis === "y" ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth;
}
function overflowOf(win, element, axis) {
  let style = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    style = null;
  }
  if (style === null) return "visible";
  return axis === "y" ? style.overflowY : style.overflowX;
}
function isScrollable(win, element, axis) {
  if (element === null) return false;
  if (overflowAmount(element, axis) <= MIN_OVERFLOW_PX) return false;
  const doc = win.document;
  if (element === doc.scrollingElement || element === doc.documentElement || element === doc.body) return true;
  return SCROLLABLE_OVERFLOW.has(overflowOf(win, element, axis));
}
function nearestScrollable(win, start, axis) {
  for (let element = start; element !== null; element = parentOf(element)) {
    if (isScrollable(win, element, axis)) return element;
  }
  return null;
}
function isRendered(element) {
  try {
    return element.getClientRects().length > 0 && element.clientHeight > 0;
  } catch {
    return true;
  }
}
function describeElement(element) {
  if (element === null) return null;
  const tag = element.tagName.toLowerCase();
  const id = element.id === "" ? "" : `#${element.id}`;
  for (const marker of ["data-conversation-scroll", "data-composer-input", "data-input-scroll"]) {
    if (typeof element.hasAttribute === "function" && element.hasAttribute(marker)) return `${tag}${id}[${marker}]`;
  }
  return `${tag}${id}`;
}
function scrollRange(element, axis) {
  return element === null ? 0 : Math.max(0, overflowAmount(element, axis));
}
function preferredScrollable(win, axis) {
  let winner = null;
  let bestArea = 0;
  for (const selector of PREFERRED[axis]) {
    let matches = [];
    try {
      matches = Array.from(win.document.querySelectorAll(selector));
    } catch {
      matches = [];
    }
    for (const element of matches) {
      if (!isScrollable(win, element, axis) || !isRendered(element)) continue;
      const area = element.clientWidth * element.clientHeight;
      if (area > bestArea) {
        bestArea = area;
        winner = element;
      }
    }
  }
  return winner;
}
function probeCenter(win) {
  const doc = win.document;
  let hit = null;
  if (typeof doc.elementFromPoint === "function") {
    try {
      hit = doc.elementFromPoint(Math.max(1, Math.round(win.innerWidth / 2)), Math.max(1, Math.round(win.innerHeight / 2)));
    } catch {
      hit = null;
    }
  }
  return hit ?? doc.activeElement ?? doc.body ?? null;
}
var Scroller = class {
  constructor(win) {
    this.win = win;
  }
  win;
  last = null;
  /** 该轴当前的滚动目标；找不到返回 `null`。 */
  target(axis) {
    const doc = this.win.document;
    const fromCenter = nearestScrollable(this.win, probeCenter(this.win), axis);
    if (fromCenter !== null) return fromCenter;
    const preferred = preferredScrollable(this.win, axis);
    if (preferred !== null) return preferred;
    if (isScrollable(this.win, this.last, axis)) return this.last;
    const root = doc.scrollingElement ?? doc.documentElement;
    if (isScrollable(this.win, root, axis)) return root;
    return null;
  }
  /** 按容器可视尺寸的 `ratio` 翻一屏。 */
  page(axis, direction, ratio, smooth) {
    const element = this.target(axis);
    if (element === null) return false;
    const size = axis === "y" ? element.clientHeight : element.clientWidth;
    if (!(size > 0)) return false;
    const step = Math.max(1, Math.round(size * ratio)) * direction;
    return this.move(element, axis === "x" ? step : 0, axis === "y" ? step : 0, smooth);
  }
  /**
   * 按像素步进（Vimium-C 的 `scrollUp/Down/Left/Right`、`scrollPx*`，步长 = `scrollStepSize`）。
   *
   * @param delta 正负像素（正 = 右/下）。
   */
  byPixels(axis, delta, smooth) {
    if (delta === 0) return false;
    const element = this.target(axis);
    if (element === null) return false;
    return this.move(element, axis === "x" ? delta : 0, axis === "y" ? delta : 0, smooth);
  }
  /** 跳到该轴的头部/尾部。 */
  edge(axis, edge, smooth) {
    const element = this.target(axis);
    if (element === null) return false;
    const position = edge === "start" ? 0 : axis === "y" ? element.scrollHeight : element.scrollWidth;
    return this.moveTo(element, axis === "x" ? position : null, axis === "y" ? position : null, smooth);
  }
  /** 丢掉「上次滚动容器」的记忆（卸载时调用）。 */
  forget() {
    this.last = null;
  }
  move(element, left, top, smooth) {
    this.last = element;
    const behavior = smooth ? "smooth" : "instant";
    try {
      if (typeof element.scrollBy === "function") {
        element.scrollBy({ left, top, behavior });
        return true;
      }
    } catch {
    }
    element.scrollLeft += left;
    element.scrollTop += top;
    return true;
  }
  moveTo(element, left, top, smooth) {
    this.last = element;
    const behavior = smooth ? "smooth" : "instant";
    const options = { behavior };
    if (top !== null) options.top = top;
    if (left !== null) options.left = left;
    try {
      if (typeof element.scrollTo === "function") {
        element.scrollTo(options);
        return true;
      }
    } catch {
    }
    if (top !== null) element.scrollTop = top;
    if (left !== null) element.scrollLeft = left;
    return true;
  }
};

// src/client/types.ts
function asElement(value) {
  if (value === null || typeof value !== "object") return null;
  const candidate = value;
  return typeof candidate.closest === "function" ? candidate : null;
}

// src/client/focus.ts
var EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]'
].join(", ");
var TERMINAL_SELECTOR = ".xterm, .xterm-helper-textarea";
var SIDEBAR_SELECTOR = 'aside, nav, [role="navigation"], [data-sidebar]';
var INPUT_SELECTOR = [
  "textarea",
  'input[type="text"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="email"]',
  'input[type="number"]',
  'input[type="password"]',
  "input:not([type])",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]'
].join(", ");
var POPUP_SELECTOR = '[role="dialog"], [role="menu"], [role="listbox"], [data-shortcut-modal]';
function closest(element, selector) {
  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}
function isEditableElement(element) {
  if (element === null) return false;
  if (closest(element, EDITABLE_SELECTOR) !== null) return true;
  return closest(element, TERMINAL_SELECTOR) !== null;
}
function isEditableFocus(win, target) {
  const fromEvent = asElement(target);
  if (isEditableElement(fromEvent)) return true;
  const active = win.document.activeElement;
  return isEditableElement(active === void 0 ? null : active);
}
function eventTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : void 0;
  const first = path !== void 0 && path.length > 0 ? path[0] : void 0;
  if (first !== void 0 && first !== null) return first;
  return event.target ?? null;
}
function hasOpenPopup(win) {
  try {
    return win.document.querySelector(POPUP_SELECTOR) !== null;
  } catch {
    return false;
  }
}
function isVisible(win, element) {
  if (typeof element.hasAttribute === "function" && element.hasAttribute("hidden")) return false;
  if (typeof element.getAttribute === "function" && element.getAttribute("aria-hidden") === "true") return false;
  try {
    const rects = element.getClientRects();
    if (rects.length === 0) return false;
  } catch {
  }
  let style = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    style = null;
  }
  if (style === null) return true;
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  return !(style.opacity !== "" && Number(style.opacity) === 0);
}
function isUsable(element, win, lenient) {
  const candidate = element;
  if (typeof candidate.focus !== "function") return false;
  if (!lenient) {
    if (candidate.disabled === true || candidate.readOnly === true) return false;
    if (typeof element.getAttribute === "function") {
      if (element.getAttribute("aria-disabled") === "true") return false;
      if (element.getAttribute("contenteditable") === "false") return false;
    }
  }
  return isVisible(win, element);
}
function score(win, element) {
  const inSidebar = closest(element, SIDEBAR_SELECTOR) !== null;
  let rect = null;
  try {
    rect = element.getBoundingClientRect();
  } catch {
    rect = null;
  }
  const width = rect === null ? 0 : rect.width;
  const height = rect === null ? 0 : rect.height;
  const onScreen = rect !== null && rect.bottom > 0 && rect.top < win.innerHeight ? 100 : 0;
  const area = Math.min(300, Math.log10(1 + Math.max(0, width * height)) * 60);
  let proximity = 0;
  if (rect !== null) {
    const distance = Math.hypot(
      rect.left + width / 2 - win.innerWidth / 2,
      rect.top + height / 2 - win.innerHeight / 2
    );
    const span = Math.hypot(win.innerWidth, win.innerHeight) || 1;
    proximity = (1 - Math.min(1, distance / span)) * 120;
  }
  return (inSidebar ? 0 : 400) + onScreen + area + proximity;
}
function queryAll(win, selector) {
  try {
    return Array.from(win.document.querySelectorAll(selector));
  } catch {
    return [];
  }
}
function best(candidates, win, lenient) {
  let winner = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (!isUsable(candidate, win, lenient)) continue;
    const value = score(win, candidate);
    if (value > bestScore) {
      bestScore = value;
      winner = candidate;
    }
  }
  return winner === null ? null : winner;
}
function findInput(win, prefer) {
  for (const selector of prefer) {
    const found = best(queryAll(win, selector), win, true);
    if (found !== null) return { element: found, via: selector };
  }
  const fallback = best(queryAll(win, INPUT_SELECTOR), win, false);
  return fallback === null ? null : { element: fallback, via: "generic" };
}
function isContentEditableHost(element) {
  let attribute = null;
  try {
    attribute = element.getAttribute("contenteditable");
  } catch {
    attribute = null;
  }
  if (attribute !== null && attribute !== "false") return true;
  return element.isContentEditable === true;
}
function isTextControl(element) {
  const candidate = element;
  return typeof candidate.setSelectionRange === "function" || typeof candidate.value === "string";
}
function lastLineStart(text) {
  const index = text.lastIndexOf("\n");
  return index < 0 ? 0 : index + 1;
}
function applySelection(win, element, mode) {
  const doc = win.document;
  if (isContentEditableHost(element)) {
    const selection = typeof win.getSelection === "function" ? win.getSelection() : typeof doc.getSelection === "function" ? doc.getSelection() : null;
    if (selection === null) return;
    const range = doc.createRange();
    if (mode === "all") {
      range.selectNodeContents(element);
    } else {
      range.selectNodeContents(element);
      range.collapse(false);
      selectLastLine(element, range);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  if (isTextControl(element)) {
    const value = element.value;
    const end = value.length;
    const start = mode === "all" ? 0 : lastLineStart(value);
    element.setSelectionRange(start, end);
  }
}
function selectLastLine(element, range) {
  const doc = element.ownerDocument;
  if (doc === null || typeof doc.createTreeWalker !== "function") return;
  const nodes = [];
  let total = 0;
  try {
    const walker = doc.createTreeWalker(
      element,
      4
      /* NodeFilter.SHOW_TEXT：用数字常量，避免依赖全局 NodeFilter */
    );
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node;
      nodes.push(text);
      total += text.data.length;
    }
  } catch {
    return;
  }
  if (nodes.length === 0 || total === 0) return;
  const content = nodes.map((node) => node.data).join("");
  const start = lastLineStart(content);
  if (start <= 0) return;
  let consumed = 0;
  for (const node of nodes) {
    const length = node.data.length;
    if (start <= consumed + length) {
      range.setStart(node, start - consumed);
      return;
    }
    consumed += length;
  }
}
function focusTarget(win, element, mode) {
  try {
    element.focus({ preventScroll: false });
  } catch {
    try {
      element.focus();
    } catch {
      return false;
    }
  }
  if (mode !== "none") {
    try {
      applySelection(win, element, mode);
    } catch {
    }
  }
  return true;
}
function blurActive(win) {
  const active = win.document.activeElement;
  if (active === null || typeof active.blur !== "function") return false;
  try {
    active.blur();
  } catch {
    return false;
  }
  return true;
}

// src/client/hints.ts
var CLICKABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
  "select",
  "summary",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  "[onclick]",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");
var MAX_HINTS = 400;
var HINT_CONTAINER_ATTRIBUTE = "data-vimc-hints";
var HINT_LABEL_ATTRIBUTE = "data-vimc-hint";
function generateHintStrings(count, characters) {
  const alphabet = [...characters];
  const size = alphabet.length;
  if (count <= 0 || size === 0) return [];
  if (count <= size) return alphabet.slice(0, count);
  let short = 0;
  for (let candidate = size - 1; candidate >= 1; candidate -= 1) {
    if (count - candidate <= (size - candidate) * size) {
      short = candidate;
      break;
    }
  }
  if (short > 0) {
    const mixed = alphabet.slice(0, short);
    for (const first of alphabet.slice(short)) {
      for (const char of alphabet) {
        if (mixed.length >= count) break;
        mixed.push(`${first}${char}`);
      }
      if (mixed.length >= count) break;
    }
    if (mixed.length >= count) return mixed.slice(0, count);
  }
  let digits = 1;
  let capacity = size;
  while (capacity < count) {
    digits += 1;
    capacity *= size;
  }
  const hints = [];
  const build = (prefix, remaining) => {
    if (hints.length >= count) return;
    if (remaining === 0) {
      hints.push(prefix);
      return;
    }
    for (const char of alphabet) {
      if (hints.length >= count) return;
      build(`${prefix}${char}`, remaining - 1);
    }
  };
  build("", digits);
  return hints.slice(0, count);
}
function rectOf(element) {
  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
}
function isCandidate(element) {
  if (typeof element.hasAttribute === "function") {
    if (element.hasAttribute("hidden")) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    if (element.getAttribute("aria-disabled") === "true") return false;
    if (element.getAttribute("disabled") !== null) return false;
  }
  const candidate = element;
  if (candidate.disabled === true) return false;
  return candidate.type !== "hidden";
}
function styledVisible(win, element) {
  let style = null;
  try {
    style = win.getComputedStyle(element);
  } catch {
    return true;
  }
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (style.opacity !== "" && Number(style.opacity) === 0) return false;
  return style.pointerEvents !== "none";
}
function candidateVisible(win, element) {
  const capable = element;
  if (capable.style !== void 0 && capable.style.pointerEvents === "none") return false;
  if (typeof capable.checkVisibility === "function") {
    try {
      return capable.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    } catch {
    }
  }
  return styledVisible(win, element);
}
function inViewport(win, rect) {
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < win.innerHeight && rect.right > 0 && rect.left < win.innerWidth;
}
var REFERENCE_PATH = /[/\\]/;
var REFERENCE_AT = /^@/;
var REFERENCE_EXTENSION = /\.(?:md|markdown|txt|json|jsonc|ya?ml|toml|ini|cfg|conf|ts|tsx|js|jsx|mjs|cjs|css|scss|less|html?|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|sql|xml|svg|png|jpe?g|gif|webp|log|lock|env)$/i;
function referenceSignal(element) {
  if (isLinkish(element)) return "link";
  if (typeof element.getAttribute !== "function") return null;
  for (const name2 of ["title", "aria-label"]) {
    const value = element.getAttribute(name2);
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.length > 200) continue;
    if (REFERENCE_AT.test(trimmed)) return "at";
    if (REFERENCE_PATH.test(trimmed)) return "path";
    if (REFERENCE_EXTENSION.test(trimmed)) return "ext";
  }
  return null;
}
function isReference(element) {
  return referenceSignal(element) !== null;
}
function isLinkish(element) {
  if (typeof element.getAttribute === "function") {
    if (element.getAttribute("role") === "link") return true;
    if (element.getAttribute("data-href") !== null) return true;
  }
  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  if (tag === "a" && typeof element.hasAttribute === "function" && element.hasAttribute("href")) return true;
  return typeof element.closest === "function" && element.closest("a[href]") !== null;
}
function scanClickable(win, options = {}) {
  let nodes = [];
  try {
    nodes = Array.from(win.document.querySelectorAll(CLICKABLE_SELECTOR));
  } catch {
    return { elements: [], matched: 0, tiers: { references: 0, content: 0, outer: 0 }, referenceSignals: [] };
  }
  const matched = nodes.length;
  const primary = options.primary ?? null;
  const inPrimary = (element) => primary !== null && typeof primary.contains === "function" && primary.contains(element);
  const tierOf = (element) => inPrimary(element) ? isReference(element) ? 0 : 1 : 2;
  const candidates = [];
  for (const element of nodes) {
    if (candidates.length >= MAX_HINTS) break;
    if (element.closest(`[${HINT_CONTAINER_ATTRIBUTE}],[aria-hidden="true"]`) !== null) continue;
    if (!isCandidate(element)) continue;
    if (!candidateVisible(win, element)) continue;
    const rect = rectOf(element);
    if (rect === null || !inViewport(win, rect)) continue;
    candidates.push({ element, rect });
  }
  const inner = candidates.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.element.contains(other.element)));
  inner.sort((left, right) => {
    const tierGap = tierOf(left.element) - tierOf(right.element);
    if (tierGap !== 0) return tierGap;
    const rowGap = Math.round(left.rect.top / 8) - Math.round(right.rect.top / 8);
    return rowGap !== 0 ? rowGap : left.rect.left - right.rect.left;
  });
  const tiers = { references: 0, content: 0, outer: 0 };
  const signals = [];
  for (const candidate of inner) {
    const tier = tierOf(candidate.element);
    if (tier === 0) {
      tiers.references += 1;
      if (signals.length < 3) {
        const signal = referenceSignal(candidate.element);
        if (signal !== null) signals.push(signal);
      }
    } else if (tier === 1) tiers.content += 1;
    else tiers.outer += 1;
  }
  return { elements: inner.map((candidate) => candidate.element), matched, tiers, referenceSignals: signals };
}
function collectClickable(win) {
  return scanClickable(win).elements;
}
var LABEL_STYLE = {
  position: "fixed",
  zIndex: "2147483647",
  padding: "0 3px",
  margin: "0",
  background: "#ffd76e",
  color: "#1f1f1f",
  border: "1px solid #b8860b",
  borderRadius: "3px",
  boxShadow: "0 1px 2px rgba(0,0,0,.35)",
  font: "700 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  letterSpacing: "0.5px",
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap"
};
function applyStyle(element, style) {
  for (const [property, value] of Object.entries(style)) {
    element.style.setProperty(property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`), value);
  }
}
function activateElement(win, element) {
  const rect = rectOf(element);
  const view = win;
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: win,
    button: 0,
    buttons: 1,
    clientX: rect === null ? 0 : rect.left + rect.width / 2,
    clientY: rect === null ? 0 : rect.top + rect.height / 2
  };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    const Constructor = type.startsWith("pointer") ? view.PointerEvent ?? view.MouseEvent : view.MouseEvent;
    if (Constructor === void 0) continue;
    try {
      element.dispatchEvent(new Constructor(type, base));
    } catch {
    }
  }
}
function createHints(win, getConfig, deps = {}) {
  let container = null;
  let labels = [];
  let prefix = "";
  let frame = null;
  let sessions = 0;
  let lastScanMs = 0;
  let lastCandidateCount = 0;
  let lastMatchedCount = 0;
  const now = () => typeof win.performance?.now === "function" ? win.performance.now() : Date.now();
  const teardown = () => {
    for (const label of labels) label.node.remove();
    labels = [];
    container?.remove();
    container = null;
    prefix = "";
  };
  const reposition = () => {
    if (container === null) return;
    for (const label of labels) {
      const rect = rectOf(label.element);
      if (rect === null) continue;
      label.node.style.setProperty("left", `${Math.round(rect.left)}px`);
      label.node.style.setProperty("top", `${Math.round(rect.top)}px`);
    }
  };
  const onViewportChange = () => {
    if (container === null || frame !== null) return;
    const schedule = win.requestAnimationFrame;
    if (typeof schedule !== "function") {
      reposition();
      return;
    }
    frame = schedule.call(win, () => {
      frame = null;
      reposition();
    });
  };
  const render = () => {
    if (container === null) return;
    for (const label of labels) {
      const matched = label.hint.startsWith(prefix);
      const rest = label.hint.slice(prefix.length);
      label.node.textContent = "";
      label.node.style.setProperty("display", matched ? "block" : "none");
      const typed = win.document.createElement("span");
      typed.textContent = prefix;
      typed.style.setProperty("opacity", "0.45");
      const remaining = win.document.createElement("span");
      remaining.textContent = rest;
      label.node.append(typed, remaining);
    }
  };
  const cancel = () => {
    teardown();
    win.removeEventListener("scroll", onViewportChange, true);
    win.removeEventListener("resize", onViewportChange, true);
  };
  const start = () => {
    cancel();
    const config = getConfig();
    const started = now();
    const scan = scanClickable(win, { primary: deps.primary?.() ?? null });
    const candidates = scan.elements;
    lastScanMs = now() - started;
    lastCandidateCount = candidates.length;
    lastMatchedCount = scan.matched;
    sessions += 1;
    if (candidates.length === 0) return false;
    const hints = generateHintStrings(candidates.length, config.linkHintCharacters);
    const overlay = win.document.createElement("div");
    overlay.setAttribute(HINT_CONTAINER_ATTRIBUTE, "");
    applyStyle(overlay, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none",
      contain: "layout style"
    });
    labels = candidates.map((element, index) => {
      const hint = hints[index] ?? "";
      const node = win.document.createElement("span");
      node.setAttribute(HINT_LABEL_ATTRIBUTE, hint);
      applyStyle(node, LABEL_STYLE);
      const rect = rectOf(element);
      if (rect !== null) {
        node.style.setProperty("left", `${Math.round(rect.left)}px`);
        node.style.setProperty("top", `${Math.round(rect.top)}px`);
      }
      overlay.append(node);
      return { hint, element, node };
    });
    win.document.body.append(overlay);
    container = overlay;
    prefix = "";
    render();
    win.addEventListener("scroll", onViewportChange, true);
    win.addEventListener("resize", onViewportChange, true);
    return true;
  };
  return {
    active: () => container !== null,
    start,
    handleKey: (event) => {
      if (container === null) return false;
      if (event.defaultPrevented === true) return false;
      if (event.key === "Escape") {
        cancel();
        return true;
      }
      if (event.repeat === true) return true;
      if (event.ctrlKey === true || event.altKey === true || event.metaKey === true) return false;
      const key = typeof event.key === "string" ? event.key : "";
      if (key.length !== 1) return false;
      const char = key.toLowerCase();
      const alphabet = [...getConfig().linkHintCharacters];
      if (!alphabet.includes(char)) {
        cancel();
        return false;
      }
      const next = `${prefix}${char}`;
      const matches = labels.filter((label) => label.hint.startsWith(next));
      if (matches.length === 0) {
        cancel();
        return true;
      }
      if (matches.length === 1) {
        const target = matches[0].element;
        cancel();
        activateElement(win, target);
        return true;
      }
      prefix = next;
      render();
      return true;
    },
    cancel,
    stats: () => ({ sessions, lastScanMs, lastCandidateCount, lastMatchedCount }),
    dispose: () => {
      cancel();
      if (frame !== null && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(frame);
      frame = null;
    }
  };
}
function describeCandidateAttrs(elements, limit = 3) {
  return elements.slice(0, limit).map((element) => {
    const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "unknown";
    const names = [];
    try {
      for (const attribute of Array.from(element.attributes ?? [])) names.push(attribute.name);
    } catch {
    }
    return names.length === 0 ? tag : `${tag}[${names.sort().join(",")}]`;
  });
}

// src/client/find.ts
var ALL_HIGHLIGHT = "vimc-find";
var CURRENT_HIGHLIGHT = "vimc-find-current";
var MAX_MATCHES = 2e3;
var INPUT_DEBOUNCE_MS = 120;
var LANDING_RATIO = 0.25;
var PING_MS = 1200;
var PING_MAX_RECTS = 8;
var FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
function ensureStyle(win) {
  const doc = win.document;
  if (doc.querySelector("style[data-vimc-find-style]") !== null) return;
  const style = doc.createElement("style");
  style.setAttribute("data-vimc-find-style", "");
  style.textContent = [
    // ⚠️ `::highlight()` 只接受**允许的属性**，且必须是长写属性：
    // 写 `background:` 简写在某些构建里会被整条丢弃（表现为「死活没有高亮」）。
    `::highlight(${ALL_HIGHLIGHT}) { background-color: #ffd76e; color: #1f1f1f; }`,
    `::highlight(${CURRENT_HIGHLIGHT}) { background-color: #ff9f1a; color: #1f1f1f; }`
  ].join("\n");
  doc.head.append(style);
}
function clearHighlights(win) {
  const registry = win.CSS?.highlights;
  if (registry === void 0) return;
  try {
    registry.delete(ALL_HIGHLIGHT);
    registry.delete(CURRENT_HIGHLIGHT);
  } catch {
  }
}
function paintHighlights(win, all, current) {
  const css = win.CSS;
  const registry = css?.highlights;
  const HighlightConstructor = css?.Highlight;
  if (registry === void 0 || HighlightConstructor === void 0) return;
  try {
    registry.delete(ALL_HIGHLIGHT);
    registry.delete(CURRENT_HIGHLIGHT);
    if (all.length > 0) registry.set(ALL_HIGHLIGHT, new HighlightConstructor(...all));
    if (current !== void 0) registry.set(CURRENT_HIGHLIGHT, new HighlightConstructor(current));
  } catch {
  }
}
var SHOW_TEXT = 4;
function collectRanges(win, root, query, regex) {
  const doc = win.document;
  const ranges = [];
  if (query === "") return ranges;
  const caseSensitive = /[A-Z]/.test(query);
  let pattern = null;
  if (regex) {
    try {
      pattern = new RegExp(query, caseSensitive ? "gu" : "giu");
    } catch {
      return ranges;
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  let walker;
  try {
    walker = doc.createTreeWalker(root, SHOW_TEXT);
  } catch {
    return ranges;
  }
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node;
    const data = text.data;
    if (data === "") continue;
    if (pattern !== null) {
      pattern.lastIndex = 0;
      for (const match of data.matchAll(pattern)) {
        const index = match.index ?? 0;
        const length = match[0].length;
        if (length === 0) continue;
        const range = doc.createRange();
        try {
          range.setStart(text, index);
          range.setEnd(text, index + length);
        } catch {
          continue;
        }
        ranges.push(range);
        if (ranges.length >= MAX_MATCHES) return ranges;
      }
      continue;
    }
    const haystack = caseSensitive ? data : data.toLowerCase();
    let from = 0;
    for (; ; ) {
      const index = haystack.indexOf(needle, from);
      if (index < 0) break;
      const range = doc.createRange();
      try {
        range.setStart(text, index);
        range.setEnd(text, index + needle.length);
      } catch {
        break;
      }
      ranges.push(range);
      if (ranges.length >= MAX_MATCHES) return ranges;
      from = index + Math.max(1, needle.length);
    }
  }
  return ranges;
}
function createFind(win, getConfig, deps) {
  let overlay = null;
  let input = null;
  let committedText = null;
  let counter = null;
  let timer = null;
  let ranges = [];
  let index = -1;
  let query = "";
  let scanMs = 0;
  let pings = 0;
  let pingRepositions = 0;
  let pingState = null;
  let pingTimer = null;
  let pingFrame = null;
  let committed = false;
  let previousFocus = null;
  const now = () => typeof win.performance?.now === "function" ? win.performance.now() : Date.now();
  const scopeElement = () => deps.scope?.() ?? win.document.body;
  const isRendered2 = (range) => {
    const capable = range;
    if (typeof capable.getClientRects !== "function") return true;
    try {
      return capable.getClientRects().length > 0;
    } catch {
      return true;
    }
  };
  const reveal = (range) => {
    const start = range.startContainer;
    const element = start.nodeType === 1 ? start : start.parentElement;
    if (element === null || typeof element.closest !== "function") return false;
    const details = element.closest("details:not([open])");
    if (details === null) return false;
    const summary = details.querySelector("summary");
    try {
      if (summary !== null && typeof summary.click === "function") {
        summary.click();
        if (!details.open) details.open = true;
        return true;
      }
      details.open = true;
      return true;
    } catch {
      return false;
    }
  };
  const nodeIds = /* @__PURE__ */ new WeakMap();
  let nextNodeId = 1;
  const keyOf = (range) => {
    const node = range.startContainer;
    let id = nodeIds.get(node);
    if (id === void 0) {
      id = nextNodeId;
      nextNodeId += 1;
      nodeIds.set(node, id);
    }
    return `${String(id)}:${String(range.startOffset)}`;
  };
  const scrollerElement = () => deps.scroller();
  const scrollToCurrent = () => {
    const range = ranges[index];
    const scroller = scrollerElement();
    if (range === void 0 || scroller === null) return;
    let rect;
    try {
      rect = range.getBoundingClientRect();
    } catch {
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = rect.top - scrollerRect.top - scroller.clientHeight * LANDING_RATIO;
    const top = Math.max(0, scroller.scrollTop + delta);
    const behavior = getConfig().smooth ? "smooth" : "instant";
    try {
      if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior });
      else scroller.scrollTop = top;
    } catch {
      scroller.scrollTop = top;
    }
  };
  const pingRects = (range) => {
    const capable = range;
    let rects = [];
    try {
      if (typeof capable.getClientRects === "function") rects = Array.from(capable.getClientRects());
      if (rects.length === 0) rects = [range.getBoundingClientRect()];
    } catch {
      return [];
    }
    return rects.filter((rect) => rect.width > 0 && rect.height > 0).slice(0, PING_MAX_RECTS);
  };
  const placePing = () => {
    const state = pingState;
    if (state === null) return;
    const doc = win.document;
    const rects = pingRects(state.range);
    if (rects.length === 0) return;
    while (state.boxes.length < rects.length) {
      const box = doc.createElement("div");
      box.setAttribute("data-vimc-find-ping", "");
      Object.assign(box.style, {
        position: "fixed",
        border: "2px solid #ff9f1a",
        borderRadius: "3px",
        boxShadow: "0 0 0 2px rgba(255,159,26,.28)",
        pointerEvents: "none",
        zIndex: "2147483646",
        opacity: "1",
        transition: "opacity 240ms ease-out"
      });
      doc.body.append(box);
      state.boxes.push(box);
    }
    for (const [offset, box] of state.boxes.entries()) {
      const rect = rects[offset];
      if (rect === void 0) {
        box.style.display = "none";
        continue;
      }
      box.style.display = "block";
      box.style.left = `${String(Math.max(0, rect.left - 2))}px`;
      box.style.top = `${String(Math.max(0, rect.top - 2))}px`;
      box.style.width = `${String(rect.width + 4)}px`;
      box.style.height = `${String(rect.height + 4)}px`;
    }
    pingRepositions += 1;
  };
  const onPingViewportChange = () => {
    if (pingState === null) return;
    if (pingFrame !== null) return;
    if (typeof win.requestAnimationFrame !== "function") {
      placePing();
      return;
    }
    pingFrame = win.requestAnimationFrame(() => {
      pingFrame = null;
      placePing();
    });
  };
  const removePing = () => {
    if (pingTimer !== null && typeof win.clearTimeout === "function") win.clearTimeout(pingTimer);
    pingTimer = null;
    if (pingFrame !== null && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(pingFrame);
    pingFrame = null;
    if (pingState !== null) {
      for (const box of pingState.boxes) box.remove();
      pingState = null;
      win.removeEventListener("scroll", onPingViewportChange, true);
      win.removeEventListener("resize", onPingViewportChange, true);
    }
  };
  const ping = (range) => {
    removePing();
    if (range === void 0) return;
    if (pingRects(range).length === 0) return;
    pingState = { range, boxes: [] };
    pings += 1;
    placePing();
    win.addEventListener("scroll", onPingViewportChange, true);
    win.addEventListener("resize", onPingViewportChange, true);
    const fade = () => {
      if (pingState === null) return;
      for (const box of pingState.boxes) box.style.opacity = "0";
    };
    if (typeof win.setTimeout === "function") {
      win.setTimeout(fade, Math.max(0, PING_MS - 260));
      pingTimer = win.setTimeout(removePing, PING_MS);
    }
  };
  const syncMode = () => {
    if (overlay !== null) overlay.style.opacity = committed ? "0.9" : "1";
    if (input !== null) input.style.display = committed ? "none" : "inline-block";
    if (committedText !== null) committedText.style.display = committed ? "inline" : "none";
  };
  const render = () => {
    if (counter !== null) counter.textContent = `(${String(ranges.length)} \u5904)`;
    if (committedText !== null) committedText.textContent = query;
    if (input !== null && input.value !== query) input.value = query;
  };
  const present = () => {
    const range = ranges[index];
    paintHighlights(win, overlay === null ? [] : ranges, range);
    scrollToCurrent();
    ping(range);
    render();
  };
  const recollect = (keep) => {
    ranges = query === "" ? [] : collectRanges(win, scopeElement(), query, getConfig().regexFindMode);
    const key = keyOf(keep);
    const found = ranges.findIndex((item) => keyOf(item) === key);
    if (found < 0) {
      index = ranges.length === 0 ? -1 : 0;
      return false;
    }
    index = found;
    return true;
  };
  const search = (nextQuery) => {
    query = nextQuery;
    const started = now();
    ranges = query === "" ? [] : collectRanges(win, scopeElement(), query, getConfig().regexFindMode);
    scanMs = now() - started;
    index = ranges.length === 0 ? -1 : 0;
    if (overlay === null) paintHighlights(win, [], void 0);
    present();
  };
  const step = (direction) => {
    if (ranges.length === 0) return open();
    const order = Array.from({ length: ranges.length }, (_, hop) => ((index + direction * (hop + 1)) % ranges.length + ranges.length) % ranges.length);
    const rendered = order.find((candidate) => {
      const range = ranges[candidate];
      return range !== void 0 && isRendered2(range);
    });
    if (rendered !== void 0) {
      index = rendered;
      present();
      return true;
    }
    for (const candidate of order) {
      const range = ranges[candidate];
      if (range === void 0 || !reveal(range)) continue;
      if (recollect(range)) {
        present();
        return true;
      }
    }
    const fallback = order[0];
    if (fallback === void 0) return false;
    index = fallback;
    present();
    return true;
  };
  const commit = () => {
    committed = true;
    try {
      input?.blur();
    } catch {
    }
    syncMode();
  };
  const onInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      step(event.shiftKey ? -1 : 1);
      commit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  const onInput = () => {
    const value = input?.value ?? "";
    if (timer !== null && typeof win.clearTimeout === "function") win.clearTimeout(timer);
    const run = () => {
      timer = null;
      search(value);
    };
    if (typeof win.setTimeout === "function") timer = win.setTimeout(run, INPUT_DEBOUNCE_MS);
    else run();
  };
  const open = () => {
    if (overlay !== null) {
      committed = false;
      syncMode();
      input?.focus();
      input?.select();
      return true;
    }
    ensureStyle(win);
    const doc = win.document;
    previousFocus = doc.activeElement;
    const box = doc.createElement("div");
    box.setAttribute("data-vimc-find", "");
    Object.assign(box.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "3px 8px",
      borderRadius: "6px",
      border: "1px solid var(--dsw-alias-border-l2, #555)",
      background: "var(--dsw-alias-bg-overlay, #1f1f1f)",
      color: "var(--dsw-alias-label-primary, #eee)",
      boxShadow: "0 2px 8px rgba(0,0,0,.28)",
      font: `12px/1.5 ${FONT_STACK}`,
      opacity: "1"
    });
    const prompt = doc.createElement("span");
    prompt.textContent = "/";
    prompt.style.opacity = "0.5";
    const field = doc.createElement("input");
    field.setAttribute("data-vimc-find-input", "");
    field.type = "text";
    field.value = query;
    field.placeholder = "\u67E5\u627E\u2026";
    Object.assign(field.style, {
      width: "160px",
      border: "0",
      outline: "0",
      background: "transparent",
      color: "inherit",
      font: "inherit"
    });
    const text = doc.createElement("span");
    text.setAttribute("data-vimc-find-text", "");
    text.textContent = query;
    text.style.display = "none";
    const count = doc.createElement("span");
    count.setAttribute("data-vimc-find-count", "");
    count.style.opacity = "0.6";
    count.textContent = "(0 \u5904)";
    field.addEventListener("input", onInput);
    field.addEventListener("keydown", onInputKeyDown);
    box.append(prompt, field, text, count);
    doc.body.append(box);
    overlay = box;
    input = field;
    committedText = text;
    counter = count;
    committed = false;
    syncMode();
    field.focus();
    field.select();
    if (query !== "") search(query);
    else render();
    return true;
  };
  const close = () => {
    if (timer !== null && typeof win.clearTimeout === "function") win.clearTimeout(timer);
    timer = null;
    overlay?.remove();
    overlay = null;
    input = null;
    committedText = null;
    counter = null;
    committed = false;
    clearHighlights(win);
    removePing();
    const restore = previousFocus;
    previousFocus = null;
    if (restore !== null && restore.isConnected && typeof restore.focus === "function") {
      try {
        restore.focus({ preventScroll: true });
      } catch {
      }
    }
  };
  return {
    open,
    next: () => step(1),
    previous: () => step(-1),
    close,
    active: () => overlay !== null,
    /** 已提交（只读 HUD、不聚焦）时为 `true`。 */
    committedState: () => committed,
    stats: () => ({
      active: overlay !== null,
      committed,
      matches: ranges.length,
      current: index < 0 ? 0 : index + 1,
      scanMs: Math.round(scanMs * 1e3) / 1e3,
      regex: getConfig().regexFindMode,
      highlight: win.CSS?.highlights === void 0 ? "none" : "custom",
      pings,
      repositions: pingRepositions
    }),
    dispose: () => {
      close();
      removePing();
      win.document.querySelector("style[data-vimc-find-style]")?.remove();
      ranges = [];
      index = -1;
    }
  };
}

// src/client/transcript.ts
var TURN_SELECTOR = "[data-chat-turn]";
var ALIGN_EPSILON_PX = 8;
var FLASH_MS = 700;
var TOP_MARGIN_PX = 2;
var flashTimers = /* @__PURE__ */ new WeakMap();
function flash(win, element) {
  const style = element.style;
  if (style === void 0) return;
  const restore = {
    outline: style.getPropertyValue("outline"),
    "outline-offset": style.getPropertyValue("outline-offset")
  };
  style.setProperty("outline", "2px solid var(--dsw-alias-brand-primary, #4d6bfe)");
  style.setProperty("outline-offset", "2px");
  const previous = flashTimers.get(element);
  if (previous !== void 0 && typeof win.clearTimeout === "function") win.clearTimeout(previous);
  const clear = () => {
    flashTimers.delete(element);
    if (restore.outline === "") style.removeProperty("outline");
    else style.setProperty("outline", restore.outline);
    if (restore["outline-offset"] === "") style.removeProperty("outline-offset");
    else style.setProperty("outline-offset", restore["outline-offset"]);
  };
  if (typeof win.setTimeout === "function") {
    flashTimers.set(element, win.setTimeout(clear, FLASH_MS));
  } else {
    clear();
  }
}
function collectTurns(win, scroller) {
  let rows = [];
  try {
    rows = Array.from(win.document.querySelectorAll(TURN_SELECTOR));
  } catch {
    return [];
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const base = scroller.scrollTop - scrollerRect.top;
  const byTurn = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const attribute = row.getAttribute("data-chat-turn");
    const turn = attribute === null ? Number.NaN : Number(attribute);
    if (!Number.isFinite(turn) || byTurn.has(turn)) continue;
    if (typeof row.closest === "function" && row.closest("[hidden]") !== null) continue;
    const rect = row.getBoundingClientRect();
    byTurn.set(turn, { turn, element: row, top: rect.top + base });
  }
  return [...byTurn.values()].sort((left, right) => left.top - right.top);
}
function countTurns(win, scroller) {
  return scroller === null ? 0 : collectTurns(win, scroller).length;
}
function jumpToTurn(win, scroller, direction, smooth) {
  if (scroller === null) return false;
  const turns = collectTurns(win, scroller);
  if (turns.length === 0) return false;
  const current = scroller.scrollTop;
  const candidates = direction === "previous" ? turns.filter((turn) => turn.top < current - ALIGN_EPSILON_PX) : turns.filter((turn) => turn.top > current + ALIGN_EPSILON_PX);
  if (candidates.length === 0) return false;
  const target = direction === "previous" ? candidates[candidates.length - 1] : candidates[0];
  const top = Math.max(0, target.top - TOP_MARGIN_PX);
  const behavior = smooth ? "smooth" : "instant";
  try {
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top, behavior });
    else scroller.scrollTop = top;
  } catch {
    scroller.scrollTop = top;
  }
  flash(win, target.element);
  return true;
}

// src/client/engine.ts
function createEngine(win, initial, hooks = {}) {
  let config = normalizeConfig(initial);
  let handled = 0;
  const scroller = new Scroller(win);
  const hints = createHints(win, () => config, { primary: () => scroller.target("y") });
  const find = createFind(win, () => config, {
    // 查找范围与滚动容器都用同一个「会话正文」发现结果：只搜正文，不搜侧栏。
    scope: () => scroller.target("y"),
    scroller: () => scroller.target("y")
  });
  const now = () => typeof win.performance?.now === "function" ? win.performance.now() : Date.now();
  const perf = { keySamples: 0, keyTotalMs: 0, keyMaxMs: 0 };
  const round3 = (value) => Math.round(value * 1e3) / 1e3;
  const perfSnapshot = () => ({
    keySamples: perf.keySamples,
    keyAvgMs: perf.keySamples === 0 ? 0 : round3(perf.keyTotalMs / perf.keySamples),
    keyMaxMs: round3(perf.keyMaxMs)
  });
  let parsedSource = config.keyMappings;
  let parsed = resolveBindings(parsedSource);
  const bindings = () => {
    if (config.keyMappings !== parsedSource) {
      parsedSource = config.keyMappings;
      parsed = resolveBindings(parsedSource);
    }
    return parsed;
  };
  let exclusionHref = null;
  let exclusionHit = false;
  const isExcluded = () => {
    if (config.exclusions.length === 0) return false;
    const href = win.location?.href ?? "";
    if (href !== exclusionHref) {
      exclusionHref = href;
      exclusionHit = config.exclusions.some((pattern) => matchesExclusion(pattern, href));
    }
    return exclusionHit;
  };
  const goHistory = (delta) => {
    const history = win.history;
    if (history === void 0 || typeof history.go !== "function") return false;
    if (typeof history.length === "number" && history.length <= 1) return false;
    try {
      history.go(delta);
    } catch {
      return false;
    }
    return true;
  };
  const run = (command) => {
    switch (command) {
      case "scrollPageUp":
        return scroller.page("y", -1, config.pageRatioVertical, config.smooth);
      case "scrollPageDown":
        return scroller.page("y", 1, config.pageRatioVertical, config.smooth);
      case "stepUp":
        return scroller.byPixels("y", -config.scrollStepSize, config.smooth);
      case "stepDown":
        return scroller.byPixels("y", config.scrollStepSize, config.smooth);
      case "stepLeft":
        return scroller.byPixels("x", -config.scrollStepSize, config.smooth);
      case "stepRight":
        return scroller.byPixels("x", config.scrollStepSize, config.smooth);
      case "scrollToTop":
        return scroller.edge("y", "start", config.smooth);
      case "scrollToBottom":
        return scroller.edge("y", "end", config.smooth);
      case "focusInput": {
        const match = findInput(win, config.prefer);
        return match === null ? false : focusTarget(win, match.element, config.select);
      }
      case "linkHints":
        return hints.start();
      case "previousTurn":
        return jumpToTurn(win, scroller.target("y"), "previous", config.smooth);
      case "nextTurn":
        return jumpToTurn(win, scroller.target("y"), "next", config.smooth);
      case "openFind":
        return find.open();
      case "findNext":
        return find.next();
      case "findPrevious":
        return find.previous();
      case "goBack":
        return goHistory(-1);
      case "goForward":
        return goHistory(1);
      case "escapeToPage":
        return blurActive(win);
      default:
        return false;
    }
  };
  const handleKeyDown = (event) => {
    if (!config.enabled) return;
    if (isExcluded()) return;
    if (hints.active()) {
      if (hints.handleKey(event)) {
        event.preventDefault();
        handled += 1;
        hooks.onCommand?.("linkHints", true);
      }
      return;
    }
    if (find.active() && event.key === "Escape" && event.ctrlKey !== true && event.altKey !== true && event.metaKey !== true) {
      find.close();
      event.preventDefault();
      handled += 1;
      return;
    }
    const binding = matchBinding(event, bindings().bindings, config.ignoreKeyboardLayout);
    if (binding === void 0) {
      if (config.escapeToPage && event.key === "Escape" && event.ctrlKey !== true && event.altKey !== true && event.metaKey !== true && !hasOpenPopup(win) && isEditableFocus(win, eventTarget(event)) && blurActive(win)) {
        event.preventDefault();
        handled += 1;
        hooks.onCommand?.("escapeToPage", true);
      }
      return;
    }
    const editing = isEditableFocus(win, eventTarget(event));
    if (editing && !(config.allowWhileEditing && SCROLL_COMMANDS.has(binding.command))) return;
    if (!run(binding.command)) return;
    event.preventDefault();
    handled += 1;
    hooks.onCommand?.(binding.command, true);
  };
  const onKeyDown = (event) => {
    const started = now();
    try {
      handleKeyDown(event);
    } finally {
      const elapsed = now() - started;
      perf.keySamples += 1;
      perf.keyTotalMs += elapsed;
      if (elapsed > perf.keyMaxMs) perf.keyMaxMs = elapsed;
    }
  };
  const probe = (options = {}) => {
    const vertical = scroller.target("y");
    const horizontal = scroller.target("x");
    const input = findInput(win, config.prefer);
    const stats = hints.stats();
    let candidates = null;
    let matched = null;
    let tiers = null;
    let referenceSignals = [];
    let scanMs = stats.lastScanMs;
    if (options.scan !== false) {
      const started = now();
      const scan = scanClickable(win, { primary: vertical });
      candidates = scan.elements;
      matched = scan.matched;
      tiers = scan.tiers;
      referenceSignals = [...scan.referenceSignals];
      scanMs = now() - started;
    }
    const parse = bindings();
    return {
      vertical: { target: describeElement(vertical), range: scrollRange(vertical, "y") },
      horizontal: { target: describeElement(horizontal), range: scrollRange(horizontal, "x") },
      input: { target: describeElement(input === null ? null : input.element), via: input === null ? null : input.via },
      keys: {
        active: parse.bindings.length,
        unsupported: parse.unsupported.length,
        errors: parse.errors.length,
        unmapAll: parse.unmapAll
      },
      hints: {
        characters: config.linkHintCharacters,
        candidates: candidates === null ? null : candidates.length,
        matched,
        tiers,
        referenceSignals,
        sample: candidates === null ? [] : candidates.slice(0, 6).map((element) => describeElement(element) ?? "unknown"),
        sampleAttrs: candidates === null ? [] : describeCandidateAttrs(candidates),
        sessions: stats.sessions,
        scanMs: round3(scanMs)
      },
      turns: { count: countTurns(win, vertical) },
      find: find.stats(),
      perf: perfSnapshot(),
      excluded: isExcluded()
    };
  };
  win.addEventListener("keydown", onKeyDown, true);
  return {
    config: () => config,
    update: (patch) => {
      config = writeConfig(win.localStorage, patch, config);
      hints.cancel();
      exclusionHref = null;
      return config;
    },
    run,
    bindings,
    startHints: () => hints.start(),
    perf: perfSnapshot,
    probe,
    handledCount: () => handled,
    dispose: () => {
      win.removeEventListener("keydown", onKeyDown, true);
      hints.dispose();
      find.dispose();
      scroller.forget();
    }
  };
}

// src/client/settings.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var COLORS = {
  text: "var(--dsw-alias-label-primary)",
  muted: "var(--dsw-alias-label-secondary)",
  border: "var(--dsw-alias-border-l1)",
  strongBorder: "var(--dsw-alias-border-l2)",
  surface: "var(--dsw-alias-bg-layer-1)",
  nested: "var(--dsw-alias-bg-layer-2)",
  brand: "var(--dsw-alias-brand-primary)",
  warn: "var(--dsw-alias-state-warn-primary)",
  error: "var(--dsw-alias-state-error-primary)",
  success: "var(--dsw-alias-state-success-primary)"
};
var PANEL = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  padding: "4px 2px 24px",
  color: COLORS.text,
  fontSize: "13px",
  lineHeight: "1.6"
};
var SECTION = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "14px 16px",
  border: `1px solid ${COLORS.border}`,
  borderRadius: "10px",
  background: COLORS.surface
};
var ROW = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  justifyContent: "space-between",
  flexWrap: "wrap"
};
var FIELD = {
  display: "flex",
  alignItems: "center",
  gap: "8px"
};
var INPUT = {
  background: COLORS.nested,
  color: COLORS.text,
  border: `1px solid ${COLORS.strongBorder}`,
  borderRadius: "6px",
  padding: "4px 8px",
  fontSize: "12px",
  fontFamily: "inherit"
};
var MONO = {
  ...INPUT,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "12px",
  lineHeight: "1.5",
  width: "100%",
  resize: "vertical"
};
var BUTTON = {
  background: COLORS.nested,
  color: COLORS.text,
  border: `1px solid ${COLORS.strongBorder}`,
  borderRadius: "6px",
  padding: "4px 10px",
  fontSize: "12px",
  cursor: "pointer"
};
var HEADING = {
  margin: "0",
  fontSize: "13px",
  fontWeight: "600"
};
var HINT = {
  margin: "0",
  fontSize: "11.5px",
  color: COLORS.muted
};
var BADGE = {
  ...HINT,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  background: COLORS.nested,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "999px",
  padding: "1px 8px"
};
function Section({ title, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: SECTION, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: HEADING, children: title }),
    children
  ] });
}
function Toggle({ label, checked, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...FIELD, cursor: "pointer" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked, onChange: (event) => onChange(event.currentTarget.checked) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })
  ] });
}
function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: FIELD, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        type: "number",
        style: { ...INPUT, width: "86px" },
        value,
        min,
        max,
        step,
        onChange: (event) => onChange(Number(event.currentTarget.value))
      }
    ),
    suffix === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: suffix })
  ] });
}
function KeyTable({ parse }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: HINT, children: [
        "\u751F\u6548\u952E\u4F4D ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: parse.bindings.length }),
        " \u4E2A",
        parse.unmapAll ? "\uFF08\u542B unmapAll\uFF1A\u5185\u7F6E\u9ED8\u8BA4\u5DF2\u6E05\u7A7A\uFF09" : "\uFF08\u5185\u7F6E\u9ED8\u8BA4 + \u4F60\u7684\u8986\u76D6\uFF09"
      ] }),
      parse.errors.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { ...HINT, color: COLORS.error }, children: [
        "\u8BED\u6CD5\u95EE\u9898 ",
        parse.errors.length,
        " \u884C"
      ] }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: parse.bindings.map((binding, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: BADGE, children: [
      binding.label,
      " \u2192 ",
      binding.command
    ] }, `${binding.label}-${binding.command}-${String(index)}`)) }),
    parse.errors.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { style: { ...HINT, cursor: "pointer" }, children: "\u8BED\u6CD5\u95EE\u9898\u660E\u7EC6" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: "18px", fontSize: "11.5px", color: COLORS.error }, children: parse.errors.map((error, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        error.message,
        "\uFF1A",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: error.text })
      ] }, `${error.text}-${String(index)}`)) })
    ] }) : null,
    parse.unsupported.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { ...HINT, cursor: "pointer" }, children: [
        "Vimium \u547D\u4EE4\u672C\u63D2\u4EF6\u4E0D\u63A5\u7BA1 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: parse.unsupported.length }),
        " \u4E2A\uFF08\u70B9\u5F00\u770B\u539F\u56E0\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: "18px", fontSize: "11.5px", color: COLORS.muted }, children: parse.unsupported.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: item.command }),
        " \u2014 ",
        item.reason
      ] }, item.command)) })
    ] }) : null
  ] });
}
function ProbeView({ probe }) {
  const rows = [
    ["\u7AD6\u5411\u6EDA\u52A8\u5BB9\u5668", probe.vertical.target === null ? "\u672A\u627E\u5230" : `${probe.vertical.target}\uFF08\u53EF\u6EDA ${String(probe.vertical.range)}px\uFF09`],
    ["\u6A2A\u5411\u6EDA\u52A8\u5BB9\u5668", probe.horizontal.target === null ? "\u5F53\u524D\u65E0\uFF08\u5BBD\u4EE3\u7801\u5757/\u8868\u683C\u65F6\u624D\u51FA\u73B0\uFF09" : `${probe.horizontal.target}\uFF08\u53EF\u6EDA ${String(probe.horizontal.range)}px\uFF09`],
    ["\u8F93\u5165\u6846", probe.input.target === null ? "\u672A\u627E\u5230" : `${probe.input.target}\uFF08\u6765\u6E90 ${String(probe.input.via)}\uFF09`],
    ["\u5DF2\u52A0\u8F7D\u8F6E\u6B21", `${String(probe.turns.count)} \u6761\uFF08[ / ] \u8DF3\u8F6C\u7528\uFF09`],
    ["\u53EF\u70B9\u51FB\u5143\u7D20", probe.hints.candidates === null ? "\u672A\u626B\u63CF\uFF08\u6302\u8F7D\u81EA\u68C0\u8DF3\u8FC7\uFF1B\u70B9\u300C\u8FD0\u884C\u53EA\u8BFB\u81EA\u68C0\u300D\u4F1A\u626B\uFF09" : `${String(probe.hints.candidates)} \u4E2A\uFF08\u9009\u62E9\u5668\u547D\u4E2D ${String(probe.hints.matched ?? "?")}${probe.hints.tiers === null ? "" : `\uFF1B\u5185\u8054\u5F15\u7528 ${String(probe.hints.tiers.references)} / \u6B63\u6587\u5176\u5B83 ${String(probe.hints.tiers.content)} / \u5916\u90E8 ${String(probe.hints.tiers.outer)}`}\uFF09${probe.hints.sample.length === 0 ? "" : `\uFF1A${probe.hints.sample.join(", ")}`}`],
    ["\u63D0\u793A\u5B57\u6BCD\u8868", probe.hints.characters],
    ["\u5019\u9009\u626B\u63CF\u8017\u65F6", probe.hints.candidates === null ? "\u2014" : `${String(probe.hints.scanMs)} ms\uFF08\u7D2F\u8BA1 ${String(probe.hints.sessions)} \u6B21\u63D0\u793A\uFF09`],
    ["\u9875\u9762\u5185\u67E5\u627E", probe.find.matches === 0 ? `\u65E0\u547D\u4E2D\uFF08${probe.find.active ? "\u67E5\u627E\u6761\u5F00\u7740" : "\u67E5\u627E\u6761\u5173\u7740"}${probe.find.regex ? " \xB7 \u6B63\u5219" : ""} \xB7 \u9AD8\u4EAE ${probe.find.highlight === "custom" ? "Custom Highlight" : "\u4EC5\u843D\u70B9\u6807\u8BB0"}\uFF09` : `${String(probe.find.current)}/${String(probe.find.matches)} \u547D\u4E2D \xB7 \u67E5\u627E\u8017\u65F6 ${String(probe.find.scanMs)} ms${probe.find.regex ? " \xB7 \u6B63\u5219" : ""} \xB7 \u9AD8\u4EAE ${probe.find.highlight === "custom" ? "Custom Highlight" : "\u4EC5\u843D\u70B9\u6807\u8BB0"}`],
    ["\u6309\u952E\u5904\u7406\u8017\u65F6", `${String(probe.perf.keyAvgMs)} ms \u5E73\u5747 / ${String(probe.perf.keyMaxMs)} ms \u5CF0\u503C\uFF08${String(probe.perf.keySamples)} \u6B21\u91C7\u6837\uFF09`],
    ["\u6392\u9664\u89C4\u5219\u547D\u4E2D", probe.excluded ? "\u662F\uFF08\u672C\u9875\u5DF2\u505C\u7528\uFF09" : "\u5426"]
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", { style: { margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: "11.5px" }, children: rows.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "contents" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { style: { color: COLORS.muted }, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { style: { margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }, children: value })
  ] }, label)) });
}
function createVimcSettingsPanel(win, engine) {
  return function VimcSettingsPanel(_props) {
    const [config, setConfig] = (0, import_react.useState)(() => engine.config());
    const [draft, setDraft] = (0, import_react.useState)(() => engine.config().keyMappings || DEFAULT_KEY_MAPPINGS);
    const [probe, setProbe] = (0, import_react.useState)(null);
    const [report, setReport] = (0, import_react.useState)(null);
    const [notice, setNotice] = (0, import_react.useState)("");
    const fileInput = (0, import_react.useRef)(null);
    const apply2 = (0, import_react.useCallback)((patch) => {
      setConfig(engine.update(patch));
    }, []);
    const refreshProbe = (0, import_react.useCallback)(() => {
      try {
        setProbe(engine.probe());
      } catch (error) {
        setNotice(`\u81EA\u68C0\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }, []);
    const importJson = (0, import_react.useCallback)((raw) => {
      try {
        const result = importVimiumConfig(raw, { prefer: engine.config().prefer });
        const next = engine.update(result.patch);
        setConfig(next);
        setDraft(next.keyMappings || DEFAULT_KEY_MAPPINGS);
        setReport(result.report);
        setNotice(`\u5DF2\u5BFC\u5165\uFF1A\u91C7\u7EB3 ${String(result.report.adopted.length)} \u9879\uFF0C\u672A\u91C7\u7EB3 ${String(result.report.ignored.length)} \u9879`);
      } catch (error) {
        setNotice(`\u5BFC\u5165\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }, []);
    const onPickFile = (0, import_react.useCallback)(async (file) => {
      if (file === void 0) return;
      try {
        importJson(JSON.parse(await file.text()));
      } catch (error) {
        setNotice(`\u8BFB\u53D6\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
      }
    }, [importJson]);
    const parse = engine.bindings();
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: PANEL, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...ROW, alignItems: "baseline" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { ...HEADING, fontSize: "15px" }, children: "Oblivion \u952E\u76D8\u5BFC\u822A" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: BADGE, children: [
            "v",
            "0.2.10"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "\u542F\u7528", checked: config.enabled, onChange: (enabled) => apply2({ enabled }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
        "\u7126\u70B9\u5728\u8F93\u5165\u6846\u91CC\u65F6\u672C\u63D2\u4EF6\u4E00\u4E2A\u952E\u90FD\u4E0D\u63A5\u7BA1\uFF1B\u952E\u4F4D\u4E0E\u9009\u9879\u6309 ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Vimium-C" }),
        " \u7684\u8BED\u4E49\u5B9E\u73B0\uFF0C \u53EF\u76F4\u63A5\u5BFC\u5165 Vimium-C \u7684\u9009\u9879\u5BFC\u51FA JSON\u3002"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u952E\u4F4D\uFF08Vimium-C map / run \u8BED\u6CD5\uFF09", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...MONO, minHeight: "150px" },
            spellCheck: false,
            value: draft,
            onChange: (event) => setDraft(event.currentTarget.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...ROW, justifyContent: "flex-start", gap: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => {
            apply2({ keyMappings: draft });
            setNotice("\u952E\u4F4D\u5DF2\u5E94\u7528");
          }, children: "\u5E94\u7528\u952E\u4F4D" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => {
            setDraft(DEFAULT_KEY_MAPPINGS);
            apply2({ keyMappings: DEFAULT_KEY_MAPPINGS });
            setNotice("\u5DF2\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4\u952E\u4F4D");
          }, children: "\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => setDraft(config.keyMappings || DEFAULT_KEY_MAPPINGS), children: "\u64A4\u9500\u6539\u52A8" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => {
            apply2({ keyMappings: "" });
            setDraft(DEFAULT_KEY_MAPPINGS);
            setNotice("\u5DF2\u6E05\u7A7A\u8986\u76D6\uFF08\u8DDF\u968F\u5185\u7F6E\u9ED8\u8BA4\uFF09");
          }, children: "\u6E05\u7A7A\u8986\u76D6" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyTable, { parse }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
          "\u8F6E\u6B21\u8DF3\u8F6C\uFF1A\u5185\u7F6E\u9ED8\u8BA4 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "[" }),
          " = \u4E0A\u4E00\u6761\u63D0\u95EE\u3001",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "]" }),
          " = \u4E0B\u4E00\u6761\u63D0\u95EE\uFF08\u8BFB\u5230\u56DE\u7B54\u4E2D\u95F4\u6309\u4E00\u6B21\u56DE\u5230\u672C\u8F6E\u63D0\u95EE\uFF0C \u5DF2\u5728\u63D0\u95EE\u9876\u90E8\u65F6\u518D\u6309\u4E00\u6B21\u7EE7\u7EED\u5F80\u4E0A\uFF09\u3002\u5B83\u590D\u7528\u7684\u662F DSH \u81EA\u5DF1\u7684\u8F6E\u6B21\u951A\u70B9\uFF08",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "[data-chat-turn]" }),
          "\uFF09\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u6EDA\u52A8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "\u5E73\u6ED1\u6EDA\u52A8", checked: config.smooth, onChange: (smooth) => apply2({ smooth }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberField, { label: "\u7AD6\u5411\u7FFB\u9875\u6BD4\u4F8B", value: config.pageRatioVertical, min: 0.1, max: 2, step: 0.05, onChange: (pageRatioVertical) => apply2({ pageRatioVertical }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberField, { label: "\u6A2A\u5411\u7FFB\u9875\u6BD4\u4F8B", value: config.pageRatioHorizontal, min: 0.1, max: 2, step: 0.05, onChange: (pageRatioHorizontal) => apply2({ pageRatioHorizontal }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberField, { label: "\u50CF\u7D20\u6B65\u957F", value: config.scrollStepSize, min: 1, max: 2e3, step: 10, suffix: "px", onChange: (scrollStepSize) => apply2({ scrollStepSize }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
          "\u50CF\u7D20\u6B65\u957F\u5BF9\u5E94 Vimium-C \u7684 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "scrollStepSize" }),
          "\uFF1A\u7528\u4E8E ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "scrollUp/Down/Left/Right" }),
          "\u3001",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "scrollPx*" }),
          "\uFF08\u542B Ctrl+\u65B9\u5411\u952E\uFF09\u3002\u7FFB\u9875\u6BD4\u4F8B\u662F",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "\u672C\u63D2\u4EF6" }),
          "\u7684\u9009\u9879\uFF08Vimium-C \u5BFC\u51FA\u91CC\u6CA1\u6709\uFF09\uFF1A\u9ED8\u8BA4 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "0.6" }),
          " \u2014\u2014 \u8F93\u5165\u6846\u5360\u6389\u4E00\u90E8\u5206\u53EF\u89C6\u9AD8\u5EA6\uFF0C\u6BD4\u4F8B\u5C0F\u4E00\u70B9\u7FFB\u9875\u66F4\u7A33\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u8F93\u5165\u6846\uFF08i / Esc\uFF09", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "Esc \u9000\u51FA\u8F93\u5165\u6846", checked: config.escapeToPage, onChange: (escapeToPage) => apply2({ escapeToPage }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "\u8F93\u5165\u6846\u91CC\u4E5F\u5141\u8BB8\u7FFB\u9875", checked: config.allowWhileEditing, onChange: (allowWhileEditing) => apply2({ allowWhileEditing }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: FIELD, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: "\u805A\u7126\u540E" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                style: INPUT,
                value: config.select,
                onChange: (event) => apply2({ select: event.currentTarget.value }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all-line", children: '\u9009\u4E2D\u5149\u6807\u6240\u5728\u884C\uFF08Vimium \u7684 o.select="all-line"\uFF09' }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: "\u5168\u9009" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "none", children: "\u4E0D\u52A8\u9009\u533A" })
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: FIELD, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: "\u4F18\u5148\u9009\u62E9\u5668" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: { ...MONO, width: "auto", flex: 1 },
              value: config.prefer.join(", "),
              onChange: (event) => apply2({ prefer: event.currentTarget.value.split(",").map((item) => item.trim()).filter((item) => item !== "") })
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u9875\u9762\u5185\u67E5\u627E\uFF08/ \xB7 . \xB7 ,\uFF09", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...ROW, justifyContent: "flex-start", gap: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "\u6309\u6B63\u5219\u89E3\u91CA\u67E5\u8BE2\uFF08regexFindMode\uFF09", checked: config.regexFindMode, onChange: (regexFindMode) => apply2({ regexFindMode }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => {
            setNotice(engine.run("openFind") ? "\u67E5\u627E\u6846\u5DF2\u6253\u5F00\uFF1A\u8F93\u5165\u5373\u641C\uFF0CEnter \u4E0B\u4E00\u4E2A\u3001Shift+Enter \u4E0A\u4E00\u4E2A\u3001Esc \u5173\u95ED" : "\u5F53\u524D\u6CA1\u6709\u53EF\u641C\u7D22\u7684\u4F1A\u8BDD\u6B63\u6587");
          }, children: "\u6253\u5F00\u67E5\u627E\u6846" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "/" }),
          " \u6253\u5F00\u67E5\u627E\u6761\uFF08\u8FB9\u6253\u8FB9\u627E\uFF0C\u663E\u793A ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "(N \u5904)" }),
          "\uFF09\uFF1B",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Enter" }),
          " / ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Shift+Enter" }),
          "\u524D\u540E\u8DF3\u5E76**\u63D0\u4EA4**\uFF08\u8F93\u5165\u6846\u6536\u8D77\u3001\u7126\u70B9\u56DE\u5230\u9875\u9762\uFF09\u2014\u2014 \u4E8E\u662F\u7D27\u63A5\u7740\u5C31\u80FD\u7528 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "." }),
          " / ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "," }),
          " \u7EE7\u7EED\u524D\u540E\u8DF3\uFF1B \u518D\u6309 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "/" }),
          " \u56DE\u5230\u7F16\u8F91\u6001\u5E76\u5168\u9009\u67E5\u8BE2\uFF0C",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Esc" }),
          " \u5173\u95ED\u67E5\u627E\u6761\uFF08\u67E5\u8BE2\u4FDD\u7559\uFF09\u3002",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
          "\u5927\u5C0F\u5199\u6309 Vimium \u7684**\u667A\u80FD\u5927\u5C0F\u5199**\uFF08\u67E5\u8BE2\u91CC\u542B\u5927\u5199\u624D\u533A\u5206\u5927\u5C0F\u5199\uFF09\uFF1B\u9AD8\u4EAE\u7528 CSS Custom Highlight API\uFF0C",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "\u4E0D\u6539 DOM" }),
          "\u3002\u67E5\u627E\u6761\u672C\u8EAB\u662F\u8F93\u5165\u6846\uFF0C\u6240\u4EE5\u63D2\u4EF6\u7684\u5176\u5B83\u5FEB\u6377\u952E\u5728\u7F16\u8F91\u6001\u81EA\u52A8\u4E0D\u751F\u6548\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u94FE\u63A5\u63D0\u793A\uFF08f\uFF09", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: ROW, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: FIELD, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: "\u5B57\u6BCD\u8868" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                style: { ...INPUT, fontFamily: "ui-monospace, monospace", width: "200px" },
                value: config.linkHintCharacters,
                onChange: (event) => apply2({ linkHintCharacters: event.currentTarget.value })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => {
            setNotice(engine.startHints() ? "\u5DF2\u8FDB\u5165\u63D0\u793A\u6A21\u5F0F\uFF1A\u6309\u5B57\u6BCD\u89E6\u53D1" : "\u5F53\u524D\u89C6\u53E3\u5185\u6CA1\u6709\u53EF\u70B9\u51FB\u5143\u7D20");
          }, children: "\u7ACB\u5373\u663E\u793A\u63D0\u793A" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
          "\u5143\u7D20\u6570\u91CF\u4E0D\u8D85\u8FC7\u5B57\u6BCD\u8868\u957F\u5EA6\u65F6\u6BCF\u4E2A\u5143\u7D20 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "1 \u4E2A\u5B57\u6BCD" }),
          "\uFF1B\u66F4\u591A\u65F6**\u524D\u9762\u7684\u5019\u9009\u4F18\u5148\u7528\u5355\u5B57\u6BCD**\uFF1A \u6B63\u6587\u91CC\u7684\u5185\u8054\u5F15\u7528/\u94FE\u63A5 \u2192 \u6B63\u6587\u91CC\u5176\u5B83\u5143\u7D20 \u2192 \u5916\u90E8\u6309\u94AE\uFF08\u9996\u5B57\u6BCD\u4F1A\u9884\u7559\uFF0C\u4FDD\u8BC1\u524D\u7F00\u4E0D\u6B67\u4E49\uFF09\u3002",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "Esc" }),
          " \u6216\u8F93\u5165\u5B57\u6BCD\u8868\u4E4B\u5916\u7684\u952E\u53D6\u6D88\u3002"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u517C\u5BB9\uFF1A\u5BFC\u5165 Vimium-C \u9009\u9879\u5BFC\u51FA", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...ROW, justifyContent: "flex-start", gap: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              ref: fileInput,
              type: "file",
              accept: "application/json,.json",
              style: { display: "none" },
              onChange: (event) => {
                void onPickFile(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: () => fileInput.current?.click(), children: "\u9009\u62E9 vimium_c-*.json" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: HINT, children: "\u6216\u628A JSON \u7C98\u5230\u4E0B\u9762" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            style: { ...MONO, minHeight: "64px" },
            spellCheck: false,
            placeholder: '{"keyMappings": ["map w scrollPageUp", \u2026], "linkHintCharacters": "dsavewrqcxz", "scrollStepSize": 90, "keyLayout": 0}',
            onBlur: (event) => {
              const text = event.currentTarget.value.trim();
              if (text === "") return;
              try {
                importJson(JSON.parse(text));
                event.currentTarget.value = "";
              } catch (error) {
                setNotice(`\u7C98\u8D34\u5185\u5BB9\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${error instanceof Error ? error.message : String(error)}`);
              }
            }
          }
        ),
        report === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: HINT, children: [
            "\u6765\u6E90\uFF1A",
            report.source.name ?? "\uFF08\u672A\u7F72\u540D\uFF09",
            report.source.time === void 0 ? "" : ` \xB7 ${report.source.time}`,
            report.source.environment === void 0 ? "" : ` \xB7 ${report.source.environment}`
          ] }),
          report.adopted.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { open: true, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { ...HINT, cursor: "pointer", color: COLORS.success }, children: [
              "\u5DF2\u91C7\u7EB3 ",
              report.adopted.length,
              " \u9879"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: "18px", fontSize: "11.5px" }, children: report.adopted.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: item.key }),
              " \u2014 ",
              item.detail
            ] }, item.key)) })
          ] }) : null,
          report.ignored.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: { ...HINT, cursor: "pointer", color: COLORS.warn }, children: [
              "\u672A\u91C7\u7EB3 ",
              report.ignored.length,
              " \u9879\uFF08\u70B9\u5F00\u770B\u539F\u56E0\uFF09"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: { margin: "6px 0 0", paddingLeft: "18px", fontSize: "11.5px", color: COLORS.muted }, children: report.ignored.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: item.key }),
              " \u2014 ",
              item.reason
            ] }, item.key)) })
          ] }) : null
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: "\u6392\u9664\u89C4\u5219\u4E0E\u8BCA\u65AD", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: FIELD, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: COLORS.muted }, children: "\u6392\u9664\u89C4\u5219" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              style: { ...MONO, width: "auto", flex: 1 },
              placeholder: ":https://example.com/  \xB7  /regex/  \xB7  *glob*",
              value: config.exclusions.join(", "),
              onChange: (event) => apply2({ exclusions: event.currentTarget.value.split(",").map((item) => item.trim()).filter((item) => item !== "") })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
          "\u547D\u4E2D\u5373\u6574\u4F53\u505C\u7528\uFF08\u5BF9\u5E94 Vimium-C \u7684 ",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: "exclusionRules.pattern" }),
          "\uFF1B\u53EA\u5B9E\u73B0\u5176\u6A21\u5F0F\u8BED\u8A00\u7684\u5B50\u96C6\uFF09\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...ROW, justifyContent: "flex-start", gap: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, { label: "\u8BCA\u65AD\u4E0A\u62A5\uFF08\u5199\u81EA\u8BC1\u636E\u6587\u4EF6\uFF09", checked: config.diagnostics, onChange: (diagnostics) => apply2({ diagnostics }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, onClick: refreshProbe, children: "\u8FD0\u884C\u53EA\u8BFB\u81EA\u68C0" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: HINT, children: [
            "\u5DF2\u5904\u7406 ",
            engine.handledCount(),
            " \u4E2A\u6309\u952E"
          ] })
        ] }),
        probe === null ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProbeView, { probe })
      ] }),
      notice === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: { ...HINT, color: COLORS.brand }, children: notice }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: HINT, children: [
        "\u6062\u590D\u51FA\u5382\uFF1A\u628A\u4E0B\u9762\u7684\u9ED8\u8BA4\u503C\u6284\u56DE\u5404\u63A7\u4EF6\u5373\u53EF \u2014\u2014 \u5E73\u6ED1\u6EDA\u52A8 ",
        String(DEFAULT_CONFIG.smooth),
        "\u3001 \u50CF\u7D20\u6B65\u957F ",
        String(DEFAULT_CONFIG.scrollStepSize),
        "px\u3001\u7AD6\u5411\u6BD4\u4F8B ",
        String(DEFAULT_CONFIG.pageRatioVertical),
        "\u3002"
      ] })
    ] });
  };
}

// src/client/index.ts
var name = "@oblivion/vimc-client";
var inject = [];
var SETTINGS_SECTION_ID = "oblivion-vimc";
var SETTINGS_SECTION_ORDER = 46;
function apply(ctx) {
  const logger = ctx.logger?.("@oblivion/vimc");
  const win = globalThis.window;
  if (win === void 0 || typeof win.addEventListener !== "function") {
    logger?.warn("\u6CA1\u6709\u53EF\u7528\u7684 window \u2014\u2014 \u6D4F\u89C8\u5668\u534A\u8FB9\u8DF3\u8FC7\u5B89\u88C5");
    return;
  }
  const hooks = {};
  const engine = createEngine(win, readConfig(win.localStorage), hooks);
  const beat = createBeatSender(win, () => engine.config());
  hooks.onCommand = (command) => {
    beat.send(command, { perf: engine.perf() });
  };
  const disposeApi = installApi(win, engine);
  logger?.info(
    `v${"0.2.10"} \u5DF2\u5B89\u88C5\uFF1Aw/s \u7FFB\u9875\u3001a/d \u6A2A\u5411\u6B65\u8FDB\u3001W/S \u5230\u9876/\u5230\u5E95\u3001f \u94FE\u63A5\u63D0\u793A\u3001i \u805A\u7126\u8F93\u5165\u6846\uFF08\u7126\u70B9\u5728\u8F93\u5165\u6846\u5185\u65F6\u4E0D\u63A5\u7BA1\uFF0CEsc \u9000\u51FA\uFF09`
  );
  beat.send("mounted", { probe: engine.probe({ scan: false }), perf: engine.perf() });
  let settleTimer = null;
  const schedule = win.setTimeout;
  if (typeof schedule === "function") {
    settleTimer = schedule.call(win, () => {
      settleTimer = null;
      beat.send("probe", { probe: engine.probe(), perf: engine.perf() });
    }, 1500);
  }
  if (typeof ctx.inject === "function") {
    ctx.inject(["slots"], (scope) => {
      const slots = scope.slots;
      if (slots === void 0 || typeof slots.register !== "function") {
        logger?.warn("slots \u4E0D\u53EF\u7528\uFF1A\u8BBE\u7F6E\u9875\u672A\u6302\u8F7D\uFF08\u6309\u952E\u529F\u80FD\u4E0D\u53D7\u5F71\u54CD\uFF09");
        return;
      }
      const panel = createVimcSettingsPanel(win, engine);
      slots.inject("settings.section", () => slots.register({
        name: "settings.section",
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        label: () => "Oblivion \u952E\u76D8\u5BFC\u822A"
      }, panel));
      logger?.info("\u8BBE\u7F6E\u9875\u5DF2\u6302\u8F7D\uFF1A\u8BBE\u7F6E \u2192 Oblivion \u952E\u76D8\u5BFC\u822A");
    });
  }
  const dispose = () => {
    if (settleTimer !== null && typeof win.clearTimeout === "function") win.clearTimeout(settleTimer);
    settleTimer = null;
    disposeApi();
    engine.dispose();
    beat.dispose();
  };
  if (typeof ctx.effect === "function") ctx.effect(() => dispose, "oblivion-vimc: \u952E\u76D8\u5F15\u64CE");
  else if (typeof ctx.on === "function") ctx.on("dispose", dispose);
}
var __test = {
  DEFAULT_KEY_MAPPINGS,
  DEFAULT_CONFIG,
  DEFAULT_PAGE_RATIO,
  normalizeConfig,
  matchBinding,
  resolveBindings,
  parseKeyMappings,
  generateHintStrings,
  collectClickable,
  importVimiumConfig,
  matchesExclusion
};

		return module.exports;
	}
});
