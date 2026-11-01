// src/index.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join as join3, resolve } from "node:path";

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

// src/kbtree.ts
import { readdir as readdir2, stat as stat2 } from "node:fs/promises";
import { join as join2 } from "node:path";
var DEFAULT_MAX_DEPTH = 4;
var DEFAULT_MAX_ENTRIES_PER_DIR = 100;
var DEFAULT_MAX_NODES = 800;
async function buildKbTree(options) {
  const problems = [];
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntriesPerDir = options.maxEntriesPerDir ?? DEFAULT_MAX_ENTRIES_PER_DIR;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const coreMdRoot = typeof options.coreMdRoot === "string" && options.coreMdRoot !== "" ? options.coreMdRoot : void 0;
  const mdRoot = coreMdRoot ?? options.fallbackMdRoot;
  const mdRootSource = coreMdRoot !== void 0 ? "core" : "fallback";
  const counters = { files: 0, dirs: 0, nodes: 0 };
  let truncated = false;
  async function walk(dirPath, relDir, depth) {
    if (counters.nodes >= maxNodes) {
      truncated = true;
      return [];
    }
    let entries = [];
    try {
      const names = await readdir2(dirPath);
      for (const name2 of names) {
        if (counters.nodes >= maxNodes) {
          truncated = true;
          break;
        }
        let isDir = false;
        try {
          isDir = (await stat2(join2(dirPath, name2))).isDirectory();
        } catch {
          continue;
        }
        entries.push({ name: name2, isDir });
      }
    } catch (error) {
      problems.push(`${dirPath}: ${String(error)}`);
      return [];
    }
    const dirs = entries.filter((e) => e.isDir).map((e) => e.name);
    const files = entries.filter((e) => !e.isDir).map((e) => e.name);
    const overflow = entries.length > maxEntriesPerDir;
    if (overflow) truncated = true;
    const nodeLimit = overflow ? maxEntriesPerDir : entries.length;
    const dirNames = dirs.slice(0, nodeLimit);
    const fileNames = files.slice(0, Math.max(0, nodeLimit - dirNames.length));
    const result = [];
    for (const name2 of dirNames) {
      counters.nodes += 1;
      counters.dirs += 1;
      const relPath = relDir === "" ? name2 : relDir + "/" + name2;
      const children = depth + 1 <= maxDepth && counters.nodes < maxNodes ? await walk(join2(dirPath, name2), relPath, depth + 1) : void 0;
      if (depth + 1 > maxDepth) truncated = true;
      result.push({ name: name2, relPath, kind: "dir", children });
    }
    for (const name2 of fileNames) {
      counters.nodes += 1;
      counters.files += 1;
      const relPath = relDir === "" ? name2 : relDir + "/" + name2;
      result.push({ name: name2, relPath, kind: "file" });
    }
    return result;
  }
  const tree = await walk(mdRoot, "", 0);
  return {
    // 根目录读失败（mdRoot 不存在 / 无权限）：problems 非空，如实报 `ok: false`，
    // 调用方（路由 / UI）据此区分「树是真的空」和「树读不出来」。
    ok: problems.length === 0,
    mdRoot,
    mdRootSource,
    tree,
    truncated,
    fileCount: counters.files,
    dirCount: counters.dirs,
    problems
  };
}
async function readCoreMdRoot(dataRoot) {
  try {
    const { readFile: readFile2 } = await import("node:fs/promises");
    const text = await readFile2(join2(dataRoot, "status.json"), "utf8");
    if (text.length > 256 * 1024) return void 0;
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && "mdRoot" in parsed) {
      const mdRoot = parsed.mdRoot;
      return typeof mdRoot === "string" && mdRoot !== "" ? mdRoot : void 0;
    }
  } catch {
  }
  return void 0;
}
var MAX_KB_FILE_BYTES = 512 * 1024;
async function readKbFile(mdRoot, relPath, coreMdRoot) {
  const clean = typeof relPath === "string" ? relPath.replace(/\\/g, "/") : "";
  if (clean === "" || clean.startsWith("/")) {
    return { ok: false, relPath: clean, error: "\u975E\u6CD5\u8DEF\u5F84\uFF1A\u5FC5\u987B\u662F\u975E\u7A7A\u76F8\u5BF9\u8DEF\u5F84" };
  }
  const segments = clean.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return { ok: false, relPath: clean, error: "\u975E\u6CD5\u8DEF\u5F84\uFF1A\u542B `..` \u6216\u7A7A\u6BB5" };
  }
  const root = (typeof coreMdRoot === "string" && coreMdRoot !== "" ? coreMdRoot : mdRoot).replace(/\\/g, "/");
  const absPath = segments.length === 1 ? join2(root, segments[0]) : segments.map((s, i) => join2(root, segments.slice(0, i + 1).join("/"))).pop();
  try {
    const { readFile: readFile2, stat: stat3 } = await import("node:fs/promises");
    const st = await stat3(absPath);
    if (!st.isFile()) {
      return { ok: false, relPath: clean, error: "\u4E0D\u662F\u6587\u4EF6" };
    }
    const truncated = st.size > MAX_KB_FILE_BYTES;
    const text = await readFile2(absPath, "utf8");
    const content = truncated ? text.slice(0, MAX_KB_FILE_BYTES) : text;
    return { ok: true, relPath: clean, content, truncated: truncated || void 0 };
  } catch (error) {
    return { ok: false, relPath: clean, error: String(error) };
  }
}
var MAX_KB_WRITE_BYTES = 512 * 1024;
async function writeKbFile(mdRoot, relPath, content, coreMdRoot) {
  const clean = typeof relPath === "string" ? relPath.replace(/\\/g, "/") : "";
  if (clean === "" || clean.startsWith("/")) {
    return { ok: false, relPath: clean, error: "\u975E\u6CD5\u8DEF\u5F84\uFF1A\u5FC5\u987B\u662F\u975E\u7A7A\u76F8\u5BF9\u8DEF\u5F84" };
  }
  const segments = clean.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return { ok: false, relPath: clean, error: "\u975E\u6CD5\u8DEF\u5F84\uFF1A\u542B `..` \u6216\u7A7A\u6BB5" };
  }
  if (typeof content !== "string") {
    return { ok: false, relPath: clean, error: "content \u5FC5\u987B\u4E3A\u5B57\u7B26\u4E32" };
  }
  const utf8Bytes = new TextEncoder().encode(content).length;
  if (utf8Bytes > MAX_KB_WRITE_BYTES) {
    return { ok: false, relPath: clean, error: "\u5185\u5BB9\u8D85\u8FC7 512 KB \u4E0A\u9650\uFF0C\u62D2\u7EDD\u5199\u5165" };
  }
  const root = (typeof coreMdRoot === "string" && coreMdRoot !== "" ? coreMdRoot : mdRoot).replace(/\\/g, "/");
  const absPath = segments.length === 1 ? join2(root, segments[0]) : segments.map((s, i) => join2(root, segments.slice(0, i + 1).join("/"))).pop();
  try {
    const { writeFile, stat: stat3 } = await import("node:fs/promises");
    const st = await stat3(absPath);
    if (!st.isFile()) {
      return { ok: false, relPath: clean, error: "\u76EE\u6807\u4E0D\u662F\u6587\u4EF6\uFF0C\u62D2\u7EDD\u5199\u5165" };
    }
    await writeFile(absPath, content, "utf8");
    return { ok: true, relPath: clean, bytesWritten: utf8Bytes };
  } catch (error) {
    return { ok: false, relPath: clean, error: String(error) };
  }
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
  /**
   * 兜底知识库位置 —— 只在 core 的 `status.json` 读不到（或里面没有 `mdRoot`）时用。
   *
   * 默认值与 core 的 `config.mdRoot` **保持一致**（2026-10-17 起是 `~/OblivionKB`）；
   * 本机既有知识库 `C:/Library/那些渐渐被遗忘` 同样由 profile 用户层覆盖。
   * 用 `~/` 写法，所以下面组装 snapshot 时要过 `expandHome()`（面板不假设调用方已展开）。
   */
  fallbackMdRoot: "~/OblivionKB",
  recentLimit: 10,
  routePath: "/oblivion-panel/status",
  diagPath: "/oblivion-panel/diag",
  /** 知识库目录树路由路径。 */
  kbTreePath: "/oblivion-panel/kb-tree",
  /** 知识库文件内容路由路径。 */
  kbFilePath: "/oblivion-panel/kb-file",
  logPrefix: "[oblivion-panel]"
};
async function writeJsonAtomic(path, value) {
  const { mkdir, rename, writeFile } = await import("node:fs/promises");
  await mkdir(dirname(path), { recursive: true });
  const tmp = join3(dirname(path), "." + process.pid + "-" + Date.now().toString(36) + ".tmp");
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
  if (value.startsWith("~/") || value.startsWith("~\\")) return join3(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}
function asConfig(raw) {
  return { ...DEFAULT_CONFIG, ...raw ?? {} };
}
function writeMountEvidence(warn) {
  try {
    const dir = process.env.OBLIVION_PANEL_EVIDENCE_DIR || join3(process.env.TEMP || process.env.TMP || ".", "oblivion-panel");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join3(dir, "host-mount.json"),
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
          // `~/…` 写法要在这里展开：面板不假设 config 里的路径已经展开过。
          fallbackMdRoot: expandHome(config.fallbackMdRoot)
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
      path: config.kbTreePath,
      handler: (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        void readCoreMdRoot(dataRoot).then(async (coreMdRoot) => {
          const tree = await buildKbTree({
            coreMdRoot,
            fallbackMdRoot: expandHome(config.fallbackMdRoot)
          });
          response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
          response.end(JSON.stringify({ ...tree, panelVersion: VERSION }));
        }).catch((error) => {
          warn(`\u77E5\u8BC6\u5E93\u76EE\u5F55\u6811\u88C5\u914D\u5931\u8D25\uFF1A${String(error)}`);
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "kb-tree failed" }));
        });
      }
    });
    server.register({
      kind: "exact",
      path: config.kbFilePath,
      handler: (request, response) => {
        if (request.method === "POST") {
          void readBody(request).then(async ({ body, overflow }) => {
            if (overflow) {
              response.writeHead(413, { "content-type": "application/json" });
              response.end(JSON.stringify({ ok: false, error: "body too large" }));
              return;
            }
            const parsed = safeParse(body);
            const file = typeof parsed.file === "string" ? parsed.file : "";
            const content = typeof parsed.content === "string" ? parsed.content : "";
            const coreMdRoot = await readCoreMdRoot(dataRoot);
            const result = await writeKbFile(expandHome(config.fallbackMdRoot), file, content, coreMdRoot);
            response.writeHead(result.ok ? 200 : 404, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store"
            });
            response.end(JSON.stringify({ ...result, panelVersion: VERSION }));
          }).catch((error) => {
            warn(`\u77E5\u8BC6\u5E93\u6587\u4EF6\u5199\u5165\u5931\u8D25\uFF1A${String(error)}`);
            response.writeHead(500, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: false, error: "kb-file write failed" }));
          });
          return;
        }
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET, POST", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        const url = new URL(request.url ?? "/", "http://localhost");
        const relPath = url.searchParams.get("file") ?? "";
        void readCoreMdRoot(dataRoot).then(async (coreMdRoot) => {
          const result = await readKbFile(
            expandHome(config.fallbackMdRoot),
            relPath,
            coreMdRoot
          );
          response.writeHead(result.ok ? 200 : 404, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
          });
          response.end(JSON.stringify({ ...result, panelVersion: VERSION }));
        }).catch((error) => {
          warn(`\u77E5\u8BC6\u5E93\u6587\u4EF6\u8BFB\u53D6\u5931\u8D25\uFF1A${String(error)}`);
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "kb-file failed" }));
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
          const target = join3(dataRoot, "panel-client-diag.json");
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
