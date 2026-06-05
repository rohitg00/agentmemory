import { getEnvVar, isProjectIsolationEnabled } from "../config.js";

export function resolveProjectScope(value: unknown): string | undefined {
  const explicit =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  if (explicit) return explicit;
  const envProject = getEnvVar("AGENTMEMORY_PROJECT_NAME");
  return typeof envProject === "string" && envProject.trim().length > 0
    ? envProject.trim()
    : undefined;
}

export function requireProjectScope(
  value: unknown,
  operation: string,
): string | undefined {
  const project = resolveProjectScope(value);
  if (isProjectIsolationEnabled() && !project) {
    throw new Error(projectRequiredMessage(operation));
  }
  return project;
}

export function projectRequiredMessage(operation: string): string {
  return `${operation}: project is required when AGENTMEMORY_PROJECT_ISOLATION is enabled (default); use the repo root folder name, or set AGENTMEMORY_PROJECT_ISOLATION=false to run unscoped.`;
}

export function projectMatchesScope(
  recordProject: string | undefined,
  requestedProject: string,
): boolean {
  if (isProjectIsolationEnabled()) {
    return recordProject === requestedProject;
  }
  return !recordProject || recordProject === requestedProject;
}
