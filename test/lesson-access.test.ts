import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canApproveGlobalLesson,
  canReadLesson,
  canUseLessonCapability,
  canWriteLessonScope,
  lessonAccessContextFromPayload,
  parseLessonCallerPolicy,
  resolveLessonBoundaryAccess,
  systemLessonAccessContext,
  type LessonAccessContext,
  type LessonCallerPolicy,
} from "../src/functions/lesson-access.js";
import type { Lesson } from "../src/types.js";

const REPO_SCOPE = {
  ring: "repo" as const,
  scopeId: "repo:https://github.com/wrightpt/agentmemory",
};

function digest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function policy(): LessonCallerPolicy {
  return {
    version: 1,
    principals: [
      {
        principalId: "codex",
        principalKind: "agent",
        tokenSha256: digest("codex-token"),
        clearance: "confidential",
        scopes: [{ ...REPO_SCOPE, access: "write" }],
        capabilities: ["lesson:export"],
      },
      {
        principalId: "patrick",
        principalKind: "human",
        tokenSha256: digest("human-token"),
        clearance: "restricted",
        scopes: [{ ring: "global", access: "write" }],
        capabilities: ["lesson:approve-global", "lesson:all-scopes"],
      },
    ],
  };
}

function lesson(
  sensitivity: Lesson["sensitivity"],
  scope: Lesson["scope"] = REPO_SCOPE,
): Lesson {
  return {
    id: "lsn_test",
    content: "Authorized lesson",
    context: "",
    confidence: 0.8,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    project: "agentmemory",
    tags: [],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    decayRate: 0.05,
    schemaVersion: 1,
    identityKind: "canonical",
    mechanismId: "authorization/test",
    claim: "Authorization filters lessons.",
    evidenceVerdict: "unverified",
    lifecycle: "active",
    applicabilityConditions: [],
    nonApplicabilityConditions: [],
    falsificationConditions: [],
    structuredFacets: {},
    evidenceRefs: [],
    scope,
    sensitivity,
    contradictedByLessonIds: [],
    contentFingerprint: "a".repeat(64),
  };
}

function legacyLesson(): Lesson {
  return {
    id: "lsn_legacy",
    content: "Legacy authorized lesson",
    context: "",
    confidence: 0.8,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    project: "agentmemory",
    tags: [],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    decayRate: 0.05,
  };
}

function context(
  overrides: Partial<LessonAccessContext> = {},
): LessonAccessContext {
  return {
    schemaVersion: 1,
    mode: "enforce",
    principalId: "codex",
    principalKind: "agent",
    clearance: "confidential",
    scopes: [{ ...REPO_SCOPE, access: "write" }],
    capabilities: [],
    resolvedBy: "server-policy",
    ...overrides,
  };
}

describe("lesson caller policy", () => {
  it("resolves a principal from a server-side token digest", () => {
    const result = resolveLessonBoundaryAccess(
      {
        "X-AgentMemory-Agent-Id": "codex",
        "x-agentmemory-caller-token": "codex-token",
      },
      { mode: "enforce", policy: policy() },
    );

    expect(result).toMatchObject({
      success: true,
      context: {
        schemaVersion: 1,
        mode: "enforce",
        principalId: "codex",
        principalKind: "agent",
        clearance: "confidential",
        scopes: [{ ...REPO_SCOPE, access: "write" }],
        capabilities: ["lesson:export"],
        resolvedBy: "server-policy",
      },
    });
    expect(
      result.success ? result.context.authorizationProof : undefined,
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed without a policy, token, or matching claimed identity", () => {
    expect(
      resolveLessonBoundaryAccess({}, { mode: "enforce" }),
    ).toMatchObject({
      success: false,
      statusCode: 503,
      code: "caller_policy_unavailable",
    });
    expect(
      resolveLessonBoundaryAccess(
        {},
        { mode: "enforce", policy: policy() },
      ),
    ).toMatchObject({
      success: false,
      statusCode: 401,
      code: "caller_authentication_failed",
    });
    expect(
      resolveLessonBoundaryAccess(
        {
          "x-agentmemory-agent-id": "kimi",
          "x-agentmemory-caller-token": "codex-token",
        },
        { mode: "enforce", policy: policy() },
      ),
    ).toMatchObject({
      success: false,
      statusCode: 401,
      code: "caller_authentication_failed",
    });
    expect(
      resolveLessonBoundaryAccess(
        {
          "x-agentmemory-agent-id": "codex",
          "x-agentmemory-caller-token": "codex-token",
        },
        { mode: "enforce", policyPath: "relative/callers.json" },
      ),
    ).toMatchObject({
      success: false,
      statusCode: 503,
      code: "caller_policy_unavailable",
    });
    expect(
      resolveLessonBoundaryAccess({}, { mode: "invalid" as never }),
    ).toMatchObject({
      success: false,
      statusCode: 503,
      code: "caller_policy_unavailable",
    });
  });

  it("keeps legacy behavior explicit in classify mode", () => {
    expect(
      resolveLessonBoundaryAccess(
        { "x-agentmemory-agent-id": "codex" },
        { mode: "classify" },
      ),
    ).toEqual({
      success: true,
      context: {
        schemaVersion: 1,
        mode: "classify",
        principalId: "codex",
        principalKind: "agent",
        clearance: "restricted",
        scopes: [],
        capabilities: [],
        resolvedBy: "legacy-classification",
      },
    });
  });

  it("rejects duplicate principals, duplicate token digests, and malformed grants", () => {
    const base = policy();
    expect(() =>
      parseLessonCallerPolicy({
        version: 1,
        principals: [base.principals[0], base.principals[0]],
      }),
    ).toThrow("duplicate lesson principalId");
    expect(() =>
      parseLessonCallerPolicy({
        version: 1,
        principals: [
          base.principals[0],
          {
            ...base.principals[1],
            tokenSha256: base.principals[0].tokenSha256,
          },
        ],
      }),
    ).toThrow("duplicate lesson caller token digest");
    expect(() =>
      parseLessonCallerPolicy({
        version: 1,
        principals: [
          {
            ...base.principals[0],
            scopes: [{ ring: "repo", access: "read" }],
          },
        ],
      }),
    ).toThrow("non-global scope grants require scopeId");
  });
});

describe("lesson access decisions", () => {
  it("requires both sensitivity clearance and an exact durable-scope grant", () => {
    expect(canReadLesson(lesson("confidential"), context())).toBe(true);
    expect(canReadLesson(lesson("restricted"), context())).toBe(false);
    expect(
      canReadLesson(
        lesson("internal", {
          ring: "repo",
          scopeId: "repo:https://github.com/wrightpt/other",
        }),
        context(),
      ),
    ).toBe(false);
    expect(
      canWriteLessonScope(REPO_SCOPE, "confidential", context()),
    ).toBe(true);
    expect(
      canWriteLessonScope(REPO_SCOPE, "restricted", context()),
    ).toBe(false);
  });

  it("does not treat global scope as an implicit wildcard", () => {
    const globalOnly = context({
      scopes: [{ ring: "global", access: "write" }],
    });
    expect(
      canReadLesson(
        lesson("public", {
          ring: "global",
          humanApproval: {
            approvedBy: "patrick",
            approvedAt: "2026-08-03T00:00:00.000Z",
            reason: "Approved for global publication.",
          },
        }),
        globalOnly,
      ),
    ).toBe(
      true,
    );
    expect(canReadLesson(lesson("public"), globalOnly)).toBe(false);
  });

  it("requires explicit legacy-worktree and administrative capabilities", () => {
    const legacy = legacyLesson();
    expect(canReadLesson(legacy, context({ clearance: "restricted" }))).toBe(
      false,
    );
    expect(
      canReadLesson(
        legacy,
        context({
          clearance: "restricted",
          capabilities: ["lesson:legacy-worktree"],
        }),
      ),
    ).toBe(true);
    expect(
      canWriteLessonScope(
        { ring: "worktree" },
        "restricted",
        context({
          clearance: "restricted",
          capabilities: ["lesson:legacy-worktree"],
        }),
      ),
    ).toBe(false);
    expect(canUseLessonCapability(context(), "lesson:export")).toBe(false);
    expect(
      canUseLessonCapability(
        context({ capabilities: ["lesson:export"] }),
        "lesson:export",
      ),
    ).toBe(true);
  });

  it("allows global approval only for a resolved human principal", () => {
    expect(
      canApproveGlobalLesson(
        context({ capabilities: ["lesson:approve-global"] }),
      ),
    ).toBe(false);
    expect(
      canApproveGlobalLesson(
        context({
          principalId: "patrick",
          principalKind: "human",
          capabilities: ["lesson:approve-global"],
        }),
      ),
    ).toBe(true);
  });

  it("fails closed for a missing payload context in enforce mode", () => {
    const previous = process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "enforce";
    try {
      const unresolved = lessonAccessContextFromPayload(undefined);
      expect(unresolved).toMatchObject({
        mode: "enforce",
        principalId: "unresolved",
        clearance: "public",
        scopes: [],
      });
      expect(canReadLesson(lesson("internal"), unresolved)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
      } else {
        process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = previous;
      }
    }
  });

  it("rejects forged classify and unsigned enforce contexts after enforcement", () => {
    const previous = process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "enforce";
    try {
      for (const forged of [
        { ...context(), mode: "classify", resolvedBy: "legacy-classification" },
        context(),
      ]) {
        expect(lessonAccessContextFromPayload(forged)).toMatchObject({
          mode: "enforce",
          principalId: "unresolved",
          clearance: "public",
          scopes: [],
        });
      }
      expect(
        lessonAccessContextFromPayload(systemLessonAccessContext()),
      ).toMatchObject({
        principalId: "agentmemory:system",
        resolvedBy: "system",
      });
    } finally {
      if (previous === undefined) {
        delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
      } else {
        process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = previous;
      }
    }
  });

  it("gives only the explicit system context full internal access", () => {
    const system = systemLessonAccessContext();
    expect(canReadLesson(lesson("restricted"), system)).toBe(true);
    expect(
      canWriteLessonScope(
        { ring: "worktree" },
        "restricted",
        system,
      ),
    ).toBe(true);
    expect(canUseLessonCapability(system, "lesson:import")).toBe(true);
    expect(canApproveGlobalLesson(system)).toBe(false);
  });
});
