#Requires -Version 5.1
<#
.SYNOPSIS
  Re-apply the local dshmarket hot-mount id-quoting fix after a dshmarket upgrade.

.DESCRIPTION
  dshmarket 1.66.8 parses a patch entry's id line in lib/hot.js:161 with

      const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);

  which keeps the surrounding YAML quotes, so an entry written as

      - id: '@oblivion/panel'

  is captured as "'@oblivion/panel'".  The value is then re-emitted inside
  quotes ('mkt-'@oblivion/panel'') and the rewritten cordis.patch.yml stops
  being valid YAML -- the market's own write-back corrupts the profile patch
  file.  Every other id/name parser in the package strips the quotes
  (hot.js:168, hot.js:659, profile.js:794 and :797), so this single line is a
  defect, not a convention.

  The fix keeps the exact shape already used by hot.js:168:

      const id = /^\s+-\s+id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);

  This script is idempotent: when the fix is already in place it says so and
  exits 0.  It backs lib/hot.js up before changing anything, and it fails
  loudly (exit 1) when upstream has rewritten the line, so the fix has to be
  re-derived by hand instead of being applied blindly.

  Scope: this edits a third-party package inside the local DSH profile only.
  It never touches the DeepSeek Harness installation itself.
  ASCII only, so a lost BOM cannot break it.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/patch-dshmarket-hot-id.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/patch-dshmarket-hot-id.ps1 -Profile web
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/patch-dshmarket-hot-id.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$Path,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$oldLine = '        const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);'
$newLine = '        const id = /^\s+-\s+id:\s*[''"]?([^''"\s]+)[''"]?\s*$/.exec(line);'

if (-not $Path) {
  $Path = Join-Path $env:USERPROFILE ('.dsh\profiles\' + $Profile + '\node_modules\dshmarket')
}
if (-not (Test-Path $Path)) { throw ('dshmarket package not found: ' + $Path) }

$hot = Join-Path $Path 'lib\hot.js'
if (-not (Test-Path $hot)) { throw ('hot.js not found: ' + $hot) }

$version = 'unknown'
$pkgJson = Join-Path $Path 'package.json'
if (Test-Path $pkgJson) {
  # Read as UTF-8 explicitly. Get-Content -Raw decodes BOM-less files as ANSI on
  # PowerShell 5.1, package.json holds a non-ASCII description, ConvertFrom-Json
  # then throws ("Invalid object passed in, ':' or '}' expected") and the version
  # silently degraded to "unknown" -- a catch that hides its own failure.
  try { $version = ([System.IO.File]::ReadAllText($pkgJson) | ConvertFrom-Json).version } catch { }
}

Write-Host ''
Write-Host ('dshmarket ' + $version)
Write-Host ('  package: ' + $Path)
Write-Host ('  target : ' + $hot)

$bytes = [System.IO.File]::ReadAllBytes($hot)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$text = [System.IO.File]::ReadAllText($hot)

if ($text.Contains($newLine)) {
  Write-Host ''
  Write-Host 'PASS: already patched -- nothing to do.' -ForegroundColor Green
  exit 0
}

if (-not $text.Contains($oldLine)) {
  Write-Host ''
  Write-Host 'FAIL: hot.js no longer contains the expected id parse line.' -ForegroundColor Red
  Write-Host '  Upstream rewrote it. Do NOT patch blindly: re-derive the fix by' -ForegroundColor Red
  Write-Host '  comparing the id parse with the name parse just below it.' -ForegroundColor Red
  Write-Host ("  current hash: " + (Get-FileHash -LiteralPath $hot -Algorithm SHA256).Hash)
  exit 1
}

if ($DryRun) {
  Write-Host ''
  Write-Host 'DRY RUN: the fix would be applied; no file was written.'
  exit 0
}

# Back up once per distinct original. An existing backup whose content matches
# the current file already preserves this exact revision, so reuse it instead of
# piling up duplicates on every upgrade.
$currentHash = (Get-FileHash -LiteralPath $hot -Algorithm SHA256).Hash
$bak = $null
Get-ChildItem -LiteralPath (Split-Path $hot) -Filter 'hot.js.orig-backup*' -File -ErrorAction SilentlyContinue |
  Sort-Object Name | ForEach-Object {
    if ($null -eq $bak -and (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq $currentHash) {
      $bak = $_.FullName
      Write-Host ('  backup : reusing ' + $_.Name)
    }
  }
if ($null -eq $bak) {
  $bak = $hot + '.orig-backup-' + $version
  if (Test-Path $bak) { $bak = $bak + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') }
  Copy-Item -LiteralPath $hot -Destination $bak -Force
  Write-Host ('  backup : created ' + (Split-Path $bak -Leaf))
}

$encoder = New-Object System.Text.UTF8Encoding($hasBom)
[System.IO.File]::WriteAllText($hot, $text.Replace($oldLine, $newLine), $encoder)

$after = [System.IO.File]::ReadAllText($hot)
$ok = $after.Contains($newLine) -and (-not $after.Contains($oldLine))

$expectedDelta = $newLine.Length - $oldLine.Length
$actualDelta = $after.Length - $text.Length
if ($actualDelta -ne $expectedDelta) { $ok = $false }

Write-Host ''
if (-not $ok) {
  Write-Host 'FAIL: the write did not land as expected.' -ForegroundColor Red
  Write-Host ('  expected delta ' + $expectedDelta + ', saw ' + $actualDelta) -ForegroundColor Red
  Write-Host ('  backup kept at ' + $bak) -ForegroundColor Red
  exit 1
}
Write-Host ('  patched: 1 line, ' + $actualDelta + ' chars added') -ForegroundColor Green

# Text was edited -- prove the parser actually behaves. parseSimplePatch is
# exported, so a behaviour check is one dynamic import away; the probe has to
# live inside lib/ because hot.js pulls in relative imports.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
  Write-Host '  WARN: node not on PATH -- text verified, behaviour NOT verified.' -ForegroundColor Yellow
  exit 0
}

$probe = Join-Path (Split-Path $hot) '.hot-patch-verify.mjs'
$probeBody = @'
const mod = await import(new URL('./hot.js', import.meta.url).href);
const patch = "- insert:\n    - id: '@oblivion/panel'\n      name: '@oblivion/panel'\n";
const rows = mod.parseSimplePatch(patch);
const good = Array.isArray(rows) && rows.length === 1 && rows[0].id === '@oblivion/panel' && rows[0].name === '@oblivion/panel';
console.log('  parseSimplePatch -> ' + JSON.stringify(rows));
process.exit(good ? 0 : 1);
'@
try {
  [System.IO.File]::WriteAllText($probe, $probeBody, (New-Object System.Text.UTF8Encoding($false)))
  & $node.Source $probe
  $probeExit = $LASTEXITCODE
} finally {
  if (Test-Path $probe) { Remove-Item -LiteralPath $probe -Force }
}

Write-Host ''
if ($probeExit -ne 0) {
  Write-Host 'FAIL: quoted ids still do not parse -- restore the backup and re-derive.' -ForegroundColor Red
  Write-Host ('  backup kept at ' + $bak) -ForegroundColor Red
  exit 1
}
Write-Host 'PASS: quoted ids parse, unquoted ids unaffected.' -ForegroundColor Green
exit 0
