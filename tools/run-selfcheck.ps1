<#
每个包的 selfcheck 跑批入口。

为什么单独一个脚本：check-workspace.ps1 的 -Task 用了 ValidateSet
(check/compat/install/typecheck/test/build/version)，不认 selfcheck；
而 selfcheck 恰恰是抓「装载失败」的那一层 —— 2026-10-06 的 App 崩溃、路由数变化、
缺失导入全靠它才暴露。所以它必须进 check。

用法：powershell -File tools/run-selfcheck.ps1
#>
$ErrorActionPreference = 'Stop'

$runtimeRoot = if ($env:DSH_RUNTIME) { $env:DSH_RUNTIME } else { Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime' }
$node = if ($env:DSH_NODE) { $env:DSH_NODE } else { Join-Path $runtimeRoot 'dependencies\node\bin\node.exe' }
$pnpm = if ($env:DSH_PNPM) { $env:DSH_PNPM } else { Join-Path $runtimeRoot 'dependencies\pnpm\bin\pnpm.mjs' }

if (-not (Test-Path $node)) { throw "找不到 node：$node（可用 DSH_NODE 指定）" }
if (-not (Test-Path $pnpm)) { throw "找不到 pnpm：$pnpm（可用 DSH_PNPM 指定）" }

$repoRoot = Split-Path -Parent $PSScriptRoot
Write-Host '== selfcheck（每包端到端自检）==' -ForegroundColor Cyan

Push-Location $repoRoot
try {
  & $node $pnpm -r --if-present run selfcheck
  if ($LASTEXITCODE -ne 0) { throw "selfcheck 失败（exit $LASTEXITCODE）" }
} finally {
  Pop-Location
}

Write-Host 'selfcheck 全部通过' -ForegroundColor Green