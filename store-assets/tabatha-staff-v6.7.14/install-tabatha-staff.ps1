<#
.SYNOPSIS
  One-time installer for Tabatha on STAFF / multi-machine installs (e.g. the
  PS machine), with self-hosted remote updates — no Chrome Web Store needed.

.DESCRIPTION
  Supersedes install-extension-persistence.ps1 for any machine that is NOT
  Malkio's dev box (OD). install-extension-persistence.ps1 solved
  "Tabatha doesn't survive a restart" by pinning Chrome to a stable path that
  a local mirror script keeps healthy — but it never gets NEW versions,
  because nothing on a staff machine builds Tabatha from source.

  This script does everything install-extension-persistence.ps1 does, PLUS
  registers scripts/tabatha-updater.ps1 to run on a schedule, pulling new
  versions from the self-hosted update channel
  (https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json)
  published by `npm run publish:update` (see scripts/publish-update.mjs).

  What it does (idempotent, no admin required — falls back gracefully):
    1. Creates the stable dir  %LocalAppData%\Tabatha
    2. Copies tabatha-updater.ps1 there (a stable copy, independent of wherever
       this installer was run from — e.g. an unzipped staff bundle folder).
    3. Seeds the stable extension path %LocalAppData%\Tabatha\extension from
       the bundled `.\extension` payload sitting next to this script (first run).
    4. Registers BOTH:
         - an HKCU Run key (fires at logon)
         - a Scheduled Task, "TabathaUpdateCheck", every 6 hours
       running tabatha-updater.ps1. If the Scheduled Task can't be created
       (needs admin on some machines), it silently falls back to Run-key-only,
       same pattern as install-extension-persistence.ps1.
    5. Prints the ONE-TIME manual step: "Load unpacked" from the stable path.

  After this, the machine self-updates on its own on next Chrome restart
  following any `npm run publish:update` cut on the dev box — no manual copy,
  no CWS review dependency.

.PARAMETER Source
  Seed payload for the FIRST install only. Defaults to `.\extension` next to
  this script (as shipped in the staff bundle zip).
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot "extension")
)

$ErrorActionPreference = 'Stop'
$StableRoot     = Join-Path $env:LOCALAPPDATA "Tabatha"
$StableExt      = Join-Path $StableRoot "extension"
$StableUpdater  = Join-Path $StableRoot "tabatha-updater.ps1"
$SrcUpdater     = Join-Path $PSScriptRoot "tabatha-updater.ps1"
$TaskName       = "TabathaUpdateCheck"
$RunKeyPath     = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunKeyName     = "TabathaUpdateCheck"

function Log($m) { Write-Host "[install-staff] $m" }

# 1. Stable dir + 2. copy updater script (self-contained, no dependency on the
#    installer's original location — the scheduled task/run-key points here).
if (-not (Test-Path $StableRoot)) { New-Item -ItemType Directory -Force -Path $StableRoot | Out-Null }
if (-not (Test-Path $SrcUpdater)) {
  Log "ERROR: tabatha-updater.ps1 not found next to this installer ($SrcUpdater). Re-download the staff bundle."
  exit 1
}
Copy-Item -Path $SrcUpdater -Destination $StableUpdater -Force
Log "Updater script installed at: $StableUpdater"

# 3. Seed the stable extension path from the bundled payload (first run only —
#    if it's already populated and valid, leave it; the updater takes over
#    from here on out).
$manifestAtStable = Join-Path $StableExt "manifest.json"
if (-not (Test-Path $manifestAtStable)) {
  if (-not (Test-Path $Source)) {
    Log "ERROR: no existing install at '$StableExt' and no seed payload at '$Source'. Cannot proceed."
    Log "       Make sure this script is run from inside the unzipped staff bundle (which ships a '.\extension' folder)."
    exit 1
  }
  Log "Seeding stable extension path from bundled payload: $Source"
  New-Item -ItemType Directory -Force -Path $StableExt | Out-Null
  Copy-Item -Path (Join-Path $Source "*") -Destination $StableExt -Recurse -Force
} else {
  Log "Stable path already populated ($StableExt) — leaving it; the updater will keep it current."
}

$seedVersion = try { (Get-Content -Raw -Path $manifestAtStable | ConvertFrom-Json).version } catch { $null }
if (-not $seedVersion) {
  Log "ERROR: seeded stable path has no readable manifest.json version. Aborting."
  exit 1
}
Log "Stable extension at v$seedVersion"

# 4. Autostart, twofold: Run key (always) + Scheduled Task every 6h (if possible).
$psExe = (Get-Command powershell.exe).Source
$argLine = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$StableUpdater`""

# 4a. Run key — fires at logon, cheap catch-up check.
$runCmd = "$psExe $argLine"
New-ItemProperty -Path $RunKeyPath -Name $RunKeyName -Value $runCmd -PropertyType String -Force | Out-Null
Log "Run-key '$RunKeyName' installed under HKCU\...\Run (checks for updates at every logon)."

# 4b. Scheduled Task — every 6 hours, so the machine also updates mid-session
#     without needing a logon. Falls back silently if task creation needs
#     elevation this machine doesn't have (same pattern as
#     install-extension-persistence.ps1's mirror-task fallback).
$taskInstalled = $false
try {
  $action  = New-ScheduledTaskAction -Execute $psExe -Argument $argLine
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  $principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null
  $taskInstalled = $true
  Log "Scheduled task '$TaskName' registered (every 6 hours)."
} catch {
  Log "Scheduled task registration unavailable ($($_.Exception.Message.Split([Environment]::NewLine)[0])). Falling back to Run-key-only (checks at logon)."
}

# 5. Run the updater once now, so a stale seed payload gets caught up immediately.
Log "Running an initial update check..."
try {
  & $StableUpdater -Stable $StableExt
} catch {
  Log "Initial update check failed (non-fatal, will retry on schedule): $_"
}

Write-Host ""
Write-Host "========================================================================"
Write-Host " Tabatha staff install + self-hosted update channel installed."
Write-Host " Stable load path:   $StableExt"
Write-Host " Update check:       $(if($taskInstalled){"every 6 hours (scheduled task '$TaskName') + at logon"}else{"at logon only (Run key '$RunKeyName')"})"
Write-Host " Update log:         $(Join-Path $env:LOCALAPPDATA 'Tabatha\update.log')"
Write-Host ""
Write-Host " ONE-TIME MANUAL STEP (required - Chrome cannot be re-pointed for you):"
Write-Host "   1. Open chrome://extensions  (enable Developer mode, top-right)."
Write-Host "   2. Click 'Load unpacked' and select:"
Write-Host "        $StableExt"
Write-Host "   3. Sign in to Cloud Sync from Tabatha's Settings page."
Write-Host ""
Write-Host " You're done. This machine will auto-update in the background (every"
Write-Host " 6h and at every login). New versions take effect the next time Chrome"
Write-Host " restarts, or immediately if you click the reload icon on the Tabatha"
Write-Host " card at chrome://extensions."
Write-Host "========================================================================"
exit 0
