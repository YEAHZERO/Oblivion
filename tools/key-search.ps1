#Requires -Version 5.1
<#
.SYNOPSIS
  Key-based web search that talks to Exa / Tavily / Firecrawl directly.

.DESCRIPTION
  Searches with the API keys already stored in the Windows User environment, so a
  search does not depend on any DSH plugin's routing, engine set, fallback chain or
  cooling state.  It is the "does the key actually work?" counterpart to the plugin
  side (which is `web_call sources.status` plus the two bundles' cordis.patch.yml).

  WHY THE REGISTRY AND NOT THE ENVIRONMENT VARIABLE (lesson, 2026-10-06)
    DSH strips every User environment variable whose NAME contains KEY / TOKEN /
    PROXY / CERT before it hands a shell to the agent.  Inside an agent shell:

        $env:EXA_API_KEY                                                # empty
        [Environment]::GetEnvironmentVariable('EXA_API_KEY','User')     # present

    The value exists; the child process environment simply never receives it.  A
    registry read in the User scope is therefore the only reliable path from an
    agent shell, and this script exists so that path is one command instead of a
    rediscovery every session.

  KEY MATERIAL IS NEVER PRINTED.  Only the resolved source and the key length are
  reported, which answers "is this key wired up?" without leaking the secret into a
  transcript, a log or a model context.

  Env var names match dsh-free-search's engine mapping (lib/index.js:2903-2921), so
  this script and the plugin resolve the same key after any reinstall.  free-search's
  own priority is credentials > entry config > environment; this script only reads
  the environment, which is where these five keys live on this machine.

  EXIT CODES
    0  at least one result was returned
    1  the requested engine failed, or returned nothing
    2  usage error: no query, no key resolvable, or the opencode CLI is missing

.PARAMETER Query
  The search string.  UTF-8 is preserved (the request body is sent as UTF-8 bytes,
  so Chinese queries are not mangled the way a plain string body would be on
  PowerShell 5.1).

.PARAMETER Provider
  exa (default) | tavily | firecrawl | all | opencode
  'all' queries Exa + Tavily + Firecrawl and merges the hits by URL.
  'opencode' shells out to the opencode CLI (`opencode api post /api/websearch`),
  which returns full page text, not just a snippet.  Requires opencode on PATH.

.PARAMETER N
  Results per engine, 1-50.  Default 5.

.PARAMETER Text
  Ask for page text where the API supports it (Exa contents.text, Firecrawl
  markdown).  Slower and costs more credits than a snippet-only search.

.PARAMETER MaxChars
  Cap on a single snippet / page text.  Default 1200.

.PARAMETER Json
  Emit only JSON on stdout.  Diagnostics always go to stderr, never to the results.

.PARAMETER KeyStatus
  Do not search: report, per engine, whether a key resolves, from which scope, and
  how long it is.  This is the first command to run when search breaks after a
  plugin reinstall.

.PARAMETER TimeoutSec
  Per-request timeout.  Default 30.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/key-search.ps1 -KeyStatus

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/key-search.ps1 -Query "dsh plugin bundle" -Provider exa -N 5

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/key-search.ps1 -Query "dsh search provider" -Provider all

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File tools/key-search.ps1 -Query "cordis patch semantics" -Provider opencode -Json

.NOTES
  THE PARAMETER IS CALLED -Provider, NOT -Engine, ON PURPOSE.
  Windows PowerShell 5.1 cannot bind a script parameter named Engine through
  `powershell.exe -File`: the call dies with exit code -1 and prints nothing
  at all -- no results, no error, no hint.  Minimal reproduction, 2026-10-06:
  `param([string]$Engine)` invoked as `-File probe.ps1 -Engine exa` fails,
  while Provider / Source / Backend / Via all bind fine.  Renaming was the fix.
  Do not "restore" the old name and do not add it back as an alias: an alias
  reintroduces exactly the trap.

  Companion documents:
    .memory/design/DSH插件清单与协作关系.md   two search bundles, provider routing, conflict codes
    WORKSPACE.md                               mount mechanisms and local patches
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Query,

  [ValidateSet('exa', 'tavily', 'firecrawl', 'all', 'opencode')]
  [string]$Provider = 'exa',

  [ValidateRange(1, 50)]
  [int]$N = 5,

  [switch]$Text,

  [ValidateRange(80, 20000)]
  [int]$MaxChars = 1200,

  [switch]$Json,
  [switch]$NoSnippet,
  [switch]$KeyStatus,

  [ValidateRange(5, 300)]
  [int]$TimeoutSec = 30,

  [string]$ExaApiKey,
  [string]$TavilyApiKey,
  [string]$FirecrawlApiKey
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Engine table
# ---------------------------------------------------------------------------

$ProviderTable = [ordered]@{
  exa       = @{ EnvName = 'EXA_API_KEY';       Uri = 'https://api.exa.ai/search';           Label = 'Exa' }
  tavily    = @{ EnvName = 'TAVILY_API_KEY';    Uri = 'https://api.tavily.com/search';       Label = 'Tavily' }
  firecrawl = @{ EnvName = 'FIRECRAWL_API_KEY'; Uri = 'https://api.firecrawl.dev/v1/search'; Label = 'Firecrawl' }
}

$AllEngines = @('exa', 'tavily', 'firecrawl')

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Note {
  param([string]$Message)
  # stderr, so `-Json` output on stdout stays machine-parseable.
  [Console]::Error.WriteLine($Message)
}

# Some hosts still negotiate TLS 1.0; the search APIs require 1.2.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Get-KeyOverride {
  param([string]$ProviderName)
  if ($ProviderName -eq 'exa') { return $ExaApiKey }
  if ($ProviderName -eq 'tavily') { return $TavilyApiKey }
  if ($ProviderName -eq 'firecrawl') { return $FirecrawlApiKey }
  return $null
}

# User scope FIRST: that is the only scope an agent shell can still see.
function Resolve-ApiKey {
  param([string]$EnvName, [string]$Override)
  if (-not [string]::IsNullOrWhiteSpace($Override)) {
    return @{ Value = $Override; Source = 'parameter' }
  }
  foreach ($scope in @('User', 'Machine', 'Process')) {
    $v = [Environment]::GetEnvironmentVariable($EnvName, $scope)
    if (-not [string]::IsNullOrWhiteSpace($v)) {
      return @{ Value = $v; Source = ($scope + ' scope') }
    }
  }
  return @{ Value = $null; Source = '' }
}

function Invoke-JsonPost {
  param([string]$Uri, [hashtable]$Headers, [string]$JsonBody)
  # Send bytes, not a string: PowerShell 5.1 would encode a string body as
  # ISO-8859-1 and a non-ASCII query would arrive mangled.
  $params = @{
    Uri         = $Uri
    Method      = 'Post'
    Headers     = $Headers
    ContentType = 'application/json; charset=utf-8'
    Body        = [System.Text.Encoding]::UTF8.GetBytes($JsonBody)
    TimeoutSec  = $TimeoutSec
  }
  return Invoke-RestMethod @params
}

function New-Hit {
  param([string]$ProviderName, [string]$Title, [string]$Url, [string]$Snippet, [string]$Extra)
  [pscustomobject]@{
    engine  = $ProviderName
    engines = $ProviderName
    title   = $Title
    url     = $Url
    snippet = $Snippet
    extra   = $Extra
  }
}

function Limit-Text {
  param([string]$Value, [int]$Limit)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  $flat = ($Value -replace '\s+', ' ').Trim()
  if ($flat.Length -le $Limit) { return $flat }
  return $flat.Substring(0, $Limit) + '...'
}

function Get-HttpFailure {
  param($ErrorRecord)
  $msg = $ErrorRecord.Exception.Message
  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    $body = $ErrorRecord.ErrorDetails.Message
    if ($body.Length -gt 300) { $body = $body.Substring(0, 300) }
    return $msg + ' | ' + ($body -replace '\s+', ' ')
  }
  return $msg
}

# ---------------------------------------------------------------------------
# Engines
# ---------------------------------------------------------------------------

function Search-Exa {
  param([string]$Key)
  $body = @{ query = $Query; numResults = $N }
  if ($Text) { $body['contents'] = @{ text = @{ maxCharacters = $MaxChars } } }
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $r = Invoke-JsonPost -Uri $ProviderTable['exa'].Uri -Headers @{ 'x-api-key' = $Key } -JsonBody $json
  if ($null -eq $r.results) { return @() }
  $out = @()
  foreach ($it in @($r.results)) {
    $extra = ''
    if ($it.publishedDate) { $extra = [string]$it.publishedDate }
    elseif ($it.author) { $extra = [string]$it.author }
    $out += New-Hit -ProviderName 'exa' -Title $it.title -Url $it.url -Snippet (Limit-Text $it.text $MaxChars) -Extra $extra
  }
  return $out
}

function Search-Tavily {
  param([string]$Key)
  $body = @{ api_key = $Key; query = $Query; max_results = $N }
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $r = Invoke-JsonPost -Uri $ProviderTable['tavily'].Uri -Headers @{} -JsonBody $json
  if ($null -eq $r.results) { return @() }
  $out = @()
  foreach ($it in @($r.results)) {
    $extra = ''
    if ($null -ne $it.score) { $extra = 'score=' + $it.score }
    $out += New-Hit -ProviderName 'tavily' -Title $it.title -Url $it.url -Snippet (Limit-Text $it.content $MaxChars) -Extra $extra
  }
  return $out
}

function Search-Firecrawl {
  param([string]$Key)
  $body = @{ query = $Query; limit = $N }
  if ($Text) { $body['scrapeOptions'] = @{ formats = @('markdown') } }
  $json = $body | ConvertTo-Json -Depth 8 -Compress
  $r = Invoke-JsonPost -Uri $ProviderTable['firecrawl'].Uri -Headers @{ 'Authorization' = ('Bearer ' + $Key) } -JsonBody $json
  if ($r.success -eq $false) { throw 'firecrawl returned success=false' }
  if ($null -eq $r.data) { return @() }
  $out = @()
  foreach ($it in @($r.data)) {
    $snip = $it.description
    if ([string]::IsNullOrWhiteSpace($snip)) { $snip = $it.markdown }
    $out += New-Hit -ProviderName 'firecrawl' -Title $it.title -Url $it.url -Snippet (Limit-Text $snip $MaxChars) -Extra ''
  }
  return $out
}

# Optional path: the opencode CLI owns provider selection and key handling, and it
# returns full page text, so it is the cheapest way to get readable content.
function Search-OpenCode {
  $exe = @(Get-Command opencode -ErrorAction SilentlyContinue) | Select-Object -First 1
  if (-not $exe) { throw 'opencode CLI not found on PATH' }
  $payload = @{ query = $Query; providerID = 'exa' } | ConvertTo-Json -Compress
  # Windows PowerShell 5.1 re-quotes native arguments with the pre-7 rules, which
  # mangles the embedded double quotes of a JSON payload (opencode then answers
  # HTTP 400).  Escaping them is what 5.1 needs; PowerShell 7+ passes the string
  # verbatim and must NOT see the backslashes.
  if ($PSVersionTable.PSVersion.Major -lt 6) { $payload = $payload.Replace('"', '\"') }
  $raw = (& opencode api post /api/websearch -d $payload | Out-String)
  if ([string]::IsNullOrWhiteSpace($raw)) { throw 'opencode returned nothing on stdout' }
  $parsed = $null
  try { $parsed = $raw | ConvertFrom-Json } catch { throw ('could not parse opencode output as JSON: ' + (Limit-Text $raw 200)) }
  $list = @()
  if ($parsed.data -and $parsed.data.results) { $list = @($parsed.data.results) }
  elseif ($parsed.results) { $list = @($parsed.results) }
  $out = @()
  foreach ($it in $list) {
    $out += New-Hit -ProviderName 'opencode' -Title $it.title -Url $it.url -Snippet (Limit-Text $it.content $MaxChars) -Extra ''
  }
  return $out
}

# ---------------------------------------------------------------------------
# Key status mode
# ---------------------------------------------------------------------------

if ($KeyStatus) {
  $rows = @()
  foreach ($name in $ProviderTable.Keys) {
    $meta = $ProviderTable[$name]
    $res = Resolve-ApiKey -EnvName $meta.EnvName -Override (Get-KeyOverride $name)
    $status = 'MISSING'
    $len = ''
    if ($res.Value) { $status = 'ok'; $len = [string]$res.Value.Length }
    $rows += [pscustomobject]@{
      provider = $meta.Label
      envVar   = $meta.EnvName
      status   = $status
      source   = $res.Source
      length   = $len
      note     = 'search endpoint'
    }
  }

  $agnes = Resolve-ApiKey -EnvName 'AGNES_API_KEY' -Override $null
  $agnesStatus = 'MISSING'
  $agnesLen = ''
  if ($agnes.Value) { $agnesStatus = 'ok'; $agnesLen = [string]$agnes.Value.Length }
  $rows += [pscustomobject]@{
    provider = 'Agnes'
    envVar   = 'AGNES_API_KEY'
    status   = $agnesStatus
    source   = $agnes.Source
    length   = $agnesLen
    note     = 'LLM key (llm-pi-ai provider), no search endpoint'
  }

  $oc = @(Get-Command opencode -ErrorAction SilentlyContinue) | Select-Object -First 1
  $ocStatus = 'missing'
  $ocSource = ''
  if ($oc) { $ocStatus = 'ok'; $ocSource = [string]$oc.Source }
  $rows += [pscustomobject]@{
    provider = 'opencode'
    envVar   = '-'
    status   = $ocStatus
    source   = $ocSource
    length   = ''
    note     = 'CLI path: -Provider opencode'
  }

  if ($Json) {
    Write-Output (ConvertTo-Json -InputObject @($rows) -Depth 6)
  } else {
    $fmt = '{0,-10} {1,-18} {2,-8} {3,-22} {4,-4} {5}'
    Write-Output ($fmt -f 'PROVIDER', 'ENV VAR', 'STATUS', 'SOURCE', 'LEN', 'NOTE')
    foreach ($row in $rows) {
      Write-Output ($fmt -f $row.provider, $row.envVar, $row.status, $row.source, $row.length, $row.note)
    }
  }
  exit 0
}

# ---------------------------------------------------------------------------
# Search mode
# ---------------------------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($Query)) {
  Write-Note 'usage: key-search.ps1 -Query "<text>" [-Provider exa|tavily|firecrawl|all|opencode] [-N 5] [-Text] [-Json]'
  Write-Note '       key-search.ps1 -KeyStatus'
  exit 2
}

$targets = @($Provider)
if ($Provider -eq 'all') { $targets = $AllEngines }

$all = New-Object System.Collections.ArrayList
$perEngine = [ordered]@{}
$failures = @()
$hadError = $false
$hadNoKey = $false
$missingCli = $false

foreach ($target in $targets) {
  if ($target -eq 'opencode') {
    try {
      $hits = @(Search-OpenCode)
      $perEngine['opencode'] = $hits.Count
      foreach ($h in $hits) { [void]$all.Add($h) }
      Write-Note ('query opencode -- ' + $hits.Count + ' hit(s)')
    } catch {
      $msg = Get-HttpFailure $_
      if ($msg -like '*not found on PATH*') { $missingCli = $true }
      else { $hadError = $true }
      $failures += ('opencode: ' + $msg)
      Write-Note ('FAIL  opencode -- ' + $msg)
    }
    continue
  }

  $meta = $ProviderTable[$target]
  $res = Resolve-ApiKey -EnvName $meta.EnvName -Override (Get-KeyOverride $target)
  if (-not $res.Value) {
    $hadNoKey = $true
    $failures += ($target + ': ' + $meta.EnvName + ' is not resolvable in User/Machine/Process scope')
    Write-Note ('skip  ' + $target + ' -- ' + $meta.EnvName + ' not found')
    continue
  }

  Write-Note ('query ' + $meta.Label + ' -- ' + $meta.EnvName + ' via ' + $res.Source + ', len=' + $res.Value.Length)
  try {
    $hits = @()
    if ($target -eq 'exa') { $hits = @(Search-Exa -Key $res.Value) }
    elseif ($target -eq 'tavily') { $hits = @(Search-Tavily -Key $res.Value) }
    elseif ($target -eq 'firecrawl') { $hits = @(Search-Firecrawl -Key $res.Value) }
    $perEngine[$target] = $hits.Count
    foreach ($h in $hits) { [void]$all.Add($h) }
    Write-Note ('  ok  ' + $hits.Count + ' hit(s)')
  } catch {
    $hadError = $true
    $msg = Get-HttpFailure $_
    $failures += ($target + ': ' + $msg)
    Write-Note ('FAIL  ' + $target + ' -- ' + $msg)
  }
}

# Merge by URL (only meaningful for -Provider all, harmless otherwise).
$results = New-Object System.Collections.ArrayList
$index = @{}
foreach ($h in $all) {
  $key = ([string]$h.url).Trim().ToLowerInvariant().TrimEnd('/')
  if ([string]::IsNullOrEmpty($key)) { $key = 'title:' + ([string]$h.title).ToLowerInvariant() }
  if ($index.ContainsKey($key)) {
    $i = $index[$key]
    if (($results[$i].engines -split ',') -notcontains $h.engine) {
      $results[$i].engines = $results[$i].engines + ',' + $h.engine
    }
    if (-not $results[$i].snippet -and $h.snippet) { $results[$i].snippet = $h.snippet }
  } else {
    $index[$key] = $results.Count
    [void]$results.Add($h)
  }
}

if ($Json) {
  Write-Output (ConvertTo-Json -InputObject @($results) -Depth 6)
} else {
  $summary = ''
  foreach ($k in $perEngine.Keys) {
    if ($summary) { $summary += '  ' }
    $summary += ($k + '=' + $perEngine[$k])
  }
  Write-Output ('# key-search  provider=' + $Provider + '  n=' + $N + '  query="' + $Query + '"')
  if ($Provider -eq 'all') { Write-Output ('# per-engine: ' + $summary + '  merged=' + $results.Count) }
  $i = 0
  foreach ($r in $results) {
    $i++
    $tag = $r.engine
    if ($Provider -eq 'all') { $tag = $r.engines }
    Write-Output ('{0,3}. [{1}] {2}' -f $i, $tag, $r.title)
    Write-Output ('     ' + $r.url)
    if ($r.extra) { Write-Output ('     ' + $r.extra) }
    if (-not $NoSnippet -and $r.snippet) { Write-Output ('     ' + (Limit-Text $r.snippet 240)) }
  }
  if ($results.Count -eq 0) { Write-Output '     (no results)' }
}

if ($failures.Count -gt 0) {
  Write-Note '--- failures ---'
  foreach ($f in $failures) { Write-Note ('  ' + $f) }
}

if ($results.Count -gt 0) { exit 0 }
if ($missingCli) { exit 2 }
if ($hadNoKey -and -not $hadError) { exit 2 }
exit 1
