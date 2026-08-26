# Start the agentmemory daemon with home/cwd on the kit root.
param(
  [switch]$VerboseCli
)

. "$PSScriptRoot\_env.ps1"

function Start-ReadyBannerWatcher {
  $bannerScript = Join-Path $PSScriptRoot "ready-banner.ps1"
  if (-not (Test-Path $bannerScript)) { return }
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $bannerScript
  ) -NoNewWindow | Out-Null
}

Assert-NodePresent
Assert-IiiPresent
Assert-RepoBuilt
Assert-UsbDataLayout
Assert-KitPortsFree
Set-PortableRuntimeEnv -ForDaemon

Write-KitInfo "USERPROFILE -> $env:USERPROFILE"
Write-KitInfo "kit root    -> $KitRoot"
Write-KitInfo "repo        -> $RepoDir"
Write-KitInfo "data        -> $env:AGENTMEMORY_DATA_DIR"
Write-KitInfo "iii-config  -> $env:AGENTMEMORY_III_CONFIG"
Write-KitInfo "iii         -> $IiiExe"
Write-KitInfo "Starting daemon (keep this window open)..."
Write-Host ""
Write-Host "All'avvio completo il viewer sara disponibile tipicamente su:" -ForegroundColor DarkGray
Write-Host "  http://127.0.0.1:3113" -ForegroundColor DarkGray
Write-Host ""

Start-ReadyBannerWatcher

$cliArgs = @()
if ($VerboseCli) { $cliArgs += "--verbose" }

$code = Invoke-AgentmemoryCli @cliArgs
if ($code -ne 0) {
  Write-KitError "Start exited with code $code"
  exit $code
}
