<#
.SYNOPSIS
  DSH 升级后的兼容性校验：逐个断言每个 Oblivion 插件**依赖的宿主扩展点**是否仍然存在。

.DESCRIPTION
  为什么需要它：DSH 升级时坏掉的**不是你的代码，而是你依赖的契约**。
  而且多数契约失效是**静默**的 —— 槽位改名后品牌位什么都不渲染，界面不报错，你只会觉得
  「插件好像没生效」。

  本脚本把每个插件声明的契约（package.json 的 `dsh.compat.requires`）逐条**对宿主取证**：
  槽位名与 kind 从 `packages/client/**/contract/slots.ts` 原文比对，客户端包名从各自的
  package.json 比对，`__ModuleLoader__` 契约从源码比对 —— 每条都给出 `文件:行` 作为证据。

  为什么能取证：`~/.config/dshx/harness` 指向的 DSH checkout 与本机安装的是同一版本
  （DSHX 用 DESK_HARNESS_SHA 钉住）。因此它既能在升级后校验，也能在升级前预演。

  语法保持 Windows PowerShell 5.1 兼容；**本文件必须带 UTF-8 BOM**（5.1 会把无 BOM 脚本
  按 ANSI 读，中文注释会乱码并导致解析失败）。

  环境变量覆盖（换机器 / CI 用）：
    DSH_APP_ROOT       DSH 桌面安装目录（默认 C:\Programs\AITech\DeepSeekHarness）
    DSH_HARNESS_ROOT   DSH 源码 checkout（默认读 ~/.config/dshx/harness）

.EXAMPLE
  powershell -File tools/verify-dsh-compat.ps1
  powershell -File tools/verify-dsh-compat.ps1 -Plugin oblivion-brand
#>
[CmdletBinding()]
param(
  [string]$Plugin,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# ---------------------------------------------------------------- 环境解析
$appRoot = $env:DSH_APP_ROOT
if (-not $appRoot) { $appRoot = 'C:\Programs\AITech\DeepSeekHarness' }

$harnessRoot = $env:DSH_HARNESS_ROOT
if (-not $harnessRoot) {
  $pointer = Join-Path $env:USERPROFILE '.config\dshx\harness'
  if (Test-Path $pointer) { $harnessRoot = ([System.IO.File]::ReadAllText($pointer)).Trim() }
}

# ---------------------------------------------------------------- 工具函数
function Read-Utf8([string]$path) { return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) }
function Read-Json([string]$path) { return (Read-Utf8 $path | ConvertFrom-Json) }

function Write-Line([string]$text, [string]$color) {
  if ($Quiet -and $color -eq 'DarkGray') { return }
  if ($color) { Write-Host $text -ForegroundColor $color } else { Write-Host $text }
}

# 版本比较：支持 x.y.z[-pre]。返回 -1 / 0 / 1。
function Compare-Ver([string]$a, [string]$b) {
  $pa = $a.Split('-'); $pb = $b.Split('-')
  $na = $pa[0].Split('.'); $nb = $pb[0].Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $va = 0; $vb = 0
    if ($i -lt $na.Count) { $va = [int]$na[$i] }
    if ($i -lt $nb.Count) { $vb = [int]$nb[$i] }
    if ($va -lt $vb) { return -1 }
    if ($va -gt $vb) { return 1 }
  }
  # 数字段相同：有 prerelease 的更小（0.2.0-rc.2 < 0.2.0）
  $ra = ($pa.Count -gt 1); $rb = ($pb.Count -gt 1)
  if ($ra -and -not $rb) { return -1 }
  if ($rb -and -not $ra) { return 1 }
  if (-not $ra -and -not $rb) { return 0 }
  return ([string]::Compare($pa[1], $pb[1], [StringComparison]::Ordinal))
}

# 判断版本是否落在 ">=A <B" / ">=A" 这样的范围里。
function Test-VerRange([string]$version, [string]$range) {
  $ok = $true
  foreach ($term in ($range -split '\s+')) {
    if ($term -eq '') { continue }
    if ($term.StartsWith('>=')) {
      if ((Compare-Ver $version $term.Substring(2)) -lt 0) { $ok = $false }
    } elseif ($term.StartsWith('<=')) {
      if ((Compare-Ver $version $term.Substring(2)) -gt 0) { $ok = $false }
    } elseif ($term.StartsWith('<')) {
      if ((Compare-Ver $version $term.Substring(1)) -ge 0) { $ok = $false }
    } elseif ($term.StartsWith('>')) {
      if ((Compare-Ver $version $term.Substring(1)) -le 0) { $ok = $false }
    } else {
      if ((Compare-Ver $version $term) -ne 0) { $ok = $false }
    }
  }
  return $ok
}

# 在 harness 里找一个字符串，返回第一处 "相对路径:行号"；找不到返回 $null。
$script:searchCache = @{}
function Find-InHarness([string]$needle, [string]$subDir, [string[]]$include) {
  $key = $subDir + '|' + $needle
  if ($script:searchCache.ContainsKey($key)) { return $script:searchCache[$key] }

  $root = Join-Path $harnessRoot $subDir
  $result = $null
  if (Test-Path $root) {
    $hit = Get-ChildItem $root -Recurse -File -Include $include -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\node_modules\\|\\tests\\' } |
      Select-String -SimpleMatch -Pattern $needle -List -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($hit) {
      $rel = $hit.Path.Substring($harnessRoot.Length + 1)
      $result = $rel + ':' + $hit.LineNumber
    }
  }
  $script:searchCache[$key] = $result
  return $result
}

# ---------------------------------------------------------------- 宿主版本
$desktopVersion = $null
$runtimeJson = Join-Path $appRoot 'resources\runtime\primary-runtime\runtime.json'
if (Test-Path $runtimeJson) { $desktopVersion = (Read-Json $runtimeJson).desktopVersion }

$harnessVersion = $null
$harnessHead = $null
if ($harnessRoot -and (Test-Path (Join-Path $harnessRoot '.git'))) {
  Push-Location $harnessRoot
  try {
    $harnessHead = (& git log --oneline -1 2>$null | Out-String).Trim()
    $harnessVersion = (& git describe --tags 2>$null | Out-String).Trim()
  } finally { Pop-Location }
}

Write-Line ''
Write-Line '=== DSH 兼容性校验 ===' 'Cyan'
Write-Line ('DSH 桌面版本 : ' + $(if ($desktopVersion) { $desktopVersion } else { '（未取到）' }) + '   # ' + $runtimeJson) 'DarkGray'
if ($harnessRoot) {
  Write-Line ('契约证据源   : ' + $harnessRoot + ' @ ' + $harnessVersion + '  (' + $harnessHead + ')') 'DarkGray'
  if ($harnessVersion -and $desktopVersion -and $harnessVersion -ne ('dsh-v' + $desktopVersion)) {
    Write-Line ('  ⚠️ checkout 版本与已安装版本不一致 —— 证据只对 checkout 有效，去 ~/.config/dshx/harness 改成对的那份') 'Yellow'
  }
} else {
  Write-Line '契约证据源   : 未找到（设置 DSH_HARNESS_ROOT 或写 ~/.config/dshx/harness）' 'Yellow'
}

# ---------------------------------------------------------------- 逐个插件
$pluginDirs = Get-ChildItem $repoRoot -Directory |
  Where-Object { $_.Name -like 'oblivion-*' -and (Test-Path (Join-Path $_.FullName 'package.json')) }
if ($Plugin) { $pluginDirs = $pluginDirs | Where-Object { $_.Name -eq $Plugin } }

$totalFail = 0
$index = 0
foreach ($dir in $pluginDirs) {
  $index++
  $pkg = Read-Json (Join-Path $dir.FullName 'package.json')
  $compat = $pkg.dsh.compat
  Write-Line ''
  Write-Line ('[' + $index + '/' + $pluginDirs.Count + '] ' + $pkg.name + '  v' + $pkg.version) 'White'

  if (-not $compat) {
    Write-Line  '  ⚠️ 未声明 dsh.compat —— 无法在升级时自动判断是否还兼容' 'Yellow'
    $totalFail++
    continue
  }

  $req = $compat.requires
  $checks = New-Object System.Collections.ArrayList
  function Add-Check([string]$kind, [string]$what, [bool]$pass, [string]$evidence) {
    [void]$checks.Add([PSCustomObject]@{ Kind = $kind; What = $what; Pass = $pass; Evidence = $evidence })
  }

  # ① 宿主版本范围
  if ($compat.host) {
    $pass = $false
    if ($desktopVersion) { $pass = Test-VerRange $desktopVersion $compat.host }
    Add-Check 'host' ('桌面端 ' + $desktopVersion + ' 落在 ' + $compat.host) $pass $runtimeJson
  }

  # ② 槽位 kind —— 最强证据：契约原文的**声明形式** `'<slot>': { kind: '<kind>'`
  #
  # 刻意**不**用裸槽位名匹配：`'main'` 这类短名会命中使用方或无关条目，于是校验
  # 「通过得莫名其妙」—— 那比不校验更坏。声明形式含 kind，唯一且可证。
  $kinded = @{}
  if ($req.slotKinds) {
    foreach ($prop in $req.slotKinds.PSObject.Properties) {
      $slot = $prop.Name; $want = $prop.Value
      $kinded[$slot] = $true
      $ev = Find-InHarness ("'" + $slot + "': { kind: '" + $want + "'") 'packages\client' @('*.ts')
      Add-Check 'slotKind' ($slot + ' = ' + $want) ([bool]$ev) $(if ($ev) { $ev } else { 'kind 已变或槽位已删' })
    }
  }

  # ③ 只声明了名字、没断言 kind 的槽位：退一步找 `'<slot>':` 声明形式（仍比裸名强）
  if ($req.slots) {
    foreach ($slot in $req.slots) {
      if ($kinded.ContainsKey($slot)) { continue }
      $ev = Find-InHarness ("'" + $slot + "':") 'packages\client' @('*.ts')
      Add-Check 'slot' $slot ([bool]$ev) $(if ($ev) { $ev + '（仅声明，未断言 kind）' } else { '契约里找不到该槽位声明' })
    }
  }

  # ③ 客户端包存在（按 checkout 里各自 package.json 的 name 比对）
  if ($req.clientPackages) {
    $clientRoot = Join-Path $harnessRoot 'packages\client'
    $names = @{}
    if (Test-Path $clientRoot) {
      foreach ($d in (Get-ChildItem $clientRoot -Directory)) {
        $pj = Join-Path $d.FullName 'package.json'
        if (Test-Path $pj) { $names[(Read-Json $pj).name] = $d.Name }
      }
    }
    foreach ($want in $req.clientPackages) {
      $found = $names.ContainsKey($want)
      Add-Check 'clientPkg' $want $found $(if ($found) { 'packages\client\' + $names[$want] } else { 'checkout 里没有这个包名' })
    }
  }

  # ④ 客户端模块契约（如 __ModuleLoader__）
  if ($req.clientContract) {
    foreach ($needle in $req.clientContract) {
      $ev = Find-InHarness $needle 'packages\client' @('*.ts', '*.tsx')
      Add-Check 'clientContract' $needle ([bool]$ev) $(if ($ev) { $ev } else { '客户端模块契约里找不到' })
    }
  }

  # ⑤ 服务名（较弱：只证明这个名字在客户端包里出现过）
  if ($req.services) {
    foreach ($svc in $req.services) {
      $ev = Find-InHarness ("'" + $svc + "'") 'packages\client' @('*.ts')
      Add-Check 'service' $svc ([bool]$ev) $(if ($ev) { $ev + '（仅证明名字出现）' } else { '客户端包里找不到该服务名' })
    }
  }

  # ⑥ 已挂载进 desktop profile（否则插件根本没被加载）
  $profilePkg = Join-Path $env:USERPROFILE '.dsh\profiles\desktop\package.json'
  if (Test-Path $profilePkg) {
    $prof = Read-Json $profilePkg
    $inDeps = @($prof.dependencies.PSObject.Properties.Name) -contains $pkg.name
    $inBundles = @($prof.dsh.profile.bundles) -contains $pkg.name
    Add-Check 'mount' ('profile.dependencies') $inDeps $profilePkg
    if ($pkg.dsh.bundle) {
      Add-Check 'mount' ('profile.bundles（自带 bundle patch）') $inBundles $profilePkg
    }
  }

  foreach ($c in $checks) {
    $mark = 'PASS'
    $color = 'DarkGray'
    if (-not $c.Pass) { $mark = 'FAIL'; $color = 'Red' }
    $line = '  {0,-5} {1,-16} {2,-52} {3}' -f $mark, $c.Kind, $c.What, $c.Evidence
    Write-Line $line $color
  }

  $failed = @($checks | Where-Object { -not $_.Pass }).Count
  $totalFail += $failed
  if ($failed -eq 0) {
    Write-Line ('  => PASS（' + $checks.Count + '/' + $checks.Count + '）') 'Green'
  } else {
    Write-Line ('  => FAIL（' + $failed + '/' + $checks.Count + ' 项不通过）') 'Red'
  }
}

Write-Line ''
if ($totalFail -eq 0) {
  Write-Line '结果：全部插件的宿主契约仍然成立。' 'Green'
  exit 0
} else {
  Write-Line ('结果：' + $totalFail + ' 项不通过 —— 升级已破坏契约，按上面的证据逐个修插件。') 'Red'
  exit 1
}
