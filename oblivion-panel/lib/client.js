window.__ModuleLoader__.load({
	id: "@oblivion/panel",
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
  default: () => index_default,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react2 = require("react");

// src/client/Panel.tsx
var import_react = require("react");

// src/client/format.ts
function percent(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "\u2014";
  return (ratio * 100).toFixed(1) + "%";
}
function relativeTime(at, now = Date.now()) {
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) return "\u2014";
  const delta = now - at;
  if (delta < 0) return "\u521A\u521A";
  const minutes = Math.floor(delta / 6e4);
  if (minutes < 1) return "\u521A\u521A";
  if (minutes < 60) return minutes + " \u5206\u949F\u524D";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " \u5C0F\u65F6\u524D";
  return Math.floor(hours / 24) + " \u5929\u524D";
}
function actionLabel(action) {
  switch (action) {
    case "created":
      return "\u5DF2\u6C89\u6DC0";
    case "appended":
      return "\u8FFD\u52A0";
    case "duplicate":
      return "\u91CD\u590D";
    case "conflict":
      return "\u51B2\u7A81";
    case "ignored":
      return "\u88AB\u62E6\u4E0B";
    case "no-qa":
      return "\u65E0\u95EE\u7B54";
    default:
      return String(action ?? "\u672A\u77E5");
  }
}
function hintLine(hint) {
  const key = hint.key ?? "(\u672A\u77E5\u952E)";
  const current = hint.current === void 0 ? "\u2014" : formatValue(hint.current);
  const suggested = hint.suggested === void 0 ? "" : " \u2192 " + formatValue(hint.suggested);
  const why = hint.why ? "\u3000" + hint.why : "";
  return key + "\uFF1A" + current + suggested + why;
}
function formatValue(value) {
  if (value === null) return "null";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}
function statNumber(core, field) {
  if (!core || typeof core !== "object") return void 0;
  const stats = core.stats;
  if (!stats || typeof stats !== "object") return void 0;
  const value = stats[field];
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function topReason(core) {
  if (!core || typeof core !== "object") return null;
  const stats = core.stats;
  if (!stats || typeof stats !== "object") return null;
  const byReason = stats.byReason;
  if (!byReason || typeof byReason !== "object") return null;
  const entries = Object.entries(byReason).filter(([, count]) => typeof count === "number").sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) return null;
  return { reason: entries[0][0], count: Number(entries[0][1]) };
}

// src/client/Panel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var STATUS_ROUTE = "/oblivion-panel/status";
var S = {
  root: {
    padding: "10px 12px 24px",
    fontSize: 12,
    lineHeight: 1.7,
    color: "inherit",
    overflow: "auto",
    height: "100%",
    boxSizing: "border-box"
  },
  row: { display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" },
  h: { fontSize: 12, fontWeight: 600, margin: "14px 0 6px", opacity: 0.85 },
  card: {
    border: "1px solid rgba(127,127,127,0.28)",
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 6
  },
  kpi: { display: "flex", gap: 14, flexWrap: "wrap", margin: "6px 0 2px" },
  kpiCell: { minWidth: 64 },
  kpiLabel: { fontSize: 11, opacity: 0.6 },
  kpiValue: { fontSize: 15, fontWeight: 600 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 },
  dim: { opacity: 0.65 },
  btn: {
    border: "1px solid rgba(127,127,127,0.35)",
    borderRadius: 5,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: "2px 8px",
    fontSize: 11
  },
  list: { margin: 0, padding: 0, listStyle: "none" },
  li: { padding: "3px 0", borderTop: "1px solid rgba(127,127,127,0.16)" }
};
function kpi(label, value) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.kpiCell, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.kpiLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.kpiValue, children: value })
  ] });
}
function emptyReason(data) {
  if (!data.core) {
    return "\u8BFB\u4E0D\u5230 @oblivion/core \u7684 status.json \u2014\u2014 \u68C0\u67E5 core \u662F\u5426\u88C5\u8F7D\uFF08\u5B83\u7684\u53EA\u8BFB\u5FEB\u7167\u5728\u6BCF\u6B21\u88C5\u8F7D\u65F6\u5237\u65B0\uFF09\u3002";
  }
  const turns = statNumber(data.core, "turns");
  if (!turns) {
    return "core \u5DF2\u88C5\u8F7D\uFF08v" + String(data.core.version ?? "?") + "\uFF09\uFF0C\u4F46\u8FD8\u6CA1\u6709\u8D70\u5B8C\u7684 turn/end \u2014\u2014 \u6B63\u5E38\u95EE\u4E00\u8F6E\u518D\u770B\u3002";
  }
  return "\u6709 " + turns + " \u8F6E\u5224\u5B9A\uFF0C\u4F46\u90FD\u8FD8\u6CA1\u6C89\u6DC0\uFF1A\u539F\u56E0\u89C1\u4E0B\u9762\u7684\u300C\u6700\u8FD1\u5224\u5B9A\u300D\u3002";
}
function OblivionPanel(props) {
  const [state, setState] = (0, import_react.useState)({ status: "loading" });
  const load = (0, import_react.useCallback)(async () => {
    setState((prev) => prev.status === "ready" ? prev : { status: "loading" });
    try {
      const response = await fetch(STATUS_ROUTE, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      setState({ status: "ready", data });
    } catch (error) {
      setState({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }, []);
  (0, import_react.useEffect)(() => {
    if (props.visible === false) return;
    void load();
  }, [load, props.visible]);
  const body = (0, import_react.useMemo)(() => {
    if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.dim, children: "\u8BFB\u53D6\u4E2D\u2026" });
    if (state.status === "error") {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          "\u8BFB\u4E0D\u5230\u89C2\u6D4B\u6570\u636E\uFF1A",
          state.error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.dim, children: [
          "\u82E5\u521A\u88C5\u8F7D\u672C\u63D2\u4EF6\uFF0C\u9700\u8981**\u91CD\u542F\u4E00\u6B21 App**\uFF08Node \u534A\u8FB9\u6539\u52A8\u4E0D\u4F1A\u70ED\u52A0\u8F7D\uFF09\u3002\u8DEF\u7531\uFF1A",
          STATUS_ROUTE
        ] })
      ] });
    }
    const data = state.data;
    const core = data.core ?? null;
    const hints = core?.hints ?? [];
    const turns = statNumber(core, "turns");
    const evaluated = statNumber(core, "evaluated");
    const captureRate = (core?.stats ?? {}).captureRate;
    const top = topReason(core);
    const recent = data.trace?.recent ?? [];
    const items = data.items ?? [];
    const notes = data.notes ?? [];
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.dim, children: [
          "core ",
          core ? "v" + String(core.version ?? "?") : "\u672A\u88C5\u8F7D",
          " \xB7 \u9762\u677F v",
          String(data.panelVersion ?? "?"),
          " \xB7 \u5237\u65B0\u4E8E ",
          relativeTime(data.generatedAt)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: S.btn, onClick: () => void load(), children: "\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.kpi, children: [
        kpi("\u6355\u83B7\u7387", percent(captureRate)),
        kpi("\u5224\u5B9A\u8F6E\u6570", String(turns ?? "\u2014")),
        kpi("\u5DF2\u8BC4\u4F30", String(evaluated ?? "\u2014")),
        kpi("\u5DF2\u6C89\u6DC0", String(statNumber(core, "captured") ?? "\u2014"))
      ] }),
      !core || !turns ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...S.card, marginTop: 10 }, children: emptyReason(data) }) : null,
      top ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...S.dim, marginTop: 4 }, children: [
        "\u4E3B\u8981\u62E6\u622A\u539F\u56E0\uFF1A",
        top.reason,
        "\uFF08",
        top.count,
        " \u6B21\uFF09"
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.h, children: [
        "\u8C03\u53C2\u5EFA\u8BAE ",
        hints.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.dim, children: "\uFF08\u6682\u65E0\uFF1A\u6837\u672C\u4E0D\u8DB3\u65F6 core \u523B\u610F\u4E0D\u5F00\u53E3\uFF09" }) : null
      ] }),
      hints.map((hint, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.card, children: hintLine(hint) }, String(hint.key ?? index))),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.h, children: "\u6700\u8FD1\u5224\u5B9A" }),
      recent.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.dim, children: [
        "\u8FD8\u6CA1\u6709\u5224\u5B9A\u8BB0\u5F55\uFF08",
        data.trace?.path ?? "decisions.jsonl",
        "\uFF09"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: S.list, children: recent.slice().reverse().map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: S.li, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: S.dim, children: relativeTime(row.at) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: actionLabel(row.action) }),
        row.score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.dim, children: [
          " \xB7 \u5206\u503C ",
          String(row.score)
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...S.dim, ...S.mono }, children: String(row.reason ?? "") })
      ] }, index)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.h, children: [
        "\u6700\u8FD1\u6C89\u6DC0\uFF08",
        items.length,
        "\uFF09"
      ] }),
      items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.dim, children: "\u8FD8\u6CA1\u6709\u6761\u76EE\u843D\u76D8" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: S.list, children: items.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: S.li, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: String(item.title ?? "(\u65E0\u6807\u9898)") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.dim, children: [
          relativeTime(item.created_at),
          " \xB7 \u4E3B\u9898 ",
          String(item.topic ?? "\u2014"),
          " \xB7 ",
          String(item.id ?? "")
        ] })
      ] }, String(item.id ?? index))) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.h, children: [
        "\u77E5\u8BC6\u5E93\u7B14\u8BB0\uFF08",
        notes.length,
        "\uFF09"
      ] }),
      notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.dim, children: [
        "01_\u95EE\u7B54\u6C89\u6DC0/ \u91CC\u8FD8\u6CA1\u6709\u7B14\u8BB0\uFF08",
        data.mdRoot ?? "\u2014",
        "\uFF09"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: S.list, children: notes.map((note, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: S.li, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "a",
          {
            href: "#",
            style: { color: "inherit" },
            onClick: (event) => {
              event.preventDefault();
              if (props.onOpenFile && note.path) props.onOpenFile(note.path);
            },
            title: note.path ?? "",
            children: String(note.name ?? "")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: S.dim, children: [
          " \xB7 ",
          relativeTime(note.mtimeMs)
        ] })
      ] }, String(note.path ?? index))) }),
      (data.problems ?? []).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: S.h, children: [
          "\u8BFB\u53D6\u544A\u8B66\uFF08",
          data.problems?.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: S.list, children: (data.problems ?? []).map((problem, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { style: { ...S.li, ...S.mono, ...S.dim }, children: problem }, index)) })
      ] }) : null
    ] });
  }, [state, load, props.onOpenFile]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: S.root, children: body });
}

// src/client/register.ts
var PANEL_TAB_ID = "oblivion:panel";
function panelDescriptor(component) {
  return {
    id: PANEL_TAB_ID,
    title: () => "Oblivion",
    description: () => "\u8BA4\u77E5\u5C42\u89C2\u6D4B\uFF1A\u6355\u83B7\u7387\u3001\u62E6\u622A\u539F\u56E0\u3001\u8C03\u53C2\u5EFA\u8BAE\u4E0E\u6700\u8FD1\u6C89\u6DC0",
    order: 70,
    single: true,
    component
  };
}
function registerPanelTab(ctx, component, warn) {
  const attach = (service) => {
    if (!service || typeof service.registerTab !== "function") {
      return { status: "no-service", detail: "ctx.betterSidebar \u4E0D\u53EF\u7528\uFF08dsh-better-sidebar \u672A\u88C5\u8F7D\uFF1F\uFF09" };
    }
    try {
      const dispose = service.registerTab(panelDescriptor(component));
      if (typeof dispose === "function" && typeof ctx.effect === "function") {
        ctx.effect(() => dispose, "oblivion-panel: better-sidebar tab");
      }
      return { status: "registered" };
    } catch (error) {
      return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
    }
  };
  if (typeof ctx.inject === "function") {
    let result2 = { status: "no-service", detail: "inject \u56DE\u8C03\u672A\u89E6\u53D1" };
    try {
      ctx.inject(["betterSidebar"], (scope) => {
        result2 = attach(scope?.betterSidebar);
        if (result2.status !== "registered") warn("\u9762\u677F tab \u672A\u6CE8\u518C\uFF1A" + String(result2.detail ?? result2.status));
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn("\u9762\u677F tab \u6CE8\u518C\u5931\u8D25\uFF1A" + detail);
      return { status: "failed", detail };
    }
    return result2;
  }
  const direct = typeof ctx.get === "function" ? ctx.get("betterSidebar") : void 0;
  const result = attach(direct);
  if (result.status !== "registered") warn("\u9762\u677F tab \u672A\u6CE8\u518C\uFF1A" + String(result.detail ?? result.status));
  return result;
}

// src/client/index.ts
var inject = [];
var LOG_NAME = "@oblivion/panel";
function apply(ctx) {
  const warn = (message) => {
    const logger = ctx.logger;
    logger?.(LOG_NAME)?.warn?.(message);
  };
  const result = registerPanelTab(ctx, ((props) => (0, import_react2.createElement)(OblivionPanel, props)), warn);
  if (result.status === "registered") {
    const logger = ctx.logger;
    logger?.(LOG_NAME)?.info?.("\u5DF2\u5728 side bar \u6CE8\u518C Oblivion \u9762\u677F tab");
  }
}
var index_default = { inject, apply };

		return module.exports;
	}
});
