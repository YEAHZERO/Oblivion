// src/index.ts
import { spawn } from "node:child_process";
import { appendFileSync, existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join as join2 } from "node:path";

// src/paths.ts
var RESTART_PATH = "/obl-brand/restart";
var PLUGINS_PATH = "/obl-brand/plugins";

// src/profile-plugins.ts
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

// src/plugin-list.ts
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

// src/profile-plugins.ts
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
  const base = home !== "" ? home : homeDir !== "" ? join(homeDir, ".dsh") : "";
  if (base === "") return null;
  const profile = explicitProfile !== "" ? explicitProfile : "desktop";
  return { profile, dir: join(base, "profiles", profile) };
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
  const pkgDir = join(dir, "node_modules", name);
  const pkgFile = join(pkgDir, "package.json");
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
  const file = join(dir, "node_modules", name, "package.json");
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
  const profileFile = join(location.dir, "package.json");
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
  const patchFile = join(location.dir, "cordis.patch.yml");
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

// src/index.ts
var SCRIPT_PATH = join2(tmpdir(), "obl-brand-restart.ps1");
var LOG_PATH = join2(tmpdir(), "obl-brand-restart.log");
var MARKET_REGISTRY_ENV = "DSHM_NPM_MIRROR";
var MARKET_REGISTRY_MIRROR = "https://registry.npmmirror.com";
var RESTART_SCRIPT = String.raw`
param(
  [Parameter(Mandatory = $true)][int]$HostPid,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [string]$Version = 'unknown',
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
  if ($DryRun) {
    Write-Log 'dry run: target identified, batch written, nothing stopped or armed'
    exit 0
  }

  # Arm the relauncher BEFORE killing anything.
  #
  # Measured: this helper dies together with the Electron main process (they share
  # a job object), so an in-process "stop, wait, Start-Process" never reaches its
  # last step -- the log ended at "stopped pid=..." and the app stayed closed until
  # the user reopened it by hand.
  #
  # A process created through WMI has the WMI provider host as its parent, so it is
  # OUTSIDE that job and survives. It must be cmd.exe, not PowerShell: Windows
  # PowerShell 5.1 needs a console, and a WMI-created process has none -- it exits 0
  # without running a single line (same root cause as the detached trap). wscript is
  # no good either: a GUI-subsystem host does not start under WMI at all.
  #
  # Win32_ProcessStartup with ShowWindow = 0 hides the console that cmd would
  # otherwise flash on screen. It has to go through the WMI v1 [wmiclass] call --
  # Invoke-CimMethod cannot infer a CimType for the embedded startup instance.
  try {
    $startup = ([wmiclass]'Win32_ProcessStartup').CreateInstance()
    $startup.ShowWindow = 0
    $created = ([wmiclass]'Win32_Process').Create(('cmd.exe /c "{0}"' -f $batPath), (Split-Path -Parent $batPath), $startup)
    Write-Log ("relauncher armed via WMI: returnValue={0} pid={1}" -f $created.ReturnValue, $created.ProcessId)
  } catch {
    Write-Log ("relauncher arm failed: {0}" -f $_)
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
  const absolute = join2(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return existsSync2(absolute) ? absolute : "powershell.exe";
}
function spawnRestartHelper() {
  try {
    writeFileSync(SCRIPT_PATH, `\uFEFF${RESTART_SCRIPT}`, "utf8");
  } catch (error) {
    appendLog(`script write failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const shell = resolvePowerShell();
  if (shell === null) {
    appendLog("no PowerShell on this platform");
    return null;
  }
  appendLog(`spawning helper: shell=${shell} hostPid=${String(process.pid)} script=${SCRIPT_PATH}`);
  try {
    const child = spawn(
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
        pluginVersion()
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
        const logPath = spawnRestartHelper();
        if (logPath === null) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ ok: false, error: "restart helper could not start" }));
          return;
        }
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, logPath }));
      }
    });
    ctx.effect?.(() => dispose, "oblivion-brand: restart route");
    ctx.logger?.("@oblivion/brand").info(`\u91CD\u542F\u8DEF\u7531\u5DF2\u6302\u8F7D\uFF1APOST ${RESTART_PATH}`);
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
        const location = resolveProfile(process.env, homedir());
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
function apply(ctx) {
  const logger = ctx.logger?.("@oblivion/brand");
  const warn = (message) => {
    logger?.warn(message);
  };
  installMarketRegistryOverride(ctx);
  installRestartRoute(ctx, warn);
  installPluginsRoute(ctx, warn);
}
export {
  MARKET_REGISTRY_ENV,
  MARKET_REGISTRY_MIRROR,
  PLUGINS_PATH,
  RESTART_PATH,
  apply,
  installMarketRegistryOverride,
  layerLabel,
  normalizePluginList,
  quoteArg,
  readInstalledPlugins,
  resolveProfile,
  restoreCommand,
  statusLabel,
  totalRestoreScript
};
