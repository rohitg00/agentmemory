import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerWriteCandidatesFunction } from "../src/functions/write-candidates.js";
import { KV } from "../src/state/schema.js";
import type { MemoryWriteCandidate } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("Memory write candidates", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerWriteCandidatesFunction(sdk as never, kv as never);
  });

  it("extracts explicit user preferences into shadow candidates", async () => {
    const result = (await sdk.trigger("mem::write-candidates-generate", {
      sourceText: "我更喜欢简洁直接的回答",
      project: "agentmemory",
      agentId: "codex",
    })) as { success: boolean; candidates: MemoryWriteCandidate[] };

    expect(result.success).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      memoryType: "preference",
      target: "memory",
      status: "shadow",
      project: "agentmemory",
      agentId: "codex",
      scope: "agent",
      requiresReview: false,
    });
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.candidates[0].readbackQueries.length).toBeGreaterThan(0);

    const stored = await kv.list<MemoryWriteCandidate>(KV.writeCandidates);
    expect(stored.map((c) => c.id)).toEqual([result.candidates[0].id]);
  });

  it("extracts procedural rules from future workflow instructions", async () => {
    const result = (await sdk.trigger("mem::write-candidates-generate", {
      sourceText: "以后遇到这种报错，先查之前的修复记录再动手",
      project: "agentmemory",
    })) as { success: boolean; candidates: MemoryWriteCandidate[] };

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      memoryType: "procedural_rule",
      target: "review",
      requiresReview: true,
      scope: "project",
      status: "shadow",
    });
    expect(result.candidates[0].importance).toBeGreaterThanOrEqual(0.85);
  });

  it("ignores low-signal acknowledgements", async () => {
    const result = (await sdk.trigger("mem::write-candidates-generate", {
      sourceText: "哈哈可以",
    })) as { success: boolean; candidates: MemoryWriteCandidate[] };

    expect(result.success).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(await kv.list(KV.writeCandidates)).toEqual([]);
  });

  it("redacts secret-like values before persisting candidates", async () => {
    const result = (await sdk.trigger("mem::write-candidates-generate", {
      sourceText: "我的 API key 是 sk-test-secret-value，以后先查凭据路径",
      agentId: "codex",
    })) as { success: boolean; candidates: MemoryWriteCandidate[] };

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.memoryType).toBe("credential_route");
    expect(candidate.requiresReview).toBe(true);
    expect(candidate.sourceText).not.toContain("sk-test-secret-value");
    expect(candidate.evidenceQuote).not.toContain("sk-test-secret-value");
    expect(candidate.value).not.toContain("sk-test-secret-value");
    expect(candidate.value).toContain("[REDACTED_SECRET]");
  });

  it("reviews candidates without writing durable memories", async () => {
    const generated = (await sdk.trigger("mem::write-candidates-generate", {
      sourceText: "我更喜欢短句",
    })) as { candidates: MemoryWriteCandidate[] };
    const candidateId = generated.candidates[0].id;

    const approved = (await sdk.trigger("mem::write-candidates-review", {
      candidateId,
      decision: "approve",
      reason: "explicit preference",
    })) as { success: boolean; candidate: MemoryWriteCandidate };

    expect(approved.success).toBe(true);
    expect(approved.candidate.status).toBe("approved");
    expect(await kv.list(KV.memories)).toEqual([]);

    const rejected = (await sdk.trigger("mem::write-candidates-review", {
      candidateId,
      decision: "reject",
    })) as { success: boolean; candidate: MemoryWriteCandidate };
    expect(rejected.candidate.status).toBe("rejected");
  });
});
