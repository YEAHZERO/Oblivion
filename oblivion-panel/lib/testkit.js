// src/snapshot.ts
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
var MAX_JSON_BYTES = 256 * 1024;
var MAX_JSONL_BYTES = 2 * 1024 * 1024;
async function readJsonCapped(path, problems) {
  try {
    const info = await stat(path);
    if (info.size > MAX_JSON_BYTES) {
      problems.push(`${path} \u8D85\u8FC7 ${MAX_JSON_BYTES} \u5B57\u8282\uFF0C\u5DF2\u8DF3\u8FC7`);
      return void 0;
    }
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${path}: ${String(error)}`);
    return void 0;
  }
}
async function readJsonlTail(path, limit, problems) {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.length > MAX_JSONL_BYTES) {
      problems.push(`${path} \u8D85\u8FC7 ${MAX_JSONL_BYTES} \u5B57\u8282\uFF0C\u53EA\u53D6\u5C3E\u90E8`);
    }
    const body = raw.length > MAX_JSONL_BYTES ? raw.slice(raw.length - MAX_JSONL_BYTES) : raw;
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    const tail = lines.slice(-limit);
    const out = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line));
      } catch {
        problems.push(`${path}: \u6709\u4E00\u884C\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u8DF3\u8FC7`);
      }
    }
    return out;
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${path}: ${String(error)}`);
    return [];
  }
}
async function readItems(dataRoot, limit, problems) {
  let names = [];
  try {
    names = (await readdir(dataRoot)).filter((name) => name.startsWith("ts-") && name.endsWith(".json"));
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${dataRoot}: ${String(error)}`);
    return [];
  }
  const rows = [];
  for (const name of names) {
    const parsed = await readJsonCapped(join(dataRoot, name), problems);
    if (!parsed || typeof parsed !== "object") continue;
    const item = parsed;
    rows.push({
      id: String(item.id ?? name.replace(/\.json$/, "")),
      topic: String(item.topic ?? ""),
      title: String(item.title ?? ""),
      created_at: Number(item.created_at ?? 0),
      status: String(item.status ?? "active"),
      version: Number(item.version ?? 1),
      sources: Array.isArray(item.sources) ? item.sources.length : 0
    });
  }
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}
async function readNotes(mdRoot, limit, problems) {
  const dir = join(mdRoot, "01_\u95EE\u7B54\u6C89\u6DC0");
  let names = [];
  try {
    names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".md"));
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${dir}: ${String(error)}`);
    return [];
  }
  const rows = [];
  for (const name of names) {
    const path = join(dir, name);
    try {
      const info = await stat(path);
      rows.push({ name, path, mtimeMs: info.mtimeMs, bytes: info.size });
    } catch (error) {
      problems.push(`${path}: ${String(error)}`);
    }
  }
  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}
async function buildSnapshot(options) {
  const problems = [];
  const limit = Math.min(50, Math.max(1, Math.floor(options.recentLimit) || 10));
  const now = options.now ?? (() => Date.now());
  const core = await readJsonCapped(join(options.dataRoot, "status.json"), problems);
  const mdRoot = typeof core?.mdRoot === "string" && core.mdRoot !== "" ? core.mdRoot : options.fallbackMdRoot;
  const [recent, items, notes] = await Promise.all([
    readJsonlTail(join(options.dataRoot, "decisions.jsonl"), limit, problems),
    readItems(options.dataRoot, limit, problems),
    readNotes(mdRoot, limit, problems)
  ]);
  return {
    ok: true,
    generatedAt: now(),
    dataRoot: options.dataRoot,
    mdRoot,
    core: core ?? null,
    trace: { path: join(options.dataRoot, "decisions.jsonl"), recent },
    items,
    notes,
    problems
  };
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
export {
  PANEL_TAB_ID,
  actionLabel,
  buildSnapshot,
  formatValue,
  hintLine,
  panelDescriptor,
  percent,
  registerPanelTab,
  relativeTime,
  statNumber,
  topReason
};
