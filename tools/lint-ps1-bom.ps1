#Requires -Version 5.1
<#
.SYNOPSIS
  Assert every PowerShell script in tools/ carries a UTF-8 BOM.

.DESCRIPTION
  Windows PowerShell 5.1 reads a BOM-less script as ANSI/GBK.  Any non-ASCII
  character in the file (our scripts have Chinese comments) then turns into
  mojibake and the script dies at PARSE time with a misleading "Unexpected
  token" error that points at the wrong thing.

  Why this check lives in its own file, and in ASCII only:
    An in-file assertion cannot protect the file it lives in.  If
    check-workspace.ps1 loses its BOM it does not parse at all, so an
    assertion inside it never runs.  This file therefore
      - is invoked from OUTSIDE (package.json scripts run it first), and
      - contains ONLY ASCII, so it can never break for the reason it detects.

  Lesson it encodes (2026-10-06): the rule "scripts must carry a BOM" was
  written down in AGENTS.md and was still broken the same day by an editor that
  silently dropped the BOM on save.  A written rule is not a check.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/lint-ps1-bom.ps1
#>
[CmdletBinding()]
param(
  [string]$Directory
)

$ErrorActionPreference = 'Stop'

# Resolve here, not as a param default: $PSScriptRoot is not yet populated while
# parameter defaults are being bound, which silently gave us "0 files scanned".
if (-not $Directory) { $Directory = $PSScriptRoot }
if (-not $Directory -or -not (Test-Path $Directory)) { throw ('scripts directory not found: ' + $Directory) }

$bad = New-Object System.Collections.ArrayList
$checked = 0

Get-ChildItem -Path $Directory -Filter '*.ps1' -File | Sort-Object Name | ForEach-Object {
  $checked++
  $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
  $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  if ($hasBom) {
    Write-Host ("  ok    " + $_.Name)
  } else {
    Write-Host ("  MISSING-BOM  " + $_.Name) -ForegroundColor Red
    [void]$bad.Add($_.Name)
  }
}

if ($bad.Count -gt 0) {
  Write-Host ''
  Write-Host ("FAIL: " + $bad.Count + " of " + $checked + " script(s) lack a UTF-8 BOM:") -ForegroundColor Red
  foreach ($name in $bad) { Write-Host ("  - " + $name) -ForegroundColor Red }
  Write-Host ''
  Write-Host 'PowerShell 5.1 will read these as ANSI/GBK and fail to parse them.'
  Write-Host 'Fix: re-save the file as "UTF-8 with BOM" (bytes EF BB BF at offset 0).'
  exit 1
}

# Scanning nothing is NOT success. Without this guard an empty scan reports PASS
# and the check silently stops protecting anything -- the same failure mode as a
# check that can never fail.
if ($checked -eq 0) {
  Write-Host ("FAIL: scanned 0 scripts under " + $Directory + " -- nothing was verified.") -ForegroundColor Red
  exit 1
}

Write-Host ("PASS: all " + $checked + " script(s) carry a UTF-8 BOM.") -ForegroundColor Green
exit 0
