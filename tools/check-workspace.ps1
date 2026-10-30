<#
.SYNOPSIS
  Oblivion 工作区统一入口：用 **DSH 分发的受控 pnpm** 跑安装 / 类型检查 / 测试 / 构建。

.DESCRIPTION
  为什么需要这个脚本：DSH 只把 pnpm 作为**受控运行时**分发（pnpm.mjs 由它自带的 node 执行），
  这台机器上 pnpm 并不在 PATH 上 —— 于是 package.json 里若写 "pnpm run xxx"（嵌套调用）会
  "'pnpm' is not recognized"。本脚本在**运行时解析**运行时位置，不把机器路径写进仓库。

  语法刻意保持 Windows PowerShell 5.1 兼容（不要求 pwsh 7）。

  可通过环境变量覆盖（CI 或换机器时用）：
    DSH_RUNTIME_ROOT  DSH 运行时根目录（默认 %USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime）
    DSH_NODE          node 可执行文件
    DSH_PNPM          pnpm.mjs 路径

.EXAMPLE
  powershell -File tools/check-workspace.ps1                # = 契约 + install + typecheck + test + build + 版本 + selfcheck
  powershell -File tools/check-workspace.ps1 -Task test     # 只跑测试
  powershell -File tools/check-workspace.ps1 -Task compat   # 只跑 DSH 宿主契约校验
  powershell -File tools/check-workspace.ps1 -Task selfcheck# 只跑每包端到端自检
  powershell -File tools/check-workspace.ps1 -Task build -AllowRunning   # 覆盖「构建守卫」，见下
  powershell -File tools/check-workspace.ps1 -Task build -Filter '@oblivion/core'   # 只构建无 client 半边的包（DSH 活着也放行）

  构建守卫（2026-10-17 加）：`check` 与 `build` 两个 task 都可能**重写插件 client 产物**，
  而「应用运行中重写产物」会让正在启动/刷新的界面起不来（根因见 Assert-DshNotRunning）。
  所以这两个 task 默认在 DSH 活着时**直接拒绝**，想覆盖就显式加 `-AllowRunning`，
  并在跑完立刻**完全重启** DSH（不是只刷新窗口）。

  守卫的判词是「**这次构建会不会重写插件产物**」，不是「是不是构建」：用 `-Filter` 把范围收窄到
  **没有 client 半边**的包（纯 Host 插件，如 `@oblivion/core`）时，它一个插件产物都不碰，
  DSH 活着也安全 —— 这不叫豁免，是把判定算准（过度的规则会被绕过，那才是真风险）。
#>
[CmdletBinding()]
param(
  [ValidateSet('check', 'compat', 'install', 'typecheck', 'test', 'build', 'version', 'selfcheck')]
  [string]$Task = 'check',

  # 构建守卫的覆盖开关：默认「DSH 活着就拒绝构建」。理由见 Assert-DshNotRunning。
  [switch]$AllowRunning,

  # `-Task build` 的**范围收窄**：逗号分隔的**精确包名**（如 '@oblivion/core'），空 = 全工作区。
  #
  # 只有一个用途：让构建守卫的判定变精确 —— 范围里没有 client 半边时（纯 Host 插件不写
  # `lib/client.js`），重建不碰任何插件产物，DSH 活着也安全。见 Get-BuildScope。
  [string]$Filter
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# ---- 自检：本目录的 .ps1 必须带 UTF-8 BOM ----
#
# Windows PowerShell 5.1 会把**无 BOM** 的脚本按 ANSI/GBK 读：中文注释乱码 → 解析失败。
# 这条规则原本只写在 AGENTS.md 里，2026-10-06 就被踩中一次（编辑器改完 BOM 丢了），
# 而且报错内容（乱码 token）指向的是**错误的方向**（看起来像语法写错）。
# 所以改成机器检查，而不是靠人记。
function Assert-ScriptBom {
  $bad = @()
  Get-ChildItem $PSScriptRoot -Filter '*.ps1' -File | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    if (-not $hasBom) { $bad += $_.Name }
  }
  if ($bad.Count -gt 0) {
    throw ('以下脚本缺 UTF-8 BOM，PS 5.1 会按 ANSI 读、中文注释乱码导致解析失败：' + ($bad -join ', ') + '。修法：另存为「UTF-8 带 BOM」。')
  }
}
Assert-ScriptBom

# ---- 自检：构建产物里不得再有第二份版本号 ----
#
# `lib/VERSION` 曾是 build 脚本的产物，于是版本号有了第二个来源：包根 `VERSION`（真源）与
# `lib/VERSION`（产物）。2026-10-06 实测面板标题栏长期显示 0.0.1 —— 就是这个病。
# 产物随时可以重建，绝不该承载真源；所以这里机器检查，删掉就不会再悄悄长回来。
function Assert-NoLibVersion {
  $bad = @()
  Get-ChildItem $repoRoot -Directory -Filter 'oblivion-*' | ForEach-Object {
    $artifact = Join-Path $_.FullName 'lib\VERSION'
    if (Test-Path $artifact) { $bad += ($_.Name + '/lib/VERSION') }
  }
  if ($bad.Count -gt 0) {
    throw ('以下构建产物里有第二份版本号（VERSION 是唯一真源，产物不许再存一份）：' + ($bad -join ', ') +
      '。修法：删掉该文件，并确认 scripts/build.mjs 不再写它。')
  }
}
Assert-NoLibVersion

# ---- 构建守卫：DSH 活着的时候，不许重建插件 client 产物 ----
#
# 2026-10-17 的真故障（`%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-2026-10-17T01-48-07-569Z-web-boot.log`）：
# 应用**运行中**重建插件 ⇒ client 产物的 rev（`sha1(mtimeMs, ctimeMs, size)`，见
# `dsh-client-modules/lib/index.js:193`）变了，而正在启动/刷新的界面手里仍是**旧 rev** 的 URL；
# 宿主按「含 rev 的完整 URL」精确查表 ⇒ 旧 rev **404**（`:958-971`），且 `compose()` 只保留
# **上一代** batch 响应（`:681`）；客户端又规定「一个脚本加载失败 → 整条 combo 批跳过」
# （`dsh-client-modules/lib/client.js:629`）⇒ `web boot: 4 entries did not activate` ⇒
# 「DeepSeek Harness 无法使用」。四个未激活的 entry 与当时被重写的四个 client 包**逐一对应**：
# panel / brand / vimc。
#
# 修它的成本极低（关掉 App 再构建），漏掉的代价极高（界面起不来，只能走恢复对话框），
# 而 `pnpm check` 里就含 build ⇒ 靠人记必踩。所以这里机器拦，并把「为什么」写进报错。
function Get-RunningDshCarrier {
  $found = @()

  # ① 桌面端：Electron 的主/渲染/工具进程名都叫这个，捞到任意一个就说明 App 活着。
  $desktop = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)
  if ($desktop.Count -gt 0) {
    $head = @($desktop | Select-Object -First 3 | ForEach-Object { $_.Id }) -join '/'
    $tail = ''
    if ($desktop.Count -gt 3) { $tail = ' 等' }
    $found += ('桌面端 ' + $desktop.Count + ' 个进程（pid ' + $head + $tail + '）')
  }

  # ② 我们的插件宿主：心跳 / 装载留痕里记了 pid。桌面端之外的载体（如 `dsh web`）也能靠这条捞到，
  #    而且这条精确到「有插件在跑的宿主」，不依赖进程名 —— 从 DSH 内部跑构建同样会被拦下（本该如此）。
  $hostPids = @()
  foreach ($file in @(
      (Join-Path $env:USERPROFILE '.oblivion\bridge-heartbeat.json'),
      (Join-Path $env:USERPROFILE '.oblivion\data\mcp-channel-diag.json')
    )) {
    if (-not (Test-Path $file)) { continue }
    $pin = $null
    # 同上：不写 `-Encoding UTF8` 时 PS 5.1 按 ANSI 读，含中文的 `error` 字段会让 JSON 解析失败，
    # 于是这一条证据被 `catch` 静默丢掉（守卫漏报）。诊断文件里出现中文并不稀奇。
    try { $pin = (Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json).pid } catch { continue }
    if ($null -eq $pin) { continue }
    $proc = Get-Process -Id ([int]$pin) -ErrorAction SilentlyContinue
    if ($null -eq $proc) { continue }
    $hostPids += $proc.Id
  }
  $hostPids = @($hostPids | Sort-Object -Unique)
  if ($hostPids.Count -gt 0) {
    $found += ('插件宿主 pid ' + ($hostPids -join '/') + '（心跳 / 装载留痕）')
  }

  $found
}

# ---- 构建范围 → 「这次构建会不会重写插件产物」----
#
# 守卫最初的判词是「DSH 活着 ⇒ 拒绝」，但那条判词的**前提**是构建会重写插件 client 产物。
# 范围收窄到没有 client 半边的包时不成立（纯 Host 插件只产出 `lib/*.js`，一个插件产物都不碰），
# 此时拒绝就是过度设防 —— 而过度的规则会被绕过，那才是真风险。所以判词改成算准一件事：
# **这次构建会不会重写插件产物**。
#
# client 半边怎么认：看 `exports["./client"]` —— 宿主找客户端就只认这一个字段
# （`dsh-client-modules/lib/index.js` 的 clientExportOf），比「`lib/client.js` 存不存在」稳
# （产物可以被删掉，声明不会骗人）。
function Get-BuildScope {
  param([string]$FilterText)

  $packages = @()
  Get-ChildItem $repoRoot -Directory -Filter 'oblivion-*' | ForEach-Object {
    $manifestPath = Join-Path $_.FullName 'package.json'
    if (-not (Test-Path $manifestPath)) { return }
    $manifest = $null
    # 注意 `-Encoding UTF8`：PS 5.1 的 `Get-Content` 默认按 ANSI/GBK 读，中文注释会变成乱码
    # 而让 `ConvertFrom-Json` 直接报「传入的对象无效」—— 与 .ps1 的 BOM 规则同一个病根。
    try { $manifest = (Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return }
    if (-not $manifest.name) { return }
    $hasClient = $false
    if ($null -ne $manifest.exports) {
      $hasClient = @($manifest.exports.PSObject.Properties.Name) -contains './client'
    }
    $packages += [pscustomobject]@{ Name = $manifest.name; Dir = $_.Name; HasClient = $hasClient }
  }

  # 空 = 全工作区（保持原行为：全量构建必然重写产物 ⇒ DSH 活着就拒绝）。
  if ([string]::IsNullOrWhiteSpace($FilterText)) { return @() }

  $selected = @()
  foreach ($name in @($FilterText -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })) {
    $hit = @($packages | Where-Object { $_.Name -eq $name })
    if ($hit.Count -eq 0) {
      throw ('-Filter 里的包名在工作区里不存在：' + $name +
        '（可用的：' + (($packages | ForEach-Object { $_.Name }) -join ', ') + '）')
    }
    $selected += $hit
  }
  $selected
}

function Assert-DshNotRunning {
  param([object[]]$Scope = @())

  $running = @(Get-RunningDshCarrier)
  if ($running.Count -eq 0) { return }

  $who = $running -join '、'

  # 范围里一个 client 半边都没有 ⇒ 这次构建不重写插件产物 ⇒ 对运行中的界面无害（放行）。
  if ($Scope.Count -gt 0 -and @($Scope | Where-Object { $_.HasClient }).Count -eq 0) {
    Write-Host ('DSH 正在运行（' + $who + '），但本次范围（' + (($Scope | ForEach-Object { $_.Name }) -join ', ') +
      '）没有 client 半边 ⇒ 不重写插件产物，放行。') -ForegroundColor DarkGray
    return
  }

  if ($AllowRunning) {
    Write-Host ('⚠ DSH 正在运行（' + $who + '），-AllowRunning 已给：继续重建 client 产物。') -ForegroundColor Yellow
    Write-Host '  跑完请**立刻完全重启** DSH（不是只刷新窗口），否则界面可能起不来。' -ForegroundColor Yellow
    return
  }

  throw ('构建被拒绝：DSH 正在运行（' + $who + '）。' +
    '构建会重写插件 client 产物 ⇒ rev（sha1(mtimeMs, ctimeMs, size)）变化；运行中的 DSH 若此刻启动或刷新界面，' +
    '手里仍是旧 rev 的 URL，宿主对旧 rev 直接 404（且只保留上一代 batch 响应），一个脚本失败会连坐整条 combo 批 ⇒ ' +
    '「web boot: N entries did not activate」⇒「DeepSeek Harness 无法使用」。' +
    '2026-10-17 01:48Z 实测：3 个未激活 entry = 当时被重写的 3 个 client 包（panel / brand / vimc）。' +
    '怎么办：① 完全退出 DSH 后重跑；② 或加 -AllowRunning，跑完立刻完全重启 DSH（别只刷新窗口）；' +
    '③ 只改纯 Host 插件（@oblivion/core / @oblivion/http-bridge）时加 -Filter 收窄范围 —— 不重写任何插件产物，DSH 活着也安全。')
}

$runtimeRoot = $env:DSH_RUNTIME_ROOT
if (-not $runtimeRoot) {
  $runtimeRoot = Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime'
}
$node = $env:DSH_NODE
if (-not $node) {
  $node = Join-Path $runtimeRoot 'dependencies\node\bin\node.exe'
}
$pnpm = $env:DSH_PNPM
if (-not $pnpm) {
  $pnpm = Join-Path $runtimeRoot 'dependencies\pnpm\bin\pnpm.mjs'
}

if (-not (Test-Path $node)) { throw "找不到 DSH 运行时里的 node：$node（可用环境变量 DSH_NODE 指定）" }
if (-not (Test-Path $pnpm)) { throw "找不到 DSH 运行时里的 pnpm：$pnpm（可用环境变量 DSH_PNPM 指定）" }

function Invoke-Pnpm {
  param(
    [string[]]$TaskArgs,
    [string]$Label
  )
  Write-Host ("==> pnpm " + ($TaskArgs -join ' ') + "   # " + $Label) -ForegroundColor Cyan
  & $node $pnpm @TaskArgs
  if ($LASTEXITCODE -ne 0) { throw ("「" + $Label + "」失败（exit " + $LASTEXITCODE + "）") }
}

# ---- DSH 宿主契约校验（升级后最重要的一条）----
# 子进程调用：verify-dsh-compat.ps1 用 exit 收口，同进程调用会把本脚本一起结束。
function Invoke-Compat {
  $script = Join-Path $PSScriptRoot 'verify-dsh-compat.ps1'
  Write-Host '==> DSH 宿主契约校验   # 升级后「我的插件还活着吗」' -ForegroundColor Cyan
  & powershell -NoProfile -ExecutionPolicy Bypass -File $script
  if ($LASTEXITCODE -ne 0) { throw ('「DSH 宿主契约校验」失败（exit ' + $LASTEXITCODE + '）') }
}

Push-Location $repoRoot
try {
  $version = (& $node $pnpm --version | Out-String).Trim()
  Write-Host ("工作区： " + $repoRoot) -ForegroundColor DarkGray
  Write-Host ("pnpm  ： " + $pnpm + "（v" + $version + "，由 " + $node + " 执行）") -ForegroundColor DarkGray

  if (-not [string]::IsNullOrWhiteSpace($Filter) -and $Task -ne 'build') {
    throw ('-Filter 只对 -Task build 有意义（当前 task=' + $Task + '）。其余 task 要么不写产物（typecheck / test / version / selfcheck / compat），' +
      '要么必须全工作区一起验（check 含 install+typecheck+test+build）—— 静默忽略一个给出来的范围比报错更糟。')
  }

  if ($Task -eq 'install') {
    Invoke-Pnpm -TaskArgs @('install') -Label '安装工作区依赖（依赖只存一份）'
  }
  elseif ($Task -eq 'compat') {
    Invoke-Compat
  }
  elseif ($Task -eq 'typecheck') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'typecheck') -Label '全部插件类型检查'
  }
  elseif ($Task -eq 'test') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'test') -Label '全部插件测试'
  }
  elseif ($Task -eq 'build') {
    $scope = @(Get-BuildScope -FilterText $Filter)
    Assert-DshNotRunning -Scope $scope
    $buildArgs = @('-r')
    foreach ($target in $scope) { $buildArgs += @('--filter', $target.Name) }
    $label = '全部插件构建'
    if ($scope.Count -gt 0) { $label = '构建（范围：' + (($scope | ForEach-Object { $_.Name }) -join ', ') + '）' }
    Invoke-Pnpm -TaskArgs ($buildArgs + @('run', 'build')) -Label $label
  }
  elseif ($Task -eq 'version') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'check:version') -Label 'VERSION 与 package.json 一致性'
  }
  elseif ($Task -eq 'selfcheck') {
    Invoke-Pnpm -TaskArgs @('-r', '--if-present', 'run', 'selfcheck') -Label '每包端到端自检（装载形状 / 契约 / 副作用）'
  }
  else {
    Invoke-Compat
    Invoke-Pnpm -TaskArgs @('install') -Label '安装工作区依赖（依赖只存一份）'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'typecheck') -Label '全部插件类型检查'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'test') -Label '全部插件测试'
    Assert-DshNotRunning
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'build') -Label '全部插件构建'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'check:version') -Label 'VERSION 与 package.json 一致性'
    # selfcheck 必须在 build 之后：它 import 的是 lib/ 产物，不是源码。
    # 顺序错了会在「刚 clone 还没构建」时报 ERR_MODULE_NOT_FOUND，看起来像插件坏了。
    Invoke-Pnpm -TaskArgs @('-r', '--if-present', 'run', 'selfcheck') -Label '每包端到端自检（装载形状 / 契约 / 副作用）'
  }

  Write-Host ("全部通过（task=" + $Task + "）") -ForegroundColor Green
}
finally {
  Pop-Location
}

