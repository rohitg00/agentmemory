# Shared environment for the agentmemory USB portable kit.
# Dot-source from other scripts: . "$PSScriptRoot\_env.ps1"

$ErrorActionPreference = "Stop"

$script:KitRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:DataDir = Join-Path $KitRoot "data"
$script:HomeDir = Join-Path $KitRoot "home"
$script:PortableDir = Join-Path $KitRoot "portable"
$script:NodeDir = Join-Path $PortableDir "node"
$script:NodeExe = Join-Path $NodeDir "node.exe"
$script:AgentmemoryHome = Join-Path $HomeDir ".agentmemory"
$script:IiiBinDir = Join-Path $AgentmemoryHome "bin"
$script:IiiExe = Join-Path $IiiBinDir "iii.exe"
$script:DownloadsDir = Join-Path $KitRoot "downloads"

# Host profile before remapping (needed for git credentials during update)
$script:RealUserProfile = $env:USERPROFILE
$script:RealHome = $env:HOME
$script:RealAppData = $env:APPDATA
$script:RealLocalAppData = $env:LOCALAPPDATA
$script:RealTemp = $env:TEMP
$script:RealTmp = $env:TMP

$script:PinnedIiiVersion = "0.11.2"
$script:PinnedNodeVersion = "22.16.0"
$script:DefaultRepoUrl = "https://github.com/rohitg00/agentmemory.git"

# Layout:
# - in-tree: kit lives at <repo>/agentmemory-portable (pushable with the project)
# - nested:  standalone USB folder with its own repo\ clone
function Test-InTreeLayout {
  $parent = Join-Path $KitRoot ".."
  $pkg = Join-Path $parent "package.json"
  if (-not (Test-Path $pkg)) { return $false }
  try {
    $raw = Get-Content -LiteralPath $pkg -Raw -ErrorAction Stop
    return [bool]($raw -match '"name"\s*:\s*"@agentmemory/agentmemory"')
  } catch {
    return $false
  }
}

$script:InTree = Test-InTreeLayout
if ($InTree) {
  $script:RepoDir = (Resolve-Path (Join-Path $KitRoot "..")).Path
} else {
  $script:RepoDir = Join-Path $KitRoot "repo"
}
$script:CliEntry = Join-Path $RepoDir "dist\cli.mjs"
$script:IiiConfigPath = Join-Path $RepoDir "iii-config.yaml"

function Write-KitInfo([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Cyan
}

function Write-KitWarn([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Yellow
}

function Write-KitError([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Red
}

function Get-KitConfig {
  $cfgPath = Join-Path $KitRoot "kit.config.ps1"
  $cfg = [ordered]@{
    RepoUrl     = $DefaultRepoUrl
    IiiVersion  = $PinnedIiiVersion
    NodeVersion = $PinnedNodeVersion
  }
  if (Test-Path $cfgPath) {
    . $cfgPath
    if ($RepoUrl) { $cfg.RepoUrl = $RepoUrl }
    if ($IiiVersion) { $cfg.IiiVersion = $IiiVersion }
    if ($NodeVersion) { $cfg.NodeVersion = $NodeVersion }
  }
  return $cfg
}

function Assert-NodePresent {
  if (-not (Test-Path $NodeExe)) {
    Write-KitError "Node portatile non trovato: $NodeExe"
    Write-KitError "Esegui prima setup.cmd"
    exit 1
  }
}

function Assert-RepoBuilt {
  if (-not (Test-Path $RepoDir)) {
    Write-KitError "Repo assente: $RepoDir"
    Write-KitError "Esegui prima setup.cmd"
    exit 1
  }
  if (-not (Test-Path $CliEntry)) {
    Write-KitError "Build assente: $CliEntry"
    Write-KitError "Esegui setup.cmd oppure update.cmd"
    exit 1
  }
}

function Assert-IiiPresent {
  if (-not (Test-Path $IiiExe)) {
    Write-KitError "iii.exe non trovato: $IiiExe"
    Write-KitError "Esegui prima setup.cmd"
    exit 1
  }
}

function Assert-UsbDataLayout {
  if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  }
  if (-not (Test-Path $IiiConfigPath)) {
    Write-KitError "Missing bundled iii-config.yaml at $IiiConfigPath"
    Write-KitError "Esegui setup.cmd oppure update.cmd"
    exit 1
  }
}

$script:KitPorts = @(3111, 3112, 3113, 49134)

function Clear-KitRuntimeState {
  Write-KitInfo "Cleaning leftover kit processes / pid files under home\.agentmemory ..."
  foreach ($name in @("iii.pid", "worker.pid", "engine-state.json")) {
    $p = Join-Path $AgentmemoryHome $name
    if (Test-Path $p) {
      Remove-Item -Force $p -ErrorAction SilentlyContinue
      Write-KitInfo "  removed $name"
    }
  }

  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Path -and (
        $_.Path -like "*\agentmemory-portable\*" -or
        $_.Path -like "*\home\.agentmemory\bin\iii.exe"
      )
    } |
    ForEach-Object {
      Write-KitInfo "  stopping leftover $($_.ProcessName) pid $($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

function Test-LocalPortOpen {
  param([int]$Port)

  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $wait = $iar.AsyncWaitHandle.WaitOne(250, $false)
    if (-not $wait) { return $false }
    try { $client.EndConnect($iar) } catch { return $false }
    return $client.Connected
  } catch {
    return $false
  } finally {
    if ($client) { $client.Close() }
  }
}

function Get-ListenOwners {
  param([int]$Port)

  $owners = @()
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      $procName = ""
      try {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) { $procName = $proc.ProcessName }
      } catch {}
      $owners += [pscustomobject]@{ Port = $Port; Pid = $procId; Name = $procName }
    }
  } catch {
  } finally {
    $ErrorActionPreference = $prev
  }

  if ($owners.Count -eq 0 -and (Test-LocalPortOpen -Port $Port)) {
    $owners += [pscustomobject]@{ Port = $Port; Pid = $null; Name = "" }
  }
  return $owners
}

function Show-PortIncompatibility {
  param(
    [object[]]$Owners
  )

  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Yellow
  Write-Host "  INCOMPATIBILITA PORTE" -ForegroundColor Yellow
  Write-Host "============================================================" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Il kit USB non usa Docker e non scrive dati sul PC." -ForegroundColor White
  Write-Host "Fonte di verita: questa pen drive / cartella (data\)." -ForegroundColor White
  Write-Host ""
  Write-Host "Porte richieste libere su 127.0.0.1: $($KitPorts -join ', ')" -ForegroundColor White
  Write-Host "Porte occupate:" -ForegroundColor Cyan
  foreach ($o in $Owners) {
    $who = if ($o.Name) { "$($o.Name) pid $($o.Pid)" } elseif ($o.Pid) { "pid $($o.Pid)" } else { "processo sconosciuto" }
    Write-Host ("  {0,-6}  {1}" -f $o.Port, $who) -ForegroundColor Cyan
  }
  Write-Host ""
  Write-Host "Libera queste porte (ferma l'altro agentmemory / Docker / servizio) e rilancia start.cmd." -ForegroundColor White
  Write-Host "Il kit non ferma processi esterni e non si aggancia a un engine gia in ascolto." -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "============================================================" -ForegroundColor Yellow
  Write-Host "Premi Invio per chiudere..." -ForegroundColor DarkGray
  try { [void][System.Console]::ReadLine() } catch { Start-Sleep -Seconds 5 }
}

function Assert-KitPortsFree {
  Clear-KitRuntimeState
  Start-Sleep -Milliseconds 400

  $busy = @()
  foreach ($port in $KitPorts) {
    $busy += @(Get-ListenOwners -Port $port)
  }
  if ($busy.Count -eq 0) { return }

  Show-PortIncompatibility -Owners $busy
  exit 1
}

function Set-PortableRuntimeEnv {
  param(
    [switch]$ForDaemon
  )

  $env:PATH = "$NodeDir;$IiiBinDir;$env:PATH"
  $env:npm_config_cache = Join-Path $PortableDir "npm-cache"

  if ($ForDaemon) {
    $env:USERPROFILE = $HomeDir
    $env:HOME = $HomeDir
    $env:HOMEDRIVE = (Split-Path -Qualifier $HomeDir)
    $env:HOMEPATH = ($HomeDir.Substring($env:HOMEDRIVE.Length))
    $env:APPDATA = Join-Path $HomeDir "AppData\Roaming"
    $env:LOCALAPPDATA = Join-Path $HomeDir "AppData\Local"
    $env:TEMP = Join-Path $HomeDir "Temp"
    $env:TMP = Join-Path $HomeDir "Temp"

    $env:HF_HOME = Join-Path $HomeDir "cache\huggingface"
    $env:TRANSFORMERS_CACHE = Join-Path $HomeDir "cache\transformers"
    $env:XDG_CACHE_HOME = Join-Path $HomeDir "cache"

    $env:AGENTMEMORY_III_VERSION = (Get-KitConfig).IiiVersion
    $env:AGENTMEMORY_URL = "http://127.0.0.1:3111"
    $env:AGENTMEMORY_DATA_DIR = $DataDir
    $env:AGENTMEMORY_III_CONFIG = $IiiConfigPath
    $env:AGENTMEMORY_USE_DOCKER = "0"
    $env:AGENTMEMORY_EXPORT_ROOT = Join-Path $AgentmemoryHome "exports"
    $env:SNAPSHOT_DIR = Join-Path $AgentmemoryHome "snapshots"

    foreach ($d in @(
        $env:APPDATA,
        $env:LOCALAPPDATA,
        $env:TEMP,
        $env:HF_HOME,
        $env:TRANSFORMERS_CACHE,
        $env:XDG_CACHE_HOME,
        $AgentmemoryHome,
        $IiiBinDir,
        $DataDir,
        $env:AGENTMEMORY_EXPORT_ROOT,
        $env:SNAPSHOT_DIR
      )) {
      if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Force -Path $d | Out-Null
      }
    }
  }
}

function Invoke-AgentmemoryCli {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CliArgs
  )

  Assert-NodePresent
  Assert-RepoBuilt
  Assert-UsbDataLayout
  # cwd = kit root; SQLite path comes from AGENTMEMORY_DATA_DIR, not relative ./data
  Set-Location $KitRoot
  & $NodeExe $CliEntry @CliArgs
  return $LASTEXITCODE
}

function Complete-WindowsBuildArtifacts {
  # package.json "build" uses Unix cp/mkdir/true; on Windows cmd that tail fails
  # after tsdown already wrote dist/. Copy the runtime assets the CLI expects.
  $dist = Join-Path $RepoDir "dist"
  if (-not (Test-Path $dist)) {
    New-Item -ItemType Directory -Force -Path $dist | Out-Null
  }
  foreach ($name in @("iii-config.yaml", "iii-config.docker.yaml", "docker-compose.yml", ".env.example")) {
    $src = Join-Path $RepoDir $name
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $dist $name) -Force
    }
  }
  $viewerSrc = Join-Path $RepoDir "src\viewer"
  $viewerDst = Join-Path $dist "viewer"
  if (-not (Test-Path $viewerDst)) {
    New-Item -ItemType Directory -Force -Path $viewerDst | Out-Null
  }
  foreach ($name in @("index.html", "favicon.svg")) {
    $src = Join-Path $viewerSrc $name
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $viewerDst $name) -Force
    }
  }
}

function Invoke-RepoBuild {
  $npmCmd = Join-Path $NodeDir "npm.cmd"
  if (-not (Test-Path $npmCmd)) { throw "npm.cmd not found in portable Node: $npmCmd" }
  Set-Location $RepoDir
  Write-KitInfo "npm run build (tsdown) ..."
  & $npmCmd run build
  $buildCode = $LASTEXITCODE
  Complete-WindowsBuildArtifacts
  if (-not (Test-Path $CliEntry)) {
    throw "Build incomplete: missing $CliEntry (npm exit $buildCode)"
  }
  if ($buildCode -ne 0) {
    Write-KitWarn "npm run build exited $buildCode (Unix post-copy on Windows). Assets repaired; dist\cli.mjs OK."
  }
}

function Get-KitRuntimeLayout {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetKitRoot
  )

  $homeDir = Join-Path $TargetKitRoot "home"
  $amHome = Join-Path $homeDir ".agentmemory"
  return [pscustomobject]@{
    KitRoot         = $TargetKitRoot
    DataDir         = Join-Path $TargetKitRoot "data"
    HomeDir         = $homeDir
    PortableDir     = Join-Path $TargetKitRoot "portable"
    DownloadsDir    = Join-Path $TargetKitRoot "downloads"
    AgentmemoryHome = $amHome
    IiiBinDir       = Join-Path $amHome "bin"
    IiiExe          = Join-Path $amHome "bin\iii.exe"
    EnvFile         = Join-Path $amHome ".env"
    PrefsFile       = Join-Path $amHome "preferences.json"
    DataReadme      = Join-Path $TargetKitRoot "data\README.txt"
  }
}

function Ensure-KitRuntimeDirs {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetKitRoot
  )

  $layout = Get-KitRuntimeLayout -TargetKitRoot $TargetKitRoot
  foreach ($d in @(
      $layout.HomeDir,
      $layout.AgentmemoryHome,
      $layout.IiiBinDir,
      $layout.PortableDir,
      $layout.DownloadsDir,
      $layout.DataDir,
      (Join-Path $layout.HomeDir "AppData\Roaming"),
      (Join-Path $layout.HomeDir "AppData\Local"),
      (Join-Path $layout.HomeDir "Temp"),
      (Join-Path $layout.HomeDir "cache"),
      (Join-Path $layout.HomeDir "cache\huggingface"),
      (Join-Path $layout.HomeDir "cache\transformers"),
      (Join-Path $layout.AgentmemoryHome "exports"),
      (Join-Path $layout.AgentmemoryHome "snapshots")
    )) {
    if (-not (Test-Path $d)) {
      New-Item -ItemType Directory -Force -Path $d | Out-Null
    }
  }
  return $layout
}

function Seed-FreshKitRuntime {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetKitRoot,
    [string]$IiiSource = "",
    [string]$EnvExample = ""
  )

  $layout = Ensure-KitRuntimeDirs -TargetKitRoot $TargetKitRoot

  if (-not (Test-Path $layout.DataReadme)) {
    @(
      "SQLite + stream store for the portable kit.",
      "All memory data lives here (on the USB), not inside repo\."
    ) | Set-Content -Path $layout.DataReadme -Encoding UTF8
  }

  $iiiCandidates = @()
  if ($IiiSource) { $iiiCandidates += $IiiSource }
  $iiiCandidates += (Join-Path $layout.PortableDir "iii.exe")
  $iiiCandidates += $IiiExe
  $resolvedIii = $iiiCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($resolvedIii) {
    if (-not (Test-Path $layout.IiiExe)) {
      Copy-Item -LiteralPath $resolvedIii -Destination $layout.IiiExe -Force
      Write-KitInfo "iii.exe -> $($layout.IiiExe)"
    }
    $portableBackup = Join-Path $layout.PortableDir "iii.exe"
    if (-not (Test-Path $portableBackup)) {
      Copy-Item -LiteralPath $resolvedIii -Destination $portableBackup -Force
    }
  }

  if (-not (Test-Path $layout.EnvFile)) {
    if ($EnvExample -and (Test-Path $EnvExample)) {
      Copy-Item -LiteralPath $EnvExample -Destination $layout.EnvFile
    }
    else {
      @(
        "# agentmemory portable kit - minimal seed",
        "EMBEDDING_PROVIDER=local",
        "AGENTMEMORY_URL=http://127.0.0.1:3111"
      ) | Set-Content -Path $layout.EnvFile -Encoding UTF8
    }
    @(
      "",
      "# --- portable kit overrides ---",
      "EMBEDDING_PROVIDER=local",
      "AGENTMEMORY_URL=http://127.0.0.1:3111",
      "AGENTMEMORY_USE_DOCKER=0"
    ) | Add-Content -Path $layout.EnvFile -Encoding UTF8
    Write-KitInfo "Created $($layout.EnvFile)"
  }
  else {
    Write-KitInfo ".env already present - left unchanged ($($layout.EnvFile))"
  }

  if (-not (Test-Path $layout.PrefsFile)) {
    $prefs = @{
      schemaVersion       = 1
      lastAgent           = $null
      lastAgents          = @()
      lastProvider        = $null
      skipSplash          = $true
      skipNpxHint         = $true
      skipGlobalInstall   = $true
      skipConsoleInstall  = $true
      firstRunAt          = (Get-Date).ToUniversalTime().ToString("o")
      injectContextChosen = $true
    } | ConvertTo-Json -Depth 4
    Set-Content -Path $layout.PrefsFile -Value $prefs -Encoding UTF8
    Write-KitInfo "Created preferences.json (onboarding skipped)"
  }

  return $layout
}

function ConvertTo-PackRelativePath([string]$Path) {
  return ($Path -replace '\\', '/').TrimStart('/')
}

function Get-PackCriticalPaths {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StagingRoot
  )

  $fixed = @(
    "package.json",
    "iii-config.yaml",
    "dist/cli.mjs",
    "dist/index.mjs",
    "dist/standalone.mjs",
    "dist/iii-config.yaml",
    "dist/viewer/index.html",
    "dist/viewer/favicon.svg",
    "agentmemory-portable/portable/node/node.exe",
    "agentmemory-portable/home/.agentmemory/bin/iii.exe",
    "agentmemory-portable/portable/iii.exe",
    "agentmemory-portable/home/.agentmemory/.env",
    "agentmemory-portable/home/.agentmemory/preferences.json",
    "agentmemory-portable/scripts/_env.ps1"
  )

  $dist = Join-Path $StagingRoot "dist"
  if (Test-Path $dist) {
    foreach ($pattern in @("src-*.mjs", "connect-*.mjs", "tools-registry-*.mjs")) {
      Get-ChildItem -LiteralPath $dist -Filter $pattern -File -ErrorAction SilentlyContinue | ForEach-Object {
        $fixed += ("dist/" + $_.Name)
      }
    }
  }

  return @($fixed | ForEach-Object { ConvertTo-PackRelativePath $_ } | Select-Object -Unique)
}

function Get-FileSha256Lower {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )
  return (Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Test-UsbManifestIntegrity {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackRoot
  )

  $manifestPath = Join-Path $PackRoot "MANIFEST.json"
  if (-not (Test-Path $manifestPath)) {
    Write-KitError "MANIFEST.json assente: $manifestPath"
    return $false
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $manifest.files) {
    Write-KitError "MANIFEST.json senza files[]"
    return $false
  }

  $ok = $true
  foreach ($entry in $manifest.files) {
    $rel = [string]$entry.path
    $expected = ([string]$entry.sha256).ToLowerInvariant()
    $abs = Join-Path $PackRoot ($rel -replace '/', '\')
    if (-not (Test-Path -LiteralPath $abs)) {
      Write-Host "MISSING  $rel" -ForegroundColor Red
      $ok = $false
      continue
    }
    $actual = Get-FileSha256Lower -LiteralPath $abs
    if ($actual -ne $expected) {
      Write-Host "MISMATCH $rel" -ForegroundColor Red
      $ok = $false
    }
    else {
      Write-Host "OK       $rel" -ForegroundColor Green
    }
  }
  return $ok
}

function Get-DirectorySizeBytes {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )
  $sum = (Get-ChildItem -LiteralPath $LiteralPath -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
  if ($null -eq $sum) { return 0 }
  return [int64]$sum
}

