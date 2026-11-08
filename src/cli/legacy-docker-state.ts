export interface LegacyDockerEngineState {
  kind: "docker";
  composeFile?: string;
  projectName?: string;
  containerId?: string;
  restPort?: number;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function legacyDockerStopCommand(state: LegacyDockerEngineState): string {
  const project = state.projectName?.trim();
  const composeFile = state.composeFile?.trim();
  if (composeFile) {
    return `docker compose${project ? ` -p ${shellQuote(project)}` : ""} -f ${shellQuote(composeFile)} stop`;
  }
  if (project) return `docker compose -p ${shellQuote(project)} stop`;
  if (state.containerId?.trim()) return `docker stop ${shellQuote(state.containerId.trim())}`;
  return "Cannot construct a stop command: legacy lifecycle state has no Compose file, project, or container ID.";
}

export function legacyDockerStateMessage(state: LegacyDockerEngineState): string {
  const port = state.restPort && Number.isFinite(state.restPort)
    ? state.restPort
    : Number(state.projectName?.match(/^agentmemory-(\d+)$/)?.[1] ?? 3111);
  return [
    `This installation was started by an older Docker-based agentmemory CLI (REST port ${port}); Docker lifecycle management is no longer part of this CLI.`,
    "Stop the old container explicitly before switching to Worker Compose:",
    `  ${legacyDockerStopCommand(state)}`,
    "The legacy lifecycle state is preserved; no container or data was changed.",
  ].join("\n");
}
