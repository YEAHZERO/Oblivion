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
var import_react3 = require("react");

// src/client/Panel.tsx
var import_react2 = require("react");

// src/client/RestartControl.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var RESTART_PATH = "/obl-brand/restart";
var BTN = {
  idle: "\u91CD\u542F DSH",
  confirming: "\u786E\u8BA4\u91CD\u542F",
  sending: "\u6B63\u5728\u91CD\u542F\u2026",
  done: "\u5DF2\u53D1\u51FA\u91CD\u542F",
  error: "\u91CD\u8BD5"
};
function RestartControl() {
  const [phase, setPhase] = (0, import_react.useState)("idle");
  const [message, setMessage] = (0, import_react.useState)("");
  const send = (0, import_react.useCallback)(async () => {
    setPhase("sending");
    setMessage("");
    try {
      const response = await fetch(RESTART_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin"
      });
      if (!response.ok) {
        setPhase("error");
        setMessage(
          response.status === 404 ? "\u627E\u4E0D\u5230\u91CD\u542F\u8DEF\u7531 \u2014\u2014 @oblivion/brand \u672A\u88C5\u8F7D\uFF1F\u91CD\u542F\u673A\u5236\u7531\u5B83\u63D0\u4F9B\u3002" : "HTTP " + response.status
        );
        return;
      }
      setPhase("done");
      setMessage("DSH \u5C06\u5728\u6570\u79D2\u5185\u91CD\u542F\uFF0C\u672C\u9875\u4F1A\u65AD\u5F00\u3002");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { display: "inline-flex", alignItems: "center", gap: 6 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        style: {
          border: "1px solid rgba(127,127,127,0.35)",
          borderRadius: 5,
          background: "transparent",
          color: phase === "error" ? "#d9534f" : "inherit",
          cursor: phase === "sending" ? "default" : "pointer",
          padding: "2px 8px",
          fontSize: 11
        },
        disabled: phase === "sending",
        onClick: () => {
          if (phase === "idle") {
            setPhase("confirming");
            setMessage("\u91CD\u542F\u4F1A\u5F3A\u5236\u7ED3\u675F\u5F53\u524D DSH \u8FDB\u7A0B\uFF1A\u6B63\u5728\u8DD1\u7684\u4F1A\u8BDD\u4E0E\u4EFB\u52A1\u4F1A\u4E2D\u65AD\u3002");
            return;
          }
          void send();
        },
        children: BTN[phase] ?? "\u91CD\u542F DSH"
      }
    ),
    message ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: 11, opacity: 0.75 }, children: message }) : null
  ] });
}

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

// src/client/polaris.ts
var POLARIS_VIEWBOX = { width: 1024, height: 1024 };
var POLARIS_ICON_COLOR = "#4176e6";
var POLARIS_ICON_PATH = "M512 132L579 350.3L780.7 243.3L673.7 445L892 512L673.7 579L780.7 780.7L579 673.7L512 892L445 673.7L243.3 780.7L350.3 579L132 512L350.3 445L243.3 243.3L445 350.3Z";

// src/client/ScoreChart.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var REJECT_COLOR = "#d9534f";
function ScoreChart(props) {
  const { curve } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "svg",
    {
      viewBox: "0 0 " + curve.width + " " + curve.height,
      style: { width: "100%", height: "auto", display: "block" },
      role: "img",
      "aria-label": "\u5224\u5B9A\u4EF7\u5206\u66F2\u7EBF\uFF1A" + curve.points + " \u4E2A\u70B9\uFF0C\u533A\u95F4 " + (curve.min ?? 0).toFixed(2) + "\u2013" + (curve.max ?? 0).toFixed(2) + (curve.threshold === null ? "" : "\uFF0C\u9608\u503C " + curve.threshold.toFixed(2)),
      children: [
        curve.ticks.map((tick) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("g", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("text", { x: curve.width - 1, y: tick.y - 2, fontSize: 8, textAnchor: "end", fill: "currentColor", opacity: 0.45, children: tick.label })
        ] }, tick.label)),
        curve.thresholdY === null ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
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
        curve.area === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: curve.area, fill: POLARIS_ICON_COLOR, opacity: 0.12, stroke: "none" }),
        curve.trend === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: curve.trend, fill: "none", stroke: POLARIS_ICON_COLOR, strokeWidth: 1.4, opacity: 0.5 }),
        curve.line === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: curve.line, fill: "none", stroke: POLARIS_ICON_COLOR, strokeWidth: 1.6, strokeLinejoin: "round" }),
        curve.dots.map((dot, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "circle",
          {
            cx: dot.x,
            cy: dot.y,
            r: dot.pass ? 2.2 : 2.6,
            fill: dot.pass ? POLARIS_ICON_COLOR : REJECT_COLOR,
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("title", { children: relativeTime(dot.at) + " \xB7 " + actionLabel(dot.action) + " \xB7 \u5206\u503C " + scoreText(dot.score) })
          },
          index
        ))
      ]
    }
  );
}

// src/client/chart.ts
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

// src/client/knowledge.ts
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
      date: text(note.updatedAt) !== "" ? text(note.updatedAt) : text(note.createdAt)
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
      // 没有笔记文件就没有回链可解析；日期留空，渲染时按 `at` 折算。
      wiki: [],
      date: ""
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
  const written = text(row.date);
  if (written !== "") return written;
  if (!Number.isFinite(row.at) || row.at <= 0) return "";
  const at = new Date(row.at);
  const pad = (value) => String(value).padStart(2, "0");
  return at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate());
}
function detailParts(row) {
  const parts = [];
  const wiki = wikiText(row);
  parts.push({ label: "\u76F8\u5173\u4E3B\u9898", text: wiki !== "" ? wiki : "\u672A\u5F52\u5E76", wiki: (row.wiki ?? []).slice(0, WIKI_MAX) });
  const tags = keywordText(row);
  if (tags !== "") parts.push({ label: "\u5173\u952E\u8BCD", text: tags });
  const date = dateText(row);
  if (date !== "") parts.push({ label: "\u65E5\u671F", text: date });
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

// src/client/Panel.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.kpiCell, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.kpiLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.kpiValue, children: value })
  ] });
}
function rowMeta(row) {
  const parts = [];
  if (row.at > 0) parts.push(relativeTime(row.at));
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.dim, ...S.mono }, children: detailParts(row).map((part, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
    index > 0 ? " \xB7 " : "",
    part.label,
    "\uFF1A",
    part.wiki !== void 0 && part.wiki.length > 0 ? part.wiki.map(
      (page, pageIndex) => page.path === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        pageIndex > 0 ? "\u3001" : "",
        page.title
      ] }, page.title) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
        pageIndex > 0 ? "\u3001" : "",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
  const [state, setState] = (0, import_react2.useState)({ status: "loading" });
  const [showAllKnowledge, setShowAllKnowledge] = (0, import_react2.useState)(false);
  const load = (0, import_react2.useCallback)(async () => {
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
  (0, import_react2.useEffect)(() => {
    if (props.visible === false) return;
    void load();
  }, [load, props.visible]);
  const body = (0, import_react2.useMemo)(() => {
    if (state.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.dim, children: "\u8BFB\u53D6\u4E2D\u2026" });
    if (state.status === "error") {
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          "\u8BFB\u4E0D\u5230\u89C2\u6D4B\u6570\u636E\uFF1A",
          state.error
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.dim, children: [
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
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.row, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.dim, children: [
          "core ",
          core ? "v" + String(core.version ?? "?") : "\u672A\u88C5\u8F7D",
          " \xB7 \u9762\u677F v",
          String(data.panelVersion ?? "?"),
          " \xB7 \u5237\u65B0\u4E8E ",
          relativeTime(data.generatedAt)
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", style: S.btn, onClick: () => void load(), children: "\u5237\u65B0" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.row, marginTop: 6 }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RestartControl, {}) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.kpi, children: [
        kpi("\u6355\u83B7\u7387", percent(captureRate)),
        kpi("\u5224\u5B9A\u8F6E\u6570", String(turns ?? "\u2014")),
        kpi("\u5DF2\u8BC4\u4F30", String(evaluated ?? "\u2014")),
        kpi("\u5DF2\u6C89\u6DC0", String(captured ?? "\u2014"))
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.dim, marginTop: 2 }, children: live ? "\u7EDF\u8BA1\u5B9E\u65F6\u8BFB\u81EA " + live.parsed + " \u884C\u7559\u75D5\uFF08\u4FDD\u7559\u671F " + live.windowDays + " \u5929" + (live.dropped > 0 ? "\uFF0C\u6309\u4FDD\u7559\u671F/\u4E0A\u9650\u4E22\u5F03 " + live.dropped + " \u884C" : "") + "\uFF09" : "\u7EDF\u8BA1\u6765\u81EA core \u88C5\u8F7D\u65F6\u7684 status.json \u5FEB\u7167\uFF08\u9700\u8981\u9762\u677F host \u2265 0.0.8 \u624D\u662F\u5B9E\u65F6\u7684\uFF09" }),
      !core || !turns ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.card, marginTop: 10 }, children: emptyReason(data) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.dim, marginTop: 4 }, children: blocker ? "\u4E3B\u8981\u62E6\u622A\u539F\u56E0\uFF1A" + reasonLabel(blocker.reason) + "\uFF08" + blocker.count + " \u6B21\uFF09" : (turns ?? 0) > 0 ? "\u5168\u90E8\u901A\u8FC7\uFF0C\u65E0\u62E6\u622A" : "\u8FD8\u6CA1\u6709\u5224\u5B9A\u8BB0\u5F55" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.h, children: [
        "\u8C03\u53C2\u5EFA\u8BAE",
        " ",
        hints.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: S.dim, children: [
          "\uFF08\u6682\u65E0\uFF1Acore \u5728\u88C5\u8F7D\u65F6\u6309\u5DF2\u8BC4\u4F30 ",
          evaluated ?? 0,
          " \u8F6E\u7B97\uFF0C\u6837\u672C\u4E0D\u8DB3 20 \u8F6E\u523B\u610F\u4E0D\u5F00\u53E3\uFF09"
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: S.dim, children: "\uFF08core \u5728\u88C5\u8F7D\u65F6\u7B97\uFF0C\u4E0D\u662F\u5B9E\u65F6\u7684\uFF09" })
      ] }),
      hints.map((hint, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.card, children: hintLine(hint) }, String(hint.key ?? index))),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.h, children: "\u5224\u5B9A\u66F2\u7EBF" }),
      curve.points === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.dim, children: [
        "\u8FD8\u6CA1\u6709\u5E26\u5206\u503C\u7684\u5224\u5B9A \u2014\u2014 \u66F2\u7EBF\u4ECE\u7B2C\u4E00\u6761\u8D70\u5B8C\u7B5B\u9009\u7684\u7559\u75D5\u5F00\u59CB\uFF08",
        data.trace?.path ?? "decisions.jsonl",
        "\uFF09\u3002"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.card, padding: "6px 8px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ScoreChart, { curve }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.dim, ...S.mono, marginTop: 2 }, children: curveCaption(series, curve) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.h, children: [
        "\u77E5\u8BC6\u5E93\uFF08",
        knowledge.length,
        "\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { ...S.dim, marginBottom: 4 }, children: [
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
      knowledge.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.dim, children: [
        "\u8FD8\u6CA1\u6709\u6761\u76EE\uFF0C\u4E5F\u6CA1\u6709\u7B14\u8BB0\uFF08",
        data.mdRoot ?? "\u2014",
        "\uFF09"
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: S.list, children: knowledgeListView.visible.map((row) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("li", { style: S.li, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: row.notePath !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
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
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { ...S.dim, ...S.mono }, children: rowMeta(row) }),
        detailLine(row, props.onOpenFile)
      ] }, row.key)) }),
      knowledgeListView.itemOnly.length > KNOWLEDGE_ITEM_LIMIT || showAllKnowledge ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "button",
        {
          type: "button",
          style: { ...S.btn, marginTop: 4 },
          onClick: () => setShowAllKnowledge((prev) => !prev),
          children: showAllKnowledge ? "\u53EA\u770B\u6709\u7B14\u8BB0\u7684 " + knowledgeListView.backbone.length + " \u884C" : "\u5C55\u5F00\u5168\u90E8 " + knowledge.length + " \u884C\uFF08\u53E6\u6709 " + knowledgeListView.hidden + " \u884C\u4EC5\u5165\u5E93\uFF09"
        }
      ) : null,
      (data.problems ?? []).length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: S.h, children: [
          "\u8BFB\u53D6\u544A\u8B66\uFF08",
          data.problems?.length,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("ul", { style: S.list, children: (data.problems ?? []).map((problem, index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { style: { ...S.li, ...S.mono, ...S.dim }, children: problem }, index)) })
      ] }) : null
    ] });
  }, [state, load, props.onOpenFile, showAllKnowledge]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: S.root, children: body });
}

// src/client/leftbar.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function PolarisGlyph({ size = 16 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 " + POLARIS_VIEWBOX.width + " " + POLARIS_VIEWBOX.height,
      fill: POLARIS_ICON_COLOR,
      "aria-hidden": true,
      style: { display: "block", flex: "0 0 auto" },
      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: POLARIS_ICON_PATH })
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
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
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
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PolarisGlyph, { size: 16 }),
          wide ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "Oblivion" }) : null
        ]
      }
    );
  };
}

// src/client/open-note.ts
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

// src/client/register.ts
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

// src/client/index.ts
var inject = ["slots"];
var LOG_NAME = "@oblivion/panel";
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
  const panelComponent = (props) => (0, import_react3.createElement)(OblivionPanel, {
    visible: props.visible,
    onOpenFile: (path) => openNote(props, path)
  });
  result = registerPanelTab(ctx, panelComponent, warn, (size) => (0, import_react3.createElement)(PolarisGlyph, { size }));
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
  reportCtxShape(ctx, {
    panelTab: { status: result.status, detail: result.detail ?? null, tabId: PANEL_TAB_ID },
    leftbar: { registered: leftbarRegistered, seat: "sidebar.footer.action" }
  });
}
var index_default = { inject, apply };

		return module.exports;
	}
});
