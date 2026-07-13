param(
    [ValidateSet("background", "once")]
    [string]$Mode = "background"
)

$ErrorActionPreference = "Stop"
$runId = [guid]::NewGuid().ToString("N")
$userScope = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([Environment]::UserName)).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$mutexName = "Local\AgentMemoryArchiveWatcher_$userScope"
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$held = $false

try {
    try {
        $held = $mutex.WaitOne(0)
    } catch [System.Threading.AbandonedMutexException] {
        $held = $true
    }

    if (-not $held) {
        Write-Output (ConvertTo-Json @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); level = "info"; pid = $PID; runId = $runId; mode = $Mode; message = "watcher already running" } -Compress)
        exit 0
    }

    Write-Output (ConvertTo-Json @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); level = "info"; pid = $PID; runId = $runId; mode = $Mode; mutex = $mutexName; message = "watcher mutex acquired" } -Compress)
    & agentmemory archive-watcher run --mode $Mode --no-mutex
    exit $LASTEXITCODE
} finally {
    if ($held) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
