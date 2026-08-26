# Bootstrap one-shot: Node portable + iii.exe + clone + npm ci/build + seed config.
param(
  [string]$UseExistingRepo = "",
  [switch]$SkipNodeDownload,
  [switch]$SkipIiiDownload,
  [switch]$SkipClone,
  [switch]$SkipBuild
)

. "$PSScriptRoot\_env.ps1"

$cfg = Get-KitConfig
$nodeVersion = $cfg.NodeVersion
$iiiVersion = $cfg.IiiVersion
$repoUrl = $cfg.RepoUrl

Write-KitInfo "Kit root: $KitRoot"
Write-KitInfo "Repo dir: $RepoDir (in-tree=$InTree)"
Write-KitInfo "Node pin: v$nodeVersion | iii pin: v$iiiVersion"

[void](Seed-FreshKitRuntime -TargetKitRoot $KitRoot -EnvExample (Join-Path $RepoDir ".env.example"))

# SQLite lives in kit\data via AGENTMEMORY_DATA_DIR (set at start).
# Engine template is the bundled repo iii-config.yaml — do not copy it into the kit.

# --- Node.js portable ---
if (-not $SkipNodeDownload) {
  if (Test-Path $NodeExe) {
    Write-KitInfo "Node already present: $NodeExe"
  }
  else {
    $nodeZipName = "node-v$nodeVersion-win-x64.zip"
    $nodeUrl = "https://nodejs.org/dist/v$nodeVersion/$nodeZipName"
    $nodeZip = Join-Path $DownloadsDir $nodeZipName
    Write-KitInfo "Downloading Node $nodeVersion ..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
    $extractTmp = Join-Path $DownloadsDir "node-extract"
    if (Test-Path $extractTmp) { Remove-Item -Recurse -Force $extractTmp }
    Expand-Archive -Path $nodeZip -DestinationPath $extractTmp -Force
    $inner = Get-ChildItem $extractTmp -Directory | Select-Object -First 1
    if (-not $inner) { throw "Node extract failed: inner folder missing" }
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    Move-Item -Path $inner.FullName -Destination $NodeDir
    Remove-Item -Recurse -Force $extractTmp -ErrorAction SilentlyContinue
    Write-KitInfo "Node installed at $NodeDir"
  }
}

Assert-NodePresent
$env:PATH = "$NodeDir;$env:PATH"
$env:npm_config_cache = Join-Path $PortableDir "npm-cache"

# --- iii-engine ---
if (-not $SkipIiiDownload) {
  if (Test-Path $IiiExe) {
    Write-KitInfo "iii.exe already present: $IiiExe"
  }
  else {
    $iiiZipName = "iii-x86_64-pc-windows-msvc.zip"
    $iiiUrl = "https://github.com/iii-hq/iii/releases/download/iii/v$iiiVersion/$iiiZipName"
    $iiiZip = Join-Path $DownloadsDir $iiiZipName
    Write-KitInfo "Downloading iii-engine v$iiiVersion ..."
    Invoke-WebRequest -Uri $iiiUrl -OutFile $iiiZip -UseBasicParsing
    $iiiExtract = Join-Path $DownloadsDir "iii-extract"
    if (Test-Path $iiiExtract) { Remove-Item -Recurse -Force $iiiExtract }
    Expand-Archive -Path $iiiZip -DestinationPath $iiiExtract -Force
    $found = Get-ChildItem -Path $iiiExtract -Filter "iii.exe" -Recurse | Select-Object -First 1
    if (-not $found) { throw "iii.exe not found in downloaded zip" }
    Copy-Item -Path $found.FullName -Destination $IiiExe -Force
    Copy-Item -Path $found.FullName -Destination (Join-Path $PortableDir "iii.exe") -Force
    Remove-Item -Recurse -Force $iiiExtract -ErrorAction SilentlyContinue
    Write-KitInfo "iii.exe installed at $IiiExe"
  }
}

Assert-IiiPresent

[void](Seed-FreshKitRuntime -TargetKitRoot $KitRoot -IiiSource $IiiExe -EnvExample (Join-Path $RepoDir ".env.example"))

# --- repo ---
if ($InTree) {
  Write-KitInfo "In-tree layout: using parent project as repo ($RepoDir)"
}
elseif (-not $SkipClone) {
  if ($UseExistingRepo) {
    $src = (Resolve-Path $UseExistingRepo).Path
    if (Test-Path $RepoDir) {
      Write-KitWarn "repo\ already exists - skipping junction to $src"
    }
    else {
      Write-KitInfo "Linking existing repo via junction: $src"
      cmd /c "mklink /J `"$RepoDir`" `"$src`""
      if ($LASTEXITCODE -ne 0) { throw "mklink /J failed" }
    }
  }
  elseif (Test-Path (Join-Path $RepoDir ".git")) {
    Write-KitInfo "Clone already present at $RepoDir"
  }
  else {
    if (Test-Path $RepoDir) {
      throw "repo\ exists but is not a git clone. Remove it or use -UseExistingRepo"
    }
    Write-KitInfo "Cloning $repoUrl ..."
    git clone --depth 1 $repoUrl $RepoDir
    if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
  }
}

# --- build ---
if (-not $SkipBuild) {
  if (-not (Test-Path $RepoDir)) {
    throw "repo\ missing - cannot run npm install/build"
  }
  $npmCmd = Join-Path $NodeDir "npm.cmd"
  if (-not (Test-Path $npmCmd)) { throw "npm.cmd not found in portable Node: $npmCmd" }

  Set-Location $RepoDir
  Write-KitInfo "npm install ..."
  & $npmCmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

  Invoke-RepoBuild
}

if (-not (Test-Path $CliEntry)) {
  throw "Build incomplete: missing $CliEntry"
}

Write-KitInfo "Setup complete."
Write-KitInfo "Start with start.cmd | Stop with stop.cmd | Update with update.cmd"
Write-Host ""
Write-Host "Default ports: REST 3111 | streams 3112 | viewer 3113 | engine WS 49134"
Write-Host "Cursor MCP config: see mcp-cursor.example.json and README.md"
