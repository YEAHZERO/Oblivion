// src/index.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join as join2, resolve } from "node:path";

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
    rows.push({
      id: String(item.id ?? name2.replace(/\.json$/, "")),
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
      rows.push({ name: name2, path, mtimeMs: info.mtimeMs, bytes: info.size });
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
