import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  compactRetrievedLesson,
  parseLessonRecallInput,
  rankLessonRecallCandidates,
  resetLessonRetrievalCacheForTests,
  selectLessonRecallCandidates,
  type LessonRecallInput,
  type RankedLesson,
} from "../src/functions/lesson-retrieval.js";
import { setEmbeddingProvider } from "../src/functions/search.js";
import type {
  EmbeddingProvider,
  LessonReadModel,
} from "../src/types.js";

const NOW = "2026-08-03T12:00:00.000Z";

function lesson(
  suffix: string,
  overrides: Partial<LessonReadModel> = {},
): LessonReadModel {
  return {
    id: `lsn_${suffix}`,
    identityKind: "canonical",
    idAliases: [],
    content: `Distilled causal lesson ${suffix}`,
    context: "Causal retrieval test",
    confidence: 0.8,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    project: "agentmemory",
    tags: ["retrieval"],
    createdAt: NOW,
    updatedAt: NOW,
    decayRate: 0.02,
    schemaVersion: 1,
    mechanismId: `retrieval/${suffix}`,
    mechanismAliases: [],
    claim: `Mechanism ${suffix} changes the outcome.`,
    claimType: "causal",
    evidenceVerdict: "unverified",
    lifecycle: "active",
    applicabilityConditions: [],
    nonApplicabilityConditions: [],
    falsificationConditions: [],
    structuredFacets: {},
    evidenceRefs: [],
    scope: {
      ring: "repo",
      scopeId: "repo:https://github.com/wrightpt/agentmemory",
    },
    sensitivity: "public",
    contradictedByLessonIds: [],
    contentFingerprint: `fp_${suffix}`,
    computedFlags: { stale: false, contradicted: false },
    ...overrides,
  };
}

function recallInput(
  overrides: Partial<LessonRecallInput> = {},
): LessonRecallInput {
  return {
    query: "causal retrieval",
    minConfidence: 0.1,
    limit: 10,
    retrievalMode: "lexical",
    compact: false,
    evidenceVerdicts: [],
    structuredFacets: {},
    tags: [],
    ...overrides,
  };
}

function provider(
  overrides: Partial<EmbeddingProvider> = {},
): EmbeddingProvider {
  return {
    name: "local",
    dimensions: 2,
    embed: vi.fn(async () => new Float32Array([1, 0])),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map(() => new Float32Array([1, 0])),
    ),
    ...overrides,
  };
}

function ids(ranked: RankedLesson[]): string[] {
  return ranked.map(({ lesson: item }) => item.id);
}

describe("causal lesson retrieval", () => {
  beforeEach(() => {
    setEmbeddingProvider(null);
    resetLessonRetrievalCacheForTests();
    delete process.env["AGENTMEMORY_LESSON_REMOTE_EMBEDDINGS"];
    delete process.env["AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY"];
  });

  afterEach(() => {
    setEmbeddingProvider(null);
    resetLessonRetrievalCacheForTests();
    delete process.env["AGENTMEMORY_LESSON_REMOTE_EMBEDDINGS"];
    delete process.env["AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY"];
    vi.useRealTimers();
  });

  it("applies exact categorical filters before ranking", () => {
    const selected = selectLessonRecallCandidates(
      [
        lesson("match", {
          confidence: 0.9,
          mechanismAliases: ["queue/reversal"],
          evidenceVerdict: "unverified",
          tags: ["Alpha", "Safe"],
          structuredFacets: {
            asset: ["HYPE"],
            venue: ["Bybit"],
            horizon: ["5m"],
          },
        }),
        lesson("wrong-venue", {
          confidence: 0.9,
          tags: ["alpha", "safe"],
          structuredFacets: {
            asset: ["HYPE"],
            venue: ["Kraken"],
          },
        }),
        lesson("substring", {
          confidence: 0.9,
          tags: ["alpha", "safe"],
          structuredFacets: {
            asset: ["HYPE-PERP"],
            venue: ["Bybit"],
          },
        }),
      ],
      recallInput({
        project: "agentmemory",
        minConfidence: 0.85,
        mechanismId: "queue/reversal",
        claimType: "causal",
        evidenceVerdicts: ["unverified", "mixed"],
        tags: ["alpha", "SAFE"],
        structuredFacets: {
          asset: ["hype", "eth"],
          venue: ["BYBIT"],
        },
        scopeRing: "repo",
        sensitivity: "public",
      }),
    );

    expect(selected.map((item) => item.id)).toEqual(["lsn_match"]);

    const substring = selectLessonRecallCandidates(
      [lesson("substring", {
        structuredFacets: { asset: ["HYPE-PERP"] },
      })],
      recallInput({ structuredFacets: { asset: ["hype"] } }),
    );
    expect(substring).toEqual([]);
  });

  it("rejects malformed and oversized recall inputs", () => {
    expect(
      parseLessonRecallInput({
        query: "valid",
        structuredFacets: { asset: [] },
      }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("at least one value"),
    });
    expect(
      parseLessonRecallInput({ query: "x".repeat(2_049) }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining("at most 2048"),
    });
    expect(parseLessonRecallInput({ query: "valid", limit: 51 })).toMatchObject({
      success: false,
      error: expect.stringContaining("at most 50"),
    });
  });

  it("preserves the prior lexical confidence and recency scorer without embedding", async () => {
    const embedder = provider();
    setEmbeddingProvider(embedder);
    const recent = lesson("recent", {
      content: "Database query performance",
      confidence: 0.8,
      createdAt: NOW,
    });
    const old = lesson("old", {
      content: "Database query performance",
      confidence: 0.8,
      createdAt: "2025-08-03T12:00:00.000Z",
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const result = await rankLessonRecallCandidates(
      [old, recent],
      recallInput({ query: "database performance" }),
    );

    expect(ids(result.ranked)).toEqual(["lsn_recent", "lsn_old"]);
    expect(result.ranked[0].score).toBe(0.8);
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(embedder.embedBatch).not.toHaveBeenCalled();

    const versionOnly = await rankLessonRecallCandidates(
      [lesson("versioned", { mechanismVersion: "v123only" })],
      recallInput({ query: "v123only" }),
    );
    expect(versionOnly.ranked).toEqual([]);
  });

  it("recalls a semantic match with zero lexical overlap", async () => {
    const embedder = provider({
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map((text) =>
          text.includes("Mean reversion")
            ? new Float32Array([1, 0])
            : new Float32Array([0, 1]),
        ),
      ),
    });
    setEmbeddingProvider(embedder);

    const result = await rankLessonRecallCandidates(
      [
        lesson("semantic", {
          content: "Mean reversion fails after transaction costs.",
        }),
        lesson("other", {
          content: "Deployment locks prevent concurrent publication.",
        }),
      ],
      recallInput({
        query: "candidate analogy",
        retrievalMode: "hybrid",
      }),
    );

    expect(ids(result.ranked)).toEqual(["lsn_semantic"]);
    expect(result.ranked[0]).toMatchObject({
      lexicalScore: 0,
      semanticScore: 1,
    });
    expect(result.diagnostics).toMatchObject({
      requestedMode: "hybrid",
      usedMode: "hybrid",
      returnedCount: 1,
    });
  });

  it("uses exact deterministic lexical fallback for provider failures and weak semantic signal", async () => {
    const candidates = [
      lesson("first", { content: "Exact lexical candidate" }),
      lesson("second", {
        content: "Exact lexical candidate",
        confidence: 0.5,
      }),
    ];
    const lexical = await rankLessonRecallCandidates(
      candidates,
      recallInput({ query: "exact lexical" }),
    );

    const badDimensions = provider({
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map(() => new Float32Array([1])),
      ),
    });
    setEmbeddingProvider(badDimensions);
    const failed = await rankLessonRecallCandidates(
      candidates,
      recallInput({
        query: "exact lexical",
        retrievalMode: "hybrid",
      }),
    );
    expect(
      failed.ranked.map(({ lesson: item, score }) => [item.id, score]),
    ).toEqual(
      lexical.ranked.map(({ lesson: item, score }) => [item.id, score]),
    );
    expect(failed.diagnostics.fallbackCode).toBe("embedding_failed");

    resetLessonRetrievalCacheForTests();
    const nonFinite = provider({
      embed: vi.fn(async () => new Float32Array([Number.NaN, 0])),
    });
    setEmbeddingProvider(nonFinite);
    const invalidQueryVector = await rankLessonRecallCandidates(
      candidates,
      recallInput({
        query: "exact lexical",
        retrievalMode: "hybrid",
      }),
    );
    expect(
      invalidQueryVector.ranked.map(({ lesson: item, score }) => [
        item.id,
        score,
      ]),
    ).toEqual(
      lexical.ranked.map(({ lesson: item, score }) => [item.id, score]),
    );
    expect(invalidQueryVector.diagnostics.fallbackCode).toBe(
      "embedding_failed",
    );

    resetLessonRetrievalCacheForTests();
    const weak = provider({
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map(() => new Float32Array([0.1, 0.995])),
      ),
    });
    setEmbeddingProvider(weak);
    const noSignal = await rankLessonRecallCandidates(
      candidates,
      recallInput({
        query: "exact lexical",
        retrievalMode: "hybrid",
      }),
    );
    expect(
      noSignal.ranked.map(({ lesson: item, score }) => [item.id, score]),
    ).toEqual(
      lexical.ranked.map(({ lesson: item, score }) => [item.id, score]),
    );
    expect(noSignal.diagnostics.fallbackCode).toBe("semantic_no_signal");
  });

  it("does no provider or cache work for zero candidates or candidate overflow", async () => {
    const embedder = provider();
    setEmbeddingProvider(embedder);

    const empty = await rankLessonRecallCandidates(
      [],
      recallInput({ query: "candidate", retrievalMode: "hybrid" }),
    );
    expect(empty).toEqual({
      ranked: [],
      diagnostics: {
        requestedMode: "hybrid",
        usedMode: "hybrid",
        returnedCount: 0,
      },
    });

    const overflow = await rankLessonRecallCandidates(
      Array.from({ length: 257 }, (_, index) =>
        lesson(`candidate-${index}`, { content: "Candidate match" }),
      ),
      recallInput({ query: "candidate", retrievalMode: "hybrid" }),
    );
    expect(overflow.diagnostics.fallbackCode).toBe(
      "semantic_candidate_limit_exceeded",
    );
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(embedder.embedBatch).not.toHaveBeenCalled();
  });

  it("caches exact candidate documents and deduplicates concurrent cold misses", async () => {
    let releaseBatch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    const embedder = provider({
      embedBatch: vi.fn(async (texts: string[]) => {
        await gate;
        return texts.map(() => new Float32Array([1, 0]));
      }),
    });
    setEmbeddingProvider(embedder);
    const candidate = lesson("cached", {
      content: "Cache candidate",
    });
    const input = recallInput({
      query: "cache candidate",
      retrievalMode: "hybrid",
    });

    const first = rankLessonRecallCandidates([candidate], input);
    const second = rankLessonRecallCandidates([candidate], input);
    await Promise.resolve();
    releaseBatch?.();
    await Promise.all([first, second]);

    expect(embedder.embedBatch).toHaveBeenCalledTimes(1);
    await rankLessonRecallCandidates([candidate], input);
    expect(embedder.embedBatch).toHaveBeenCalledTimes(1);

    await rankLessonRecallCandidates(
      [{ ...candidate, content: "Cache candidate changed" }],
      input,
    );
    expect(embedder.embedBatch).toHaveBeenCalledTimes(2);
  });

  it("keeps protected embeddings request-local while reusing public embeddings", async () => {
    const embedder = provider();
    setEmbeddingProvider(embedder);
    const input = recallInput({
      query: "cache isolation",
      retrievalMode: "hybrid",
    });
    const publicCandidate = lesson("public-cache", {
      content: "Cache isolation",
      sensitivity: "public",
    });
    const protectedCandidate = lesson("protected-cache", {
      content: "Cache isolation",
      sensitivity: "confidential",
    });

    await rankLessonRecallCandidates([publicCandidate], input);
    await rankLessonRecallCandidates([publicCandidate], input);
    expect(embedder.embedBatch).toHaveBeenCalledTimes(1);

    vi.mocked(embedder.embedBatch).mockClear();
    await rankLessonRecallCandidates([protectedCandidate], input);
    await rankLessonRecallCandidates([protectedCandidate], input);
    expect(embedder.embedBatch).toHaveBeenCalledTimes(2);
  });

  it("requires explicit remote egress and keeps rows above the ceiling lexical-only", async () => {
    const remote = provider({
      name: "openai",
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map(() => new Float32Array([1, 0])),
      ),
    });
    setEmbeddingProvider(remote);
    const publicLesson = lesson("public", {
      content: "Public semantic candidate",
      context: "RAW_CONTEXT_MUST_NOT_EGRESS",
      sensitivity: "public",
    });
    const restrictedLesson = lesson("restricted", {
      content: "Restricted lexical secret",
      sensitivity: "restricted",
    });
    const input = recallInput({
      query: "restricted lexical secret",
      retrievalMode: "hybrid",
    });

    const disabled = await rankLessonRecallCandidates(
      [publicLesson, restrictedLesson],
      input,
    );
    expect(disabled.diagnostics.fallbackCode).toBe(
      "remote_embedding_disabled",
    );
    expect(remote.embed).not.toHaveBeenCalled();
    expect(remote.embedBatch).not.toHaveBeenCalled();

    process.env["AGENTMEMORY_LESSON_REMOTE_EMBEDDINGS"] = "true";
    process.env["AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY"] = "public";
    const enabled = await rankLessonRecallCandidates(
      [publicLesson, restrictedLesson],
      input,
    );
    const embeddedTexts = vi
      .mocked(remote.embedBatch)
      .mock.calls.flatMap(([texts]) => texts);

    expect(enabled.diagnostics).toMatchObject({
      usedMode: "hybrid",
      noticeCode: "embedding_sensitivity_filtered",
    });
    expect(ids(enabled.ranked)).toContain("lsn_restricted");
    expect(embeddedTexts.join("\n")).toContain("Public semantic candidate");
    expect(embeddedTexts.join("\n")).not.toContain(
      "Restricted lexical secret",
    );
    expect(embeddedTexts.join("\n")).not.toContain(
      "RAW_CONTEXT_MUST_NOT_EGRESS",
    );

    resetLessonRetrievalCacheForTests();
    vi.mocked(remote.embed).mockClear();
    vi.mocked(remote.embedBatch).mockClear();
    const blocked = await rankLessonRecallCandidates(
      [restrictedLesson],
      input,
    );
    expect(blocked.diagnostics.fallbackCode).toBe(
      "embedding_sensitivity_blocked",
    );
    expect(remote.embed).not.toHaveBeenCalled();
    expect(remote.embedBatch).not.toHaveBeenCalled();

    process.env["AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY"] =
      "not-a-sensitivity";
    const invalidPolicy = await rankLessonRecallCandidates(
      [publicLesson],
      input,
    );
    expect(invalidPolicy.diagnostics.fallbackCode).toBe(
      "embedding_policy_invalid",
    );
    expect(remote.embed).not.toHaveBeenCalled();
    expect(remote.embedBatch).not.toHaveBeenCalled();
  });

  it("stops scheduling embedding batches after the semantic deadline", async () => {
    vi.useFakeTimers();
    const slow = provider({
      dimensions: 3,
      embed: vi.fn(async () => new Float32Array([1, 0, 0])),
      embedBatch: vi.fn(async (texts: string[]) => {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        return texts.map(() => new Float32Array([1, 0, 0]));
      }),
    });
    setEmbeddingProvider(slow);
    const candidates = Array.from({ length: 33 }, (_, index) =>
      lesson(`slow-${index}`, { content: "Slow lexical candidate" }),
    );

    const pending = rankLessonRecallCandidates(
      candidates,
      recallInput({
        query: "slow lexical",
        retrievalMode: "hybrid",
      }),
    );
    await vi.advanceTimersByTimeAsync(5_001);
    const result = await pending;

    expect(result.diagnostics.fallbackCode).toBe("embedding_failed");
    expect(slow.embedBatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(slow.embedBatch).toHaveBeenCalledTimes(1);
  });

  it("returns a deterministic compact projection under a serialized size ceiling", () => {
    const hostile = `\u0000"\\😀${"z".repeat(100)}`;
    const facets = Object.fromEntries(
      Array.from({ length: 32 }, (_, dimension) => [
        `dimension_${dimension.toString().padStart(2, "0")}`,
        Array.from(
          { length: 16 },
          (_, value) => `value-${value}-${hostile}`,
        ),
      ]),
    );
    const large = lesson("large", {
      content: hostile.repeat(20),
      claim: hostile.repeat(10),
      project: hostile.repeat(6),
      scope: {
        ring: "repo",
        scopeId: hostile.repeat(4),
      },
      applicabilityConditions: Array(16).fill(hostile.repeat(4)),
      nonApplicabilityConditions: Array(16).fill(hostile.repeat(4)),
      falsificationConditions: Array(16).fill(hostile.repeat(4)),
      structuredFacets: facets,
      tags: Array.from({ length: 32 }, (_, index) =>
        `tag-${index}-${hostile}`,
      ),
      evidenceRefs: [
        {
          kind: "experiment",
          projectId: "agentmemory",
          recordedAt: NOW,
          provenance: {
            type: "dataset",
            locator: "secret://raw-evidence",
            immutableId: "sha256:secret",
          },
        },
      ],
      sourceIds: ["source-secret"],
    });
    const compact = compactRetrievedLesson({
      lesson: large,
      score: 0.75,
      rankingScore: 0.75,
      lexicalScore: 0.8,
      semanticScore: 0.9,
    });
    const serialized = JSON.stringify(compact);

    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(6_000);
    expect(compact.content.length).toBeLessThanOrEqual(400);
    expect(compact.claim?.length).toBeLessThanOrEqual(300);
    expect(Object.keys(compact.structuredFacets)).toEqual(
      Object.keys(compact.structuredFacets).slice().sort(),
    );
    expect(Object.keys(compact.structuredFacets).length).toBeLessThanOrEqual(6);
    expect(compact.tags.length).toBeLessThanOrEqual(8);
    expect(serialized).not.toContain("secret://raw-evidence");
    expect(serialized).not.toContain("source-secret");
    expect(compact).not.toHaveProperty("evidenceRefs");
    expect(compact).not.toHaveProperty("sourceIds");
  });
});
