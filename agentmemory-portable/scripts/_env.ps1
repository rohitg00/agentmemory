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

$script:PinnedIiiVersion = "0.22.1"
$script:PinnedNodeVersion = "22.16.0"
$script:DefaultRepoUrl = "https://github.com/rohitg00/agentmemory.git"

# Layout:
# - in-tree: kit lives at <repo>/agentmemory-portable (pushable with the project)
# - nested:  standalone USB folder with its own repo\ clone
<#
.SYNOPSIS
    Returns whether the kit lives inside an agentmemory repository clone.
#>
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

<#
.SYNOPSIS
    Writes an informational message for kit scripts.
#>
function Write-KitInfo([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Cyan
}

<#
.SYNOPSIS
    Writes a warning message for kit scripts.
#>
function Write-KitWarn([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Yellow
}

<#
.SYNOPSIS
    Writes an error message for kit scripts.
#>
function Write-KitError([string]$Message) {
  Write-Host "[agentmemory-portable] $Message" -ForegroundColor Red
}

<#
.SYNOPSIS
    Loads kit.config.ps1 overrides merged with default pins.
#>
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

<#
.SYNOPSIS
    Exits when portable Node is not installed under the kit.
#>
function Assert-NodePresent {
  if (-not (Test-Path $NodeExe)) {
    Write-KitError "Node portatile non trovato: $NodeExe"
    Write-KitError "Esegui prima setup.cmd"
    exit 1
  }
}

<#
.SYNOPSIS
    Exits when the repository or dist CLI build is missing.
#>
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

<#
.SYNOPSIS
    Exits when iii.exe is missing from the kit home bin directory.
#>
function Assert-IiiPresent {
  if (-not (Test-Path $IiiExe)) {
    Write-KitError "iii.exe non trovato: $IiiExe"
    Write-KitError "Esegui prima setup.cmd"
    exit 1
  }
}

<#
.SYNOPSIS
    Downloads or refreshes iii.exe to match the configured pin.
#>
function Install-PinnedIiiEngine {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Version
  )

  [void](Ensure-KitRuntimeDirs -TargetKitRoot $KitRoot)
  $stampPath = Join-Path $IiiBinDir "iii.version"
  $backup = Join-Path $PortableDir "iii.exe"
  $installed = ""
  if (Test-Path -LiteralPath $stampPath) {
    $installed = (Get-Content -LiteralPath $stampPath -Raw).Trim()
  }

  if ((Test-Path -LiteralPath $IiiExe) -and ($installed -eq $Version)) {
    Write-KitInfo "iii.exe already present: $IiiExe (v$Version)"
    if (-not (Test-Path -LiteralPath $backup)) {
      Copy-Item -LiteralPath $IiiExe -Destination $backup -Force
    }
    return
  }

  if (Test-Path -LiteralPath $IiiExe) {
    if ($installed) {
      Write-KitWarn "iii.exe is v$installed; pinned v$Version - replacing"
    }
    else {
      Write-KitWarn "iii.exe has no version stamp; replacing with pinned v$Version"
    }
  }

  $iiiZipName = "iii-x86_64-pc-windows-msvc.zip"
  $iiiUrl = "https://github.com/iii-hq/iii/releases/download/iii/v$Version/$iiiZipName"
  $iiiZip = Join-Path $DownloadsDir $iiiZipName
  Write-KitInfo "Downloading iii-engine v$Version ..."
  Invoke-WebRequest -Uri $iiiUrl -OutFile $iiiZip -UseBasicParsing
  $iiiExtract = Join-Path $DownloadsDir "iii-extract"
  if (Test-Path $iiiExtract) { Remove-Item -Recurse -Force $iiiExtract }
  Expand-Archive -Path $iiiZip -DestinationPath $iiiExtract -Force
  $found = Get-ChildItem -Path $iiiExtract -Filter "iii.exe" -Recurse | Select-Object -First 1
  if (-not $found) { throw "iii.exe not found in downloaded zip" }
  Copy-Item -LiteralPath $found.FullName -Destination $IiiExe -Force
  Copy-Item -LiteralPath $found.FullName -Destination $backup -Force
  Set-Content -LiteralPath $stampPath -Value $Version -Encoding ascii -NoNewline
  Remove-Item -Recurse -Force $iiiExtract -ErrorAction SilentlyContinue
  Write-KitInfo "iii.exe installed at $IiiExe (v$Version)"
}

<#
.SYNOPSIS
    Ensures kit data directory and bundled iii-config.yaml exist.
#>
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

<#
.SYNOPSIS
    Returns the Win32 command line for a process id, or an empty string on failure.
#>
function Get-KitProcessCommandLine {
  param([int]$ProcessId)

  try {
    $proc = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    return [string]$proc.CommandLine
  } catch {
    return ""
  }
}

<#
.SYNOPSIS
    Returns true when a node command line matches the kit MCP launcher entry points.
#>
function Test-IsKitMcpNodeCommandLine {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  if ($CommandLine -match 'standalone\.mjs') { return $true }
  if ($CommandLine -match '(?:\\|/)mcp(?:\\|/)bin\.mjs') { return $true }
  if ($CommandLine -match 'cli\.mjs' -and $CommandLine -match '(?:\s|")mcp(?:\s|"|$)') { return $true }
  return $false
}

<#
.SYNOPSIS
    Returns true when a kit-scoped process should be stopped during startup cleanup.
#>
function Test-ShouldStopKitLeftoverProcess {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$RootPrefix
  )

  if (-not $Process.Path) { return $false }
  if (-not $Process.Path.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  $procName = $Process.ProcessName.ToLowerInvariant()
  if ($procName -eq 'iii') { return $true }
  if ($procName -ne 'node') { return $false }

  $cmd = Get-KitProcessCommandLine -ProcessId $Process.Id
  if ([string]::IsNullOrWhiteSpace($cmd)) { return $false }
  return -not (Test-IsKitMcpNodeCommandLine -CommandLine $cmd)
}

<#
.SYNOPSIS
    Removes stale pid files and stops leftover daemon processes under KitRoot.
#>
function Clear-KitRuntimeState {
  Write-KitInfo "Cleaning leftover kit processes / pid files under home\.agentmemory ..."
  foreach ($name in @("iii.pid", "worker.pid", "engine-state.json")) {
    $p = Join-Path $AgentmemoryHome $name
    if (Test-Path $p) {
      Remove-Item -Force $p -ErrorAction SilentlyContinue
      Write-KitInfo "  removed $name"
    }
  }

  $rootPrefix = ($KitRoot.TrimEnd('\') + '\')
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { Test-ShouldStopKitLeftoverProcess -Process $_ -RootPrefix $rootPrefix } |
    ForEach-Object {
      Write-KitInfo "  stopping leftover $($_.ProcessName) pid $($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

<#
.SYNOPSIS
    Returns whether a TCP port accepts connections on 127.0.0.1.
#>
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

<#
.SYNOPSIS
    Lists processes listening on a local TCP port.
#>
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

<#
.SYNOPSIS
    Prints port conflict guidance and exits with an error code.
#>
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

<#
.SYNOPSIS
    Clears kit runtime state and requires kit ports to be available.
#>
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

<#
.SYNOPSIS
    Remaps HOME and sets agentmemory environment for kit scripts.
#>
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

<#
.SYNOPSIS
    Runs the built CLI from the kit working directory.
#>
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

<#
.SYNOPSIS
    Copies viewer and config files into dist after a Windows build.
#>
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

<#
.SYNOPSIS
    Runs npm build and completes Windows-specific dist artifacts.
#>
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

<#
.SYNOPSIS
    Returns standard runtime paths for a portable kit root.
#>
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

<#
.SYNOPSIS
    Creates runtime directories for a portable kit root.
#>
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

<#
.SYNOPSIS
    Seeds data, env, preferences, and iii.exe for a fresh kit tree.
#>
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
    $destStamp = Join-Path $layout.IiiBinDir "iii.version"
    if (-not (Test-Path -LiteralPath $destStamp)) {
      $sourceStamp = Join-Path (Split-Path -Parent $resolvedIii) "iii.version"
      if (-not (Test-Path -LiteralPath $sourceStamp)) {
        $sourceStamp = Join-Path $IiiBinDir "iii.version"
      }
      if (Test-Path -LiteralPath $sourceStamp) {
        Copy-Item -LiteralPath $sourceStamp -Destination $destStamp -Force
      }
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

<#
.SYNOPSIS
    Resolves a path to a full path without a trailing backslash.
#>
function Get-KitNormalizedPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )
  return [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

<#
.SYNOPSIS
    Returns true when an env file contains a populated provider API key.
#>
function Test-EnvContainsPopulatedApiKey {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return $false }
  $raw = Get-Content -LiteralPath $LiteralPath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
  if (-not $raw) { return $false }
  return [bool]($raw -match "(?m)^\s*(?:ANTHROPIC|OPENAI|GEMINI|OPENROUTER|MINIMAX|GOOGLE)_API_KEY\s*=\s*\S+")
}

<#
.SYNOPSIS
    Exits when .env.example contains populated API keys.
#>
function Assert-EnvExampleSafeForPack {
  param(
    [Parameter(Mandatory = $true)]
    [string]$EnvExamplePath
  )
  if (Test-EnvContainsPopulatedApiKey -LiteralPath $EnvExamplePath) {
    Write-KitError "`.env.example` contiene una API key valorizzata: $EnvExamplePath"
    Write-KitError "Rimuovi i segreti prima di pack-usb (il pacchetto USB non deve esporre credenziali)."
    exit 1
  }
}

<#
.SYNOPSIS
    Exits when a pack output path would delete protected kit or repo data.
#>
function Assert-PackOutputDirSafe {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CandidateOutputDir
  )

  $out = Get-KitNormalizedPath -Path $CandidateOutputDir
  $allowedOutRoot = Get-KitNormalizedPath -Path (Join-Path $KitRoot "out")
  $repo = Get-KitNormalizedPath -Path $RepoDir
  $kit = Get-KitNormalizedPath -Path $KitRoot

  $protected = @(
    $repo,
    $kit,
    (Get-KitNormalizedPath -Path $DataDir),
    (Get-KitNormalizedPath -Path $HomeDir),
    (Get-KitNormalizedPath -Path $AgentmemoryHome),
    (Get-KitNormalizedPath -Path $PortableDir)
  )

  foreach ($p in $protected) {
    if ($out.Equals($p, [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-KitError "Output non consentito (percorso protetto): $out"
      exit 1
    }
    if ($p.StartsWith($out + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      Write-KitError "Output non consentito (cancellerebbe dati o sorgenti): $out"
      exit 1
    }
  }

  if ($out.StartsWith($kit + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    $underKitOut = $out.Equals($allowedOutRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      $out.StartsWith($allowedOutRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $underKitOut) {
      Write-KitError "Output dentro il kit consentito solo sotto: $allowedOutRoot"
      exit 1
    }
  }

  if ($out.StartsWith($repo + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    $underKitOut = $out.StartsWith($allowedOutRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
      $out.Equals($allowedOutRoot, [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $underKitOut) {
      Write-KitError "Output dentro il repository consentito solo sotto agentmemory-portable\out\"
      exit 1
    }
  }
}

<#
.SYNOPSIS
    Normalizes a filesystem path for manifest entries.
#>
function ConvertTo-PackRelativePath([string]$Path) {
  return ($Path -replace '\\', '/').TrimStart('/')
}

<#
.SYNOPSIS
    Lists relative paths that receive SHA256 entries in the USB manifest.
#>
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

<#
.SYNOPSIS
    Computes a lowercase SHA256 hex digest for a file.
#>
function Get-FileSha256Lower {
  param(
    [Parameter(Mandatory = $true)]
    [string]$LiteralPath
  )
  return (Get-FileHash -LiteralPath $LiteralPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

<#
.SYNOPSIS
    Verifies MANIFEST.json file hashes against the pack directory.
#>
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

<#
.SYNOPSIS
    Returns the total size in bytes of all files under a directory.
#>
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

