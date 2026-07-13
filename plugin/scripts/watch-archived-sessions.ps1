param(
    [switch]$Once
)

$ErrorActionPreference = "Stop"
$mode = if ($Once) { "once" } else { "background" }

# Compatibility/manual entry point. The Scheduled Task intentionally invokes
# the stable `agentmemory` CLI directly instead of pointing at this file.
& agentmemory archive-watcher run --mode $mode
exit $LASTEXITCODE
