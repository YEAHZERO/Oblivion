/**
 * web-login 遗留的 Chromium 传输进程清扫。
 *
 * ## 故障原形
 *
 * `dsh-deepseek-web-login` 用一个**独立 profile 目录**跑无头 Edge 做 DeepSeek 网页版
 * 的传输进程（`<DSH_HOME>/web-login/transport-profile`，见它自己 `lib/index.js:9316`），
 * 并在每次启动传输前 `rmSync(PROFILE_DIR, { recursive, force })`
 * （同文件 `:9399`）。而它在 DSH 里注册的关停动作（`cdp.close()` + `child.kill()`）
 * **只有优雅退出才会跑到**。
 *
 * 问题出在重启路径：本插件的重启 helper 用 `Stop-Process -Force` 结束宿主进程 ——
 * 硬杀，Node 没有任何退出时机，于是那 8 个 msedge 全部活下来。Windows **不会**在父进程
 * 死亡时连带杀死子进程，它们就成了孤儿，并且继续持有 profile 目录里的文件句柄。
 * 下一次探活（或下次启动传输）时 `rmSync` 抛 EPERM，被 web-login 写进每个账号的
 * `lastCheckError`，现场表现是「三个账号全红，但账号本身没问题」。
 *
 * 我们**改不了**第三方插件的拉起方式（升级会覆盖），所以清扫只能在外面做。
 *
 * ## 三个时机（缺一不可）
 *
 * | 时机 | 模式 | 为什么必须在这里 |
 * | --- | --- | --- |
 * | 装载时（`apply`） | `orphans` | 覆盖**不经过本插件按钮**的重启：崩溃、任务管理器结束进程、安装器升级。这是「以后不再复发」的那一条 |
 * | 重启按钮 | `orphans` | 让面板能立刻显示「这次清掉了几个」，不影响正在跑的传输进程 |
 * | 重启 helper 内 | `all` | 补刀。DSH 马上就要被硬杀，**当前**宿主拉起的那些传输进程此刻还是健康的，但硬杀之后它们必然变成孤儿 —— 所以这里必须全杀，不能只杀孤儿 |
 *
 * ## 判据（为什么不会误杀用户自己的 Edge）
 *
 * 只认**命令行里出现 transport profile 目录**的 msedge。那个目录在用户目录下
 * （`%USERPROFILE%\.dsh\...`），正常使用的 Edge 命令行里不会出现。
 * `orphans` 模式再收一层：种子只取**父进程已死**的，因此装载时（当前会话的传输进程
 * 可能正活着）也不会误伤健康进程。
 *
 * 两种模式共用同一条收尾规则：**只要一个进程的父进程在待杀集合里，它就被一起收进来**
 * （对 msedge 而言子进程挂在浏览器进程下，不在 DSH 下）。杀父不杀子，就是在亲手制造
 * 这个脚本要清除的那种孤儿。
 *
 * 全部**失败开放**：查询抛错、脚本缺失、超时都只是不清理，绝不阻断重启或装载。
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

/** 清扫模式：`orphans` 只杀父进程已死的；`all` 杀所有命中命令行的。 */
export type SweepMode = 'orphans' | 'all';

/** 一次清扫的产物（全部是计数，不含进程路径，便于直接回给浏览器）。 */
export interface SweepReport {
  mode: SweepMode;
  /** 这次 WMI 快照里扫过的进程总数。 */
  scanned: number;
  /** 命令行命中 transport profile 的进程数。 */
  matched: number;
  /** 结束掉的 PID（含「我们动手前已经自己退出了」的：杀父进程会带走子进程）。 */
  killed: number[];
  /** **确实没结束掉**的 PID（几乎只有权限拒绝）。 */
  failed: number[];
}

export type SweepOutcome = { ok: true; report: SweepReport } | { ok: false; error: string };

/** 清扫脚本落点。与重启 helper 同一个临时目录；helper 会调用它（`-Mode all`）。 */
export const ORPHAN_SCRIPT_PATH = join(tmpdir(), 'obl-brand-orphans.ps1');

/**
 * 装载期的自动清扫开关。
 *
 * 设成 `off` / `0` / `false` / `no` 就**一个进程都不动**（重启路径的清扫不受影响 ——
 * 那一条是重启正确性的一部分）。这是本插件最"越界"的动作，所以留一个运营者开关，
 * 与「品牌接管可完全关闭」同一套理念。
 */
export const MOUNT_SWEEP_ENV = 'OBLIVION_BRAND_ORPHAN_SWEEP';

/** 装载期自动清扫是否被关掉。 */
export function mountSweepDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[MOUNT_SWEEP_ENV] ?? '').trim().toLowerCase();
  return raw === 'off' || raw === '0' || raw === 'false' || raw === 'no';
}

/**
 * web-login 的传输 profile 目录。
 *
 * 与它自己的算法同源（`process.env.DSH_HOME || join(homedir(), ".dsh")`，空串视同未设）。
 */
export function resolveTransportProfileDir(
  env: NodeJS.ProcessEnv = process.env,
  homeDir: string = homedir(),
): string {
  const configured = (env['DSH_HOME'] ?? '').trim();
  const home = configured === '' ? join(homeDir, '.dsh') : configured;
  return join(home, 'web-login', 'transport-profile');
}

/**
 * 清扫脚本正文（**纯 ASCII**）。
 *
 * ⚠️ 与重启 helper 同一条铁律：它由 Windows PowerShell 5.1 执行，而 5.1 对**无 BOM** 的
 * `.ps1` 按 ANSI 解码 —— 正文里只要有中文就会在解析期失败，连 `try` 都进不去。
 * 所以正文全 ASCII，写入时另加 UTF-8 BOM（见 `writeOrphanScript`）。
 *
 * 输出约定：**最后一行**是一行 ASCII JSON
 * `{"ok":true,"mode":"orphans","scanned":N,"matched":N,"killed":[...],"failed":[...]}`，
 * 由 Node 侧 `parseSweepOutput()` 解析。诊断信息走 `-LogPath`（若给了）与 stderr，
 * 因此 stdout 可以保持干净。
 *
 * ⚠️ 脚本里**不许写 `exit`**：它会被重启 helper 用 `& $SweepScript` 在**同一个会话**里调用，
 * 而 `exit` 结束的是整个会话 —— helper 会在「准备重启」的中途直接退出，
 * 表现为「面板说已受理、应用却一直不重启」。这也是为什么它不能自己派生。
 *
 * ⚠️ `Get-CimInstance -Property` 是**白名单**：没列进 `-Property` 的字段取回来是 `$null`。
 * 过滤可执行文件名就必须把 `ExecutablePath` 列上（现场实测：只写 `ProcessId, CommandLine`
 * 时 347 个进程的 `ExecutablePath` **全是空**，于是过滤器把所有进程都 `continue` 掉，
 * 清扫静默变成空操作）。
 */
export const ORPHAN_SCRIPT = String.raw`
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

/**
 * 把清扫脚本写到临时目录（幂等；返回落点，失败返回 `null`）。
 */
export function writeOrphanScript(): string | null {
  try {
    // ⚠️ 必须带 UTF-8 BOM：Windows PowerShell 5.1 对无 BOM 的 .ps1 按 ANSI 解码。
    writeFileSync(ORPHAN_SCRIPT_PATH, `\uFEFF${ORPHAN_SCRIPT}`, 'utf8');
    return ORPHAN_SCRIPT_PATH;
  } catch {
    return null;
  }
}

/**
 * 解析清扫脚本的输出。
 *
 * 取**最后一行非空**再 `JSON.parse`，并逐字段校验形状 —— 脚本是外部进程，
 * 它的输出必须当成不可信输入（宁可返回 `null` 也不把半个对象放进报告里）。
 */
export function parseSweepOutput(stdout: string): SweepReport | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(lines[lines.length - 1]!);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = parsed as Record<string, unknown>;
  if (raw['ok'] !== true) return null;
  if (raw['mode'] !== 'orphans' && raw['mode'] !== 'all') return null;
  const numbers = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) return null;
    const out: number[] = [];
    for (const item of value) {
      if (typeof item !== 'number' || !Number.isInteger(item)) return null;
      out.push(item);
    }
    return out;
  };
  const killed = numbers(raw['killed']);
  const failed = numbers(raw['failed']);
  if (killed === null || failed === null) return null;
  if (typeof raw['scanned'] !== 'number' || typeof raw['matched'] !== 'number') return null;
  return {
    mode: raw['mode'],
    scanned: raw['scanned'],
    matched: raw['matched'],
    killed,
    failed,
  };
}

export interface SweepOptions {
  /** PowerShell 绝对路径（由调用方解析，见 `resolvePowerShell`）。 */
  shell: string;
  mode?: SweepMode;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  timeoutMs?: number;
}

/** 默认硬超时：清扫是**尽力而为**的动作，卡住也不能拖住重启或装载。 */
const SWEEP_TIMEOUT_MS = 15_000;

/**
 * 跑一次清扫。
 *
 * 不抛异常：所有失败都收成 `{ ok: false, error }`。
 */
export async function sweepTransportOrphans(options: SweepOptions): Promise<SweepOutcome> {
  const mode: SweepMode = options.mode ?? 'orphans';
  const profileDir = resolveTransportProfileDir(
    options.env ?? process.env,
    options.homeDir ?? homedir(),
  );
  const scriptPath = writeOrphanScript();
  if (scriptPath === null) {
    return { ok: false, error: '清扫脚本写入失败' };
  }
  const timeoutMs = options.timeoutMs ?? SWEEP_TIMEOUT_MS;

  return await new Promise<SweepOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: SweepOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    try {
      const child = spawn(
        options.shell,
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          scriptPath,
          '-Mode',
          mode,
          '-ProfileDir',
          profileDir,
        ],
        // 与重启 helper 同一条实测结论：detached 必须为 false（5.1 需要控制台）。
        { detached: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* 已经退出了 */
        }
        finish({ ok: false, error: `清扫脚本超时（${String(timeoutMs)}ms）` });
      }, timeoutMs);

      // 必须监听 error：ENOENT / EPERM 只以事件形式出现，不监听就彻底静默。
      child.on('error', (error) => {
        clearTimeout(timer);
        finish({ ok: false, error: error.message });
      });
      child.on('close', () => {
        clearTimeout(timer);
        const report = parseSweepOutput(stdout);
        if (report === null) {
          finish({ ok: false, error: stderr.trim() || '清扫脚本没有输出可解析的报告' });
          return;
        }
        finish({ ok: true, report });
      });
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

/** 一句话摘要（日志与面板共用同一口径）。 */
export function describeSweep(report: SweepReport): string {
  const cleaned = report.killed.length === 0 ? '无孤儿进程' : `清理 ${String(report.killed.length)} 个孤儿进程`;
  const failed = report.failed.length > 0 ? `，${String(report.failed.length)} 个结束失败` : '';
  return `${cleaned}（扫描 ${String(report.scanned)} 个进程，命中 ${String(report.matched)} 个传输进程${failed}）`;
}
