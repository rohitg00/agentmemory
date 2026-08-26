# Build a runtime-only USB tree: out\agentmemory-usb\ (in-tree layout, fresh data).
param(
  [ValidateSet("Runtime")]
  [string]$Profile = "Runtime",
  [switch]$Rebuild,
  [string]$OutputDir = "",
  [switch]$Zip,
  [switch]$IncludeSourceMaps,
  [switch]$Force
)

. "$PSScriptRoot\_env.ps1"

if (-not $InTree) {
  Write-KitError "pack-usb richiede layout in-tree (kit dentro il clone agentmemory)."
  exit 1
}

Assert-NodePresent
Assert-IiiPresent

if ($Rebuild) {
  Invoke-RepoBuild
}

Assert-RepoBuilt
if (-not (Test-Path (Join-Path $RepoDir "dist\index.mjs"))) {
  Write-KitError "Build incompleta: manca dist\index.mjs. Usa -Rebuild o update.cmd"
  exit 1
}
if (-not (Test-Path (Join-Path $RepoDir "dist\standalone.mjs"))) {
  Write-KitError "Build incompleta: manca dist\standalone.mjs. Usa -Rebuild o update.cmd"
  exit 1
}
if (-not (Test-Path $IiiConfigPath)) {
  Write-KitError "Manca iii-config.yaml nel repo: $IiiConfigPath"
  exit 1
}

if (-not $OutputDir) {
  $OutputDir = Join-Path $KitRoot "out\agentmemory-usb"
}

if (Test-Path $OutputDir) {
  if (-not $Force) {
    Write-KitError "Output gia presente: $OutputDir"
    Write-KitError "Rilancia con -Force per sovrascrivere."
    exit 1
  }
  Write-KitWarn "Removing existing output: $OutputDir"
  Remove-Item -LiteralPath $OutputDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stagingKit = Join-Path $OutputDir "agentmemory-portable"
New-Item -ItemType Directory -Force -Path $stagingKit | Out-Null

function Copy-FileToStaging {
  param(
    [string]$Source,
    [string]$Destination
  )
  $destDir = Split-Path -Parent $Destination
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  }
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

Write-KitInfo "Copying runtime files from $RepoDir"
foreach ($name in @("package.json", "package-lock.json", "iii-config.yaml", ".env.example")) {
  $src = Join-Path $RepoDir $name
  if (-not (Test-Path $src)) {
    if ($name -in @(".env.example", "package-lock.json")) { continue }
    throw "Missing $src"
  }
  Copy-FileToStaging -Source $src -Destination (Join-Path $OutputDir $name)
}

$distSrc = Join-Path $RepoDir "dist"
$distDst = Join-Path $OutputDir "dist"
New-Item -ItemType Directory -Force -Path $distDst | Out-Null
Get-ChildItem -LiteralPath $distSrc -Recurse -File | ForEach-Object {
  if (-not $IncludeSourceMaps) {
    if ($_.Extension -eq ".map") { return }
  }
  $rel = $_.FullName.Substring($distSrc.Length).TrimStart('\')
  Copy-FileToStaging -Source $_.FullName -Destination (Join-Path $distDst $rel)
}
Complete-WindowsBuildArtifacts
foreach ($name in @("iii-config.yaml", "iii-config.docker.yaml", "docker-compose.yml", ".env.example")) {
  $src = Join-Path $RepoDir $name
  $dst = Join-Path $distDst $name
  if ((Test-Path $src) -and -not (Test-Path $dst)) {
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
}

Write-KitInfo "Copying kit scripts"
Get-ChildItem -LiteralPath $KitRoot -File | Where-Object {
  $_.Extension -in @(".cmd", ".md", ".json", ".ps1") -and $_.Name -ne "update.cmd"
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stagingKit $_.Name) -Force
}

$scriptsDst = Join-Path $stagingKit "scripts"
New-Item -ItemType Directory -Force -Path $scriptsDst | Out-Null
Get-ChildItem -LiteralPath (Join-Path $KitRoot "scripts") -File | Where-Object {
  $_.Name -ne "update.ps1"
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $scriptsDst $_.Name) -Force
}

$nodeSrc = Join-Path $PortableDir "node"
$nodeDst = Join-Path $stagingKit "portable\node"
if (-not (Test-Path $nodeSrc)) { throw "Portable Node missing: $nodeSrc" }
Write-KitInfo "Copying portable Node (robocopy) ..."
& robocopy $nodeSrc $nodeDst /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
$roboCode = $LASTEXITCODE
if ($roboCode -ge 8) {
  throw "robocopy Node failed with code $roboCode"
}

$portableIii = Join-Path $PortableDir "iii.exe"
if (Test-Path $portableIii) {
  New-Item -ItemType Directory -Force -Path (Join-Path $stagingKit "portable") | Out-Null
  Copy-Item -LiteralPath $portableIii -Destination (Join-Path $stagingKit "portable\iii.exe") -Force
}

Write-KitInfo "Seeding fresh kit runtime on staging"
[void](Seed-FreshKitRuntime -TargetKitRoot $stagingKit -IiiSource $IiiExe -EnvExample (Join-Path $RepoDir ".env.example"))

Write-KitInfo "npm install --omit=dev (rete richiesta sul PC di pack) ..."
$npmCmd = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) { throw "npm.cmd not found: $npmCmd" }
$prevLoc = Get-Location
$env:PATH = "$NodeDir;$env:PATH"
$env:npm_config_cache = Join-Path $env:TEMP "agentmemory-pack-npm-cache"
try {
  Set-Location $OutputDir
  Write-KitInfo "npm install --omit=dev ..."
  & $npmCmd install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install --omit=dev failed with code $LASTEXITCODE" }
}
finally {
  Set-Location $prevLoc
}

function Assert-PackComplete {
  param([string]$StagingRoot)

  $checks = @{
    "package.json"                                              = "in-tree package.json"
    "iii-config.yaml"                                           = "bundled iii-config"
    "dist\cli.mjs"                                              = "CLI"
    "dist\index.mjs"                                            = "worker"
    "dist\standalone.mjs"                                       = "MCP standalone"
    "dist\iii-config.yaml"                                      = "dist iii-config"
    "dist\viewer\index.html"                                    = "viewer"
    "agentmemory-portable\portable\node\node.exe"               = "portable Node"
    "agentmemory-portable\home\.agentmemory\bin\iii.exe"        = "iii.exe"
    "agentmemory-portable\home\.agentmemory\.env"               = "seed .env"
    "agentmemory-portable\home\.agentmemory\preferences.json"   = "seed preferences"
    "agentmemory-portable\data\README.txt"                      = "data README"
    "agentmemory-portable\scripts\_env.ps1"                     = "kit env"
  }

  $pkgRaw = Get-Content -LiteralPath (Join-Path $StagingRoot "package.json") -Raw -Encoding UTF8
  if ($pkgRaw -notmatch '"name"\s*:\s*"@agentmemory/agentmemory"') {
    throw "package.json non e @agentmemory/agentmemory (layout in-tree)"
  }

  foreach ($rel in $checks.Keys) {
    $abs = Join-Path $StagingRoot $rel
    if (-not (Test-Path -LiteralPath $abs)) {
      throw "Pack incompleto ($($checks[$rel])): manca $rel"
    }
  }

  if (Test-Path (Join-Path $StagingRoot "src")) {
    throw "Pack Runtime non deve contenere la cartella src"
  }
  if (Test-Path (Join-Path $StagingRoot ".git")) {
    throw "Pack Runtime non deve contenere la cartella .git"
  }

  $seedEnv = Get-Content -LiteralPath (Join-Path $StagingRoot "agentmemory-portable\home\.agentmemory\.env") -Raw -ErrorAction SilentlyContinue
  if ($seedEnv -match "(?m)^\s*(?:ANTHROPIC|OPENAI|GEMINI|OPENROUTER|MINIMAX|GOOGLE)_API_KEY\s*=\s*\S+") {
    Write-KitWarn "seed .env contiene una API key; controlla .env.example"
  }
}

Write-KitInfo "Writing MANIFEST.json (SHA256) ..."
$cfg = Get-KitConfig
$pkg = Get-Content -LiteralPath (Join-Path $OutputDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$fileEntries = @()
foreach ($rel in (Get-PackCriticalPaths -StagingRoot $OutputDir)) {
  $abs = Join-Path $OutputDir ($rel -replace '/', '\')
  if (-not (Test-Path -LiteralPath $abs)) {
    Write-KitWarn "Critical path skipped (missing): $rel"
    continue
  }
  $item = Get-Item -LiteralPath $abs
  $fileEntries += [pscustomobject]@{
    path      = $rel
    sha256    = (Get-FileSha256Lower -LiteralPath $abs)
    sizeBytes = [int64]$item.Length
  }
}

$manifest = [ordered]@{
  profile            = $Profile
  packageVersion     = [string]$pkg.version
  nodeVersion        = $cfg.NodeVersion
  iiiVersion         = $cfg.IiiVersion
  packedAt           = (Get-Date).ToUniversalTime().ToString("o")
  rebuilt            = [bool]$Rebuild
  includeData        = $false
  checksumAlgorithm  = "SHA256"
  totalSizeBytes     = (Get-DirectorySizeBytes -LiteralPath $OutputDir)
  files              = $fileEntries
}

$manifestPath = Join-Path $OutputDir "MANIFEST.json"
($manifest | ConvertTo-Json -Depth 6) | Set-Content -Path $manifestPath -Encoding UTF8

$readmeUsb = @(
  'agentmemory USB (runtime-only)',
  '==============================',
  '',
  'Avvio (tieni aperta la console):',
  '  agentmemory-portable\start.cmd',
  '',
  'Porte libere su questo PC: 3111, 3112, 3113, 49134',
  'Il kit NON usa Docker. Se le porte sono occupate, ferma l altro servizio e rilancia.',
  '',
  'Dati (memoria): agentmemory-portable\data',
  'Config runtime: agentmemory-portable\home\.agentmemory',
  '',
  'Verifica integrita dopo la copia sulla pendrive:',
  '  agentmemory-portable\verify-usb.cmd',
  '',
  'MCP Cursor (profilo HOST, non home del kit):',
  '  command = E:\agentmemory-usb\agentmemory-portable\mcp-launch.cmd',
  '  AGENTMEMORY_URL = http://127.0.0.1:3111',
  'Sostituisci E: con la lettera della USB.',
  '',
  'update.cmd NON e supportato su questo pacchetto (manca src e .git).',
  'Per aggiornare: rifai pack-usb.cmd sul PC di sviluppo e ricopia.',
  '',
  'Profilo: Runtime  |  USB vergine (nessuna memoria copiata dal PC di pack)'
) -join "`r`n"
Set-Content -Path (Join-Path $OutputDir "README-USB.txt") -Value $readmeUsb -Encoding UTF8

Assert-PackComplete -StagingRoot $OutputDir

Write-KitInfo "Self-check SHA256 ..."
if (-not (Test-UsbManifestIntegrity -PackRoot $OutputDir)) {
  throw "Self-check checksum fallito"
}

if ($Zip) {
  $zipName = "agentmemory-usb-{0}.zip" -f (Get-Date).ToUniversalTime().ToString("yyyyMMdd")
  $zipPath = Join-Path (Split-Path -Parent $OutputDir) $zipName
  if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Write-KitInfo "Creating zip $zipPath ..."
  Compress-Archive -Path $OutputDir -DestinationPath $zipPath -Force
}

$sizeMb = [math]::Round($manifest.totalSizeBytes / 1MB, 1)
Write-KitInfo "Pack complete: $OutputDir ($sizeMb MB, $($fileEntries.Count) checksums)"
Write-KitInfo "Copia questa cartella sulla pendrive, poi start.cmd"
Write-Host "Verifica: agentmemory-portable\verify-usb.cmd" -ForegroundColor DarkGray
