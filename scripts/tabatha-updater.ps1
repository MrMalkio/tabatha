<#
.SYNOPSIS
  Tabatha self-hosted remote-update client (no Chrome Web Store dependency).

.DESCRIPTION
  Chrome Web Store review is days out, so staff machines have no way to
  receive Tabatha updates today: the extension is loaded unpacked from the
  stable path %LocalAppData%\Tabatha\extension (see mirror-extension.ps1 /
  install-tabatha-staff.ps1), and nothing repopulates that path once a
  machine is off Malkio's dev box.

  This script is the missing remote-update leg:
    1. GET the stable channel pointer:
         https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json
       { version, zipUrl, sha256, published }
    2. Compare `version` (semver-aware) against the version installed at the
       stable path. No-op if the installed build is already current or newer.
    3. If remote is newer: download the release zip to a temp file, verify
       its sha256 against latest.json — on ANY mismatch, abort and leave the
       current install completely untouched.
    4. Extract to a temp staging dir and VALIDATE it (manifest.json parses,
       carries the pinned key, all entry HTML present) before touching
       anything live.
    5. Atomic swap into %LocalAppData%\Tabatha\extension using the same
       rename-based, never-empty-mid-swap pattern as mirror-extension.ps1.

  Chrome does not hot-reload unpacked-extension file changes for a running
  session; the update takes effect the next time Chrome (re)starts / the
  next time the user clicks reload at chrome://extensions. That is expected
  and acceptable for this channel — staff get the update on next restart.

.PARAMETER FeedUrl
  The stable latest.json URL. Defaults to the update-channel branch on
  raw.githubusercontent.com.

.PARAMETER Stable
  The stable unpacked-extension path. Defaults to %LocalAppData%\Tabatha\extension.

.PARAMETER Force
  Re-download and reinstall even if versions match (useful for testing / repair).
#>
param(
  [string]$FeedUrl = "https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json",
  [string]$Stable  = (Join-Path $env:LOCALAPPDATA "Tabatha\extension"),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$LogDir  = Join-Path $env:LOCALAPPDATA "Tabatha"
$LogPath = Join-Path $LogDir "update.log"
$ENTRY_HTML = @('popup.html','home.html','sidebar.html','settings.html')

function Log($m) {
  $line = "[{0:yyyy-MM-dd HH:mm:ss}] [tabatha-updater] {1}" -f (Get-Date), $m
  Write-Host $line
  try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    Add-Content -Path $LogPath -Value $line
  } catch { }
}

# Semver-ish comparator: returns 1 if $a > $b, -1 if $a < $b, 0 if equal.
# Handles plain dotted numeric versions (Chrome manifest style: up to 4 parts).
function Compare-Version([string]$a, [string]$b) {
  $pa = $a -split '\.' | ForEach-Object { [int]([regex]::Match($_, '^\d+').Value) }
  $pb = $b -split '\.' | ForEach-Object { [int]([regex]::Match($_, '^\d+').Value) }
  $len = [Math]::Max($pa.Count, $pb.Count)
  for ($i = 0; $i -lt $len; $i++) {
    $x = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $y = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($x -gt $y) { return 1 }
    if ($x -lt $y) { return -1 }
  }
  return 0
}

function Test-BuildValid([string]$dir) {
  if (-not (Test-Path $dir)) { return $false }
  $manifestPath = Join-Path $dir 'manifest.json'
  if (-not (Test-Path $manifestPath)) { return $false }
  try { $m = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json } catch { return $false }
  if (-not $m.version) { return $false }
  if (-not $m.key) { return $false }
  foreach ($h in $ENTRY_HTML) {
    if (-not (Test-Path (Join-Path $dir $h))) { return $false }
  }
  $sw = $m.background.service_worker
  if ($sw -and -not (Test-Path (Join-Path $dir $sw))) { return $false }
  return $true
}

function Get-InstalledVersion([string]$dir) {
  try { return (Get-Content -Raw -Path (Join-Path $dir 'manifest.json') | ConvertFrom-Json).version }
  catch { return $null }
}

Log "checking feed: $FeedUrl"

# 1. Fetch latest.json. Bust caches (raw.githubusercontent.com can serve a
#    short-lived CDN-cached copy) — this is a small file hit at most every
#    few hours, cache-busting is cheap and keeps "guaranteed" honest.
try {
  $bust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $feed = Invoke-RestMethod -Uri "$FeedUrl`?t=$bust" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 30
} catch {
  Log "ERROR: could not fetch feed: $_"
  exit 1
}

if (-not $feed.version -or -not $feed.zipUrl -or -not $feed.sha256) {
  Log "ERROR: feed response missing required fields (version/zipUrl/sha256): $($feed | ConvertTo-Json -Compress)"
  exit 1
}

$installedVersion = if (Test-BuildValid $Stable) { Get-InstalledVersion $Stable } else { $null }
Log "remote v$($feed.version)  |  installed $(if ($installedVersion) { "v$installedVersion" } else { '(none / invalid)' })"

if (-not $Force -and $installedVersion -and (Compare-Version $feed.version $installedVersion) -le 0) {
  Log "up to date. Nothing to do."
  exit 0
}

Log "update available: v$installedVersion -> v$($feed.version). Downloading..."

# 2. Download to temp, verify sha256 BEFORE touching anything live.
$workDir = Join-Path $env:TEMP ("tabatha-update-{0}" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
$zipPath = Join-Path $workDir "update.zip"
$extractDir = Join-Path $workDir "extracted"

try {
  try {
    Invoke-WebRequest -Uri $feed.zipUrl -OutFile $zipPath -TimeoutSec 300 -Headers @{ 'Accept' = 'application/octet-stream' }
  } catch {
    Log "ERROR: download failed: $_"
    exit 1
  }

  $actualHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedHash = $feed.sha256.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    Log "ERROR: sha256 MISMATCH. expected=$expectedHash actual=$actualHash. Aborting — current install left untouched."
    exit 1
  }
  Log "sha256 verified: $actualHash"

  # 3. Extract + validate BEFORE swapping.
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  if (-not (Test-Path $extractDir)) {
    Log "ERROR: extraction did not produce $extractDir. Aborting - current install left untouched."
    exit 1
  }
  if (-not (Test-BuildValid $extractDir)) {
    Log "ERROR: downloaded build failed validation (manifest/key/entry files). Aborting - current install left untouched."
    exit 1
  }
  $newVersion = Get-InstalledVersion $extractDir
  Log "downloaded build validated: v$newVersion"

  # 4. Atomic swap into the stable path (same rename-based pattern as mirror-extension.ps1).
  $stableParent = Split-Path -Parent $Stable
  if (-not (Test-Path $stableParent)) { New-Item -ItemType Directory -Force -Path $stableParent | Out-Null }

  $tmp = Join-Path $stableParent (".extension.staging-{0}-{1}" -f $PID, ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))
  $old = Join-Path $stableParent (".extension.old-{0}-{1}"     -f $PID, ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))

  try {
    Copy-Item -Path $extractDir -Destination $tmp -Recurse -Force
    if (-not (Test-BuildValid $tmp)) { throw "staged copy failed validation - refusing to swap" }

    if (Test-Path $Stable) { Rename-Item -Path $Stable -NewName (Split-Path -Leaf $old) }
    Rename-Item -Path $tmp -NewName (Split-Path -Leaf $Stable)
  } catch {
    if (-not (Test-Path $Stable) -and (Test-Path $old)) {
      try { Rename-Item -Path $old -NewName (Split-Path -Leaf $Stable) } catch { }
    }
    Log "ERROR during swap: $_"
    if (Test-Path $tmp) { try { Remove-Item -Recurse -Force $tmp } catch { } }
    exit 1
  }

  if (Test-Path $old) { try { Remove-Item -Recurse -Force $old } catch { Log "note: leftover $old (locked) - safe to delete later" } }

  Log "OK: stable path now at v$(Get-InstalledVersion $Stable). Chrome will pick this up on its next restart / manual reload at chrome://extensions."
} finally {
  try { Remove-Item -Recurse -Force $workDir } catch { }
}

exit 0
