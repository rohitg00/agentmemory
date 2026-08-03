import { describe, expect, it } from "vitest";
import {
  lessonContentFingerprint,
  lessonIdForInput,
  normalizeLesson,
  parseImportedLesson,
  parseLessonSaveInput,
  toLessonReadModel,
} from "../src/functions/lesson-model.js";
import type {
  Lesson,
  LessonEvidenceReference,
} from "../src/types.js";

function evidence(
  overrides: Partial<LessonEvidenceReference> = {},
): LessonEvidenceReference {
  return {
    kind: "experiment",
    projectId: "agentmemory",
    repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
    commitSha: "a".repeat(40),
    path: "test/lesson-model.test.ts",
    recordedAt: "2026-08-02T20:00:00.000Z",
    validatedAt: "2026-08-02T21:00:00.000Z",
    evidenceKind: "unit-test",
    sampleCount: 42,
    ...overrides,
  };
}

function parsedLesson(
  overrides: Record<string, unknown> = {},
) {
  const parsed = parseLessonSaveInput({
    content: "Long prose explaining the mechanism and evidence.",
    mechanismId: "queue-pressure/reversal",
    claim: "Negative queue pressure causes short-horizon price reversal.",
    claimType: "causal",
    evidenceVerdict: "supported",
    evidenceRefs: [evidence()],
    scope: {
      ring: "repo",
      scopeId: "repo:https://github.com/rohitg00/agentmemory",
    },
    ...overrides,
  });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error(parsed.error);
  return parsed.value;
}

function legacyLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "lsn_legacy",
    content: "Legacy prose remains readable",
    context: "",
    confidence: 0.7,
    reinforcements: 2,
    source: "manual",
    sourceIds: [],
    project: "agentmemory",
    tags: ["legacy"],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    decayRate: 0.05,
    ...overrides,
  };
}

describe("causal lesson model", () => {
  it("normalizes a general causal claim, facets, aliases, and durable evidence", () => {
    const input = parsedLesson({
      mechanismId: "Queue-Pressure/Reversal",
      mechanismVersion: "v1",
      mechanismAliases: ["qp-reversal", "Queue-Pressure/Reversal"],
      claim: "  Negative queue pressure causes short-horizon price reversal. ",
      applicabilityConditions: ["Liquid venue", "  Volatile regime  "],
      nonApplicabilityConditions: ["Auction halt"],
      falsificationConditions: ["No reversal after costs"],
      structuredFacets: {
        "Signal Family": ["order-flow"],
        Asset: ["HYPE", "BTC"],
        Venue: ["Hyperliquid"],
        horizon: ["15m"],
        regime: ["volatile"],
      },
      evidenceRefs: [
        evidence({
          repoRemoteUrl: "https://github.com/rohitg00/agentmemory.git/",
          commitSha: "A".repeat(40),
        }),
      ],
    });

    expect(input).toMatchObject({
      mechanismId: "queue-pressure/reversal",
      mechanismVersion: "v1",
      mechanismAliases: ["qp-reversal"],
      claim:
        "Negative queue pressure causes short-horizon price reversal.",
      claimType: "causal",
      evidenceVerdict: "supported",
      lifecycle: "active",
      sensitivity: "restricted",
      scope: {
        ring: "repo",
        scopeId: "repo:https://github.com/rohitg00/agentmemory",
      },
      structuredFacets: {
        asset: ["BTC", "HYPE"],
        horizon: ["15m"],
        regime: ["volatile"],
        signal_family: ["order-flow"],
        venue: ["Hyperliquid"],
      },
    });
    expect(input.evidenceRefs[0]).toMatchObject({
      repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
      commitSha: "a".repeat(40),
      recordedAt: "2026-08-02T20:00:00.000Z",
      sampleCount: 42,
    });
  });

  it("normalizes legacy lessons to safe defaults without rewriting the source object", () => {
    const legacy = legacyLesson();
    const before = JSON.stringify(legacy);
    const normalized = normalizeLesson(legacy);

    expect(normalized).toMatchObject({
      schemaVersion: 1,
      evidenceVerdict: "unverified",
      lifecycle: "active",
      sensitivity: "restricted",
      scope: { ring: "worktree" },
      mechanismAliases: [],
      applicabilityConditions: [],
      nonApplicabilityConditions: [],
      falsificationConditions: [],
      structuredFacets: {},
      evidenceRefs: [],
      contradictedByLessonIds: [],
    });
    expect(normalized.contentFingerprint).toMatch(/^lfp_[a-f0-9]{16}$/);
    expect(JSON.stringify(legacy)).toBe(before);

    const roundTrip = parseImportedLesson(normalized);
    expect(roundTrip).toMatchObject({
      success: true,
      lesson: {
        scope: { ring: "worktree" },
        sensitivity: "restricted",
      },
    });
  });

  it("keeps a refuted lesson active as negative evidence", () => {
    const input = parsedLesson({
      evidenceVerdict: "refuted",
      evidenceRefs: [
        evidence({
          evidenceKind: "falsification",
          artifactDigest: `sha256:${"b".repeat(64)}`,
          commitSha: undefined,
        }),
      ],
    });

    expect(input.evidenceVerdict).toBe("refuted");
    expect(input.lifecycle).toBe("active");
  });

  it("rejects non-immutable and over-bounded evidence references", () => {
    const pathOnly = parseLessonSaveInput({
      content: "Path-only evidence is insufficient",
      mechanismId: "path-only",
      claim: "A branch path proves the result.",
      evidenceVerdict: "supported",
      evidenceRefs: [
        {
          kind: "document",
          projectId: "agentmemory",
          repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
          path: "report.md",
          recordedAt: "2026-08-02T20:00:00.000Z",
          branch: "main",
        },
      ],
    });
    const tooMany = parseLessonSaveInput({
      content: "Too many evidence references",
      mechanismId: "bounded-evidence",
      claim: "Evidence lists remain bounded.",
      evidenceRefs: Array.from({ length: 9 }, (_, index) =>
        evidence({
          commitSha: index.toString(16).padStart(40, "0"),
        }),
      ),
    });

    expect(pathOnly).toMatchObject({
      success: false,
      error: expect.stringContaining("not immutable proof"),
    });
    expect(tooMany).toMatchObject({
      success: false,
      error: expect.stringContaining("at most 8"),
    });
  });

  it("requires durable scope identity and human approval for global promotion", () => {
    const missingCausalScope = parseLessonSaveInput({
      content: "Unscoped causal claim",
      mechanismId: "scope/required",
      claim: "Structured claims require durable scope.",
    });
    const missingScopeId = parseLessonSaveInput({
      content: "Explicit repo scope",
      scope: { ring: "repo" },
    });
    const missingApproval = parseLessonSaveInput({
      content: "Global claim",
      scope: { ring: "global" },
    });
    const approved = parseLessonSaveInput({
      content: "Human-approved global claim",
      scope: {
        ring: "global",
        humanApproval: {
          approvedBy: "patrick",
          approvedAt: "2026-08-02T22:00:00Z",
          reason: "Reviewed evidence and approved global promotion",
        },
      },
    });

    expect(missingCausalScope).toMatchObject({
      success: false,
      error: expect.stringContaining("explicit durable scope"),
    });
    expect(missingScopeId).toMatchObject({
      success: false,
      error: expect.stringContaining("scope.scopeId"),
    });
    expect(missingApproval).toMatchObject({
      success: false,
      error: expect.stringContaining("humanApproval"),
    });
    expect(approved).toMatchObject({
      success: true,
      value: {
        scope: {
          ring: "global",
          humanApproval: {
            approvedBy: "patrick",
            approvedAt: "2026-08-02T22:00:00.000Z",
          },
        },
      },
    });
  });

  it("requires claim and mechanism together and evidence for verified verdicts", () => {
    const partial = parseLessonSaveInput({
      content: "Incomplete causal record",
      mechanismId: "partial",
    });
    const unsupportedVerdict = parseLessonSaveInput({
      content: "Unsupported verdict",
      mechanismId: "no-anchor",
      claim: "This is supported.",
      evidenceVerdict: "supported",
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });
    const terminal = parseLessonSaveInput({
      content: "Bypass correction",
      lifecycle: "retracted",
    });

    expect(partial).toMatchObject({
      success: false,
      error: expect.stringContaining("both mechanismId and claim"),
    });
    expect(unsupportedVerdict).toMatchObject({
      success: false,
      error: expect.stringContaining("durable evidence reference"),
    });
    expect(terminal).toMatchObject({
      success: false,
      error: expect.stringContaining("audited correction API"),
    });
  });

  it("keeps durable scope and terminal tombstone invariants during import", () => {
    const imported = {
      ...legacyLesson(),
      mechanismId: "import/invariants",
      claim: "Imported causal records retain durable scope identity.",
      scope: { ring: "worktree" },
    };
    const missingScopeId = parseImportedLesson(imported);
    const missingTombstone = parseImportedLesson({
      ...legacyLesson(),
      supersededByLessonId: "lsn_replacement",
    });
    const retracted = parseImportedLesson({
      ...legacyLesson(),
      lifecycle: "retracted",
      deleted: true,
      deletedAt: "2026-08-02T22:00:00.000Z",
      deletedBy: "operator",
      deleteReason: "Evidence artifact was invalid",
    });

    expect(missingScopeId).toMatchObject({
      success: false,
      error: expect.stringContaining("scope.scopeId"),
    });
    expect(missingTombstone).toMatchObject({
      success: false,
      error: expect.stringContaining("deleted=true"),
    });
    expect(retracted).toMatchObject({
      success: true,
      lesson: {
        lifecycle: "retracted",
        deleted: true,
        deleteReason: "Evidence artifact was invalid",
      },
    });
  });

  it("produces ordering-stable fingerprints and separates evidence records", () => {
    const first = parsedLesson({
      content: "First prose rendering.",
      applicabilityConditions: ["Condition B", "Condition A"],
      structuredFacets: {
        venue: ["Venue B", "Venue A"],
        asset: ["BTC"],
      },
      evidenceRefs: [
        evidence({ commitSha: "b".repeat(40) }),
        evidence({ commitSha: "a".repeat(40) }),
      ],
    });
    const reordered = parsedLesson({
      content: "A materially different prose rendering.",
      applicabilityConditions: ["Condition A", "Condition B"],
      structuredFacets: {
        asset: ["BTC"],
        venue: ["Venue A", "Venue B"],
      },
      evidenceRefs: [
        evidence({ commitSha: "a".repeat(40) }),
        evidence({ commitSha: "b".repeat(40) }),
      ],
    });
    const newEvidence = parsedLesson({
      content: "Third prose rendering.",
      applicabilityConditions: ["Condition A", "Condition B"],
      structuredFacets: {
        asset: ["BTC"],
        venue: ["Venue A", "Venue B"],
      },
      evidenceRefs: [evidence({ commitSha: "c".repeat(40) })],
    });

    expect(lessonContentFingerprint(first)).toBe(
      lessonContentFingerprint(reordered),
    );
    expect(lessonIdForInput(first)).toBe(lessonIdForInput(reordered));
    expect(lessonContentFingerprint(first)).toBe(
      lessonContentFingerprint(newEvidence),
    );
    expect(lessonIdForInput(first)).not.toBe(lessonIdForInput(newEvidence));
  });

  it("computes staleness and contradiction without mutating confidence or lifecycle", () => {
    const raw = legacyLesson({
      schemaVersion: 1,
      evidenceVerdict: "unverified",
      lifecycle: "active",
      reviewAfter: "2026-01-01T00:00:00.000Z",
      contradictedByLessonIds: ["lsn_counterexample"],
      confidence: 0.81,
    });
    const read = toLessonReadModel(raw, "2026-08-02T00:00:00.000Z");

    expect(read.computedFlags).toEqual({
      stale: true,
      contradicted: true,
    });
    expect(read.confidence).toBe(0.81);
    expect(read.lifecycle).toBe("active");
    expect(raw.confidence).toBe(0.81);
  });
});
