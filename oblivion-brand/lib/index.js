// src/index.ts
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
var RESTART_PATH = "/obl-brand/restart";
var SCRIPT_PATH = join(tmpdir(), "obl-brand-restart.ps1");
var LOG_PATH = join(tmpdir(), "obl-brand-restart.log");
var RESTART_SCRIPT = String.raw`
param(
  [Parameter(Mandatory = $true)][int]$HostPid,
  [Parameter(Mandatory = $true)][string]$LogPath,
  [switch]$DryRun
)
$ErrorActionPreference = 'Continue'

function Write-Log([string]$message) {
  try {
    '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message |
      Out-File -LiteralPath $LogPath -Append -Encoding utf8
  } catch { }
}

try {
  Write-Log "helper start: host pid=$HostPid"

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
        # instead of the main process: the main would break because it lost its
        # child, and Start-Process would then race into
        # "Another DSH instance is running".
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

  # Verify-only mode: report the target and stop. Used to prove identification
  # without ending the running application.
  if ($DryRun) {
    Write-Log 'dry run: target identified, nothing stopped'
    exit 0
  }

  # Let the HTTP 202 reach the browser first, otherwise the page drops the response.
  Start-Sleep -Milliseconds 1200

  Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  Write-Log ("stopped pid={0}" -f $target.ProcessId)

  for ($i = 0; $i -lt 60; $i++) {
    if (-not (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }

  Start-Sleep -Milliseconds 900
  Start-Process -FilePath $exe
  Write-Log 'relaunched'
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
function spawnRestartHelper() {
  try {
    writeFileSync(SCRIPT_PATH, `\uFEFF${RESTART_SCRIPT}`, "utf8");
  } catch {
    return null;
  }
  const shell = process.platform === "win32" ? "powershell.exe" : null;
  if (shell === null) return null;
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
        LOG_PATH
      ],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    child.unref();
    return LOG_PATH;
  } catch {
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
function apply(ctx) {
  const logger = ctx.logger?.("@oblivion/brand");
  const warn = (message) => {
    logger?.warn(message);
  };
  installRestartRoute(ctx, warn);
}
export {
  RESTART_PATH,
  apply
};
