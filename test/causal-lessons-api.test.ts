import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { getAllTools } from "../src/mcp/tools-registry.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type { Lesson } from "../src/types.js";
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
      },
    })) as {
      status_code: number;
      body: { lessons: Lesson[] };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.lessons).toHaveLength(1);
    expect(response.body.lessons[0].lifecycle).toBe("active");
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
