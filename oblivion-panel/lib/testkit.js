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
    const sources = Array.isArray(item.sources) ? item.sources : [];
    const tags = Array.isArray(item.tags) ? item.tags : [];
    rows.push({
      id: String(item.id ?? name.replace(/\.json$/, "")),
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
      const head = await readNoteHead(path, info.size);
      rows.push({ name, path, mtimeMs: info.mtimeMs, bytes: info.size, ...parseNoteHead(head) });
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

// src/client/format.ts
function percent(ratio2) {
  if (typeof ratio2 !== "number" || !Number.isFinite(ratio2)) return "\u2014";
  return (ratio2 * 100).toFixed(1) + "%";
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
function detailText(row) {
  return detailParts(row).map((part) => part.label + "\uFF1A" + part.text).join(" \xB7 ");
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
  DIGEST_NOTE_DIR,
  KEYWORD_MAX,
  KNOWLEDGE_ITEM_LIMIT,
  PANEL_TAB_ID,
  QA_NOTE_DIR,
  WIKI_MAX,
  WIKI_NOTE_DIR,
  actionLabel,
  buildScoreCurve,
  buildSnapshot,
  curveCaption,
  dateText,
  detailParts,
  detailText,
  formatValue,
  hintLine,
  implLabel,
  itemStatusLabel,
  keywordText,
  knowledgeView,
  mergeKnowledge,
  openNoteInSidebar,
  panelDescriptor,
  parseNoteHead,
  percent,
  reasonLabel,
  registerPanelTab,
  relativeTime,
  scoreText,
  sourceLabel,
  statNumber,
  summarizeDecisions,
  thresholdOf,
  topBlocker,
  wikiText
};
