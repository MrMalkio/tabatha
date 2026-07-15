<#
.SYNOPSIS
  Tabatha stable extension-path mirror + self-heal.

.DESCRIPTION
  ROOT CAUSE this addresses:
    Chrome loads the Tabatha extension UNPACKED. Unpacked extensions are pinned
    by absolute path and re-validated on every Chrome startup. If the folder at
    that path is ever missing / empty / has an unparseable manifest at a
    validation moment, Chrome PERMANENTLY drops the extension (it does not
    reinstall unpacked entries the way it re-fetches webstore ones) and the user
    must "Load unpacked" again by hand.

    Historically Chrome was pointed at the git build output
    `C:\Users\mrmal\le dev\Tabatha\dist`. That folder is legitimately emptied /
    rewritten by `npm run build`, so any restart (made frequent + unattended by
    Windows Fast Startup) that lands while dist is mid-build / interrupted /
    locked drops the extension. That is the "Tabatha uninstalling on restart" bug.

  THE FIX:
    Chrome should load from a STABLE path that no build or git operation ever
    touches:  %LOCALAPPDATA%\Tabatha\extension
    This script keeps that stable path populated with the freshest VALID build
    and self-heals it, running at logon before Chrome validates extensions.

  SAFETY / SELF-HEAL:
    - It only overwrites the stable path when the SOURCE build is valid
      (manifest.json parses, carries the pinned `key`, and every entry HTML is
      present). If the source is invalid/missing, it leaves the existing
      last-known-good stable copy untouched -> Chrome always sees a valid folder.
    - The copy is atomic: build into a temp sibling dir, then swap by rename, so
      the stable path is never observed empty/half-written.
    - It never changes Chrome's enable/disable state, never touches the manifest
      `key`, and never touches AV settings.

.PARAMETER Source
  The build folder to mirror from. Defaults to the git dist. The scheduled task
  passes the repo dist explicitly.

.PARAMETER Stable
  The stable load path. Defaults to %LOCALAPPDATA%\Tabatha\extension.

.PARAMETER Force
  Mirror even if the stable copy is already the same version as the source.
#>
param(
  [string]$Source = "C:\Users\mrmal\le dev\Tabatha\dist",
  [string]$Stable = (Join-Path $env:LOCALAPPDATA "Tabatha\extension"),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$EXT_ID = 'hoknmoclnhccpgofpdihmiadmnmejjod'
# First bytes of the pinned public key (manifest `key`) - used only to confirm
# the source build is the real Tabatha extension, never modified.
$KEY_PREFIX = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAy7Qwwyc'
$ENTRY_HTML = @('popup.html','home.html','sidebar.html','settings.html')

function Log($m) { Write-Host "[mirror-extension] $m" }

function Test-BuildValid([string]$dir) {
  if (-not (Test-Path $dir)) { return $false }
  $manifestPath = Join-Path $dir 'manifest.json'
  if (-not (Test-Path $manifestPath)) { return $false }
  try {
    $m = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
  } catch { return $false }
  if (-not $m.version) { return $false }
  if (-not $m.key -or -not $m.key.StartsWith($KEY_PREFIX)) { return $false }
  foreach ($h in $ENTRY_HTML) {
    if (-not (Test-Path (Join-Path $dir $h))) { return $false }
  }
  # background service worker must exist
  $sw = $m.background.service_worker
  if ($sw -and -not (Test-Path (Join-Path $dir $sw))) { return $false }
  return $true
}

function Get-Version([string]$dir) {
  try { return (Get-Content -Raw -Path (Join-Path $dir 'manifest.json') | ConvertFrom-Json).version }
  catch { return $null }
}

# 1. Validate the source. If it's not a good build, do nothing destructive.
if (-not (Test-BuildValid $Source)) {
  if (Test-BuildValid $Stable) {
    Log "Source '$Source' is missing/invalid; stable copy at '$Stable' is intact (v$(Get-Version $Stable)). Leaving it as last-known-good."
    exit 0
  } else {
    Log "ERROR: source '$Source' invalid AND stable '$Stable' invalid/absent. Cannot heal. Build the extension, then re-run."
    exit 1
  }
}

$srcVer = Get-Version $Source
$dstVer = if (Test-BuildValid $Stable) { Get-Version $Stable } else { $null }

# 2. Skip if already up to date (unless -Force).
if (-not $Force -and $dstVer -eq $srcVer -and $null -ne $dstVer) {
  Log "Stable path already at v$dstVer (matches source). Nothing to do."
  exit 0
}

# 3. Atomic mirror: copy source -> temp, then swap temp into the stable path.
$stableParent = Split-Path -Parent $Stable
if (-not (Test-Path $stableParent)) { New-Item -ItemType Directory -Force -Path $stableParent | Out-Null }

$tmp = Join-Path $stableParent (".extension.staging-{0}-{1}" -f $PID, ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))
$old = Join-Path $stableParent (".extension.old-{0}-{1}"     -f $PID, ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()))

try {
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  # Robocopy mirrors reliably and handles long paths / locked-read files well.
  $rc = robocopy $Source $tmp /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:1 2>&1
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE): $rc" }
  $global:LASTEXITCODE = 0

  if (-not (Test-BuildValid $tmp)) { throw "staged copy failed validation - refusing to swap" }

  # Swap: move current stable aside, promote temp. Sub-second gap.
  if (Test-Path $Stable) { Rename-Item -Path $Stable -NewName (Split-Path -Leaf $old) }
  Rename-Item -Path $tmp -NewName (Split-Path -Leaf $Stable)
} catch {
  # Roll back so we never leave the stable path missing.
  if (-not (Test-Path $Stable) -and (Test-Path $old)) {
    try { Rename-Item -Path $old -NewName (Split-Path -Leaf $Stable) } catch {}
  }
  Log "ERROR during swap: $_"
  if (Test-Path $tmp) { try { Remove-Item -Recurse -Force $tmp } catch {} }
  exit 1
}

if (Test-Path $old) { try { Remove-Item -Recurse -Force $old } catch { Log "note: leftover $old (locked) - safe to delete later" } }

Log "OK: stable path '$Stable' now at v$(Get-Version $Stable)  (extension id $EXT_ID)"
exit 0
