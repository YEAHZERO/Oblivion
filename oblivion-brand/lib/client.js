window.__ModuleLoader__.load({
	id: "@oblivion/brand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react5 = require("react");

// src/client/polaris.ts
var POLARIS_VIEWBOX = { width: 1024, height: 1024 };
var POLARIS_PATH = "M512.0000 132.0960L558.6323 399.4197L780.6327 243.3673L624.5803 465.3677L891.9040 512.0000L624.5803 558.6323L780.6327 780.6327L558.6323 624.5803L512.0000 891.9040L465.3677 624.5803L243.3673 780.6327L399.4197 558.6323L132.0960 512.0000L399.4197 465.3677L243.3673 243.3673L465.3677 399.4197Z";
var POLARIS_CENTER_DOT_RADIUS = 33.792;
var POLARIS_GRADIENT_FROM = "#E8D5A3";
var POLARIS_GRADIENT_TO = "#7EC8E3";

// src/client/settings.ts
var import_react = require("react");
var DEFAULT_BRAND_NAME = "Oblivion";
var MAX_BRAND_NAME_LENGTH = 24;
var MAX_BRAND_IMAGE_BYTES = 512 * 1024;
var BRAND_IMAGE_MAX_EDGE = 256;
var STORAGE_KEY = "oblivion-brand:settings:v1";
var LEGACY_NAME_KEY = "oblivion-brand:name";
var DEFAULTS = {
  name: DEFAULT_BRAND_NAME,
  image: null,
  overrideEnabled: true,
  sidebarPanels: ["market"],
  centerPanel: true
};
function coerce(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULTS };
  const record = raw;
  const name = typeof record["name"] === "string" ? record["name"].slice(0, MAX_BRAND_NAME_LENGTH) : DEFAULTS.name;
  const image = typeof record["image"] === "string" && record["image"].startsWith("data:") ? record["image"] : null;
  const overrideEnabled = typeof record["overrideEnabled"] === "boolean" ? record["overrideEnabled"] : DEFAULTS.overrideEnabled;
  const centerPanel = typeof record["centerPanel"] === "boolean" ? record["centerPanel"] : DEFAULTS.centerPanel;
  const panels = Array.isArray(record["sidebarPanels"]) ? record["sidebarPanels"].filter((v) => typeof v === "string") : [...DEFAULTS.sidebarPanels];
  return { name, image, overrideEnabled, sidebarPanels: panels, centerPanel };
}
function load() {
  let text = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULTS };
  }
  if (text !== null) {
    try {
      return coerce(JSON.parse(text));
    } catch {
      return { ...DEFAULTS };
    }
  }
  try {
    const legacy = localStorage.getItem(LEGACY_NAME_KEY);
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_NAME_KEY);
      return coerce({ ...DEFAULTS, name: legacy.slice(0, MAX_BRAND_NAME_LENGTH) });
    }
  } catch {
  }
  return { ...DEFAULTS };
}
var current = load();
var listeners = /* @__PURE__ */ new Set();
function brandSettings() {
  return current;
}
function notify() {
  for (const listener of [...listeners]) listener();
}
function updateBrandSettings(patch) {
  const next = coerce({ ...current, ...patch });
  current = next;
  let error = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (cause) {
    error = cause instanceof Error ? `\u8BBE\u7F6E\u672A\u80FD\u6301\u4E45\u5316\uFF1A${cause.message}` : "\u8BBE\u7F6E\u672A\u80FD\u6301\u4E45\u5316";
  }
  notify();
  return error;
}
function resetBrandSettings() {
  return updateBrandSettings({ ...DEFAULTS });
}
function subscribeBrandSettings(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useBrandSettings() {
  const [value, setValue] = (0, import_react.useState)(current);
  (0, import_react.useEffect)(() => subscribeBrandSettings(() => setValue(current)), []);
  return value;
}

// src/client/Brand.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var LABEL_COLOR = "var(--dsw-alias-label-primary, currentColor)";
function PolarisSvg({ size }) {
  const gradientId = "obl-polaris-gradient";
  const center = POLARIS_VIEWBOX.width / 2;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      "data-obl-brand-mark": "polaris",
      width: size,
      height: size,
      viewBox: `0 0 ${POLARIS_VIEWBOX.width} ${POLARIS_VIEWBOX.height}`,
      role: "img",
      "aria-label": "Oblivion",
      xmlns: "http://www.w3.org/2000/svg",
      style: { display: "block", flex: "none" },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: gradientId, x1: "0", y1: "0", x2: "1", y2: "1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: POLARIS_GRADIENT_FROM }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: POLARIS_GRADIENT_TO })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: POLARIS_PATH, fill: `url(#${gradientId})` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: center, cy: center, r: POLARIS_CENTER_DOT_RADIUS, fill: POLARIS_GRADIENT_FROM })
      ]
    }
  );
}
function OblivionBrandMark({ size }) {
  const { image } = useBrandSettings();
  if (image === null) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PolarisSvg, { size });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "img",
    {
      "data-obl-brand-mark": "custom",
      src: image,
      width: size,
      height: size,
      alt: "Oblivion",
      style: {
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flex: "none",
        borderRadius: Math.max(2, Math.round(size / 8))
      }
    }
  );
}
function OblivionBrandName() {
  const { name } = useBrandSettings();
  if (name === "") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      "data-obl-brand-name": "",
      style: {
        fontFamily: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
        fontSize: "16px",
        fontWeight: 500,
        color: LABEL_COLOR,
        letterSpacing: "0px",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      children: name
    }
  );
}

// src/client/BrandSettingsPanel.tsx
var import_react4 = require("react");

// src/client/panels.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var PANEL_ORDER_BASE = 5;
var PANEL_ID_PREFIX = "obl-panel-";
var FALLBACK_PROVIDER_KEYS = ["market", "oblivionBrand"];
var EXCLUDED_PREFIXES = ["remote.", "api."];
var PROVIDER_LABELS = {
  market: "\u63D2\u4EF6\u5E02\u573A",
  oblivionBrand: "Oblivion \u54C1\u724C"
};
function providerLabel(key) {
  return PROVIDER_LABELS[key] ?? key;
}
function panelEntryId(key) {
  return PANEL_ID_PREFIX + key;
}
function asUiControl(key, value) {
  if (value === null || typeof value !== "object") return null;
  const record = value;
  const render = record["render"];
  if (typeof render !== "function") return null;
  const shaped = typeof record["version"] === "number" || typeof record["settingsVisible"] === "function";
  if (!shaped) return null;
  return {
    key,
    render: () => {
      try {
        const element = render.call(value);
        return (0, import_react2.isValidElement)(element) ? element : null;
      } catch {
        return null;
      }
    }
  };
}
function discoverPanelProviders(ctx) {
  const found = /* @__PURE__ */ new Map();
  try {
    const store = ctx.reflect?.store;
    if (store !== void 0 && store !== null) {
      for (const rawKey of Reflect.ownKeys(store)) {
        const impl = store[rawKey];
        const name = typeof impl?.name === "string" ? impl.name : typeof rawKey === "string" ? rawKey : null;
        if (name === null || found.has(name)) continue;
        if (EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
        let value;
        try {
          value = ctx.get(name);
        } catch {
          continue;
        }
        const provider = asUiControl(name, value);
        if (provider !== null) found.set(name, provider);
      }
    }
  } catch {
  }
  for (const key of FALLBACK_PROVIDER_KEYS) {
    if (found.has(key)) continue;
    const provider = asUiControl(key, ctx.get(key));
    if (provider !== null) found.set(key, provider);
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function PanelIcon({ size, active }) {
  const unit = size / 18;
  const square = 7 * unit;
  const gap = 2 * unit;
  const radius = 1.6 * unit;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "svg",
    {
      "data-obl-panel-icon": "",
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      "aria-hidden": "true",
      style: { display: "block", opacity: active ? 1 : 0.75 },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("g", { fill: "currentColor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: 0, y: 0, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: square + gap, y: 0, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: 0, y: square + gap, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: square + gap, y: square + gap, width: square, height: square, rx: radius })
      ] })
    }
  );
}
function createEmbeddedPanel(getProvider, label) {
  return function EmbeddedPanel() {
    const provider = getProvider();
    const element = provider?.render() ?? null;
    if (element === null) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          style: {
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "24px",
            fontSize: "13px",
            color: "var(--dsw-alias-label-tertiary, #8b93a1)"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { style: { fontWeight: 500, color: "var(--dsw-alias-label-primary, currentColor)" }, children: [
              label,
              " \u6CA1\u6709\u63D0\u4F9B\u9762\u677F"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u5BF9\u5E94\u63D2\u4EF6\u672A\u5B89\u88C5\u3001\u672A\u542F\u7528\uFF0C\u6216\u5B83\u7684\u9762\u677F\u6E32\u67D3\u5931\u8D25\u4E86\u3002" })
          ]
        }
      );
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { "data-obl-embedded-panel": "", style: { height: "100%", minHeight: 0, overflow: "auto" }, children: element });
  };
}

// src/client/version.ts
var PLUGIN_VERSION = true ? "0.1.2" : "dev";

// src/paths.ts
var RESTART_PATH = "/obl-brand/restart";
var PLUGINS_PATH = "/obl-brand/plugins";

// src/client/installed-plugins.tsx
var import_react3 = require("react");

// src/plugin-list.ts
function statusLabel(entry) {
  return entry.active ? "\u5DF2\u542F\u7528" : "\u5DF2\u88C5\u672A\u542F\u7528";
}
function totalRestoreScript(payload) {
  return payload.entries.map((entry) => entry.restore).join("\n");
}
function asString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function asEntry(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw;
  const name = asString(record["name"]);
  const spec = asString(record["spec"]);
  const restore = asString(record["restore"]);
  if (name === null || spec === null || restore === null) return null;
  const bundled = record["bundled"] === true;
  const patched = record["patched"] === true;
  const kind = record["kind"] === "link" ? "link" : "npm";
  const version = asString(record["version"]);
  return {
    name,
    spec,
    kind,
    version,
    bundled,
    patched,
    active: record["active"] === true || bundled || patched,
    restore
  };
}
function normalizePluginList(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw;
  const profile = asString(record["profile"]);
  if (profile === null) return null;
  const entries = Array.isArray(record["entries"]) ? record["entries"].map(asEntry).filter((entry) => entry !== null) : [];
  const problems = Array.isArray(record["problems"]) ? record["problems"].filter((item) => typeof item === "string") : [];
  return {
    profile,
    profileDir: asString(record["profileDir"]) ?? "",
    generatedAt: typeof record["generatedAt"] === "number" ? record["generatedAt"] : 0,
    entries,
    problems
  };
}

// src/client/theme.ts
var LABEL = "var(--dsw-alias-label-primary, currentColor)";
var MUTED = "var(--dsw-alias-label-tertiary, #8b93a1)";
var BORDER = "var(--dsw-alias-border-l2, #e5e7eb)";
var ACCENT = "var(--dsw-alias-brand-primary, #4f6ef7)";
var DANGER = "var(--dsw-alias-label-error, #d93025)";
var buttonStyle = {
  font: "inherit",
  fontSize: "13px",
  padding: "5px 12px",
  borderRadius: "6px",
  border: `1px solid ${BORDER}`,
  background: "transparent",
  color: LABEL,
  cursor: "pointer"
};
var cardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  padding: "14px",
  border: `1px solid ${BORDER}`,
  borderRadius: "8px"
};
var headingStyle = { margin: 0, fontSize: "13px", fontWeight: 600, color: LABEL };
var hintStyle = { margin: 0, fontSize: "12px", lineHeight: "18px", color: MUTED };
var monoStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: "11px",
  color: MUTED
};

// src/client/installed-plugins.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
async function copyText(text) {
  const clipboard = globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
function kindLabel(entry) {
  return entry.kind === "link" ? "\u672C\u5730\u94FE\u63A5" : "npm";
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function statusColor(entry) {
  return entry.active ? ACCENT : MUTED;
}
function InstalledPluginsSection(props) {
  const path = props.path ?? PLUGINS_PATH;
  const [state, setState] = (0, import_react3.useState)({ status: "loading" });
  const [copied, setCopied] = (0, import_react3.useState)(null);
  const [copyError, setCopyError] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(path, { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`\u5BBF\u4E3B\u8FD4\u56DE HTTP ${response.status}`);
        const raw = await response.json();
        const data2 = normalizePluginList(raw);
        if (data2 === null) throw new Error("\u6E05\u5355\u5F62\u72B6\u4E0D\u5BF9\uFF08\u5BBF\u4E3B\u4E0E\u672C\u63D2\u4EF6\u7248\u672C\u53EF\u80FD\u4E0D\u4E00\u81F4\uFF09");
        if (alive) setState({ status: "ready", data: data2 });
      } catch (error) {
        if (alive) setState({ status: "failed", error: message(error) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);
  const copy = (0, import_react3.useCallback)(async (key, text) => {
    const ok = await copyText(text);
    if (!ok) {
      setCopyError("\u590D\u5236\u6CA1\u6210\u529F\uFF08\u6D4F\u89C8\u5668\u53EF\u80FD\u4E0D\u7ED9\u6743\u9650\uFF09\uFF0C\u8BF7\u624B\u52A8\u9009\u4E2D\u547D\u4EE4\u590D\u5236\u3002");
      return;
    }
    setCopyError(null);
    setCopied(key);
    window.setTimeout(() => setCopied((current2) => current2 === key ? null : current2), 1500);
  }, []);
  const data = state.status === "ready" ? state.data : null;
  const all = data !== null ? totalRestoreScript(data) : "";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { style: cardStyle, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: headingStyle, children: "\u4E2A\u4EBA\u5DF2\u5B89\u88C5\u63D2\u4EF6" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: hintStyle, children: [
      "\u672C profile \u7684 ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { style: monoStyle, children: "dependencies" }),
      " \u91CC\u88C5\u8FC7\u7684\u63D2\u4EF6\u3002\u91CD\u88C5\u65F6\u70B9\u300C\u590D\u5236\u300D\u62FF\u547D\u4EE4\uFF0C \u6216\u5728\u63D2\u4EF6\u5E02\u573A\u91CC\u6309\u5305\u540D\u641C\u7D22\u5B89\u88C5\u3002\u300C\u5DF2\u88C5\u672A\u542F\u7528\u300D= \u88C5\u4E86\u4F46\u65E2\u4E0D\u5728 ",
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { style: monoStyle, children: "dsh.profile.bundles" }),
      "\u91CC\u3001\u4E5F\u6CA1\u6709\u8865\u4E01\u884C\uFF0C\u5BBF\u4E3B\u4E0D\u4F1A\u52A0\u8F7D\u5B83\u3002"
    ] }),
    state.status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { style: hintStyle, children: "\u6B63\u5728\u8BFB\u53D6 profile\u2026" }) : null,
    state.status === "failed" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { ...hintStyle, color: "var(--dsw-alias-label-error, #d93025)" }, children: [
      "\u8BFB\u4E0D\u5230\u6E05\u5355\uFF1A",
      state.error,
      "\uFF08\u5BBF\u4E3B\u4FA7\u9700\u91CD\u542F DSH \u624D\u4F1A\u6302\u4E0A\u8FD9\u6761\u8DEF\u7531\uFF09"
    ] }) : null,
    data !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: hintStyle, children: [
        "profile ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: data.profile }),
        " \xB7 \u5171 ",
        data.entries.length,
        " \u6761",
        data.profileDir !== "" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          " \xB7 ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: monoStyle, title: data.profileDir, children: data.profileDir })
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: data.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            padding: "8px 10px",
            border: `1px solid ${BORDER}`,
            borderRadius: "6px"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "1 1 auto", minWidth: 0 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: "13px", color: LABEL, fontWeight: 600 }, children: entry.name }),
                entry.version !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: monoStyle, children: entry.version }) : null,
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: "11px", color: statusColor(entry) }, children: statusLabel(entry) }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: monoStyle, children: [
                  "\xB7 ",
                  kindLabel(entry)
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...monoStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: entry.spec, children: entry.spec }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...monoStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: entry.restore, children: entry.restore })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                style: { ...buttonStyle, flex: "0 0 auto" },
                onClick: () => void copy(entry.name, entry.restore),
                children: copied === entry.name ? "\u5DF2\u590D\u5236" : "\u590D\u5236"
              }
            )
          ]
        },
        entry.name
      )) }),
      data.problems.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: { ...hintStyle, paddingLeft: "18px", margin: 0 }, children: data.problems.map((problem) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { children: problem }, problem)) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            style: buttonStyle,
            disabled: all === "",
            onClick: () => void copy("__all__", all),
            children: copied === "__all__" ? "\u5DF2\u590D\u5236\u5168\u90E8" : `\u590D\u5236\u5168\u90E8\uFF08${data.entries.length} \u6761\uFF09`
          }
        ),
        copyError !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { ...hintStyle, color: MUTED }, children: copyError }) : null
      ] })
    ] }) : null
  ] });
}

// src/client/BrandSettingsPanel.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma < 0 ? dataUrl.length : Math.round((dataUrl.length - comma - 1) * 3 / 4);
}
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("\u8BFB\u53D6\u6587\u4EF6\u5931\u8D25"));
    reader.readAsDataURL(file);
  });
}
async function normalizeImage(dataUrl, mime) {
  if (mime === "image/svg+xml") {
    return { url: dataUrl, note: "SVG \u4FDD\u6301\u77E2\u91CF\u539F\u6837\uFF0C\u4E0D\u7F29\u653E" };
  }
  const image = await new Promise((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = dataUrl;
  });
  if (image === null) return { url: dataUrl, note: null };
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (longest === 0) return { url: dataUrl, note: null };
  if (longest <= BRAND_IMAGE_MAX_EDGE && dataUrlBytes(dataUrl) <= MAX_BRAND_IMAGE_BYTES) {
    return { url: dataUrl, note: null };
  }
  const scale = Math.min(1, BRAND_IMAGE_MAX_EDGE / longest);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return { url: dataUrl, note: null };
  context.drawImage(image, 0, 0, width, height);
  let output = canvas.toDataURL("image/png");
  let note = `\u5DF2\u7F29\u653E\u5230 ${width}\xD7${height}`;
  if (dataUrlBytes(output) > MAX_BRAND_IMAGE_BYTES) {
    output = canvas.toDataURL("image/jpeg", 0.85);
    note = `\u5DF2\u7F29\u653E\u5230 ${width}\xD7${height} \u5E76\u8F6C\u4E3A JPEG`;
  }
  return { url: output, note };
}
function createBrandSettingsPanel(listProviders) {
  return function BrandSettingsPanel() {
    const settings = useBrandSettings();
    const [draft, setDraft] = (0, import_react4.useState)(() => brandSettings().name);
    const [notice, setNotice] = (0, import_react4.useState)(null);
    const [error, setError] = (0, import_react4.useState)(null);
    const [restartState, setRestartState] = (0, import_react4.useState)("idle");
    const [restartMessage, setRestartMessage] = (0, import_react4.useState)(null);
    const fileRef = (0, import_react4.useRef)(null);
    const nameDirty = draft !== settings.name;
    const providers = listProviders();
    const selected = new Set(settings.sidebarPanels);
    const apply2 = (patch) => {
      const failure = updateBrandSettings(patch);
      setError(failure);
    };
    const doRestart = async () => {
      setRestartState("sending");
      setRestartMessage(null);
      try {
        const response = await fetch(RESTART_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.ok !== true) {
          setRestartState("idle");
          setRestartMessage(`\u91CD\u542F\u8BF7\u6C42\u88AB\u62D2\u7EDD\uFF1A${body?.error ?? `HTTP ${String(response.status)}`}`);
          return;
        }
        setRestartMessage(`\u5DF2\u53D7\u7406\uFF0C\u5E94\u7528\u5373\u5C06\u91CD\u542F${body.logPath ? `\uFF08\u65E5\u5FD7\uFF1A${body.logPath}\uFF09` : ""}`);
      } catch (cause) {
        setRestartMessage(
          `\u8FDE\u63A5\u5DF2\u65AD\u5F00\uFF0C\u5E94\u7528\u5E94\u6B63\u5728\u91CD\u542F\uFF1A${cause instanceof Error ? cause.message : String(cause)}`
        );
        setRestartState("idle");
      }
    };
    const onPickFile = async (file) => {
      if (file === void 0) return;
      setError(null);
      setNotice(null);
      try {
        const raw = await readAsDataUrl(file);
        const { url, note } = await normalizeImage(raw, file.type);
        if (dataUrlBytes(url) > MAX_BRAND_IMAGE_BYTES) {
          setError(
            `\u56FE\u7247\u8FC7\u5927\uFF08\u7EA6 ${Math.round(dataUrlBytes(url) / 1024)} KB\uFF0C\u4E0A\u9650 ${Math.round(MAX_BRAND_IMAGE_BYTES / 1024)} KB\uFF09\u3002\u8BF7\u6362\u4E00\u5F20\u66F4\u5C0F\u7684\u56FE\u3002`
          );
          return;
        }
        apply2({ image: url });
        setNotice(note);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "\u8BFB\u53D6\u56FE\u7247\u5931\u8D25");
      }
    };
    const togglePanel = (key, on) => {
      const next = new Set(settings.sidebarPanels);
      if (on) next.add(key);
      else next.delete(key);
      apply2({ sidebarPanels: [...next] });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        "data-obl-brand-settings": "",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          // 内边距与限宽都长在面板自己身上，而不是外层容器上 ——
          // 外层容器是通用的（插件市场等也走它），在那里加约束会把别人的面板挤窄。
          padding: "16px 20px 48px",
          maxWidth: "620px",
          width: "100%",
          boxSizing: "border-box",
          margin: settings.centerPanel ? "0 auto" : "0"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("h2", { style: { margin: "0 0 4px", fontSize: "16px", fontWeight: 500, color: LABEL }, children: [
              "Oblivion \u54C1\u724C",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { marginLeft: "8px", fontSize: "12px", fontWeight: 400, color: MUTED }, children: [
                "v",
                PLUGIN_VERSION
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: "\u4FA7\u680F\u4E0E\u4F1A\u8BDD Hero \u533A\u7684\u54C1\u724C\u5448\u73B0\u3002\u5173\u95ED\u300C\u63A5\u7BA1 DSH \u54C1\u724C\u300D\u540E\uFF0CDeepSeek Harness \u7684\u9CB8\u9C7C\u5916\u89C2\u4F1A\u7ACB\u5373\u6062\u590D\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: settings.overrideEnabled,
                  onChange: (event) => apply2({ overrideEnabled: event.target.checked })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: "13px", color: LABEL }, children: "\u63A5\u7BA1 DSH \u54C1\u724C\uFF08\u4FA7\u680F\u56FE\u5F62\u4E0E\u540D\u79F0\uFF09" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: settings.overrideEnabled ? "\u5F53\u524D\u7531\u672C\u63D2\u4EF6\u63A5\u7BA1\uFF1A\u5B98\u65B9\u54C1\u724C\u69FD\u4F4D\u7684\u6CE8\u518C\u88AB\u672C\u63D2\u4EF6\u906E\u853D\u3002" : "\u5F53\u524D\u5DF2\u91CA\u653E\u69FD\u4F4D\uFF1A\u5B98\u65B9\u9CB8\u9C7C\u56FE\u6807\u4E0E wordmark \u5DF2\u6062\u590D\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { style: headingStyle, children: "\u54C1\u724C\u56FE\u5F62" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "14px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "div",
                {
                  style: {
                    width: "48px",
                    height: "48px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: `1px solid ${BORDER}`,
                    borderRadius: "8px",
                    flex: "none"
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(OblivionBrandMark, { size: 32 })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: buttonStyle, onClick: () => fileRef.current?.click(), children: "\u4E0A\u4F20\u56FE\u7247" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    style: buttonStyle,
                    disabled: settings.image === null,
                    onClick: () => {
                      apply2({ image: null });
                      setNotice(null);
                    },
                    children: "\u6062\u590D\u5317\u6781\u661F"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                ref: fileRef,
                type: "file",
                accept: "image/*",
                style: { display: "none" },
                onChange: (event) => {
                  void onPickFile(event.target.files?.[0]);
                  event.target.value = "";
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: hintStyle, children: [
              "\u652F\u6301\u4EFB\u610F\u6D4F\u89C8\u5668\u53EF\u89E3\u7801\u7684\u683C\u5F0F\uFF08PNG / JPEG / WebP / GIF / SVG / AVIF / BMP / ICO\uFF09\u3002 \u8D85\u8FC7 ",
              BRAND_IMAGE_MAX_EDGE,
              "px \u7684\u4F4D\u56FE\u4F1A\u81EA\u52A8\u7F29\u653E\uFF0CSVG \u4FDD\u6301\u77E2\u91CF\u3002"
            ] }),
            notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hintStyle, color: ACCENT }, children: notice }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { style: headingStyle, children: "\u54C1\u724C\u540D\u6587\u5B57" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                value: draft,
                maxLength: MAX_BRAND_NAME_LENGTH,
                placeholder: DEFAULT_BRAND_NAME,
                onChange: (event) => setDraft(event.target.value.slice(0, MAX_BRAND_NAME_LENGTH)),
                style: {
                  font: "inherit",
                  fontSize: "13px",
                  padding: "7px 10px",
                  borderRadius: "6px",
                  border: `1px solid ${BORDER}`,
                  background: "var(--dsw-alias-bg-layer-2, transparent)",
                  color: LABEL
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: hintStyle, children: [
              draft.length,
              "/",
              MAX_BRAND_NAME_LENGTH,
              " \u5B57\u7B26",
              draft === "" ? " \xB7 \u7559\u7A7A\u8868\u793A\u53EA\u663E\u793A\u56FE\u5F62" : ""
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  disabled: !nameDirty,
                  onClick: () => apply2({ name: draft }),
                  style: {
                    ...buttonStyle,
                    border: "none",
                    background: nameDirty ? ACCENT : BORDER,
                    color: nameDirty ? "#fff" : MUTED,
                    cursor: nameDirty ? "pointer" : "not-allowed"
                  },
                  children: "\u4FDD\u5B58"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                "button",
                {
                  type: "button",
                  style: buttonStyle,
                  onClick: () => {
                    setDraft(DEFAULT_BRAND_NAME);
                    apply2({ name: DEFAULT_BRAND_NAME });
                  },
                  children: [
                    "\u6062\u590D\u9ED8\u8BA4\uFF08",
                    DEFAULT_BRAND_NAME,
                    "\uFF09"
                  ]
                }
              ),
              nameDirty ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: hintStyle, children: "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }) : null
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { style: headingStyle, children: "\u9762\u677F\u663E\u793A" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: settings.centerPanel,
                  onChange: (event) => apply2({ centerPanel: event.target.checked })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: "13px", color: LABEL }, children: "\u5185\u5BB9\u5C45\u4E2D\u663E\u793A" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: "\u672C\u9762\u677F\u4F1A\u51FA\u73B0\u5728\u4E24\u4E2A\u5BBD\u5EA6\u5DEE\u5F02\u5F88\u5927\u7684\u5BB9\u5668\u91CC\uFF1A\u8BBE\u7F6E\u5F39\u7A97\u5F88\u7A84\uFF0C\u800C\u6302\u5230\u5DE6\u4FA7\u680F\u540E\u662F\u6574\u7A97\u5BBD\u3002 \u5C45\u4E2D\u65F6\u5185\u5BB9\u9650\u5BBD 620px \u5E76\u6C34\u5E73\u5C45\u4E2D\uFF1B\u5173\u95ED\u5219\u8D34\u5DE6\u5BF9\u9F50\u3002 \u672C\u8BBE\u7F6E\u53EA\u4F5C\u7528\u4E8E\u672C\u9762\u677F\uFF0C\u4E0D\u5F71\u54CD\u5176\u5B83\u63D2\u4EF6\u7684\u9762\u677F\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { style: headingStyle, children: "\u5DE6\u4FA7\u680F\u9762\u677F" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: "\u52FE\u9009\u7684\u63D2\u4EF6\u9762\u677F\u4F1A\u4EE5\u72EC\u7ACB\u6761\u76EE\u51FA\u73B0\u5728\u5DE6\u4FA7\u680F\uFF08\u300C\u63D2\u4EF6\u300D\u4E0B\u65B9\uFF09\u3002\u53EF\u591A\u9009\u3002" }),
            providers.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: "\u6CA1\u6709\u53D1\u73B0\u53EF\u5D4C\u5165\u7684\u9762\u677F\u63D0\u4F9B\u65B9\u3002\u53EA\u6709\u4E3B\u52A8\u66B4\u9732\u6E32\u67D3\u63A5\u53E3\u7684\u63D2\u4EF6\uFF08\u4F8B\u5982 dshmarket\uFF09\u624D\u80FD\u88AB\u642C\u8FDB\u4FA7\u680F\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: providers.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
              "label",
              {
                style: { display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: selected.has(provider.key),
                      onChange: (event) => togglePanel(provider.key, event.target.checked)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: "13px", color: LABEL }, children: providerLabel(provider.key) }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: "11px", color: MUTED }, children: provider.key })
                ]
              },
              provider.key
            )) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(InstalledPluginsSection, {}),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { style: cardStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { style: headingStyle, children: "\u5E94\u7528\u91CD\u542F" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: hintStyle, children: "\u670D\u52A1\u7AEF\uFF08Node \u534A\u8FB9\uFF09\u7684\u6539\u52A8\u9700\u8981\u91CD\u542F DSH \u624D\u4F1A\u52A0\u8F7D\u3002\u672C\u673A\u70ED\u91CD\u8F7D\u5728 Windows \u4E0A\u4E0D\u53EF\u7528\uFF0C \u56E0\u6B64\u8FD9\u91CC\u63D0\u4F9B\u4E00\u4E2A\u76F4\u63A5\u91CD\u542F\u7684\u5165\u53E3\u3002" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { style: { ...hintStyle, color: DANGER }, children: [
              "\u91CD\u542F\u4F1A",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: "\u5F3A\u5236\u7ED3\u675F" }),
              "\u5F53\u524D DSH \u8FDB\u7A0B\u518D\u91CD\u65B0\u62C9\u8D77\uFF1A\u6B63\u5728\u8FD0\u884C\u7684\u4F1A\u8BDD\u4E0E\u4EFB\u52A1\u4F1A\u88AB\u4E2D\u65AD\uFF0C DSH \u81EA\u8EAB\u7684\u9000\u51FA\u786E\u8BA4\u4E0D\u4F1A\u5F39\u51FA\u3002"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }, children: [
              restartState === "confirming" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    style: { ...buttonStyle, border: "none", background: DANGER, color: "#fff" },
                    onClick: () => void doRestart(),
                    children: "\u786E\u8BA4\u91CD\u542F"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", style: buttonStyle, onClick: () => setRestartState("idle"), children: "\u53D6\u6D88" })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  style: buttonStyle,
                  disabled: restartState === "sending",
                  onClick: () => {
                    setRestartMessage(null);
                    setRestartState("confirming");
                  },
                  children: restartState === "sending" ? "\u6B63\u5728\u91CD\u542F\u2026" : "\u91CD\u542F DSH"
                }
              ),
              restartMessage !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: hintStyle, children: restartMessage }) : null
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                style: buttonStyle,
                onClick: () => {
                  const failure = resetBrandSettings();
                  setDraft(DEFAULT_BRAND_NAME);
                  setNotice(null);
                  setError(failure);
                },
                children: "\u5168\u90E8\u6062\u590D\u9ED8\u8BA4"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: hintStyle, children: "\u4FDD\u5B58\u5728\u6D4F\u89C8\u5668\u672C\u5730\uFF08localStorage\uFF09\u3002" })
          ] }),
          error !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { ...hintStyle, color: DANGER }, children: error }) : null
        ]
      }
    );
  };
}

// src/client/index.ts
var inject = ["slots"];
var BRAND_PRIORITY = -10;
var SETTINGS_ORDER = 45;
var SETTINGS_ID = "oblivion-brand";
var PROVIDER_NAME = "oblivionBrand";
function apply(ctx) {
  const ready = { mark: false, name: false, hero: false, panellist: false, main: false };
  const disposers = /* @__PURE__ */ new Map();
  const panelKeys = /* @__PURE__ */ new Set();
  const warn = (message2) => {
    ctx.logger?.("@oblivion/brand").warn(message2);
  };
  const open = (key, create) => {
    try {
      const result = create();
      if (typeof result === "function") disposers.set(key, result);
    } catch (error) {
      warn(`\u69FD\u4F4D\u6CE8\u518C\u5931\u8D25 ${key}\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const close = (key) => {
    const dispose = disposers.get(key);
    if (dispose === void 0) return;
    disposers.delete(key);
    try {
      dispose();
    } catch (error) {
      warn(`\u69FD\u4F4D\u91CA\u653E\u5931\u8D25 ${key}\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const reconcile = (key, wanted, create) => {
    const has = disposers.has(key);
    if (wanted && !has) open(key, create);
    else if (!wanted && has) close(key);
  };
  const settingsPanel = createBrandSettingsPanel(() => discoverPanelProviders(ctx));
  let disposeProvider;
  if (typeof ctx.provide === "function") {
    try {
      const handle = ctx.provide(PROVIDER_NAME, {
        version: 1,
        settingsVisible: () => true,
        setSettingsVisible: () => void 0,
        render: () => (0, import_react5.createElement)(settingsPanel)
      });
      if (typeof handle === "function") disposeProvider = handle;
    } catch (error) {
      warn(`\u63D0\u4F9B\u65B9\u9762\u677F\u6CE8\u518C\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const sync = () => {
    const settings = brandSettings();
    const override = settings.overrideEnabled;
    reconcile(
      "brand.mark",
      override && ready.mark,
      () => ctx.slots.register({ name: "sidebar.brand.mark", priority: BRAND_PRIORITY }, OblivionBrandMark)
    );
    reconcile(
      "brand.name",
      override && ready.name,
      () => ctx.slots.register({ name: "sidebar.brand.name", priority: BRAND_PRIORITY }, OblivionBrandName)
    );
    reconcile(
      "brand.hero",
      override && ready.hero,
      () => ctx.slots.register({ name: "conversation.hero.brand.mark", priority: BRAND_PRIORITY }, OblivionBrandMark)
    );
    const wanted = new Set(settings.sidebarPanels);
    const available = new Map(discoverPanelProviders(ctx).map((provider) => [provider.key, provider]));
    for (const key of [...panelKeys]) {
      if (!wanted.has(key) || !available.has(key)) {
        close(`panel.main:${key}`);
        close(`panel.list:${key}`);
        panelKeys.delete(key);
      }
    }
    let order = PANEL_ORDER_BASE;
    for (const key of wanted) {
      const provider = available.get(key);
      if (provider === void 0) {
        order += 1;
        continue;
      }
      const id = panelEntryId(key);
      const label = providerLabel(key);
      reconcile(
        `panel.main:${key}`,
        ready.main,
        () => ctx.slots.register(
          { name: "main", key: id },
          createEmbeddedPanel(() => available.get(key), label)
        )
      );
      reconcile(
        `panel.list:${key}`,
        ready.panellist,
        () => ctx.slots.register({ name: "sidebar.panellist", id, order, label: () => label }, PanelIcon)
      );
      panelKeys.add(key);
      order += 1;
    }
  };
  ctx.slots.inject("sidebar.brand.mark", () => {
    ready.mark = true;
    sync();
  });
  ctx.slots.inject("sidebar.brand.name", () => {
    ready.name = true;
    sync();
  });
  ctx.slots.inject("conversation.hero.brand.mark", () => {
    ready.hero = true;
    sync();
  });
  ctx.slots.inject("sidebar.panellist", () => {
    ready.panellist = true;
    sync();
  });
  ctx.slots.inject("main", () => {
    ready.main = true;
    sync();
  });
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: SETTINGS_ID,
        order: SETTINGS_ORDER,
        label: () => "Oblivion \u54C1\u724C"
      },
      settingsPanel
    )
  );
  const unsubscribe = subscribeBrandSettings(sync);
  const disposeSettings = () => {
    unsubscribe();
    for (const key of [...disposers.keys()]) close(key);
    disposeProvider?.();
    disposeProvider = void 0;
  };
  if (typeof ctx.effect === "function") ctx.effect(() => disposeSettings, "oblivion-brand: settings sync");
  sync();
}

		return module.exports;
	}
});
