import { fingerprintId } from "../state/schema.js";
import type {
  Lesson,
  LessonClaimType,
  LessonEvidenceReference,
  LessonEvidenceVerdict,
  LessonHumanApproval,
  LessonLifecycle,
  LessonReadModel,
  LessonScope,
  LessonScopeRing,
  LessonSensitivity,
  NormalizedLesson,
} from "../types.js";

export const LESSON_SCHEMA_VERSION = 1 as const;
export const MAX_LESSON_EVIDENCE_REFS = 8;

const MAX_MECHANISM_ID_LENGTH = 128;
const MAX_MECHANISM_ALIASES = 8;
const MAX_CLAIM_LENGTH = 500;
const MAX_CONDITIONS = 16;
const MAX_CONDITION_LENGTH = 500;
const MAX_FACET_DIMENSIONS = 32;
const MAX_FACET_VALUES = 16;
const MAX_FACET_VALUE_LENGTH = 256;
const MAX_CONTRADICTION_IDS = 16;
const MAX_SCOPE_ID_LENGTH = 256;
const MAX_APPROVAL_REASON_LENGTH = 1000;
const MAX_EVIDENCE_KIND_LENGTH = 64;
const MAX_EVIDENCE_PROJECT_ID_LENGTH = 128;
const MAX_EVIDENCE_REMOTE_LENGTH = 2048;
const MAX_EVIDENCE_PATH_LENGTH = 1024;

const EVIDENCE_VERDICTS = new Set<LessonEvidenceVerdict>([
  "supported",
  "refuted",
  "mixed",
  "unverified",
]);
const LESSON_LIFECYCLES = new Set<LessonLifecycle>([
  "draft",
  "active",
  "superseded",
  "retracted",
]);
const CLAIM_TYPES = new Set<LessonClaimType>([
  "causal",
  "predictive",
  "procedural",
  "constraint",
  "descriptive",
]);
const SCOPE_RINGS = new Set<LessonScopeRing>([
  "worktree",
  "repo",
  "initiative",
  "domain",
  "global",
]);
const SENSITIVITIES = new Set<LessonSensitivity>([
  "public",
  "internal",
  "confidential",
  "restricted",
]);

export interface LessonSaveInput {
  content: string;
  context: string;
  confidence?: number;
  project?: string;
  tags: string[];
  source: "crystal" | "manual" | "consolidation";
  sourceIds: string[];
  mechanismId?: string;
  mechanismVersion?: string;
  mechanismAliases: string[];
  claim?: string;
  claimType?: LessonClaimType;
  evidenceVerdict: LessonEvidenceVerdict;
  lifecycle: LessonLifecycle;
  applicabilityConditions: string[];
  nonApplicabilityConditions: string[];
  falsificationConditions: string[];
  structuredFacets: Record<string, string[]>;
  evidenceRefs: LessonEvidenceReference[];
  scope: LessonScope;
  sensitivity: LessonSensitivity;
  reviewAfter?: string;
  contradictedByLessonIds: string[];
}

export type LessonInputParseResult =
  | { success: true; value: LessonSaveInput }
  | { success: false; error: string };

type LessonParseOptions = {
  allowTerminalLifecycle?: boolean;
  allowImplicitWorktreeScope?: boolean;
  source?: "crystal" | "manual" | "consolidation";
  allowSourceMetadata?: boolean;
};

class LessonInputError extends Error {}

export function parseLessonSaveInput(
  raw: unknown,
  options: LessonParseOptions = {},
): LessonInputParseResult {
  try {
    const record = requireRecord(raw, "lesson");
    const content = requiredString(record.content, "content");
    const context = optionalString(record.context, "context") ?? "";
    const project = optionalString(record.project, "project");
    const confidence = normalizeConfidence(record.confidence);
    const tags = normalizeStringArray(record.tags, "tags", {
      allowCsv: true,
      sort: false,
    });
    const source = options.source ?? normalizeSource(record.source);
    const sourceIds =
      options.allowSourceMetadata === false
        ? []
        : normalizeStringArray(record.sourceIds, "sourceIds", {
            sort: true,
          });

    const mechanismId = normalizeMechanismId(
      optionalString(
        record.mechanismId,
        "mechanismId",
        MAX_MECHANISM_ID_LENGTH,
      ),
      "mechanismId",
    );
    const mechanismVersion = optionalString(
      record.mechanismVersion,
      "mechanismVersion",
      64,
    );
    const mechanismAliases = normalizeStringArray(
      record.mechanismAliases,
      "mechanismAliases",
      {
        maxItems: MAX_MECHANISM_ALIASES,
        maxLength: MAX_MECHANISM_ID_LENGTH,
        normalize: (value) =>
          normalizeMechanismId(value, "mechanismAliases") ?? "",
        sort: true,
      },
    ).filter((alias) => alias !== mechanismId);
    const claim = optionalString(record.claim, "claim", MAX_CLAIM_LENGTH, true);
    const claimType = normalizeEnum(
      record.claimType,
      "claimType",
      CLAIM_TYPES,
    );
    const evidenceVerdict =
      normalizeEnum(
        record.evidenceVerdict,
        "evidenceVerdict",
        EVIDENCE_VERDICTS,
      ) ?? "unverified";
    const lifecycle =
      normalizeEnum(record.lifecycle, "lifecycle", LESSON_LIFECYCLES) ??
      "active";
    if (
      !options.allowTerminalLifecycle &&
      (lifecycle === "superseded" || lifecycle === "retracted")
    ) {
      throw new LessonInputError(
        "lifecycle superseded and retracted require the audited correction API",
      );
    }

    const applicabilityConditions = normalizeStringArray(
      record.applicabilityConditions,
      "applicabilityConditions",
      {
        maxItems: MAX_CONDITIONS,
        maxLength: MAX_CONDITION_LENGTH,
        normalize: normalizeDisplayText,
        sort: true,
      },
    );
    const nonApplicabilityConditions = normalizeStringArray(
      record.nonApplicabilityConditions,
      "nonApplicabilityConditions",
      {
        maxItems: MAX_CONDITIONS,
        maxLength: MAX_CONDITION_LENGTH,
        normalize: normalizeDisplayText,
        sort: true,
      },
    );
    const falsificationConditions = normalizeStringArray(
      record.falsificationConditions,
      "falsificationConditions",
      {
        maxItems: MAX_CONDITIONS,
        maxLength: MAX_CONDITION_LENGTH,
        normalize: normalizeDisplayText,
        sort: true,
      },
    );
    const structuredFacets = normalizeStructuredFacets(
      record.structuredFacets,
    );
    const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs);
    const scope = normalizeScope(
      record.scope,
      options.allowImplicitWorktreeScope === true,
    );
    const sensitivity =
      normalizeEnum(
        record.sensitivity,
        "sensitivity",
        SENSITIVITIES,
      ) ?? "restricted";
    const reviewAfter = optionalDate(record.reviewAfter, "reviewAfter");
    const contradictedByLessonIds = normalizeStringArray(
      record.contradictedByLessonIds,
      "contradictedByLessonIds",
      {
        maxItems: MAX_CONTRADICTION_IDS,
        maxLength: MAX_MECHANISM_ID_LENGTH,
        sort: true,
      },
    );

    const hasCausalStructure =
      Boolean(mechanismId || mechanismVersion || claim || claimType) ||
      mechanismAliases.length > 0 ||
      applicabilityConditions.length > 0 ||
      nonApplicabilityConditions.length > 0 ||
      falsificationConditions.length > 0 ||
      Object.keys(structuredFacets).length > 0 ||
      evidenceRefs.length > 0;
    if (hasCausalStructure && (!mechanismId || !claim)) {
      throw new LessonInputError(
        "structured causal lessons require both mechanismId and claim",
      );
    }
    if (
      hasCausalStructure &&
      (record.scope === undefined || record.scope === null)
    ) {
      throw new LessonInputError(
        "structured causal lessons require an explicit durable scope",
      );
    }
    if (
      hasCausalStructure &&
      scope.ring !== "global" &&
      !scope.scopeId
    ) {
      throw new LessonInputError(
        "structured causal lessons require scope.scopeId for non-global scopes",
      );
    }
    if (evidenceVerdict !== "unverified" && evidenceRefs.length === 0) {
      throw new LessonInputError(
        `${evidenceVerdict} lessons require at least one durable evidence reference`,
      );
    }

    return {
      success: true,
      value: {
        content: content.trim(),
        context: context.trim(),
        confidence,
        project: project?.trim(),
        tags,
        source,
        sourceIds,
        mechanismId,
        mechanismVersion: mechanismVersion?.trim(),
        mechanismAliases,
        claim,
        claimType,
        evidenceVerdict,
        lifecycle,
        applicabilityConditions,
        nonApplicabilityConditions,
        falsificationConditions,
        structuredFacets,
        evidenceRefs,
        scope,
        sensitivity,
        reviewAfter,
        contradictedByLessonIds,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function lessonContentFingerprint(input: LessonSaveInput): string {
  const material =
    input.mechanismId && input.claim
      ? {
          mechanismId: input.mechanismId,
          mechanismVersion: normalizeFingerprintText(
            input.mechanismVersion ?? "",
          ),
          claim: normalizeFingerprintText(input.claim),
          claimType: input.claimType ?? "",
          applicabilityConditions: fingerprintStrings(
            input.applicabilityConditions,
          ),
          nonApplicabilityConditions: fingerprintStrings(
            input.nonApplicabilityConditions,
          ),
          falsificationConditions: fingerprintStrings(
            input.falsificationConditions,
          ),
          structuredFacets: fingerprintFacets(input.structuredFacets),
        }
      : { content: normalizeFingerprintText(input.content) };
  return fingerprintId("lfp", stableStringify(material));
}

export function lessonIdForInput(input: LessonSaveInput): string {
  if (!input.mechanismId || !input.claim) {
    return fingerprintId("lsn", input.content.trim().toLowerCase());
  }
  return fingerprintId(
    "lsn",
    stableStringify({
      contentFingerprint: lessonContentFingerprint(input),
      evidenceVerdict: input.evidenceVerdict,
      evidenceRefs: input.evidenceRefs,
      lifecycle: input.lifecycle,
      scope: input.scope,
      sensitivity: input.sensitivity,
      reviewAfter: input.reviewAfter,
      contradictedByLessonIds: input.contradictedByLessonIds,
    }),
  );
}

export function normalizeLesson(lesson: Lesson): NormalizedLesson {
  const lifecycle = deriveLifecycle(lesson);
  const parsed = parseLessonSaveInput(
    {
      ...lesson,
      lifecycle,
    },
    {
      allowTerminalLifecycle: true,
      allowImplicitWorktreeScope: true,
    },
  );
  const fallback = parseLessonSaveInput(
    {
      content:
        typeof lesson.content === "string" && lesson.content.trim()
          ? lesson.content
          : lesson.id || "legacy-lesson",
      context: typeof lesson.context === "string" ? lesson.context : "",
      confidence: lesson.confidence,
      project: lesson.project,
      tags: Array.isArray(lesson.tags) ? lesson.tags : [],
      source: lesson.source,
      sourceIds: Array.isArray(lesson.sourceIds) ? lesson.sourceIds : [],
      lifecycle,
    },
    {
      allowTerminalLifecycle: true,
      allowImplicitWorktreeScope: true,
    },
  );
  if (!fallback.success) {
    throw new Error(`Invalid legacy lesson ${lesson.id}: ${fallback.error}`);
  }
  const value = parsed.success ? parsed.value : fallback.value;
  const normalized: NormalizedLesson = {
    ...lesson,
    content: value.content,
    context: value.context,
    confidence:
      typeof lesson.confidence === "number" &&
      Number.isFinite(lesson.confidence)
        ? lesson.confidence
        : value.confidence ?? 0.5,
    reinforcements:
      Number.isInteger(lesson.reinforcements) && lesson.reinforcements >= 0
        ? lesson.reinforcements
        : 0,
    source: value.source,
    sourceIds: value.sourceIds,
    project: value.project,
    tags: value.tags,
    decayRate:
      typeof lesson.decayRate === "number" &&
      Number.isFinite(lesson.decayRate)
        ? lesson.decayRate
        : 0.05,
    schemaVersion: LESSON_SCHEMA_VERSION,
    mechanismId: value.mechanismId,
    mechanismVersion: value.mechanismVersion,
    mechanismAliases: value.mechanismAliases,
    claim: value.claim,
    claimType: value.claimType,
    evidenceVerdict: value.evidenceVerdict,
    lifecycle,
    applicabilityConditions: value.applicabilityConditions,
    nonApplicabilityConditions: value.nonApplicabilityConditions,
    falsificationConditions: value.falsificationConditions,
    structuredFacets: value.structuredFacets,
    evidenceRefs: value.evidenceRefs,
    scope: value.scope,
    sensitivity: value.sensitivity,
    reviewAfter: value.reviewAfter,
    contradictedByLessonIds: value.contradictedByLessonIds,
    contentFingerprint: lessonContentFingerprint(value),
  };
  return normalized;
}

export function toLessonReadModel(
  lesson: Lesson,
  now: number | string | Date = Date.now(),
): LessonReadModel {
  const normalized = normalizeLesson(lesson);
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : typeof now === "string"
        ? Date.parse(now)
        : now;
  const reviewAfterMs = normalized.reviewAfter
    ? Date.parse(normalized.reviewAfter)
    : Number.NaN;
  return {
    ...normalized,
    computedFlags: {
      stale:
        normalized.deleteReason === "decay-sweep" ||
        (Number.isFinite(reviewAfterMs) &&
          Number.isFinite(nowMs) &&
          nowMs >= reviewAfterMs),
      contradicted: normalized.contradictedByLessonIds.length > 0,
    },
  };
}

export function isLessonListable(lesson: Lesson): boolean {
  const normalized = normalizeLesson(lesson);
  return (
    !lesson.deleted &&
    normalized.lifecycle !== "superseded" &&
    normalized.lifecycle !== "retracted"
  );
}

export function isLessonRecallable(lesson: Lesson): boolean {
  const normalized = normalizeLesson(lesson);
  return !lesson.deleted && normalized.lifecycle === "active";
}

export function parseImportedLesson(
  raw: unknown,
): { success: true; lesson: NormalizedLesson } | { success: false; error: string } {
  try {
    const record = requireRecord(raw, "lesson");
    const id = requiredString(record.id, "lesson.id");
    const createdAt = requiredDate(record.createdAt, "lesson.createdAt");
    const updatedAt = requiredDate(record.updatedAt, "lesson.updatedAt");
    if (
      record.schemaVersion !== undefined &&
      record.schemaVersion !== LESSON_SCHEMA_VERSION
    ) {
      throw new LessonInputError(
        `lesson.schemaVersion must be ${LESSON_SCHEMA_VERSION}`,
      );
    }
    if (record.deleted !== undefined && typeof record.deleted !== "boolean") {
      throw new LessonInputError("lesson.deleted must be a boolean");
    }
    const parsed = parseLessonSaveInput(record, {
      allowTerminalLifecycle: true,
      allowImplicitWorktreeScope: true,
    });
    if (!parsed.success) throw new LessonInputError(parsed.error);

    const deletedAt = optionalDate(record.deletedAt, "lesson.deletedAt");
    const lastReinforcedAt = optionalDate(
      record.lastReinforcedAt,
      "lesson.lastReinforcedAt",
    );
    const lastDecayedAt = optionalDate(
      record.lastDecayedAt,
      "lesson.lastDecayedAt",
    );
    const deletedBy = optionalString(record.deletedBy, "lesson.deletedBy");
    const deleteReason = optionalString(
      record.deleteReason,
      "lesson.deleteReason",
      1000,
    );
    const supersededByLessonId = optionalString(
      record.supersededByLessonId,
      "lesson.supersededByLessonId",
      MAX_MECHANISM_ID_LENGTH,
    );
    const terminalLifecycle =
      parsed.value.lifecycle === "superseded" ||
      parsed.value.lifecycle === "retracted";
    if (
      (terminalLifecycle || Boolean(supersededByLessonId)) &&
      record.deleted !== true
    ) {
      throw new LessonInputError(
        "terminal lessons must retain deleted=true for legacy compatibility",
      );
    }
    if (
      parsed.value.lifecycle === "superseded" &&
      !supersededByLessonId
    ) {
      throw new LessonInputError(
        "superseded lessons require supersededByLessonId",
      );
    }
    if (supersededByLessonId === id) {
      throw new LessonInputError(
        "supersededByLessonId must differ from lesson.id",
      );
    }

    const candidate: Lesson = {
      id,
      content: parsed.value.content,
      context: parsed.value.context,
      confidence: parsed.value.confidence ?? 0.5,
      reinforcements:
        typeof record.reinforcements === "number" &&
        Number.isInteger(record.reinforcements) &&
        record.reinforcements >= 0
          ? record.reinforcements
          : 0,
      source: parsed.value.source,
      sourceIds: parsed.value.sourceIds,
      project: parsed.value.project,
      tags: parsed.value.tags,
      createdAt,
      updatedAt,
      lastReinforcedAt,
      lastDecayedAt,
      decayRate:
        typeof record.decayRate === "number" &&
        Number.isFinite(record.decayRate)
          ? record.decayRate
          : 0.05,
      deleted: record.deleted as boolean | undefined,
      deletedAt,
      deletedBy,
      deleteReason,
      supersededByLessonId,
      schemaVersion: LESSON_SCHEMA_VERSION,
      mechanismId: parsed.value.mechanismId,
      mechanismVersion: parsed.value.mechanismVersion,
      mechanismAliases: parsed.value.mechanismAliases,
      claim: parsed.value.claim,
      claimType: parsed.value.claimType,
      evidenceVerdict: parsed.value.evidenceVerdict,
      lifecycle: parsed.value.lifecycle,
      applicabilityConditions: parsed.value.applicabilityConditions,
      nonApplicabilityConditions: parsed.value.nonApplicabilityConditions,
      falsificationConditions: parsed.value.falsificationConditions,
      structuredFacets: parsed.value.structuredFacets,
      evidenceRefs: parsed.value.evidenceRefs,
      scope: parsed.value.scope,
      sensitivity: parsed.value.sensitivity,
      reviewAfter: parsed.value.reviewAfter,
      contradictedByLessonIds: parsed.value.contradictedByLessonIds,
      contentFingerprint: lessonContentFingerprint(parsed.value),
    };
    return { success: true, lesson: normalizeLesson(candidate) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function sameLessonScope(left: Lesson, right: Lesson): boolean {
  const normalizedLeft = normalizeLesson(left);
  const normalizedRight = normalizeLesson(right);
  const leftScope = normalizedLeft.scope;
  const rightScope = normalizedRight.scope;
  if (leftScope.scopeId || rightScope.scopeId) {
    return (
      leftScope.ring === rightScope.ring &&
      leftScope.scopeId === rightScope.scopeId
    );
  }
  if (leftScope.ring === "global" || rightScope.ring === "global") {
    return leftScope.ring === "global" && rightScope.ring === "global";
  }
  if (
    normalizedLeft.mechanismId ||
    normalizedLeft.claim ||
    normalizedRight.mechanismId ||
    normalizedRight.claim
  ) {
    return false;
  }
  return left.project === right.project;
}

function normalizeConfidence(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number") {
    throw new LessonInputError("confidence must be a number");
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return value;
}

function normalizeSource(
  value: unknown,
): "crystal" | "manual" | "consolidation" {
  if (value === undefined || value === null || value === "") return "manual";
  if (
    value === "crystal" ||
    value === "manual" ||
    value === "consolidation"
  ) {
    return value;
  }
  throw new LessonInputError(
    "source must be crystal, manual, or consolidation",
  );
}

function normalizeScope(
  value: unknown,
  allowImplicitWorktreeScope = false,
): LessonScope {
  if (value === undefined || value === null) return { ring: "worktree" };
  const record = requireRecord(value, "scope");
  const ring = normalizeEnum(record.ring, "scope.ring", SCOPE_RINGS);
  if (!ring) throw new LessonInputError("scope.ring is required");
  const scopeId = optionalString(
    record.scopeId,
    "scope.scopeId",
    MAX_SCOPE_ID_LENGTH,
  );
  if (
    ring !== "global" &&
    !scopeId &&
    !(allowImplicitWorktreeScope && ring === "worktree")
  ) {
    throw new LessonInputError(
      "scope.scopeId is required for non-global explicit scopes",
    );
  }

  let humanApproval: LessonHumanApproval | undefined;
  if (record.humanApproval !== undefined && record.humanApproval !== null) {
    const approval = requireRecord(
      record.humanApproval,
      "scope.humanApproval",
    );
    humanApproval = {
      approvedBy: requiredString(
        approval.approvedBy,
        "scope.humanApproval.approvedBy",
      ),
      approvedAt: requiredDate(
        approval.approvedAt,
        "scope.humanApproval.approvedAt",
      ),
      reason: requiredString(
        approval.reason,
        "scope.humanApproval.reason",
        MAX_APPROVAL_REASON_LENGTH,
      ),
    };
  }
  if (ring === "global" && !humanApproval) {
    throw new LessonInputError(
      "global scope requires explicit scope.humanApproval metadata",
    );
  }
  return {
    ring,
    scopeId: scopeId?.trim(),
    humanApproval,
  };
}

function normalizeStructuredFacets(
  value: unknown,
): Record<string, string[]> {
  if (value === undefined || value === null) return {};
  const record = requireRecord(value, "structuredFacets");
  const entries = Object.entries(record);
  if (entries.length > MAX_FACET_DIMENSIONS) {
    throw new LessonInputError(
      `structuredFacets must have at most ${MAX_FACET_DIMENSIONS} dimensions`,
    );
  }
  const normalized: Record<string, string[]> = {};
  for (const [rawDimension, rawValues] of entries) {
    const dimension = rawDimension
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (!dimension || dimension.length > 64) {
      throw new LessonInputError(
        "structuredFacets dimensions must be 1-64 characters",
      );
    }
    const values = normalizeStringArray(
      rawValues,
      `structuredFacets.${rawDimension}`,
      {
        maxItems: MAX_FACET_VALUES,
        maxLength: MAX_FACET_VALUE_LENGTH,
        normalize: normalizeDisplayText,
        sort: true,
      },
    );
    const mergedValues = [
      ...new Set([...(normalized[dimension] ?? []), ...values]),
    ].sort(compareText);
    if (mergedValues.length > MAX_FACET_VALUES) {
      throw new LessonInputError(
        `structuredFacets.${dimension} must contain at most ${MAX_FACET_VALUES} values after normalization`,
      );
    }
    normalized[dimension] = mergedValues;
  }
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) =>
      compareText(left, right),
    ),
  );
}

function normalizeEvidenceRefs(value: unknown): LessonEvidenceReference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new LessonInputError("evidenceRefs must be an array");
  }
  if (value.length > MAX_LESSON_EVIDENCE_REFS) {
    throw new LessonInputError(
      `evidenceRefs must contain at most ${MAX_LESSON_EVIDENCE_REFS} items`,
    );
  }
  const refs = value.map((rawRef, index) =>
    normalizeEvidenceRef(rawRef, index),
  );
  const unique = new Map(
    refs.map((ref) => [stableStringify(ref), ref] as const),
  );
  return [...unique.values()].sort((left, right) =>
    compareText(stableStringify(left), stableStringify(right)),
  );
}

function normalizeEvidenceRef(
  value: unknown,
  index: number,
): LessonEvidenceReference {
  const record = requireRecord(value, `evidenceRefs[${index}]`);
  const prefix = `evidenceRefs[${index}]`;
  const kind = normalizeSlug(
    requiredString(record.kind, `${prefix}.kind`, MAX_EVIDENCE_KIND_LENGTH),
    `${prefix}.kind`,
  );
  const projectId = requiredString(
    record.projectId,
    `${prefix}.projectId`,
    MAX_EVIDENCE_PROJECT_ID_LENGTH,
  );
  const repoRemoteUrl = normalizeRepoRemote(
    requiredString(
      record.repoRemoteUrl,
      `${prefix}.repoRemoteUrl`,
      MAX_EVIDENCE_REMOTE_LENGTH,
    ),
    `${prefix}.repoRemoteUrl`,
  );
  const commitSha = normalizeCommitSha(
    optionalString(record.commitSha, `${prefix}.commitSha`, 64),
    `${prefix}.commitSha`,
  );
  const artifactDigest = normalizeArtifactDigest(
    optionalString(record.artifactDigest, `${prefix}.artifactDigest`, 256),
    `${prefix}.artifactDigest`,
  );
  if (!commitSha && !artifactDigest) {
    throw new LessonInputError(
      `${prefix} requires commitSha and/or artifactDigest; branch, ref, and path are not immutable proof`,
    );
  }
  const path = normalizeEvidencePath(
    optionalString(record.path, `${prefix}.path`, MAX_EVIDENCE_PATH_LENGTH),
    `${prefix}.path`,
  );
  const recordedAt = requiredDate(record.recordedAt, `${prefix}.recordedAt`);
  const validatedAt = optionalDate(
    record.validatedAt,
    `${prefix}.validatedAt`,
  );
  const evidenceKindRaw = optionalString(
    record.evidenceKind,
    `${prefix}.evidenceKind`,
    MAX_EVIDENCE_KIND_LENGTH,
  );
  const evidenceKind = evidenceKindRaw
    ? normalizeSlug(evidenceKindRaw, `${prefix}.evidenceKind`)
    : undefined;
  let sampleCount: number | undefined;
  if (record.sampleCount !== undefined && record.sampleCount !== null) {
    if (
      typeof record.sampleCount !== "number" ||
      !Number.isInteger(record.sampleCount) ||
      record.sampleCount < 0
    ) {
      throw new LessonInputError(
        `${prefix}.sampleCount must be a non-negative integer`,
      );
    }
    sampleCount = record.sampleCount;
  }
  return {
    kind,
    projectId: projectId.trim(),
    repoRemoteUrl,
    commitSha,
    artifactDigest,
    path,
    recordedAt,
    validatedAt,
    evidenceKind,
    sampleCount,
  };
}

function normalizeRepoRemote(value: string, field: string): string {
  const trimmed = value.trim();
  const urlStyle = /^(https?|ssh|git):\/\/[^\s]+$/i.test(trimmed);
  const scpStyle = /^[^@\s]+@[^:\s]+:[^\s]+$/.test(trimmed);
  if (!urlStyle && !scpStyle) {
    throw new LessonInputError(
      `${field} must be a durable http(s), ssh, git, or scp-style remote URL`,
    );
  }
  return trimmed.replace(/\/+$/, "").replace(/\.git$/i, "");
}

function normalizeCommitSha(
  value: string | undefined,
  field: string,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(normalized)) {
    throw new LessonInputError(
      `${field} must be a full 40- or 64-character hexadecimal commit SHA`,
    );
  }
  return normalized;
}

function normalizeArtifactDigest(
  value: string | undefined,
  field: string,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9+._-]*:[a-f0-9]{32,}$/.test(normalized)) {
    throw new LessonInputError(
      `${field} must be an algorithm-prefixed hexadecimal digest`,
    );
  }
  return normalized;
}

function normalizeEvidencePath(
  value: string | undefined,
  field: string,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    normalized.includes("\0")
  ) {
    throw new LessonInputError(
      `${field} must be a relative repository or artifact path`,
    );
  }
  return normalized;
}

function normalizeMechanismId(
  value: string | undefined,
  field: string,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:/-]*$/.test(normalized)) {
    throw new LessonInputError(
      `${field} must use lowercase letters, numbers, dot, underscore, colon, slash, or hyphen`,
    );
  }
  return normalized;
}

function normalizeSlug(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new LessonInputError(
      `${field} must use letters, numbers, dot, underscore, or hyphen`,
    );
  }
  return normalized;
}

function normalizeStringArray(
  value: unknown,
  field: string,
  options: {
    allowCsv?: boolean;
    maxItems?: number;
    maxLength?: number;
    normalize?: (value: string) => string;
    sort?: boolean;
  } = {},
): string[] {
  if (value === undefined || value === null || value === "") return [];
  const rawValues =
    options.allowCsv && typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : null;
  if (!rawValues) {
    throw new LessonInputError(`${field} must be an array of strings`);
  }
  if (
    options.maxItems !== undefined &&
    rawValues.length > options.maxItems
  ) {
    throw new LessonInputError(
      `${field} must contain at most ${options.maxItems} items`,
    );
  }
  const normalized: string[] = [];
  for (const item of rawValues) {
    if (typeof item !== "string") {
      throw new LessonInputError(`${field} must contain only strings`);
    }
    const valueText = (options.normalize ?? ((text: string) => text.trim()))(
      item,
    );
    if (!valueText) continue;
    if (
      options.maxLength !== undefined &&
      valueText.length > options.maxLength
    ) {
      throw new LessonInputError(
        `${field} items must be at most ${options.maxLength} characters`,
      );
    }
    normalized.push(valueText);
  }
  const unique = [...new Set(normalized)];
  return options.sort
    ? unique.sort(compareText)
    : unique;
}

function normalizeEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: Set<T>,
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new LessonInputError(
      `${field} must be one of: ${[...allowed].join(", ")}`,
    );
  }
  return value as T;
}

function deriveLifecycle(lesson: Lesson): LessonLifecycle {
  if (lesson.supersededByLessonId) return "superseded";
  if (lesson.deleted && lesson.deleteReason !== "decay-sweep") {
    return "retracted";
  }
  return LESSON_LIFECYCLES.has(lesson.lifecycle as LessonLifecycle)
    ? (lesson.lifecycle as LessonLifecycle)
    : "active";
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LessonInputError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
  maxLength?: number,
): string {
  const normalized = optionalString(value, field, maxLength);
  if (!normalized) throw new LessonInputError(`${field} is required`);
  return normalized;
}

function optionalString(
  value: unknown,
  field: string,
  maxLength?: number,
  collapseWhitespace = false,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new LessonInputError(`${field} must be a string`);
  }
  const normalized = collapseWhitespace
    ? normalizeDisplayText(value)
    : value.trim();
  if (!normalized) return undefined;
  if (maxLength !== undefined && normalized.length > maxLength) {
    throw new LessonInputError(
      `${field} must be at most ${maxLength} characters`,
    );
  }
  return normalized;
}

function requiredDate(value: unknown, field: string): string {
  const normalized = optionalDate(value, field);
  if (!normalized) throw new LessonInputError(`${field} is required`);
  return normalized;
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new LessonInputError(`${field} must be an ISO timestamp string`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new LessonInputError(`${field} must be a valid ISO timestamp`);
  }
  return new Date(parsed).toISOString();
}

function normalizeDisplayText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeFingerprintText(value: string): string {
  return normalizeDisplayText(value).toLowerCase();
}

function fingerprintStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeFingerprintText))].sort(compareText);
}

function fingerprintFacets(
  facets: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(facets)
      .map(([dimension, values]) => [
        dimension.toLowerCase(),
        fingerprintStrings(values),
      ] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value)) ?? "null";
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
