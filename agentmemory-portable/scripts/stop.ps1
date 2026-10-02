# Stop engine + worker started by the portable kit.
param(
  [switch]$Force
)

. "$PSScriptRoot\_env.ps1"

Assert-NodePresent
Assert-RepoBuilt
Set-PortableRuntimeEnv -ForDaemon

Write-KitInfo "Stopping daemon (home=$env:USERPROFILE)..."

$cliArgs = @("stop")
if ($Force) { $cliArgs += "--force" }

$code = Invoke-AgentmemoryCli @cliArgs
exit $code
