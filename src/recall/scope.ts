import type { Memory, RecallRequest, RecallScope } from "../types.js";

export interface ScopeDecision {
  eligible: boolean;
  score: number;
  reason: string;
}

export function normalizeScope(value: unknown): RecallScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { level: "unknown" };
  }
  const raw = value as Partial<RecallScope>;
  if (
    raw.level !== "project" &&
    raw.level !== "repo" &&
    raw.level !== "user" &&
    raw.level !== "unknown"
  ) {
    return { level: "unknown" };
  }
  return {
    level: raw.level,
    ...(typeof raw.projectId === "string" && raw.projectId.trim()
      ? { projectId: raw.projectId.trim() }
      : {}),
    ...(typeof raw.repoId === "string" && raw.repoId.trim()
      ? { repoId: raw.repoId.trim() }
      : {}),
  };
}

export function memoryScope(memory: Memory): RecallScope {
  return normalizeScope(memory.scope);
}

export function evaluateScope(
  scope: RecallScope,
  request: Pick<RecallRequest, "projectId" | "repoId" | "outputMode">,
  allowUnknown: boolean,
): ScopeDecision {
  if (scope.level === "user") {
    return { eligible: true, score: 0, reason: "selected because explicit user scope" };
  }
  if (scope.level === "unknown") {
    if (!allowUnknown) {
      return { eligible: false, score: -0.1, reason: "dropped because scope is unknown for automatic injection" };
    }
    return { eligible: true, score: -0.1, reason: "selected with legacy unknown-scope penalty" };
  }
  if (scope.level === "repo") {
    if (!scope.repoId || !request.repoId || scope.repoId !== request.repoId) {
      return { eligible: false, score: 0, reason: "dropped because repo scope mismatched" };
    }
    return { eligible: true, score: 0.03, reason: "selected because repo matched" };
  }
  if (!scope.projectId || !request.projectId || scope.projectId !== request.projectId) {
    return { eligible: false, score: 0, reason: "dropped because project scope mismatched" };
  }
  if (scope.repoId && request.repoId && scope.repoId !== request.repoId) {
    return { eligible: false, score: 0, reason: "dropped because project repo scope mismatched" };
  }
  return { eligible: true, score: 0.06, reason: "selected because project scope matched" };
}

export function sameScope(left: RecallScope, right: RecallScope): boolean {
  if (left.level !== right.level) return false;
  return left.projectId === right.projectId && left.repoId === right.repoId;
}
