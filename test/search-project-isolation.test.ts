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
import { HybridSearch } from "../src/state/hybrid-search.js";
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
    let sessionReads: string[];
    let failSessionReads: boolean;
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
      sessionReads = [];
      failSessionReads = false;
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
          if (scope === KV.sessions) {
            sessionReads.push(key);
            if (failSessionReads) throw new Error("session store unavailable");
          }
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

    it.each(["project", "directory"])("stops session checks once a %s-filtered page is full", async (filter) => {
      for (let i = 0; i < 100; i++) {
        const session = { ...addSession("project-a"), id: `session_${i}` };
        put(KV.sessions, session.id, session);
        addMemory({ id: `mem_${i}`, sessionIds: [session.id] });
      }
      orderedKeywordResults();
      expect(await recall({ limit: 1, ...(filter === "directory" ? { project: undefined, cwd: "/test/project" } : {}) })).toEqual(["mem_0"]);
      expect(sessionReads).toEqual(["session_0"]);
    });

    if (ranking === "hybrid") {
      it("deepens a shortened hybrid response when candidateCount still fills the window", async () => {
        const foreign = addMemory({ id: "mem_foreign", project: "project-b" });
        const matching = addMemory({ id: "mem_matching", project: "project-a" });
        const ranker = vi.fn<NonNullable<Parameters<typeof setHybridRanker>[0]>>(async (_query, limit, _layer, _authorize, request) => {
          if (request) request.candidateCount = limit === 100 ? 100 : 101;
          const observation = memoryToObservation(limit === 100 ? foreign : matching);
          return [{ observation, sessionId: observation.sessionId, combinedScore: 1, layer: "memory" as const }];
        });
        setHybridRanker(ranker);
        expect(await recall({ limit: 1 })).toEqual([matching.id]);
        expect(ranker.mock.calls.map((call) => call[1])).toEqual([100, 200]);
      });

      it("fills a real hybrid window shortened by a missing record", async () => {
        for (let i = 0; i < 100; i++) {
          addMemory({ id: `mem_foreign_${i.toString().padStart(3, "0")}`, project: "project-b" });
        }
        records.get(KV.memories)!.delete("mem_foreign_000");
        const matching = addMemory({ id: "mem_matching", project: "project-a" });
        const hybrid = new HybridSearch(getSearchIndex(), null, null, {
          get: async (scope: string, key: string) => records.get(scope)?.get(key) ?? null,
        } as never, 0.4, 0.6, 0);
        const ranker = vi.fn(hybrid.search.bind(hybrid));
        setHybridRanker(ranker);
        expect(await recall({ limit: 1 })).toEqual([matching.id]);
        expect(ranker.mock.calls.map((call) => call[1])).toEqual([100]);
      });
    }

    it.each([1, 20])("refills an unfiltered query past stale candidates with limit %i", async (limit) => {
      for (let i = 0; i < 100; i++) {
        addMemory({ id: `mem_stale_${i}`, isLatest: false });
      }
      const live = addMemory({ id: "mem_live" });
      orderedKeywordResults();
      if (ranking === "hybrid") {
        const hybrid = new HybridSearch(getSearchIndex(), null, null, {
          get: async (scope: string, key: string) => records.get(scope)?.get(key) ?? null,
        } as never, 0.4, 0.6, 0);
        setHybridRanker(hybrid.search.bind(hybrid));
      }
      expect(await recall({ project: undefined, limit })).toEqual([live.id]);
    });

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

    it("stops session filtering after a bounded batch fills the page", async () => {
      const observations = [];
      for (let i = 0; i < 100; i++) {
        const session = { ...addSession("project-a"), id: `session_${i}` };
        put(KV.sessions, session.id, session);
        const memory = addMemory({ id: `obs_valid_${i}`, sessionIds: [session.id] });
        const observation = memoryToObservation(memory);
        observations.push(observation);
        getSearchIndex().add(observation, "observation");
        put(KV.observations(session.id), observation.id, observation);
      }
      vi.spyOn(getSearchIndex(), "search").mockImplementation((_query, limit) =>
        observations.slice(0, limit).map((observation, i) => ({
          obsId: observation.id, sessionId: observation.sessionId, score: 1 / (i + 1), layer: "observation" as const,
        })),
      );
      if (ranking === "hybrid") {
        setHybridRanker(async (_query, limit) => observations.slice(0, limit).map((observation, i) => ({
          observation, sessionId: observation.sessionId, combinedScore: 1 / (i + 1), layer: "observation" as const,
        })));
      }
      expect(await recall({ limit: 1, targetLayer: "observation" })).toEqual(["obs_valid_0"]);
      expect(sessionReads.length).toBeLessThanOrEqual(10);
      expect(sessionReads).not.toContain("session_10");
    });

    it("recalls an explicitly matching memory when session reads fail", async () => {
      const memory = addMemory({ project: "project-a", sessionIds: ["session_unavailable"] });
      failSessionReads = true;
      expect(await recall()).toEqual([memory.id]);
      expect(sessionReads).toEqual([]);
    });

    it("excludes explicitly scoped memories outside the requested directory", async () => {
      const session = addSession("project-a");
      addMemory({ project: "project-a", sessionIds: [session.id] });
      expect(await recall({ cwd: "/different/project" })).toEqual([]);
      expect(sessionReads).toEqual([session.id]);
    });

    it("still requires session ownership for memories without an explicit project", async () => {
      addMemory({ sessionIds: ["session_unavailable"] });
      failSessionReads = true;
      await expect(recall()).rejects.toThrow("session store unavailable");
      expect(sessionReads).toEqual(["session_unavailable"]);
    });

    it("does not read sessions for agent-only filtering", async () => {
      const memory = addMemory({ project: "project-a", agentId: "agent-a" });
      failSessionReads = true;
      expect(await recall({ project: undefined, agentId: "agent-a" })).toEqual([memory.id]);
      expect(sessionReads).toEqual([]);
    });

    if (ranking === "hybrid") {
      it("preserves accepted hybrid hits when a later refill fails", async () => {
        const matching = addMemory({ id: "mem_vector_only", project: "project-a" });
        for (let i = 0; i < 99; i++) addMemory({ id: `mem_foreign_${i}`, project: "project-b" });
        let calls = 0;
        setHybridRanker(async () => {
          if (++calls > 1) throw new Error("refill unavailable");
          return memories.map((memory, i) => ({
            observation: memoryToObservation(memory), sessionId: "memory", combinedScore: 1 / (i + 1), layer: "memory" as const,
          }));
        });
        const keyword = vi.spyOn(getSearchIndex(), "search").mockReturnValue([]);
        expect(await recall({ limit: 2 })).toEqual([matching.id]);
        expect(calls).toBe(2);
        expect(keyword).not.toHaveBeenCalled();
      });
    }

    it("rejects orphaned observations when a directory filter is requested", async () => {
      const orphan = addMemory({ id: "obs_orphan", sessionIds: ["session_missing"] });
      const observation = memoryToObservation(orphan);
      getSearchIndex().add(observation, "observation");
      put(KV.observations("session_missing"), orphan.id, observation);
      if (ranking === "hybrid") {
        setHybridRanker(async () => [{ observation, sessionId: "session_missing", combinedScore: 1, layer: "observation" }]);
      }
      expect(await recall({ project: undefined, cwd: "/test/project", targetLayer: "all" })).toEqual([]);
    });

    it("preserves sessionless memories when a directory filter is requested", async () => {
      const memory = addMemory({ project: "project-a" });
      expect(await recall({ project: undefined, cwd: "/test/project" })).toEqual([memory.id]);
    });

    it("does not let an unloadable observation consume the result limit", async () => {
      const session = addSession("project-a");
      const matching = addMemory({ id: "mem_matching", project: "project-a" });
      vi.spyOn(getSearchIndex(), "search").mockImplementation((_query, limit) => [
        { obsId: "obs_missing", sessionId: session.id, score: 2, layer: "observation" as const },
        { obsId: matching.id, sessionId: "memory", score: 1, layer: "memory" as const },
      ].slice(0, limit));
      expect(await recall({ limit: 1, targetLayer: "all" })).toEqual([matching.id]);
    });

    it("fills the result limit after excluding an unscoped first candidate", async () => {
      const unscoped = addMemory();
      const matching = addMemory({ id: "mem_matching", project: "project-a" });
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
