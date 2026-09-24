import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerReflectFunctions } from "../src/functions/reflect.js";
import { buildReflectPrompt } from "../src/prompts/reflect.js";
import { logger } from "../src/logger.js";
import type { Insight, GraphNode, GraphEdge, SemanticMemory, Lesson, Crystal } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

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

function seedGraphSnapshot(
  kv: ReturnType<typeof mockKV>,
  nodes: GraphNode[],
  edges: GraphEdge[],
) {
  return kv.set("mem:graph:snapshot", "current", {
    version: 1,
    topNodes: nodes,
    topEdges: edges,
    topDegrees: {},
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      nodesByType: {},
      edgesByType: {},
    },
    updatedAt: "2026-04-01T00:00:00Z",
    dirty: false,
  });
}

function graphScopeListCalls(listSpy: { mock: { calls: unknown[][] } }) {
  return listSpy.mock.calls.filter(
    ([scope]) => scope === "mem:graph:nodes" || scope === "mem:graph:edges",
  );
}

function makeSemantic(fact: string, id?: string): SemanticMemory {
  return {
    id: id || `sem_${fact.slice(0, 8)}`,
    fact,
    confidence: 0.8,
    sourceSessionIds: [],
    sourceMemoryIds: [],
    accessCount: 1,
    lastAccessedAt: "2026-04-01T00:00:00Z",
    strength: 0.8,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
  };
}

function makeLesson(content: string, tags: string[]): Lesson {
  return {
    id: `lsn_${content.slice(0, 8)}`,
    content,
    context: "",
    confidence: 0.7,
    reinforcements: 0,
    source: "manual",
    sourceIds: [],
    tags,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    decayRate: 0.05,
  };
}

function makeCrystal(narrative: string, lessons: string[]): Crystal {
  return {
    id: `crys_${narrative.slice(0, 8)}`,
    narrative,
    keyOutcomes: [],
    filesAffected: [],
    lessons,
    sourceActionIds: [],
    createdAt: "2026-04-01T00:00:00Z",
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

describe("Reflect", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: { name: string; compress: ReturnType<typeof vi.fn>; summarize: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(XML_RESPONSE),
    };
    registerReflectFunctions(sdk as never, kv as never, provider as never);
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("mem::reflect", () => {
    it("returns empty when no graph nodes or memories exist", async () => {
      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
        clustersProcessed: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBe(0);
      expect(result.clustersProcessed).toBe(0);
    });

    it("synthesizes insights from graph concept clusters", async () => {
      await seedGraphSnapshot(
        kv,
        [makeConceptNode("security"), makeConceptNode("validation"), makeConceptNode("testing")],
        [makeEdge("security", "validation"), makeEdge("security", "testing")],
      );

      await kv.set("mem:semantic", "sem_1", makeSemantic("Always validate security inputs"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("Testing improves security coverage"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("Validation prevents injection attacks"));
      await kv.set("mem:lessons", "lsn_1", makeLesson("Use execFile for security", ["security"]));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBe(2);
      expect(provider.summarize).toHaveBeenCalled();

      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.length).toBe(2);
      expect(insights[0].title).toBeTruthy();
      expect(insights[0].sourceConceptCluster.length).toBeGreaterThan(0);
    });

    it("skips clusters with fewer than 3 supporting items", async () => {
      await seedGraphSnapshot(
        kv,
        [makeConceptNode("sparse"), makeConceptNode("topic")],
        [makeEdge("sparse", "topic")],
      );
      await kv.set("mem:semantic", "sem_1", makeSemantic("One sparse fact"));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        clustersSkipped: number;
        newInsights: number;
      };

      expect(result.clustersSkipped).toBe(1);
      expect(result.newInsights).toBe(0);
      expect(provider.summarize).not.toHaveBeenCalled();
    });

    it("deduplicates insights by fingerprint", async () => {
      await seedGraphSnapshot(
        kv,
        [makeConceptNode("security"), makeConceptNode("validation")],
        [makeEdge("security", "validation")],
      );
      await kv.set("mem:semantic", "sem_1", makeSemantic("Always validate security inputs"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("Testing improves security coverage"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("Validation prevents injection"));

      await sdk.trigger("mem::reflect", {});
      const first = await kv.list<Insight>("mem:insights");
      expect(first.length).toBe(2);

      const result = (await sdk.trigger("mem::reflect", {})) as {
        reinforced: number;
        newInsights: number;
      };

      expect(result.reinforced).toBe(2);
      expect(result.newInsights).toBe(0);

      const after = await kv.list<Insight>("mem:insights");
      expect(after.length).toBe(2);
      expect(after[0].reinforcements).toBe(1);
    });

    it("falls back to Jaccard grouping when graph is empty", async () => {
      await kv.set("mem:semantic", "sem_1", makeSemantic("security validation is important"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("security testing prevents bugs"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("validation testing framework"));
      await kv.set("mem:lessons", "lsn_1", makeLesson("Use security headers", ["security", "validation"]));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        usedFallback: boolean;
      };

      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(true);
    });

    it("logs LLM failures instead of swallowing them", async () => {
      provider.summarize.mockRejectedValue(new Error("LLM timeout"));

      await seedGraphSnapshot(
        kv,
        [makeConceptNode("concept_a"), makeConceptNode("concept_b")],
        [makeEdge("concept_a", "concept_b")],
      );
      await kv.set("mem:semantic", "sem_1", makeSemantic("fact about concept_a"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("fact about concept_b"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("concept_a and concept_b together"));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        "reflect: cluster synthesis failed",
        expect.objectContaining({ error: "LLM timeout" }),
      );
    });

    it("seeds clusters from the graph snapshot without enumerating graph scopes", async () => {
      await seedGraphSnapshot(
        kv,
        [makeConceptNode("security"), makeConceptNode("validation")],
        [makeEdge("security", "validation")],
      );
      await kv.set("mem:semantic", "sem_1", makeSemantic("Always validate security inputs"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("Testing improves security coverage"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("Validation prevents injection"));
      const listSpy = vi.spyOn(kv, "list");

      const result = (await sdk.trigger("mem::reflect", {})) as {
        newInsights: number;
        usedFallback: boolean;
      };

      expect(result.usedFallback).toBe(false);
      expect(result.newInsights).toBe(2);
      expect(graphScopeListCalls(listSpy)).toEqual([]);
    });

    it("uses the Jaccard fallback without enumerating graph scopes when no snapshot exists", async () => {
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));
      await kv.set("mem:semantic", "sem_1", makeSemantic("security validation is important"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("security testing prevents bugs"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("validation testing framework"));
      const listSpy = vi.spyOn(kv, "list");

      const result = (await sdk.trigger("mem::reflect", {})) as {
        usedFallback: boolean;
      };

      expect(result.usedFallback).toBe(true);
      expect(graphScopeListCalls(listSpy)).toEqual([]);
    });

    it("caps the cluster prompt sent to the provider", async () => {
      vi.stubEnv("AGENTMEMORY_REFLECT_PROMPT_CHARS", "4000");
      await seedGraphSnapshot(
        kv,
        [makeConceptNode("security"), makeConceptNode("validation")],
        [makeEdge("security", "validation")],
      );
      for (let i = 0; i < 300; i++) {
        const lesson = makeLesson(`security lesson ${i} ${"detail ".repeat(30)}`, ["security"]);
        await kv.set("mem:lessons", `lsn_${i}`, { ...lesson, id: `lsn_${i}` });
      }

      await sdk.trigger("mem::reflect", {});

      expect(provider.summarize).toHaveBeenCalled();
      for (const [, prompt] of provider.summarize.mock.calls) {
        expect((prompt as string).length).toBeLessThanOrEqual(4000);
      }
    });
  });

  describe("buildReflectPrompt", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const lessons = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        content: `lesson-${i} ${"x".repeat(100)}`,
        confidence: i / count,
      }));

    it("keeps a small cluster intact", () => {
      const prompt = buildReflectPrompt({
        concepts: ["security", "validation"],
        facts: [{ fact: "Validate inputs", confidence: 0.9 }],
        lessons: [{ content: "Use execFile", confidence: 0.7 }],
        crystalNarratives: ["Hardened the shell runner"],
      });

      expect(prompt).toContain("## Concept Cluster: security, validation");
      expect(prompt).toContain("- [confidence=0.9] Validate inputs");
      expect(prompt).toContain("- [confidence=0.7] Use execFile");
      expect(prompt).toContain("- Hardened the shell runner");
    });

    it("bounds a large cluster to the default budget, highest confidence first", () => {
      const prompt = buildReflectPrompt({
        concepts: ["security"],
        facts: [],
        lessons: lessons(500),
        crystalNarratives: [],
      });

      expect(prompt.length).toBeLessThanOrEqual(12000);
      expect(prompt).toContain("lesson-499 ");
      expect(prompt).not.toContain("lesson-0 ");
    });

    it("honors AGENTMEMORY_REFLECT_PROMPT_CHARS with a 2000-char floor", () => {
      vi.stubEnv("AGENTMEMORY_REFLECT_PROMPT_CHARS", "3000");
      const capped = buildReflectPrompt({
        concepts: ["security"],
        facts: [],
        lessons: lessons(500),
        crystalNarratives: [],
      });
      expect(capped.length).toBeLessThanOrEqual(3000);
      expect(capped.length).toBeGreaterThan(2000);

      vi.stubEnv("AGENTMEMORY_REFLECT_PROMPT_CHARS", "10");
      const floored = buildReflectPrompt({
        concepts: ["security"],
        facts: [],
        lessons: lessons(500),
        crystalNarratives: [],
      });
      expect(floored.length).toBeLessThanOrEqual(2000);
      expect(floored).toContain("lesson-499 ");
    });

    it("truncates oversized items so one item cannot consume the budget", () => {
      const prompt = buildReflectPrompt({
        concepts: ["security"],
        facts: [{ fact: "y".repeat(5000), confidence: 0.9 }],
        lessons: [{ content: "Use execFile", confidence: 0.7 }],
        crystalNarratives: [],
      });

      expect(prompt).not.toContain("y".repeat(801));
      expect(prompt).toContain("…");
      expect(prompt).toContain("Use execFile");
    });
  });

  describe("mem::insight-list", () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      await kv.set("mem:insights", "ins_1", {
        id: "ins_1", title: "Insight A", content: "Content A", confidence: 0.9,
        reinforcements: 2, sourceConceptCluster: ["security"], sourceMemoryIds: [],
        sourceLessonIds: [], sourceCrystalIds: [], project: "/app",
        tags: ["security"], createdAt: now, updatedAt: now, decayRate: 0.05,
      });
      await kv.set("mem:insights", "ins_2", {
        id: "ins_2", title: "Insight B", content: "Content B", confidence: 0.4,
        reinforcements: 0, sourceConceptCluster: ["testing"], sourceMemoryIds: [],
        sourceLessonIds: [], sourceCrystalIds: [], project: "/other",
        tags: ["testing"], createdAt: now, updatedAt: now, decayRate: 0.05,
      });
    });

    it("lists all non-deleted insights sorted by confidence", async () => {
      const result = (await sdk.trigger("mem::insight-list", {})) as { insights: Insight[] };
      expect(result.insights.length).toBe(2);
      expect(result.insights[0].confidence).toBe(0.9);
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::insight-list", { project: "/app" })) as { insights: Insight[] };
      expect(result.insights.length).toBe(1);
    });

    it("filters by minConfidence", async () => {
      const result = (await sdk.trigger("mem::insight-list", { minConfidence: 0.5 })) as { insights: Insight[] };
      expect(result.insights.length).toBe(1);
    });
  });

  describe("mem::insight-search", () => {
    beforeEach(async () => {
      const now = new Date().toISOString();
      await kv.set("mem:insights", "ins_1", {
        id: "ins_1", title: "Defense in Depth", content: "Security requires layered protection",
        confidence: 0.85, reinforcements: 1, sourceConceptCluster: ["security"],
        sourceMemoryIds: [], sourceLessonIds: [], sourceCrystalIds: [],
        tags: ["security"], createdAt: now, updatedAt: now, decayRate: 0.05,
      });
    });

    it("finds insights matching query", async () => {
      const result = (await sdk.trigger("mem::insight-search", {
        query: "security layered protection",
      })) as { insights: Array<Insight & { score: number }> };

      expect(result.insights.length).toBe(1);
      expect(result.insights[0].title).toBe("Defense in Depth");
    });

    it("rejects empty query", async () => {
      const result = (await sdk.trigger("mem::insight-search", { query: "" })) as { success: boolean };
      expect(result.success).toBe(false);
    });
  });

  describe("mem::insight-decay-sweep", () => {
    it("decays old insights incrementally", async () => {
      await kv.set("mem:insights", "ins_old", {
        id: "ins_old", title: "Old", content: "Old insight", confidence: 0.8,
        reinforcements: 1, sourceConceptCluster: [], sourceMemoryIds: [],
        sourceLessonIds: [], sourceCrystalIds: [], tags: [],
        createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
        decayRate: 0.05,
      });

      const result = (await sdk.trigger("mem::insight-decay-sweep", {})) as { decayed: number };
      expect(result.decayed).toBe(1);

      const after = await kv.get<Insight>("mem:insights", "ins_old");
      expect(after!.confidence).toBeLessThan(0.8);
      expect(after!.lastDecayedAt).toBeDefined();
    });

    it("soft-deletes low-confidence unreinforced insights", async () => {
      await kv.set("mem:insights", "ins_weak", {
        id: "ins_weak", title: "Weak", content: "Weak insight", confidence: 0.12,
        reinforcements: 0, sourceConceptCluster: [], sourceMemoryIds: [],
        sourceLessonIds: [], sourceCrystalIds: [], tags: [],
        createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
        decayRate: 0.05,
      });

      const result = (await sdk.trigger("mem::insight-decay-sweep", {})) as { softDeleted: number };
      expect(result.softDeleted).toBe(1);

      const after = await kv.get<Insight>("mem:insights", "ins_weak");
      expect(after!.deleted).toBe(true);
    });
  });
});
