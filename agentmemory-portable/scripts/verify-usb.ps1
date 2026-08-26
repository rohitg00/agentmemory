# Verify SHA256 entries in MANIFEST.json against files on disk.
param(
  [string]$PackRoot = ""
)

. "$PSScriptRoot\_env.ps1"

function Resolve-PackRoot {
  param([string]$Explicit)

  if ($Explicit) {
    $resolved = (Resolve-Path -LiteralPath $Explicit).Path
    if (-not (Test-Path (Join-Path $resolved "MANIFEST.json"))) {
      throw "MANIFEST.json non trovato in $resolved"
    }
    return $resolved
  }

  $candidates = @(
    (Join-Path $KitRoot ".."),
    $KitRoot,
    (Join-Path $KitRoot "out\agentmemory-usb")
  )
  foreach ($c in $candidates) {
    if (-not (Test-Path $c)) { continue }
    $resolved = (Resolve-Path -LiteralPath $c).Path
    if (Test-Path (Join-Path $resolved "MANIFEST.json")) {
      return $resolved
    }
  }
  throw "MANIFEST.json non trovato. Passa -PackRoot oppure esegui verify-usb dalla cartella del pack USB."
}

$root = Resolve-PackRoot -Explicit $PackRoot
Write-KitInfo "Verifying pack: $root"
$ok = Test-UsbManifestIntegrity -PackRoot $root
if (-not $ok) {
  Write-KitError "Integrita FALLITA"
  exit 1
}
Write-KitInfo "Integrita OK"
exit 0
