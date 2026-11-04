import { describe, expect, it, vi } from "vitest";
import { memoryToObservation, lessonToObservation } from "../src/state/memory-utils.js";
import { registerSmartSearchFunction } from "../src/functions/smart-search.js";
import { buildRecallResponse } from "../src/functions/recall-response.js";
import { CompressOutputSchema } from "../src/eval/schemas.js";
import type { Memory, Lesson, CompressedObservation, HybridSearchResult } from "../src/types.js";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../src/state/kv.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const types: Memory["type"][] = ["pattern", "preference", "architecture", "bug", "workflow", "fact"];
function memory(type: Memory["type"]): Memory {
  return {
    id: `mem_${type}`, type, title: "Synthetic type preservation", content: "Synthetic content. ".repeat(200),
    createdAt: "2026-10-31T14:44:33.707Z", updatedAt: "2026-10-31T14:44:33.707Z",
    concepts: ["synthetic"], files: [], sessionIds: [], strength: 7, version: 1, isLatest: true,
    project: "project-a", agentId: "owner",
  };
}

function fixture(saved: Memory, legacy = false, failMemoryReads = false) {
  const store = new Map<string, Map<string, unknown>>([["mem:memories", new Map([[saved.id, saved]])]]);
  const kv = {
    get: async (scope: string, id: string) => {
      if (failMemoryReads && scope === "mem:memories") throw new Error("state read failed");
      return store.get(scope)?.get(id) ?? null;
    },
    set: async (scope: string, id: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(id, value);
      return value;
    },
    list: async (scope: string) => [...(store.get(scope)?.values() ?? [])],
  };
  let handler: (args: object) => Promise<{
    mode: string;
    results: Array<{ obsId: string; observation?: CompressedObservation }>;
    truncated?: boolean;
  }>;
  const sdk = { registerFunction: (_: string, fn: typeof handler) => { handler = fn; } };
  const observation = memoryToObservation(saved);
  if (legacy) delete observation.memoryType;
  const search = vi.fn(async (): Promise<HybridSearchResult[]> => [{
    observation, sessionId: "memory", layer: "memory", combinedScore: 1,
    bm25Score: 1, vectorScore: 0, graphScore: 0,
  }]);
  registerSmartSearchFunction(sdk as unknown as IIIClient, kv as unknown as StateKV, search);
  return { call: (args: object) => handler(args), saved };
}

describe("original memory type metadata", () => {
  it("keeps compact search working when the stored memory read fails", async () => {
    const f = fixture(memory("bug"), false, true);
    const compact = await f.call({ query: "Synthetic", agentId: "*", targetLayer: "memory", includeLessons: false });
    expect(compact.results[0]).toMatchObject({ obsId: f.saved.id, type: "decision", memoryType: "bug" });
  });

  it.each(types)("preserves %s without changing the observation type or input", (type) => {
    const saved = memory(type);
    const before = structuredClone(saved);
    const result = memoryToObservation(Object.freeze(saved));
    expect(result).toMatchObject({ id: saved.id, type: "decision", memoryType: type, narrative: saved.content, agentId: "owner" });
    expect(saved).toEqual(before);
    expect(CompressOutputSchema.safeParse(result).success).toBe(true);
    expect(CompressOutputSchema.safeParse({ ...result, type }).success).toBe(false);
  });

  it.each(types)("preserves %s in compact and expanded search, including a legacy index", async (type) => {
    const f = fixture(memory(type), true);
    const scope = { project: "project-a", agentId: "*", targetLayer: "memory", includeLessons: false };
    const compact = await f.call({ query: "Synthetic", ...scope });
    expect(compact.results[0]).toMatchObject({ obsId: f.saved.id, type: "decision", memoryType: type });
    const expanded = await f.call({ expandIds: [f.saved.id], ...scope });
    expect(expanded.results[0].observation).toMatchObject({ type: "decision", memoryType: type, narrative: f.saved.content });
    expect(expanded.truncated).toBe(false);
    expect((await f.call({ query: "Synthetic", ...scope, project: "project-b" })).results).toEqual([]);
    expect((await f.call({ expandIds: [f.saved.id], ...scope, project: "project-b" })).results).toEqual([]);
    expect((await f.call({ query: "Synthetic", ...scope, agentId: "other" })).results).toEqual([]);
    expect((await f.call({ expandIds: [f.saved.id], ...scope, agentId: "other" })).results).toEqual([]);
    expect((await f.call({ query: "Synthetic", ...scope, targetLayer: "observation" })).results).toEqual([]);
  });

  it.each(["full", "compact", "narrative"] as const)("retains memoryType in %s recall with and without clipping", (format) => {
    const observation = memoryToObservation(memory("fact"));
    observation.title = "Synthetic memory title ".repeat(100);
    const result = { observation, sessionId: "memory", layer: "memory" as const, score: 1 };
    for (const budget of [undefined, 250]) {
      const response = buildRecallResponse([result], format, budget);
      const first = response.results[0];
      expect(first).toBeDefined();
      const metadata = "observation" in first ? first.observation : first;
      expect(metadata).toHaveProperty("memoryType", "fact");
      if (budget) {
        expect(first).toHaveProperty("content_truncated", true);
        expect(response.tokens_used).toBeLessThanOrEqual(budget);
      }
    }
  });

  it("does not assign a memory type to lessons or ordinary observations", () => {
    const lesson = { id: "lsn_test", content: "Lesson", context: "", tags: [], confidence: 7, createdAt: "2026-10-31" } as Lesson;
    expect(lessonToObservation(lesson)).not.toHaveProperty("memoryType");
    const observation: CompressedObservation = { ...memoryToObservation(memory("fact")), id: "obs_test", type: "file_read" };
    delete observation.memoryType;
    const result = buildRecallResponse([{ observation, sessionId: "session", layer: "observation", score: 1 }], "compact");
    expect(result.results[0]).toHaveProperty("type", "file_read");
    expect(result.results[0]).not.toHaveProperty("memoryType");
  });
});
