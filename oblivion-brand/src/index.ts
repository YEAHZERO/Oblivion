/**
 * @oblivion/brand — Node 半边。
 *
 * 除了给 Loader 留座，这里放的**全部是浏览器半边做不到的事** —— 四类「宿主侧动作」：
 *
 *   ① **重启 DSH 桌面应用**（`POST /obl-brand/restart`）
 *   ② **清理 web-login 遗留的孤儿传输进程**（`POST /obl-brand/orphans`，见 `orphans.ts`）
 *   ③ **列出个人已安装插件**（`GET /obl-brand/plugins`，只读）
 *   ④ **向指定会话注入一条用户消息**（`POST /obl-brand/session/message`，见 `session-inject.ts`）
 *
 * 再加一条与路由无关的：把插件市场的 npm 镜像指到 npmmirror。
 *
 * 四条路由共用同一套安全口径 —— **只回本机调用方**（拒绝存在且非本机的 `Origin`，
 * 挡浏览器 CSRF）。理由见 `isTrustedCaller` 的长注释：桌面窗口来源是 `dsh-app://app`，
 * 且转发层会**删掉** `origin` 头，所以「必须等于回环来源」这种判据会把自己挡在门外。
 *
 * ## 为什么需要宿主半边（以重启为例）
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
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MOUNT_SWEEP_ENV,
  ORPHAN_SCRIPT_PATH,
  describeSweep,
  mountSweepDisabled,
  resolveTransportProfileDir,
  sweepTransportOrphans,
  writeOrphanScript,
} from './orphans.js';
import { ORPHANS_PATH, PLUGINS_PATH, RESTART_PATH, SESSION_MESSAGE_PATH } from './paths.js';
import { readInstalledPlugins, resolveProfile } from './profile-plugins.js';
import {
  SESSION_INJECT_ENV,
  describePromptFailure,
  httpStatusForPromptFailure,
  parseSessionMessageRequest,
  readRequestBody,
  sessionInjectDisabled,
  type SessionMessageRequest,
} from './session-inject.js';

/** Cordis 插件入口（空 apply 的占位语义保留在下方 `apply`）。 */

/**
 * 路由路径与「恢复命令」纯逻辑在此再导出。
 *
 * 目的：`scripts/selfcheck.mjs` 直接 `import` 产物 `lib/index.js`，这样就能在 Node 里
 * 断言「重装命令怎么拼」「清单怎么校验」，而不必去跑客户端产物（浏览器 bundle 不是
 * ESM，Node 里 import 不了）。宿主半边与浏览器半边共用 `paths.ts` / `plugin-list.ts`，
 * 所以这里导出的是同一份实现，不是副本。
 */
export { ORPHANS_PATH, PLUGINS_PATH, RESTART_PATH, SESSION_MESSAGE_PATH };
export { layerLabel, normalizePluginList, quoteArg, restoreCommand, statusLabel, totalRestoreScript } from './plugin-list.js';
export type { InstalledPlugin, PluginLayer, PluginListPayload } from './plugin-list.js';
export { readInstalledPlugins, resolveProfile };
/**
 * 孤儿进程清扫的逻辑面（判据、脚本正文、输出解析、开关）。
 *
 * 导出给 `scripts/selfcheck.mjs`：这一块**不能**靠真跑 PowerShell 来验
 * （那会在开发机上真的杀进程），所以把可判定性做在纯函数上。
 */
export {
  MOUNT_SWEEP_ENV,
  ORPHAN_SCRIPT,
  ORPHAN_SCRIPT_PATH,
  describeSweep,
  mountSweepDisabled,
  parseSweepOutput,
  resolveTransportProfileDir,
  sweepTransportOrphans,
  writeOrphanScript,
} from './orphans.js';
export type { SweepMode, SweepOutcome, SweepReport } from './orphans.js';
/**
 * 会话消息注入的逻辑面（路由路径、开关、请求解析、失败归类）。
 *
 * 导出给 `scripts/selfcheck.mjs`：与孤儿清扫同理 —— `prompt()` 只能对着一个**真实的
 * 会话服务**才有意义，自检不许往用户真实会话里塞消息，所以可判定性全部做在纯函数上。
 */
export {
  MAX_SESSION_MESSAGE_BYTES,
  MAX_SESSION_MESSAGE_CHARS,
  SESSION_INJECT_ENV,
  describePromptFailure,
  httpStatusForPromptFailure,
  parseSessionMessageRequest,
  readRequestBody,
  sessionInjectDisabled,
} from './session-inject.js';
export type { SessionMessageRequest, SessionPromptMode } from './session-inject.js';

/** helper 脚本与日志落在临时目录。 */
const SCRIPT_PATH = join(tmpdir(), 'obl-brand-restart.ps1');
const LOG_PATH = join(tmpdir(), 'obl-brand-restart.log');

/** 市场读取 npm 镜像用的环境变量名 —— 市场自己的逃生口，不是我们发明的。 */
export const MARKET_REGISTRY_ENV = 'DSHM_NPM_MIRROR';

/** 覆盖后市场与它派生的 pnpm 一起使用的 npm 镜像。 */
export const MARKET_REGISTRY_MIRROR = 'https://registry.npmmirror.com';

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
 *   - `SweepScript` 孤儿清扫脚本落点（`obl-brand-orphans.ps1`；空串表示不扫）。
 *   - `ProfileDir`  web-login 的传输 profile 目录，转交给清扫脚本做判据。
 */
export const RESTART_SCRIPT = String.raw`
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
  # session, and exit would end the helper before the relauncher is armed.
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

/** 本插件用到的最小宿主 ctx 面。 */
interface HostCtx {
  inject?(deps: string[], callback: (scope: HostScope) => unknown): void;
  effect?(callback: () => unknown, label?: string): void;
  logger?(name: string): { info(message: string): void; warn(message: string): void };
  /**
   * 非响应式取服务（Cordis 的 `ctx.get`）。
   *
   * 只在 `inject('sessionController')` 没触发时作兜底：路由**必须先挂上**，这样它才能
   * 明确回答「会话服务不可用」（503），而不是整条路由消失（面板上表现为 404，
   * 无法区分「没装」与「服务没就绪」）。
   */
  get?(name: string): unknown;
}

/**
 * 会话服务的最小面（`@deepseek-ai/dsh-session-controller` 的 `sessionController`）。
 *
 * 只依赖 `prompt` / `resolveAgent` 两个方法，不引 harness 类型：本包要能被
 * Cordis Loader 直接加载，不该把 DSH 内部包放进依赖图。
 */
interface SessionControllerLike {
  prompt(request: SessionMessageRequest, signal: AbortSignal): Promise<unknown>;
}

interface HostScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: HostRequest, response: HostResponse) => void | Promise<void>;
    }): () => void;
  };
  /**
   * 只在 `inject(['sessionController'], …)` 的作用域里可读。
   *
   * 在只声明了 `webServer` 的作用域里读它会**抛错**（Cordis 服务访问守卫，
   * `vendor/cordis/src/reflect.ts:144`）—— 不是给 `undefined`，是抛异常。
   */
  sessionController?: SessionControllerLike;
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
 * 本插件的版本号。
 *
 * 单一真源是仓库根的 `VERSION`（由 `scripts/bump-version.mjs` 同步到
 * `package.json`）。这里在**运行时读 package.json**，因此不会出现
 * 「常量忘了同步」这类漂移 —— 日志里印的就是磁盘上真实加载的那一版。
 */
function pluginVersion(): string {
  try {
    const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 向 helper 日志追加一行宿主侧诊断。
 *
 * 宿主与 helper 共用一个日志文件：helper 若不执行（例如根本没起来），
 * 日志里至少会留下「宿主请求过派生」的痕迹，从而把「路由没通」与
 * 「helper 起不来」两类故障区分开。
 *
 * 每行都带版本号：这个功能debug 时最费时间的一环就是**无法从日志判断
 * 跑的是哪一版代码** —— node 半边只在应用启动时加载，刷新页面不会更新它。
 */
function appendLog(line: string): void {
  try {
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [host] v${pluginVersion()} ${line}\n`, 'utf8');
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

  // 清扫脚本与判据目录一起交给 helper：helper 不做启发式，只负责在
  // 「即将硬杀宿主」这个时机调用它（`-Mode all`）。
  const sweepScript = writeOrphanScript();
  const profileDir = resolveTransportProfileDir();
  if (sweepScript === null) {
    appendLog('orphan sweep script write failed; helper will skip the sweep');
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
        '-Version',
        pluginVersion(),
        '-SweepScript',
        sweepScript ?? '',
        '-ProfileDir',
        profileDir,
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
      handler: async (request, response) => {
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

        // 先做一次**只杀孤儿**的清扫并把结果回给浏览器：这一步不影响正在跑的传输进程，
        // 因此可以安全地放在 helper 之前；真正的「全杀」在 helper 里（见 RESTART_SCRIPT）。
        const shell = resolvePowerShell();
        const sweep =
          shell === null
            ? ({ ok: false, error: 'no PowerShell on this platform' } as const)
            : await sweepTransportOrphans({ shell, mode: 'orphans' });
        if (sweep.ok) {
          appendLog(`pre-restart sweep: ${describeSweep(sweep.report)}`);
        } else {
          appendLog(`pre-restart sweep failed: ${sweep.error}`);
        }

        const logPath = spawnRestartHelper();
        if (logPath === null) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'restart helper could not start' }));
          return;
        }

        response.writeHead(202, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, logPath, sweep }));
      },
    });

    ctx.effect?.(() => dispose, 'oblivion-brand: restart route');
    ctx.logger?.('@oblivion/brand').info(`重启路由已挂载：POST ${RESTART_PATH}`);
  });
}

/**
 * 注册孤儿进程清扫路由（POST）。
 *
 * 与重启路由分开的理由：重启把会话打断，而这个动作只想解开被占住的传输 profile 目录。
 * 现场「面板上三个账号全红」时用户要的是后者。
 *
 * **只跑 `orphans` 模式**：`all` 会连当前会话健康的传输进程一起杀，那会让网页版
 * 探活在会话中途突然失败 —— 这条路由永远不该造成那种效果。
 */
function installOrphanRoute(ctx: HostCtx, warn: (message: string) => void): void {
  ctx.inject?.(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用，孤儿进程清扫路由未挂载');
      return;
    }

    const dispose = server.register({
      kind: 'exact',
      path: ORPHANS_PATH,
      handler: async (request, response) => {
        const json = (status: number, body: unknown, extra?: Record<string, string>): void => {
          response.writeHead(status, { 'content-type': 'application/json', ...extra });
          response.end(JSON.stringify(body));
        };

        if (request.method !== 'POST') {
          json(405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: 'untrusted origin' });
          return;
        }

        const shell = resolvePowerShell();
        if (shell === null) {
          json(501, { ok: false, error: '本机没有 PowerShell，无法清扫' });
          return;
        }

        const outcome = await sweepTransportOrphans({ shell, mode: 'orphans' });
        if (!outcome.ok) {
          appendLog(`orphan sweep failed: ${outcome.error}`);
          json(500, { ok: false, error: outcome.error });
          return;
        }

        appendLog(`orphan sweep: ${describeSweep(outcome.report)}`);
        json(200, { ok: true, report: outcome.report, summary: describeSweep(outcome.report) });
      },
    });

    ctx.effect?.(() => dispose, 'oblivion-brand: orphans route');
    ctx.logger?.('@oblivion/brand').info(`孤儿进程清扫路由已挂载：POST ${ORPHANS_PATH}`);
  });
}

/**
 * 注册「个人已安装插件」清单路由（GET，只读）。
 *
 * 为什么放在宿主半边：浏览器半边拿不到文件系统，而清单的事实来源就是 profile 目录里的
 * `package.json` + `cordis.patch.yml`（见 `profile-plugins.ts`）。这里只负责「定位 profile →
 * 读 → 原样返回 JSON」，不做任何缓存：面板每次打开都重新读，装完插件刷新一下就能看到。
 *
 * 只读、且只回本机调用方（`isTrustedCaller`）：清单含本机绝对路径，不该被任意网页读走。
 */
function installPluginsRoute(ctx: HostCtx, warn: (message: string) => void): void {
  ctx.inject?.(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用，已安装插件清单未挂载');
      return;
    }

    const dispose = server.register({
      kind: 'exact',
      path: PLUGINS_PATH,
      handler: (request, response) => {
        const json = (status: number, body: unknown, extra?: Record<string, string>): void => {
          response.writeHead(status, { 'content-type': 'application/json', ...extra });
          response.end(JSON.stringify(body));
        };

        if (request.method !== 'GET') {
          json(405, { ok: false, error: 'method not allowed' }, { allow: 'GET' });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: 'untrusted origin' });
          return;
        }

        const location = resolveProfile(process.env, homedir());
        if (location === null) {
          json(500, { ok: false, error: 'DSH_PROFILE_DIR 与 DSH_HOME 都没有，读不到 profile 目录' });
          return;
        }

        try {
          json(200, { ok: true, ...readInstalledPlugins(location) });
        } catch (error) {
          json(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    });

    ctx.effect?.(() => dispose, 'oblivion-brand: plugins route');
    ctx.logger?.('@oblivion/brand').info(`已安装插件清单路由已挂载：GET ${PLUGINS_PATH}`);
  });
}

/**
 * 注册「向指定会话注入一条用户消息」路由（POST）。
 *
 * ## 为什么这条路由在家（而不是别的插件）
 *
 * 它的两个近亲 —— **重启**与**孤儿进程清扫** —— 都长在本插件的路由表里，共享同一套
 * 「只回本机调用方」的判据与同一套运营者开关风格。这是它们的同一类动作：**宿主侧、
 * 有副作用、面板/外部工具触发**。（`@oblivion/panel` 是刻意**只读**的数据面，
 * 在它那里加写路径会破坏它自己的不变量与自检。）
 *
 * ## 为什么用「延迟绑定 + 明确 503」而不是「注入不到就不挂载」
 *
 * `sessionController` 由 api 层提供，与本插件不在同一个注入批次里。若把
 * `sessionController` 直接列进本路由的 `inject` 依赖，一旦服务未就绪，**整条路由都不会
 * 挂上** —— 外部看到的是 404「路由不存在」，与「服务没就绪」无法区分，也没法重试。
 * 所以路由无条件挂载，服务在**收到请求时**再解析；拿不到就回 503 并说清楚。
 *
 * ## 落地时的坑：Cordis 的服务访问守卫（0.1.5 上线即踩）
 *
 * 「延迟绑定」的第一版在 webServer 作用域里顺手读了一次 `scope.sessionController`
 * 当作「已经在作用域里」的快路径 —— 真机上一次都没走到 register：Cordis 对**未声明 inject
 * 的服务属性读取**是**抛错**，不是给 `undefined`（`vendor/cordis/src/reflect.ts:144`）。
 * 于是 apply 半途炸掉，前面三条路由都在、只有这条没有，外部看到的是 404。
 * 教训：① 作用域里**只读 inject 声明过的东西**；② 挂载期任何异常都要变成一条 warn，
 * 因为「路由静默消失」这种故障，从外部看和「没装这个版本」一模一样。
 * 自检的桩也因此改成**忠实**实现（未声明的服务读取会抛，服务没就绪就不回调）。
 *
 * ## 安全口径
 *
 * 这条路由能把指令投喂给一个拥有完整工具权限的 agent，因此：
 *   ① `isTrustedCaller`（拒绝存在且非本机的 Origin —— 挡浏览器 CSRF）；
 *   ② `OBLIVION_BRAND_SESSION_INJECT` 置关闭值即 403；
 *   ③ 只接受 `text`，不接附件 / 不接 model / 不接任何路径参数（少一个面就少一类洞）。
 */
function installSessionMessageRoute(ctx: HostCtx, warn: (message: string) => void): void {
  ctx.inject?.(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用，会话消息路由未挂载');
      return;
    }

    const logger = ctx.logger?.('@oblivion/brand');
    const isControllerLike = (value: unknown): value is SessionControllerLike =>
      typeof value === 'object' && value !== null && typeof (value as { prompt?: unknown }).prompt === 'function';

    // ⚠️ 绝不能在这里读 `scope.sessionController`：Cordis 给每个 ctx 都装了**服务访问守卫**，
    // 读一个「本作用域没 inject 过」的服务会**抛错**（`vendor/cordis/src/reflect.ts:144`
    // 的 `cannot get property "x" without inject`）。本作用域只声明了 webServer，那一读会让
    // 整条路由在 register 之前就炸掉 —— 现场表现是「其余三条路由都在，只有这条 404」
    // （0.1.5 上线时的真实故障：外部无从分辨「没装这个版本」与「路由挂了」）。
    //
    // 会话服务只走两条**合法**通道：
    //   ① `ctx.inject(['sessionController'], …)`：声明过的依赖，就绪即回调（主路径，顺带缓存）；
    //   ② `ctx.get('sessionController')`：不参与响应式的原始取用（`reflect.ts:233`），逐请求兜底。
    // 于是「路由先挂上、服务后到」成立：没就绪就回 503 说清楚，而不是整条路由消失。
    let cached: SessionControllerLike | undefined;
    try {
      ctx.inject?.(['sessionController'], (inner) => {
        if (!isControllerLike(inner.sessionController)) return;
        cached = inner.sessionController;
        logger?.info('会话服务已就绪，外部消息注入可用');
      });
    } catch (error) {
      warn(`订阅会话服务失败（改为逐请求 ctx.get 兜底）：${error instanceof Error ? error.message : String(error)}`);
    }

    /** 每次请求时解析：晚到的服务也能用上，且不依赖注入回调一定触发。 */
    const controller = (): SessionControllerLike | undefined => {
      if (cached !== undefined) return cached;
      try {
        const fromCtx = ctx.get?.('sessionController');
        if (isControllerLike(fromCtx)) {
          cached = fromCtx;
          return cached;
        }
      } catch {
        /* ctx.get 在某些作用域会拒绝访问，视同取不到 */
      }
      return undefined;
    };

    const dispose = server.register({
      kind: 'exact',
      path: SESSION_MESSAGE_PATH,
      handler: async (request, response) => {
        const json = (status: number, body: unknown, extra?: Record<string, string>): void => {
          response.writeHead(status, { 'content-type': 'application/json', ...extra });
          response.end(JSON.stringify(body));
        };

        if (request.method !== 'POST') {
          json(405, { ok: false, error: 'method not allowed' }, { allow: 'POST' });
          return;
        }
        if (!isTrustedCaller(request)) {
          json(403, { ok: false, error: 'untrusted origin' });
          return;
        }
        if (sessionInjectDisabled()) {
          json(403, { ok: false, error: `${SESSION_INJECT_ENV} 已指定为关闭` });
          return;
        }

        let raw: unknown;
        try {
          raw = JSON.parse(await readRequestBody(request));
        } catch (error) {
          json(400, {
            ok: false,
            error: `请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
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
        if (service === undefined) {
          json(503, { ok: false, error: '宿主里取不到 sessionController，消息未注入' });
          return;
        }

        try {
          // 幂等键 = requestId（调用方未给则由上面铸造）：重复提交同一条只会被接受一次。
          await service.prompt(parsed.value, new AbortController().signal);
        } catch (error) {
          const failure = describePromptFailure(error);
          const status = httpStatusForPromptFailure(failure.code);
          appendLog(`session message refused (${String(status)}): ${failure.code ?? '-'} ${failure.error}`);
          json(status, { ok: false, ...failure });
          return;
        }

        appendLog(
          `session message admitted: session=${parsed.value.sessionId} mode=${parsed.value.mode} chars=${String(parsed.value.content[0].text.length)}`,
        );
        json(200, {
          ok: true,
          accepted: true,
          requestId: parsed.value.requestId,
          sessionId: parsed.value.sessionId,
          mode: parsed.value.mode,
        });
      },
    });

    ctx.effect?.(() => dispose, 'oblivion-brand: session message route');
    ctx.logger?.('@oblivion/brand').info(`会话消息路由已挂载：POST ${SESSION_MESSAGE_PATH}`);
  });
}

/**
 * 把插件市场（`dshmarket`）的 npm registry 指到 npmmirror。
 *
 * ## 为什么需要这一手
 *
 * 市场自己会探测「下载区域」，本机探测结果是 `china`
 * （`profiles/desktop/.dsh-market/state.json` 的 `region: "china"`），
 * 对应 `dshmarket/lib/regions.js` 里的 `NPM_CHINA = mirrors.cloud.tencent.com/npm`。
 * 想用 npmmirror 就得**覆盖**，而区域表本身没有 npmmirror 这个选项。
 *
 * ## 为什么用环境变量而不是改市场源码
 *
 * `regions.js` 的 `routesFor()` 是 `npmMirror ?? base.npmRegistry` ——
 * 环境变量**优先于区域表**，而且市场在文件头注释里就把这条逃生口写成了
 * 设计意图（「a user whose routes have died needs a way out that is not
 * wait for the next release」）。所以走它有两个好处：不改任何安装包
 * （市场升级后本覆盖依然有效），以及**运营者优先** —— 见下。
 *
 * ## 覆盖范围（这是它值钱的地方）
 *
 * 一个变量同时管住三处，因为它们都问 `routesFor()`：
 *
 *   1. 市场自己的浏览/搜索/更新检查；
 *   2. `dsh-cli.js` 派生 pnpm 时写入的 `npm_config_registry` —— **安装**也走它；
 *   3. 目录源 `dsh-plugin-catalog`（`base.catalog` 按解析结果重建）。
 *
 * 而 GitHub 那三条路由**不受影响**：本函数不碰 `DSHM_GITHUB_PROXY`，
 * 所以 `githubProxy` 仍然是区域表里的 `gh-proxy.com`。只换 npm 镜像。
 *
 * ## 非破坏性
 *
 * 已经有人设过（非空）就**一个字都不改**并记一行日志。运营者的环境变量是
 * 「对自己网络的声明」，优先级高于本插件 —— 想换回去，把它设成空串或别的镜像即可。
 */
export function installMarketRegistryOverride(ctx: HostCtx): void {
  const logger = ctx.logger?.('@oblivion/brand');
  const current = process.env[MARKET_REGISTRY_ENV];
  // 空白视同未设，与市场自己的 override() 语义一致。
  if (current !== undefined && current.trim() !== '') {
    logger?.info(
      `插件市场 registry 已由 ${MARKET_REGISTRY_ENV}=${current.trim()} 指定，本插件不覆盖`,
    );
    return;
  }
  process.env[MARKET_REGISTRY_ENV] = MARKET_REGISTRY_MIRROR;
  logger?.info(`插件市场 registry 已指向 ${MARKET_REGISTRY_MIRROR}`);
}

/** 本插件用到的最小日志面。 */
interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/**
 * 装载时清扫一次 web-login 遗留的孤儿传输进程（非阻塞）。
 *
 * 这是「以后不再出现同样问题」的那一条：重启 helper 里的清扫只在**走本插件按钮**
 * 时执行，而现场踩到的路径还有崩溃、任务管理器结束进程、安装器升级 —— 那些都不会
 * 经过 helper。装载是**所有**路径都会经过的那一个时刻。
 *
 * 三个前置条件都不满足就直接返回、不派生 PowerShell：
 *   1. 非 Windows；
 *   2. `OBLIVION_BRAND_ORPHAN_SWEEP` 被设成关闭值；
 *   3. 传输 profile 目录不存在（web-login 从没跑过，没有可清扫的东西）。
 *
 * 用 `orphans` 模式：只杀父进程已死的，因此即使当前会话的传输进程已经起来了也不会误伤。
 */
export function sweepOnMount(
  logger?: Logger,
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir(),
): void {
  if (process.platform !== 'win32') return;
  if (mountSweepDisabled(env)) {
    logger?.info(`${MOUNT_SWEEP_ENV} 已指定为关闭，装载时不清理孤儿进程`);
    return;
  }
  const profileDir = resolveTransportProfileDir(env, homeDir);
  if (!existsSync(profileDir)) return;
  const shell = resolvePowerShell();
  if (shell === null) return;

  void sweepTransportOrphans({ shell, mode: 'orphans', env, homeDir }).then((outcome) => {
    if (!outcome.ok) {
      logger?.warn(`装载时孤儿进程清扫失败：${outcome.error}`);
      return;
    }
    logger?.info(`装载时孤儿进程清扫：${describeSweep(outcome.report)}`);
  });
}

/** Cordis 插件入口。 */
export function apply(ctx: HostCtx): void {
  const logger = ctx.logger?.('@oblivion/brand');
  const warn = (message: string): void => {
    logger?.warn(message);
  };
  // 先于重启路由：只写一个环境变量，越早越好（市场第一次发请求前生效）。
  installMarketRegistryOverride(ctx);
  // 装载即清扫一次：覆盖不经过本插件按钮的那些重启路径（崩溃 / 任务管理器 / 升级）。
  sweepOnMount(logger);
  installRestartRoute(ctx, warn);
  installOrphanRoute(ctx, warn);
  installPluginsRoute(ctx, warn);
  // 挂载期抛错 = 这条路由**静默消失**（外部只见 404，与「这个版本没装」无法区分）。
  // `installSessionMessageRoute` 自己已经不再碰未声明的服务，这里再兜一层：
  // 万一以后有人加了一行危险读取，至少日志里会留下一条 warn，而不是无声缺一条路由。
  try {
    installSessionMessageRoute(ctx, warn);
  } catch (error) {
    warn(`会话消息路由挂载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}
