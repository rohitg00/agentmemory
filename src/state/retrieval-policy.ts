import type { RetrievalProvenance, RetrievalScope } from "../types.js";

/**
 * Scope rings are deliberately ordered.  The order is used only after the
 * hybrid (BM25 + vector + graph) score has been computed; scope never becomes
 * a replacement retrieval engine.
 */
export type { RetrievalProvenance, RetrievalScope } from "../types.js";

export interface RetrievalPolicyContext {
  currentProject?: string;
  currentProjectAliases?: string[];
  currentRepoId?: string;
  currentMissionId?: string;
  relatedRepoIds?: string[];
  currentFiles?: string[];
  /** Related repositories are opt-in so a local query does not fan out. */
  includeRelatedProjects?: boolean;
  /** Global architecture/workflow memories remain useful by default. */
  includeGlobal?: boolean;
  /** Unrelated repository search is an explicit wider-recall operation. */
  includeCrossRepo?: boolean;
  /** Resolved authorization filter.  Apply this before any ranking signal. */
  filterAgentId?: string;
}

export interface RetrievalPolicyCandidate<T = unknown> {
  id: string;
  baseScore: number;
  value: T;
  provenance: RetrievalProvenance;
}

export interface ScopedRetrievalCandidate<T = unknown>
  extends RetrievalPolicyCandidate<T> {
  scope: RetrievalScope;
  scopeReason: string;
  adjustedScore: number;
}

const SCOPE_MULTIPLIER: Record<RetrievalScope, number> = {
  current_mission: 1.3,
  current_repo: 1.18,
  related_repo: 1.08,
  global: 0.98,
  cross_repo: 0.8,
  legacy_unattributed: 0.7,
};

export function retrievalScopeMultiplier(scope: RetrievalScope): number {
  return SCOPE_MULTIPLIER[scope];
}

const SCOPE_ORDER: Record<RetrievalScope, number> = {
  current_mission: 0,
  current_repo: 1,
  related_repo: 2,
  global: 3,
  cross_repo: 4,
  legacy_unattributed: 5,
};

const DURABLE_MEMORY_TYPES = new Set<string>([
  "architecture",
  "bug",
  "workflow",
  "pattern",
  "preference",
]);

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim().toLowerCase();
  return result || undefined;
}

function sameIdentity(left: string | undefined, right: string | undefined): boolean {
  const a = normalized(left);
  const b = normalized(right);
  return a !== undefined && b !== undefined && a === b;
}

function projectIdentitySet(
  project: string | undefined,
  aliases: string[] | undefined,
): Set<string> {
  return new Set(
    [project, ...(aliases ?? [])]
      .map((value) => normalized(value))
      .filter((value): value is string => value !== undefined),
  );
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function hasFileOverlap(left: string[], right: string[] | undefined): boolean {
  if (!right?.length || !left.length) return false;
  const wanted = new Set(right.map((file) => file.trim()).filter(Boolean));
  return left.some((file) => wanted.has(file.trim()));
}

function classifyScope(
  provenance: RetrievalProvenance,
  context: RetrievalPolicyContext,
): { scope: RetrievalScope; scopeReason: string } {
  if (
    context.currentMissionId &&
    sameIdentity(provenance.missionId, context.currentMissionId)
  ) {
    return { scope: "current_mission", scopeReason: "same mission" };
  }

  if (
    sameIdentity(provenance.canonicalRepoId, context.currentRepoId)
  ) {
    return { scope: "current_repo", scopeReason: "same canonical repository" };
  }

  const canonicalConflict = Boolean(
    provenance.canonicalRepoId &&
      context.currentRepoId &&
      !sameIdentity(provenance.canonicalRepoId, context.currentRepoId),
  );
  if (
    !canonicalConflict &&
    setsOverlap(
      projectIdentitySet(provenance.project, provenance.projectAliases),
      projectIdentitySet(context.currentProject, context.currentProjectAliases),
    )
  ) {
    return {
      scope: "current_repo",
      scopeReason: "same legacy project identity or alias",
    };
  }

  const related = new Set(
    (context.relatedRepoIds ?? [])
      .map((repoId) => normalized(repoId))
      .filter((repoId): repoId is string => repoId !== undefined),
  );
  // Once a candidate has canonical repository evidence, aliases cannot
  // override it. Alias matching remains available only for legacy candidates
  // whose canonical identity is genuinely absent.
  const provenanceRepoIds = provenance.canonicalRepoId
    ? projectIdentitySet(provenance.canonicalRepoId, undefined)
    : projectIdentitySet(provenance.project, provenance.projectAliases);
  if (setsOverlap(provenanceRepoIds, related)) {
    return {
      scope: "related_repo",
      scopeReason: "explicit repository relationship",
    };
  }

  if (
    normalized(provenance.project) === "global" ||
    normalized(provenance.canonicalRepoId) === "global"
  ) {
    return { scope: "global", scopeReason: "explicit global memory" };
  }

  if (provenance.canonicalRepoId || provenance.project) {
    return {
      scope: "cross_repo",
      scopeReason: "different canonical repository",
    };
  }

  return {
    scope: "legacy_unattributed",
    scopeReason: "legacy memory without repository attribution",
  };
}

function isScopeAllowed(
  scope: RetrievalScope,
  context: RetrievalPolicyContext,
): boolean {
  if (scope === "related_repo") return context.includeRelatedProjects === true;
  if (scope === "global") return context.includeGlobal !== false;
  if (scope === "cross_repo") return context.includeCrossRepo === true;
  return true;
}

function qualityMultiplier(provenance: RetrievalProvenance): number {
  const importance = Math.max(0, Math.min(10, provenance.importance ?? 5));
  const confidence = Math.max(0, Math.min(1, provenance.confidence ?? 0.5));
  const importanceFactor = 0.92 + (importance / 10) * 0.16;
  const confidenceFactor = 0.96 + confidence * 0.08;
  const durableFactor = provenance.memoryType && DURABLE_MEMORY_TYPES.has(provenance.memoryType)
    ? 1.03
    : 1;
  return importanceFactor * confidenceFactor * durableFactor;
}

/**
 * Applies authorization, lifecycle filtering, and one deterministic scope
 * policy to an already-fused hybrid result set.  Recency is intentionally not
 * a score multiplier: it is a late tie-breaker so an old architectural
 * decision is not displaced by a recent casual observation.
 */
export function applyRetrievalPolicy<T>(
  candidates: RetrievalPolicyCandidate<T>[],
  context: RetrievalPolicyContext = {},
): ScopedRetrievalCandidate<T>[] {
  const hasLocalContext = Boolean(
    context.currentMissionId || context.currentRepoId || context.currentProject,
  );

  return candidates
    .filter((candidate) => {
      const provenance = candidate.provenance;
      if (provenance.isLatest === false) return false;
      if (
        context.filterAgentId !== undefined &&
        provenance.agentId !== context.filterAgentId
      ) {
        return false;
      }
      return true;
    })
    .map((candidate): ScopedRetrievalCandidate<T> => {
      const classified = hasLocalContext
        ? classifyScope(candidate.provenance, context)
        : classifyScope(candidate.provenance, {});
      const fileFactor = hasFileOverlap(
        candidate.provenance.files,
        context.currentFiles,
      )
        ? 1.05
        : 1;
      return {
        ...candidate,
        ...classified,
        adjustedScore:
          candidate.baseScore *
          (hasLocalContext ? retrievalScopeMultiplier(classified.scope) : 1) *
          (hasLocalContext ? qualityMultiplier(candidate.provenance) : 1) *
          (hasLocalContext ? fileFactor : 1),
      };
    })
    .filter((candidate) => !hasLocalContext || isScopeAllowed(candidate.scope, context))
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) {
        return b.adjustedScore - a.adjustedScore;
      }
      if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
      if (SCOPE_ORDER[a.scope] !== SCOPE_ORDER[b.scope]) {
        return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      }
      const importanceDelta =
        (b.provenance.importance ?? 0) - (a.provenance.importance ?? 0);
      if (importanceDelta !== 0) return importanceDelta;
      const confidenceDelta =
        (b.provenance.confidence ?? 0) - (a.provenance.confidence ?? 0);
      if (confidenceDelta !== 0) return confidenceDelta;
      const timestampDelta =
        Date.parse(b.provenance.timestamp) - Date.parse(a.provenance.timestamp);
      if (Number.isFinite(timestampDelta) && timestampDelta !== 0) {
        return timestampDelta;
      }
      return a.id.localeCompare(b.id);
    });
}
