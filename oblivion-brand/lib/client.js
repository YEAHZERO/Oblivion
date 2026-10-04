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
var STORAGE_KEY = "oblivion-brand:name";
function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_BRAND_NAME : raw.slice(0, MAX_BRAND_NAME_LENGTH);
  } catch {
    return DEFAULT_BRAND_NAME;
  }
}
var current = read();
var listeners = /* @__PURE__ */ new Set();
function brandName() {
  return current;
}
function notify() {
  for (const listener of [...listeners]) listener();
}
function setBrandName(next) {
  const trimmed = next.slice(0, MAX_BRAND_NAME_LENGTH);
  current = trimmed;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
  }
  notify();
}
function resetBrandName() {
  current = DEFAULT_BRAND_NAME;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
  notify();
}
function subscribeBrandName(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function useBrandName() {
  const [value, setValue] = (0, import_react.useState)(current);
  (0, import_react.useEffect)(() => subscribeBrandName(() => setValue(current)), []);
  return value;
}

// src/client/Brand.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var LABEL_COLOR = "var(--dsw-alias-label-primary, currentColor)";
function OblivionBrandMark({ size }) {
  const gradientId = "obl-polaris-gradient";
  const center = POLARIS_VIEWBOX.width / 2;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "svg",
    {
      "data-obl-brand-mark": "",
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "circle",
          {
            cx: center,
            cy: center,
            r: POLARIS_CENTER_DOT_RADIUS,
            fill: POLARIS_GRADIENT_FROM
          }
        )
      ]
    }
  );
}
function OblivionBrandName() {
  const name = useBrandName();
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
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var LABEL = "var(--dsw-alias-label-primary, currentColor)";
var MUTED = "var(--dsw-alias-label-tertiary, #8b93a1)";
var BORDER = "var(--dsw-alias-border-l2, #e5e7eb)";
var ACCENT = "var(--dsw-alias-brand-primary, #4f6ef7)";
var rowStyle = { display: "flex", alignItems: "center", gap: "8px" };
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
function BrandSettingsPanel() {
  const name = useBrandName();
  const [draft, setDraft] = (0, import_react2.useState)(() => brandName());
  const dirty = draft !== name;
  const empty = draft === "";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "14px", padding: "4px", maxWidth: "560px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { style: { margin: "0 0 4px", fontSize: "16px", fontWeight: 500, color: LABEL }, children: "Oblivion \u54C1\u724C" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { margin: 0, fontSize: "12px", lineHeight: "18px", color: MUTED }, children: "\u4FA7\u680F\u54C1\u724C\u884C\u7684\u6587\u5B57\uFF0C\u4EE5\u53CA\u4F1A\u8BDD Hero \u533A\u7684\u54C1\u724C\u56FE\u5F62\u3002\u56FE\u5F62\u56FA\u5B9A\u4E3A\u5317\u6781\u661F\uFF1B\u6587\u5B57\u7559\u7A7A\u5219\u53EA\u663E\u793A\u56FE\u5F62\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...rowStyle, gap: "12px", padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(OblivionBrandMark, { size: 32 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "span",
        {
          style: {
            fontFamily: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
            fontSize: "16px",
            fontWeight: 500,
            color: LABEL
          },
          children: name === "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("em", { style: { color: MUTED, fontWeight: 400 }, children: "\uFF08\u4E0D\u663E\u793A\u6587\u5B57\uFF09" }) : name
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: LABEL }, children: [
      "\u54C1\u724C\u540D\u6587\u5B57",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { ...rowStyle, fontSize: "12px", color: MUTED }, children: [
      draft.length,
      "/",
      MAX_BRAND_NAME_LENGTH,
      " \u5B57\u7B26",
      empty ? " \xB7 \u7559\u7A7A\u8868\u793A\u9690\u85CF\u6587\u5B57" : ""
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: rowStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          disabled: !dirty,
          onClick: () => setBrandName(draft),
          style: {
            ...buttonStyle,
            border: "none",
            background: dirty ? ACCENT : BORDER,
            color: dirty ? "#fff" : MUTED,
            cursor: dirty ? "pointer" : "not-allowed"
          },
          children: "\u4FDD\u5B58"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          onClick: () => {
            resetBrandName();
            setDraft(DEFAULT_BRAND_NAME);
          },
          style: buttonStyle,
          children: [
            "\u6062\u590D\u9ED8\u8BA4\uFF08",
            DEFAULT_BRAND_NAME,
            "\uFF09"
          ]
        }
      ),
      dirty ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "12px", color: MUTED }, children: "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { margin: 0, fontSize: "12px", lineHeight: "18px", color: MUTED }, children: "\u4FDD\u5B58\u5728\u6D4F\u89C8\u5668\u672C\u5730\uFF08localStorage\uFF09\u3002" })
  ] });
}

// src/client/market.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var MARKET_PANEL_ID = "obl-market";
var MARKET_PANEL_ORDER = 5;
function MarketPanelIcon({ size, active }) {
  const unit = size / 18;
  const square = 7 * unit;
  const gap = 2 * unit;
  const radius = 1.6 * unit;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "svg",
    {
      "data-obl-market-icon": "",
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      "aria-hidden": "true",
      style: { display: "block", opacity: active ? 1 : 0.75 },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("g", { fill: "currentColor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: 0, y: 0, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: square + gap, y: 0, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: 0, y: square + gap, width: square, height: square, rx: radius }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("rect", { x: square + gap, y: square + gap, width: square, height: square, rx: radius })
      ] })
    }
  );
}
function createMarketPanel(getMarket) {
  return function MarketPanel() {
    const market = getMarket();
    const element = typeof market?.render === "function" ? market.render() : null;
    if (element === null) {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
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
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { style: { fontWeight: 500, color: "var(--dsw-alias-label-primary, currentColor)" }, children: "\u63D2\u4EF6\u5E02\u573A\u6CA1\u6709\u63D0\u4F9B\u9762\u677F" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u9700\u8981\u5148\u5B89\u88C5\u5E76\u542F\u7528 dshmarket\uFF0C\u7136\u540E\u5237\u65B0\u9875\u9762\u3002" })
          ]
        }
      );
    }
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { "data-obl-market-panel": "", style: { height: "100%", minHeight: 0, overflow: "auto" }, children: element });
  };
}

// src/client/index.ts
var inject = ["slots"];
var BRAND_PRIORITY = -10;
var SETTINGS_ORDER = 45;
var SETTINGS_ID = "oblivion-brand";
function apply(ctx) {
  ctx.slots.inject(
    "sidebar.brand.mark",
    () => ctx.slots.inject("sidebar.brand.name", function* () {
      yield ctx.slots.register({ name: "sidebar.brand.mark", priority: BRAND_PRIORITY }, OblivionBrandMark);
      yield ctx.slots.register({ name: "sidebar.brand.name", priority: BRAND_PRIORITY }, OblivionBrandName);
    })
  );
  ctx.slots.inject(
    "conversation.hero.brand.mark",
    () => ctx.slots.register(
      { name: "conversation.hero.brand.mark", priority: BRAND_PRIORITY },
      OblivionBrandMark
    )
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: SETTINGS_ID,
        order: SETTINGS_ORDER,
        label: () => "Oblivion \u54C1\u724C"
      },
      BrandSettingsPanel
    )
  );
  ctx.slots.inject(
    "sidebar.panellist",
    () => ctx.slots.register(
      {
        name: "sidebar.panellist",
        id: MARKET_PANEL_ID,
        order: MARKET_PANEL_ORDER,
        label: () => "\u63D2\u4EF6\u5E02\u573A"
      },
      MarketPanelIcon
    )
  );
  ctx.slots.inject(
    "main",
    () => ctx.slots.register(
      { name: "main", key: MARKET_PANEL_ID },
      createMarketPanel(() => ctx.get("market"))
    )
  );
}

		return module.exports;
	}
});
