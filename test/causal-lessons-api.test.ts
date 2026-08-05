import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLessonsFunctions } from "../src/functions/lessons.js";
import {
  resetLessonRetrievalCacheForTests,
} from "../src/functions/lesson-retrieval.js";
import { setEmbeddingProvider } from "../src/functions/search.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type {
  AuditEntry,
  EmbeddingProvider,
  Lesson,
} from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

function evidence(commit = "a".repeat(40)) {
  return {
    kind: "experiment",
    projectId: "agentmemory",
    repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
    commitSha: commit,
    path: "test/causal-lessons-api.test.ts",
    recordedAt: "2026-08-02T20:00:00.000Z",
    evidenceKind: "unit-test",
    sampleCount: 12,
    verification: {
      state: "verified",
      verifiedBy: "reviewer@example.test",
      verifiedAt: "2026-08-02T20:30:00.000Z",
    },
  };
}

describe("causal lesson REST and MCP boundaries", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    setEmbeddingProvider(null);
    resetLessonRetrievalCacheForTests();
    sdk = mockSdk();
    kv = mockKV();
    registerLessonsFunctions(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);
    registerMcpEndpoints(sdk as never, kv as never);
  });

  it("whitelists and persists validated structured REST input", async () => {
    const response = (await sdk.trigger("api::lesson-save", {
      headers: {},
      body: {
        content: "Queue pressure reversal evidence",
        context: "Short-horizon execution research",
        confidence: 0.78,
        project: "agentmemory",
        tags: ["causal", "microstructure"],
        mechanismId: "queue-pressure/reversal",
        mechanismVersion: "v1",
        claim: "Negative queue pressure causes short-horizon reversal.",
        claimType: "causal",
        evidenceVerdict: "supported",
        applicabilityConditions: ["liquid venue"],
        nonApplicabilityConditions: ["auction halt"],
        falsificationConditions: ["no reversal after costs"],
        structuredFacets: {
          asset: ["HYPE"],
          venue: ["Hyperliquid"],
          horizon: ["15m"],
          regime: ["volatile"],
          signal_family: ["order-flow"],
        },
        evidenceRefs: [{ ...evidence(), branch: "main" }],
        scope: {
          ring: "repo",
          scopeId: "repo:https://github.com/rohitg00/agentmemory",
        },
        sensitivity: "confidential",
        source: "crystal",
        sourceIds: ["untrusted"],
        deleted: true,
        computedFlags: { stale: true, contradicted: true },
      },
    })) as {
      status_code: number;
      body: { success: boolean; action: string; lesson: Lesson };
    };
    const stored = (await kv.list<Lesson>("mem:lessons"))[0];

    expect(response).toMatchObject({
      status_code: 201,
      body: {
        success: true,
        action: "created",
        lesson: {
          schemaVersion: 1,
          mechanismId: "queue-pressure/reversal",
          evidenceVerdict: "supported",
          lifecycle: "active",
          sensitivity: "confidential",
          project: "agentmemory",
          scope: {
            ring: "repo",
            scopeId: "repo:https://github.com/rohitg00/agentmemory",
          },
        },
      },
    });
    expect(stored.source).toBe("manual");
    expect(stored.sourceIds).toEqual([]);
    expect(stored.deleted).toBeUndefined();
    expect(stored).not.toHaveProperty("computedFlags");
    expect(stored.evidenceRefs?.[0]).not.toHaveProperty("branch");
  });

  it("accepts structured MCP input and exposes its schema", async () => {
    const response = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_save",
        arguments: {
          content: "MCP causal lesson",
          mechanismId: "state-boundary/normalization",
          claim: "Boundary normalization prevents undefined/null drift.",
          claimType: "causal",
          evidenceVerdict: "supported",
          evidenceRefs: [evidence("b".repeat(40))],
          scope: {
            ring: "repo",
            scopeId: "repo:https://github.com/rohitg00/agentmemory",
          },
          sensitivity: "restricted",
        },
      },
    })) as {
      status_code: number;
      body: { content: Array<{ text: string }> };
    };
    const result = JSON.parse(response.body.content[0].text) as {
      lesson: Lesson;
    };
    const tool = getAllTools().find(
      (candidate) => candidate.name === "memory_lesson_save",
    );

    expect(response.status_code).toBe(200);
    expect(result.lesson).toMatchObject({
      mechanismId: "state-boundary/normalization",
      evidenceVerdict: "supported",
      sensitivity: "restricted",
    });
    expect(tool?.inputSchema.properties).toHaveProperty("evidenceRefs");
    expect(tool?.inputSchema.properties).toHaveProperty("structuredFacets");
    expect(tool?.inputSchema.properties).toHaveProperty("scope");
    expect(tool?.inputSchema.properties).toHaveProperty("sensitivity");
  });

  it("keeps legacy prose saves valid without a scope at both boundaries (implicit worktree scope)", async () => {
    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_save",
        arguments: {
          content: "Legacy prose lesson without explicit scope",
          project: "agentmemory",
          tags: "legacy,compat",
          confidence: 0.4,
        },
      },
    })) as {
      status_code: number;
      body: { error?: string; content?: Array<{ text: string }> };
    };
    expect(mcp.status_code).toBe(200);
    const mcpResult = JSON.parse(mcp.body.content![0].text) as {
      lesson: Lesson;
    };
    expect(mcpResult.lesson.scope).toMatchObject({ ring: "worktree" });
    expect(mcpResult.lesson.scope.scopeId).toBeUndefined();

    const rest = (await sdk.trigger("api::lesson-save", {
      headers: {},
      body: {
        content: "Legacy prose REST lesson without explicit scope",
        project: "agentmemory",
        tags: ["legacy", "compat"],
      },
    })) as { status_code: number; body: { lesson?: Lesson; error?: string } };
    expect(rest.status_code).toBe(201);
    expect(rest.body.lesson?.scope).toMatchObject({ ring: "worktree" });
  });

  it("still rejects structured causal saves that omit an explicit scope", async () => {
    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_save",
        arguments: {
          content: "Structured lesson missing scope",
          mechanismId: "scope/guard",
          claim: "Structured lessons require explicit durable scope.",
          claimType: "causal",
        },
      },
    })) as { status_code: number; body: { error?: string } };
    expect(mcp.status_code).toBe(400);
    expect(mcp.body.error).toContain("explicit durable scope");

    const rest = (await sdk.trigger("api::lesson-save", {
      headers: {},
      body: {
        content: "Structured lesson missing scope",
        mechanismId: "scope/guard-rest",
        claim: "Structured lessons require explicit durable scope.",
        claimType: "causal",
      },
    })) as { status_code: number; body: { error?: string } };
    expect(rest.status_code).toBe(400);
    expect(rest.body.error).toContain("explicit durable scope");
  });

  it("rejects invalid immutable evidence and unapproved global scope at both boundaries", async () => {
    const rest = (await sdk.trigger("api::lesson-save", {
      headers: {},
      body: {
        content: "REST path-only evidence",
        mechanismId: "rest/path-only",
        claim: "A path is immutable proof.",
        evidenceRefs: [
          {
            kind: "document",
            projectId: "agentmemory",
            repoRemoteUrl: "https://github.com/rohitg00/agentmemory",
            path: "report.md",
            recordedAt: "2026-08-02T20:00:00.000Z",
          },
        ],
      },
    })) as { status_code: number; body: { error: string } };
    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_save",
        arguments: {
          content: "Unapproved global lesson",
          scope: { ring: "global" },
        },
      },
    })) as { status_code: number; body: { error: string } };

    expect(rest.status_code).toBe(400);
    expect(rest.body.error).toContain("not immutable proof");
    expect(mcp.status_code).toBe(400);
    expect(mcp.body.error).toContain("humanApproval");
    expect(await kv.list("mem:lessons")).toEqual([]);
  });

  it("whitelists lesson search fields instead of forwarding the raw body", async () => {
    await sdk.trigger("mem::lesson-save", {
      content: "Search boundary lesson",
      project: "agentmemory",
    });

    const response = (await sdk.trigger("api::lesson-search", {
      headers: {},
      body: {
        query: "search boundary",
        project: "agentmemory",
        limit: 5,
        lifecycle: "retracted",
        deleted: true,
        includeHidden: true,
        candidateIds: ["lsn_untrusted"],
        accessContext: {
          mode: "enforce",
          principalId: "untrusted",
        },
      },
    })) as {
      status_code: number;
      body: { lessons: Lesson[] };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.lessons).toHaveLength(1);
    expect(response.body.lessons[0].lifecycle).toBe("active");
  });

  it("accepts bounded hybrid filters at REST and MCP boundaries and hashes the audit query", async () => {
    const embedder: EmbeddingProvider = {
      name: "local",
      dimensions: 2,
      embed: vi.fn(async () => new Float32Array([1, 0])),
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map(() => new Float32Array([1, 0])),
      ),
    };
    setEmbeddingProvider(embedder);
    await sdk.trigger("mem::lesson-save", {
      content: "Queue pressure reversal survives cost controls.",
      project: "agentmemory",
      tags: ["microstructure", "costed"],
      mechanismId: "queue-pressure/reversal",
      claim: "Queue pressure predicts a short-horizon reversal.",
      claimType: "predictive",
      evidenceVerdict: "unverified",
      structuredFacets: {
        asset: ["HYPE"],
        venue: ["Bybit"],
      },
      scope: {
        ring: "repo",
        scopeId: "repo:https://github.com/wrightpt/agentmemory",
      },
      sensitivity: "public",
    });
    const rawQuery = "private candidate analogy";
    const filters = {
      query: rawQuery,
      project: "agentmemory",
      retrievalMode: "hybrid",
      compact: true,
      mechanismId: "queue-pressure/reversal",
      claimType: "predictive",
      evidenceVerdicts: ["unverified"],
      structuredFacets: {
        asset: ["hype"],
        venue: ["BYBIT"],
      },
      tags: ["microstructure", "costed"],
      scopeRing: "repo",
      sensitivity: "public",
      includeHidden: true,
      candidateIds: ["lsn_untrusted"],
    };

    const rest = (await sdk.trigger("api::lesson-search", {
      headers: {},
      body: filters,
    })) as {
      status_code: number;
      body: {
        lessons: Array<{ lessonId: string; evidenceRefs?: unknown }>;
        retrieval: { usedMode: string };
      };
    };
    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_recall",
        arguments: filters,
      },
    })) as {
      status_code: number;
      body: { content: Array<{ text: string }> };
    };
    const mcpResult = JSON.parse(mcp.body.content[0].text) as {
      lessons: Array<{ lessonId: string }>;
      retrieval: { usedMode: string };
    };
    const audits = await kv.list<AuditEntry>("mem:audit");
    const recallAudits = audits.filter(
      (entry) => entry.operation === "lesson_recall",
    );

    expect(rest).toMatchObject({
      status_code: 200,
      body: {
        retrieval: { usedMode: "hybrid" },
        lessons: [expect.objectContaining({ lessonId: expect.any(String) })],
      },
    });
    expect(rest.body.lessons[0]).toHaveProperty("lessonId");
    expect(rest.body.lessons[0]).not.toHaveProperty("evidenceRefs");
    expect(mcp.status_code).toBe(200);
    expect(mcpResult.retrieval.usedMode).toBe("hybrid");
    expect(mcpResult.lessons).toHaveLength(1);
    expect(recallAudits).toHaveLength(2);
    for (const audit of recallAudits) {
      expect(audit.targetIds).toHaveLength(1);
      expect(audit.details).toHaveProperty("queryFingerprint");
      expect(JSON.stringify(audit.details)).not.toContain(rawQuery);
      expect(audit.details).not.toHaveProperty("query");
    }
    const tool = getAllTools().find(
      (candidate) => candidate.name === "memory_lesson_recall",
    );
    expect(tool?.inputSchema.properties).toHaveProperty("retrievalMode");
    expect(tool?.inputSchema.properties).toHaveProperty("structuredFacets");
    expect(tool?.inputSchema.properties).toHaveProperty("compact");
  });

  it("returns bounded validation errors for invalid recall input at both boundaries", async () => {
    const rest = (await sdk.trigger("api::lesson-search", {
      headers: {},
      body: { query: "valid", limit: 51 },
    })) as { status_code: number; body: { code: string } };
    const mcp = (await sdk.trigger("mcp::tools::call", {
      headers: {},
      body: {
        name: "memory_lesson_recall",
        arguments: { query: "x".repeat(2_049) },
      },
    })) as { status_code: number; body: { code: string } };

    expect(rest).toMatchObject({
      status_code: 400,
      body: { code: "invalid_request" },
    });
    expect(mcp).toMatchObject({
      status_code: 400,
      body: { code: "invalid_request" },
    });
  });

  it("fails closed before embedding when authoritative lesson state is malformed", async () => {
    const embedder: EmbeddingProvider = {
      name: "local",
      dimensions: 2,
      embed: vi.fn(async () => new Float32Array([1, 0])),
      embedBatch: vi.fn(async (texts: string[]) =>
        texts.map(() => new Float32Array([1, 0])),
      ),
    };
    setEmbeddingProvider(embedder);
    await kv.set("mem:lessons", "lsn_invalid", {
      id: "lsn_invalid",
      schemaVersion: 1,
      content: 42,
    } as unknown as Lesson);

    const result = (await sdk.trigger("mem::lesson-recall", {
      query: "invalid lesson",
      retrievalMode: "hybrid",
    })) as { success: boolean; code: string; error: string };

    expect(result).toEqual({
      success: false,
      code: "lesson_state_unavailable",
      error: "lesson retrieval state is unavailable",
    });
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(embedder.embedBatch).not.toHaveBeenCalled();
  });

  it("rejects dangling, self, cross-scope, and cross-project contradiction relations", async () => {
    const target = (await sdk.trigger("mem::lesson-save", {
      content: "Contradiction target",
      project: "project-one",
      mechanismId: "relations/target",
      claim: "The target claim is active.",
      scope: { ring: "repo", scopeId: "repo:one" },
    })) as { lesson: Lesson };
    const sourceInput = {
      content: "Contradiction source",
      project: "project-one",
      mechanismId: "relations/source",
      claim: "The source claim is active.",
      scope: { ring: "repo", scopeId: "repo:one" },
    };
    const source = (await sdk.trigger(
      "mem::lesson-save",
      sourceInput,
    )) as { lesson: Lesson };

    const dangling = await sdk.trigger("mem::lesson-save", {
      ...sourceInput,
      contradictedByLessonIds: ["lsn_missing"],
    });
    const self = await sdk.trigger("mem::lesson-save", {
      ...sourceInput,
      contradictedByLessonIds: [source.lesson.id],
    });
    const otherScope = (await sdk.trigger("mem::lesson-save", {
      content: "Other scope target",
      project: "project-one",
      mechanismId: "relations/other-scope",
      claim: "The other-scope target is active.",
      scope: { ring: "repo", scopeId: "repo:two" },
    })) as { lesson: Lesson };
    const crossScope = await sdk.trigger("mem::lesson-save", {
      ...sourceInput,
      contradictedByLessonIds: [otherScope.lesson.id],
    });
    const otherProject = (await sdk.trigger("mem::lesson-save", {
      content: "Other project target",
      project: "project-two",
      mechanismId: "relations/other-project",
      claim: "The other-project target is active.",
      scope: { ring: "repo", scopeId: "repo:one" },
    })) as { lesson: Lesson };
    const crossProject = await sdk.trigger("mem::lesson-save", {
      ...sourceInput,
      contradictedByLessonIds: [otherProject.lesson.id],
    });
    const valid = await sdk.trigger("mem::lesson-save", {
      ...sourceInput,
      contradictedByLessonIds: [target.lesson.id],
    });

    expect(dangling).toMatchObject({
      success: false,
      code: "invalid_relation",
      error: expect.stringContaining("does not exist"),
    });
    expect(self).toMatchObject({
      success: false,
      code: "invalid_relation",
      error: expect.stringContaining("must not contain the lesson itself"),
    });
    expect(crossScope).toMatchObject({
      success: false,
      code: "invalid_relation",
      error: expect.stringContaining("durable scope and project"),
    });
    expect(crossProject).toMatchObject({
      success: false,
      code: "invalid_relation",
      error: expect.stringContaining("durable scope and project"),
    });
    expect(valid).toMatchObject({
      success: true,
      action: "strengthened",
      lesson: {
        contradictedByLessonIds: [target.lesson.id],
      },
    });
  });
});
