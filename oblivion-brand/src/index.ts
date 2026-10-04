/**
 * @oblivion/brand — Node 半边。
 *
 * 除了给 Loader 留座，这里只做一件浏览器半边做不到的事：**重启 DSH 桌面应用**。
 *
 * ## 为什么需要宿主半边
 *
 * 客户端半边跑在渲染进程里，而 DSH 的 `contextBridge` **没有暴露任何重启接口**
 * —— 实测 `lib/preload-app.cjs` 的 `createProductApi()` 只有
 * `deviceInfo` / `keyboard` / `shortcuts` / `updates` / `browser`，
 * 主进程里那个 `restart: () => { app.relaunch(); quitWithoutConfirmation() }`
 * 属于崩溃恢复专用面，渲染进程够不着。而且「重启应用与 Host」菜单项被
 * `...development ? [...] : []` 包着，**生产构建里根本不显示**。
 *
 * 所以唯一可行的路径是：宿主半边派生一个**游离**进程，等 HTTP 响应回给浏览器后，
 * 停掉应用进程再把它拉起来。参考实现是社区的 `dsh-tray`（按 PID 停进程再
 * `Start-Process`），区别是它本身独立于 dsh 进程，而我们跑在 dsh 里面，
 * 所以必须 detached。
 *
 * ## 安全判据（重要）
 *
 * 重启 = 杀进程。父链里如果混进 `explorer.exe` 之类的进程，误杀后果严重，
 * 因此本文件**不做任何「名字像不像」的启发式**，改用文件系统验证的身份判据：
 *
 *   祖先的可执行文件所在目录里，必须存在 `resources\app.asar` 这个**文件**。
 *
 * 只有 Electron 打包应用（含 DSH 桌面端）才满足；`C:\Windows` 不满足。
 * 找不到就**拒绝重启**，绝不猜。
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Cordis 插件入口（空 apply 的占位语义保留在下方 `apply`）。 */

/** 重启路由路径。 */
export const RESTART_PATH = '/obl-brand/restart';

/** helper 脚本与日志落在临时目录。 */
const SCRIPT_PATH = join(tmpdir(), 'obl-brand-restart.ps1');
const LOG_PATH = join(tmpdir(), 'obl-brand-restart.log');

/**
 * 游离重启脚本。
 *
 * 参数：
 *   - `HostPid`  DSH 宿主进程 PID（插件所在进程），用于沿父链上溯。
 *   - `LogPath`  日志文件，便于失败后排查。
 */
const RESTART_SCRIPT = String.raw`
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

/** 本插件用到的最小宿主 ctx 面。 */
interface HostCtx {
  inject?(deps: string[], callback: (scope: HostScope) => unknown): void;
  effect?(callback: () => unknown, label?: string): void;
  logger?(name: string): { info(message: string): void; warn(message: string): void };
}

interface HostScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: HostRequest, response: HostResponse) => void | Promise<void>;
    }): () => void;
  };
}

interface HostRequest {
  readonly method?: string;
  readonly headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  resume?(): void;
}

interface HostResponse {
  writeHead(status: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}

/** 只接受来自本机回环页面的请求，挡掉跨站页面发起的重启。 */
function fromLoopback(request: HostRequest): boolean {
  const origin = request.headers['origin'];
  if (typeof origin !== 'string' || origin === '') return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * 派生游离 helper 去重启应用。
 *
 * @returns 日志文件路径；派生失败返回 `null`。
 */
function spawnRestartHelper(): string | null {
  try {
    writeFileSync(SCRIPT_PATH, RESTART_SCRIPT, 'utf8');
  } catch {
    return null;
  }

  const shell = process.platform === 'win32' ? 'powershell.exe' : null;
  if (shell === null) return null;

  try {
    const child = spawn(
      shell,
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        SCRIPT_PATH,
        '-HostPid',
        String(process.pid),
        '-LogPath',
        LOG_PATH,
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    // 游离：本进程随后会被 helper 杀掉，子进程必须活下来。
    child.unref();
    return LOG_PATH;
  } catch {
    return null;
  }
}

/** 注册重启路由。 */
function installRestartRoute(ctx: HostCtx, warn: (message: string) => void): void {
  ctx.inject?.(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用，重启功能未挂载');
      return;
    }

    const dispose = server.register({
      kind: 'exact',
      path: RESTART_PATH,
      handler: (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        if (!fromLoopback(request)) {
          response.writeHead(403, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'untrusted origin' }));
          return;
        }

        const logPath = spawnRestartHelper();
        if (logPath === null) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'restart helper could not start' }));
          return;
        }

        response.writeHead(202, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, logPath }));
      },
    });

    ctx.effect?.(() => dispose, 'oblivion-brand: restart route');
  });
}

/** Cordis 插件入口。 */
export function apply(ctx: HostCtx): void {
  const logger = ctx.logger?.('@oblivion/brand');
  const warn = (message: string): void => {
    logger?.warn(message);
  };
  installRestartRoute(ctx, warn);
}
