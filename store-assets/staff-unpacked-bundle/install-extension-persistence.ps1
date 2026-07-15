<#
.SYNOPSIS
  One-time installer for Tabatha's stable extension-load-path persistence.

.DESCRIPTION
  Fixes "Tabatha uninstalling on restart" by decoupling Chrome's unpacked
  load path from the volatile git build folder.

  What it does (idempotent, no elevation required, no AV/Chrome-state changes):
    1. Creates the stable dir  %LOCALAPPDATA%\Tabatha
    2. Copies mirror-extension.ps1 there (a stable copy, independent of the git tree).
    3. Seeds the stable extension path %LOCALAPPDATA%\Tabatha\extension from the
       current build.
    4. Registers a logon autostart (scheduled task if possible, else an HKCU Run
       key) that re-mirrors + self-heals the stable path on every logon.

  After running this, do the ONE-TIME manual step it prints: point Chrome's
  "Load unpacked" at the stable path. Because the manifest carries a pinned key,
  the extension keeps the SAME id (hoknmoclnhccpgofpdihmiadmnmejjod) and all
  data/settings survive.

.PARAMETER Source
  Build folder to seed from. Defaults to the git dist.
#>
param(
  [string]$Source = "C:\Users\mrmal\le dev\Tabatha\dist"
)

$ErrorActionPreference = 'Stop'
$StableRoot   = Join-Path $env:LOCALAPPDATA "Tabatha"
$StableExt    = Join-Path $StableRoot "extension"
$StableScript = Join-Path $StableRoot "mirror-extension.ps1"
$SrcScript    = Join-Path $PSScriptRoot "mirror-extension.ps1"
$TaskName     = "TabathaExtensionMirror"
$RunKeyPath   = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunKeyName   = "TabathaExtensionMirror"

function Log($m) { Write-Host "[install] $m" }

# 1. Stable dir + 2. copy mirror script
if (-not (Test-Path $StableRoot)) { New-Item -ItemType Directory -Force -Path $StableRoot | Out-Null }
Copy-Item -Path $SrcScript -Destination $StableScript -Force
Log "Mirror script installed at: $StableScript"

# 3. Seed the stable extension path from the current build.
& $StableScript -Source $Source -Stable $StableExt -Force
if ($LASTEXITCODE -ne 0) {
  Log "ERROR: initial seed failed. Ensure '$Source' is a valid build (run 'npm run build'), then re-run this installer."
  exit 1
}

# 4. Autostart: prefer a scheduled task; fall back to an HKCU Run key.
$psExe = (Get-Command powershell.exe).Source
$argLine = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StableScript`" -Source `"$Source`""

$taskInstalled = $false
try {
  $action  = New-ScheduledTaskAction -Execute $psExe -Argument $argLine
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  # Small delay so it isn't racing the whole shell; the stable path is already
  # valid from the previous session, so exact ordering vs Chrome is not critical.
  $trigger.Delay = "PT5S"
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
  $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
  $taskInstalled = $true
  Log "Scheduled task '$TaskName' registered (At Log On, +5s)."
  # If a stale Run-key duplicate exists from a prior fallback install, remove it.
  if (Get-ItemProperty -Path $RunKeyPath -Name $RunKeyName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $RunKeyPath -Name $RunKeyName -Force
    Log "Removed duplicate Run-key entry (scheduled task is authoritative)."
  }
} catch {
  Log "Scheduled task registration unavailable ($($_.Exception.Message.Split([Environment]::NewLine)[0])). Falling back to HKCU Run key."
  $runCmd = "$psExe $argLine"
  New-ItemProperty -Path $RunKeyPath -Name $RunKeyName -Value $runCmd -PropertyType String -Force | Out-Null
  Log "Run-key '$RunKeyName' installed under HKCU\...\Run."
}

Write-Host ""
Write-Host "========================================================================"
Write-Host " Tabatha extension persistence installed."
Write-Host " Stable load path:  $StableExt"
Write-Host " Autostart:         $(if($taskInstalled){"scheduled task '$TaskName'"}else{"Run key '$RunKeyName'"})"
Write-Host ""
Write-Host " ONE-TIME MANUAL STEP (required - Chrome cannot be re-pointed for you):"
Write-Host "   1. Open chrome://extensions  (enable Developer mode, top-right)."
Write-Host "   2. REMOVE the current 'Tabatha' entry that loads from:"
Write-Host "        C:\Users\mrmal\le dev\Tabatha\dist"
Write-Host "   3. Click 'Load unpacked' and select:"
Write-Host "        $StableExt"
Write-Host "   The extension id stays hoknmoclnhccpgofpdihmiadmnmejjod (pinned key),"
Write-Host "   so your data and settings carry over. Do this ONCE."
Write-Host "========================================================================"
exit 0
