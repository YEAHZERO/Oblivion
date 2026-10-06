// src/index.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";

// src/config.ts
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// src/metrics.ts
var DEFAULT_SERVICE_DAYS = 1095;
var IDLE_WARN_DAYS = 90;
var TOP_N = 5;
var MS_PER_DAY = 864e5;
var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function roundMoney(value) {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const scaled = Number((Math.abs(value) * 100).toFixed(9));
  return sign * Math.round(scaled) / 100;
}
function parseDay(value) {
  if (typeof value !== "string") return null;
  const matched = DAY_RE.exec(value.trim());
  if (matched === null) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at.getTime();
}
function startOfDay(at) {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function todayStart(now = Date.now()) {
  return startOfDay(now);
}
function formatDay(at) {
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}
function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / MS_PER_DAY);
}
function safeSum(values) {
  let total = 0;
  for (const value of values) {
    if (Number.isFinite(value)) total += value;
  }
  return total;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function deriveItem(item, today, options = {}) {
  const idleWarnDays = options.idleWarnDays ?? IDLE_WARN_DAYS;
  const boughtAt = parseDay(item.buyDate) ?? today;
  const soldAt = item.soldDate === null || item.soldDate === "" ? null : parseDay(item.soldDate);
  const endAt = soldAt ?? today;
  const holdingDays = Math.max(1, daysBetween(boughtAt, endAt) + 1);
  const buyPrice = Number.isFinite(item.buyPrice) ? item.buyPrice : 0;
  const recovered = soldAt !== null ? Number.isFinite(item.soldPrice ?? NaN) ? Number(item.soldPrice) : 0 : 0;
  const dailyCost = roundMoney((buyPrice - recovered) / holdingDays);
  const serviceDaysTarget = Number.isFinite(item.serviceDaysTarget ?? NaN) && Number(item.serviceDaysTarget) > 0 ? Number(item.serviceDaysTarget) : DEFAULT_SERVICE_DAYS;
  const usageRatio = holdingDays / serviceDaysTarget;
  const usageProgress = clamp(usageRatio, 0, 1);
  const overdueDays = Math.max(0, holdingDays - serviceDaysTarget);
  const retentionRate = soldAt !== null && buyPrice > 0 ? recovered / buyPrice : null;
  const lastUsedAt = item.lastUsedAt === null || item.lastUsedAt === "" ? boughtAt : parseDay(item.lastUsedAt) ?? boughtAt;
  const idleDays = Math.max(0, daysBetween(lastUsedAt, today));
  const status = soldAt !== null ? "sold" : idleDays >= idleWarnDays ? "idle" : "serving";
  return {
    holdingDays,
    recovered,
    dailyCost,
    serviceDaysTarget,
    usageProgress,
    usageRatio,
    overdueDays,
    retentionRate,
    idleDays,
    status,
    soldDelta: soldAt !== null ? recovered - buyPrice : null
  };
}
function rowOf(item, today, options = {}) {
  return { ...item, derived: deriveItem(item, today, options) };
}
function summarize(rows, options = {}) {
  const top = Math.max(0, Math.floor(options.top ?? TOP_N));
  const serving = rows.filter((row) => row.derived.status === "serving");
  const idle = rows.filter((row) => row.derived.status === "idle");
  const sold = rows.filter((row) => row.derived.status === "sold");
  const inService = rows.filter((row) => row.derived.status !== "sold");
  const inServiceValue = safeSum(inService.map((row) => row.buyPrice));
  const soldValue = safeSum(sold.map((row) => row.derived.recovered));
  const soldCost = safeSum(sold.map((row) => row.buyPrice));
  const categories = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const category = row.category === null || String(row.category).trim() === "" ? "\u5176\u4ED6" : String(row.category).trim();
    const bucket = categories.get(category) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += row.derived.status === "sold" ? row.derived.recovered : row.buyPrice;
    categories.set(category, bucket);
  }
  return {
    count: rows.length,
    servingCount: serving.length,
    idleCount: idle.length,
    soldCount: sold.length,
    servingValue: roundMoney(inServiceValue),
    soldValue: roundMoney(soldValue),
    netSpend: roundMoney(inServiceValue + soldCost - soldValue),
    dailyTotal: roundMoney(safeSum(inService.map((row) => row.derived.dailyCost))),
    idleBurn: roundMoney(safeSum(idle.map((row) => row.derived.dailyCost))),
    soldPnl: roundMoney(safeSum(sold.map((row) => row.derived.soldDelta ?? 0))),
    retentionRate: soldCost > 0 ? soldValue / soldCost : null,
    overdueCount: rows.filter((row) => row.derived.overdueDays > 0).length,
    statusMix: ["serving", "idle", "sold"].map((status) => {
      const list = rows.filter((row) => row.derived.status === status);
      return {
        status,
        count: list.length,
        value: roundMoney(safeSum(list.map((row) => status === "sold" ? row.derived.recovered : row.buyPrice)))
      };
    }),
    byCategory: [...categories.entries()].map(([category, bucket]) => ({ category, count: bucket.count, value: roundMoney(bucket.value) })).sort((left, right) => right.value - left.value),
    topDaily: [...inService].sort((left, right) => right.derived.dailyCost - left.derived.dailyCost).slice(0, top),
    idleTop: [...idle].sort((left, right) => right.derived.idleDays - left.derived.idleDays).slice(0, top)
  };
}
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function nullableText(value) {
  const raw = text(value);
  return raw === "" ? null : raw;
}
function validateItem(raw, today = Date.now()) {
  const errors = [];
  const source = raw ?? {};
  const name2 = text(source.name);
  if (name2 === "") errors.push("name \u4E0D\u80FD\u4E3A\u7A7A");
  else if (name2.length > 40) errors.push("name \u4E0D\u80FD\u8D85\u8FC7 40 \u5B57");
  const priceRaw = source.buyPrice;
  const priceText = typeof priceRaw === "number" ? null : text(priceRaw);
  const buyPrice = typeof priceRaw === "number" ? priceRaw : priceText === "" ? Number.NaN : Number(priceText);
  if (!Number.isFinite(buyPrice) || buyPrice < 0) errors.push("buyPrice \u5FC5\u987B\u662F\u4E0D\u5C0F\u4E8E 0 \u7684\u6570\u5B57");
  const buyDate = text(source.buyDate);
  if (buyDate === "") errors.push("buyDate \u4E0D\u80FD\u4E3A\u7A7A");
  else if (parseDay(buyDate) === null) errors.push("buyDate \u5FC5\u987B\u662F YYYY-MM-DD");
  const soldDateRaw = nullableText(source.soldDate);
  if (soldDateRaw !== null && parseDay(soldDateRaw) === null) errors.push("soldDate \u5FC5\u987B\u662F YYYY-MM-DD");
  const soldPriceRaw = source.soldPrice;
  const soldPrice = soldPriceRaw === void 0 || soldPriceRaw === null || soldPriceRaw === "" ? null : Number(soldPriceRaw);
  if (soldPrice !== null && (!Number.isFinite(soldPrice) || soldPrice < 0)) errors.push("soldPrice \u5FC5\u987B\u662F\u4E0D\u5C0F\u4E8E 0 \u7684\u6570\u5B57");
  if (soldDateRaw !== null && soldPrice === null) errors.push("\u586B\u4E86 soldDate \u5C31\u8981\u586B soldPrice\uFF08\u5356\u4E86\u591A\u5C11\u94B1\uFF09");
  if (soldDateRaw === null && soldPrice !== null) errors.push("\u586B\u4E86 soldPrice \u5C31\u8981\u586B soldDate\uFF08\u54EA\u5929\u5356\u7684\uFF09");
  const lastUsedRaw = nullableText(source.lastUsedAt);
  if (lastUsedRaw !== null && parseDay(lastUsedRaw) === null) errors.push("lastUsedAt \u5FC5\u987B\u662F YYYY-MM-DD");
  const boughtAt = parseDay(buyDate);
  const soldAt = soldDateRaw === null ? null : parseDay(soldDateRaw);
  const lastUsedAt = lastUsedRaw === null ? null : parseDay(lastUsedRaw);
  const todayAt = startOfDay(today);
  if (boughtAt !== null && soldAt !== null && soldAt < boughtAt) errors.push("soldDate \u4E0D\u80FD\u65E9\u4E8E buyDate");
  if (soldAt !== null && soldAt > todayAt) errors.push("soldDate \u4E0D\u80FD\u662F\u672A\u6765");
  if (boughtAt !== null && boughtAt > todayAt) errors.push("buyDate \u4E0D\u80FD\u662F\u672A\u6765");
  if (lastUsedAt !== null && lastUsedAt > todayAt) errors.push("lastUsedAt \u4E0D\u80FD\u662F\u672A\u6765");
  if (lastUsedAt !== null && boughtAt !== null && lastUsedAt < boughtAt) errors.push("lastUsedAt \u4E0D\u80FD\u65E9\u4E8E buyDate");
  const targetRaw = source.serviceDaysTarget;
  const target = targetRaw === void 0 || targetRaw === null || targetRaw === "" ? null : Number(targetRaw);
  if (target !== null && (!Number.isFinite(target) || target <= 0)) errors.push("serviceDaysTarget \u5FC5\u987B\u662F\u6B63\u6570");
  const useCountRaw = source.useCount;
  const useCount = useCountRaw === void 0 || useCountRaw === null || useCountRaw === "" ? null : Number(useCountRaw);
  if (useCount !== null && (!Number.isFinite(useCount) || useCount < 0)) errors.push("useCount \u5FC5\u987B\u662F\u4E0D\u5C0F\u4E8E 0 \u7684\u6570\u5B57");
  const value = {
    name: name2,
    buyPrice: Number.isFinite(buyPrice) ? roundMoney(Math.max(0, buyPrice)) : 0,
    buyDate,
    category: nullableText(source.category),
    serviceDaysTarget: target,
    soldDate: soldDateRaw,
    soldPrice: soldDateRaw === null ? null : soldPrice,
    lastUsedAt: lastUsedRaw,
    useCount,
    note: nullableText(source.note),
    imagePath: nullableText(source.imagePath)
  };
  return { ok: errors.length === 0, errors, value };
}

// src/config.ts
var DEFAULT_CONFIG = {
  dataFile: "~/.oblivion/daily-life/assets.json",
  idleWarnDays: IDLE_WARN_DAYS,
  statusPath: "/daily-life/status",
  itemsPath: "/daily-life/items",
  maxItems: 2e3,
  logPrefix: "[oblivion-daily-life]"
};
function expandHome(value) {
  if (!value) return homedir();
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}
function asConfig(raw) {
  return { ...DEFAULT_CONFIG, ...raw ?? {} };
}

// src/store.ts
import { mkdir, readFile, rename, unlink, writeFile as nodeWriteFile } from "node:fs/promises";
import { dirname, join as join2 } from "node:path";
var LEDGER_VERSION = 1;
function newItemId(at = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 4).padEnd(2, "0");
  return "dl-" + at.toString(36) + "-" + rand;
}
function isSafeId(id) {
  return typeof id === "string" && /^dl-[a-z0-9]{1,12}-[a-z0-9]{2}$/.test(id);
}
async function writeTextAtomic(path, text2) {
  await mkdir(dirname(path), { recursive: true });
  const stamp = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const tmp = join2(dirname(path), "." + process.pid + "-" + stamp + ".tmp");
  await nodeWriteFile(tmp, text2, "utf8");
  try {
    await rename(tmp, path);
  } catch {
    await unlink(tmp).catch(() => void 0);
    await nodeWriteFile(path, text2, "utf8");
  }
}
function asItem(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw;
  const id = typeof record.id === "string" ? record.id : "";
  const name2 = typeof record.name === "string" ? record.name : "";
  const buyDate = typeof record.buyDate === "string" ? record.buyDate : "";
  if (!isSafeId(id) || name2 === "" || buyDate === "") return null;
  const nullable = (value) => typeof value === "string" && value.trim() !== "" ? value : null;
  const numberOrNull = (value) => Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : null;
  return {
    id,
    name: name2,
    buyPrice: Number.isFinite(Number(record.buyPrice)) ? Number(record.buyPrice) : 0,
    buyDate,
    category: nullable(record.category),
    serviceDaysTarget: numberOrNull(record.serviceDaysTarget),
    soldDate: nullable(record.soldDate),
    soldPrice: numberOrNull(record.soldPrice),
    lastUsedAt: nullable(record.lastUsedAt),
    useCount: numberOrNull(record.useCount),
    note: nullable(record.note),
    imagePath: nullable(record.imagePath),
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : 0,
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0
  };
}
function createLedgerStore(dataFile) {
  return {
    file: dataFile,
    async load() {
      let rawText;
      try {
        rawText = await readFile(dataFile, "utf8");
      } catch {
        return { items: [], loadError: null, skipped: 0 };
      }
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        const keep = dataFile + ".corrupt-" + Date.now().toString(36);
        await rename(dataFile, keep).catch(() => void 0);
        return { items: [], loadError: `${String(error)}\uFF08\u539F\u6587\u4EF6\u5DF2\u7559\u5E95\u4E3A ${keep}\uFF09`, skipped: 0 };
      }
      const list = Array.isArray(parsed) ? parsed : parsed?.items ?? [];
      const items = [];
      let skipped = 0;
      for (const entry of Array.isArray(list) ? list : []) {
        const item = asItem(entry);
        if (item === null) skipped += 1;
        else items.push(item);
      }
      return {
        items: items.sort((left, right) => right.createdAt - left.createdAt),
        loadError: null,
        skipped
      };
    },
    async save(items) {
      const payload = {
        version: LEDGER_VERSION,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        items
      };
      await writeTextAtomic(dataFile, JSON.stringify(payload, null, 2) + "\n");
    }
  };
}
function applyChecked(existing, checked, now = Date.now()) {
  return {
    ...checked,
    id: existing?.id ?? newItemId(now),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
}

// src/index.ts
var name = "@oblivion/daily-life";
var inject = [];
var VERSION = readVersion();
function readVersion() {
  for (const relative of ["../VERSION", "./VERSION", "../../VERSION"]) {
    try {
      const text2 = readFileSync(new URL(relative, import.meta.url), "utf8").trim();
      if (text2 !== "") return text2;
    } catch {
    }
  }
  return "0.0.0";
}
var BODY_LIMIT = 128 * 1024;
function buildState(items, today, options, extra = { dataFile: "" }) {
  const rows = items.map((item) => rowOf(item, today, options));
  return {
    items: rows,
    stats: summarize(rows, options),
    dataFile: extra.dataFile,
    loadError: extra.loadError ?? null,
    skipped: extra.skipped ?? 0
  };
}
async function runAction(store, body, options) {
  const now = options.now ?? Date.now();
  const source = body ?? {};
  const action = typeof source.action === "string" ? source.action : "";
  const today = todayStart(now);
  const { items, loadError, skipped } = await store.load();
  if (action === "remove") {
    const id = typeof source.id === "string" ? source.id : "";
    if (!isSafeId(id)) return { status: 400, payload: { ok: false, error: "invalid id", errors: ["id \u5F62\u72B6\u4E0D\u5BF9"] } };
    const next2 = items.filter((item) => item.id !== id);
    if (next2.length === items.length) return { status: 404, payload: { ok: false, error: "not found" } };
    await store.save(next2);
    return { status: 200, payload: { ok: true, removed: id, count: next2.length } };
  }
  if (action === "use") {
    const id = typeof source.id === "string" ? source.id : "";
    const existing2 = items.find((item) => item.id === id);
    if (existing2 === void 0) return { status: 404, payload: { ok: false, error: "not found" } };
    const usedAt = typeof source.lastUsedAt === "string" && source.lastUsedAt.trim() !== "" ? source.lastUsedAt.trim() : formatDay(now);
    const checked2 = validateItem({ ...existing2, lastUsedAt: usedAt }, now);
    if (!checked2.ok) return { status: 400, payload: { ok: false, error: "invalid fields", errors: checked2.errors } };
    const next2 = applyChecked(existing2, { ...checked2.value, useCount: (existing2.useCount ?? 0) + 1 }, now);
    await store.save(items.map((item) => item.id === id ? next2 : item));
    return { status: 200, payload: { ok: true, item: rowOf(next2, today, options) } };
  }
  if (action !== "add" && action !== "update" && action !== "sell") {
    return {
      status: 400,
      payload: { ok: false, error: "unknown action", allowed: ["add", "update", "sell", "use", "remove"] }
    };
  }
  const incoming = source.item ?? {};
  let existing;
  if (action === "add") {
    if (Object.keys(incoming).length === 0) {
      return { status: 400, payload: { ok: false, error: "missing item", errors: ["add \u8981\u5E26 item"] } };
    }
  } else {
    const id = typeof incoming.id === "string" ? incoming.id : typeof source.id === "string" ? source.id : "";
    existing = items.find((item) => item.id === id);
    if (existing === void 0) return { status: 404, payload: { ok: false, error: "not found" } };
  }
  const merged = existing === void 0 ? { ...incoming } : { ...existing, ...incoming };
  if (action === "sell") {
    if (typeof merged.soldDate !== "string" || merged.soldDate.trim() === "") merged.soldDate = formatDay(now);
    merged.soldPrice = merged.soldPrice ?? incoming.soldPrice;
  }
  const checked = validateItem(merged, now);
  if (!checked.ok) return { status: 400, payload: { ok: false, error: "invalid fields", errors: checked.errors } };
  if (action === "add" && items.length >= options.maxItems) {
    return { status: 409, payload: { ok: false, error: "ledger is full", maxItems: options.maxItems } };
  }
  const next = applyChecked(existing, checked.value, now);
  const list = existing === void 0 ? [next, ...items] : items.map((item) => item.id === next.id ? next : item);
  await store.save(list);
  return {
    status: 200,
    payload: { ok: true, item: rowOf(next, today, options), count: list.length, loadError, skipped }
  };
}
function readBody(request, limit = BODY_LIMIT) {
  return new Promise((resolvePromise) => {
    let body = "";
    let overflow = false;
    request.on("data", (chunk) => {
      if (overflow) return;
      body += chunk.toString("utf8");
      if (body.length > limit) overflow = true;
    });
    request.on("end", () => resolvePromise({ body, overflow }));
    request.on("error", () => resolvePromise({ body: "", overflow: false }));
  });
}
function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}
function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (origin === void 0 || origin === "") return true;
  const host = request.headers.host;
  if (host === void 0 || host === "") return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function installRoutes(ctx, config, warn) {
  if (typeof ctx.inject !== "function") {
    warn("\u4E0A\u4E0B\u6587\u6CA1\u6709 inject\uFF1A\u8BFB\u5199\u6570\u636E\u9762\u672A\u6302\u8F7D\uFF08\u6D4F\u89C8\u5668\u534A\u8FB9\u4ECD\u4F1A\u5C1D\u8BD5\u6CE8\u518C tab\uFF09");
    return;
  }
  ctx.inject(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF1A\u8BFB\u5199\u6570\u636E\u9762\u672A\u6302\u8F7D");
      return;
    }
    const dataFile = expandHome(config.dataFile);
    const store = createLedgerStore(dataFile);
    const options = { idleWarnDays: config.idleWarnDays, maxItems: config.maxItems };
    server.register({
      kind: "exact",
      path: config.statusPath,
      handler: (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: "cross-origin forbidden" });
          return;
        }
        void store.load().then(({ items, loadError, skipped }) => {
          const now = Date.now();
          const state = buildState(items, todayStart(now), options, { dataFile, loadError, skipped });
          sendJson(response, 200, {
            ok: true,
            plugin: name,
            version: VERSION,
            generatedAt: new Date(now).toISOString(),
            ...state
          });
        }).catch((error) => {
          warn(`\u72B6\u6001\u88C5\u914D\u5931\u8D25\uFF1A${String(error)}`);
          sendJson(response, 500, { ok: false, error: "internal error" });
        });
      }
    });
    server.register({
      kind: "exact",
      path: config.itemsPath,
      handler: (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST", "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "method not allowed" }));
          return;
        }
        if (!isSameOrigin(request)) {
          sendJson(response, 403, { ok: false, error: "cross-origin forbidden" });
          return;
        }
        void readBody(request).then(async ({ body, overflow }) => {
          if (overflow) {
            sendJson(response, 413, { ok: false, error: "body too large" });
            return;
          }
          let parsed;
          try {
            parsed = JSON.parse(body === "" ? "{}" : body);
          } catch {
            sendJson(response, 400, { ok: false, error: "invalid json" });
            return;
          }
          const result = await runAction(store, parsed, options);
          sendJson(response, result.status, result.payload);
        }).catch((error) => {
          warn(`\u52A8\u4F5C\u6267\u884C\u5931\u8D25\uFF1A${String(error)}`);
          sendJson(response, 500, { ok: false, error: "internal error" });
        });
      }
    });
    ctx.logger?.info?.(config.logPrefix + " \u6570\u636E\u9762\uFF1AGET %s\uFF08\u8BFB\uFF09/ POST %s\uFF08\u5199\uFF09\uFF0C\u8D26\u672C=%s", config.statusPath, config.itemsPath, dataFile);
  });
}
function writeMountEvidence(warn) {
  try {
    const dir = process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR || join3(process.env.TEMP || process.env.TMP || ".", "oblivion-daily-life");
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
function apply(rawCtx, rawConfig) {
  const ctx = rawCtx;
  const config = asConfig(rawConfig);
  const warn = (message) => {
    ctx.logger?.warn?.(config.logPrefix + " " + message);
  };
  installRoutes(ctx, config, warn);
  writeMountEvidence(warn);
  console.log("[oblivion-daily-life] loaded");
}
export {
  VERSION,
  apply,
  buildState,
  inject,
  isSameOrigin,
  name,
  runAction
};
