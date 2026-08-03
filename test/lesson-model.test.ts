import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
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
    verification: {
      state: "verified",
      verifiedBy: "reviewer@example.test",
      verifiedAt: "2026-08-02T21:00:00.000Z",
    },
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

  it("supports discriminated non-Git provenance without treating syntax as verification", () => {
    const provenances = [
      {
        type: "object-store",
        locator: "s3://research-bucket/evidence.json",
        digest: `sha256:${"1".repeat(64)}`,
      },
      {
        type: "database-query",
        locator: "clickhouse://analytics/query-17",
        immutableId: "snapshot-20260802-001",
        digest: `sha256:${"2".repeat(64)}`,
      },
      {
        type: "oci",
        locator: "ghcr.io/example/evidence",
        digest: `sha256:${"3".repeat(64)}`,
      },
      { type: "doi", locator: "https://doi.org/10.1000/Test.Dataset" },
      { type: "urn", locator: "urn:example:evidence:2026:08:02" },
      {
        type: "dataset",
        locator: "dataset://market-replay/v2",
        immutableId: "release-42",
      },
      {
        type: "attestation",
        locator: "rekor://entry/1234",
        digest: `sha256:${"4".repeat(64)}`,
      },
    ];
    for (const [index, provenance] of provenances.entries()) {
      const parsed = parseLessonSaveInput({
        content: `Evidence provenance ${index}`,
        mechanismId: `provenance/${index}`,
        claim: `Provenance type ${provenance.type} is durably anchored.`,
        evidenceVerdict: "supported",
        evidenceRefs: [
          {
            kind: "experiment",
            projectId: "agentmemory",
            provenance,
            recordedAt: "2026-08-02T20:00:00Z",
            verification: {
              state: "verified",
              verifiedBy: "reviewer@example.test",
              verifiedAt: "2026-08-02T20:30:00Z",
            },
          },
        ],
        scope: { ring: "repo", scopeId: "repo:agentmemory" },
      });
      expect(parsed, provenance.type).toMatchObject({
        success: true,
        value: {
          evidenceRefs: [
            {
              provenance: {
                type: provenance.type,
              },
              verification: {
                state: "verified",
                basis: "explicit-review",
              },
            },
          ],
        },
      });
    }

    const unreviewed = parseLessonSaveInput({
      content: "A digest is not an audited relevance judgment",
      mechanismId: "provenance/unreviewed",
      claim: "Syntactic provenance alone supports the claim.",
      evidenceVerdict: "supported",
      evidenceRefs: [
        {
          kind: "experiment",
          projectId: "agentmemory",
          provenance: {
            type: "oci",
            locator: "ghcr.io/example/evidence",
            digest: `sha256:${"5".repeat(64)}`,
          },
          recordedAt: "2026-08-02T20:00:00Z",
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });
    expect(unreviewed).toMatchObject({
      success: false,
      error: expect.stringContaining("explicitly verified"),
    });
  });

  it("migrates legacy Git-shaped verdict evidence with an explicit compatibility basis", () => {
    const imported = parseImportedLesson({
      ...legacyLesson(),
      id: "caller-chosen-id",
      schemaVersion: 1,
      mechanismId: "legacy/git-evidence",
      claim: "The pre-verification schema accepted this durable Git anchor.",
      evidenceVerdict: "refuted",
      evidenceRefs: [
        {
          kind: "falsification",
          projectId: "agentmemory",
          repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
          commitSha: "f".repeat(40),
          recordedAt: "2026-08-02T20:00:00Z",
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });

    expect(imported).toMatchObject({
      success: true,
      canonicalized: true,
      lesson: {
        id: expect.stringMatching(/^lsn_[a-f0-9]{16}$/),
        idAliases: ["caller-chosen-id"],
        evidenceRefs: [
          {
            verification: {
              state: "verified",
              basis: "legacy-git-anchor",
              verifiedBy: "agentmemory:legacy-git-anchor-migration",
            },
          },
        ],
      },
    });
    if (!imported.success) throw new Error(imported.error);
    expect(parseImportedLesson(imported.lesson)).toMatchObject({
      success: true,
      lesson: {
        evidenceRefs: [
          {
            verification: {
              state: "verified",
              basis: "legacy-git-anchor",
              verifiedBy: "agentmemory:legacy-git-anchor-migration",
            },
          },
        ],
      },
    });
  });

  it("accepts a serialized legacy-git-anchor basis only with immutable Git provenance", () => {
    const imported = parseImportedLesson({
      ...legacyLesson(),
      id: "serialized-git-migration",
      schemaVersion: 1,
      mechanismId: "legacy/serialized-git-evidence",
      claim: "A serialized compatibility record retains its immutable Git anchor.",
      evidenceVerdict: "refuted",
      evidenceRefs: [
        {
          kind: "falsification",
          projectId: "agentmemory",
          provenance: {
            type: "git",
            locator: "https://github.com/rohitg00/agentmemory",
            immutableId: "e".repeat(40),
          },
          recordedAt: "2026-08-02T20:00:00Z",
          verification: {
            state: "verified",
            basis: "legacy-git-anchor",
            verifiedBy: "agentmemory:legacy-git-anchor-migration",
            verifiedAt: "2026-08-02T20:00:00Z",
          },
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });

    expect(imported).toMatchObject({
      success: true,
      lesson: {
        evidenceRefs: [
          {
            provenance: { type: "git", immutableId: "e".repeat(40) },
            verification: {
              state: "verified",
              basis: "legacy-git-anchor",
            },
          },
        ],
      },
    });
  });

  it.each([
    {
      type: "oci",
      provenance: {
        type: "oci",
        locator: "ghcr.io/example/evidence",
        digest: `sha256:${"6".repeat(64)}`,
      },
    },
    {
      type: "doi",
      provenance: {
        type: "doi",
        locator: "10.1000/non-git-evidence",
      },
    },
  ])(
    "rejects a non-Git $type reference claiming the reserved legacy migration basis",
    ({ type, provenance }) => {
      const imported = parseImportedLesson({
        ...legacyLesson(),
        id: `spoofed-${type}-migration`,
        schemaVersion: 1,
        mechanismId: `legacy/spoofed-${type}`,
        claim: "Non-Git provenance cannot claim the Git compatibility migration.",
        evidenceVerdict: "refuted",
        evidenceRefs: [
          {
            kind: "falsification",
            projectId: "agentmemory",
            provenance,
            recordedAt: "2026-08-02T20:00:00Z",
            verification: {
              state: "verified",
              basis: "legacy-git-anchor",
              verifiedBy: "agentmemory:legacy-git-anchor-migration",
              verifiedAt: "2026-08-02T20:00:00Z",
            },
          },
        ],
        scope: { ring: "repo", scopeId: "repo:agentmemory" },
      });

      expect(imported).toMatchObject({
        success: false,
        error: expect.stringContaining(
          "reserved for compatibility import of immutable Git provenance",
        ),
      });
    },
  );

  it("rejects arbitrary migration actors even for immutable Git provenance", () => {
    const imported = parseImportedLesson({
      ...legacyLesson(),
      id: "spoofed-git-migration-actor",
      schemaVersion: 1,
      mechanismId: "legacy/spoofed-git-actor",
      claim: "The reserved migration actor cannot be caller-selected.",
      evidenceVerdict: "refuted",
      evidenceRefs: [
        {
          kind: "falsification",
          projectId: "agentmemory",
          provenance: {
            type: "git",
            locator: "https://github.com/rohitg00/agentmemory",
            immutableId: "d".repeat(40),
          },
          recordedAt: "2026-08-02T20:00:00Z",
          verification: {
            state: "verified",
            basis: "legacy-git-anchor",
            verifiedBy: "caller-selected-reviewer",
            verifiedAt: "2026-08-02T20:00:00Z",
          },
        },
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });

    expect(imported).toMatchObject({
      success: false,
      error: expect.stringContaining("canonical migration actor"),
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
    const globalScopeId = parseLessonSaveInput({
      content: "Invalid global scope ID",
      scope: {
        ring: "global",
        scopeId: "global:any",
        humanApproval: {
          approvedBy: "patrick",
          approvedAt: "2026-08-02T22:00:00Z",
          reason: "This should still fail structurally",
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
    expect(globalScopeId).toMatchObject({
      success: false,
      error: expect.stringContaining("must be omitted"),
    });
  });

  it("requires explicit RFC3339 offsets and hashes offset-equivalent times identically across timezones", () => {
    const timezoneLess = parseLessonSaveInput({
      content: "Timezone-less evidence",
      mechanismId: "time/strict",
      claim: "Timezone-less inputs are deterministic.",
      evidenceRefs: [
        evidence({
          recordedAt: "2026-08-02T20:00:00",
        }),
      ],
      scope: { ring: "repo", scopeId: "repo:agentmemory" },
    });
    expect(timezoneLess).toMatchObject({
      success: false,
      error: expect.stringContaining("explicit Z or numeric offset"),
    });
    for (const impossible of [
      "2026-02-30T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2025-02-29T00:00:00Z",
      "2026-04-31T20:00:00-04:00",
    ]) {
      const parsed = parseLessonSaveInput({
        content: `Impossible timestamp ${impossible}`,
        reviewAfter: impossible,
      });
      expect(parsed, impossible).toMatchObject({
        success: false,
        error: expect.stringContaining("calendar-valid"),
      });
    }
    expect(
      parseLessonSaveInput({
        content: "Valid leap day",
        reviewAfter: "2024-02-29T00:00:00Z",
      }),
    ).toMatchObject({
      success: true,
      value: { reviewAfter: "2024-02-29T00:00:00.000Z" },
    });

    const utc = parsedLesson({
      evidenceRefs: [
        evidence({
          recordedAt: "2026-08-02T20:00:00Z",
          validatedAt: "2026-08-02T21:00:00Z",
          verification: {
            state: "verified",
            verifiedBy: "reviewer@example.test",
            verifiedAt: "2026-08-02T21:00:00Z",
          },
        }),
      ],
      reviewAfter: "2026-09-01T00:00:00Z",
    });
    const offset = parsedLesson({
      evidenceRefs: [
        evidence({
          recordedAt: "2026-08-02T16:00:00-04:00",
          validatedAt: "2026-08-02T17:00:00-04:00",
          verification: {
            state: "verified",
            verifiedBy: "reviewer@example.test",
            verifiedAt: "2026-08-02T17:00:00-04:00",
          },
        }),
      ],
      reviewAfter: "2026-08-31T20:00:00-04:00",
    });
    expect(lessonIdForInput(utc)).toBe(lessonIdForInput(offset));

    const script = `
      import { parseLessonSaveInput, lessonIdForInput } from "./src/functions/lesson-model.ts";
      const parsed = parseLessonSaveInput({
        content: "Timezone child process",
        mechanismId: "time/child",
        claim: "Explicit offsets make identity timezone-independent.",
        evidenceVerdict: "supported",
        evidenceRefs: [{
          kind: "experiment",
          projectId: "agentmemory",
          provenance: { type: "oci", locator: "ghcr.io/example/evidence", digest: "sha256:${"6".repeat(64)}" },
          recordedAt: "2026-08-02T16:00:00-04:00",
          verification: { state: "verified", verifiedBy: "reviewer", verifiedAt: "2026-08-02T17:00:00-04:00" }
        }],
        scope: { ring: "repo", scopeId: "repo:agentmemory" }
      });
      if (!parsed.success) throw new Error(parsed.error);
      process.stdout.write(lessonIdForInput(parsed.value));
    `;
    const run = (timezone: string) =>
      execFileSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          cwd: process.cwd(),
          env: { ...process.env, TZ: timezone },
          encoding: "utf8",
        },
      );
    expect(run("UTC")).toBe(run("America/New_York"));
  });

  it("enforces normalized ASCII snake_case facet dimensions", () => {
    for (const dimension of [
      "a/b",
      "a.b",
      "éxchange",
      "__proto__",
      "constructor",
      "9asset",
    ]) {
      const parsed = parseLessonSaveInput({
        content: `Invalid facet ${dimension}`,
        structuredFacets: { [dimension]: ["value"] },
      });
      expect(parsed, dimension).toMatchObject({
        success: false,
        error: expect.stringContaining("ASCII snake_case"),
      });
    }
    expect(
      parseLessonSaveInput({
        content: "Valid normalized facet",
        mechanismId: "facet/valid",
        claim: "Normalized facet dimensions remain domain-neutral.",
        structuredFacets: { "Signal Family": ["order-flow"] },
        scope: { ring: "repo", scopeId: "repo:agentmemory" },
      }),
    ).toMatchObject({
      success: true,
      value: { structuredFacets: { signal_family: ["order-flow"] } },
    });
  });

  it("fails closed for malformed structured rows while retaining raw legacy fallback", () => {
    expect(() =>
      normalizeLesson(
        legacyLesson({
          schemaVersion: 1,
          evidenceRefs: "not-an-array" as never,
        }),
      ),
    ).toThrow(/Invalid structured lesson.*evidenceRefs must be an array/);
    expect(
      normalizeLesson(
        legacyLesson({
          confidence: Number.NaN,
        }),
      ),
    ).toMatchObject({
      identityKind: "legacy-prose",
      evidenceVerdict: "unverified",
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
