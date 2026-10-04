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
  [Parameter(Mandatory = $true)][string]$LogPath
)
$ErrorActionPreference = 'Continue'

function Write-Log([string]$message) {
  try {
    '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message |
      Out-File -LiteralPath $LogPath -Append -Encoding utf8
  } catch { }
}

try {
  Write-Log "helper 启动：宿主 PID=$HostPid"

  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, ExecutablePath
  $byId = @{}
  foreach ($item in $all) { $byId[[int]$item.ProcessId] = $item }

  $target = $null
  $cursor = $HostPid
  for ($depth = 0; $depth -lt 16; $depth++) {
    if (-not $byId.ContainsKey($cursor)) { break }
    $proc = $byId[$cursor]
    Write-Log ("祖先 pid={0} ppid={1} path={2}" -f $proc.ProcessId, $proc.ParentProcessId, $proc.ExecutablePath)

    $exe = $proc.ExecutablePath
    if ($exe) {
      # 唯一的身份判据：同目录下存在 resources\app.asar 这个文件。
      # 不依赖进程名，因此不可能误判 explorer.exe 或 node.exe。
      $marker = Join-Path (Split-Path -Parent $exe) 'resources\app.asar'
      if (Test-Path -LiteralPath $marker -PathType Leaf) {
        # ⚠️ 关键：命中后**继续上溯**，最后取「最外层」那个匹配者。
        #
        # 实测本机进程树：宿主本身也是 DeepSeek Harness.exe（以 Node 模式运行，
        # ELECTRON_RUN_AS_NODE=1），与 Electron 主进程同路径，因此 depth 0 就会命中。
        # 若在首个命中处停下，杀的会是宿主子进程而不是主进程 —— 主进程会因失去
        # 子进程而异常，随后 Start-Process 又拉起第二个实例，撞上
        # 「Another DSH instance is running」。主进程是这条链上最外层的匹配者。
        $target = $proc
      }
    }

    $next = [int]$proc.ParentProcessId
    if ($next -le 0 -or $next -eq $cursor) { break }
    $cursor = $next
  }

  if (-not $target) {
    Write-Log '拒绝重启：父链中没有找到带 resources\app.asar 标记的宿主可执行文件'
    exit 1
  }
  if ($target.ProcessId -eq $PID) {
    Write-Log '拒绝重启：目标进程就是自己'
    exit 1
  }

  $exe = $target.ExecutablePath
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    Write-Log "拒绝重启：可执行文件不存在 $exe"
    exit 1
  }

  Write-Log ("目标已确认：pid={0} exe={1}" -f $target.ProcessId, $exe)

  # 留出时间让 HTTP 202 先回到浏览器，否则页面会在响应到达前断连。
  Start-Sleep -Milliseconds 1200

  Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop
  Write-Log ("已停止 pid={0}" -f $target.ProcessId)

  for ($i = 0; $i -lt 60; $i++) {
    if (-not (Get-Process -Id $target.ProcessId -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }

  Start-Sleep -Milliseconds 900
  Start-Process -FilePath $exe
  Write-Log '已重新拉起应用'
} catch {
  Write-Log ("失败：{0}" -f $_)
  exit 1
}
`;
function fromLoopback(request) {
  const origin = request.headers["origin"];
  if (typeof origin !== "string" || origin === "") return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
function spawnRestartHelper() {
  try {
    writeFileSync(SCRIPT_PATH, RESTART_SCRIPT, "utf8");
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
        if (!fromLoopback(request)) {
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
