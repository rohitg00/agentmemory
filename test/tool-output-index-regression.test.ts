import { describe, it, expect, afterEach } from "vitest";
import {
  getSearchIndex,
  rebuildKeywordIndex,
  setEmbeddingProvider,
  setIndexPersistence,
  setVectorIndex,
} from "../src/functions/search.js";
import { SearchIndex } from "../src/state/search-index.js";
import type { CompressedObservation } from "../src/types.js";

// Synthetic regression coverage for retained conversation answers: each
// scenario's distinctive terms appear only in source.toolOutput, so every
// assertion below can only pass via the bounded tool-output indexing.
// Limitation: these are in-process unit tests against a mock KV store. The
// persistence round-trip and rebuilds simulate lifecycle steps; no real
// worker restart, daemon restart, or migration/upgrade path is exercised.
const SCENARIOS = [
  {
    id: "obs_first",
    sessionId: "ses_first",
    answer: "For the orchard recommend cerulean badger fixtures and verify striped mango stability.",
    query: "cerulean badger fixtures",
  },
  {
    id: "obs_other",
    sessionId: "ses_other",
    answer: "For the lighthouse recommend vermilion otter beacons and verify silver papaya rotation.",
    query: "vermilion otter beacons",
  },
];

function conversationObs(id: string, sessionId: string, answer: string): CompressedObservation {
  return {
    id,
    sessionId,
    timestamp: "2026-09-01T00:00:00.000Z",
    type: "conversation",
    title: "Completed turn",
    facts: [],
    narrative: "Routine turn bookkeeping",
    concepts: [],
    files: [],
    importance: 5,
    source: {
      hookType: "post_tool_use",
      originalBytes: 64,
      truncated: false,
      toolName: "conversation",
      toolInput: `promptmarker for ${sessionId}`,
      toolOutput: answer,
    },
  };
}

function seedScenarios(kv: { store: Map<string, Map<string, unknown>> }): void {
  const sessions = new Map<string, { id: string; project: string; cwd: string }>();
  for (const s of SCENARIOS) sessions.set(s.sessionId, { id: s.sessionId, project: "p", cwd: "/tmp" });
  kv.store.set("mem:sessions", sessions);
  for (const s of SCENARIOS) {
    const scope = new Map<string, unknown>();
    scope.set(s.id, conversationObs(s.id, s.sessionId, s.answer));
    kv.store.set(`mem:obs:${s.sessionId}`, scope);
  }
}

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    list: async <T,>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
    get: async <T,>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T,>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
  };
}

describe("retained conversation tool output indexing", () => {
  afterEach(() => {
    getSearchIndex().clear();
    setVectorIndex(null);
    setEmbeddingProvider(null);
    setIndexPersistence(null);
  });

  it("discovers each answer only by its own terms, after a simulated persistence round-trip", () => {
    const live = new SearchIndex();
    for (const s of SCENARIOS) live.add(conversationObs(s.id, s.sessionId, s.answer));

    // Simulated restart: persistence round-trip into a fresh index. This only
    // exercises serialize/deserialize, not an actual worker restart.
    const restarted = SearchIndex.deserialize(live.serialize());
    for (const s of SCENARIOS) {
      expect(restarted.search(s.query).map((r) => r.obsId)).toEqual([s.id]);
    }
    expect(restarted.search("striped mango").map((r) => r.obsId)).toEqual(["obs_first"]);
    expect(restarted.search("silver papaya").map((r) => r.obsId)).toEqual(["obs_other"]);
    expect(restarted.search("promptmarker")).toEqual([]);
  });

  it("keeps boundaries: unrelated tool output and oversized answers stay unindexed", () => {
    const index = new SearchIndex();
    index.add({
      ...conversationObs("obs_tool", "ses_tool", ""),
      source: {
        hookType: "post_tool_use",
        originalBytes: 90000,
        truncated: true,
        toolName: "run_command",
        toolOutput: `headanswer ${"filler ".repeat(2000)} tailanswer`,
      },
    });
    index.add({
      ...conversationObs("obs_conv", "ses_conv", ""),
      source: {
        hookType: "post_tool_use",
        originalBytes: 90000,
        truncated: true,
        toolName: "conversation",
        toolOutput: `headanswer ${"filler ".repeat(2000)} tailanswer`,
      },
    });

    expect(index.search("vermilion otter")).toEqual([]);
    expect(index.search("headanswer").map((r) => r.obsId)).toEqual(["obs_conv"]);
    expect(index.search("tailanswer")).toEqual([]);
  });

  it("survives keyword rebuild and repeated rebuild of preexisting records", async () => {
    const kv = mockKV();
    seedScenarios(kv);

    await rebuildKeywordIndex(kv as never);
    const idx = getSearchIndex();
    for (const s of SCENARIOS) {
      expect(idx.search(s.query).map((r) => r.obsId)).toEqual([s.id]);
    }
    expect(idx.search("promptmarker")).toEqual([]);

    // Idempotency: the same store rebuilds to the same discoverability.
    await rebuildKeywordIndex(kv as never);
    for (const s of SCENARIOS) {
      expect(getSearchIndex().search(s.query).map((r) => r.obsId)).toEqual([s.id]);
    }
  });
});
