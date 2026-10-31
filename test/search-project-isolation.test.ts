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
      getSearchIndex().clear();
      setHybridRanker(null);
      if (ranking !== "keyword") {
        setHybridRanker(async () => {
          if (ranking === "hybrid-fallback") throw new Error("ranker unavailable");
          return memories.map((memory, index) => {
            const observation = memoryToObservation(memory);
            return {
              observation,
              sessionId: observation.sessionId,
              combinedScore: 1 / (index + 1),
              layer: "memory" as const,
            };
          });
        });
      }
      const kv = {
        get: async (scope: string, key: string) => records.get(scope)?.get(key) ?? null,
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

    it("fills the result limit after excluding an unscoped first candidate", async () => {
      const unscoped = addMemory();
      const matching = addMemory({ id: "mem_matching", project: "project-a" });
      // Candidate ordering is external to the ownership filter under test.
      vi.spyOn(getSearchIndex(), "search").mockReturnValue(
        [unscoped, matching].map((memory, index) => ({
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
