import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  registerReflectFunctions,
  INSIGHT_MAX_SOURCE_IDS,
  MAX_CONCEPTS_PER_CLUSTER,
  MAX_CLUSTER_FACTS,
  MAX_CLUSTER_LESSONS,
  MAX_CLUSTER_CRYSTALS,
  buildGraphClusters,
  buildJaccardClusters,
} from "../src/functions/reflect.js";
import { buildReflectPrompt, MAX_REFLECT_PROMPT_CHARS } from "../src/prompts/reflect.js";
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
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:nodes", "node_testing", makeConceptNode("testing"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));
      await kv.set("mem:graph:edges", "edge_2", makeEdge("security", "testing"));

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
      await kv.set("mem:graph:nodes", "node_sparse", makeConceptNode("sparse"));
      await kv.set("mem:graph:nodes", "node_topic", makeConceptNode("topic"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("sparse", "topic"));
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
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));
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

    it("handles LLM failure gracefully", async () => {
      provider.summarize.mockRejectedValue(new Error("LLM timeout"));

      await kv.set("mem:graph:nodes", "node_a", makeConceptNode("concept_a"));
      await kv.set("mem:graph:nodes", "node_b", makeConceptNode("concept_b"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("concept_a", "concept_b"));
      await kv.set("mem:semantic", "sem_1", makeSemantic("fact about concept_a"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("fact about concept_b"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("concept_a and concept_b together"));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBe(0);
    });

    it("isolates facts, lessons, and crystals by project when project option is passed", async () => {
      await kv.set("mem:sessions", "ses_alpha", {
        id: "ses_alpha",
        project: "proj-alpha",
        cwd: "/alpha",
        startedAt: new Date().toISOString(),
        status: "completed",
        observationCount: 5,
      });
      await kv.set("mem:sessions", "ses_beta", {
        id: "ses_beta",
        project: "proj-beta",
        cwd: "/beta",
        startedAt: new Date().toISOString(),
        status: "completed",
        observationCount: 5,
      });

      await kv.set("mem:graph:nodes", "node_alpha_sec", makeConceptNode("alpha_sec"));
      await kv.set("mem:graph:nodes", "node_alpha_val", makeConceptNode("alpha_val"));
      await kv.set("mem:graph:edges", "edge_alpha", makeEdge("alpha_sec", "alpha_val"));

      await kv.set("mem:graph:nodes", "node_beta_auth", makeConceptNode("beta_auth"));
      await kv.set("mem:graph:nodes", "node_beta_crypto", makeConceptNode("beta_crypto"));
      await kv.set("mem:graph:edges", "edge_beta", makeEdge("beta_auth", "beta_crypto"));

      await kv.set("mem:semantic", "sem_alpha_1", {
        ...makeSemantic("alpha_sec and alpha_val are critical"),
        id: "sem_alpha_1",
        sourceSessionIds: ["ses_alpha"],
      });
      await kv.set("mem:semantic", "sem_alpha_2", {
        ...makeSemantic("alpha_sec rules require strict enforcement"),
        id: "sem_alpha_2",
        sourceSessionIds: ["ses_alpha"],
      });
      await kv.set("mem:lessons", "lsn_alpha_1", {
        ...makeLesson("alpha_sec lesson for validation", ["alpha_sec"]),
        id: "lsn_alpha_1",
        project: "proj-alpha",
      });
      await kv.set("mem:crystals", "crys_alpha_1", {
        ...makeCrystal("alpha crystal completed", ["alpha_sec rule"]),
        id: "crys_alpha_1",
        project: "proj-alpha",
      });

      await kv.set("mem:semantic", "sem_beta_1", {
        ...makeSemantic("beta_auth and beta_crypto are used for encryption"),
        id: "sem_beta_1",
        sourceSessionIds: ["ses_beta"],
      });
      await kv.set("mem:lessons", "lsn_beta_1", {
        ...makeLesson("beta_auth lesson for crypto", ["beta_auth"]),
        id: "lsn_beta_1",
        project: "proj-beta",
      });
      await kv.set("mem:crystals", "crys_beta_1", {
        ...makeCrystal("beta crystal completed", ["beta_auth encryption"]),
        id: "crys_beta_1",
        project: "proj-beta",
      });

      const result = (await sdk.trigger("mem::reflect", {
        project: "proj-alpha",
      })) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBeGreaterThan(0);

      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.length).toBeGreaterThan(0);
      for (const ins of insights) {
        expect(ins.project).toBe("proj-alpha");
        expect(ins.sourceMemoryIds).not.toContain("sem_beta_1");
        expect(ins.sourceLessonIds).not.toContain("lsn_beta_1");
        expect(ins.sourceCrystalIds).not.toContain("crys_beta_1");
        expect(ins.sourceConceptCluster).not.toContain("beta_auth");
        expect(ins.sourceConceptCluster).not.toContain("beta_crypto");
      }
    });

    it("bounds cluster items and caps source IDs with MAX_CLUSTER_FACTS, MAX_CLUSTER_LESSONS, MAX_CLUSTER_CRYSTALS", async () => {
      expect(INSIGHT_MAX_SOURCE_IDS).toBe(20);
      expect(MAX_CLUSTER_FACTS).toBe(10);
      expect(MAX_CLUSTER_LESSONS).toBe(10);
      expect(MAX_CLUSTER_CRYSTALS).toBe(5);

      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));

      for (let i = 0; i < 25; i++) {
        const pad = i.toString().padStart(2, "0");
        await kv.set(
          "mem:semantic",
          `sem_${pad}`,
          makeSemantic(`security fact ${pad}`, `sem_${pad}`),
        );
        await kv.set(
          "mem:lessons",
          `lsn_${pad}`,
          {
            ...makeLesson(`security lesson ${pad}`, ["security"]),
            id: `lsn_${pad}`,
          },
        );
        await kv.set(
          "mem:crystals",
          `crys_${pad}`,
          {
            ...makeCrystal(`crystal narrative ${pad}`, [`security topic ${pad}`]),
            id: `crys_${pad}`,
          },
        );
      }

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(true);
      expect(result.newInsights).toBeGreaterThan(0);

      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.length).toBeGreaterThan(0);
      for (const ins of insights) {
        expect(ins.sourceMemoryIds.length).toBe(MAX_CLUSTER_FACTS);
        expect(ins.sourceLessonIds.length).toBe(MAX_CLUSTER_LESSONS);
        expect(ins.sourceCrystalIds.length).toBe(MAX_CLUSTER_CRYSTALS);
      }
    });

    it("sorts facts and lessons by confidence descending when bounding", async () => {
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));

      for (let i = 0; i < 15; i++) {
        const pad = i.toString().padStart(2, "0");
        await kv.set(
          "mem:semantic",
          `sem_${pad}`,
          {
            ...makeSemantic(`security fact ${pad}`, `sem_${pad}`),
            confidence: 0.1 + i * 0.05,
          },
        );
        await kv.set(
          "mem:lessons",
          `lsn_${pad}`,
          {
            ...makeLesson(`security lesson ${pad}`, ["security"]),
            id: `lsn_${pad}`,
            confidence: 0.1 + i * 0.05,
          },
        );
      }

      await sdk.trigger("mem::reflect", {});

      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.length).toBeGreaterThan(0);
      const ins = insights[0];
      expect(ins.sourceMemoryIds.length).toBe(MAX_CLUSTER_FACTS);
      expect(ins.sourceMemoryIds).toContain("sem_14");
      expect(ins.sourceMemoryIds).toContain("sem_13");
      expect(ins.sourceMemoryIds).not.toContain("sem_00");
      expect(ins.sourceMemoryIds).not.toContain("sem_01");

      expect(ins.sourceLessonIds.length).toBe(MAX_CLUSTER_LESSONS);
      expect(ins.sourceLessonIds).toContain("lsn_14");
      expect(ins.sourceLessonIds).toContain("lsn_13");
      expect(ins.sourceLessonIds).not.toContain("lsn_00");
      expect(ins.sourceLessonIds).not.toContain("lsn_01");
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

  describe("buildGraphClusters (Issue #1133 / PR #1243)", () => {
    it("discovers disconnected concept clusters via continue on visited seeds", () => {
      const nodes: GraphNode[] = [
        makeConceptNode("alpha"),
        makeConceptNode("beta"),
        makeConceptNode("gamma"),
        makeConceptNode("delta"),
      ];
      const edges: GraphEdge[] = [
        makeEdge("alpha", "beta"),
        makeEdge("gamma", "delta"),
      ];

      const clusters = buildGraphClusters(nodes, edges, 10);
      expect(clusters.length).toBe(2);
      expect(clusters[0]).toEqual(expect.arrayContaining(["alpha", "beta"]));
      expect(clusters[1]).toEqual(expect.arrayContaining(["gamma", "delta"]));
    });

    it("respects maxClusters limit across disconnected components", () => {
      const nodes: GraphNode[] = [
        makeConceptNode("c1_a"),
        makeConceptNode("c1_b"),
        makeConceptNode("c2_a"),
        makeConceptNode("c2_b"),
        makeConceptNode("c3_a"),
        makeConceptNode("c3_b"),
      ];
      const edges: GraphEdge[] = [
        makeEdge("c1_a", "c1_b"),
        makeEdge("c2_a", "c2_b"),
        makeEdge("c3_a", "c3_b"),
      ];

      const clusters = buildGraphClusters(nodes, edges, 2);
      expect(clusters.length).toBe(2);
    });

    it("caps cluster size at MAX_CONCEPTS_PER_CLUSTER", () => {
      const hub = makeConceptNode("hub");
      const nodes: GraphNode[] = [hub];
      const edges: GraphEdge[] = [];

      for (let i = 0; i < 25; i++) {
        const leaf = makeConceptNode(`leaf_${i}`);
        nodes.push(leaf);
        edges.push({
          id: `edge_hub_leaf_${i}`,
          type: "related_to",
          sourceNodeId: hub.id,
          targetNodeId: leaf.id,
          weight: 1,
          sourceObservationIds: [],
          createdAt: "2026-04-01T00:00:00Z",
        });
      }

      const clusters = buildGraphClusters(nodes, edges, 5);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters[0].length).toBe(MAX_CONCEPTS_PER_CLUSTER);
      expect(clusters[0].length).toBe(15);
    });
  });

  describe("buildJaccardClusters", () => {
    it("uses continue on visited concepts and discovers multiple clusters", () => {
      const memories: SemanticMemory[] = [
        makeSemantic("database migration replication performance indexing"),
        makeSemantic("database migration replication failover clustering"),
        makeSemantic("frontend styling components responsive layout"),
        makeSemantic("frontend styling components hydration render"),
      ];
      const lessons: Lesson[] = [
        makeLesson("database replication requires careful monitoring", ["database", "replication"]),
        makeLesson("frontend layout should be responsive", ["frontend", "styling"]),
      ];

      const clusters = buildJaccardClusters(memories, lessons, 10);
      expect(clusters.length).toBeGreaterThanOrEqual(2);
    });

    it("caps cluster size at MAX_CONCEPTS_PER_CLUSTER", () => {
      const tags = Array.from({ length: 30 }, (_, i) => `concept_tag_${i}`);
      const lessons: Lesson[] = [
        { ...makeLesson("lesson one", tags), id: "lsn_1" },
        { ...makeLesson("lesson two", tags), id: "lsn_2" },
      ];

      const clusters = buildJaccardClusters([], lessons, 5);
      expect(clusters.length).toBeGreaterThan(0);
      for (const cluster of clusters) {
        expect(cluster.length).toBeLessThanOrEqual(MAX_CONCEPTS_PER_CLUSTER);
      }
      expect(clusters[0].length).toBe(MAX_CONCEPTS_PER_CLUSTER);
      expect(clusters[0].length).toBe(15);
    });

    it("respects maxClusters limit", () => {
      const lessons: Lesson[] = [
        makeLesson("l1", ["alpha_one", "alpha_two"]),
        makeLesson("l1b", ["alpha_one", "alpha_two"]),
        makeLesson("l2", ["beta_one", "beta_two"]),
        makeLesson("l2b", ["beta_one", "beta_two"]),
        makeLesson("l3", ["gamma_one", "gamma_two"]),
        makeLesson("l3b", ["gamma_one", "gamma_two"]),
      ];

      const clusters = buildJaccardClusters([], lessons, 2);
      expect(clusters.length).toBeLessThanOrEqual(2);
    });
  });

  describe("buildReflectPrompt & MAX_REFLECT_PROMPT_CHARS", () => {
    it("returns prompt as-is when under MAX_REFLECT_PROMPT_CHARS", () => {
      const cluster = {
        concepts: ["security", "auth"],
        facts: [{ fact: "JWT tokens must be validated", confidence: 0.9 }],
        lessons: [{ content: "Never log auth tokens", confidence: 0.8 }],
        crystalNarratives: ["Implemented auth flow"],
      };

      const prompt = buildReflectPrompt(cluster);
      expect(prompt.length).toBeLessThan(MAX_REFLECT_PROMPT_CHARS);
      expect(prompt).toContain("## Concept Cluster: security, auth");
      expect(prompt).toContain("JWT tokens must be validated");
      expect(prompt).not.toContain("[... truncated due to size limit]");
    });

    it("truncates prompt cleanly when exceeding MAX_REFLECT_PROMPT_CHARS", () => {
      const giantFact = "a".repeat(15000);
      const cluster = {
        concepts: ["scalability"],
        facts: [{ fact: giantFact, confidence: 0.9 }],
        lessons: [],
        crystalNarratives: [],
      };

      const prompt = buildReflectPrompt(cluster);
      expect(prompt.length).toBe(MAX_REFLECT_PROMPT_CHARS);
      expect(prompt).toContain("## Concept Cluster: scalability");
      expect(prompt.endsWith("\n\n[... truncated due to size limit]")).toBe(true);
    });
  });
});
