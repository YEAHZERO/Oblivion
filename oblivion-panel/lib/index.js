// src/index.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join as join2, resolve } from "node:path";

// src/snapshot.ts
import { open, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
var MAX_JSON_BYTES = 256 * 1024;
var MAX_JSONL_BYTES = 2 * 1024 * 1024;
var FALLBACK_RETENTION_DAYS = 90;
var FALLBACK_MAX_ENTRIES = 5e3;
var MS_PER_DAY = 864e5;
var SERIES_MAX = 240;
var QA_NOTE_DIR = "01_\u95EE\u7B54\u6C89\u6DC0";
var DIGEST_NOTE_DIR = "04_\u4F1A\u8BDD\u6574\u7406";
var WIKI_NOTE_DIR = "02_Wiki\u9875\u9762";
var NOTE_HEAD_BYTES = 8192;
function ratio(part, whole) {
  return whole <= 0 ? 0 : Math.round(part / whole * 1e3) / 1e3;
}
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
  return Math.round(sorted[index] * 1e3) / 1e3;
}
function summarizeDecisions(rows, extra = {}) {
  const byAction = {};
  const byReason = {};
  const scores = [];
  let captured = 0;
  let noQa = 0;
  let belowThreshold = 0;
  for (const row of rows) {
    const action = String(row.action ?? "(none)");
    byAction[action] = (byAction[action] ?? 0) + 1;
    const reason = typeof row.reason === "string" && row.reason !== "" ? row.reason : "(none)";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    if (action === "no-qa") {
      noQa += 1;
      continue;
    }
    if (row.pass) captured += 1;
    if (typeof row.score === "number" && Number.isFinite(row.score)) {
      scores.push(row.score);
      if (!row.pass) belowThreshold += 1;
    }
  }
  const evaluated = rows.length - noQa;
  scores.sort((a, b) => a - b);
  const ats = rows.map((row) => row.at).filter((at) => typeof at === "number");
  return {
    windowDays: extra.windowDays ?? 0,
    firstAt: ats.length > 0 ? Math.min(...ats) : null,
    lastAt: ats.length > 0 ? Math.max(...ats) : null,
    turns: rows.length,
    evaluated,
    noQa,
    captured,
    rejected: evaluated - captured,
    captureRate: ratio(captured, evaluated),
    byAction,
    byReason,
    score: scores.length > 0 ? {
      min: scores[0],
      p50: percentile(scores, 50),
      p90: percentile(scores, 90),
      max: scores[scores.length - 1],
      belowThreshold
    } : null,
    parsed: extra.parsed ?? rows.length,
    dropped: extra.dropped ?? 0
  };
}
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
async function readJsonlRaw(path, problems) {
  try {
    const raw = await readFile(path, "utf8");
    const truncated = raw.length > MAX_JSONL_BYTES;
    if (truncated) problems.push(`${path} \u8D85\u8FC7 ${MAX_JSONL_BYTES} \u5B57\u8282\uFF0C\u53EA\u53D6\u5C3E\u90E8`);
    const body = truncated ? raw.slice(raw.length - MAX_JSONL_BYTES) : raw;
    const lines = body.split("\n").filter((line) => line.trim() !== "");
    const rows = [];
    let bad = 0;
    for (const line of lines) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        bad += 1;
      }
    }
    if (bad > 0) problems.push(`${path}: \u6709 ${bad} \u884C\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u8DF3\u8FC7`);
    return { rows, parsed: rows.length, bad, truncated };
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${path}: ${String(error)}`);
    return { rows: [], parsed: 0, bad: 0, truncated: false };
  }
}
async function readDecisions(path, options, problems) {
  const { rows, parsed } = await readJsonlRaw(path, problems);
  const cutoff = options.now - options.retentionDays * MS_PER_DAY;
  const fresh = rows.filter((row) => typeof row.at === "number" && row.at >= cutoff);
  const kept = fresh.length > options.maxEntries ? fresh.slice(fresh.length - options.maxEntries) : fresh;
  return { rows: kept, parsed, dropped: parsed - kept.length };
}
async function readItems(dataRoot, limit, problems) {
  let names = [];
  try {
    names = (await readdir(dataRoot)).filter((name2) => name2.startsWith("ts-") && name2.endsWith(".json"));
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${dataRoot}: ${String(error)}`);
    return [];
  }
  const rows = [];
  for (const name2 of names) {
    const parsed = await readJsonCapped(join(dataRoot, name2), problems);
    if (!parsed || typeof parsed !== "object") continue;
    const item = parsed;
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];
    rows.push({
      id: String(item.id ?? name2.replace(/\.json$/, "")),
      topic: String(item.topic ?? ""),
      title: String(item.title ?? ""),
      created_at: Number(item.created_at ?? 0),
      status: String(item.status ?? "active"),
      impl: String(item.impl ?? ""),
      version: Number(item.version ?? 1),
      sources: sources.length,
      sourceTypes: sources.map((source) => String(source?.type ?? "")).filter((type) => type !== ""),
      tags: tags.map((tag) => String(tag)).filter((tag) => tag.trim() !== ""),
      updated_at: Number(item.updated_at ?? item.created_at ?? 0)
    });
  }
  return rows.sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}
function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}
function dateOf(value) {
  const matched = /^\d{4}-\d{2}-\d{2}/.exec(unquote(value));
  return matched ? matched[0] : "";
}
function arrayOf(value) {
  const body = value.trim();
  const items = [];
  if (body.startsWith("[")) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) for (const item of parsed) items.push(String(item));
    } catch {
      for (const part of body.replace(/^\[|\]$/g, "").split(",")) items.push(part);
    }
  } else {
    for (const part of body.split(/[,\s]+/)) items.push(part);
  }
  return items.map((item) => unquote(item)).filter((item) => item !== "");
}
function addUnique(list, value) {
  const item = value.trim();
  if (item === "" || list.includes(item)) return;
  list.push(item);
}
function parseNoteHead(head) {
  const lines = head.split(/\r?\n/);
  const result = { tags: [], createdAt: "", updatedAt: "", wiki: [] };
  let inFrontmatter = false;
  let frontmatterClosed = !(lines.length > 0 && lines[0].trim() === "---");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!frontmatterClosed) {
      if (index === 0) {
        inFrontmatter = true;
        continue;
      }
      if (line.trim() === "---") {
        inFrontmatter = false;
        frontmatterClosed = true;
        continue;
      }
      if (!inFrontmatter) {
        frontmatterClosed = true;
        continue;
      }
      const field = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
      if (field === null) continue;
      const key2 = field[1];
      const value2 = field[2];
      if (key2 === "tags") for (const tag of arrayOf(value2)) addUnique(result.tags, tag);
      else if (key2 === "related_wiki") for (const title of arrayOf(value2)) addUnique(result.wiki, title);
      else if (key2 === "created_at") result.createdAt = result.createdAt || dateOf(value2);
      else if (key2 === "updated_at") result.updatedAt = result.updatedAt || dateOf(value2);
      continue;
    }
    const meta = /^>\s*([^:：]*)[:：]\s*(.*)$/.exec(line);
    if (meta === null) continue;
    const key = meta[1].trim().toLowerCase();
    const value = meta[2];
    if (key === "date") {
      const date = dateOf(value);
      if (date !== "") {
        result.createdAt = result.createdAt || date;
        result.updatedAt = result.updatedAt || date;
      }
    } else if (key === "tags") {
      for (const matched of value.matchAll(/#([^\s#]+)/g)) addUnique(result.tags, matched[1]);
    } else if (key === "wiki") {
      for (const matched of value.matchAll(/\[\[([^\]]+)\]\]/g)) addUnique(result.wiki, matched[1]);
    }
  }
  return result;
}
async function readNoteHead(path, size) {
  const handle = await open(path, "r");
  try {
    const length = Math.max(0, Math.min(size, NOTE_HEAD_BYTES));
    if (length === 0) return "";
    const buffer = Buffer.alloc(length);
    const read = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, read.bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}
async function readNoteDir(mdRoot, subdir, limit, problems) {
  const dir = join(mdRoot, subdir);
  let names = [];
  try {
    names = (await readdir(dir)).filter((name2) => name2.toLowerCase().endsWith(".md"));
  } catch (error) {
    const code = error.code;
    if (code !== "ENOENT") problems.push(`${dir}: ${String(error)}`);
    return [];
  }
  const rows = [];
  for (const name2 of names) {
    const path = join(dir, name2);
    try {
      const info = await stat(path);
      const head = await readNoteHead(path, info.size);
      rows.push({ name: name2, path, mtimeMs: info.mtimeMs, bytes: info.size, ...parseNoteHead(head) });
    } catch (error) {
      problems.push(`${path}: ${String(error)}`);
    }
  }
  return rows.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
}
function positiveInt(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
async function buildSnapshot(options) {
  const problems = [];
  const limit = Math.min(50, Math.max(1, Math.floor(options.recentLimit) || 10));
  const now = options.now ?? (() => Date.now());
  const core = await readJsonCapped(join(options.dataRoot, "status.json"), problems);
  const mdRoot = typeof core?.mdRoot === "string" && core.mdRoot !== "" ? core.mdRoot : options.fallbackMdRoot;
  const config = core?.config ?? {};
  const retentionDays = positiveInt(config.statsRetentionDays, FALLBACK_RETENTION_DAYS);
  const maxEntries = positiveInt(config.statsMaxEntries, FALLBACK_MAX_ENTRIES);
  const tracePath = join(options.dataRoot, "decisions.jsonl");
  const [decisions, items, notes, digests, wikis] = await Promise.all([
    readDecisions(tracePath, { retentionDays, maxEntries, now: now() }, problems),
    // 条目按**宽窗口**读：客户端要把「同主题的多版」聚成一行（被降级的旧版也在其中），
    // 只读 limit 条会把版本历史截断，于是「共 N 版」永远显示不出来。
    readItems(options.dataRoot, Math.max(limit * 8, 100), problems),
    readNoteDir(mdRoot, QA_NOTE_DIR, limit, problems),
    readNoteDir(mdRoot, DIGEST_NOTE_DIR, limit, problems),
    // 主题页只当字典用（标题 → 路径），所以按同一个窗口读就够。
    readNoteDir(mdRoot, WIKI_NOTE_DIR, limit, problems)
  ]);
  return {
    ok: true,
    generatedAt: now(),
    dataRoot: options.dataRoot,
    mdRoot,
    core: core ?? null,
    live: summarizeDecisions(decisions.rows, {
      parsed: decisions.parsed,
      dropped: decisions.dropped,
      windowDays: retentionDays
    }),
    trace: { path: tracePath, recent: decisions.rows.slice(-limit), series: decisions.rows.slice(-SERIES_MAX) },
    items,
    notes,
    digests,
    wikis,
    problems
  };
}

// src/index.ts
var name = "@oblivion/panel";
var inject = [];
var VERSION = readVersion();
function readVersion() {
  for (const relative of ["../VERSION", "./VERSION", "../../VERSION"]) {
    try {
      const text = readFileSync(new URL(relative, import.meta.url), "utf8").trim();
      if (text !== "") return text;
    } catch {
    }
  }
  return "0.0.0";
}
var DEFAULT_CONFIG = {
  dataRoot: "~/.oblivion/data",
  fallbackMdRoot: "C:/Library/\u90A3\u4E9B\u6E10\u6E10\u88AB\u9057\u5FD8",
  recentLimit: 10,
  routePath: "/oblivion-panel/status",
  diagPath: "/oblivion-panel/diag",
  logPrefix: "[oblivion-panel]"
};
async function writeJsonAtomic(path, value) {
  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  await mkdir(dirname(path), { recursive: true });
  const tmp = join2(dirname(path), "." + process.pid + "-" + Date.now().toString(36) + ".tmp");
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, path);
}
function readBody(request) {
  return new Promise((resolvePromise) => {
    let body = "";
    let overflow = false;
    request.on("data", (chunk) => {
      if (overflow) return;
      body += chunk.toString("utf8");
      if (body.length > 256 * 1024) overflow = true;
    });
    request.on("end", () => resolvePromise({ body, overflow }));
    request.on("error", () => resolvePromise({ body: "", overflow: false }));
  });
}
function safeParse(body) {
  try {
    const parsed = JSON.parse(body === "" ? "{}" : body);
    return parsed !== null && typeof parsed === "object" ? parsed : { value: parsed };
  } catch (error) {
    return { parseError: String(error), raw: body.slice(0, 2e3) };
  }
}
function expandHome(value) {
  if (!value) return homedir();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join2(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}
function asConfig(raw) {
  return { ...DEFAULT_CONFIG, ...raw ?? {} };
}
function writeMountEvidence(warn) {
  try {
    const dir = process.env.OBLIVION_PANEL_EVIDENCE_DIR || join2(process.env.TEMP || process.env.TMP || ".", "oblivion-panel");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join2(dir, "host-mount.json"),
      JSON.stringify({ plugin: name, version: VERSION, mountedAt: (/* @__PURE__ */ new Date()).toISOString(), pid: process.pid }, null, 2) + "\n",
      "utf8"
    );
  } catch (error) {
    warn(`\u81EA\u8BC1\u636E\u6587\u4EF6\u5199\u5165\u5931\u8D25\uFF1A${String(error)}`);
  }
}
function installStatusRoute(ctx, config, warn) {
  if (typeof ctx.inject !== "function") {
    warn("\u4E0A\u4E0B\u6587\u6CA1\u6709 inject\uFF1A\u53EA\u8BFB\u6570\u636E\u9762\u672A\u6302\u8F7D\uFF08\u6D4F\u89C8\u5668\u534A\u8FB9\u4ECD\u4F1A\u5C1D\u8BD5\u6CE8\u518C\u9762\u677F tab\uFF09");
    return;
  }
  ctx.inject(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF1A\u53EA\u8BFB\u6570\u636E\u9762\u672A\u6302\u8F7D");
      return;
    }
    const dataRoot = expandHome(config.dataRoot);
    server.register({
      kind: "exact",
      path: config.routePath,
      handler: (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        void buildSnapshot({
          dataRoot,
          recentLimit: config.recentLimit,
          fallbackMdRoot: config.fallbackMdRoot
        }).then((snapshot) => {
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({ ...snapshot, panelVersion: VERSION }));
        }).catch((error) => {
          warn(`\u5FEB\u7167\u88C5\u914D\u5931\u8D25\uFF1A${String(error)}`);
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "snapshot failed" }));
        });
      }
    });
    server.register({
      kind: "exact",
      path: config.diagPath,
      handler: (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        void readBody(request).then(async ({ body, overflow }) => {
          if (overflow) {
            response.writeHead(413, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: false, error: "body too large" }));
            return;
          }
          const target = join2(dataRoot, "panel-client-diag.json");
          await writeJsonAtomic(target, { ...safeParse(body), receivedAt: Date.now() });
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true, path: target }));
        }).catch((error) => {
          warn(`diag \u843D\u76D8\u5931\u8D25\uFF1A${String(error)}`);
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "diag write failed" }));
        });
      }
    });
  });
}
function apply(rawCtx, rawConfig) {
  const ctx = rawCtx;
  const config = asConfig(rawConfig);
  const warn = (message) => {
    ctx.logger?.warn?.(config.logPrefix + " " + message);
  };
  installStatusRoute(ctx, config, warn);
  writeMountEvidence(warn);
  ctx.logger?.info?.(config.logPrefix + " \u53EA\u8BFB\u6570\u636E\u9762\uFF1AGET %s\uFF08dataRoot=%s\uFF09", config.routePath, expandHome(config.dataRoot));
  console.log("[oblivion-panel] loaded");
}
export {
  VERSION,
  apply,
  expandHome,
  inject,
  name
};
