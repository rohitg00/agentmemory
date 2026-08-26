# Update upstream clone and rebuild without patching sources by hand.
param(
  [switch]$SkipPull
)

. "$PSScriptRoot\_env.ps1"

Assert-NodePresent

if (-not (Test-Path $RepoDir)) {
  Write-KitError "repo\ missing - run setup.cmd first"
  exit 1
}

# For git: keep host profile (SSH / credential manager).
# For npm: portable Node + cache on the kit root.
$env:PATH = "$NodeDir;$env:PATH"
$env:npm_config_cache = Join-Path $PortableDir "npm-cache"
$env:USERPROFILE = $RealUserProfile
if ($RealHome) { $env:HOME = $RealHome }
if ($RealAppData) { $env:APPDATA = $RealAppData }
if ($RealLocalAppData) { $env:LOCALAPPDATA = $RealLocalAppData }
if ($RealTemp) { $env:TEMP = $RealTemp }
if ($RealTmp) { $env:TMP = $RealTmp }

Set-Location $RepoDir
$npmCmd = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) {
  Write-KitError "npm.cmd not found in $NodeDir"
  exit 1
}

if (-not $SkipPull) {
  Write-KitInfo "git pull ..."
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    Write-KitError "git pull --ff-only failed. Resolve the branch state, then re-run update.cmd"
    exit $LASTEXITCODE
  }
}

$cfg = Get-KitConfig
$env:AGENTMEMORY_III_VERSION = $cfg.IiiVersion

Write-KitInfo "npm install ..."
& $npmCmd install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Invoke-RepoBuild

if (-not (Test-Path $IiiExe)) {
  $portableIii = Join-Path $PortableDir "iii.exe"
  if (Test-Path $portableIii) {
    Copy-Item $portableIii $IiiExe -Force
    Write-KitInfo "Restored iii.exe to $IiiExe"
  }
  else {
    Write-KitWarn "iii.exe missing - re-run setup.cmd to download it"
  }
}

Write-KitInfo "Update complete. Restart with stop.cmd then start.cmd"
