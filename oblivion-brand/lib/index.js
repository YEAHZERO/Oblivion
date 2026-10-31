// oblivion-brand/src/index.ts
import { spawn as spawn2, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync as existsSync2, readFileSync as readFileSync2, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir as homedir3, tmpdir as tmpdir2 } from "node:os";
import { basename as basename2, dirname, join as join4 } from "node:path";

// oblivion-brand/src/orphans.ts
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
var ORPHAN_SCRIPT_PATH = join(tmpdir(), "obl-brand-orphans.ps1");
var MOUNT_SWEEP_ENV = "OBLIVION_BRAND_ORPHAN_SWEEP";
function mountSweepDisabled(env = process.env) {
  const raw = (env[MOUNT_SWEEP_ENV] ?? "").trim().toLowerCase();
  return raw === "off" || raw === "0" || raw === "false" || raw === "no";
}
function resolveTransportProfileDir(env = process.env, homeDir = homedir()) {
  const configured = (env["DSH_HOME"] ?? "").trim();
  const home = configured === "" ? join(homeDir, ".dsh") : configured;
  return join(home, "web-login", "transport-profile");
}
var ORPHAN_SCRIPT = String.raw`
param(
  [ValidateSet('orphans', 'all')][string]$Mode = 'orphans',
  [Parameter(Mandatory = $true)][string]$ProfileDir,
  [string]$LogPath = ''
)
$ErrorActionPreference = 'Continue'

function Write-Line([string]$message) {
  if ($LogPath -eq '') { return }
  try {
    '{0} orphan-sweep {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message |
      Out-File -LiteralPath $LogPath -Append -Encoding utf8
  } catch { }
}

function Write-Report([string]$mode, [int]$scanned, [int]$matched, [object[]]$killed, [object[]]$failed, [bool]$ok) {
  $killList = @($killed | ForEach-Object { [int]$_ }) -join ','
  $failList = @($failed | ForEach-Object { [int]$_ }) -join ','
  $flag = 'false'
  if ($ok) { $flag = 'true' }
  [Console]::Out.WriteLine(
    '{"ok":' + $flag + ',"mode":"' + $mode + '","scanned":' + $scanned +
    ',"matched":' + $matched + ',"killed":[' + $killList + '],"failed":[' + $failList + ']}'
  )
}

$scanned = 0
$matched = 0
$killed = @()
$failed = @()
$ok = $true

try {
  $procs = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CommandLine, ExecutablePath
  $live = @{}
  foreach ($p in $procs) { $live[[int]$p.ProcessId] = $true }

  $needleLower = $ProfileDir.ToLowerInvariant()
  $needleAlt = $needleLower -replace '\\', '/'

  $matchedMap = @{}
  foreach ($p in $procs) {
    $scanned++
    $cmd = $p.CommandLine
    if (-not $cmd) { continue }
    $exe = ''
    if ($p.ExecutablePath) { $exe = Split-Path $p.ExecutablePath -Leaf }
    if ($exe -notmatch '^msedge(w)?(\.exe)?$') { continue }
    $cmdLower = $cmd.ToLowerInvariant()
    if (-not ($cmdLower.Contains($needleLower) -or $cmdLower.Contains($needleAlt))) { continue }
    $matchedMap[[int]$p.ProcessId] = [int]$p.ParentProcessId
  }

  # Seed: which matched processes are doomed?
  #   all     -> every match (the caller is about to hard-kill the host anyway)
  #   orphans -> only the ones whose parent is already gone
  $doomed = @{}
  foreach ($key in @($matchedMap.Keys)) {
    $child = [int]$key
    if ($Mode -eq 'all') { $doomed[$child] = $true; continue }
    $parent = [int]$matchedMap[$child]
    if ($parent -le 0) { continue }
    if (-not $live.ContainsKey($parent)) { $doomed[$child] = $true }
  }

  # Grow the set over ALL processes, not just the matched ones: msedge children
  # hang off the browser process (not off DSH), and a child that does not carry
  # the --user-data-dir flag would otherwise be left behind as a NEW orphan by
  # the very kill we just did. Killing a parent without its children is how you
  # manufacture the bug this script exists to remove.
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($p in $procs) {
      $child = [int]$p.ProcessId
      if ($doomed.ContainsKey($child)) { continue }
      $parent = [int]$p.ParentProcessId
      if ($parent -le 0) { continue }
      if ($doomed.ContainsKey($parent)) { $doomed[$child] = $true; $changed = $true }
    }
  }

  $matched = $matchedMap.Count
  foreach ($key in @($doomed.Keys)) {
    $target = [int]$key
    # Already gone? Then it is not a failure. Killing the browser makes its
    # renderers exit on their own, so a strict "Stop-Process threw => failed"
    # would report a pile of fake failures for the very processes we killed.
    if (-not (Get-Process -Id $target -ErrorAction SilentlyContinue)) {
      $killed += $target
      continue
    }
    try {
      Stop-Process -Id $target -Force -ErrorAction Stop
      $killed += $target
    } catch {
      # Race: it exited between the check and the kill.
      if (Get-Process -Id $target -ErrorAction SilentlyContinue) {
        $failed += $target
      } else {
        $killed += $target
      }
    }
  }

  Write-Line ("mode={0} scanned={1} matched={2} killed={3} failed={4}" -f $Mode, $scanned, $matched, $killed.Count, $failed.Count)
} catch {
  $ok = $false
  Write-Line ("query failed: {0}" -f $_.Exception.Message)
  [Console]::Error.WriteLine($_.Exception.Message)
}

Write-Report $Mode $scanned $matched $killed $failed $ok
`;
function writeOrphanScript() {
  try {
    writeFileSync(ORPHAN_SCRIPT_PATH, `\uFEFF${ORPHAN_SCRIPT}`, "utf8");
    return ORPHAN_SCRIPT_PATH;
  } catch {
    return null;
  }
}
function parseSweepOutput(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = parsed;
  if (raw["ok"] !== true) return null;
  if (raw["mode"] !== "orphans" && raw["mode"] !== "all") return null;
  const numbers = (value) => {
    if (!Array.isArray(value)) return null;
    const out = [];
    for (const item of value) {
      if (typeof item !== "number" || !Number.isInteger(item)) return null;
      out.push(item);
    }
    return out;
  };
  const killed = numbers(raw["killed"]);
  const failed = numbers(raw["failed"]);
  if (killed === null || failed === null) return null;
  if (typeof raw["scanned"] !== "number" || typeof raw["matched"] !== "number") return null;
  return {
    mode: raw["mode"],
    scanned: raw["scanned"],
    matched: raw["matched"],
    killed,
    failed
  };
}
var SWEEP_TIMEOUT_MS = 15e3;
async function sweepTransportOrphans(options) {
  const mode = options.mode ?? "orphans";
  const profileDir = resolveTransportProfileDir(
    options.env ?? process.env,
    options.homeDir ?? homedir()
  );
  const scriptPath = writeOrphanScript();
  if (scriptPath === null) {
    return { ok: false, error: "\u6E05\u626B\u811A\u672C\u5199\u5165\u5931\u8D25" };
  }
  const timeoutMs = options.timeoutMs ?? SWEEP_TIMEOUT_MS;
  return await new Promise((resolve2) => {
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      resolve2(outcome);
    };
    try {
      const child = spawn(
        options.shell,
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-WindowStyle",
          "Hidden",
          "-File",
          scriptPath,
          "-Mode",
          mode,
          "-ProfileDir",
          profileDir
        ],
        // 与重启 helper 同一条实测结论：detached 必须为 false（5.1 需要控制台）。
        { detached: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
        }
        finish({ ok: false, error: `\u6E05\u626B\u811A\u672C\u8D85\u65F6\uFF08${String(timeoutMs)}ms\uFF09` });
      }, timeoutMs);
      child.on("error", (error) => {
        clearTimeout(timer);
        finish({ ok: false, error: error.message });
      });
      child.on("close", () => {
        clearTimeout(timer);
        const report = parseSweepOutput(stdout);
        if (report === null) {
          finish({ ok: false, error: stderr.trim() || "\u6E05\u626B\u811A\u672C\u6CA1\u6709\u8F93\u51FA\u53EF\u89E3\u6790\u7684\u62A5\u544A" });
          return;
        }
        finish({ ok: true, report });
      });
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
function describeSweep(report) {
  const cleaned = report.killed.length === 0 ? "\u65E0\u5B64\u513F\u8FDB\u7A0B" : `\u6E05\u7406 ${String(report.killed.length)} \u4E2A\u5B64\u513F\u8FDB\u7A0B`;
  const failed = report.failed.length > 0 ? `\uFF0C${String(report.failed.length)} \u4E2A\u7ED3\u675F\u5931\u8D25` : "";
  return `${cleaned}\uFF08\u626B\u63CF ${String(report.scanned)} \u4E2A\u8FDB\u7A0B\uFF0C\u547D\u4E2D ${String(report.matched)} \u4E2A\u4F20\u8F93\u8FDB\u7A0B${failed}\uFF09`;
}

// oblivion-brand/src/paths.ts
var RESTART_PATH = "/obl-brand/restart";
var TASKS_PATH = "/obl-brand/tasks";
var PLUGINS_PATH = "/obl-brand/plugins";
var UPDATES_PATH = "/obl-brand/updates";
var UPDATES_APPLY_PATH = "/obl-brand/updates/apply";
var ORPHANS_PATH = "/obl-brand/orphans";
var SESSION_MESSAGE_PATH = "/obl-brand/session/message";
var SESSION_TAIL_PATH = "/obl-brand/session/tail";

// oblivion-brand/src/profile-plugins.ts
import { existsSync, readFileSync } from "node:fs";
import { basename, join as join2, resolve } from "node:path";

// oblivion-brand/src/plugin-list.ts
var SAFE_ARG = /^[A-Za-z0-9@._/+^~-]+$/;
function quoteArg(value) {
  if (value !== "" && SAFE_ARG.test(value)) return value;
  return "'" + value.replace(/'/g, "''") + "'";
}
function restoreCommand(profile, spec) {
  return `dsh plugin --profile ${quoteArg(profile)} add ${quoteArg(spec)}`;
}
function statusLabel(entry) {
  return entry.active ? "\u5DF2\u542F\u7528" : "\u5DF2\u88C5\u672A\u542F\u7528";
}
function layerLabel(layer) {
  if (layer === "bundles") return "\u7EC4\u5408\u5C42";
  if (layer === "bundle-patch") return "\u7EC4\u5408\u5C42\u8865\u4E01";
  if (layer === "user-patch") return "\u7528\u6237\u5C42\u8865\u4E01";
  return "";
}
function asLayer(value, bundled, patched) {
  if (value === "bundles" || value === "bundle-patch" || value === "user-patch" || value === "none") {
    return value;
  }
  if (bundled) return "bundles";
  return patched ? "user-patch" : "none";
}
function totalRestoreScript(payload) {
  return payload.entries.map((entry) => entry.restore).join("\n");
}
function asString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function asEntry(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw;
  const name = asString(record["name"]);
  const spec = asString(record["spec"]);
  const restore = asString(record["restore"]);
  if (name === null || spec === null || restore === null) return null;
  const bundled = record["bundled"] === true;
  const patched = record["patched"] === true;
  const kind = record["kind"] === "link" ? "link" : "npm";
  const version = asString(record["version"]);
  return {
    name,
    spec,
    kind,
    version,
    bundled,
    patched,
    layer: asLayer(record["layer"], bundled, patched),
    active: record["active"] === true || bundled || patched,
    restore
  };
}
function normalizePluginList(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw;
  const profile = asString(record["profile"]);
  if (profile === null) return null;
  const entries = Array.isArray(record["entries"]) ? record["entries"].map(asEntry).filter((entry) => entry !== null) : [];
  const problems = Array.isArray(record["problems"]) ? record["problems"].filter((item) => typeof item === "string") : [];
  return {
    profile,
    profileDir: asString(record["profileDir"]) ?? "",
    generatedAt: typeof record["generatedAt"] === "number" ? record["generatedAt"] : 0,
    entries,
    problems
  };
}

// oblivion-brand/src/profile-plugins.ts
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}
function resolveProfile(env, homeDir) {
  const explicitDir = text(env["DSH_PROFILE_DIR"]);
  const explicitProfile = text(env["DSH_PROFILE"]);
  if (explicitDir !== "") {
    return { profile: explicitProfile !== "" ? explicitProfile : basename(explicitDir), dir: explicitDir };
  }
  const home = text(env["DSH_HOME"]);
  const base = home !== "" ? home : homeDir !== "" ? join2(homeDir, ".dsh") : "";
  if (base === "") return null;
  const profile = explicitProfile !== "" ? explicitProfile : "desktop";
  return { profile, dir: join2(base, "profiles", profile) };
}
function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
function findDependencies(parsed) {
  if (parsed === null || typeof parsed !== "object") return [];
  const dependencies = parsed["dependencies"];
  if (dependencies === null || typeof dependencies !== "object") return [];
  const pairs = [];
  for (const [name, spec] of Object.entries(dependencies)) {
    if (typeof spec === "string") pairs.push([name, spec]);
  }
  return pairs;
}
function findBundles(parsed) {
  if (parsed === null || typeof parsed !== "object") return [];
  const dsh = parsed["dsh"];
  if (dsh === null || typeof dsh !== "object") return [];
  const profile = dsh["profile"];
  if (profile === null || typeof profile !== "object") return [];
  const bundles = profile["bundles"];
  if (!Array.isArray(bundles)) return [];
  return bundles.filter((item) => typeof item === "string");
}
function isBundled(bundles, name) {
  return bundles.some((item) => item === name || item.startsWith(`${name}@`));
}
function bundleNameOf(item) {
  const at = item.lastIndexOf("@");
  return at > 0 ? item.slice(0, at) : item;
}
function bundlePatchOf(dir, name) {
  const pkgDir = join2(dir, "node_modules", name);
  const pkgFile = join2(pkgDir, "package.json");
  if (!existsSync(pkgFile)) return "";
  try {
    const parsed = readJson(pkgFile);
    if (parsed === null || typeof parsed !== "object") return "";
    const dsh = parsed["dsh"];
    if (dsh === null || typeof dsh !== "object") return "";
    const bundle = dsh["bundle"];
    if (bundle === null || typeof bundle !== "object") return "";
    const patch = bundle["patch"];
    if (typeof patch !== "string" || patch === "") return "";
    const file = resolve(pkgDir, patch);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}
function bundleLayerPatch(dir, bundles) {
  return bundles.map((item) => bundlePatchOf(dir, bundleNameOf(item))).join("\n");
}
function installedVersion(dir, name) {
  const file = join2(dir, "node_modules", name, "package.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = readJson(file);
    if (parsed !== null && typeof parsed === "object") {
      const version = parsed["version"];
      if (typeof version === "string" && version !== "") return version;
    }
  } catch {
  }
  return null;
}
function kindOf(spec) {
  return /^(link|file|workspace):/.test(spec) ? "link" : "npm";
}
function readInstalledPlugins(location, at = Date.now()) {
  const problems = [];
  const profileFile = join2(location.dir, "package.json");
  let dependencies = [];
  let bundles = [];
  if (!existsSync(profileFile)) {
    problems.push(`profile \u76EE\u5F55\u91CC\u6CA1\u6709 package.json\uFF1A${profileFile}`);
  } else {
    try {
      const parsed = readJson(profileFile);
      dependencies = findDependencies(parsed);
      bundles = findBundles(parsed);
    } catch (error) {
      problems.push(`package.json \u89E3\u6790\u5931\u8D25\uFF1A${describe(error)}`);
    }
  }
  const patchFile = join2(location.dir, "cordis.patch.yml");
  let userPatch = "";
  if (existsSync(patchFile)) {
    try {
      userPatch = readFileSync(patchFile, "utf8");
    } catch (error) {
      problems.push(`cordis.patch.yml \u8BFB\u4E0D\u5230\uFF1A${describe(error)}`);
    }
  }
  const bundlePatch = bundleLayerPatch(location.dir, bundles);
  const entries = dependencies.map(([name, spec]) => {
    const bundled = isBundled(bundles, name);
    const inUserPatch = userPatch.includes(name);
    const inBundlePatch = bundlePatch.includes(name);
    const layer = bundled ? "bundles" : inUserPatch ? "user-patch" : inBundlePatch ? "bundle-patch" : "none";
    const patched = inUserPatch || inBundlePatch;
    return {
      name,
      spec,
      kind: kindOf(spec),
      version: installedVersion(location.dir, name),
      bundled,
      patched,
      layer,
      active: bundled || patched,
      restore: restoreCommand(location.profile, spec)
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  return {
    profile: location.profile,
    profileDir: location.dir,
    generatedAt: at,
    entries,
    problems
  };
}

// oblivion-brand/src/session-tail.ts
import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";
import { zstdDecompressSync } from "node:zlib";
var DEFAULT_TAIL_LIMIT = 6;
var MAX_TAIL_LIMIT = 50;
var MAX_TAIL_TEXT_CHARS = 2e4;
var TAIL_WINDOW_BYTES = 1 << 20;
var SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
var SESSION_LOG_FILE = "session.v4.jsonl.zstd";
var ZSTD_MAGIC = [40, 181, 47, 253];
function parseTailQuery(params) {
  const sessionId = (params.session ?? "").trim();
  if (sessionId === "") return { ok: false, error: "\u7F3A\u5C11 session \u53C2\u6570" };
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return { ok: false, error: "session \u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u53EA\u5141\u8BB8\u5B57\u6BCD\u6570\u5B57\u4E0E . _ -\uFF09" };
  }
  const raw = (params.limit ?? "").trim();
  if (raw === "") return { ok: true, value: { sessionId, limit: DEFAULT_TAIL_LIMIT } };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TAIL_LIMIT) {
    return { ok: false, error: `limit \u5FC5\u987B\u662F 1..${String(MAX_TAIL_LIMIT)} \u7684\u6574\u6570` };
  }
  return { ok: true, value: { sessionId, limit } };
}
function resolveDshHome(env = process.env, homeDir = homedir2()) {
  const configured = (env["DSH_HOME"] ?? "").trim();
  if (configured !== "") return configured;
  return homeDir === "" ? "" : join3(homeDir, ".dsh");
}
function findSessionFile(sessionsRoot, sessionId, list = readdirSync) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return void 0;
  let entries;
  try {
    entries = list(sessionsRoot);
  } catch {
    return void 0;
  }
  for (const entry of entries) {
    const candidate = join3(sessionsRoot, entry, sessionId, SESSION_LOG_FILE);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
    }
  }
  return void 0;
}
function readTailBytes(path, windowBytes = TAIL_WINDOW_BYTES) {
  const size = statSync(path).size;
  const start = Math.max(0, size - windowBytes);
  const length = size - start;
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    let read = 0;
    while (read < length) {
      const got = readSync(fd, buffer, read, length - read, start + read);
      if (got <= 0) break;
      read += got;
    }
    return { buffer: read === length ? buffer : buffer.subarray(0, read), fileBytes: size };
  } finally {
    closeSync(fd);
  }
}
function decodeFrames(buffer) {
  const cuts = [];
  for (let i = 0; i + 3 < buffer.length; i += 1) {
    if (buffer[i] === ZSTD_MAGIC[0] && buffer[i + 1] === ZSTD_MAGIC[1] && buffer[i + 2] === ZSTD_MAGIC[2] && buffer[i + 3] === ZSTD_MAGIC[3]) {
      cuts.push(i);
    }
  }
  if (cuts.length === 0) return { text: "", frames: 0, brokenFrames: 0 };
  const starts = cuts[0] === 0 ? cuts : [0, ...cuts];
  starts.push(buffer.length);
  const parts = [];
  let frames = 0;
  let brokenFrames = 0;
  for (let index = 0; index + 1 < starts.length; index += 1) {
    const chunk = buffer.subarray(starts[index], starts[index + 1]);
    try {
      parts.push(zstdDecompressSync(chunk).toString("utf8"));
      frames += 1;
    } catch {
      const isEdge = index === 0 || index + 2 === starts.length;
      if (!isEdge) brokenFrames += 1;
    }
  }
  return { text: parts.join(""), frames, brokenFrames };
}
function textOfContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const typed = block;
    if (typed.type !== "text") continue;
    if (typeof typed.text === "string") parts.push(typed.text);
  }
  return parts.join("\n").trim();
}
function extractTailMessages(lines, limit) {
  const out = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof record !== "object" || record === null) continue;
    const typed = record;
    const role = typed.type === "user/message" ? "user" : typed.type === "assistant/message" ? "assistant" : void 0;
    if (role === void 0) continue;
    const raw = role === "user" ? typed.data?.content : typed.data?.message?.content;
    const text2 = textOfContent(raw);
    if (text2 === "") continue;
    const truncated = text2.length > MAX_TAIL_TEXT_CHARS;
    out.push({
      seq: typeof typed.seq === "number" ? typed.seq : -1,
      at: typeof typed.time === "number" ? typed.time : 0,
      role,
      text: truncated ? text2.slice(0, MAX_TAIL_TEXT_CHARS) : text2,
      ...truncated ? { truncated: true } : {}
    });
  }
  return out.slice(-limit);
}
function readSessionTail(sessionsRoot, sessionId, limit, windowBytes = TAIL_WINDOW_BYTES) {
  const file = findSessionFile(sessionsRoot, sessionId);
  if (file === void 0) return void 0;
  const { buffer, fileBytes } = readTailBytes(file, windowBytes);
  const { text: text2, frames, brokenFrames } = decodeFrames(buffer);
  return {
    sessionId,
    messages: extractTailMessages(text2.split("\n"), limit),
    stats: { fileBytes, windowBytes: buffer.length, frames, brokenFrames }
  };
}

// oblivion-brand/src/session-inject.ts
var SESSION_INJECT_ENV = "OBLIVION_BRAND_SESSION_INJECT";
var MAX_SESSION_MESSAGE_CHARS = 2e4;
var MAX_SESSION_MESSAGE_BYTES = 256 * 1024;
function sessionInjectDisabled(env = process.env) {
  const raw = (env[SESSION_INJECT_ENV] ?? "").trim().toLowerCase();
  return raw === "off" || raw === "0" || raw === "false" || raw === "no";
}
function parseSessionMessageRequest(raw, fallbackRequestId) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F\u4E00\u4E2A JSON \u5BF9\u8C61" };
  }
  const record = raw;
  const sessionId = typeof record["sessionId"] === "string" ? record["sessionId"].trim() : "";
  if (sessionId === "") {
    return { ok: false, error: "sessionId \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32" };
  }
  const text2 = typeof record["text"] === "string" ? record["text"] : "";
  if (text2.trim() === "") {
    return { ok: false, error: "text \u5FC5\u987B\u5305\u542B\u975E\u7A7A\u767D\u5B57\u7B26" };
  }
  if (text2.length > MAX_SESSION_MESSAGE_CHARS) {
    return { ok: false, error: `text \u8D85\u8FC7 ${String(MAX_SESSION_MESSAGE_CHARS)} \u5B57\u7B26\u4E0A\u9650` };
  }
  const mode = record["mode"] === void 0 ? "queue" : record["mode"];
  if (mode !== "queue" && mode !== "steer") {
    return { ok: false, error: "mode \u53EA\u80FD\u662F 'queue' \u6216 'steer'" };
  }
  const provided = typeof record["requestId"] === "string" ? record["requestId"].trim() : "";
  const requestId = provided === "" ? fallbackRequestId : provided;
  return { ok: true, value: { requestId, sessionId, mode, content: [{ type: "text", text: text2 }] } };
}
function readRequestBody(source, maxBytes = MAX_SESSION_MESSAGE_BYTES) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    source.on("data", (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buf.length;
      if (size > maxBytes) {
        fail(new Error(`\u8BF7\u6C42\u4F53\u8D85\u8FC7 ${String(maxBytes)} \u5B57\u8282\u4E0A\u9650`));
        return;
      }
      chunks.push(buf);
    });
    source.on("end", () => {
      if (settled) return;
      settled = true;
      resolve2(Buffer.concat(chunks).toString("utf8"));
    });
    source.on("error", (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
function describePromptFailure(error) {
  if (typeof error === "object" && error !== null) {
    const record = error;
    const code = typeof record["code"] === "string" && record["code"] !== "" ? record["code"] : void 0;
    const message = typeof record["message"] === "string" && record["message"] !== "" ? record["message"] : String(error);
    return code === void 0 ? { error: message } : { error: message, code };
  }
  return { error: String(error) };
}
function httpStatusForPromptFailure(code) {
  if (code === "session/not-found") return 404;
  if (code === "gateway/bad-request" || code === "session/invalid-time-zone") return 400;
  return 502;
}

// oblivion-brand/src/index.ts
var SCRIPT_PATH = join4(tmpdir2(), "obl-brand-restart.ps1");
var LOG_PATH = join4(tmpdir2(), "obl-brand-restart.log");
var MARKET_REGISTRY_ENV = "DSHM_NPM_MIRROR";
var MARKET_REGISTRY_MIRROR = "https://registry.npmmirror.com";
var RESTART_SCRIPT = String.raw`
param(
  [Parameter(Mandatory = $true)][int]$HostPid,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [string]$Version = 'unknown',
  [string]$SweepScript = '',
  [string]$ProfileDir = '',
  [switch]$DryRun
)
$ErrorActionPreference = 'Continue'

function Write-Log([string]$message) {
  try {
    '{0} v{1} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Version, $message |
      Out-File -LiteralPath $LogPath -Append -Encoding utf8
  } catch { }
}

# -------------------------------------------------------------------- killer
try {
  Write-Log "helper start: host pid=$HostPid"

  # Walk up from the host to the outermost process that carries the app marker.
  #
  # One full sweep, not one filtered query per level: measured, the sweep costs
  # ~1.0 s while four filtered queries cost ~2.0 s, because every
  # Get-CimInstance call pays a fixed session overhead.
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath
  $byId = @{}
  foreach ($item in $all) { $byId[[int]$item.ProcessId] = $item }

  $target = $null
  $cursor = $HostPid
  for ($depth = 0; $depth -lt 16; $depth++) {
    if (-not $byId.ContainsKey($cursor)) { break }
    $proc = $byId[$cursor]
    Write-Log ("ancestor pid={0} ppid={1} path={2}" -f $proc.ProcessId, $proc.ParentProcessId, $proc.ExecutablePath)

    $exe = $proc.ExecutablePath
    if ($exe) {
      # Only identity proof: resources\app.asar exists next to the executable.
      # No process-name heuristic, so explorer.exe or node.exe can never match.
      $marker = Join-Path (Split-Path -Parent $exe) 'resources\app.asar'
      if (Test-Path -LiteralPath $marker -PathType Leaf) {
        # Keep walking up and take the OUTERMOST match.
        #
        # The DSH host itself is also DeepSeek Harness.exe (ELECTRON_RUN_AS_NODE=1)
        # and shares its executable path with the Electron main process, so depth 0
        # already matches. Stopping at the first match would kill the host child
        # instead of the main process.
        $target = $proc
      }
    }

    $next = [int]$proc.ParentProcessId
    if ($next -le 0 -or $next -eq $cursor) { break }
    $cursor = $next
  }

  if (-not $target) {
    Write-Log 'refused: no ancestor carries the resources\app.asar marker'
    exit 1
  }
  if ($target.ProcessId -eq $PID) {
    Write-Log 'refused: target process is the helper itself'
    exit 1
  }

  $exe = $target.ExecutablePath
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    Write-Log "refused: executable not found $exe"
    exit 1
  }

  Write-Log ("target confirmed: pid={0} exe={1}" -f $target.ProcessId, $exe)

  # Build the relauncher batch. Kept as a file (not an inline command) so the
  # quoting stays readable and the wait loop can use goto.
  #
  # Log lines use %DATE% %TIME% rather than a stamp baked in here: the earlier
  # version froze one timestamp at generation time, so all three lines read the
  # same second and the real elapsed time was impossible to read back.
  $batPath = Join-Path (Split-Path -Parent $LogPath) 'obl-brand-relaunch.cmd'
  $batLines = @(
    '@echo off',
    'setlocal',
    ('set "APP={0}"' -f $exe),
    ('set "IMG={0}"' -f (Split-Path -Leaf $exe)),
    ('set "LOG={0}"' -f $LogPath),
    '>>"%LOG%" echo %DATE% %TIME% relauncher start',
    'set /a N=0',
    ':wait',
    # The timeout command needs a console, so sleep with ping instead.
    'tasklist /FI "IMAGENAME eq %IMG%" 2>nul | find /I "%IMG%" >nul',
    'if errorlevel 1 goto go',
    'set /a N+=1',
    'if %N% GEQ 60 goto go',
    # Poll fast. "ping -n 2 127.0.0.1" took ~1.3 s per round (two echo requests a
    # second apart), which dominated the remaining latency. 192.0.2.0/24 is
    # TEST-NET-1: guaranteed unroutable, so -w 200 actually waits ~200 ms.
    'ping -n 1 -w 200 192.0.2.1 >nul',
    'goto wait',
    ':go',
    '>>"%LOG%" echo %DATE% %TIME% relauncher: previous processes gone',
    # No settle delay: the loop already waited for every process of that image to
    # disappear, which is also when the port and the single-instance lock are free.
    'start "" "%APP%"',
    '>>"%LOG%" echo %DATE% %TIME% relaunched'
  )
  Set-Content -LiteralPath $batPath -Value $batLines -Encoding ASCII
  Write-Log "relauncher batch written: $batPath"

  # Verify-only mode: report the target and stop. Used to prove identification
  # without ending the running application.
  #
  # This gate comes BEFORE the sweep on purpose: a dry run must not destroy
  # anything either -- the sweep kills processes, it is not a read-only step.
  if ($DryRun) {
    Write-Log 'dry run: target identified, batch written, sweep skipped, nothing stopped or armed'
    exit 0
  }

  # Arm the relauncher BEFORE anything slow or destructive.
  #
  # 2026-10-18 order change: the old order was sweep -> arm -> kill. If the host or
  # the app was ended by another path in between (user closed it, tray quit, crash),
  # the helper died with the job object and the relauncher was never armed -- the
  # app closed and never came back (user had to reopen it by hand).
  # Now the relauncher is armed first (a WMI-created cmd lives outside the job),
  # then the sweep runs, then the kill lands.
  #
  # Measured: this helper dies together with the Electron main process (they share
  # a job object), so an in-process "stop, wait, Start-Process" never reaches its
  # last step. A process created through WMI has the WMI provider host as its
  # parent, so it is OUTSIDE that job and survives. It must be cmd.exe, not
  # PowerShell: Windows PowerShell 5.1 needs a console, and a WMI-created process
  # has none. Win32_ProcessStartup with ShowWindow = 0 hides the console.
  try {
    $startup = ([wmiclass]'Win32_ProcessStartup').CreateInstance()
    $startup.ShowWindow = 0
    $created = ([wmiclass]'Win32_Process').Create(('cmd.exe /c "{0}"' -f $batPath), (Split-Path -Parent $batPath), $startup)
    Write-Log ("relauncher armed via WMI: returnValue={0} pid={1}" -f $created.ReturnValue, $created.ProcessId)
  } catch {
    Write-Log ("relauncher arm failed: {0}" -f $_)
  }

  # -------------------------------------------------------------------- orphan cleanup
  # Sweep EVERY web-login transport process before the app goes down.
  #
  # Not the same rule as the on-demand sweep (panel button): the app is about to
  # be hard-killed (Stop-Process -Force further down), so the transport processes
  # spawned by the *current* host are healthy this second but are guaranteed to
  # become orphans the moment that lands. Selecting only already-orphaned ones
  # here would leave exactly those behind -- which is the bug this block exists
  # for.
  #
  # The heuristic itself lives in the shared script (obl-brand-orphans.ps1,
  # written by the plugin next to this one) so there is exactly ONE
  # implementation of it. That script must not call exit: it runs inside THIS
  # session.
  if ($SweepScript -ne '' -and $ProfileDir -ne '' -and (Test-Path -LiteralPath $SweepScript -PathType Leaf)) {
    try {
      & $SweepScript -Mode all -ProfileDir $ProfileDir -LogPath $LogPath | Out-Null
      Write-Log 'transport sweep: done (mode=all)'
    } catch {
      Write-Log ("transport sweep failed: {0}" -f $_.Exception.Message)
    }
    # Wait a beat for the OS to release the profile directory before the
    # relauncher brings the app back up.
    Start-Sleep -Milliseconds 500
  } else {
    Write-Log 'transport sweep: script missing, skipped'
  }

  # Let the HTTP 202 reach the browser first, otherwise the page drops the response.
  Start-Sleep -Milliseconds 700

  Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  Write-Log ("stopped pid={0}" -f $target.ProcessId)
} catch {
  Write-Log ("failed: {0}" -f $_)
  exit 1
}
`;
var WATCH_PATH = join4(tmpdir2(), "obl-brand-watch-restart.cmd");
var WATCH_LOCK_PATH = join4(tmpdir2(), "obl-brand-watch-restart.lock");
var ARM_WATCH_PATH = join4(tmpdir2(), "obl-brand-arm-watch.ps1");
var WATCH_CMD = String.raw`@echo off
setlocal
set "APP={APP}"
set "IMG={IMG}"
set "LOG={LOG}"
set "LOCK={LOCK}"
if exist "%LOCK%" exit /b 0
>>"%LOCK%" echo.
>>"%LOG%" echo %DATE:~0,10% %TIME% watcher start
set /a N=0
:wait
tasklist /FI "IMAGENAME eq %IMG%" 2>nul | find /I "%IMG%" >nul
if errorlevel 1 goto relaunch
set /a N+=1
if %N% GEQ 200 goto expired
ping -n 1 -w 100 192.0.2.1 >nul
goto wait
:expired
del "%LOCK%" >nul 2>&1
>>"%LOG%" echo %DATE:~0,10% %TIME% watcher expired: app still running, no relaunch
exit /b 0
:relaunch
del "%LOCK%" >nul 2>&1
>>"%LOG%" echo %DATE:~0,10% %TIME% watcher relaunch
start "" "%APP%"
set /a P=0
:probe
curl -s -o NUL -m 2 http://127.0.0.1:42081/ >nul 2>&1
if not errorlevel 1 goto ready
set /a P+=1
if %P% GEQ 120 goto probe_timeout
ping -n 1 -w 250 192.0.2.1 >nul
goto probe
:ready
set "PIDFILE=%TEMP%\obl-brand-host.pid.tmp"
netstat -ano | findstr ":42081" | findstr LISTENING > "%PIDFILE%"
set "HOSTPID="
for /f "usebackq tokens=5" %%p in ("%PIDFILE%") do set "HOSTPID=%%p"
del "%PIDFILE%" >nul 2>&1
>>"%LOG%" echo %DATE:~0,10% %TIME% watcher ready: bridge 42081 up (host pid=%HOSTPID%)
set "WEBPORT="
set "PORTFILE=%TEMP%\obl-brand-host.ports.tmp"
if not "%HOSTPID%"=="" (
  netstat -ano | findstr LISTENING | findstr "%HOSTPID%" > "%PORTFILE%"
  >>"%LOG%" echo %DATE:~0,10% %TIME% watcher host listening ports:
  type "%PORTFILE%" >> "%LOG%" 2>&1
  for /f "usebackq tokens=2" %%q in ("%PORTFILE%") do call :webprobe %%q
  del "%PORTFILE%" >nul 2>&1
)
if not "%WEBPORT%"=="" (
  >>"%LOG%" echo %DATE:~0,10% %TIME% watcher web ready: http://127.0.0.1:%WEBPORT%/
) else (
  >>"%LOG%" echo %DATE:~0,10% %TIME% watcher web not detected
)
exit /b 0

:webprobe
rem %~1 = host:port (e.g. 127.0.0.1:30909); skip bridge 42081, take the first HTTP-answering port.
for /f "tokens=1,2 delims=:" %%a in ("%~1") do set "PCAND=%%b"
if "%PCAND%"=="" goto :eof
if "%PCAND%"=="42081" goto :eof
if not "%WEBPORT%"=="" goto :eof
curl -s -o NUL -m 2 http://127.0.0.1:%PCAND%/ >nul 2>&1
if not errorlevel 1 set "WEBPORT=%PCAND%"
goto :eof

:probe_timeout
>>"%LOG%" echo %DATE:~0,10% %TIME% watcher ready timeout: bridge 42081 not up after 30s
exit /b 0
`;
var ARM_WATCH_SCRIPT = String.raw`param(
  [Parameter(Mandatory = $true)][string]$Cmd
)
$ErrorActionPreference = 'Stop'
# 先清掉还活着的旧守夜人（连点/重复点击时避免两个 watcher 同时拉起）。
try {
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
    Where-Object { $_.CommandLine -like ('*' + $Cmd + '*') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch { }
$startup = ([wmiclass]'Win32_ProcessStartup').CreateInstance()
$startup.ShowWindow = 0
$created = ([wmiclass]'Win32_Process').Create(('cmd.exe /c "{0}"' -f $Cmd), (Split-Path -Parent $Cmd), $startup)
if ($created.ReturnValue -ne 0) { exit 1 }
`;
function armWatcher(exePath) {
  try {
    const image = basename2(exePath);
    const cmd = WATCH_CMD.replace("{APP}", exePath).replace("{IMG}", image).replace("{LOG}", LOG_PATH).replace("{LOCK}", WATCH_LOCK_PATH);
    writeFileSync2(WATCH_PATH, cmd, "ascii");
    writeFileSync2(ARM_WATCH_PATH, `\uFEFF${ARM_WATCH_SCRIPT}`, "utf8");
    const shell = resolvePowerShell();
    if (shell === null) {
      appendLog("watcher arm: no PowerShell");
      return false;
    }
    const run = spawnSync(
      shell,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ARM_WATCH_PATH, "-Cmd", WATCH_PATH],
      { encoding: "utf8", timeout: 15e3 }
    );
    const detail = String(run.stderr ?? "").trim().slice(0, 200);
    appendLog(`watcher arm: exit=${String(run.status)} stderr=${detail}`);
    return run.status === 0;
  } catch (error) {
    appendLog(`watcher arm failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
function isTrustedCaller(request) {
  const origin = request.headers["origin"];
  if (origin === void 0 || origin === "") return true;
  if (typeof origin !== "string") return false;
  if (origin === "dsh-app://app") return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
function pluginVersion() {
  try {
    const text2 = readFileSync2(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(text2);
    return typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    return "unknown";
  }
}
function appendLog(line) {
  try {
    appendFileSync(LOG_PATH, `${(/* @__PURE__ */ new Date()).toISOString()} [host] v${pluginVersion()} ${line}
`, "utf8");
  } catch {
  }
}
function resolvePowerShell() {
  if (process.platform !== "win32") return null;
  const root = process.env["SystemRoot"] ?? process.env["windir"] ?? "C:\\Windows";
  const absolute = join4(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync2(absolute) ? absolute : "powershell.exe";
}
function spawnRestartHelper() {
  try {
    writeFileSync2(SCRIPT_PATH, `\uFEFF${RESTART_SCRIPT}`, "utf8");
  } catch (error) {
    appendLog(`script write failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const sweepScript = writeOrphanScript();
  const profileDir = resolveTransportProfileDir();
  if (sweepScript === null) {
    appendLog("orphan sweep script write failed; helper will skip the sweep");
  }
  const shell = resolvePowerShell();
  if (shell === null) {
    appendLog("no PowerShell on this platform");
    return null;
  }
  appendLog(`spawning helper: shell=${shell} hostPid=${String(process.pid)} script=${SCRIPT_PATH}`);
  try {
    const child = spawn2(
      shell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-File",
        SCRIPT_PATH,
        "-HostPid",
        String(process.pid),
        "-LogPath",
        LOG_PATH,
        "-Version",
        pluginVersion(),
        "-SweepScript",
        sweepScript ?? "",
        "-ProfileDir",
        profileDir
      ],
      // ⚠️ `detached` 必须是 **false**，这是实测隔离出来的结论：
      //
      //   Node 在 Windows 上用 `DETACHED_PROCESS` 实现 detached。而
      //   Windows PowerShell 5.1 **需要控制台**，无控制台时它初始化失败、直接以
      //   退出码 0 结束，**脚本一行都不执行**。现象极具迷惑性：spawn 成功、
      //   子进程创建、退出码 0、日志却一个字节都没有。
      //
      //   实测对照（HostPid 用 explorer，走拒绝分支，不杀任何进程）：
      //     detached: true  + powershell 5.1  → 退出 0，未写日志
      //     detached: false + powershell 5.1  → 退出 1，已写日志 ✅
      //     detached: true  + pwsh 7          → 可用，但 pwsh 只存在于版本化的
      //                                          WindowsApps 路径下且无法枚举
      //                                          （readdir 返回 EPERM），不能依赖
      //
      //   去掉 detached 不会让子进程随父进程消失 —— 已单独实测：父进程退出后
      //   6 秒内心跳仍在继续（Windows 本就不会因父进程结束而终止子进程）。
      { detached: false, stdio: "ignore", windowsHide: true }
    );
    child.on("error", (error) => {
      appendLog(`spawn error: ${error.message}`);
    });
    child.unref();
    return LOG_PATH;
  } catch (error) {
    appendLog(`spawn threw: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
function installRestartRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u91CD\u542F\u529F\u80FD\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: RESTART_PATH,
      handler: async (request, response) => {
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
        try {
          unlinkSync(WATCH_LOCK_PATH);
        } catch {
        }
        if (armWatcher(process.execPath)) {
          response.writeHead(202, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: true, mode: "watcher", logPath: WATCH_PATH }));
          const parent = process.ppid;
          setTimeout(() => {
            try {
              process.kill(parent, "SIGTERM");
            } catch (error) {
              appendLog(`kill parent failed: ${error instanceof Error ? error.message : String(error)}`);
            }
          }, 900);
          return;
        }
        const shell = resolvePowerShell();
        const sweep = shell === null ? { ok: false, error: "no PowerShell on this platform" } : await sweepTransportOrphans({ shell, mode: "orphans" });
        if (sweep.ok) {
          appendLog(`pre-restart sweep: ${describeSweep(sweep.report)}`);
        } else {
          appendLog(`pre-restart sweep failed: ${sweep.error}`);
        }
        const logPath = spawnRestartHelper();
        if (logPath === null) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "restart helper could not start" }));
          return;
        }
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, logPath, sweep }));
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: restart route");
    ctx.logger?.("@oblivion/brand").info(`\u91CD\u542F\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1APOST ${RESTART_PATH}`);
  });
}
function hasActiveTasks(agents, jobs) {
  const agentList = agents?.list?.() ?? [];
  const running = agentList.some((agent) => agent["status"] === "running");
  if (running) return true;
  const jobList = jobs?.list;
  if (jobList === void 0) return false;
  const ids = [void 0, ...agentList.map((agent) => agent["id"])];
  return ids.some(
    (id) => (jobList(id) ?? []).some((job) => job.status === "running" || job.status === "stopping")
  );
}
function installTasksRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u4EFB\u52A1\u67E5\u8BE2\u8DEF\u7531\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: TASKS_PATH,
      handler: async (request, response) => {
        const json = (status, body) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };
        if (request.method !== "GET") {
          json(405, { ok: false, error: "method not allowed" });
          return;
        }
        const agents = ctx.get?.("agents");
        const jobs = ctx.get?.("jobs");
        if (agents === void 0 || jobs === void 0) {
          json(503, { ok: false, active: false, error: "task services unavailable" });
          return;
        }
        try {
          json(200, { ok: true, active: hasActiveTasks(agents, jobs) });
        } catch (error) {
          json(500, {
            ok: false,
            active: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: tasks route");
    ctx.logger?.("@oblivion/brand").info(`\u4EFB\u52A1\u67E5\u8BE2\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1AGET ${TASKS_PATH}`);
  });
}
function installOrphanRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u5B64\u513F\u8FDB\u7A0B\u6E05\u626B\u8DEF\u7531\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: ORPHANS_PATH,
      handler: async (request, response) => {
        const json = (status, body, extra) => {
          response.writeHead(status, { "content-type": "application/json", ...extra });
          response.end(JSON.stringify(body));
        };
        if (request.method !== "POST") {
          json(405, { ok: false, error: "method not allowed" }, { allow: "POST" });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: "untrusted origin" });
          return;
        }
        const shell = resolvePowerShell();
        if (shell === null) {
          json(501, { ok: false, error: "\u672C\u673A\u6CA1\u6709 PowerShell\uFF0C\u65E0\u6CD5\u6E05\u626B" });
          return;
        }
        const outcome = await sweepTransportOrphans({ shell, mode: "orphans" });
        if (!outcome.ok) {
          appendLog(`orphan sweep failed: ${outcome.error}`);
          json(500, { ok: false, error: outcome.error });
          return;
        }
        appendLog(`orphan sweep: ${describeSweep(outcome.report)}`);
        json(200, { ok: true, report: outcome.report, summary: describeSweep(outcome.report) });
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: orphans route");
    ctx.logger?.("@oblivion/brand").info(`\u5B64\u513F\u8FDB\u7A0B\u6E05\u626B\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1APOST ${ORPHANS_PATH}`);
  });
}
function installPluginsRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u5DF2\u5B89\u88C5\u63D2\u4EF6\u6E05\u5355\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: PLUGINS_PATH,
      handler: (request, response) => {
        const json = (status, body, extra) => {
          response.writeHead(status, { "content-type": "application/json", ...extra });
          response.end(JSON.stringify(body));
        };
        if (request.method !== "GET") {
          json(405, { ok: false, error: "method not allowed" }, { allow: "GET" });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: "untrusted origin" });
          return;
        }
        const location = resolveProfile(process.env, homedir3());
        if (location === null) {
          json(500, { ok: false, error: "DSH_PROFILE_DIR \u4E0E DSH_HOME \u90FD\u6CA1\u6709\uFF0C\u8BFB\u4E0D\u5230 profile \u76EE\u5F55" });
          return;
        }
        try {
          json(200, { ok: true, ...readInstalledPlugins(location) });
        } catch (error) {
          json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: plugins route");
    ctx.logger?.("@oblivion/brand").info(`\u5DF2\u5B89\u88C5\u63D2\u4EF6\u6E05\u5355\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1AGET ${PLUGINS_PATH}`);
  });
}
function resolvePnpmCjs() {
  const candidates = [
    join4(dirname(process.execPath), "resources", "runtime", "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.cjs"),
    join4(process.env["DSH_HOME"] ?? join4(homedir3(), ".dsh"), "dsh-runtimes", "dsh-primary-runtime", "dependencies", "pnpm", "bin", "pnpm.cjs")
  ];
  return candidates.find((candidate) => existsSync2(candidate)) ?? null;
}
function compareVersions(a, b) {
  const pa = a.split(/[.+-]/);
  const pb = b.split(/[.+-]/);
  for (let i = 0; i < 3; i += 1) {
    const x = Number.parseInt(pa[i] ?? "0", 10) || 0;
    const y = Number.parseInt(pb[i] ?? "0", 10) || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync2(file, "utf8"));
  } catch {
    return null;
  }
}
function installedVersionOf(profileDir, name) {
  const parsed = readJsonFile(join4(profileDir, "node_modules", ...name.split("/"), "package.json"));
  const version = parsed?.["version"];
  return typeof version === "string" ? version : null;
}
function isManagedDependency(name, spec) {
  if (typeof spec !== "string") return false;
  if (/^(link:|file:|workspace:|npm:)/.test(spec)) return false;
  if (name.startsWith("@oblivion/") || name.startsWith("@deepseek-ai/")) return false;
  return true;
}
async function fetchLatestVersion(name) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
      signal: AbortSignal.timeout(8e3)
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}
async function scanUpdates(profileDir) {
  const pkg = readJsonFile(join4(profileDir, "package.json"));
  const deps = pkg?.["dependencies"] ?? {};
  const items = [];
  const errors = [];
  await Promise.all(
    Object.entries(deps).map(async ([name, spec]) => {
      if (!isManagedDependency(name, spec)) return;
      const current = installedVersionOf(profileDir, name);
      if (current === null) return;
      const latest = await fetchLatestVersion(name);
      if (latest === null) {
        errors.push({ name, error: "npm \u67E5\u8BE2\u5931\u8D25" });
        return;
      }
      if (compareVersions(current, latest) < 0) items.push({ name, current, latest });
    })
  );
  items.sort((a, b) => a.name.localeCompare(b.name));
  errors.sort((a, b) => a.name.localeCompare(b.name));
  return { items, errors };
}
function runPnpmInstall(pnpm, cwd) {
  return new Promise((resolve2) => {
    const child = spawn2(
      process.execPath,
      ["--expose-internals", pnpm, "install", "--no-frozen-lockfile", "--config.minimum-release-age=0"],
      { cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true }
    );
    let tail = "";
    const push = (chunk) => {
      tail = (tail + chunk.toString("utf8")).slice(-4e3);
    };
    child.stdout?.on("data", push);
    child.stderr?.on("data", push);
    const timer = setTimeout(() => {
      child.kill();
      resolve2({ ok: false, tail, error: "pnpm install \u8D85\u65F6\uFF08180s\uFF09" });
    }, 18e4);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve2({ ok: false, tail, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve2({ ok: code === 0, tail, ...code === 0 ? {} : { error: `pnpm install exit ${String(code)}` } });
    });
  });
}
async function applyUpdates(profileDir, names) {
  const pnpm = resolvePnpmCjs();
  if (pnpm === null) return { ok: false, changed: [], installed: [], outputTail: "", error: "\u627E\u4E0D\u5230\u5185\u7F6E pnpm" };
  const candidates = await scanUpdates(profileDir);
  const selected = candidates.items.filter((item) => names.includes(item.name));
  if (selected.length === 0) return { ok: false, changed: [], installed: [], outputTail: "", error: "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u9879" };
  const pkgPath = join4(profileDir, "package.json");
  const raw = readFileSync2(pkgPath, "utf8");
  const backup = `${pkgPath}.bak-before-updates-${String(Date.now())}`;
  writeFileSync2(backup, raw, "utf8");
  try {
    const pkg = JSON.parse(raw);
    const deps = pkg.dependencies ?? {};
    for (const item of selected) deps[item.name] = item.latest;
    pkg.dependencies = deps;
    writeFileSync2(pkgPath, `${JSON.stringify(pkg, null, 2)}
`, "utf8");
    const result = await runPnpmInstall(pnpm, profileDir);
    const installed = selected.map((item) => ({ name: item.name, version: installedVersionOf(profileDir, item.name) }));
    if (!result.ok) {
      try {
        writeFileSync2(pkgPath, raw, "utf8");
      } catch {
      }
      return { ok: false, changed: selected, installed, outputTail: result.tail, error: result.error };
    }
    return { ok: true, changed: selected, installed, outputTail: result.tail };
  } catch (error) {
    try {
      writeFileSync2(pkgPath, raw, "utf8");
    } catch {
    }
    return {
      ok: false,
      changed: [],
      installed: [],
      outputTail: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function installUpdatesRoutes(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    try {
      const server = scope.webServer;
      if (server === void 0 || typeof server.register !== "function") {
        warn("webServer \u4E0D\u53EF\u7528\uFF0C\u66F4\u65B0\u63D2\u4EF6\u8DEF\u7531\u672A\u6302\u8F7D");
        return;
      }
      const location = resolveProfile(process.env, homedir3());
      if (location === null) {
        warn("DSH_PROFILE_DIR \u4E0E DSH_HOME \u90FD\u6CA1\u6709\uFF0C\u66F4\u65B0\u63D2\u4EF6\u8DEF\u7531\u672A\u6302\u8F7D");
        return;
      }
      const jsonOf = (response) => {
        return (status, body) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };
      };
      const check = server.register({
        kind: "exact",
        path: UPDATES_PATH,
        handler: async (request, response) => {
          const json = jsonOf(response);
          if (request.method !== "GET") {
            json(405, { ok: false, error: "method not allowed" });
            return;
          }
          if (!isTrustedCaller(request)) {
            json(403, { ok: false, error: "untrusted origin" });
            return;
          }
          try {
            json(200, { ok: true, ...await scanUpdates(location.dir) });
          } catch (error) {
            json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      });
      const apply2 = server.register({
        kind: "exact",
        path: UPDATES_APPLY_PATH,
        handler: async (request, response) => {
          const json = jsonOf(response);
          if (request.method !== "POST") {
            json(405, { ok: false, error: "method not allowed" });
            return;
          }
          if (!isTrustedCaller(request)) {
            json(403, { ok: false, error: "untrusted origin" });
            return;
          }
          let names = [];
          try {
            const parsed = JSON.parse(await readRequestBody(request));
            if (Array.isArray(parsed.names)) names = parsed.names.filter((n) => typeof n === "string");
          } catch {
            json(400, { ok: false, error: "bad request body" });
            return;
          }
          try {
            const result = await applyUpdates(location.dir, names);
            json(result.ok ? 200 : 500, result);
          } catch (error) {
            json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      });
      ctx.effect?.(
        () => () => {
          check();
          apply2();
        },
        "oblivion-brand: updates routes"
      );
      ctx.logger?.("@oblivion/brand").info(`\u66F4\u65B0\u63D2\u4EF6\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1AGET ${UPDATES_PATH} / POST ${UPDATES_APPLY_PATH}`);
      appendLog(`updates routes mounted: ${UPDATES_PATH} / ${UPDATES_APPLY_PATH} profile=${location.dir}`);
    } catch (error) {
      appendLog(
        `updates routes mount FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      );
      throw error;
    }
  });
}
function installSessionMessageRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u4F1A\u8BDD\u6D88\u606F\u8DEF\u7531\u672A\u6302\u8F7D");
      return;
    }
    const logger = ctx.logger?.("@oblivion/brand");
    const isControllerLike = (value) => typeof value === "object" && value !== null && typeof value.prompt === "function";
    let cached;
    try {
      ctx.inject?.(["sessionController"], (inner) => {
        if (!isControllerLike(inner.sessionController)) return;
        cached = inner.sessionController;
        logger?.info("\u4F1A\u8BDD\u670D\u52A1\u5DF2\u5C31\u7EEA\uFF0C\u5916\u90E8\u6D88\u606F\u6CE8\u5165\u53EF\u7528");
      });
    } catch (error) {
      warn(`\u8BA2\u9605\u4F1A\u8BDD\u670D\u52A1\u5931\u8D25\uFF08\u6539\u4E3A\u9010\u8BF7\u6C42 ctx.get \u515C\u5E95\uFF09\uFF1A${error instanceof Error ? error.message : String(error)}`);
    }
    const controller = () => {
      if (cached !== void 0) return cached;
      try {
        const fromCtx = ctx.get?.("sessionController");
        if (isControllerLike(fromCtx)) {
          cached = fromCtx;
          return cached;
        }
      } catch {
      }
      return void 0;
    };
    const dispose = server.register({
      kind: "exact",
      path: SESSION_MESSAGE_PATH,
      handler: async (request, response) => {
        const json = (status, body, extra) => {
          response.writeHead(status, { "content-type": "application/json", ...extra });
          response.end(JSON.stringify(body));
        };
        if (request.method !== "POST") {
          json(405, { ok: false, error: "method not allowed" }, { allow: "POST" });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: "untrusted origin" });
          return;
        }
        if (sessionInjectDisabled()) {
          json(403, { ok: false, error: `${SESSION_INJECT_ENV} \u5DF2\u6307\u5B9A\u4E3A\u5173\u95ED` });
          return;
        }
        let raw;
        try {
          raw = JSON.parse(await readRequestBody(request));
        } catch (error) {
          json(400, {
            ok: false,
            error: `\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${error instanceof Error ? error.message : String(error)}`
          });
          return;
        }
        const requestId = randomUUID();
        const parsed = parseSessionMessageRequest(raw, requestId);
        if (!parsed.ok) {
          json(400, { ok: false, error: parsed.error });
          return;
        }
        const service = controller();
        if (service === void 0) {
          json(503, { ok: false, error: "\u5BBF\u4E3B\u91CC\u53D6\u4E0D\u5230 sessionController\uFF0C\u6D88\u606F\u672A\u6CE8\u5165" });
          return;
        }
        try {
          await service.prompt(parsed.value, new AbortController().signal);
        } catch (error) {
          const failure = describePromptFailure(error);
          const status = httpStatusForPromptFailure(failure.code);
          appendLog(`session message refused (${String(status)}): ${failure.code ?? "-"} ${failure.error}`);
          json(status, { ok: false, ...failure });
          return;
        }
        appendLog(
          `session message admitted: session=${parsed.value.sessionId} mode=${parsed.value.mode} chars=${String(parsed.value.content[0].text.length)}`
        );
        json(200, {
          ok: true,
          accepted: true,
          requestId: parsed.value.requestId,
          sessionId: parsed.value.sessionId,
          mode: parsed.value.mode
        });
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: session message route");
    ctx.logger?.("@oblivion/brand").info(`\u4F1A\u8BDD\u6D88\u606F\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1APOST ${SESSION_MESSAGE_PATH}`);
  });
}
function installSessionTailRoute(ctx, warn) {
  ctx.inject?.(["webServer"], (scope) => {
    const server = scope.webServer;
    if (server === void 0 || typeof server.register !== "function") {
      warn("webServer \u4E0D\u53EF\u7528\uFF0C\u4F1A\u8BDD\u8BFB\u56DE\u8DEF\u7531\u672A\u6302\u8F7D");
      return;
    }
    const dispose = server.register({
      kind: "exact",
      path: SESSION_TAIL_PATH,
      handler: (request, response) => {
        const json = (status, body, extra) => {
          response.writeHead(status, { "content-type": "application/json", ...extra });
          response.end(JSON.stringify(body));
        };
        if (request.method !== "GET") {
          json(405, { ok: false, error: "method not allowed" }, { allow: "GET" });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: "untrusted origin" });
          return;
        }
        if (sessionInjectDisabled()) {
          json(403, { ok: false, error: `${SESSION_INJECT_ENV} \u5DF2\u6307\u5B9A\u4E3A\u5173\u95ED` });
          return;
        }
        let params;
        try {
          params = new URL(request.url ?? "", "http://127.0.0.1").searchParams;
        } catch (error) {
          json(400, { ok: false, error: `\u8BF7\u6C42 URL \u89E3\u6790\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` });
          return;
        }
        const parsed = parseTailQuery({ session: params.get("session"), limit: params.get("limit") });
        if (!parsed.ok) {
          json(400, { ok: false, error: parsed.error });
          return;
        }
        const sessionsRoot = join4(resolveDshHome(), "sessions");
        let payload;
        try {
          payload = readSessionTail(sessionsRoot, parsed.value.sessionId, parsed.value.limit);
        } catch (error) {
          json(500, {
            ok: false,
            error: `\u8BFB\u4F1A\u8BDD\u65E5\u5FD7\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`
          });
          return;
        }
        if (payload === void 0) {
          json(404, { ok: false, error: `\u627E\u4E0D\u5230\u4F1A\u8BDD ${parsed.value.sessionId} \u7684\u65E5\u5FD7` });
          return;
        }
        appendLog(
          `session tail read: session=${payload.sessionId} messages=${String(payload.messages.length)} window=${String(payload.stats.windowBytes)}/${String(payload.stats.fileBytes)}B`
        );
        json(200, {
          ok: true,
          sessionId: payload.sessionId,
          messages: payload.messages,
          stats: payload.stats
        });
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: session tail route");
    ctx.logger?.("@oblivion/brand").info(`\u4F1A\u8BDD\u8BFB\u56DE\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1AGET ${SESSION_TAIL_PATH}`);
  });
}
function installMarketRegistryOverride(ctx) {
  const logger = ctx.logger?.("@oblivion/brand");
  const current = process.env[MARKET_REGISTRY_ENV];
  if (current !== void 0 && current.trim() !== "") {
    logger?.info(
      `\u63D2\u4EF6\u5E02\u573A registry \u5DF2\u7531 ${MARKET_REGISTRY_ENV}=${current.trim()} \u6307\u5B9A\uFF0C\u672C\u63D2\u4EF6\u4E0D\u8986\u76D6`
    );
    return;
  }
  process.env[MARKET_REGISTRY_ENV] = MARKET_REGISTRY_MIRROR;
  logger?.info(`\u63D2\u4EF6\u5E02\u573A registry \u5DF2\u6307\u5411 ${MARKET_REGISTRY_MIRROR}`);
}
function sweepOnMount(logger, env = process.env, homeDir = homedir3()) {
  if (process.platform !== "win32") return;
  if (mountSweepDisabled(env)) {
    logger?.info(`${MOUNT_SWEEP_ENV} \u5DF2\u6307\u5B9A\u4E3A\u5173\u95ED\uFF0C\u88C5\u8F7D\u65F6\u4E0D\u6E05\u7406\u5B64\u513F\u8FDB\u7A0B`);
    return;
  }
  const profileDir = resolveTransportProfileDir(env, homeDir);
  if (!existsSync2(profileDir)) return;
  const shell = resolvePowerShell();
  if (shell === null) return;
  void sweepTransportOrphans({ shell, mode: "orphans", env, homeDir }).then((outcome) => {
    if (!outcome.ok) {
      logger?.warn(`\u88C5\u8F7D\u65F6\u5B64\u513F\u8FDB\u7A0B\u6E05\u626B\u5931\u8D25\uFF1A${outcome.error}`);
      return;
    }
    logger?.info(`\u88C5\u8F7D\u65F6\u5B64\u513F\u8FDB\u7A0B\u6E05\u626B\uFF1A${describeSweep(outcome.report)}`);
  });
}
function apply(ctx) {
  const logger = ctx.logger?.("@oblivion/brand");
  const warn = (message) => {
    logger?.warn(message);
  };
  installMarketRegistryOverride(ctx);
  sweepOnMount(logger);
  installRestartRoute(ctx, warn);
  installTasksRoute(ctx, warn);
  installOrphanRoute(ctx, warn);
  installPluginsRoute(ctx, warn);
  installUpdatesRoutes(ctx, warn);
  try {
    installSessionMessageRoute(ctx, warn);
  } catch (error) {
    warn(`\u4F1A\u8BDD\u6D88\u606F\u8DEF\u7531\u6302\u8F7D\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    installSessionTailRoute(ctx, warn);
  } catch (error) {
    warn(`\u4F1A\u8BDD\u8BFB\u56DE\u8DEF\u7531\u6302\u8F7D\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}`);
  }
}
export {
  DEFAULT_TAIL_LIMIT,
  MARKET_REGISTRY_ENV,
  MARKET_REGISTRY_MIRROR,
  MAX_SESSION_MESSAGE_BYTES,
  MAX_SESSION_MESSAGE_CHARS,
  MAX_TAIL_LIMIT,
  MAX_TAIL_TEXT_CHARS,
  MOUNT_SWEEP_ENV,
  ORPHANS_PATH,
  ORPHAN_SCRIPT,
  ORPHAN_SCRIPT_PATH,
  PLUGINS_PATH,
  RESTART_PATH,
  RESTART_SCRIPT,
  SESSION_ID_PATTERN,
  SESSION_INJECT_ENV,
  SESSION_LOG_FILE,
  SESSION_MESSAGE_PATH,
  SESSION_TAIL_PATH,
  TAIL_WINDOW_BYTES,
  TASKS_PATH,
  UPDATES_APPLY_PATH,
  UPDATES_PATH,
  WATCH_CMD,
  apply,
  decodeFrames,
  describePromptFailure,
  describeSweep,
  extractTailMessages,
  findSessionFile,
  httpStatusForPromptFailure,
  installMarketRegistryOverride,
  layerLabel,
  mountSweepDisabled,
  normalizePluginList,
  parseSessionMessageRequest,
  parseSweepOutput,
  parseTailQuery,
  quoteArg,
  readInstalledPlugins,
  readRequestBody,
  readSessionTail,
  readTailBytes,
  resolveDshHome,
  resolveProfile,
  resolveTransportProfileDir,
  restoreCommand,
  sessionInjectDisabled,
  statusLabel,
  sweepOnMount,
  sweepTransportOrphans,
  textOfContent,
  totalRestoreScript,
  writeOrphanScript
};
