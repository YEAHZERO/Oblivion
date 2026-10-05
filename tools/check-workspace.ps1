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
  powershell -File tools/check-workspace.ps1              # = check：install + typecheck + test + build
  powershell -File tools/check-workspace.ps1 -Task test   # 只跑测试
#>
[CmdletBinding()]
param(
  [ValidateSet('check', 'install', 'typecheck', 'test', 'build', 'version')]
  [string]$Task = 'check'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

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

Push-Location $repoRoot
try {
  $version = (& $node $pnpm --version | Out-String).Trim()
  Write-Host ("工作区： " + $repoRoot) -ForegroundColor DarkGray
  Write-Host ("pnpm  ： " + $pnpm + "（v" + $version + "，由 " + $node + " 执行）") -ForegroundColor DarkGray

  if ($Task -eq 'install') {
    Invoke-Pnpm -TaskArgs @('install') -Label '安装工作区依赖（依赖只存一份）'
  }
  elseif ($Task -eq 'typecheck') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'typecheck') -Label '全部插件类型检查'
  }
  elseif ($Task -eq 'test') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'test') -Label '全部插件测试'
  }
  elseif ($Task -eq 'build') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'build') -Label '全部插件构建'
  }
  elseif ($Task -eq 'version') {
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'check:version') -Label 'VERSION 与 package.json 一致性'
  }
  else {
    Invoke-Pnpm -TaskArgs @('install') -Label '安装工作区依赖（依赖只存一份）'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'typecheck') -Label '全部插件类型检查'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'test') -Label '全部插件测试'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'build') -Label '全部插件构建'
    Invoke-Pnpm -TaskArgs @('-r', 'run', 'check:version') -Label 'VERSION 与 package.json 一致性'
  }

  Write-Host ("全部通过（task=" + $Task + "）") -ForegroundColor Green
}
finally {
  Pop-Location
}
