window.__ModuleLoader__.load({
	id: "@oblivion/daily-life",
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
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/icon.tsx
var import_react = require("react");
function dailyLifeIcon(size = 16) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
  return (0, import_react.createElement)(
    "svg",
    common,
    (0, import_react.createElement)("circle", { cx: 12, cy: 12, r: 9 }),
    (0, import_react.createElement)("path", { d: "M8.5 8.5 12 12.5l3.5-4" }),
    (0, import_react.createElement)("path", { d: "M12 12.5V16" }),
    (0, import_react.createElement)("path", { d: "M9.5 14h5" })
  );
}

// src/client/panel.tsx
var import_react2 = require("react");

// src/client/api.ts
var DEFAULT_STATUS_PATH = "/daily-life/status";
var DEFAULT_ITEMS_PATH = "/daily-life/items";
function pickFetch(options) {
  if (typeof options.fetchImpl === "function") return options.fetchImpl;
  const globalFetch = globalThis.fetch;
  return typeof globalFetch === "function" ? globalFetch.bind(globalThis) : null;
}
function isState(value) {
  if (value === null || typeof value !== "object") return false;
  const record = value;
  return record.ok === true && Array.isArray(record.items) && record.stats !== null && typeof record.stats === "object";
}
async function fetchState(options = {}) {
  const impl = pickFetch(options);
  if (impl === null) return { ok: false, error: "\u8FD9\u4E2A\u73AF\u5883\u6CA1\u6709 fetch", status: 0 };
  const path = options.statusPath ?? DEFAULT_STATUS_PATH;
  let response;
  try {
    response = await impl(path, { method: "GET", headers: { accept: "application/json" } });
  } catch (error) {
    return { ok: false, error: "\u8BF7\u6C42\u6CA1\u6709\u53D1\u51FA\u53BB\uFF1A" + describe(error), status: 0 };
  }
  if (!response.ok) {
    const body2 = await safeJson(response);
    return { ok: false, error: errorOf(body2) ?? httpTextOf(response.status), status: response.status };
  }
  const body = await safeJson(response);
  if (!isState(body)) return { ok: false, error: "\u670D\u52A1\u56DE\u4E86\u975E\u9884\u671F\u5F62\u72B6\u7684 JSON", status: response.status };
  return { ok: true, state: body };
}
async function sendAction(request, options = {}) {
  const impl = pickFetch(options);
  if (impl === null) return { ok: false, error: "\u8FD9\u4E2A\u73AF\u5883\u6CA1\u6709 fetch", status: 0 };
  const path = options.itemsPath ?? DEFAULT_ITEMS_PATH;
  let response;
  try {
    response = await impl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  } catch (error) {
    return { ok: false, error: "\u8BF7\u6C42\u6CA1\u6709\u53D1\u51FA\u53BB\uFF1A" + describe(error), status: 0 };
  }
  const body = await safeJson(response);
  if (!response.ok) {
    return { ok: false, error: errorOf(body) ?? httpTextOf(response.status), status: response.status, errors: errorsOf(body) };
  }
  if (body === null || typeof body !== "object" || body.ok !== true) {
    return { ok: false, error: "\u670D\u52A1\u56DE\u4E86\u975E\u9884\u671F\u5F62\u72B6\u7684 JSON", status: response.status };
  }
  return { ok: true, payload: body };
}
async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function errorOf(body) {
  if (body === null || typeof body !== "object") return null;
  const record = body;
  const base = typeof record.error === "string" ? record.error : null;
  const errors = errorsOf(body);
  if (base === null && errors === void 0) return null;
  return [base, errors?.join("\uFF1B")].filter((part) => part !== null && part !== void 0 && part !== "").join("\uFF1A");
}
function errorsOf(body) {
  if (body === null || typeof body !== "object") return void 0;
  const raw = body.errors;
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string") && raw.length > 0 ? raw : void 0;
}
function httpTextOf(status) {
  switch (status) {
    case 400:
      return "\u5B57\u6BB5\u6CA1\u586B\u5BF9";
    case 403:
      return "\u8DE8\u6E90\u8BF7\u6C42\u88AB\u62D2\u7EDD";
    case 404:
      return "\u8D26\u672C\u91CC\u6CA1\u6709\u8FD9\u4EF6\u7269\u54C1\uFF08\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF09";
    case 405:
      return "\u8BF7\u6C42\u65B9\u5F0F\u4E0D\u5BF9";
    case 409:
      return "\u8D26\u672C\u5DF2\u6EE1\uFF08\u4E0A\u9650 2000 \u4EF6\uFF09";
    case 413:
      return "\u8BF7\u6C42\u4F53\u592A\u5927";
    case 500:
      return "\u6709\u6570\u670D\u52A1\u5185\u90E8\u5F02\u5E38\uFF0C\u8BE6\u89C1\u5BBF\u4E3B\u65E5\u5FD7";
    default:
      return "\u8BF7\u6C42\u5931\u8D25\uFF08HTTP " + String(status) + "\uFF09";
  }
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
function defaultDraft(today) {
  return { name: "", buyPrice: "", buyDate: today, category: "", serviceDaysTarget: "", note: "" };
}
function draftToItem(draft) {
  const text = (value) => {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };
  const numeric = (value) => {
    const trimmed = (value ?? "").trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  return {
    name: (draft.name ?? "").trim(),
    buyPrice: numeric(draft.buyPrice),
    buyDate: text(draft.buyDate),
    category: text(draft.category),
    serviceDaysTarget: numeric(draft.serviceDaysTarget),
    note: text(draft.note)
  };
}

// src/metrics.ts
var CATEGORY_SEED = ["\u6570\u7801", "\u5BB6\u7535", "\u5BB6\u5C45", "\u4EA4\u901A", "\u670D\u9970", "\u5DE5\u5177", "\u6587\u5A31", "\u5176\u4ED6"];

// src/client/format.ts
function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function group(intPart) {
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  let out = "";
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) out += ",";
    out += digits[index];
  }
  return (negative ? "-" : "") + out;
}
function money(value) {
  const number = finite(value);
  if (number === null) return "\u2014";
  const fixed = Math.abs(number).toFixed(2).split(".");
  return (number < 0 ? "-\xA5" : "\xA5") + group(fixed[0]) + "." + fixed[1];
}
function signedMoney(value) {
  const number = finite(value);
  if (number === null) return "\u2014";
  return (number > 0 ? "+" : "") + money(number);
}
function moneyPerDay(value) {
  const number = finite(value);
  if (number === null) return "\u2014";
  const text = number.toFixed(1).replace(/\.0$/, "");
  return "\xA5" + group(text.split(".")[0]) + (text.includes(".") ? "." + text.split(".")[1] : "") + "/\u5929";
}
function percentText(ratio) {
  const number = finite(ratio);
  if (number === null) return "\u2014";
  return Math.round(number * 100) + "%";
}
function dayText(day) {
  return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "\u2014";
}
function daysText(days) {
  const number = finite(days);
  return number === null ? "\u2014" : number + " \u5929";
}
var STATUS_LABEL = {
  serving: "\u670D\u5F79\u4E2D",
  idle: "\u95F2\u7F6E\u4E2D",
  sold: "\u5DF2\u5356\u51FA"
};
function statusLabel(status) {
  return STATUS_LABEL[status] ?? status;
}
function statusTone(status) {
  if (status === "serving") return "good";
  if (status === "idle") return "warn";
  return "muted";
}
function kpiRow(stats) {
  return [
    { label: "\u8D26\u9762\u6295\u5165", value: money(stats.netSpend), hint: "\u4E70\u5165\u5408\u8BA1 - \u5356\u51FA\u56DE\u6536" },
    { label: "\u65E5\u8017\u5408\u8BA1", value: moneyPerDay(stats.dailyTotal), hint: "\u6240\u6709\u670D\u5F79/\u95F2\u7F6E\u7269\u54C1\u7684\u65E5\u5747\u6210\u672C\u4E4B\u548C" },
    { label: "\u95F2\u7F6E\u635F\u8017", value: moneyPerDay(stats.idleBurn), hint: "\u95F2\u7F6E\u7269\u54C1\u8D21\u732E\u7684\u90A3\u90E8\u5206\u65E5\u8017" }
  ];
}
function countLine(stats) {
  return `\u5171 ${String(stats.count)} \u4EF6 \xB7 \u670D\u5F79\u4E2D ${String(stats.servingCount)} \xB7 \u95F2\u7F6E ${String(stats.idleCount)} \xB7 \u5DF2\u5356\u51FA ${String(stats.soldCount)}`;
}
function progressText(row) {
  const percent = percentText(row.derived.usageProgress);
  const overdue = finite(row.derived.overdueDays);
  if (overdue !== null && overdue > 0) return `\u670D\u5F79 ${percent} \xB7 \u8D85\u6807 ${String(overdue)} \u5929`;
  return `\u670D\u5F79 ${percent}`;
}
function metaText(row) {
  const parts = [`\u603B\u4EF7 ${money(row.buyPrice)}`, `\u5DF2\u7528 ${daysText(row.derived.holdingDays)}`];
  if (row.derived.status === "sold") {
    parts.push(`\u4FDD\u503C ${percentText(row.derived.retentionRate)}`);
    parts.push(`\u5DEE\u989D ${signedMoney(row.derived.soldDelta)}`);
  } else {
    parts.push(`\u95F2\u7F6E ${daysText(row.derived.idleDays)}`);
  }
  return parts.join(" \xB7 ");
}
function useHintText(row) {
  const count = finite(row.useCount);
  const last = dayText(row.lastUsedAt);
  return `\u7528\u8FC7 ${count === null ? "\u2014" : String(count)} \u6B21 \xB7 \u6700\u540E\u4E00\u6B21 ${last}`;
}

// src/client/panel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var TONE_COLOR = {
  good: "#2fbf71",
  warn: "#e2a03f",
  muted: "#8a8f98"
};
function todayIso() {
  const now = /* @__PURE__ */ new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
}
var box = {
  padding: "8px 10px",
  font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
  color: "inherit"
};
function DailyLifePanel(props) {
  const [state, setState] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)(null);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [showForm, setShowForm] = (0, import_react2.useState)(false);
  const [editingId, setEditingId] = (0, import_react2.useState)(null);
  const [draft, setDraft] = (0, import_react2.useState)(() => defaultDraft(todayIso()));
  const [sellId, setSellId] = (0, import_react2.useState)(null);
  const [sellPrice, setSellPrice] = (0, import_react2.useState)("");
  const reload = (0, import_react2.useCallback)(async () => {
    const result = await fetchState();
    if (result.ok) {
      setState(result.state);
      setError(result.state.loadError);
    } else {
      setError(result.error);
    }
  }, []);
  (0, import_react2.useEffect)(() => {
    void reload();
  }, [reload]);
  const run = (0, import_react2.useCallback)(
    async (request) => {
      setBusy(true);
      try {
        const result = await sendAction(request);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload]
  );
  if (props.visible === false) return null;
  const startAdd = () => {
    setEditingId(null);
    setDraft(defaultDraft(todayIso()));
    setShowForm(true);
  };
  const startEdit = (row) => {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      buyPrice: String(row.buyPrice),
      buyDate: row.buyDate,
      category: row.category ?? "",
      serviceDaysTarget: row.serviceDaysTarget === null ? "" : String(row.serviceDaysTarget),
      note: row.note ?? ""
    });
    setShowForm(true);
  };
  const submitForm = async () => {
    const item = draftToItem(draft);
    if (editingId === null) await run({ action: "add", item });
    else await run({ action: "update", id: editingId, item });
    setShowForm(false);
    setEditingId(null);
  };
  const submitSell = async (id) => {
    const price = sellPrice.trim() === "" ? null : Number(sellPrice);
    if (price === null || !Number.isFinite(price)) {
      setError("\u5356\u51FA\u8981\u586B\u4E00\u4E2A\u6570\u5B57\u91D1\u989D");
      return;
    }
    await run({ action: "sell", id, item: { soldPrice: price, soldDate: todayIso() } });
    setSellId(null);
    setSellPrice("");
  };
  const stats = state?.stats ?? null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: box, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { fontSize: 14 }, children: "\u6709\u6570" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.55 }, children: state === null ? "\u8BFB\u53D6\u4E2D\u2026" : "v" + state.version }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: () => void reload(), disabled: busy, style: linkButton, children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: startAdd, style: linkButton, children: "\u65B0\u589E" })
    ] }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(226,160,63,0.15)", color: TONE_COLOR.warn }, children: error }),
    stats !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: 10, marginTop: 8 }, children: kpiRow(stats).map((cell) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minWidth: 0 }, title: cell.hint, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, fontSize: 11 }, children: cell.label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }, children: cell.value })
      ] }, cell.label)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, fontSize: 11, marginTop: 6 }, children: countLine(stats) })
    ] }),
    showForm && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 8, padding: 8, border: "1px solid rgba(128,128,128,0.28)", borderRadius: 6 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u540D\u79F0", value: draft.name, onChange: (value) => setDraft({ ...draft, name: value }), placeholder: "\u4F8B\u5982 iPad Air" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u4E70\u5165\u4EF7", value: draft.buyPrice, onChange: (value) => setDraft({ ...draft, buyPrice: value }), placeholder: "4399" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u4E70\u5165\u65E5", value: draft.buyDate, onChange: (value) => setDraft({ ...draft, buyDate: value }), placeholder: "2024-03-01" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        Field,
        {
          label: "\u76EE\u6807\u670D\u5F79\u5929\u6570",
          value: draft.serviceDaysTarget,
          onChange: (value) => setDraft({ ...draft, serviceDaysTarget: value }),
          placeholder: "\u7559\u7A7A\u6309 1095 \u5929\uFF083 \u5E74\uFF09"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { width: 76, opacity: 0.6, fontSize: 11 }, children: "\u5206\u7C7B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            value: draft.category,
            onChange: (event) => setDraft({ ...draft, category: event.target.value }),
            style: { flex: 1, background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 4, padding: "2px 4px" },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u672A\u5206\u7C7B" }),
              CATEGORY_SEED.map((category) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: category, children: category }, category))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "\u5907\u6CE8", value: draft.note, onChange: (value) => setDraft({ ...draft, note: value }), placeholder: "\u53EF\u7559\u7A7A" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: solidButton, disabled: busy || draft.name.trim() === "", onClick: () => void submitForm(), children: editingId === null ? "\u8BB0\u4E00\u7B14" : "\u4FDD\u5B58\u4FEE\u6539" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            style: linkButton,
            onClick: () => {
              setShowForm(false);
              setEditingId(null);
            },
            children: "\u53D6\u6D88"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 8 }, children: [
      state !== null && state.items.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, padding: "10px 0" }, children: "\u8D26\u672C\u8FD8\u662F\u7A7A\u7684\u3002\u70B9\u300C\u65B0\u589E\u300D\u8BB0\u4E0B\u7B2C\u4E00\u4EF6\u4E1C\u897F \u2014\u2014 \u6709\u6570\u4F1A\u4ECE\u4E70\u5165\u4EF7\u548C\u5DF2\u7528\u5929\u6570\u7B97\u51FA\u5B83\u7684\u771F\u5B9E\u65E5\u5747\u6210\u672C\u3002" }),
      state?.items.map((row) => {
        const tone = statusTone(row.derived.status);
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "7px 0", borderTop: "1px solid rgba(128,128,128,0.18)" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "baseline", gap: 6 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: row.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: TONE_COLOR[tone], fontSize: 11 }, children: statusLabel(row.derived.status) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontWeight: 600 }, children: moneyPerDay(row.derived.dailyCost) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.65, fontSize: 11, marginTop: 2 }, children: metaText(row) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.65, fontSize: 11 }, children: [
            progressText(row),
            " \xB7 ",
            useHintText(row)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { height: 4, borderRadius: 2, background: "rgba(128,128,128,0.22)", marginTop: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              style: {
                height: 4,
                borderRadius: 2,
                width: percentText(row.derived.usageProgress),
                background: TONE_COLOR[tone]
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 4 }, children: [
            row.derived.status !== "sold" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkButton, disabled: busy, onClick: () => void run({ action: "use", id: row.id }), children: "\u7528\u8FC7\u4E00\u6B21" }),
              sellId === row.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "input",
                  {
                    value: sellPrice,
                    onChange: (event) => setSellPrice(event.target.value),
                    placeholder: "\u5356\u51FA\u4EF7",
                    style: { width: 90, background: "transparent", color: "inherit", border: "1px solid rgba(128,128,128,0.3)", borderRadius: 4, padding: "1px 4px" }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkButton, disabled: busy, onClick: () => void submitSell(row.id), children: "\u786E\u8BA4\u5356\u51FA" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkButton, onClick: () => setSellId(null), children: "\u53D6\u6D88" })
              ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  style: linkButton,
                  onClick: () => {
                    setSellId(row.id);
                    setSellPrice("");
                  },
                  children: "\u5356\u51FA"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkButton, onClick: () => startEdit(row), children: "\u7F16\u8F91" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: linkButton, disabled: busy, onClick: () => void run({ action: "remove", id: row.id }), children: "\u5220\u9664" })
          ] })
        ] }, row.id);
      })
    ] }),
    state !== null && state.skipped > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.6, fontSize: 11, marginTop: 6 }, children: [
      "\u8D26\u672C\u91CC\u6709 ",
      state.skipped,
      " \u6761\u8BB0\u5F55\u5F62\u72B6\u4E0D\u5BF9\uFF0C\u5DF2\u88AB\u8DF3\u8FC7\uFF08\u6587\u4EF6\uFF1A",
      state.dataFile,
      "\uFF09"
    ] }),
    state !== null && stats !== null && stats.soldCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { opacity: 0.6, fontSize: 11, marginTop: 6 }, children: [
      "\u5DF2\u5356\u51FA ",
      stats.soldCount,
      " \u4EF6\uFF0C\u56DE\u6536 ",
      money(stats.soldValue),
      "\uFF0C\u6574\u4F53\u4FDD\u503C ",
      percentText(stats.retentionRate)
    ] })
  ] });
}
function Field(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 4 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { width: 76, opacity: 0.6, fontSize: 11 }, children: props.label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        value: props.value,
        placeholder: props.placeholder,
        onChange: (event) => props.onChange(event.target.value),
        style: {
          flex: 1,
          minWidth: 0,
          background: "transparent",
          color: "inherit",
          border: "1px solid rgba(128,128,128,0.3)",
          borderRadius: 4,
          padding: "2px 4px",
          font: "inherit"
        }
      }
    )
  ] });
}
var linkButton = {
  background: "transparent",
  border: "none",
  color: "inherit",
  opacity: 0.75,
  cursor: "pointer",
  padding: 0,
  font: "inherit"
};
var solidButton = {
  background: "rgba(47,191,113,0.18)",
  border: "1px solid rgba(47,191,113,0.5)",
  color: "inherit",
  borderRadius: 4,
  cursor: "pointer",
  padding: "2px 10px",
  font: "inherit"
};

// src/client/register.ts
var DAILY_LIFE_TAB_ID = "oblivion:daily-life";
function dailyLifeDescriptor(component, icon) {
  return {
    id: DAILY_LIFE_TAB_ID,
    title: () => "\u6709\u6570",
    description: () => "\u7269\u54C1\u670D\u5F79\u8D26\u672C\uFF1A\u771F\u5B9E\u65E5\u5747\u6210\u672C\u3001\u670D\u5F79\u8FDB\u5EA6\u4E0E\u95F2\u7F6E\u635F\u8017",
    ...icon === void 0 ? {} : { icon },
    order: 72,
    single: true,
    component
  };
}
function registerDailyLifeTab(ctx, component, warn, icon) {
  const attach = (service) => {
    if (!service || typeof service.registerTab !== "function") {
      return { status: "no-service", detail: "ctx.betterSidebar \u4E0D\u53EF\u7528\uFF08dsh-better-sidebar \u672A\u88C5\u8F7D\uFF1F\uFF09" };
    }
    try {
      const dispose = service.registerTab(dailyLifeDescriptor(component, icon));
      if (typeof dispose === "function" && typeof ctx.effect === "function") {
        ctx.effect(() => dispose, "oblivion-daily-life: better-sidebar tab");
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
        if (result2.status !== "registered") warn("\u6709\u6570 tab \u672A\u6CE8\u518C\uFF1A" + String(result2.detail ?? result2.status));
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn("\u6709\u6570 tab \u6CE8\u518C\u5931\u8D25\uFF1A" + detail);
      return { status: "failed", detail };
    }
    return result2;
  }
  const direct = typeof ctx.get === "function" ? ctx.get("betterSidebar") : void 0;
  const result = attach(direct);
  if (result.status !== "registered") warn("\u6709\u6570 tab \u672A\u6CE8\u518C\uFF1A" + String(result.detail ?? result.status));
  return result;
}

// src/client/index.ts
var name = "@oblivion/daily-life";
var inject = [];
function apply(rawCtx) {
  const ctx = rawCtx;
  const warn = (message) => {
    ctx.logger?.warn?.("[oblivion-daily-life] " + message);
  };
  const result = registerDailyLifeTab(ctx, DailyLifePanel, warn, dailyLifeIcon);
  ctx.logger?.info?.(
    `[oblivion-daily-life] \u5BA2\u6237\u7AEF\u534A\u8FB9\uFF1Atab ${result.status === "registered" ? "\u5DF2\u6CE8\u518C" : "\u672A\u6CE8\u518C\uFF08" + String(result.detail ?? result.status) + "\uFF09"}`
  );
  console.log("[oblivion-daily-life] loaded");
}

		return module.exports;
	}
});
