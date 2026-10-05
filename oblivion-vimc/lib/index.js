// src/index.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
var EVIDENCE_DIR = process.env.OBLIVION_VIMC_EVIDENCE_DIR?.trim() || join(tmpdir(), "oblivion-vimc");
var BEAT_PATH = "/oblivion-vimc/beat";
var MAX_BODY_BYTES = 8192;
var EVIDENCE_FLUSH_MS = 750;
var summary = { count: 0, commands: {} };
function writeEvidence(file, payload) {
  try {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const path = join(EVIDENCE_DIR, file);
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}
`, "utf8");
    return path;
  } catch {
    return null;
  }
}
function isTrustedCaller(request) {
  const origin = request.headers.origin;
  if (origin === void 0 || origin === "") return true;
  if (origin === "null" || origin.startsWith("dsh-app://")) return true;
  try {
    const url = new URL(origin);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1";
  } catch {
    return false;
  }
}
function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let overflow = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve({ body: overflow ? "" : Buffer.concat(chunks).toString("utf8"), overflow });
    });
    request.on("error", () => {
      resolve({ body: "", overflow: false });
    });
  });
}
function recordBeat(payload) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const command = typeof payload.command === "string" ? payload.command : "unknown";
  summary.count += 1;
  summary.firstSeenAt ??= now;
  summary.lastSeenAt = now;
  summary.lastCommand = command;
  summary.commands[command] = (summary.commands[command] ?? 0) + 1;
  if (typeof payload.userAgent === "string" && payload.userAgent !== "") summary.userAgent = payload.userAgent;
  if (typeof payload.version === "string" && payload.version !== "") summary.clientVersion = payload.version;
  if (payload.config !== void 0) summary.config = payload.config;
  if (payload.probe !== void 0) summary.probe = payload.probe;
  if (payload.perf !== void 0) summary.perf = payload.perf;
  summary.lastPayload = payload;
  scheduleEvidenceFlush();
  return summary;
}
var flushTimer = null;
function scheduleEvidenceFlush() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    writeEvidence("client-beat.json", {
      plugin: "@oblivion/vimc",
      hostVersion: "0.2.8",
      hostPid: process.pid,
      ...summary
    });
  }, EVIDENCE_FLUSH_MS);
  flushTimer.unref?.();
}
function installBeatRoute(ctx, warn) {
  if (typeof ctx.inject !== "function") {
    warn("\u4E0A\u4E0B\u6587\u6CA1\u6709 inject\uFF1A\u8BCA\u65AD\u8DEF\u7531\u672A\u6302\u8F7D\uFF08\u6D4F\u89C8\u5668\u534A\u8FB9\u4ECD\u4F1A\u88C5\u6309\u952E\u5F15\u64CE\uFF09");
    return;
  }
  ctx.inject(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF1A\u8BCA\u65AD\u8DEF\u7531\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: BEAT_PATH,
      handler: (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        if (!isTrustedCaller(request)) {
          response.writeHead(403, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "untrusted origin" }));
          return;
        }
        void readBody(request).then(({ body, overflow }) => {
          if (overflow) {
            response.writeHead(413, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: false, error: "body too large" }));
            return;
          }
          let payload = {};
          try {
            const parsed = body === "" ? {} : JSON.parse(body);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
              payload = parsed;
            }
          } catch {
            response.writeHead(400, { "content-type": "application/json" });
            response.end(JSON.stringify({ ok: false, error: "invalid json" }));
            return;
          }
          const recorded = recordBeat(payload);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true, count: recorded.count }));
        });
      }
    });
    ctx.effect?.(() => dispose, "oblivion-vimc: \u8BCA\u65AD\u8DEF\u7531");
    ctx.logger?.("@oblivion/vimc").info(`\u8BCA\u65AD\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1APOST ${BEAT_PATH}`);
  });
}
function apply(ctx) {
  console.log("[oblivion-vimc] loaded");
  const logger = ctx.logger?.("@oblivion/vimc");
  const warn = (message) => {
    logger?.warn(message);
  };
  writeEvidence("host-mount.json", {
    plugin: "@oblivion/vimc",
    version: "0.2.8",
    // 载入的模块 URL：用于回答「现在跑的是不是最新构建」（Host 可能按修订号
    // 追加查询串，或复用 ESM 缓存里的旧模块 —— 见 README「迭代」节）。
    moduleUrl: import.meta.url,
    pid: process.pid,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    mountedAt: (/* @__PURE__ */ new Date()).toISOString(),
    evidenceDir: EVIDENCE_DIR,
    beatPath: BEAT_PATH
  });
  ctx.effect?.(() => () => {
    writeEvidence("host-unmount.json", {
      plugin: "@oblivion/vimc",
      version: "0.2.8",
      pid: process.pid,
      unmountedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }, "oblivion-vimc: \u5378\u8F7D\u81EA\u8BC1");
  try {
    ctx.provide?.("oblivionVimc", {
      version: "0.2.8",
      describe: () => "Oblivion \u952E\u76D8\u5BFC\u822A\u63D2\u4EF6\uFF08\u5BBF\u4E3B\u534A\u8FB9\uFF1A\u542F\u52A8\u6807\u8BB0 + \u8BCA\u65AD\u8DEF\u7531\uFF09"
    });
  } catch (error) {
    warn(`provide \u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  installBeatRoute(ctx, warn);
}
export {
  apply
};
