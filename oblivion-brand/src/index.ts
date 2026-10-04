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
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
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
 * ⚠️ **脚本正文必须保持纯 ASCII。** 这是踩出来的坑：
 *
 *   它由 `powershell.exe`（Windows PowerShell **5.1**）执行，而 5.1 对**无 BOM**
 *   的 `.ps1` 默认按 ANSI/GBK 解码。脚本里只要出现中文，就会被误解码并在**解析期
 *   直接失败** —— 连 `try` 块都进不去。现场表现是「脚本文件写出来了、日志却一个
 *   字节都没有」，极难从表面定位。
 *
 * 因此双保险：正文全 ASCII，且写入时带 UTF-8 BOM（见 `spawnRestartHelper`）。
 *
 * 参数：
 *   - `HostPid`  DSH 宿主进程 PID（插件所在进程），用于沿父链上溯。
 *   - `LogPath`  日志文件，便于失败后排查。
 */
const RESTART_SCRIPT = String.raw`
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

/**
 * 判断调用方是否可信。
 *
 * ## 为什么不能要求「Origin 必须是回环」
 *
 * 桌面端有两条实测事实（`app.asar/lib/main.js`）：
 *
 *   1. 窗口页面的来源是 `dsh-app://app`，不是 `http://127.0.0.1`；
 *   2. 非文档路径经 `forwardWebRequest` 转发给本地 webserver，而它在转发前
 *      **删除了 `origin` 头**：`headers.delete("origin")`。
 *
 * 所以请求到达本路由时 Origin 通常是**缺失**的。若按「必须等于回环来源」判，
 * 会被自己的校验挡在门外 —— 这正是第一次实测拿到 403/405 的原因之一。
 *
 * ## 真正的风险是跨站 CSRF
 *
 * webserver 只绑回环，外部主机够不到；危险的是**浏览器里的恶意页面**向
 * `http://127.0.0.1:<port>` 发 POST 触发重启。浏览器对跨源 POST **一定**会带
 * `Origin`，所以只要拒绝「存在且非本机」的 Origin 就够了。
 *
 * 缺失 Origin 只可能来自非浏览器调用方；本地进程本就能直接结束应用进程，
 * 因此不构成额外暴露面。
 */
function isTrustedCaller(request: HostRequest): boolean {
  const origin = request.headers['origin'];
  if (origin === undefined || origin === '') return true;
  if (typeof origin !== 'string') return false;
  if (origin === 'dsh-app://app') return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * 向 helper 日志追加一行宿主侧诊断。
 *
 * 宿主与 helper 共用一个日志文件：helper 若不执行（例如根本没起来），
 * 日志里至少会留下「宿主请求过派生」的痕迹，从而把「路由没通」与
 * 「helper 起不来」两类故障区分开。
 */
function appendLog(line: string): void {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [host] ${line}\n`, 'utf8');
  } catch {
    /* 诊断失败不能影响主流程 */
  }
}

/**
 * 解析 PowerShell 的**绝对路径**。
 *
 * ⚠️ 用**绝对路径**而不是裸 `'powershell.exe'`：DSH 宿主的环境由
 * `desktopNodeEnvironment()` 构造，PATH 未必含 `System32\WindowsPowerShell\v1.0`。
 * 裸名一旦解析不到，`spawn` 只异步抛 `error` 事件 —— 无人监听就静默消失。
 *
 * 这里刻意**不优先选 pwsh 7**：实测本机 pwsh 只存在于版本化的
 * `C:\Program Files\WindowsApps\Microsoft.PowerShell_<版本>_x64__<hash>\pwsh.exe`，
 * 而该目录 `readdir` 返回 EPERM，无法可靠发现；裸名与 ProgramFiles 路径均不存在。
 * Windows PowerShell 5.1 恒在，是唯一可靠选择。
 */
function resolvePowerShell(): string | null {
  if (process.platform !== 'win32') return null;
  const root = process.env['SystemRoot'] ?? process.env['windir'] ?? 'C:\\Windows';
  const absolute = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return existsSync(absolute) ? absolute : 'powershell.exe';
}

/**
 * 派生游离 helper 去重启应用。
 *
 * @returns 日志文件路径；派生失败返回 `null`。
 */
function spawnRestartHelper(): string | null {
  try {
    // ⚠️ 必须带 UTF-8 BOM：Windows PowerShell 5.1 对无 BOM 的 .ps1 按 ANSI 解码，
    // 一旦脚本里出现非 ASCII 字符就会在解析期失败（见 RESTART_SCRIPT 的说明）。
    writeFileSync(SCRIPT_PATH, `\uFEFF${RESTART_SCRIPT}`, 'utf8');
  } catch (error) {
    appendLog(`script write failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const shell = resolvePowerShell();
  if (shell === null) {
    appendLog('no PowerShell on this platform');
    return null;
  }

  appendLog(`spawning helper: shell=${shell} hostPid=${String(process.pid)} script=${SCRIPT_PATH}`);

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
      { detached: false, stdio: 'ignore', windowsHide: true },
    );
    // 必须监听 error：ENOENT / EPERM 之类只以事件形式出现，
    // 不监听就既不会抛也不会记录，故障完全不可见。
    child.on('error', (error) => {
      appendLog(`spawn error: ${error.message}`);
    });
    child.unref();
    return LOG_PATH;
  } catch (error) {
    appendLog(`spawn threw: ${error instanceof Error ? error.message : String(error)}`);
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
        if (!isTrustedCaller(request)) {
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
    ctx.logger?.('@oblivion/brand').info(`重启路由已挂载：POST ${RESTART_PATH}`);
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
