param(
    [string]$TaskName = "AgentMemory Autostart"
)

$ErrorActionPreference = "Stop"

$cli = Get-Command agentmemory -ErrorAction SilentlyContinue
if ($null -eq $cli) {
    throw "The stable 'agentmemory' CLI was not found on PATH. Install @agentmemory/agentmemory globally before registering the archive watcher."
}

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument '/d /c "agentmemory archive-watcher run --mode background"'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType InteractiveToken `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Run the Codex archive watcher through the stable agentmemory CLI." `
    -Force | Out-Null

Write-Output "Registered Scheduled Task '$TaskName' using the stable agentmemory CLI."
