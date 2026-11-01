import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/functions/access-tracker.js", () => ({
  recordAccessBatch: vi.fn(),
}));

import {
  getSearchIndex,
  registerSearchFunction,
  setHybridRanker,
} from "../src/functions/search.js";
import { memoryToObservation } from "../src/state/memory-utils.js";
import { KV } from "../src/state/schema.js";
import type { Memory, SearchResult, Session } from "../src/types.js";

const timestamp = "2026-01-01T00:00:00Z";

describe.each(["keyword", "hybrid", "hybrid-fallback"] as const)(
  "mem::search project isolation via %s",
  (ranking) => {
    let records: Map<string, Map<string, unknown>>;
    let memories: Memory[];
    let hybridLimits: number[];
    let memoryReads: string[];
    let activeObservationReads: number;
    let maxObservationReads: number;
    let search: (data: Record<string, unknown>) => Promise<{ results: SearchResult[] }>;

    const put = (scope: string, key: string, value: unknown) => {
      if (!records.has(scope)) records.set(scope, new Map());
      records.get(scope)!.set(key, value);
    };

    const addMemory = (overrides: Partial<Memory> = {}) => {
      const memory: Memory = {
        id: "mem_unscoped",
        createdAt: timestamp,
        updatedAt: timestamp,
        type: "fact",
        title: "isolation marker",
        content: "isolation marker",
        concepts: ["isolation"],
        files: [],
        sessionIds: [],
        strength: 7,
        version: 1,
        isLatest: true,
        ...overrides,
      };
      memories.push(memory);
      put(KV.memories, memory.id, memory);
      getSearchIndex().add(memoryToObservation(memory), "memory");
      return memory;
    };

    const addSession = (project: string) => {
      const session: Session = {
        id: "session_existing",
        project,
        cwd: "/test/project",
        startedAt: timestamp,
        status: "completed",
        observationCount: 0,
      };
      put(KV.sessions, session.id, session);
      return session;
    };

    const recall = async (overrides: Record<string, unknown> = {}) => {
      const result = await search({
        query: "isolation",
        project: "project-a",
        targetLayer: "memory",
        agentId: "*",
        ...overrides,
      });
      return result.results.map((hit) => hit.observation.id);
    };

    beforeEach(() => {
      records = new Map();
      memories = [];
      hybridLimits = [];
      memoryReads = [];
      activeObservationReads = 0;
      maxObservationReads = 0;
      getSearchIndex().clear();
      setHybridRanker(null);
      if (ranking !== "keyword") {
        setHybridRanker(async (_query, limit) => {
          hybridLimits.push(limit);
          if (ranking === "hybrid-fallback") throw new Error("ranker unavailable");
          return memories.map((memory, index) => {
            const observation = memoryToObservation(memory);
            return {
              observation,
              sessionId: observation.sessionId,
              combinedScore: 1 / (index + 1),
              layer: "memory" as const,
            };
          }).slice(0, limit);
        });
      }
      const kv = {
        get: async (scope: string, key: string) => {
          if (scope === KV.observations("memory")) {
            memoryReads.push(key);
            activeObservationReads++;
            maxObservationReads = Math.max(maxObservationReads, activeObservationReads);
            await Promise.resolve();
            activeObservationReads--;
          }
          return records.get(scope)?.get(key) ?? null;
        },
        list: async (scope: string) => [...(records.get(scope)?.values() ?? [])],
      };
      const sdk = {
        registerFunction: (_id: string, handler: typeof search) => { search = handler; },
      };
      registerSearchFunction(sdk as never, kv as never);
    });

    afterEach(() => {
      setHybridRanker(null);
      getSearchIndex().clear();
      vi.restoreAllMocks();
    });

    it("excludes an unscoped memory with no session", async () => {
      addMemory();
      expect(await recall()).toEqual([]);
    });

    it("excludes an unscoped memory with a dangling session reference", async () => {
      addMemory({ sessionIds: ["session_missing"] });
      expect(await recall()).toEqual([]);
    });

    it("includes a legacy memory through its matching session", async () => {
      const session = addSession("project-a");
      const memory = addMemory({ sessionIds: [session.id] });
      expect(await recall()).toEqual([memory.id]);
    });

    it("excludes a legacy memory belonging to another session project", async () => {
      const session = addSession("project-b");
      addMemory({ sessionIds: [session.id] });
      expect(await recall()).toEqual([]);
    });

    it("includes an explicitly matching memory without a session", async () => {
      const memory = addMemory({ project: "project-a" });
      expect(await recall()).toEqual([memory.id]);
    });

    it("rejects an explicit foreign project even when its session matches", async () => {
      const session = addSession("project-a");
      addMemory({ project: "project-b", sessionIds: [session.id] });
      expect(await recall()).toEqual([]);
    });

    it("preserves unscoped memories when no project filter is requested", async () => {
      const memory = addMemory();
      expect(await recall({ project: undefined })).toEqual([memory.id]);
    });

    const orderedKeywordResults = () =>
      vi.spyOn(getSearchIndex(), "search").mockImplementation((_query, limit) =>
        memories.slice(0, limit).map((memory, index) => ({
          obsId: memory.id,
          sessionId: memory.sessionIds[0] ?? "memory",
          score: 1 / (index + 1),
          layer: "memory" as const,
        })),
      );

    it("refills multiple full windows without returning excluded projects", async () => {
      for (let i = 0; i < 205; i++) {
        addMemory({ id: `mem_excluded_${i}`, project: i % 2 ? "project-b" : undefined });
      }
      const matching = addMemory({ id: "mem_matching", project: "project-a" });
      orderedKeywordResults();
      expect(await recall({ limit: 1 })).toEqual([matching.id]);
    });

    it("refills after the loaded agent filter consumes a full window", async () => {
      for (let i = 0; i < 100; i++) {
        addMemory({ id: `mem_foreign_agent_${i}`, project: "project-a", agentId: "agent-b" });
      }
      const matching = addMemory({ id: "mem_matching", project: "project-a", agentId: "agent-a" });
      orderedKeywordResults();
      expect(await recall({ limit: 1, agentId: "agent-a" })).toEqual([matching.id]);
      if (ranking !== "hybrid") {
        expect(memoryReads.filter((id) => id === "mem_foreign_agent_0")).toHaveLength(1);
        expect(maxObservationReads).toBeLessThanOrEqual(10);
      }
    });

    it("bounds candidate scanning even when every record is rejected", async () => {
      for (let i = 0; i < 1001; i++) {
        addMemory({ id: `mem_foreign_${i}`, project: "project-b" });
      }
      addMemory({ id: "mem_beyond_budget", project: "project-a" });
      const keyword = orderedKeywordResults();
      expect(await recall({ limit: 1 })).toEqual([]);
      const requestedLimits = ranking === "hybrid"
        ? hybridLimits
        : keyword.mock.calls.map((call) => call[1]);
      expect(requestedLimits).toEqual([100, 200, 400, 800, 1000]);
    });

    it("stops refilling when the candidate source is exhausted", async () => {
      for (let i = 0; i < 100; i++) addMemory({ id: `mem_unscoped_${i}` });
      const keyword = orderedKeywordResults();
      expect(await recall({ limit: 1 })).toEqual([]);
      const requestedLimits = ranking === "hybrid"
        ? hybridLimits
        : keyword.mock.calls.map((call) => call[1]);
      expect(requestedLimits).toEqual([100, 200]);
    });

    it("fills the result limit after excluding an unscoped first candidate", async () => {
      const unscoped = addMemory();
      const matching = addMemory({ id: "mem_matching", project: "project-a" });
      // Candidate ordering is external to the ownership filter under test.
      vi.spyOn(getSearchIndex(), "search").mockImplementation((_query, limit) =>
        [unscoped, matching].slice(0, limit).map((memory, index) => ({
          obsId: memory.id,
          sessionId: "memory",
          score: 1 / (index + 1),
          layer: "memory" as const,
        })),
      );
      expect(await recall({ limit: 1 })).toEqual([matching.id]);
    });
  },
);
