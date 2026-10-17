#Requires -Version 5.1
<#
.SYNOPSIS
  把一段文字作为**用户消息**推给运行中的 DSH 会话（走 @oblivion/brand 的注入路由）。

.DESCRIPTION
  「每轮一条正式摘要」这条工作流的执行端：在 OpenCode（或任何别处的 agent）里做完一轮，
  把这一轮的正式摘要推给 DSH 的那条会话 —— 你在 DSH 界面里就能看到它。

  为什么给它一个脚本，而不是每次手写 Invoke-RestMethod：

    ① **端口每次启动都会变**（实测 19387 → …）。本脚本自己认端口（见下），并把认到的结果
       缓存在 <USERPROFILE>\.oblivion\data\brand-endpoint.json，下次直接命中；
    ② 摘要是**多行**文本，还带引号 / 反引号 / 中文 ⇒ 从文件读（-TextFile），别在命令行里转义；
    ③ requestId 默认按**内容**算（sha1(session + 正文) 前 12 位）⇒ 同一段摘要重推两次不会在
       会话里出现两条：脚本重试是安全的（路由按 requestId 幂等）。

  认端口的三步（任一探测成功即停）：

    ① `-Port` 明确指定；
    ② 缓存文件（pid 还活着 **且** 探测得到 200 才用）；
    ③ 现算：心跳 / 装载留痕里的插件宿主 pid → 取它监听的端口 → 逐个探
       `GET /obl-brand/plugins`，回 200 的就是它（这条是只读路由，探测没有副作用）。

  代价说明（别装看不见）：注入一条 = **驱动 DSH 跑一轮 agent**（花额度、会真的产出回答），
  所以它是「每轮一条」，不是「每步一条」。

  安全口径：只调 127.0.0.1、只调品牌插件的注入路由（那条路由自己还有 isTrustedCaller 与
  OBLIVION_BRAND_SESSION_INJECT 两道闸）；`-DryRun` 只认端口，不注入。

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/push-to-dsh.ps1 `
    -Session session-10837d9b-ba07-420d-a8d3-3e14e1972481 -TextFile $env:TEMP\round.md

.EXAMPLE
  # 只认端口、只回显将要发什么，不真的注入
  powershell -File tools/push-to-dsh.ps1 -Session session-… -Text '一句话' -DryRun
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Session,
  [string]$Text,
  [string]$TextFile,
  [string]$RequestId,
  [int]$Port,
  [ValidateSet('queue', 'steer')][string]$Mode = 'queue',
  [switch]$DryRun,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'

# 与路由的 MAX_SESSION_MESSAGE_CHARS 对齐：超了路由会 400，这里先说清楚。
$MaxChars = 20000
$CachePath = Join-Path $env:USERPROFILE '.oblivion\data\brand-endpoint.json'

function Resolve-Text {
  if ($Text -and $TextFile) { throw '-Text 与 -TextFile 只能给一个。' }
  if ($TextFile) {
    if (-not (Test-Path $TextFile)) { throw ('找不到 -TextFile：' + $TextFile) }
    $raw = Get-Content $TextFile -Raw -Encoding UTF8
  }
  elseif ($Text) { $raw = $Text }
  else { throw '必须给 -Text 或 -TextFile。' }

  if (-not $raw -or $raw.Trim().Length -eq 0) { throw '正文是空的（路由也会 400）。' }
  if ($raw.Length -gt $MaxChars) { throw ('正文 ' + $raw.Length + ' 字符，超过路由上限 ' + $MaxChars + '。') }
  $raw
}

# 认端口的判据：品牌插件自己那条**只读**路由回 200。
function Test-BrandPort {
  param([int]$Candidate)
  try {
    $response = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $Candidate + '/obl-brand/plugins') `
      -UseBasicParsing -TimeoutSec $TimeoutSec
    return ($response.StatusCode -eq 200)
  }
  catch { return $false }
}

# 候选 pid：先我们自己的宿主（心跳 / 装载留痕），再桌面端进程。
function Get-DshHostPids {
  $pids = @()
  foreach ($file in @(
      (Join-Path $env:USERPROFILE '.oblivion\bridge-heartbeat.json'),
      (Join-Path $env:USERPROFILE '.oblivion\data\mcp-channel-diag.json')
    )) {
    if (-not (Test-Path $file)) { continue }
    try { $pin = (Get-Content $file -Raw | ConvertFrom-Json).pid } catch { continue }
    if ($null -ne $pin) { $pids += [int]$pin }
  }
  foreach ($proc in @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)) {
    $pids += $proc.Id
  }
  @($pids | Sort-Object -Unique)
}

function Get-ListeningPorts {
  param([int[]]$ProcIds)
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return @() }
  $ports = @()
  # 变量名不能用 $pid：它是只读自动变量，PS 5.1 会抛 VariableNotWritable
  # （2026-10-16 的孤儿清扫就在这上面踩过，见 .memory/daily/2026-10-16.md）。
  foreach ($owner in $ProcIds) {
    $ports += @(Get-NetTCPConnection -State Listen -OwningProcess $owner -ErrorAction SilentlyContinue |
        ForEach-Object { $_.LocalPort })
  }
  @($ports | Sort-Object -Unique)
}

$text = Resolve-Text
$hostPids = Get-DshHostPids

$resolvedPort = 0
$from = ''
$cacheOwnerId = 0
if ($hostPids.Count -gt 0) { $cacheOwnerId = $hostPids[0] }

# ① -Port
if ($Port -gt 0) {
  if (-not (Test-BrandPort -Candidate $Port)) {
    throw ('-Port ' + $Port + ' 上没认出品牌路由（GET /obl-brand/plugins 不是 200）。')
  }
  $resolvedPort = $Port
  $from = '-Port'
}

# ② 缓存
if ($resolvedPort -eq 0 -and (Test-Path $CachePath)) {
  $cache = $null
  try { $cache = Get-Content $CachePath -Raw | ConvertFrom-Json } catch { $cache = $null }
  if ($null -ne $cache -and $null -ne $cache.port) {
    $alive = ($null -ne (Get-Process -Id ([int]$cache.pid) -ErrorAction SilentlyContinue))
    if ($alive -and (Test-BrandPort -Candidate ([int]$cache.port))) {
      $resolvedPort = [int]$cache.port
      $from = '缓存'
      if ($null -ne $cache.pid) { $cacheOwnerId = [int]$cache.pid }
    }
  }
}

# ③ 现算
if ($resolvedPort -eq 0) {
  if ($hostPids.Count -eq 0) {
    throw '找不到 DSH 进程（心跳 / 装载留痕 / 进程名都不认）——DSH 没在跑，或用 -Port 手填。'
  }
  $candidates = Get-ListeningPorts -ProcIds $hostPids
  if ($candidates.Count -eq 0) {
    throw 'DSH 在跑，但列不出它的监听端口（Get-NetTCPConnection 不可用？）——请用 -Port 指定。'
  }
  foreach ($candidate in $candidates) {
    if (Test-BrandPort -Candidate $candidate) {
      $resolvedPort = $candidate
      break
    }
  }
  if ($resolvedPort -eq 0) {
    throw ('探测了 ' + ($candidates -join '/') + ' 个端口，都没有认出品牌路由 —— 插件没装，还是宿主刚重启？')
  }
  $from = '现算'
}

# 认住了才缓存：缓存里的端口是**探测出来**的，不是猜的，所以复用时仍会先探一次。
try {
  $endpoint = @{ port = $resolvedPort; pid = $cacheOwnerId; at = [DateTime]::UtcNow.ToString('o') }
  [System.IO.File]::WriteAllText($CachePath, ($endpoint | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
}
catch { Write-Host ('（缓存写不进去，忽略：' + $_.Exception.Message + '）') -ForegroundColor DarkYellow }

if (-not $RequestId) {
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Session + "`n" + $text)
    $hex = ($sha1.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join ''
    $RequestId = 'mirror-' + $hex.Substring(0, 12)
  }
  finally { $sha1.Dispose() }
}

$url = 'http://127.0.0.1:' + $resolvedPort + '/obl-brand/session/message'
Write-Host ('端口 ' + $resolvedPort + '（' + $from + '）｜会话 ' + $Session + '｜正文 ' + $text.Length +
  ' 字符｜mode ' + $Mode + '｜requestId ' + $RequestId) -ForegroundColor DarkGray

if ($DryRun) {
  Write-Host ('-DryRun：不注入。目标 ' + $url) -ForegroundColor Yellow
  exit 0
}

$payload = @{ sessionId = $Session; text = $text; mode = $Mode; requestId = $RequestId } | ConvertTo-Json -Depth 4
try {
  $response = Invoke-RestMethod -Method Post -Uri $url -TimeoutSec $TimeoutSec `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
}
catch {
  $detail = ''
  if ($_.ErrorDetails) { $detail = $_.ErrorDetails.Message }
  if (-not $detail) { $detail = $_.Exception.Message }
  throw ('注入失败：' + $detail)
}

Write-Host ($response | ConvertTo-Json -Depth 6) -ForegroundColor DarkGray
Write-Host '已注入：DSH 里会立刻多一条用户消息，并驱动一轮 agent（回答用 GET /obl-brand/session/tail 读回）。' -ForegroundColor Green
