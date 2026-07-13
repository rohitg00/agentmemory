param(
    [string]$TaskName = "AgentMemory Autostart"
)

$ErrorActionPreference = "Stop"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Output "Removed Scheduled Task '$TaskName'."
} else {
    Write-Output "Scheduled Task '$TaskName' was not present."
}

# Deliberately preserve ~/.agentmemory state, archive ledger, canonical store,
# and memory data. Task removal is the only destructive operation here.
