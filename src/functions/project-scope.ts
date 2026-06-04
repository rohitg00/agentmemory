import { isProjectIsolationEnabled } from "../config.js";

export function resolveProjectScope(value: unknown): string | undefined {
  const explicit =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  if (explicit) return explicit;
  const envProject = process.env["AGENTMEMORY_PROJECT_NAME"];
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
    throw new Error(
      `${operation}: project is required when AGENTMEMORY_PROJECT_ISOLATION=true`,
    );
  }
  return project;
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
