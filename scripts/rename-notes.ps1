# Rename 01_问答沉淀 root files with better frontmatter extraction
$dir = "C:\Library\那些渐渐被遗忘\01_问答沉淀"
$errors = @()
$renamed = 0

Get-ChildItem "$dir\*.md" -File | ForEach-Object {
  $file = $_
  $name = $file.Name

  # Skip if already readable (starts with letter/Chinese)
  if ($name -notmatch '^[①-⑳\d\s\.\\/%~\(\)\[\]\{\}]') { return }

  $content = Get-Content $file.FullName -Encoding UTF8
  $ask = $null; $title = $null; $topic = $null

  foreach ($line in $content) {
    if ($line -match '^ask:\s*(.+)$' -and -not $ask) { $ask = $matches[1].Trim() }
    elseif ($line -match '^title:\s*(.+)$' -and -not $title) { $title = $matches[1].Trim() }
    elseif ($line -match '^topic:\s*(.+)$' -and -not $topic) { $topic = $matches[1].Trim() }
  }

  # Determine new name
  $newName = $null
  if ($ask -and $ask -match '^[a-zA-Z\u4e00-\u9fff]') {
    $newName = $ask
  } elseif ($title -and $title -match '^[a-zA-Z\u4e00-\u9fff]') {
    $newName = $title
  } elseif ($topic) {
    $newName = $topic
  }

  if (-not $newName) {
    # Use first non-empty line as fallback
    $firstLine = ($content | Where-Object { $_.Trim() -ne '' -and $_ -notmatch '^(ask|title|topic|tags|status|impl|source|id):' }) | Select-Object -First 1
    if ($firstLine) { $newName = $firstLine } else { $newName = $name }
  }

  # Sanitize
  $newName = $newName -replace '[<>:"|?*\\]', ''
  $newName = $newName -replace '\s+', ' '
  $newName = $newName.Trim()
  if ($newName.Length -gt 60) { $newName = $newName.Substring(0, 60) }

  $newPath = Join-Path $dir "$newName.md"
  if ($newPath -eq $file.FullName) { return }
  if (Test-Path $newPath) {
    $newPath = Join-Path $dir "$newName_$(Get-Date -Format HHmmss).md"
  }

  try {
    Rename-Item $file.FullName -NewName ([System.IO.Path]::GetFileName($newPath)) -Force
    $renamed++
    Write-Host "✓ $name → $([System.IO.Path]::GetFileName($newPath))"
  } catch {
    $errors += "$name → ERROR: $($_.Exception.Message)"
    Write-Host "✗ $name : $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "Renamed: $renamed"
if ($errors.Count) { Write-Host "Errors: $($errors.Count)" }
