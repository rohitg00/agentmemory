# Prints the viewer URL once agentmemory /health is healthy.
# Invoked as a sidecar from start.ps1 (same console, -NoNewWindow).
$ErrorActionPreference = "SilentlyContinue"

for ($i = 0; $i -lt 120; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:3111/agentmemory/health" -TimeoutSec 2
    $ok = ($h.status -eq "healthy") -or ($h.service -eq "agentmemory")
    if (-not $ok) { continue }

    $vp = 3113
    if ($null -ne $h.viewerPort) {
      $parsed = 0
      if ([int]::TryParse([string]$h.viewerPort, [ref]$parsed) -and $parsed -gt 0) {
        $vp = $parsed
      }
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  agentmemory USB  -  PRONTO" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ("  Viewer:  http://127.0.0.1:{0}" -f $vp) -ForegroundColor Cyan
    Write-Host "  REST:    http://127.0.0.1:3111/agentmemory/*" -ForegroundColor Cyan
    Write-Host "  Health:  http://127.0.0.1:3111/agentmemory/health" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""
    exit 0
  } catch {
    # keep polling
  }
}

exit 1
