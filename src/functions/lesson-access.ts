import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { getAgentId, getEnvVar } from "../config.js";
import type {
  Crystal,
  Insight,
  Lesson,
  LessonScope,
  LessonScopeRing,
  LessonSensitivity,
} from "../types.js";
import { normalizeLesson } from "./lesson-model.js";

const MAX_CALLER_TOKEN_LENGTH = 4096;
const MAX_POLICY_FILE_BYTES = 256 * 1024;
const TOKEN_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACCESS_CONTEXT_PROOF_PATTERN = /^[a-f0-9]{64}$/;
const ACCESS_CONTEXT_SECRET = randomBytes(32);
const SENSITIVITY_RANK: Record<LessonSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

export type LessonAccessMode = "classify" | "enforce";
export type LessonPrincipalKind = "agent" | "human" | "service";
export type LessonScopeAccess = "read" | "write";
export type LessonAccessCapability =
  | "lesson:all-scopes"
  | "lesson:approve-global"
  | "lesson:export"
  | "lesson:import"
  | "lesson:legacy-worktree";

export interface LessonScopeGrant {
  ring: LessonScopeRing;
  scopeId?: string;
  access: LessonScopeAccess;
}

export interface LessonAccessContext {
  schemaVersion: 1;
  mode: LessonAccessMode;
  principalId: string;
  principalKind: LessonPrincipalKind;
  clearance: LessonSensitivity;
  scopes: LessonScopeGrant[];
  capabilities: LessonAccessCapability[];
  resolvedBy: "server-policy" | "legacy-classification" | "system";
  authorizationProof?: string;
}

export interface LessonCallerPolicyPrincipal {
  principalId: string;
  principalKind: LessonPrincipalKind;
  tokenSha256: string;
  clearance: LessonSensitivity;
  scopes: LessonScopeGrant[];
  capabilities?: LessonAccessCapability[];
}

export interface LessonCallerPolicy {
  version: 1;
  principals: LessonCallerPolicyPrincipal[];
}

export type LessonBoundaryAccessResult =
  | { success: true; context: LessonAccessContext }
  | {
      success: false;
      statusCode: 401 | 503;
      error: string;
      code: "caller_authentication_failed" | "caller_policy_unavailable";
    };

export interface ResolveLessonBoundaryAccessOptions {
  mode?: LessonAccessMode;
  policy?: LessonCallerPolicy;
  policyPath?: string;
  fallbackAgentId?: string;
}

function nonEmptyString(
  value: unknown,
  field: string,
  maxLength = 4096,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function normalizeMode(value: unknown): LessonAccessMode {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (
    normalized === undefined ||
    normalized === null ||
    normalized === "" ||
    normalized === "classify"
  ) {
    return "classify";
  }
  if (normalized === "enforce") return "enforce";
  throw new Error(
    "AGENTMEMORY_LESSON_ACCESS_MODE must be classify or enforce",
  );
}

export function getLessonAccessMode(): LessonAccessMode {
  return normalizeMode(getEnvVar("AGENTMEMORY_LESSON_ACCESS_MODE"));
}

function normalizePrincipalKind(value: unknown): LessonPrincipalKind {
  if (value === "agent" || value === "human" || value === "service") {
    return value;
  }
  throw new Error("principalKind must be agent, human, or service");
}

function normalizeSensitivity(value: unknown): LessonSensitivity {
  if (
    value === "public" ||
    value === "internal" ||
    value === "confidential" ||
    value === "restricted"
  ) {
    return value;
  }
  throw new Error(
    "clearance must be public, internal, confidential, or restricted",
  );
}

function normalizeCapability(value: unknown): LessonAccessCapability {
  if (
    value === "lesson:all-scopes" ||
    value === "lesson:approve-global" ||
    value === "lesson:export" ||
    value === "lesson:import" ||
    value === "lesson:legacy-worktree"
  ) {
    return value;
  }
  throw new Error(`unsupported lesson capability: ${String(value)}`);
}

function normalizeScopeGrant(value: unknown): LessonScopeGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("scope grant must be an object");
  }
  const record = value as Record<string, unknown>;
  const ring = record.ring;
  if (
    ring !== "worktree" &&
    ring !== "repo" &&
    ring !== "initiative" &&
    ring !== "domain" &&
    ring !== "global"
  ) {
    throw new Error("scope grant ring is invalid");
  }
  const access = record.access;
  if (access !== "read" && access !== "write") {
    throw new Error("scope grant access must be read or write");
  }
  const scopeId =
    record.scopeId === undefined
      ? undefined
      : nonEmptyString(record.scopeId, "scope grant scopeId");
  if (ring === "global" && scopeId !== undefined) {
    throw new Error("global scope grants must omit scopeId");
  }
  if (ring !== "global" && scopeId === undefined) {
    throw new Error("non-global scope grants require scopeId");
  }
  return {
    ring,
    ...(scopeId !== undefined ? { scopeId } : {}),
    access,
  };
}

export function parseLessonCallerPolicy(value: unknown): LessonCallerPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("lesson caller policy must be an object");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("lesson caller policy version must be 1");
  }
  if (!Array.isArray(record.principals) || record.principals.length === 0) {
    throw new Error("lesson caller policy principals must be a non-empty array");
  }
  const seenPrincipals = new Set<string>();
  const seenTokens = new Set<string>();
  const principals = record.principals.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`principals[${index}] must be an object`);
    }
    const principal = raw as Record<string, unknown>;
    const principalId = nonEmptyString(
      principal.principalId,
      `principals[${index}].principalId`,
      128,
    );
    if (seenPrincipals.has(principalId)) {
      throw new Error(`duplicate lesson principalId: ${principalId}`);
    }
    seenPrincipals.add(principalId);
    const tokenSha256 = nonEmptyString(
      principal.tokenSha256,
      `principals[${index}].tokenSha256`,
      64,
    ).toLowerCase();
    if (!TOKEN_SHA256_PATTERN.test(tokenSha256)) {
      throw new Error(
        `principals[${index}].tokenSha256 must be 64 lowercase hex characters`,
      );
    }
    if (seenTokens.has(tokenSha256)) {
      throw new Error("duplicate lesson caller token digest");
    }
    seenTokens.add(tokenSha256);
    if (!Array.isArray(principal.scopes)) {
      throw new Error(`principals[${index}].scopes must be an array`);
    }
    const scopes = principal.scopes.map(normalizeScopeGrant);
    const capabilities = Array.isArray(principal.capabilities)
      ? [...new Set(principal.capabilities.map(normalizeCapability))]
      : [];
    return {
      principalId,
      principalKind: normalizePrincipalKind(principal.principalKind),
      tokenSha256,
      clearance: normalizeSensitivity(principal.clearance),
      scopes,
      capabilities,
    };
  });
  return { version: 1, principals };
}

function loadPolicyFile(path: string): LessonCallerPolicy {
  const raw = readFileSync(path);
  if (raw.byteLength > MAX_POLICY_FILE_BYTES) {
    throw new Error(
      `lesson caller policy exceeds ${MAX_POLICY_FILE_BYTES} bytes`,
    );
  }
  return parseLessonCallerPolicy(JSON.parse(raw.toString("utf8")));
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  )?.[1];
  const value = Array.isArray(match) ? match[0] : match;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function classificationContext(agentId?: string): LessonAccessContext {
  return {
    schemaVersion: 1,
    mode: "classify",
    principalId: agentId?.trim() || "legacy-unresolved",
    principalKind: "agent",
    clearance: "restricted",
    scopes: [],
    capabilities: [],
    resolvedBy: "legacy-classification",
  };
}

function accessContextProof(
  context: Omit<LessonAccessContext, "authorizationProof">,
): string {
  return createHmac("sha256", ACCESS_CONTEXT_SECRET)
    .update(
      JSON.stringify({
        schemaVersion: context.schemaVersion,
        mode: context.mode,
        principalId: context.principalId,
        principalKind: context.principalKind,
        clearance: context.clearance,
        scopes: context.scopes,
        capabilities: context.capabilities,
        resolvedBy: context.resolvedBy,
      }),
      "utf8",
    )
    .digest("hex");
}

function sealAccessContext(
  context: Omit<LessonAccessContext, "authorizationProof">,
): LessonAccessContext {
  return {
    ...context,
    authorizationProof: accessContextProof(context),
  };
}

function hasValidAccessContextProof(context: LessonAccessContext): boolean {
  const proof = context.authorizationProof;
  if (
    typeof proof !== "string" ||
    !ACCESS_CONTEXT_PROOF_PATTERN.test(proof)
  ) {
    return false;
  }
  const { authorizationProof: _ignored, ...unsigned } = context;
  const expected = accessContextProof(unsigned);
  return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"));
}

function unresolvedEnforcedContext(): LessonAccessContext {
  return {
    schemaVersion: 1,
    mode: "enforce",
    principalId: "unresolved",
    principalKind: "agent",
    clearance: "public",
    scopes: [],
    capabilities: [],
    resolvedBy: "server-policy",
  };
}

export function systemLessonAccessContext(): LessonAccessContext {
  return sealAccessContext({
    schemaVersion: 1,
    mode: "enforce",
    principalId: "agentmemory:system",
    principalKind: "service",
    clearance: "restricted",
    scopes: [],
    capabilities: [
      "lesson:all-scopes",
      "lesson:export",
      "lesson:import",
      "lesson:legacy-worktree",
    ],
    resolvedBy: "system",
  });
}

function tokenMatches(token: string, digest: string): boolean {
  const actual = createHash("sha256").update(token, "utf8").digest();
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function resolveLessonBoundaryAccess(
  headers?: Record<string, string | string[] | undefined>,
  options: ResolveLessonBoundaryAccessOptions = {},
): LessonBoundaryAccessResult {
  let mode: LessonAccessMode;
  try {
    mode =
      options.mode === undefined
        ? getLessonAccessMode()
        : normalizeMode(options.mode);
  } catch {
    return {
      success: false,
      statusCode: 503,
      error: "lesson caller policy is unavailable",
      code: "caller_policy_unavailable",
    };
  }
  const claimedAgentId = headerValue(headers, "x-agentmemory-agent-id");
  if (mode === "classify") {
    return {
      success: true,
      context: classificationContext(
        claimedAgentId ?? options.fallbackAgentId ?? getAgentId(),
      ),
    };
  }

  let policy: LessonCallerPolicy;
  try {
    const policyPath =
      options.policyPath ??
      getEnvVar("AGENTMEMORY_LESSON_CALLER_POLICY_FILE");
    policy = options.policy
      ? parseLessonCallerPolicy(options.policy)
      : policyPath && isAbsolute(policyPath)
        ? loadPolicyFile(policyPath)
        : (() => {
            throw new Error(
              "lesson caller policy file must be configured with an absolute path",
            );
          })();
  } catch {
    return {
      success: false,
      statusCode: 503,
      error: "lesson caller policy is unavailable",
      code: "caller_policy_unavailable",
    };
  }

  const token = headerValue(headers, "x-agentmemory-caller-token");
  if (!token || token.length > MAX_CALLER_TOKEN_LENGTH) {
    return {
      success: false,
      statusCode: 401,
      error: "lesson caller authentication failed",
      code: "caller_authentication_failed",
    };
  }
  const principal = policy.principals.find((candidate) =>
    tokenMatches(token, candidate.tokenSha256),
  );
  if (!principal || (claimedAgentId && claimedAgentId !== principal.principalId)) {
    return {
      success: false,
      statusCode: 401,
      error: "lesson caller authentication failed",
      code: "caller_authentication_failed",
    };
  }
  return {
    success: true,
    context: sealAccessContext({
      schemaVersion: 1,
      mode: "enforce",
      principalId: principal.principalId,
      principalKind: principal.principalKind,
      clearance: principal.clearance,
      scopes: principal.scopes,
      capabilities: principal.capabilities ?? [],
      resolvedBy: "server-policy",
    }),
  };
}

export function lessonAccessContextFromPayload(
  value: unknown,
): LessonAccessContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getLessonAccessMode() === "enforce"
      ? unresolvedEnforcedContext()
      : classificationContext(getAgentId());
  }
  const context = value as Partial<LessonAccessContext>;
  if (
    context.schemaVersion !== 1 ||
    (context.mode !== "classify" && context.mode !== "enforce") ||
    typeof context.principalId !== "string" ||
    !context.principalId.trim() ||
    (context.principalKind !== "agent" &&
      context.principalKind !== "human" &&
      context.principalKind !== "service") ||
    !Array.isArray(context.scopes) ||
    !Array.isArray(context.capabilities)
  ) {
    return getLessonAccessMode() === "enforce"
      ? unresolvedEnforcedContext()
      : classificationContext(getAgentId());
  }
  try {
    const normalized: LessonAccessContext = {
      schemaVersion: 1,
      mode: context.mode,
      principalId: context.principalId.trim(),
      principalKind: context.principalKind,
      clearance: normalizeSensitivity(context.clearance),
      scopes: context.scopes.map(normalizeScopeGrant),
      capabilities: context.capabilities.map(normalizeCapability),
      resolvedBy:
        context.resolvedBy === "server-policy" ||
        context.resolvedBy === "system"
          ? context.resolvedBy
          : "legacy-classification",
      ...(typeof context.authorizationProof === "string"
        ? { authorizationProof: context.authorizationProof }
        : {}),
    };
    if (
      normalized.mode === "enforce" &&
      !hasValidAccessContextProof(normalized)
    ) {
      return unresolvedEnforcedContext();
    }
    if (
      getLessonAccessMode() === "enforce" &&
      normalized.mode !== "enforce"
    ) {
      return unresolvedEnforcedContext();
    }
    return normalized;
  } catch {
    return getLessonAccessMode() === "enforce"
      ? unresolvedEnforcedContext()
      : classificationContext(getAgentId());
  }
}

function hasCapability(
  context: LessonAccessContext,
  capability: LessonAccessCapability,
): boolean {
  return context.capabilities.includes(capability);
}

function scopeMatches(
  grant: LessonScopeGrant,
  scope: LessonScope,
): boolean {
  if (grant.ring !== scope.ring) return false;
  return scope.ring === "global"
    ? grant.scopeId === undefined
    : grant.scopeId === scope.scopeId;
}

function scopeAllowed(
  context: LessonAccessContext,
  scope: LessonScope,
  access: LessonScopeAccess,
): boolean {
  if (hasCapability(context, "lesson:all-scopes")) return true;
  if (scope.ring === "worktree" && !scope.scopeId) {
    return (
      context.resolvedBy === "system" ||
      (access === "read" &&
        hasCapability(context, "lesson:legacy-worktree"))
    );
  }
  return context.scopes.some(
    (grant) =>
      scopeMatches(grant, scope) &&
      (grant.access === "write" || access === "read"),
  );
}

export function canReadLesson(
  lesson: Lesson,
  context: LessonAccessContext,
): boolean {
  if (context.mode === "classify") return true;
  const normalized = normalizeLesson(lesson);
  return (
    SENSITIVITY_RANK[context.clearance] >=
      SENSITIVITY_RANK[normalized.sensitivity] &&
    scopeAllowed(context, normalized.scope, "read")
  );
}

export function canWriteLessonScope(
  scope: LessonScope,
  sensitivity: LessonSensitivity,
  context: LessonAccessContext,
): boolean {
  if (context.mode === "classify") return true;
  return (
    SENSITIVITY_RANK[context.clearance] >= SENSITIVITY_RANK[sensitivity] &&
    scopeAllowed(context, scope, "write")
  );
}

export function canUseLessonCapability(
  context: LessonAccessContext,
  capability: LessonAccessCapability,
): boolean {
  return context.mode === "classify" || hasCapability(context, capability);
}

export function canUseLessonOperatorCapability(
  context: LessonAccessContext,
  capability: "lesson:export" | "lesson:import",
): boolean {
  return (
    context.mode === "classify" ||
    (context.clearance === "restricted" &&
      hasCapability(context, "lesson:all-scopes") &&
      hasCapability(context, capability))
  );
}

export function canApproveGlobalLesson(
  context: LessonAccessContext,
): boolean {
  return (
    context.mode === "classify" ||
    (context.principalKind === "human" &&
      hasCapability(context, "lesson:approve-global"))
  );
}

export type LessonAccessIndex = Map<string, Lesson>;

export function buildLessonAccessIndex(
  lessons: Lesson[],
): LessonAccessIndex {
  const index: LessonAccessIndex = new Map();
  for (const lesson of lessons) {
    const normalized = normalizeLesson(lesson);
    for (const id of [normalized.id, ...normalized.idAliases]) {
      const existing = index.get(id);
      if (existing && existing.id !== normalized.id) {
        throw new Error(`multiple lessons claim access identity ${id}`);
      }
      index.set(id, normalized);
    }
  }
  return index;
}

export function canReadLessonSourceIds(
  sourceLessonIds: string[] | undefined,
  index: LessonAccessIndex,
  context: LessonAccessContext,
): boolean {
  if (context.mode === "classify") return true;
  if (!sourceLessonIds || sourceLessonIds.length === 0) return true;
  return sourceLessonIds.every((id) => {
    const lesson = index.get(id);
    return lesson !== undefined && canReadLesson(lesson, context);
  });
}

export function canReadCrystal(
  crystal: Crystal,
  index: LessonAccessIndex,
  context: LessonAccessContext,
): boolean {
  if (context.mode === "classify") return true;
  if (crystal.sourceLessonIds && crystal.sourceLessonIds.length > 0) {
    const lessonValues = crystal.lessons ?? [];
    if (lessonValues.length !== crystal.sourceLessonIds.length) {
      return false;
    }
    return crystal.sourceLessonIds.every((id, position) => {
      const lesson = index.get(id);
      if (!lesson || !canReadLesson(lesson, context)) return false;
      const value = lessonValues[position];
      return (
        value === id ||
        value === lesson.id ||
        value === lesson.content
      );
    });
  }
  if ((crystal.lessons ?? []).length > 0) {
    return hasCapability(context, "lesson:all-scopes");
  }
  return true;
}

export type CrystalAccessIndex = Map<string, Crystal>;

export function buildCrystalAccessIndex(
  crystals: Crystal[],
): CrystalAccessIndex {
  const index: CrystalAccessIndex = new Map();
  for (const crystal of crystals) {
    if (index.has(crystal.id)) {
      throw new Error(`duplicate crystal access identity ${crystal.id}`);
    }
    index.set(crystal.id, crystal);
  }
  return index;
}

export function canReadInsight(
  insight: Insight,
  lessonIndex: LessonAccessIndex,
  crystalIndex: CrystalAccessIndex,
  context: LessonAccessContext,
): boolean {
  if (context.mode === "classify") return true;
  if (
    !canReadLessonSourceIds(
      insight.sourceLessonIds,
      lessonIndex,
      context,
    )
  ) {
    return false;
  }
  return (insight.sourceCrystalIds ?? []).every((id) => {
    const crystal = crystalIndex.get(id);
    return (
      crystal !== undefined &&
      canReadCrystal(crystal, lessonIndex, context)
    );
  });
}

export type LessonWriteIdentityResult =
  | { success: true; value: unknown }
  | { success: false; code: "access_denied" | "invalid_request"; error: string };

export function bindResolvedLessonWriteIdentity(
  value: unknown,
  context: LessonAccessContext,
): LessonWriteIdentityResult {
  if (
    context.mode !== "enforce" ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return { success: true, value };
  }

  const prepared = { ...(value as Record<string, unknown>) };
  delete prepared.accessContext;
  if (
    !prepared.scope ||
    typeof prepared.scope !== "object" ||
    Array.isArray(prepared.scope)
  ) {
    return { success: true, value: prepared };
  }

  const scope = { ...(prepared.scope as Record<string, unknown>) };
  if (scope.ring !== "global") {
    prepared.scope = scope;
    return { success: true, value: prepared };
  }
  if (!canApproveGlobalLesson(context)) {
    return {
      success: false,
      code: "access_denied",
      error: "lesson access denied for global approval",
    };
  }
  if (
    !scope.humanApproval ||
    typeof scope.humanApproval !== "object" ||
    Array.isArray(scope.humanApproval)
  ) {
    return {
      success: false,
      code: "invalid_request",
      error:
        "global scope requires humanApproval.approvedAt and humanApproval.reason",
    };
  }

  const approval = {
    ...(scope.humanApproval as Record<string, unknown>),
  };
  if (
    approval.approvedBy !== undefined &&
    approval.approvedBy !== context.principalId
  ) {
    return {
      success: false,
      code: "invalid_request",
      error:
        "scope.humanApproval.approvedBy is server-resolved and must match the authenticated principal",
    };
  }
  approval.approvedBy = context.principalId;
  approval.approvedAt = new Date().toISOString();
  scope.humanApproval = approval;
  prepared.scope = scope;
  return { success: true, value: prepared };
}
