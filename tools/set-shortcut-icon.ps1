<#
.SYNOPSIS
    把 DeepSeek Harness 的桌面 / 开始菜单快捷方式图标换成自己的图，或恢复默认。

.DESCRIPTION
    只改用户的 .lnk 文件里的 IconLocation —— **不触碰官方安装目录**。
    这是可以做到的极限：窗口 / 任务栏 / Alt-Tab 的图标来自 exe 内嵌的 PE 资源，
    插件与脚本都无法更改（见 oblivion-brand/README.md）。

    首次运行会先把现有 .lnk 备份到 -BackupDir，之后可随时 -Restore 还原。

.PARAMETER Icon
    要使用的 .ico 文件路径。

.PARAMETER Restore
    从备份还原，不改图标。

.PARAMETER BackupDir
    备份目录，默认 <Icon 所在目录>\shortcut-backup。

.EXAMPLE
    pwsh -File tools\set-shortcut-icon.ps1 -Icon "$env:LOCALAPPDATA\Oblivion\polaris.ico"

.EXAMPLE
    pwsh -File tools\set-shortcut-icon.ps1 -Restore
#>
[CmdletBinding()]
param(
    [string]$Icon,
    [switch]$Restore,
    [string]$BackupDir
)

$ErrorActionPreference = 'Stop'

$defaultIcon = Join-Path $env:LOCALAPPDATA 'Oblivion\polaris.ico'
if (-not $Icon) { $Icon = $defaultIcon }
if (-not $BackupDir) { $BackupDir = Join-Path (Split-Path $Icon -Parent) 'shortcut-backup' }

$targets = @(
    @{ Name = 'desktop'; Path = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeepSeek Harness.lnk') }
    @{ Name = 'startmenu'; Path = (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DeepSeek Harness.lnk') }
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$shell = New-Object -ComObject WScript.Shell

foreach ($target in $targets) {
    $lnk = $target.Path
    if (-not (Test-Path -LiteralPath $lnk)) {
        Write-Host "跳过（不存在）: $lnk"
        continue
    }

    # 备份名必须带来源前缀：两个快捷方式同名，否则第二个会被当成「已备份」跳过。
    $backup = Join-Path $BackupDir ($target.Name + '-DeepSeek Harness.lnk.bak')

    if ($Restore) {
        if (-not (Test-Path -LiteralPath $backup)) {
            Write-Host "没有备份可还原: $backup"
            continue
        }
        Copy-Item -LiteralPath $backup -Destination $lnk -Force
        Write-Host "[$($target.Name)] 已还原: $($shell.CreateShortcut($lnk).IconLocation)"
        continue
    }

    if (-not (Test-Path -LiteralPath $backup)) {
        Copy-Item -LiteralPath $lnk -Destination $backup -Force
        Write-Host "[$($target.Name)] 已备份 → $backup"
    }

    $shortcut = $shell.CreateShortcut($lnk)
    $before = $shortcut.IconLocation
    $shortcut.IconLocation = "$Icon,0"
    $shortcut.Save()
    $after = ($shell.CreateShortcut($lnk)).IconLocation
    Write-Host "[$($target.Name)] $before  →  $after"
}

if (-not $Restore) {
    if (-not (Test-Path -LiteralPath $Icon)) { throw "图标文件不存在: $Icon" }
    # 让资源管理器重读图标缓存。
    & "$env:SystemRoot\System32\ie4uinit.exe" -show 2>$null
    Write-Host "`n提示：桌面与开始菜单立即生效；已固定到任务栏的项与运行中的窗口用的是 exe 内嵌图标，不受影响。"
}
