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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLUGINS_PATH, RESTART_PATH } from './paths.js';
import { readInstalledPlugins, resolveProfile } from './profile-plugins.js';

/** Cordis 插件入口（空 apply 的占位语义保留在下方 `apply`）。 */

/**
 * 路由路径与「恢复命令」纯逻辑在此再导出。
 *
 * 目的：`scripts/selfcheck.mjs` 直接 `import` 产物 `lib/index.js`，这样就能在 Node 里
 * 断言「重装命令怎么拼」「清单怎么校验」，而不必去跑客户端产物（浏览器 bundle 不是
 * ESM，Node 里 import 不了）。宿主半边与浏览器半边共用 `paths.ts` / `plugin-list.ts`，
 * 所以这里导出的是同一份实现，不是副本。
 */
export { PLUGINS_PATH, RESTART_PATH };
export { layerLabel, normalizePluginList, quoteArg, restoreCommand, statusLabel, totalRestoreScript } from './plugin-list.js';
export type { InstalledPlugin, PluginLayer, PluginListPayload } from './plugin-list.js';
export { readInstalledPlugins, resolveProfile };

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
 */
const RESTART_SCRIPT = String.raw`
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

/** Cordis 插件入口。 */
export function apply(ctx: HostCtx): void {
  const logger = ctx.logger?.('@oblivion/brand');
  const warn = (message: string): void => {
    logger?.warn(message);
  };
  // 先于重启路由：只写一个环境变量，越早越好（市场第一次发请求前生效）。
  installMarketRegistryOverride(ctx);
  installRestartRoute(ctx, warn);
  installPluginsRoute(ctx, warn);
}
