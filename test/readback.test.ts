import { beforeEach, describe, expect, it } from "vitest";
import { registerReadbackFunction } from "../src/functions/readback.js";
import { KV } from "../src/state/schema.js";
import type { Memory, MemoryWriteCandidate, ReadbackResult } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("Readback verification", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerReadbackFunction(sdk as never, kv as never);
  });

  it("passes when a memory id appears in search results", async () => {
    const memory: Memory = {
      id: "mem_react",
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      type: "architecture",
      title: "React frontend",
      content: "The frontend uses React",
      concepts: ["react", "frontend"],
      files: ["src/App.tsx"],
      sessionIds: [],
      strength: 7,
      version: 1,
      isLatest: true,
    };
    await kv.set(KV.memories, memory.id, memory);
    sdk.registerFunction("mem::search", async () => ({
      results: [{ observation: { id: "mem_react" } }],
    }));

    const result = (await sdk.trigger("mem::readback-verify", {
      memoryId: "mem_react",
      mode: "search",
      limit: 5,
    })) as { success: boolean; readback: ReadbackResult };

    expect(result.success).toBe(true);
    expect(result.readback.passed).toBe(true);
    expect(result.readback.memoryId).toBe("mem_react");
    expect(result.readback.queries.length).toBeGreaterThanOrEqual(2);
    expect(result.readback.queries.some((q) => q.matched)).toBe(true);

    const stored = await kv.list<ReadbackResult>(KV.readbackResults);
    expect(stored).toHaveLength(1);
    expect(stored[0].passed).toBe(true);
  });

  it("fails and persists a readback result when target memory is not found", async () => {
    await kv.set(KV.memories, "mem_missing", {
      id: "mem_missing",
      title: "Missing memory",
      content: "This should not be found",
      concepts: [],
      files: [],
      sessionIds: [],
      type: "fact",
      strength: 1,
      version: 1,
      isLatest: true,
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
    } satisfies Memory);
    sdk.registerFunction("mem::search", async () => ({
      results: [{ observation: { id: "other" } }],
    }));

    const result = (await sdk.trigger("mem::readback-verify", {
      memoryId: "mem_missing",
      queries: ["missing memory"],
    })) as { success: boolean; readback: ReadbackResult };

    expect(result.success).toBe(true);
    expect(result.readback.passed).toBe(false);
    expect(result.readback.failureReason).toBe("target not found in top results");
    expect((await kv.list<ReadbackResult>(KV.readbackResults))[0].passed).toBe(false);
  });

  it("candidate-only readback records query previews without claiming pass", async () => {
    const candidate: MemoryWriteCandidate = {
      id: "cand_1",
      createdAt: "2026-05-27T00:00:00Z",
      scope: "project",
      sourceText: "以后先查修复记录",
      evidenceQuote: "以后先查修复记录",
      subject: "agent_memory_workflow",
      predicate: "procedural_rule",
      value: "以后先查修复记录",
      memoryType: "procedural_rule",
      confidence: 0.9,
      importance: 0.9,
      target: "review",
      requiresReview: true,
      reason: "workflow",
      readbackQueries: ["agent_memory_workflow procedural_rule", "修复记录"],
      status: "shadow",
    };
    await kv.set(KV.writeCandidates, candidate.id, candidate);

    const result = (await sdk.trigger("mem::readback-verify", {
      candidateId: "cand_1",
    })) as { success: boolean; readback: ReadbackResult };

    expect(result.success).toBe(true);
    expect(result.readback.candidateId).toBe("cand_1");
    expect(result.readback.passed).toBe(false);
    expect(result.readback.failureReason).toBe(
      "candidate has no durable memoryId yet",
    );
    expect(result.readback.queries.map((q) => q.query)).toEqual(candidate.readbackQueries);
  });

  it("extracts ids from smart-search compact results", async () => {
    await kv.set(KV.memories, "mem_smart", {
      id: "mem_smart",
      title: "Smart memory",
      content: "Hybrid retrieval finds this",
      concepts: [],
      files: [],
      sessionIds: [],
      type: "fact",
      strength: 1,
      version: 1,
      isLatest: true,
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
    } satisfies Memory);
    sdk.registerFunction("mem::smart-search", async () => ({
      mode: "compact",
      results: [{ obsId: "mem_smart" }],
    }));

    const result = (await sdk.trigger("mem::readback-verify", {
      memoryId: "mem_smart",
      mode: "smart-search",
      queries: ["smart memory"],
    })) as { readback: ReadbackResult };

    expect(result.readback.passed).toBe(true);
    expect(result.readback.queries[0].topIds).toEqual(["mem_smart"]);
  });
});
