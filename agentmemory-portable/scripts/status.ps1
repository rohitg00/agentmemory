# Daemon status / doctor against the portable home.
param(
  [ValidateSet("status", "doctor")]
  [string]$Mode = "status"
)

. "$PSScriptRoot\_env.ps1"

Assert-NodePresent
Assert-RepoBuilt
Set-PortableRuntimeEnv -ForDaemon

$code = Invoke-AgentmemoryCli $Mode
exit $code
