import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/audit.js", () => ({
  recordAudit: vi.fn(),
}));

import { registerConsolidateFunction, healLegacyProjects } from "../src/functions/consolidate.js";
import { registerReflectFunctions } from "../src/functions/reflect.js";
import type {
  GraphEdge,
  GraphNode,
  Insight,
  Lesson,
  Memory,
  SemanticMemory,
  Session,
} from "../src/types.js";

const CANONICAL = "github.com-myorg-monolith";
const LEGACY = "Monolith";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    fns,
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

function makeSession(
  id: string,
  project: string,
  extra?: Partial<Session>,
): Session {
  return {
    id,
    project,
    cwd: `/work/${project}`,
    startedAt: "2026-08-01T10:00:00.000Z",
    status: "active",
    observationCount: 0,
    ...extra,
  };
}

function makeMemory(id: string, project?: string): Memory {
  return {
    id,
    createdAt: "2026-08-01T11:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    type: "architecture",
    title: `memory ${id}`,
    content: `content of ${id}`,
    concepts: ["architecture"],
    files: [],
    sessionIds: [],
    strength: 5,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

function makeLesson(id: string, project: string | undefined, tags: string[]): Lesson {
  return {
    id,
    content: `lesson ${id}`,
    context: "test",
    confidence: 0.7,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    tags,
    createdAt: "2026-08-01T11:00:00.000Z",
    updatedAt: "2026-08-01T11:00:00.000Z",
    decayRate: 0.05,
    ...(project !== undefined && { project }),
  };
}

const XML_RESPONSE = `<insights>
<insight confidence="0.85" title="Defense in Depth">
Security requires layered protection: input validation, safe APIs, and deny-lists together.
</insight>
<insight confidence="0.7" title="Testing at Boundaries">
Focus test effort on system boundaries where trust transitions occur.
</insight>
</insights>`;

describe("Gradual Self-Healing Consolidation (ticket: self-healing consolidation)", () => {
  describe("healLegacyProjects", () => {
    it("re-tags legacy memories and lessons to the canonical project key and returns counts", async () => {
      const kv = mockKV();
      await kv.set("mem:sessions", "ses_canonical", {
        ...makeSession("ses_canonical", CANONICAL),
        projectDisplayName: LEGACY,
      });
      await kv.set("mem:sessions", "ses_legacy", makeSession("ses_legacy", LEGACY));
      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));
      await kv.set("mem:memories", "mem_2", makeMemory("mem_2", LEGACY));
      await kv.set("mem:memories", "mem_other", makeMemory("mem_other", "OtherProject"));
      await kv.set("mem:lessons", "lsn_1", makeLesson("lsn_1", LEGACY, ["auth"]));
      await kv.set("mem:lessons", "lsn_2", makeLesson("lsn_2", LEGACY, ["db"]));

      const result = await healLegacyProjects(kv as never, CANONICAL);

      expect(result).toEqual({
        healedMemories: 2,
        healedLessons: 2,
        healedSessions: 1,
      });

      const memories = await kv.list<Memory>("mem:memories");
      for (const m of memories) {
        if (m.id === "mem_other") {
          expect(m.project).toBe("OtherProject");
        } else {
          expect(m.project).toBe(CANONICAL);
        }
      }
      const lessons = await kv.list<Lesson>("mem:lessons");
      for (const l of lessons) {
        expect(l.project).toBe(CANONICAL);
      }
      const legacySession = await kv.get<Session>("mem:sessions", "ses_legacy");
      expect(legacySession?.project).toBe(CANONICAL);
      const canonicalSession = await kv.get<Session>("mem:sessions", "ses_canonical");
      expect(canonicalSession?.project).toBe(CANONICAL);
      expect(canonicalSession?.projectDisplayName).toBe(LEGACY);
    });

    it("is a no-op on the second run (idempotent)", async () => {
      const kv = mockKV();
      await kv.set("mem:sessions", "ses_canonical", {
        ...makeSession("ses_canonical", CANONICAL),
        projectDisplayName: LEGACY,
      });
      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));

      const first = await healLegacyProjects(kv as never, CANONICAL);
      expect(first.healedMemories).toBe(1);

      const second = await healLegacyProjects(kv as never, CANONICAL);
      expect(second).toEqual({
        healedMemories: 0,
        healedLessons: 0,
        healedSessions: 0,
      });

      const memory = await kv.get<Memory>("mem:memories", "mem_1");
      expect(memory?.project).toBe(CANONICAL);
    });

    it("returns zeros when no legacy names can be resolved (fresh install guard rail)", async () => {
      const kv = mockKV();
      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));

      const result = await healLegacyProjects(kv as never, CANONICAL);

      expect(result).toEqual({
        healedMemories: 0,
        healedLessons: 0,
        healedSessions: 0,
      });
      const memory = await kv.get<Memory>("mem:memories", "mem_1");
      expect(memory?.project).toBe(LEGACY);
    });
  });

  describe("mem::consolidate wiring", () => {
    it("heals legacy records when consolidating the canonical project", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerConsolidateFunction(
        sdk as never,
        kv as never,
        { name: "mock", compress: vi.fn() } as never,
      );

      await kv.set("mem:sessions", "ses_canonical", {
        ...makeSession("ses_canonical", CANONICAL),
        projectDisplayName: LEGACY,
      });
      await kv.set("mem:sessions", "ses_legacy", makeSession("ses_legacy", LEGACY));
      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));
      await kv.set("mem:memories", "mem_2", makeMemory("mem_2", LEGACY));
      await kv.set("mem:lessons", "lsn_1", makeLesson("lsn_1", LEGACY, ["auth"]));
      await kv.set("mem:lessons", "lsn_2", makeLesson("lsn_2", LEGACY, ["db"]));

      const result = (await sdk.trigger("mem::consolidate", {
        project: CANONICAL,
        minObservations: 0,
      })) as {
        consolidated: number;
        totalObservations: number;
        healed?: { healedMemories: number; healedLessons: number; healedSessions: number };
      };

      expect(result.healed).toEqual({
        healedMemories: 2,
        healedLessons: 2,
        healedSessions: 1,
      });

      const memories = await kv.list<Memory>("mem:memories");
      for (const m of memories) {
        expect(m.project).toBe(CANONICAL);
      }
      const lessons = await kv.list<Lesson>("mem:lessons");
      for (const l of lessons) {
        expect(l.project).toBe(CANONICAL);
      }
    });

    it("heals nothing on a repeated consolidation run (idempotency)", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerConsolidateFunction(
        sdk as never,
        kv as never,
        { name: "mock", compress: vi.fn() } as never,
      );

      await kv.set("mem:sessions", "ses_canonical", {
        ...makeSession("ses_canonical", CANONICAL),
        projectDisplayName: LEGACY,
      });
      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));

      const first = (await sdk.trigger("mem::consolidate", {
        project: CANONICAL,
        minObservations: 0,
      })) as { healed?: { healedMemories: number } };
      expect(first.healed?.healedMemories).toBe(1);

      const second = (await sdk.trigger("mem::consolidate", {
        project: CANONICAL,
        minObservations: 0,
      })) as { healed?: { healedMemories: number; healedLessons: number; healedSessions: number } };
      expect(second.healed).toEqual({
        healedMemories: 0,
        healedLessons: 0,
        healedSessions: 0,
      });

      const memory = await kv.get<Memory>("mem:memories", "mem_1");
      expect(memory?.project).toBe(CANONICAL);
    });

    it("fresh install: consolidation output is unchanged when run without a project", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerConsolidateFunction(
        sdk as never,
        kv as never,
        { name: "mock", compress: vi.fn() } as never,
      );

      const result = (await sdk.trigger("mem::consolidate", {})) as Record<string, unknown>;

      expect(result).toEqual({ consolidated: 0, reason: "insufficient_observations" });
      expect(result["healed"]).toBeUndefined();
    });

    it("fresh install: project-scoped run heals zero records without error", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerConsolidateFunction(
        sdk as never,
        kv as never,
        { name: "mock", compress: vi.fn() } as never,
      );

      const result = (await sdk.trigger("mem::consolidate", {
        project: CANONICAL,
      })) as {
        consolidated: number;
        reason?: string;
        healed: { healedMemories: number; healedLessons: number; healedSessions: number };
      };

      expect(result.consolidated).toBe(0);
      expect(result.reason).toBe("insufficient_observations");
      expect(result.healed).toEqual({
        healedMemories: 0,
        healedLessons: 0,
        healedSessions: 0,
      });
    });

    it("heals via explicit project_display_name payload without session probing", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerConsolidateFunction(
        sdk as never,
        kv as never,
        { name: "mock", compress: vi.fn() } as never,
      );

      await kv.set("mem:memories", "mem_1", makeMemory("mem_1", LEGACY));
      await kv.set("mem:memories", "mem_2", makeMemory("mem_2", LEGACY));
      await kv.set("mem:lessons", "lsn_1", makeLesson("lsn_1", LEGACY, ["auth"]));

      const result = (await sdk.trigger("mem::consolidate", {
        project: CANONICAL,
        project_display_name: LEGACY,
        minObservations: 0,
      })) as { healed?: { healedMemories: number; healedLessons: number } };

      expect(result.healed).toEqual({ healedMemories: 2, healedLessons: 1, healedSessions: 0 });

      const memories = await kv.list<Memory>("mem:memories");
      for (const m of memories) {
        expect(m.project).toBe(CANONICAL);
      }
      const lessons = await kv.list<Lesson>("mem:lessons");
      for (const l of lessons) {
        expect(l.project).toBe(CANONICAL);
      }
    });
  });

  describe("mem::reflect wiring", () => {
    function makeConceptNode(name: string): GraphNode {
      return {
        id: `node_${name}`,
        type: "concept",
        name,
        properties: {},
        sourceObservationIds: [],
        createdAt: "2026-04-01T00:00:00Z",
      };
    }

    function makeEdge(src: string, tgt: string): GraphEdge {
      return {
        id: `edge_${src}_${tgt}`,
        type: "related_to",
        sourceNodeId: `node_${src}`,
        targetNodeId: `node_${tgt}`,
        weight: 1,
        sourceObservationIds: [],
        createdAt: "2026-04-01T00:00:00Z",
      };
    }

    function makeSemantic(fact: string, id: string, sessionIds: string[]): SemanticMemory {
      return {
        id,
        fact,
        confidence: 0.8,
        sourceSessionIds: sessionIds,
        sourceMemoryIds: [],
        accessCount: 1,
        lastAccessedAt: "2026-04-01T00:00:00Z",
        strength: 0.8,
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
      };
    }

    it("clusters legacy-project lessons and tags synthesized insights with the canonical key", async () => {
      const sdk = mockSdk();
      const kv = mockKV();
      const provider = {
        name: "mock",
        compress: vi.fn(),
        summarize: vi.fn().mockResolvedValue(XML_RESPONSE),
      };
      registerReflectFunctions(sdk as never, kv as never, provider as never);

      await kv.set("mem:sessions", "ses_canonical", {
        ...makeSession("ses_canonical", CANONICAL),
        projectDisplayName: LEGACY,
      });

      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));

      await kv.set("mem:semantic", "sem_1", makeSemantic(
        "Always validate security inputs", "sem_1", ["ses_canonical"],
      ));
      await kv.set("mem:semantic", "sem_2", makeSemantic(
        "Testing improves security coverage", "sem_2", ["ses_canonical"],
      ));
      await kv.set("mem:semantic", "sem_3", makeSemantic(
        "Validation prevents injection attacks", "sem_3", ["ses_canonical"],
      ));

      // Legacy lesson living under the old display name must still be clustered
      await kv.set("mem:lessons", "lsn_legacy", makeLesson(
        "lsn_legacy", LEGACY, ["security"],
      ));
      // Control: lesson from an unrelated project must be excluded
      await kv.set("mem:lessons", "lsn_other", makeLesson(
        "lsn_other", "OtherProject", ["beta_auth"],
      ));

      const result = (await sdk.trigger("mem::reflect", {
        project: CANONICAL,
      })) as { success: boolean; newInsights: number };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBe(2);

      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.length).toBe(2);
      for (const ins of insights) {
        expect(ins.project).toBe(CANONICAL);
        expect(ins.sourceLessonIds).toContain("lsn_legacy");
        expect(ins.sourceLessonIds).not.toContain("lsn_other");
      }
    });
  });
});
