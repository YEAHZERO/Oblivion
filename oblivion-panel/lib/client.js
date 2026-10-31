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

// oblivion-panel/src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  default: () => index_default,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react6 = require("react");

// oblivion-panel/src/client/diag.ts
function postDiag(payload) {
  try {
    void fetch("/oblivion-panel/diag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin"
    }).catch(() => void 0);
  } catch {
  }
}

// oblivion-panel/src/client/Panel.tsx
var import_react4 = require("react");

// oblivion-panel/src/client/RestartControl.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var RESTART_PATH = "/obl-brand/restart";
var TASKS_PATH = "/obl-brand/tasks";
var ORPHANS_PATH = "/obl-brand/orphans";
var BTN = {
  idle: "\u91CD\u542F DSH",
  confirming: "\u786E\u8BA4\u9000\u51FA",
  sending: "\u6B63\u5728\u91CD\u542F\u2026",
  done: "\u5DF2\u53D1\u51FA\u91CD\u542F",
  error: "\u91CD\u8BD5"
};
var SWEEP_BTN = {
  idle: "\u6E05\u7406\u5B64\u513F\u8FDB\u7A0B",
  confirming: "\u786E\u8BA4\u6E05\u7406",
  sending: "\u6B63\u5728\u6E05\u7406\u2026",
  done: "\u518D\u6E05\u7406\u4E00\u6B21",
  error: "\u91CD\u8BD5"
};
async function readPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function describeRestartSweep(payload) {
  const sweep = payload?.sweep;
  if (sweep === void 0) return null;
  if (!sweep.ok) {
    return `DSH \u5C06\u5728\u6570\u79D2\u5185\u91CD\u542F\uFF08\u91CD\u542F\u524D\u6E05\u626B\u672A\u6267\u884C\uFF1A${sweep.error ?? "\u672A\u77E5\u539F\u56E0"}\uFF09`;
  }
  const killed = sweep.report?.killed.length ?? 0;
  return killed > 0 ? `DSH \u5C06\u5728\u6570\u79D2\u5185\u91CD\u542F\uFF08\u91CD\u542F\u524D\u6E05\u6389 ${killed} \u4E2A\u5B64\u513F\u8FDB\u7A0B\uFF09` : "DSH \u5C06\u5728\u6570\u79D2\u5185\u91CD\u542F\uFF0C\u672C\u9875\u4F1A\u65AD\u5F00\u3002";
}
function describeSweep(payload, fallback) {
  if (typeof payload?.summary === "string" && payload.summary !== "") return payload.summary;
  const report = payload?.report;
  if (report === void 0) return fallback;
  return report.killed.length === 0 ? `\u6CA1\u6709\u53D1\u73B0\u5B64\u513F\u8FDB\u7A0B\uFF08\u626B\u63CF ${report.scanned} \u4E2A\u8FDB\u7A0B\uFF09` : `\u5DF2\u6E05\u7406 ${report.killed.length} \u4E2A\u5B64\u513F\u8FDB\u7A0B\uFF08\u626B\u63CF ${report.scanned} \u4E2A\u8FDB\u7A0B\uFF0C\u547D\u4E2D ${report.matched} \u4E2A\u4F20\u8F93\u8FDB\u7A0B\uFF09`;
}
async function probeActiveTasks() {
  try {
    const response = await fetch(TASKS_PATH, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body.active === true;
  } catch {
    return false;
  }
}
var BUTTON_STYLE = {
  border: "1px solid rgba(127,127,127,0.35)",
  borderRadius: 5,
  background: "transparent",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 11
};
var MSG_STYLE = { fontSize: 11, opacity: 0.75 };
function RestartControl() {
  const [phase, setPhase] = (0, import_react.useState)("idle");
  const [message, setMessage] = (0, import_react.useState)("");
  const [closing, setClosing] = (0, import_react.useState)(false);
  const hideUiForRestart = (0, import_react.useCallback)(() => {
    setClosing(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.close();
        } catch {
        }
      });
    });
  }, []);
  const restart = (0, import_react.useCallback)(async () => {
    setPhase("sending");
    setMessage("");
    try {
      const response = await fetch(RESTART_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin"
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setPhase("error");
        setMessage(
          response.status === 404 ? "\u627E\u4E0D\u5230\u91CD\u542F\u8DEF\u7531 \u2014\u2014 @oblivion/brand \u672A\u88C5\u8F7D\uFF1F\u91CD\u542F\u673A\u5236\u7531\u5B83\u63D0\u4F9B\u3002" : `HTTP ${response.status}${payload?.error ? `\uFF1A${payload.error}` : ""}`
        );
        return;
      }
      setPhase("done");
      setMessage(describeRestartSweep(payload) ?? "DSH \u5C06\u5728\u6570\u79D2\u5185\u91CD\u542F\uFF0C\u672C\u9875\u4F1A\u65AD\u5F00\u3002");
      hideUiForRestart();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [hideUiForRestart]);
  const beginRestart = (0, import_react.useCallback)(async () => {
    const active = await probeActiveTasks();
    if (!active) {
      void restart();
      return;
    }
    setPhase("confirming");
    setMessage("\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u5C06\u4F1A\u4E2D\u65AD");
  }, [restart]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    closing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        "data-obl-panel-restart-cover": "",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 2147483e3,
          background: "#111",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          letterSpacing: "0.02em"
        },
        children: "\u6B63\u5728\u91CD\u542F DSH\u2026"
      }
    ) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          style: {
            ...BUTTON_STYLE,
            color: phase === "error" ? "#d9534f" : "inherit",
            cursor: phase === "sending" ? "default" : "pointer"
          },
          disabled: phase === "sending",
          onClick: () => {
            if (phase === "idle") {
              void beginRestart();
              return;
            }
            void restart();
          },
          children: BTN[phase] ?? "\u91CD\u542F DSH"
        }
      ),
      message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MSG_STYLE, children: message }) : null
    ] }),
    phase === "confirming" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        "data-obl-panel-restart-dialog": "",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 2147483e3,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "\u9000\u51FA DeepSeek Harness\uFF1F",
            style: {
              width: 360,
              maxWidth: "calc(100vw - 48px)",
              background: "#ffffff",
              color: "#1a1a1a",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "18px 20px 16px",
              fontFamily: 'system-ui, "Segoe UI", sans-serif'
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 }, children: "\u9000\u51FA DeepSeek Harness\uFF1F" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 13, lineHeight: 1.6, opacity: 0.85, marginBottom: 18 }, children: "\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u5C06\u4F1A\u4E2D\u65AD" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    style: {
                      ...BUTTON_STYLE,
                      padding: "4px 16px",
                      fontSize: 12,
                      background: "#2d6cdf",
                      border: "1px solid #2d6cdf",
                      color: "#fff",
                      borderRadius: 5
                    },
                    onClick: () => {
                      void restart();
                    },
                    children: "\u9000\u51FA"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    style: { ...BUTTON_STYLE, padding: "4px 16px", fontSize: 12, borderRadius: 5 },
                    onClick: () => {
                      setPhase("idle");
                      setMessage("");
                    },
                    children: "\u53D6\u6D88"
                  }
                )
              ] })
            ]
          }
        )
      }
    ) : null
  ] });
}
function OrphanControl() {
  const [phase, setPhase] = (0, import_react.useState)("idle");
  const [message, setMessage] = (0, import_react.useState)("");
  const sweep = (0, import_react.useCallback)(async () => {
    setPhase("sending");
    setMessage("");
    try {
      const response = await fetch(ORPHANS_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin"
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setPhase("error");
        setMessage(
          response.status === 404 ? "\u627E\u4E0D\u5230\u6E05\u626B\u8DEF\u7531 \u2014\u2014 @oblivion/brand \u672A\u88C5\u8F7D\uFF1F\u6E05\u626B\u7531\u5B83\u63D0\u4F9B\u3002" : payload?.error ?? `HTTP ${response.status}`
        );
        return;
      }
      setPhase("idle");
      setMessage(describeSweep(payload, "\u6E05\u7406\u5B8C\u6210\u3002"));
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        style: {
          ...BUTTON_STYLE,
          color: phase === "error" ? "#d9534f" : "inherit",
          cursor: phase === "sending" ? "default" : "pointer"
        },
        disabled: phase === "sending",
        title: "\u7ED3\u675F web-login \u9057\u7559\u7684\u65E0\u5934 Edge \u4F20\u8F93\u8FDB\u7A0B\uFF08\u5B83\u4EEC\u5360\u7740 transport-profile \u76EE\u5F55\uFF0C\u4F1A\u8BA9\u8D26\u53F7\u6821\u9A8C\u5168\u90E8\u62A5\u9519\uFF09\u3002\u4E0D\u91CD\u542F DSH\u3002",
        onClick: () => {
          if (phase === "idle") {
            setPhase("confirming");
            setMessage("\u53EA\u7ED3\u675F web-login \u9057\u7559\u7684\u4F20\u8F93\u8FDB\u7A0B\uFF0C\u4E0D\u91CD\u542F DSH\uFF1B\u6B63\u5728\u7528\u7684\u4F20\u8F93\u8FDB\u7A0B\u4E0D\u53D7\u5F71\u54CD\u3002");
            return;
          }
          void sweep();
        },
        children: SWEEP_BTN[phase] ?? "\u6E05\u7406\u5B64\u513F\u8FDB\u7A0B"
      }
    ),
    message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: MSG_STYLE, children: message }) : null
  ] });
}

// oblivion-panel/src/client/PluginUpdates.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var UPDATES_PATH = "/obl-brand/updates";
var APPLY_PATH = "/obl-brand/updates/apply";
var BTN2 = {
  border: "1px solid rgba(127,127,127,0.35)",
  borderRadius: 5,
  background: "transparent",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 11
};
function PluginUpdates() {
  const [phase, setPhase] = (0, import_react2.useState)("idle");
  const [items, setItems] = (0, import_react2.useState)([]);
  const [selected, setSelected] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  const [message, setMessage] = (0, import_react2.useState)("");
  const [applying, setApplying] = (0, import_react2.useState)(false);
  const check = (0, import_react2.useCallback)(async () => {
    setPhase("checking");
    setMessage("");
    try {
      const response = await fetch(UPDATES_PATH, {
        headers: { accept: "application/json" },
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setPhase("error");
        setMessage(`\u68C0\u67E5\u5931\u8D25\uFF1A${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const list = body.items ?? [];
      const errs = (body.errors ?? []).map((e) => e.name);
      setItems(list);
      setSelected(new Set(list.map((item) => item.name)));
      setPhase(list.length > 0 ? "listing" : "done");
      if (errs.length > 0) {
        setMessage(`\u68C0\u67E5\u5B8C\u6210\uFF0C${String(list.length)} \u4E2A\u53EF\u66F4\u65B0\uFF1B${errs.join("\u3001")} \u67E5\u8BE2\u5931\u8D25\u3002`);
      } else if (list.length === 0) {
        setMessage("\u6240\u6709\u63D2\u4EF6\u5DF2\u662F\u6700\u65B0\u3002");
      } else {
        setMessage("");
      }
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);
  const apply2 = (0, import_react2.useCallback)(async () => {
    const names = [...selected];
    if (names.length === 0) {
      setMessage("\u6CA1\u6709\u52FE\u9009\u4EFB\u4F55\u9879\u3002");
      return;
    }
    setPhase("applying");
    setApplying(true);
    setMessage("");
    try {
      const response = await fetch(APPLY_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names }),
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setPhase("error");
        setMessage(`\u66F4\u65B0\u5931\u8D25\uFF1A${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const changed = (body.changed ?? []).map((item) => `${item.name}@${item.latest}`).join("\u3001");
      setItems([]);
      setPhase("done");
      setMessage(`\u5DF2\u66F4\u65B0 ${String(body.changed?.length ?? 0)} \u4E2A\uFF1A${changed}\u3002\u91CD\u542F DSH \u540E\u751F\u6548\u3002`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(false);
    }
  }, [selected]);
  const toggle = (name) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          style: { ...BTN2, cursor: phase === "checking" || phase === "applying" ? "default" : "pointer" },
          disabled: phase === "checking" || phase === "applying",
          onClick: () => {
            void check();
          },
          children: phase === "checking" ? "\u6B63\u5728\u68C0\u67E5\u2026" : "\u68C0\u67E5\u66F4\u65B0"
        }
      ),
      message !== "" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, opacity: 0.75 }, children: message }) : null
    ] }),
    phase === "listing" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "div",
      {
        "data-obl-update-dialog": "",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 2147483e3,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "\u53EF\u66F4\u65B0\u7684\u63D2\u4EF6",
            style: {
              width: 420,
              maxWidth: "calc(100vw - 48px)",
              background: "#ffffff",
              color: "#1a1a1a",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "18px 20px 16px",
              fontFamily: 'system-ui, "Segoe UI", sans-serif'
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 }, children: [
                "\u53EF\u66F4\u65B0\u7684\u63D2\u4EF6\uFF08",
                String(items.length),
                "\uFF09"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { maxHeight: 260, overflow: "auto", fontSize: 12, lineHeight: "1.8" }, children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected.has(item.name),
                    onChange: () => {
                      toggle(item.name);
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { flex: 1 }, children: item.name }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { opacity: 0.7 }, children: [
                  item.current,
                  " \u2192 ",
                  item.latest
                ] })
              ] }, item.name)) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    type: "button",
                    style: {
                      ...BTN2,
                      padding: "4px 16px",
                      fontSize: 12,
                      borderRadius: 5,
                      background: "#2d6cdf",
                      border: "1px solid #2d6cdf",
                      color: "#fff"
                    },
                    disabled: applying,
                    onClick: () => {
                      void apply2();
                    },
                    children: applying ? "\u66F4\u65B0\u4E2D\u2026" : "\u66F4\u65B0\u6240\u9009"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    type: "button",
                    style: { ...BTN2, padding: "4px 16px", fontSize: 12, borderRadius: 5 },
                    onClick: () => {
                      setPhase("idle");
                      setMessage("");
                    },
                    children: "\u53D6\u6D88"
                  }
                )
              ] })
            ]
          }
        )
      }
    ) : null
  ] });
}

// oblivion-panel/src/client/SessionImport.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var SESSIONS_PATH = "/oblivion-core/sessions";
var IMPORT_PATH = "/oblivion-core/sessions/import";
var BTN3 = {
  border: "1px solid rgba(127,127,127,0.35)",
  borderRadius: 5,
  background: "transparent",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 11
};
function SessionImportControl() {
  const [phase, setPhase] = (0, import_react3.useState)("idle");
  const [sessions, setSessions] = (0, import_react3.useState)([]);
  const [selected, setSelected] = (0, import_react3.useState)(/* @__PURE__ */ new Set());
  const [message, setMessage] = (0, import_react3.useState)("");
  const scan = (0, import_react3.useCallback)(async () => {
    setPhase("scanning");
    setMessage("");
    try {
      const response = await fetch(SESSIONS_PATH, {
        headers: { accept: "application/json" },
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setPhase("error");
        setMessage(`\u626B\u63CF\u5931\u8D25\uFF1A${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const list = body.sessions ?? [];
      setSessions(list);
      setSelected(new Set(list.map((s) => s.sessionId)));
      setPhase(list.length > 0 ? "listing" : "done");
      if (list.length === 0) setMessage("\u6CA1\u6709\u53EF\u5BFC\u5165\u7684 DSH \u4F1A\u8BDD\u3002");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);
  const preview = (0, import_react3.useCallback)(async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      setMessage("\u6CA1\u6709\u52FE\u9009\u4EFB\u4F55\u4F1A\u8BDD\u3002");
      return;
    }
    setPhase("previewing");
    setMessage("");
    try {
      const response = await fetch(IMPORT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds: ids, dry_run: true }),
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setPhase("error");
        setMessage(`\u9884\u89C8\u5931\u8D25\uFF1A${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      setPhase("listing");
      setMessage("\u5DF2\u9884\u89C8\uFF08\u672A\u5199\u5165\uFF09\u3002\u70B9\u300C\u786E\u8BA4\u5BFC\u5165\u300D\u624D\u4F1A\u843D\u76D8\u3002");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [selected]);
  const confirmImport = (0, import_react3.useCallback)(async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      setMessage("\u6CA1\u6709\u52FE\u9009\u4EFB\u4F55\u4F1A\u8BDD\u3002");
      return;
    }
    setPhase("importing");
    setMessage("");
    try {
      const response = await fetch(IMPORT_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds: ids, confirm: true, mode: "qa" }),
        credentials: "same-origin"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setPhase("error");
        setMessage(`\u5BFC\u5165\u5931\u8D25\uFF1A${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const imported = body.imported ?? 0;
      const skipped = body.skipped ?? 0;
      const failures = body.failures?.length ?? 0;
      setPhase("done");
      setMessage(
        `\u5DF2\u5BFC\u5165 ${imported} \u6761\uFF0C\u8DF3\u8FC7 ${skipped} \u6761${failures > 0 ? `\uFF0C\u5931\u8D25 ${failures} \u6761` : ""}\u3002\u5237\u65B0\u9762\u677F\u53EF\u89C1\u3002`
      );
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [selected]);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const busy = phase === "scanning" || phase === "previewing" || phase === "importing";
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          style: { ...BTN3, cursor: busy ? "default" : "pointer" },
          disabled: busy,
          onClick: () => {
            void scan();
          },
          children: phase === "scanning" ? "\u6B63\u5728\u626B\u63CF\u2026" : "\u5BFC\u5165 DSH \u4F1A\u8BDD"
        }
      ),
      phase === "listing" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            style: { ...BTN3, cursor: busy ? "default" : "pointer" },
            disabled: busy,
            onClick: () => {
              void preview();
            },
            children: "\u9884\u89C8"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "button",
          {
            type: "button",
            style: {
              ...BTN3,
              cursor: busy ? "default" : "pointer",
              background: "#2d6cdf",
              border: "1px solid #2d6cdf",
              color: "#fff"
            },
            disabled: busy,
            onClick: () => {
              void confirmImport();
            },
            children: "\u786E\u8BA4\u5BFC\u5165"
          }
        )
      ] }) : null,
      message !== "" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, opacity: 0.75 }, children: message }) : null
    ] }),
    phase === "listing" ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        "data-obl-session-dialog": "",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 2147483e3,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "\u53EF\u5BFC\u5165\u7684 DSH \u4F1A\u8BDD",
            style: {
              width: 460,
              maxWidth: "calc(100vw - 48px)",
              background: "#ffffff",
              color: "#1a1a1a",
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "18px 20px 16px",
              fontFamily: 'system-ui, "Segoe UI", sans-serif'
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 10 }, children: [
                "\u53EF\u5BFC\u5165\u7684 DSH \u4F1A\u8BDD\uFF08",
                String(sessions.length),
                "\uFF09"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { maxHeight: 260, overflow: "auto", fontSize: 12, lineHeight: "1.8" }, children: sessions.map((s) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    checked: selected.has(s.sessionId),
                    onChange: () => {
                      toggle(s.sessionId);
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: s.title }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { opacity: 0.7, whiteSpace: "nowrap" }, children: [
                  s.qaCount,
                  " QA \xB7 ",
                  s.sizeKb,
                  "KB"
                ] })
              ] }, s.sessionId)) }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  type: "button",
                  style: { ...BTN3, padding: "4px 16px", fontSize: 12, borderRadius: 5 },
                  onClick: () => {
                    setPhase("idle");
                    setMessage("");
                  },
                  children: "\u5173\u95ED"
                }
              ) })
            ]
          }
        )
      }
    ) : null
  ] });
}

// oblivion-panel/src/client/format.ts
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
function scoreText(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "\u2014";
  return String(Math.round(score * 1e3) / 1e3);
}
function reasonLabel(reason) {
  const text2 = typeof reason === "string" ? reason : String(reason ?? "");
  if (text2.startsWith("exception:")) return "\u5224\u5B9A\u5F02\u5E38" + text2.slice("exception:".length);
  if (text2.startsWith("\u672C\u8F6E\u6CA1\u6709")) return "\u65E0\u95EE\u7B54\u8F6E\uFF08\u5DE5\u5177\u8F6E / \u6CE8\u5165\u8F6E / \u65E0\u56DE\u7B54\uFF09";
  const map = {
    captured: "\u901A\u8FC7\uFF1A\u5DF2\u6C89\u6DC0",
    rejected: "\u5DF2\u62E6\u622A",
    "no-source": "\u65E0\u6765\u6E90\uFF08\u6A21\u578B\u6CA1\u5F15\u7528\u4EFB\u4F55\u6587\u4EF6\u6216\u5DE5\u5177\uFF09",
    "oblivion-originated": "\u6765\u81EA\u672C\u63D2\u4EF6\u81EA\u8EAB\uFF08\u9632\u81EA\u566C\uFF09",
    "answer-too-short": "\u56DE\u7B54\u592A\u77ED",
    "meaningless-only": "\u6CA1\u6709\u5B9E\u8D28\u5185\u5BB9",
    "contains-unknown": "\u56DE\u7B54\u662F\u300C\u4E0D\u77E5\u9053\u300D",
    "pleasantry-only": "\u53EA\u6709\u5BA2\u5957\u8BDD",
    "exact hash match": "\u4E0E\u65E2\u6709\u6761\u76EE\u5B8C\u5168\u76F8\u540C",
    "semantic duplicate": "\u4E0E\u65E2\u6709\u6761\u76EE\u8BED\u4E49\u91CD\u590D",
    "conflicts with existing item": "\u4E0E\u65E2\u6709\u6761\u76EE\u51B2\u7A81",
    "below value threshold": "\u4F4E\u4E8E\u4EF7\u503C\u9608\u503C"
  };
  return map[text2] ?? text2;
}
function topBlocker(byReason) {
  if (!byReason || typeof byReason !== "object") return null;
  const entries = Object.entries(byReason).filter(([reason, count]) => reason !== "captured" && typeof count === "number" && count > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (entries.length === 0) return null;
  return { reason: entries[0][0], count: Number(entries[0][1]) };
}

// oblivion-panel/src/client/polaris.ts
var POLARIS_VIEWBOX = { width: 1024, height: 1024 };
var POLARIS_ICON_COLOR = "#4176e6";
var POLARIS_ICON_PATH = "M512 132L579 350.3L780.7 243.3L673.7 445L892 512L673.7 579L780.7 780.7L579 673.7L512 892L445 673.7L243.3 780.7L350.3 579L132 512L350.3 445L243.3 243.3L445 350.3Z";

// oblivion-panel/src/client/ScoreChart.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var REJECT_COLOR = "#d9534f";
function ScoreChart(props) {
  const { curve } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "svg",
    {
      viewBox: "0 0 " + curve.width + " " + curve.height,
      style: { width: "100%", height: "auto", display: "block" },
      role: "img",
      "aria-label": "\u5224\u5B9A\u4EF7\u5206\u66F2\u7EBF\uFF1A" + curve.points + " \u4E2A\u70B9\uFF0C\u533A\u95F4 " + (curve.min ?? 0).toFixed(2) + "\u2013" + (curve.max ?? 0).toFixed(2) + (curve.threshold === null ? "" : "\uFF0C\u9608\u503C " + curve.threshold.toFixed(2)),
      children: [
        curve.ticks.map((tick) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            "line",
            {
              x1: curve.padX,
              x2: curve.width - curve.padX,
              y1: tick.y,
              y2: tick.y,
              stroke: "rgba(127,127,127,0.18)",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("text", { x: curve.width - 1, y: tick.y - 2, fontSize: 8, textAnchor: "end", fill: "currentColor", opacity: 0.45, children: tick.label })
        ] }, tick.label)),
        curve.thresholdY === null ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "line",
          {
            x1: curve.padX,
            x2: curve.width - curve.padX,
            y1: curve.thresholdY,
            y2: curve.thresholdY,
            stroke: REJECT_COLOR,
            strokeWidth: 1,
            strokeDasharray: "3 3",
            opacity: 0.75
          }
        ),
        curve.area === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: curve.area, fill: POLARIS_ICON_COLOR, opacity: 0.12, stroke: "none" }),
        curve.trend === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: curve.trend, fill: "none", stroke: POLARIS_ICON_COLOR, strokeWidth: 1.4, opacity: 0.5 }),
        curve.line === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: curve.line, fill: "none", stroke: POLARIS_ICON_COLOR, strokeWidth: 1.6, strokeLinejoin: "round" }),
        curve.dots.map((dot, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "circle",
          {
            cx: dot.x,
            cy: dot.y,
            r: dot.pass ? 2.2 : 2.6,
            fill: dot.pass ? POLARIS_ICON_COLOR : REJECT_COLOR,
            children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("title", { children: relativeTime(dot.at) + " \xB7 " + actionLabel(dot.action) + " \xB7 \u5206\u503C " + scoreText(dot.score) })
          },
          index
        ))
      ]
    }
  );
}

// oblivion-panel/src/client/chart.ts
var DEFAULT_WIDTH = 320;
var DEFAULT_HEIGHT = 76;
var DEFAULT_PAD_X = 6;
var DEFAULT_PAD_Y = 8;
var DEFAULT_TREND_WINDOW = 5;
function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
function round(value) {
  return Math.round(value * 100) / 100;
}
function ratioIn01(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
function thresholdOf(config) {
  const record = config;
  return ratioIn01(record?.valueThreshold);
}
function buildScoreCurve(rows, options = {}) {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const padX = DEFAULT_PAD_X;
  const padY = DEFAULT_PAD_Y;
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);
  const trendWindow = Math.max(2, Math.floor(options.trendWindow ?? DEFAULT_TREND_WINDOW));
  const threshold = ratioIn01(options.threshold);
  const input = Array.isArray(rows) ? rows : [];
  const scored = [];
  let skipped = 0;
  for (const row of input) {
    if (row === null || typeof row !== "object" || typeof row.score !== "number" || !Number.isFinite(row.score)) {
      skipped += 1;
      continue;
    }
    scored.push({
      at: typeof row.at === "number" ? row.at : 0,
      score: clamp01(row.score),
      pass: row.pass === true,
      action: typeof row.action === "string" ? row.action : ""
    });
  }
  const xAt = (index) => scored.length <= 1 ? padX + innerW / 2 : padX + index / (scored.length - 1) * innerW;
  const yAt = (score) => padY + (1 - score) * innerH;
  const dots = scored.map((point, index) => ({
    ...point,
    x: round(xAt(index)),
    y: round(yAt(point.score))
  }));
  const line = dots.map((dot, index) => (index === 0 ? "M" : "L") + dot.x + " " + dot.y).join(" ");
  const baseline = round(padY + innerH);
  const area = dots.length >= 2 ? line + " L" + dots[dots.length - 1].x + " " + baseline + " L" + dots[0].x + " " + baseline + " Z" : "";
  let trend = "";
  if (dots.length >= 3) {
    trend = dots.map((dot, index) => {
      const from = Math.max(0, index - trendWindow + 1);
      let sum = 0;
      for (let cursor = from; cursor <= index; cursor += 1) sum += scored[cursor].score;
      const mean = sum / (index - from + 1);
      return (index === 0 ? "M" : "L") + dot.x + " " + round(yAt(mean));
    }).join(" ");
  }
  const scores = scored.map((point) => point.score);
  const ticks = [1, 0.5, 0].map((value) => ({ y: round(yAt(value)), label: value.toFixed(1) }));
  return {
    width,
    height,
    padX,
    padY,
    points: dots.length,
    skipped,
    min: scores.length > 0 ? Math.min(...scores) : null,
    max: scores.length > 0 ? Math.max(...scores) : null,
    line,
    area,
    trend,
    dots,
    threshold,
    thresholdY: threshold === null ? null : round(yAt(threshold)),
    ticks,
    thin: dots.length < 2
  };
}
function curveCaption(rows, curve) {
  const total = Array.isArray(rows) ? rows.length : 0;
  const parts = ["\u6700\u8FD1 " + total + " \u6761\u5224\u5B9A", "\u6709\u6548\u5206\u503C " + curve.points + " \u4E2A"];
  if (curve.skipped > 0) parts.push("\u65E0\u5206\u503C " + curve.skipped + " \u6761");
  if (curve.threshold !== null) parts.push("\u9608\u503C " + curve.threshold.toFixed(2));
  if (curve.min !== null && curve.max !== null) {
    parts.push("\u533A\u95F4 " + curve.min.toFixed(2) + "\u2013" + curve.max.toFixed(2));
  }
  if (curve.points === 0) parts.push("\u8FD8\u6CA1\u6709\u5E26\u5206\u503C\u7684\u5224\u65AD");
  else if (curve.thin) parts.push("\u70B9\u592A\u5C11\uFF08" + curve.points + " \u4E2A\uFF09\uFF0C\u8FD8\u770B\u4E0D\u51FA\u8D8B\u52BF");
  return parts.join(" \xB7 ");
}

// oblivion-panel/src/client/knowledge.ts
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function itemStatusLabel(status) {
  switch (text(status)) {
    case "active":
      return "\u5F53\u524D\u7248\u672C";
    case "superseded":
      return "\u5DF2\u88AB\u65B0\u7248\u53D6\u4EE3";
    case "draft":
      return "\u8349\u7A3F";
    case "conflict":
      return "\u6709\u51B2\u7A81";
    case "archived":
      return "\u5DF2\u5F52\u6863";
    case "":
      return "";
    default:
      return String(status);
  }
}
function implLabel(impl) {
  switch (text(impl)) {
    case "implemented":
      return "\u5DF2\u843D\u5730";
    case "designed":
      return "\u4EC5\u8BBE\u8BA1";
    case "placeholder":
      return "\u5360\u4F4D";
    case "":
      return "";
    default:
      return String(impl);
  }
}
function sourceLabel(source) {
  switch (source) {
    case "note":
      return "";
    case "digest":
      return "\u4F1A\u8BDD\u6574\u7406";
    case "item":
      return "\u4EC5\u5165\u5E93";
  }
}
function baseName(name) {
  return text(name).replace(/\.md$/i, "");
}
function lower(value) {
  return text(value).toLowerCase();
}
function latest(values) {
  return values.length === 0 ? 0 : Math.max(...values);
}
var KEYWORD_MAX = 5;
var WIKI_MAX = 2;
function textList(value) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const entry of value) {
    const item = text(entry);
    if (item !== "" && !items.includes(item)) items.push(item);
  }
  return items;
}
function mergeKnowledge(input) {
  const items = input.items ?? [];
  const consumed = /* @__PURE__ */ new Set();
  const rows = [];
  const pages = /* @__PURE__ */ new Map();
  for (const page of input.wikis ?? []) {
    const name = lower(baseName(page.name));
    const path = text(page.path);
    if (name !== "" && path !== "" && !pages.has(name)) pages.set(name, path);
  }
  const collect = (note, source) => {
    const base = lower(baseName(note.name));
    if (base === "") return;
    const matched = [];
    items.forEach((item, index) => {
      if (consumed.has(index)) return;
      if (lower(item.topic) === base || lower(item.title) === base) {
        consumed.add(index);
        matched.push(item);
      }
    });
    const at = latest([
      num(note.mtimeMs),
      ...matched.map((item) => num(item.created_at)),
      ...matched.map((item) => num(item.updated_at))
    ]);
    const primary = pickPrimary(matched);
    const tags = textList(note.tags);
    for (const item of matched) {
      for (const tag of textList(item.tags)) if (!tags.includes(tag)) tags.push(tag);
    }
    rows.push({
      key: text(note.path) !== "" ? text(note.path) : base,
      title: baseName(note.name),
      notePath: text(note.path) !== "" ? text(note.path) : void 0,
      at,
      source,
      status: text(primary?.status),
      impl: text(primary?.impl),
      versions: matched.length,
      itemId: text(primary?.id),
      sources: num(primary?.sources),
      topic: text(primary?.topic),
      tags,
      wiki: textList(note.wiki).map((title) => {
        const path = pages.get(lower(title));
        return path === void 0 ? { title } : { title, path };
      }),
      createdDate: text(note.createdAt) !== "" ? text(note.createdAt) : text(note.updatedAt)
    });
  };
  for (const note of input.notes ?? []) collect(note, "note");
  for (const note of input.digests ?? []) collect(note, "digest");
  const groups = /* @__PURE__ */ new Map();
  items.forEach((item, index) => {
    if (consumed.has(index)) return;
    const topic = text(item.topic);
    const title = text(item.title);
    const groupKey = lower(topic !== "" ? topic : title);
    if (groupKey === "") return;
    const bucket = groups.get(groupKey);
    if (bucket === void 0) groups.set(groupKey, { key: topic !== "" ? topic : title, items: [item] });
    else bucket.items.push(item);
  });
  for (const { key, items: members } of groups.values()) {
    const primary = pickPrimary(members);
    const tags = [];
    for (const item of members) {
      for (const tag of textList(item.tags)) if (!tags.includes(tag)) tags.push(tag);
    }
    rows.push({
      key: "item:" + key,
      title: text(primary?.title) !== "" ? text(primary?.title) : key,
      at: latest(members.map((item) => num(item.created_at))),
      source: isDigest(primary) ? "digest" : "item",
      status: text(primary?.status),
      impl: text(primary?.impl),
      versions: members.length,
      itemId: text(primary?.id),
      sources: num(primary?.sources),
      topic: text(primary?.topic),
      tags,
      // 没有笔记文件就没有回链可解析；入库日留空，渲染时按 `at` 折算。
      wiki: [],
      createdDate: ""
    });
  }
  return rows.sort((left, right) => right.at - left.at || left.title.localeCompare(right.title));
}
function pickPrimary(items) {
  if (items.length === 0) return void 0;
  const active = items.filter((item) => text(item.status) === "active" || text(item.status) === "");
  const pool = active.length > 0 ? active : items;
  return pool.reduce((best, item) => num(item.created_at) >= num(best.created_at) ? item : best);
}
function isDigest(item) {
  return (item?.sourceTypes ?? []).some((type) => lower(type) === "digest");
}
function keywordText(row) {
  const tags = textList(row.tags);
  if (tags.length === 0) return "";
  const shown = tags.slice(0, KEYWORD_MAX).map((tag) => "#" + tag.replace(/^#+/, ""));
  const rest = tags.length - shown.length;
  return shown.join(" ") + (rest > 0 ? " +" + rest : "");
}
function wikiText(row) {
  const pages = (row.wiki ?? []).filter((page) => text(page.title) !== "");
  if (pages.length === 0) return "";
  const shown = pages.slice(0, WIKI_MAX).map((page) => text(page.title));
  const rest = pages.length - shown.length;
  return shown.join("\u3001") + (rest > 0 ? " +" + rest : "");
}
function dateText(row) {
  const written = text(row.createdDate);
  if (written !== "") return written;
  if (!Number.isFinite(row.at) || row.at <= 0) return "";
  const at = new Date(row.at);
  const pad = (value) => String(value).padStart(2, "0");
  return at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate());
}
function updatedText(row, now = Date.now()) {
  if (!Number.isFinite(row.at) || row.at <= 0) return "";
  return relativeTime(row.at, now);
}
function detailParts(row, now = Date.now()) {
  const parts = [];
  const wiki = wikiText(row);
  parts.push({ label: "\u76F8\u5173\u4E3B\u9898", text: wiki !== "" ? wiki : "\u672A\u5F52\u5E76", wiki: (row.wiki ?? []).slice(0, WIKI_MAX) });
  const tags = keywordText(row);
  if (tags !== "") parts.push({ label: "\u5173\u952E\u8BCD", text: tags });
  const created = dateText(row);
  if (created !== "") parts.push({ label: "\u5165\u5E93", text: created });
  const updated = updatedText(row, now);
  if (updated !== "") parts.push({ label: "\u66F4\u65B0\u4E8E", text: updated });
  return parts;
}
var KNOWLEDGE_ITEM_LIMIT = 5;
function hasNote(row) {
  return typeof row.notePath === "string" && row.notePath !== "";
}
function knowledgeView(rows, options = {}) {
  const limit = Math.max(0, Math.floor(options.itemLimit ?? KNOWLEDGE_ITEM_LIMIT));
  const backbone = [];
  const itemOnly = [];
  for (const row of rows) (hasNote(row) ? backbone : itemOnly).push(row);
  if (options.showAll === true) {
    return { backbone, itemOnly, visible: rows.slice(), hidden: 0 };
  }
  const keep = new Set(itemOnly.slice(0, limit).map((row) => row.key));
  const visible = rows.filter((row) => hasNote(row) || keep.has(row.key));
  return { backbone, itemOnly, visible, hidden: rows.length - visible.length };
}

// oblivion-panel/src/client/Panel.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.kpiCell, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.kpiLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.kpiValue, children: value })
  ] });
}
function rowMeta(row) {
  const parts = [];
  const status = itemStatusLabel(row.status);
  if (status !== "") parts.push(status);
  const impl = implLabel(row.impl);
  if (impl !== "") parts.push(impl);
  if (row.versions > 1) parts.push("\u5171 " + row.versions + " \u7248");
  const source = sourceLabel(row.source);
  if (source !== "") parts.push(source);
  if (row.topic !== "" && row.topic !== row.title) parts.push("\u4E3B\u9898 " + row.topic);
  return parts.length > 0 ? parts.join(" \xB7 ") : "\u2014";
}
function detailLine(row, onOpenFile) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.dim, ...S.mono }, children: detailParts(row).map((part, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
    index > 0 ? " \xB7 " : "",
    part.label,
    "\uFF1A",
    part.wiki !== void 0 && part.wiki.length > 0 ? part.wiki.map(
      (page, pageIndex) => page.path === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        pageIndex > 0 ? "\u3001" : "",
        page.title
      ] }, page.title) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
        pageIndex > 0 ? "\u3001" : "",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "a",
          {
            href: "#",
            style: { color: "inherit" },
            title: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00\u4E3B\u9898\u9875 " + page.path,
            onClick: (event) => {
              event.preventDefault();
              onOpenFile?.(page.path);
            },
            children: page.title
          }
        )
      ] }, page.title)
    ) : part.text
  ] }, part.label)) });
}
function emptyReason(data) {
  if (!data.core) {
    return "\u8BFB\u4E0D\u5230 @oblivion/core \u7684 status.json \u2014\u2014 \u68C0\u67E5 core \u662F\u5426\u88C5\u8F7D\uFF08\u5B83\u7684\u53EA\u8BFB\u5FEB\u7167\u5728\u6BCF\u6B21\u88C5\u8F7D\u65F6\u5237\u65B0\uFF09\u3002";
  }
  const turns = data.live ? data.live.turns : statNumber(data.core, "turns");
  if (!turns) {
    return "core \u5DF2\u88C5\u8F7D\uFF08v" + String(data.core.version ?? "?") + "\uFF09\uFF0C\u4F46\u8FD8\u6CA1\u6709\u8D70\u5B8C\u7684 turn/end \u2014\u2014 \u6B63\u5E38\u95EE\u4E00\u8F6E\u518D\u770B\u3002";
  }
  return "\u6709 " + turns + " \u8F6E\u5224\u5B9A\uFF0C\u4F46\u90FD\u8FD8\u6CA1\u6C89\u6DC0\uFF1A\u539F\u56E0\u89C1\u4E0B\u9762\u7684\u300C\u6700\u8FD1\u5224\u5B9A\u300D\u3002";
}
function OblivionPanel(props) {
  const [state, setState] = (0, import_react4.useState)({ status: "loading" });
  const [showAllKnowledge, setShowAllKnowledge] = (0, import_react4.useState)(false);
  const load = (0, import_react4.useCallback)(async () => {
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
  (0, import_react4.useEffect)(() => {
    if (props.visible === false) return;
    void load();
  }, [load, props.visible]);
  const body = (0, import_react4.useMemo)(() => {
    if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.dim, children: "\u8BFB\u53D6\u4E2D\u2026" });
    if (state.status === "error") {
      return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          "\u8BFB\u4E0D\u5230\u89C2\u6D4B\u6570\u636E\uFF1A",
          state.error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.dim, children: [
          "\u82E5\u521A\u88C5\u8F7D\u672C\u63D2\u4EF6\uFF0C\u9700\u8981**\u91CD\u542F\u4E00\u6B21 App**\uFF08Node \u534A\u8FB9\u6539\u52A8\u4E0D\u4F1A\u70ED\u52A0\u8F7D\uFF09\u3002\u8DEF\u7531\uFF1A",
          STATUS_ROUTE
        ] })
      ] });
    }
    const data = state.data;
    const core = data.core ?? null;
    const hints = core?.hints ?? [];
    const live = data.live ?? null;
    const turns = live ? live.turns : statNumber(core, "turns");
    const evaluated = live ? live.evaluated : statNumber(core, "evaluated");
    const captured = live ? live.captured : statNumber(core, "captured");
    const captureRate = live ? live.captureRate : (core?.stats ?? {}).captureRate;
    const blocker = topBlocker(live ? live.byReason : (core?.stats ?? {}).byReason);
    const series = data.trace?.series ?? data.trace?.recent ?? [];
    const curve = buildScoreCurve(series, { threshold: thresholdOf(core?.config) });
    const items = data.items ?? [];
    const notes = data.notes ?? [];
    const digests = data.digests ?? [];
    const wikis = data.wikis ?? [];
    const knowledge = mergeKnowledge({ notes, digests, wikis, items });
    const knowledgeListView = knowledgeView(knowledge, { showAll: showAllKnowledge });
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.dim, children: [
          "core ",
          core ? "v" + String(core.version ?? "?") : "\u672A\u88C5\u8F7D",
          " \xB7 \u9762\u677F v",
          String(data.panelVersion ?? "?"),
          " \xB7 \u5237\u65B0\u4E8E ",
          relativeTime(data.generatedAt)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", style: S.btn, onClick: () => void load(), children: "\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.row, marginTop: 6, justifyContent: "flex-start", gap: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RestartControl, {}),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PluginUpdates, {}),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(OrphanControl, {}),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(SessionImportControl, {})
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.kpi, children: [
        kpi("\u6355\u83B7\u7387", percent(captureRate)),
        kpi("\u5224\u5B9A\u8F6E\u6570", String(turns ?? "\u2014")),
        kpi("\u5DF2\u8BC4\u4F30", String(evaluated ?? "\u2014")),
        kpi("\u5DF2\u6C89\u6DC0", String(captured ?? "\u2014"))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.dim, marginTop: 2 }, children: live ? "\u7EDF\u8BA1\u5B9E\u65F6\u8BFB\u81EA " + live.parsed + " \u884C\u7559\u75D5\uFF08\u4FDD\u7559\u671F " + live.windowDays + " \u5929" + (live.dropped > 0 ? "\uFF0C\u6309\u4FDD\u7559\u671F/\u4E0A\u9650\u4E22\u5F03 " + live.dropped + " \u884C" : "") + "\uFF09" : "\u7EDF\u8BA1\u6765\u81EA core \u88C5\u8F7D\u65F6\u7684 status.json \u5FEB\u7167\uFF08\u9700\u8981\u9762\u677F host \u2265 0.0.8 \u624D\u662F\u5B9E\u65F6\u7684\uFF09" }),
      !core || !turns ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.card, marginTop: 10 }, children: emptyReason(data) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.dim, marginTop: 4 }, children: blocker ? "\u4E3B\u8981\u62E6\u622A\u539F\u56E0\uFF1A" + reasonLabel(blocker.reason) + "\uFF08" + blocker.count + " \u6B21\uFF09" : (turns ?? 0) > 0 ? "\u5168\u90E8\u901A\u8FC7\uFF0C\u65E0\u62E6\u622A" : "\u8FD8\u6CA1\u6709\u5224\u5B9A\u8BB0\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.h, children: [
        "\u8C03\u53C2\u5EFA\u8BAE",
        " ",
        hints.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: S.dim, children: [
          "\uFF08\u6682\u65E0\uFF1Acore \u5728\u88C5\u8F7D\u65F6\u6309\u5DF2\u8BC4\u4F30 ",
          evaluated ?? 0,
          " \u8F6E\u7B97\uFF0C\u6837\u672C\u4E0D\u8DB3 20 \u8F6E\u523B\u610F\u4E0D\u5F00\u53E3\uFF09"
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: S.dim, children: "\uFF08core \u5728\u88C5\u8F7D\u65F6\u7B97\uFF0C\u4E0D\u662F\u5B9E\u65F6\u7684\uFF09" })
      ] }),
      hints.map((hint, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.card, children: hintLine(hint) }, String(hint.key ?? index))),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.h, children: "\u5224\u5B9A\u66F2\u7EBF" }),
      curve.points === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.dim, children: [
        "\u8FD8\u6CA1\u6709\u5E26\u5206\u503C\u7684\u5224\u5B9A \u2014\u2014 \u66F2\u7EBF\u4ECE\u7B2C\u4E00\u6761\u8D70\u5B8C\u7B5B\u9009\u7684\u7559\u75D5\u5F00\u59CB\uFF08",
        data.trace?.path ?? "decisions.jsonl",
        "\uFF09\u3002"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.card, padding: "6px 8px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(ScoreChart, { curve }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.dim, ...S.mono, marginTop: 2 }, children: curveCaption(series, curve) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.h, children: [
        "\u77E5\u8BC6\u5E93\uFF08",
        knowledge.length,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.dim, marginBottom: 4 }, children: [
        "\u95EE\u7B54\u7B14\u8BB0 ",
        notes.length,
        " \xB7 \u4F1A\u8BDD\u6574\u7406 ",
        digests.length,
        " \xB7 \u4E3B\u9898\u9875 ",
        wikis.length,
        " \xB7 \u6761\u76EE ",
        items.length,
        knowledge.length !== notes.length + digests.length + items.length ? "\uFF08\u540C\u4E3B\u9898\u7684\u591A\u7248\u5E76\u4F5C\u4E00\u884C\uFF0C\u5171 " + knowledge.length + " \u884C\uFF09" : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { ...S.dim, marginBottom: 6 }, children: [
        "\u8DEF\u5F84\u4E0E\u81EA\u52A8\u6574\u7406\uFF1A",
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { opacity: 1 }, children: "\u8BBE\u7F6E \u2192 Oblivion \u77E5\u8BC6\u5E93" })
      ] }),
      knowledge.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.dim, children: [
        "\u8FD8\u6CA1\u6709\u6761\u76EE\uFF0C\u4E5F\u6CA1\u6709\u7B14\u8BB0\uFF08",
        data.mdRoot ?? "\u2014",
        "\uFF09"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { style: S.list, children: knowledgeListView.visible.map((row) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { style: S.li, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: row.notePath !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "a",
          {
            href: "#",
            style: { color: "inherit" },
            title: "\u5728\u4FA7\u8FB9\u680F\u6253\u5F00 " + row.notePath,
            onClick: (event) => {
              event.preventDefault();
              props.onOpenFile?.(row.notePath);
            },
            children: row.title
          }
        ) : row.title }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { ...S.dim, ...S.mono }, children: rowMeta(row) }),
        detailLine(row, props.onOpenFile)
      ] }, row.key)) }),
      knowledgeListView.itemOnly.length > KNOWLEDGE_ITEM_LIMIT || showAllKnowledge ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "button",
        {
          type: "button",
          style: { ...S.btn, marginTop: 4 },
          onClick: () => setShowAllKnowledge((prev) => !prev),
          children: showAllKnowledge ? "\u53EA\u770B\u6709\u7B14\u8BB0\u7684 " + knowledgeListView.backbone.length + " \u884C" : "\u5C55\u5F00\u5168\u90E8 " + knowledge.length + " \u884C\uFF08\u53E6\u6709 " + knowledgeListView.hidden + " \u884C\u4EC5\u5165\u5E93\uFF09"
        }
      ) : null,
      (data.problems ?? []).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: S.h, children: [
          "\u8BFB\u53D6\u544A\u8B66\uFF08",
          data.problems?.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { style: S.list, children: (data.problems ?? []).map((problem, index) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { style: { ...S.li, ...S.mono, ...S.dim }, children: problem }, index)) })
      ] }) : null
    ] });
  }, [state, load, props.onOpenFile, showAllKnowledge]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: S.root, children: body });
}

// oblivion-panel/src/client/SettingsSection.tsx
var import_react5 = require("react");

// oblivion-panel/src/client/settings-model.ts
var SETTINGS_SECTION_ID = "oblivion-knowledge";
var SETTINGS_SECTION_ORDER = 47;
var SETTINGS_SECTION_LABEL = "Oblivion \u77E5\u8BC6\u5E93";
var SETTINGS_ROUTE = "/oblivion-core/settings";
var GROUPS = [
  { id: "data", title: "\u77E5\u8BC6\u5E93\u4F4D\u7F6E", hint: "\u7B14\u8BB0\u4E0E\u6761\u76EE\u843D\u5728\u672C\u673A\u54EA\u4E2A\u76EE\u5F55\u3002" },
  {
    id: "organize",
    title: "\u81EA\u52A8\u6574\u7406\uFF08\u7528\u5BBF\u4E3B\u91CC\u53EF\u7528\u7684\u6A21\u578B\uFF09",
    hint: "\u590D\u7528 DSH \u7684 provider \u4E0E\u5BC6\u94A5\u8DD1\u6A21\u578B\uFF1A\u63D2\u4EF6\u53EA\u62A5 provider / model\uFF0C\u5BC6\u94A5\u7531\u5BBF\u4E3B\u9002\u914D\u5668\u89E3\u6790\u3002"
  },
  { id: "model", title: "\u6A21\u578B\u4E0E\u81EA\u52A8\u5207\u6362", hint: "\u4E3B\u8DEF\u5931\u8D25\u4F1A\u6309\u987A\u5E8F\u8BD5\u5907\u7528\u8DEF \u2014\u2014 \u8FD9\u5C31\u662F\u300C\u81EA\u52A8\u5207\u6362\u300D\u3002" },
  { id: "threshold", title: "\u5224\u5B9A\u9608\u503C", hint: "\u9762\u677F\u300C\u8C03\u53C2\u5EFA\u8BAE\u300D\u91CC\u7ED9\u5019\u9009\u503C\u7684\u4E24\u4E2A\u952E\u3002" }
];
var FIELDS = [
  {
    key: "mdRoot",
    label: "\u77E5\u8BC6\u5E93\u8DEF\u5F84",
    kind: "text",
    group: "data",
    hint: "\u9ED8\u8BA4 ~/OblivionKB\u3002\u6539\u4E86\u8981\u91CD\u542F DSH \u624D\u751F\u6548\uFF08core \u88C5\u8F7D\u65F6\u5C31\u628A\u8DEF\u5F84\u56FA\u5316\u4E86\uFF09\u3002"
  },
  {
    key: "organize.enabled",
    label: "\u81EA\u52A8\u6574\u7406\u603B\u5F00\u5173",
    kind: "bool",
    group: "organize",
    hint: "\u9ED8\u8BA4\u5173\u3002\u6253\u5F00\u540E\u6309\u4E0B\u9762\u7684\u8303\u56F4\u4E0E\u8282\u594F\u8C03\u7528\u6A21\u578B\u3002"
  },
  {
    key: "organize.digest",
    label: "\u4F1A\u8BDD\u6574\u7406\u4EA7\u51FA",
    kind: "bool",
    group: "organize",
    hint: "\u628A\u8D70\u8FC7\u7684\u4F1A\u8BDD\u6574\u7406\u6210 04_\u4F1A\u8BDD\u6574\u7406/ \u4E0B\u7684\u7B14\u8BB0\u3002"
  },
  {
    key: "organize.retitle",
    label: "\u77E5\u8BC6\u5E93\u6807\u9898\u4E0E\u6807\u7B7E\u56DE\u586B",
    kind: "bool",
    group: "organize",
    hint: "\u540D\u5B57\u770B\u4E0D\u51FA\u5185\u5BB9\u7684\u7B14\u8BB0\uFF0C\u6309\u5185\u5BB9\u91CD\u547D\u540D\u5E76\u8865\u5173\u952E\u8BCD\u3002"
  },
  {
    key: "organize.autoApply",
    label: "\u56DE\u586B\u81EA\u52A8\u843D\u5730",
    kind: "bool",
    group: "organize",
    hint: "\u9ED8\u8BA4\u5173\uFF1A\u53EA\u51FA\u9884\u89C8\uFF08preview\uFF09\uFF0C\u8981\u4E0D\u8981\u771F\u6539\u7531\u4F60\u786E\u8BA4 \u2014\u2014 \u56DE\u586B\u4F1A\u52A8\u77E5\u8BC6\u5E93\u91CC\u7684\u6587\u4EF6\u540D\u3002"
  },
  {
    key: "organize.everyTurns",
    label: "\u6BCF\u51E0\u8F6E\u6574\u7406\u4E00\u6B21",
    kind: "number",
    group: "organize",
    min: 0,
    step: 1,
    hint: "0 = \u4E0D\u6309\u8F6E\u89E6\u53D1\uFF08\u53EA\u5728\u5DE5\u5177\u91CC\u624B\u52A8\u8DD1\uFF09\u3002"
  },
  {
    key: "organize.minIntervalMs",
    label: "\u4E24\u6B21\u6574\u7406\u81F3\u5C11\u95F4\u9694",
    kind: "number",
    group: "organize",
    scale: 6e4,
    unit: "\u5206\u949F",
    min: 0,
    step: 1,
    hint: "\u9632\u6B62\u591A\u8F6E\u8FDE\u8DD1\u65F6\u53CD\u590D\u53EB\u6A21\u578B\u3002"
  },
  {
    key: "organize.batchSize",
    label: "\u6BCF\u6279\u6700\u591A\u5904\u7406",
    kind: "number",
    group: "organize",
    unit: "\u7BC7",
    min: 1,
    step: 1,
    hint: "\u4E00\u6B21\u9001\u8FDB prompt \u7684\u5019\u9009\u4E0A\u9650\u3002"
  },
  {
    key: "organize.maxTokens",
    label: "\u5355\u6B21\u8C03\u7528\u6700\u5927\u8F93\u51FA",
    kind: "number",
    group: "organize",
    unit: "token",
    min: 1,
    step: 64,
    hint: "\u592A\u5C0F\u4F1A\u628A\u6A21\u578B\u7684\u8BDD\u622A\u65AD\u5728 JSON \u4E2D\u95F4\u3002"
  },
  {
    key: "organize.timeoutMs",
    label: "\u5355\u6B21\u8C03\u7528\u8D85\u65F6",
    kind: "number",
    group: "organize",
    scale: 1e3,
    unit: "\u79D2",
    min: 1,
    step: 5,
    hint: "\u5230\u70B9\u5C31\u6362\u4E0B\u4E00\u6761\u8DEF\uFF08\u5907\u7528\u8DEF\u56E0\u6B64\u624D\u6709\u610F\u4E49\uFF09\u3002"
  },
  { key: "organize.provider", label: "\u4E3B provider", kind: "select", group: "model", hint: "\u7559\u7A7A = \u8DDF\u968F\u5BBF\u4E3B\u7684\u9ED8\u8BA4\u9009\u8DEF\u3002" },
  { key: "organize.model", label: "\u4E3B model", kind: "select", group: "model", hint: "\u5019\u9009\u6765\u81EA\u4E0A\u9762\u90A3\u4E2A provider \u5728\u5BBF\u4E3B\u6CE8\u518C\u8868\u91CC\u7684\u6A21\u578B\u3002" },
  { key: "organize.fallbacks", label: "\u5907\u7528\u8DEF\uFF08\u81EA\u52A8\u5207\u6362\uFF09", kind: "routes", group: "model", hint: "\u6309\u987A\u5E8F\u8BD5\uFF1B\u4E3B\u8DEF\u4E0E\u5907\u7528\u8DEF\u91CC\u91CD\u590D\u7684\u8DEF\u4F1A\u88AB core \u53BB\u6389\u3002" },
  { key: "semanticThreshold", label: "\u8BED\u4E49\u9608\u503C", kind: "number", group: "threshold", min: 0, step: 0.05, hint: "\u4F4E\u4E8E\u5B83\u7684\u8BED\u4E49\u76F8\u4F3C\u5EA6\u4E0D\u7B97\u540C\u4E00\u6761\u77E5\u8BC6\u3002" },
  { key: "valueThreshold", label: "\u4EF7\u503C\u9608\u503C", kind: "number", group: "threshold", min: 0, step: 0.05, hint: "\u4F4E\u4E8E\u5B83\u7684\u95EE\u7B54\u4E0D\u5165\u5E93\uFF08\u6355\u83B7\u7387\u4F4E\u65F6\u6700\u8BE5\u8C03\u8FD9\u4E2A\uFF09\u3002" }
];
function fieldsOf(group) {
  return FIELDS.filter((field) => field.group === group);
}
function surfacedKeys() {
  return FIELDS.map((field) => field.key);
}
function splitFieldKey(key) {
  const dot = key.indexOf(".");
  if (dot < 0) return { head: key };
  return { head: key.slice(0, dot), sub: key.slice(dot + 1) };
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function resolveField(payload, key) {
  const { head, sub } = splitFieldKey(key);
  const raw = sub === void 0 ? payload.values[head] : isPlainObject(payload.values[head]) ? payload.values[head][sub] : void 0;
  const effective = sub === void 0 ? payload.effective[head] : isPlainObject(payload.effective[head]) ? payload.effective[head][sub] : void 0;
  const fromSettings = raw !== void 0 && raw !== null;
  const source = payload.sources[key] ?? (fromSettings ? "settings" : "default");
  return { value: fromSettings ? raw : effective, source, fromSettings };
}
function configSourceLabel(source) {
  if (source === "settings") return "\u8BBE\u7F6E\u9875";
  if (source === "plugin") return "\u63D2\u4EF6\u914D\u7F6E";
  return "\u9ED8\u8BA4\u503C";
}
function setField(form, key, value) {
  const next = { ...form };
  if (value === void 0) delete next[key];
  else next[key] = value;
  return next;
}
function draftCount(form) {
  return Object.keys(form).length;
}
function sameValue(a, b) {
  if (a === void 0 || a === null) return b === void 0 || b === null;
  if (b === void 0 || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
function editField(form, payload, key, value) {
  if (sameValue(value, resolveField(payload, key).value)) return setField(form, key, void 0);
  return setField(form, key, value);
}
function resetField(form, payload, key) {
  return setField(form, key, resolveField(payload, key).fromSettings ? null : void 0);
}
function routeProblem(catalog, provider, model) {
  if (provider === "" || model === "") return null;
  const found = (catalog?.providers ?? []).find((item) => item.id === provider);
  if (found === void 0) return "provider\u300C" + provider + "\u300D\u4E0D\u5728\u5BBF\u4E3B\u6CE8\u518C\u8868\u91CC\uFF08\u6E05\u5355\u6765\u81EA\u5BBF\u4E3B\u7684 provider \u6CE8\u518C\u8868\uFF09\u3002";
  if (!found.models.some((item) => item.id === model)) {
    return "provider\u300C" + provider + "\u300D\u4E0B\u6CA1\u6709 model\u300C" + model + "\u300D\u2014\u2014 \u8FD9\u6761\u7EC4\u5408\u4F1A\u8C03\u7528\u5931\u8D25\u5E76\u5207\u5230\u5907\u7528\u8DEF\u3002";
  }
  return null;
}
function buildPatch(form) {
  const patch = {};
  const organize = {};
  const keys = [];
  for (const key of Object.keys(form).sort()) {
    const value = form[key];
    const { head, sub } = splitFieldKey(key);
    if (sub === void 0) patch[head] = value;
    else organize[sub] = value;
    keys.push(key);
  }
  if (Object.keys(organize).length > 0) patch.organize = organize;
  return { patch, keys };
}
function parseNumberText(text2) {
  const trimmed = text2.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : void 0;
}
function numberText(value, scale = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value === void 0 || value === null ? "" : String(value);
  const shown = value / scale;
  return String(Number.isFinite(shown) ? shown : value);
}
function routeText(route) {
  if (!route || route.provider === "" || route.model === "") return "\uFF08\u6CA1\u914D\u5168\uFF09";
  return route.provider + " / " + route.model;
}
function routesText(routes) {
  if (!routes || routes.length === 0) return "\uFF08\u6CA1\u6709\u53EF\u7528\u7684\u8DEF\uFF09";
  return routes.map((route) => routeText(route)).join(" \u2192 ");
}
function catalogSummary(catalog) {
  if (!catalog) return { label: "\u5BBF\u4E3B\u6CA1\u56DE\u6E05\u5355\uFF08core \u7248\u672C\u65E7\u6216\u6CA1\u88C5\u8F7D\uFF09", routes: "\u2014" };
  if (!catalog.llmAvailable) return { label: "\u5BBF\u4E3B\u6CA1\u6709 llm \u670D\u52A1", routes: "\uFF08\u81EA\u52A8\u6574\u7406\u4F1A\u8DF3\u8FC7\uFF09" };
  const label = catalog.routeSource === "config" ? "\u6309\u8FD9\u6761\u8BBE\u7F6E\u91CC\u7684 provider / model" : catalog.routeSource === "host-default" ? "\u5BBF\u4E3B\u7684\u9ED8\u8BA4\u9009\u8DEF\uFF08\u672C\u9875\u6CA1\u6307\u5B9A provider\uFF09" : "\u6CA1\u6709\u53EF\u7528\u7684\u8DEF";
  return { label, routes: routesText(catalog.routes) };
}
function providerOptions(catalog) {
  const options = [{ value: "", label: "\uFF08\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\uFF09" }];
  for (const provider of catalog?.providers ?? []) {
    const count = provider.models.length;
    options.push({
      value: provider.id,
      label: provider.name === provider.id ? provider.id : provider.name + "\uFF08" + provider.id + "\uFF09" + (count === 0 ? " \xB7 \u65E0\u6A21\u578B" : "")
    });
  }
  return options;
}
function modelOptions(catalog, provider) {
  const options = [{ value: "", label: "\uFF08\u8DDF\u968F\u5BBF\u4E3B\u9ED8\u8BA4\uFF09" }];
  if (provider === "") return options;
  const found = (catalog?.providers ?? []).find((item) => item.id === provider);
  for (const model of found?.models ?? []) {
    options.push({ value: model.id, label: model.name === model.id ? model.id : model.name + "\uFF08" + model.id + "\uFF09" });
  }
  return options;
}
function withCurrent(options, current) {
  if (current === "" || options.some((option) => option.value === current)) return [...options];
  return [...options, { value: current, label: current + "\uFF08\u4E0D\u5728\u5BBF\u4E3B\u6E05\u5355\u91CC\uFF09" }];
}
function fallbacksOf(payload) {
  const value = resolveField(payload, "organize.fallbacks").value;
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    out.push({ provider: String(item.provider ?? ""), model: String(item.model ?? "") });
  }
  return out;
}
function isCompleteRoute(route) {
  return route.provider !== "" && route.model !== "";
}
function pendingSentence(pending) {
  if (!pending || pending.length === 0) return null;
  return "\u8FD9\u4E9B\u952E\u8981\u91CD\u542F DSH \u624D\u751F\u6548\uFF1A" + pending.join("\u3001");
}
function describeSaveResult(result) {
  if (result.saved === false) {
    return { kind: "error", text: "core \u8BF4\u8BBE\u7F6E\u6CA1\u5199\u8FDB\u78C1\u76D8\uFF08\u770B\u5B83\u7684\u65E5\u5FD7\uFF09\u3002" };
  }
  const changed = result.changed ?? [];
  const rejected = result.rejected ?? [];
  const pending = result.pending ?? [];
  if (changed.length === 0 && rejected.length === 0) {
    return { kind: "warn", text: "\u5199\u4E0B\u53BB\u4E86\uFF0C\u4F46\u503C\u548C\u539F\u6765\u4E00\u6837\uFF08changed \u4E3A\u7A7A\uFF09\u3002" };
  }
  const parts = [];
  if (changed.length > 0) parts.push("\u5DF2\u4FDD\u5B58 " + changed.join("\u3001"));
  if (rejected.length > 0) parts.push("\u88AB core \u4E22\u6389\uFF08\u952E\u540D\u4E0D\u5408\u6CD5\uFF09\uFF1A" + rejected.join("\u3001"));
  const head = parts.join("\uFF1B");
  if (pending.length > 0) return { kind: rejected.length > 0 ? "warn" : "ok", text: head + " \u2014\u2014 \u8981\u91CD\u542F DSH \u624D\u751F\u6548\u3002" };
  return { kind: rejected.length > 0 ? "warn" : "ok", text: head + "\u3002" };
}
function writableNote(writable, surfaced = surfacedKeys()) {
  const rest = (writable ?? []).filter((key) => key !== "organize" && !surfaced.includes(key));
  if (rest.length === 0) return "";
  const shown = rest.slice(0, 6).join(" / ");
  return "\u8FD9\u4E00\u9875\u53EA\u7BA1\u4E0A\u9762\u8FD9\u4E9B\u952E\u3002settings.json \u8FD8\u80FD\u5199\u5176\u4F59 " + rest.length + " \u4E2A\uFF08" + shown + (rest.length > 6 ? " \u2026" : "") + "\uFF09\uFF0C\u90A3\u4E9B\u7559\u5728 profile \u7684\u63D2\u4EF6 config \u91CC\u6539\u3002";
}
function httpHint(status) {
  switch (status) {
    case 400:
      return "core \u8BF4\u8FD9\u4EFD\u8865\u4E01\u4E0D\u662F\u5408\u6CD5\u7684 JSON \u5BF9\u8C61\u3002";
    case 403:
      return "core \u62D2\u4E86\u8FD9\u4E2A\u6765\u6E90\uFF08\u5199\u914D\u7F6E\u7684\u8BF7\u6C42\u53EA\u6536\u672C\u673A\u9875\u9762\uFF09\u3002";
    case 404:
      return "\u8FD9\u6761\u8DEF\u7531\u662F @oblivion/core 0.2.17 \u8D77\u7684\uFF1Acore \u6CA1\u88C5\u8F7D\uFF0C\u6216\u7248\u672C\u6BD4\u5B83\u65E7\u3002";
    case 405:
      return "core \u8FD9\u6761\u8DEF\u7531\u53EA\u6536 GET / POST\u3002";
    case 413:
      return "\u8865\u4E01\u592A\u5927\uFF08core \u7684\u4E0A\u9650\u662F 64 KiB\uFF09\u3002";
    case 500:
      return "core \u81EA\u5DF1\u62A5\u9519\u4E86\uFF08\u5199\u76D8\u5931\u8D25\u6216 describe \u5931\u8D25\uFF09\uFF0C\u770B\u5B83\u7684\u65E5\u5FD7\u3002";
    default:
      return "";
  }
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
async function bodyOf(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function serverErrorOf(body) {
  if (!isPlainObject(body)) return "";
  const error = body.error;
  return typeof error === "string" && error !== "" ? "\uFF08core \u539F\u8BDD\uFF1A" + error + "\uFF09" : "";
}
async function loadSettings(options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") return { ok: false, error: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709 fetch\u3002" };
  const route = options.route ?? SETTINGS_ROUTE;
  let response;
  try {
    response = await doFetch(route, { method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
  } catch (error) {
    return { ok: false, error: "\u8FDE\u4E0D\u4E0A core \u7684\u8BBE\u7F6E\u8DEF\u7531\uFF1A" + messageOf(error) };
  }
  const body = await bodyOf(response);
  if (!response.ok) return { ok: false, status: response.status, error: httpHint(response.status) + serverErrorOf(body) };
  if (!isPlainObject(body)) return { ok: false, status: response.status, error: "core \u7684\u56DE\u5305\u4E0D\u662F JSON \u5BF9\u8C61\u3002" };
  return { ok: true, payload: body };
}
async function postSettings(patch, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") return { ok: false, error: "\u5F53\u524D\u73AF\u5883\u6CA1\u6709 fetch\u3002" };
  const route = options.route ?? SETTINGS_ROUTE;
  let response;
  try {
    response = await doFetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch }),
      credentials: "same-origin"
    });
  } catch (error) {
    return { ok: false, error: "\u4FDD\u5B58\u5931\u8D25\uFF08\u8FDE\u4E0D\u4E0A core\uFF09\uFF1A" + messageOf(error) };
  }
  const body = await bodyOf(response);
  if (!response.ok) return { ok: false, status: response.status, error: httpHint(response.status) + serverErrorOf(body) };
  if (!isPlainObject(body)) return { ok: false, status: response.status, error: "core \u7684\u56DE\u5305\u4E0D\u662F JSON \u5BF9\u8C61\u3002" };
  return { ok: true, result: body };
}

// oblivion-panel/src/client/SettingsSection.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var LABEL = "var(--dsw-alias-label-primary, currentColor)";
var MUTED = "var(--dsw-alias-label-tertiary, #8b93a1)";
var BORDER = "var(--dsw-alias-border-l2, #e5e7eb)";
var ACCENT = "var(--dsw-alias-brand-primary, #4f6ef7)";
var DANGER = "var(--dsw-alias-label-error, #d93025)";
var INPUT_BG = "var(--dsw-alias-bg-layer-2, transparent)";
var WARN = "#d08700";
var OK = "#2e9e5b";
var S2 = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    // 内边距与限宽长在面板自己身上（外层容器是通用的，在那儿加约束会挤到别人的面板）。
    padding: "16px 20px 48px",
    maxWidth: 620,
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13,
    lineHeight: 1.7,
    color: LABEL
  },
  card: {
    border: "1px solid " + BORDER,
    borderRadius: 8,
    padding: "12px 14px"
  },
  title: { margin: "0 0 4px", fontSize: 16, fontWeight: 500, color: LABEL },
  heading: { margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: LABEL },
  hint: { margin: "6px 0 0", fontSize: 11, lineHeight: 1.6, color: MUTED },
  warnText: { margin: "6px 0 0", fontSize: 11, color: WARN },
  errorText: { margin: "6px 0 0", fontSize: 11, color: DANGER },
  okText: { margin: "6px 0 0", fontSize: 11, color: OK },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 11, color: MUTED },
  field: { padding: "8px 0", borderTop: "1px solid " + BORDER },
  fieldHead: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  badge: {
    border: "1px solid " + BORDER,
    borderRadius: 999,
    padding: "0 6px",
    fontSize: 10,
    color: MUTED
  },
  badgeWarn: {
    border: "1px solid " + WARN,
    borderRadius: 999,
    padding: "0 6px",
    fontSize: 10,
    color: WARN
  },
  input: {
    font: "inherit",
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid " + BORDER,
    background: INPUT_BG,
    color: "inherit",
    minWidth: 260
  },
  select: {
    font: "inherit",
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid " + BORDER,
    background: INPUT_BG,
    color: "inherit",
    maxWidth: 280
  },
  number: {
    font: "inherit",
    fontSize: 12,
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid " + BORDER,
    background: INPUT_BG,
    color: "inherit",
    width: 92
  },
  btn: {
    border: "1px solid " + BORDER,
    borderRadius: 5,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    padding: "3px 8px",
    fontSize: 11
  },
  tiny: {
    border: "none",
    background: "transparent",
    color: MUTED,
    cursor: "pointer",
    padding: "0 4px",
    fontSize: 11
  }
};
function Badge({ source }) {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.badge, title: "\u8FD9\u4E2A\u503C\u6700\u7EC8\u7531\u8C01\u5B9A\uFF1A" + configSourceLabel(source), children: configSourceLabel(source) });
}
function NoticeLine({ notice }) {
  const style = notice.kind === "error" ? S2.errorText : notice.kind === "warn" ? S2.warnText : S2.okText;
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style, children: notice.text });
}
function OblivionSettingsSection() {
  const [load, setLoad] = (0, import_react5.useState)({ status: "loading" });
  const [form, setForm] = (0, import_react5.useState)({});
  const [busy, setBusy] = (0, import_react5.useState)(false);
  const [notice, setNotice] = (0, import_react5.useState)(null);
  const reload = (0, import_react5.useCallback)(async () => {
    const outcome = await loadSettings();
    if (outcome.ok) {
      setLoad({ status: "ready", payload: outcome.payload });
      setForm({});
      const catalog2 = outcome.payload.catalog ?? null;
      postDiag({
        at: Date.now(),
        where: "settings-section",
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        route: SETTINGS_ROUTE,
        version: outcome.payload.version ?? null,
        providers: (catalog2?.providers ?? []).map((provider) => provider.id),
        llmAvailable: catalog2?.llmAvailable ?? null,
        routeSource: catalog2?.routeSource ?? null,
        routes: catalog2?.routes ?? [],
        pending: outcome.payload.pending ?? [],
        writable: (outcome.payload.writable ?? []).length,
        values: Object.keys(outcome.payload.values ?? {})
      });
    } else {
      setLoad({ status: "error", error: outcome.error });
      postDiag({
        at: Date.now(),
        where: "settings-section",
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        route: SETTINGS_ROUTE,
        error: outcome.error,
        status: outcome.status ?? null
      });
    }
  }, []);
  (0, import_react5.useEffect)(() => {
    void reload();
  }, [reload]);
  const save = (0, import_react5.useCallback)(async () => {
    const payload2 = load.status === "ready" ? load.payload : null;
    if (payload2 === null) return;
    const { patch, keys } = buildPatch(form);
    if (keys.length === 0) {
      setNotice({ kind: "warn", text: "\u6CA1\u6709\u6539\u52A8\u3002" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await postSettings(patch);
    setBusy(false);
    if (!outcome.ok) {
      setNotice({ kind: "error", text: outcome.error });
      return;
    }
    setForm({});
    setLoad({ status: "ready", payload: outcome.result });
    setNotice(describeSaveResult(outcome.result));
  }, [form, load]);
  if (load.status === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: S2.root, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.card, children: [
      "\u8BFB\u53D6\u4E2D\u2026\uFF08",
      SETTINGS_ROUTE,
      "\uFF09"
    ] }) });
  }
  if (load.status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.root, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { style: S2.title, children: SETTINGS_SECTION_LABEL }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
          "\u8BFB\u4E0D\u5230\u8BBE\u7F6E\uFF1A",
          load.error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: S2.hint, children: [
          "\u8FD9\u6761\u901A\u8DEF\u7531 ",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: "@oblivion/core" }),
          " \u63D0\u4F9B\uFF08",
          SETTINGS_ROUTE,
          "\uFF09\u3002\u82E5\u521A\u66F4\u65B0\u8FC7\u63D2\u4EF6\uFF0C",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("strong", { children: "\u5B8C\u5168\u91CD\u542F DSH" }),
          " \u4E4B\u540E\u518D\u770B \u2014\u2014 Node \u534A\u8FB9\u7684\u6539\u52A8\u4E0D\u4F1A\u70ED\u52A0\u8F7D\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: S2.btn, onClick: () => void reload(), children: "\u91CD\u8BD5" })
      ] })
    ] });
  }
  const payload = load.payload;
  const catalog = payload.catalog ?? null;
  const summary = catalogSummary(catalog);
  const pending = payload.pending ?? [];
  const dirty = draftCount(form);
  const catalogMissing = catalog === null || catalog.providers.length === 0;
  const catalogNoLlm = catalog !== null && !catalog.llmAvailable;
  const catalogNoModels = catalog !== null && catalog.llmAvailable && catalog.providers.length > 0 && catalog.providers.every((provider) => provider.models.length === 0);
  const display = (key) => {
    const draft = form[key];
    if (draft === void 0 || draft === null) return resolveField(payload, key).value;
    return draft;
  };
  const primaryProvider = String(display("organize.provider") ?? "");
  function fieldShell(field, control) {
    const resolved = resolveField(payload, field.key);
    const isDirty = form[field.key] !== void 0;
    const willReset = form[field.key] === null;
    const waitingRestart = pending.includes(field.key);
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.field, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.fieldHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 12 }, children: field.label }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Badge, { source: resolved.source }),
        waitingRestart ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.badgeWarn, title: "\u8BBE\u7F6E\u5C42\u5DF2\u7ECF\u5199\u4E86\u8FD9\u4E2A\u503C\uFF0C\u4F46\u6B63\u5728\u8DD1\u7684 core \u8FD8\u662F\u65E7\u503C", children: "\u5F85\u91CD\u542F" }) : null,
        isDirty ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.badgeWarn, title: willReset ? "\u4FDD\u5B58\u540E\u4F1A\u4ECE\u8BBE\u7F6E\u5C42\u5220\u6389\u8FD9\u4E00\u952E\uFF0C\u56DE\u5230\u4E0B\u5C42\u914D\u7F6E" : "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8", children: willReset ? "\u5C06\u6062\u590D\u9ED8\u8BA4" : "\u5DF2\u6539" }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { ...S2.row, marginTop: 4 }, children: [
        control,
        resolved.fromSettings || isDirty ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            style: S2.tiny,
            title: "\u4ECE\u8BBE\u7F6E\u5C42\u5220\u6389\u8FD9\u4E00\u952E\uFF08\u56DE\u5230 profile / \u9ED8\u8BA4\u503C\uFF09",
            onClick: () => setForm(resetField(form, payload, field.key)),
            children: "\u6062\u590D\u9ED8\u8BA4"
          }
        ) : null
      ] }),
      field.hint !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.hint, children: field.hint }) : null
    ] }, field.key);
  }
  function controlOf(field) {
    if (field.kind === "bool") {
      const checked = display(field.key) === true;
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            type: "checkbox",
            checked,
            onChange: (event) => setForm(editField(form, payload, field.key, event.target.checked))
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 12, opacity: 0.8 }, children: checked ? "\u5F00" : "\u5173" })
      ] });
    }
    if (field.kind === "number") {
      const scale = field.scale ?? 1;
      const text3 = numberText(display(field.key), scale);
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "input",
          {
            type: "number",
            style: S2.number,
            value: text3,
            step: field.step ?? 1,
            min: field.min,
            onChange: (event) => {
              const parsed = parseNumberText(event.target.value);
              if (parsed === void 0) return;
              if (parsed === null) setForm(resetField(form, payload, field.key));
              else setForm(editField(form, payload, field.key, parsed * scale));
            }
          }
        ),
        field.unit !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.mono, children: field.unit }) : null
      ] });
    }
    if (field.kind === "select") {
      const isModel = field.key === "organize.model";
      const current = String(display(field.key) ?? "");
      const options = isModel ? withCurrent(modelOptions(catalog, primaryProvider), current) : withCurrent(providerOptions(catalog), current);
      const problem = isModel ? routeProblem(catalog, primaryProvider, current) : routeProblem(catalog, current, String(display("organize.model") ?? ""));
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "select",
          {
            style: { ...S2.select, minWidth: isModel ? 220 : 200 },
            value: current,
            onChange: (event) => setForm(editField(form, payload, field.key, event.target.value)),
            children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: option.value, children: option.label }, option.value))
          }
        ),
        problem !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.warnText, children: problem }) : null
      ] });
    }
    if (field.kind === "routes") {
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(RoutesEditor, {});
    }
    const text2 = display(field.key) === void 0 || display(field.key) === null ? "" : String(display(field.key));
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "input",
      {
        type: "text",
        style: S2.input,
        value: text2,
        placeholder: "~/OblivionKB",
        onChange: (event) => {
          if (event.target.value === "") setForm(resetField(form, payload, field.key));
          else setForm(editField(form, payload, field.key, event.target.value));
        }
      }
    );
  }
  function RoutesEditor() {
    const draft = form["organize.fallbacks"];
    const rows = Array.isArray(draft) ? draft : fallbacksOf(payload);
    const key = "organize.fallbacks";
    const setRows = (next) => {
      setForm(editField(form, payload, key, next));
    };
    const move = (from, to) => {
      if (to < 0 || to >= rows.length) return;
      const next = [...rows];
      const [item] = next.splice(from, 1);
      if (item === void 0) return;
      next.splice(to, 0, item);
      setRows(next);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.mono, children: "\u8FD8\u6CA1\u6709\u5907\u7528\u8DEF\uFF08\u4E3B\u8DEF\u5931\u8D25\u5C31\u76F4\u63A5\u62A5\u9519\uFF09\u3002" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 6, width: "100%" }, children: [
        rows.map((row, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.row, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: S2.mono, children: [
            index + 1,
            "."
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "select",
            {
              style: S2.select,
              value: row.provider,
              onChange: (event) => {
                const next = [...rows];
                next[index] = { ...row, provider: event.target.value };
                setRows(next);
              },
              children: withCurrent(providerOptions(catalog), row.provider).map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: option.value, children: option.label }, option.value))
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "select",
            {
              style: S2.select,
              value: row.model,
              onChange: (event) => {
                const next = [...rows];
                next[index] = { ...row, model: event.target.value };
                setRows(next);
              },
              children: withCurrent(modelOptions(catalog, row.provider), row.model).map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: option.value, children: option.label }, option.value))
            }
          ),
          !isCompleteRoute(row) ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.mono, children: "\uFF08\u6CA1\u914D\u5168\uFF0C\u4F1A\u88AB core \u4E22\u6389\uFF09" }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: S2.tiny, onClick: () => move(index, index - 1), title: "\u4E0A\u79FB", children: "\u2191" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: S2.tiny, onClick: () => move(index, index + 1), title: "\u4E0B\u79FB", children: "\u2193" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              style: S2.tiny,
              onClick: () => setRows(rows.filter((_, at) => at !== index)),
              title: "\u5220\u9664\u8FD9\u4E00\u6761",
              children: "\u5220"
            }
          )
        ] }, index)),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: { ...S2.btn, alignSelf: "flex-start" }, onClick: () => setRows([...rows, { provider: "", model: "" }]), children: "\u6DFB\u52A0\u5907\u7528\u8DEF" })
      ] })
    ] });
  }
  const pendingText = pendingSentence(pending);
  const note = writableNote(payload.writable);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-obl-settings": "", style: S2.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { style: S2.title, children: SETTINGS_SECTION_LABEL }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: S2.hint, children: [
        "\u8DEF\u5F84\u3001\u81EA\u52A8\u6574\u7406\u4E0E\u6A21\u578B\u9009\u62E9\u3002\u5199\u5165 ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: payload.path ?? "<dataRoot>/settings.json" }),
        "\uFF08\u4F18\u5148\u7EA7\uFF1A\u9ED8\u8BA4\u503C < profile \u7684\u63D2\u4EF6 config < \u8FD9\u4E00\u9875\uFF09\u3002"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { style: S2.mono, children: [
          "core v",
          payload.version ?? "?"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.mono, children: SETTINGS_ROUTE })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { ...S2.row, marginTop: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: 12 }, children: "\u6253\u5F00\u81EA\u52A8\u6574\u7406\u4F1A\u8D70\uFF1A" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { ...S2.mono, wordBreak: "break-word" }, children: summary.routes })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.hint, children: summary.label }),
      catalogNoLlm ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: S2.warnText, children: [
        "\u5BBF\u4E3B\u6CA1\u6709 ",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: "llm" }),
        " \u670D\u52A1\uFF1A\u4E0B\u62C9\u6846\u4E3A\u7A7A\uFF0C\u81EA\u52A8\u6574\u7406\u4F1A\u76F4\u63A5\u8DF3\u8FC7\u3002provider \u8981\u5728 profile \u7684",
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("code", { children: " llm-pi-ai " }),
        "\u914D\u7F6E\u91CC\u767B\u8BB0\uFF08\u672C\u9875\u4E0D\u78B0\u5BC6\u94A5\uFF0C\u4E5F\u4E0D\u586B\u5730\u5740\uFF09\u3002"
      ] }) : null,
      catalogMissing && !catalogNoLlm ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.warnText, children: "\u5BBF\u4E3B\u6CA1\u56DE provider \u6E05\u5355 \u2014\u2014 core \u7248\u672C\u65E7\uFF08\u6E05\u5355\u662F 0.2.16 \u8D77\u7684\uFF09\uFF0C\u6216\u6CE8\u518C\u8868\u4E3A\u7A7A\u3002" }) : null,
      catalogNoModels ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.warnText, children: "\u5217\u5230\u4E86 provider \u4F46\u90FD\u6CA1\u6709\u6A21\u578B \u2014\u2014 \u68C0\u67E5 profile \u91CC\u5404 provider \u7684 models\u3002" }) : null
    ] }),
    GROUPS.map((group) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { style: S2.heading, children: group.title }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.hint, children: group.hint }),
      fieldsOf(group.id).map((field) => fieldShell(field, controlOf(field)))
    ] }, group.id)),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.card, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: S2.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          "button",
          {
            type: "button",
            style: {
              ...S2.btn,
              padding: "5px 12px",
              border: "none",
              background: dirty > 0 ? ACCENT : "transparent",
              color: dirty > 0 ? "#fff" : MUTED,
              cursor: dirty > 0 && !busy ? "pointer" : "not-allowed"
            },
            disabled: dirty === 0 || busy,
            onClick: () => void save(),
            children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", style: S2.btn, disabled: dirty === 0 || busy, onClick: () => {
          setForm({});
          setNotice(null);
        }, children: "\u64A4\u9500\u6539\u52A8" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: S2.mono, children: dirty === 0 ? "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" : "\u6709 " + dirty + " \u9879\u672A\u4FDD\u5B58" })
      ] }),
      notice !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(NoticeLine, { notice }) : null,
      note !== "" ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.hint, children: note }) : null
    ] }),
    pendingText !== null ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { ...S2.card, border: "1px solid " + WARN }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { style: S2.heading, children: "\u8981\u91CD\u542F DSH \u624D\u751F\u6548" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.warnText, children: pendingText }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { style: S2.hint, children: "\u914D\u7F6E\u5728 core \u88C5\u8F7D\u90A3\u4E00\u523B\u5C31\u56FA\u5316\u8FDB\u5404\u5B50\u6A21\u5757\u4E86\uFF0C\u6240\u4EE5\u8BBE\u7F6E\u5C42\u5199\u4E0B\u7684\u503C\u8981\u4E0B\u4E00\u8F6E\u88C5\u8F7D\u624D\u751F\u6548\u3002 \u4E0B\u9762\u8FD9\u4E2A\u6309\u94AE\u5C31\u662F\u90A3\u6B21\u91CD\u542F\uFF08\u673A\u5236\u53EA\u6709\u4E00\u4EFD\uFF0C\u590D\u7528 @oblivion/brand \u7684\u91CD\u542F\u8DEF\u7531\uFF09\u3002" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { style: { ...S2.row, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(RestartControl, {}) })
    ] }) : null
  ] });
}

// oblivion-panel/src/client/leftbar.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function PolarisGlyph({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 " + POLARIS_VIEWBOX.width + " " + POLARIS_VIEWBOX.height,
      fill: POLARIS_ICON_COLOR,
      "aria-hidden": true,
      style: { display: "block", flex: "0 0 auto" },
      children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: POLARIS_ICON_PATH })
    }
  );
}
function openOblivionTab(service, tabType) {
  if (!service || typeof service.openTab !== "function") return "no-service";
  try {
    if (typeof service.getTab === "function" && service.getTab(tabType) === void 0) return "unknown-type";
    service.openTab({ type: tabType, target: "right" });
    return "opened";
  } catch {
    return "failed";
  }
}
function createLeftbarAction(onActivate) {
  return function OblivionLeftbarAction(props) {
    const wide = props?.wide !== false;
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
      "button",
      {
        type: "button",
        onClick: onActivate,
        title: "\u6253\u5F00 Oblivion \u8BA4\u77E5\u9762\u677F\uFF08\u53F3\u4FA7\u680F\uFF09",
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: wide ? "6px 8px" : "6px 0",
          justifyContent: wide ? "flex-start" : "center",
          border: "none",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 12
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PolarisGlyph, { size: 16 }),
          wide ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "Oblivion" }) : null
        ]
      }
    );
  };
}

// oblivion-panel/src/client/open-note.ts
function supportsOpenFile(service) {
  if (!service || typeof service.openFile !== "function") return false;
  if (!Array.isArray(service.features)) return true;
  return service.features.includes("openFile");
}
function snapshotScope(service) {
  try {
    const snapshot = service?.getSnapshot?.();
    const sessionId = snapshot?.sessionId;
    return typeof sessionId === "string" && sessionId !== "" ? { sessionId } : void 0;
  } catch {
    return void 0;
  }
}
function openNoteInSidebar(input) {
  const { service, path, hostOpen } = input;
  const path_ = typeof path === "string" ? path.trim() : "";
  if (path_ === "") return "failed";
  const scope = input.scope?.sessionId ? input.scope : snapshotScope(service);
  if (supportsOpenFile(service) && scope?.sessionId) {
    try {
      service?.openFile?.({ sessionId: scope.sessionId, ...scope.cwd ? { cwd: scope.cwd } : {} }, path_);
      return "opened";
    } catch {
    }
  }
  if (typeof hostOpen === "function") {
    try {
      hostOpen(path_);
      return "opened-via-host-prop";
    } catch {
      return "failed";
    }
  }
  if (!service) return "no-service";
  if (!scope?.sessionId) return "no-session";
  return "failed";
}

// oblivion-panel/src/client/register.ts
var PANEL_TAB_ID = "oblivion:panel";
function panelDescriptor(component, icon) {
  return {
    id: PANEL_TAB_ID,
    title: () => "Oblivion",
    description: () => "\u8BA4\u77E5\u5C42\u89C2\u6D4B\uFF1A\u6355\u83B7\u7387\u3001\u62E6\u622A\u539F\u56E0\u3001\u8C03\u53C2\u5EFA\u8BAE\u4E0E\u6700\u8FD1\u6C89\u6DC0",
    ...icon === void 0 ? {} : { icon },
    order: 70,
    single: true,
    component
  };
}
function registerPanelTab(ctx, component, warn, icon) {
  const attach = (service) => {
    if (!service || typeof service.registerTab !== "function") {
      return { status: "no-service", detail: "ctx.betterSidebar \u4E0D\u53EF\u7528\uFF08dsh-better-sidebar \u672A\u88C5\u8F7D\uFF1F\uFF09" };
    }
    try {
      const dispose = service.registerTab(panelDescriptor(component, icon));
      if (typeof dispose === "function" && typeof ctx.effect === "function") {
        ctx.effect(() => dispose, "oblivion-panel: better-sidebar tab");
      }
      return { status: "registered", service };
    } catch (error) {
      return { status: "failed", detail: error instanceof Error ? error.message : String(error) };
    }
  };
  if (typeof ctx.inject === "function") {
    const result2 = { status: "no-service", detail: "inject \u56DE\u8C03\u672A\u89E6\u53D1" };
    try {
      ctx.inject(["betterSidebar"], (scope) => {
        Object.assign(result2, attach(scope?.betterSidebar));
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

// oblivion-panel/src/client/index.ts
var inject = ["slots"];
var LOG_NAME = "@oblivion/panel";
function reportCtxShape(ctx, extra = {}) {
  try {
    const target = ctx;
    const keys = Object.keys(target).slice(0, 80);
    const typeofs = {};
    for (const key of keys) {
      try {
        typeofs[key] = typeof target[key];
      } catch {
        typeofs[key] = "(throws)";
      }
    }
    const prototypes = [];
    let cursor = Object.getPrototypeOf(target);
    for (let depth = 0; depth < 5 && cursor; depth += 1) {
      prototypes.push(cursor.constructor?.name ?? "(anonymous)");
      cursor = Object.getPrototypeOf(cursor);
    }
    const probes = {};
    for (const name of ["on", "emit", "inject", "get", "provide", "effect", "slots", "locale", "shortcuts", "betterSidebar", "layout", "session", "remote", "logger"]) {
      try {
        const value = typeof target[name];
        if (value !== "undefined") probes[name] = value;
      } catch {
        probes[name] = "(throws)";
      }
    }
    const body = JSON.stringify({
      at: Date.now(),
      where: "client",
      keys,
      typeofs,
      prototypes,
      probes,
      hasInject: typeof target.inject === "function",
      hasGet: typeof target.get === "function",
      ...extra
    });
    void fetch("/oblivion-panel/diag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      credentials: "same-origin"
    }).catch(() => void 0);
  } catch {
  }
}
function apply(ctx) {
  const logger = ctx.logger?.(LOG_NAME);
  const warn = (message) => logger?.warn?.(message);
  let result = { status: "no-service", detail: "\u5C1A\u672A\u6CE8\u518C" };
  const readService = () => result.service;
  const openNote = (props, path) => {
    const service = readService();
    const outcome = openNoteInSidebar({ service, scope: props.scope, path, hostOpen: props.onOpenFile });
    postDiag({
      at: Date.now(),
      where: "open-note",
      outcome,
      path,
      hasService: service !== void 0,
      hasOpenFile: typeof service?.openFile === "function",
      hasSessionId: typeof props.scope?.sessionId === "string",
      tabStatus: result.status
    });
    if (outcome === "opened" || outcome === "opened-via-host-prop") logger?.info?.("\u5DF2\u8BF7\u4FA7\u8FB9\u680F\u6253\u5F00\u7B14\u8BB0\uFF1A" + path);
    else warn("\u6253\u5F00\u7B14\u8BB0\u5931\u8D25\uFF08" + outcome + "\uFF09\uFF1A" + path);
  };
  const panelComponent = (props) => (0, import_react6.createElement)(OblivionPanel, {
    visible: props.visible,
    onOpenFile: (path) => openNote(props, path)
  });
  result = registerPanelTab(ctx, panelComponent, warn, (size) => (0, import_react6.createElement)(PolarisGlyph, { size }));
  if (result.status === "registered") logger?.info?.("\u5DF2\u5728 side bar \u6CE8\u518C Oblivion \u9762\u677F tab");
  else warn("\u9762\u677F tab \u672A\u6CE8\u518C\uFF1A" + String(result.detail ?? result.status));
  let slots;
  try {
    slots = ctx.slots;
  } catch (error) {
    warn("\u8BFB\u53D6 ctx.slots \u88AB\u5BBF\u4E3B\u5B88\u536B\u62E6\u4E0B\uFF1A" + (error instanceof Error ? error.message : String(error)));
  }
  let leftbarRegistered = false;
  if (slots && typeof slots.inject === "function" && typeof slots.register === "function") {
    const component = createLeftbarAction(() => {
      const service = readService();
      const outcome = openOblivionTab(service, PANEL_TAB_ID);
      postDiag({
        at: Date.now(),
        where: "leftbar-click",
        outcome,
        hasService: service !== void 0,
        hasOpenTab: typeof service?.openTab === "function",
        tabStatus: result.status,
        tabType: PANEL_TAB_ID
      });
      if (outcome === "opened") logger?.info?.("\u5DE6\u680F\u5165\u53E3\uFF1A\u5DF2\u6253\u5F00\u53F3\u4FA7 Oblivion \u9875");
      else warn("\u5DE6\u680F\u5165\u53E3\uFF1A\u6253\u5F00\u53F3\u4FA7 Oblivion \u9875\u5931\u8D25\uFF08" + outcome + "\uFF09");
    });
    try {
      slots.inject(
        "sidebar.footer.action",
        () => slots.register?.({ name: "sidebar.footer.action", id: "oblivion-panel", order: 60, label: () => "Oblivion" }, component)
      );
      leftbarRegistered = true;
    } catch (error) {
      warn("\u5DE6\u680F\u5165\u53E3\u6CE8\u518C\u5931\u8D25\uFF1A" + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn("slots \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u5DE6\u680F\u5165\u53E3\u672A\u6CE8\u518C\uFF08\u53F3\u4FA7\u680F tab \u4E0D\u53D7\u5F71\u54CD\uFF09");
  }
  let settingsSectionRequested = false;
  if (slots && typeof slots.inject === "function" && typeof slots.register === "function") {
    try {
      slots.inject(
        "settings.section",
        () => slots.register?.(
          {
            name: "settings.section",
            id: SETTINGS_SECTION_ID,
            order: SETTINGS_SECTION_ORDER,
            label: () => SETTINGS_SECTION_LABEL
          },
          OblivionSettingsSection
        )
      );
      settingsSectionRequested = true;
    } catch (error) {
      warn("\u8BBE\u7F6E\u5206\u8282\u6CE8\u518C\u5931\u8D25\uFF1A" + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn("slots \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u8BBE\u7F6E\u5206\u8282\u672A\u6CE8\u518C\uFF08\u8BBE\u7F6E \u2192 " + SETTINGS_SECTION_LABEL + " \u4E0D\u4F1A\u51FA\u73B0\uFF09");
  }
  reportCtxShape(ctx, {
    panelTab: { status: result.status, detail: result.detail ?? null, tabId: PANEL_TAB_ID },
    leftbar: { requested: leftbarRegistered, seat: "sidebar.footer.action" },
    settingsSection: {
      requested: settingsSectionRequested,
      seat: "settings.section",
      id: SETTINGS_SECTION_ID,
      order: SETTINGS_SECTION_ORDER,
      note: "\u771F\u6B63\u6302\u4E0A\u4E0E\u5426\u770B\u540C\u76EE\u5F55\u4E0B where=settings-section \u7684\u90A3\u6761\u81EA\u62A5"
    }
  });
}
var index_default = { inject, apply };

		return module.exports;
	}
});
