import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerReflectFunctions } from "../src/functions/reflect.js";
import { initializeGraphIndex, reconcileGraphIndexRecord } from "../src/state/graph-retrieval-index.js";
import { indexObservationSession } from "../src/state/obs-index.js";
import { KV, fingerprintId } from "../src/state/schema.js";
import type { Insight, GraphNode, GraphEdge, SemanticMemory, Lesson, Crystal } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      if (scope === KV.graphNodes || scope === KV.graphEdges) {
        const row = data as GraphNode | GraphEdge;
        for (const id of row.sourceObservationIds ?? []) {
          await indexObservationSession(kv as never, id, "session");
          await kv.set(KV.observations("session"), id, { id, sessionId: "session", title: "source" });
        }
        await reconcileGraphIndexRecord(kv as never, scope === KV.graphNodes ? "node" : "edge", row.id, row);
      }
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (scope === KV.graphNodes || scope === KV.graphEdges) throw new Error("Unbounded graph read forbidden");
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
  return kv;
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
    sourceObservationIds: [`obs_${name}`],
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
    sourceObservationIds: [`obs_${src}`],
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
<insight confidence="0.85" title="Defense in Depth" sources="F1,F2">
Security requires layered protection: input validation, safe APIs, and deny-lists together.
</insight>
<insight confidence="0.7" title="Testing at Boundaries" sources="F2,F3">
Focus test effort on system boundaries where trust transitions occur.
</insight>
</insights>`;

describe("Reflect", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: { name: string; compress: ReturnType<typeof vi.fn>; summarize: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    await initializeGraphIndex(kv as never, { status: "ready" });
    provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(XML_RESPONSE),
    };
    registerReflectFunctions(sdk as never, kv as never, provider as never);
  });

  describe("mem::reflect", () => {
    async function seedFacts() {
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));
      for (const id of ["sem_a", "sem_b", "sem_c"]) {
        await kv.set("mem:semantic", id, makeSemantic(`security validation evidence ${id}`, id));
      }
    }

    it.each([
      ["missing", ""],
      ["invented", ' sources="F1,F999"'],
      ["repeated", ' sources="F1,F1"'],
      ["wrong type", ' sources="F1,L1"'],
      ["persistent IDs", ' sources="sem_a,sem_b"'],
      ["invalid index", ' sources="F0,F2"'],
    ])("rejects %s evidence references without storing or reinforcing", async (_name, sources) => {
      await seedFacts();
      provider.summarize.mockResolvedValue(`<insights><insight confidence="0.8" title="Unsupported"${sources}>Test validation.</insight></insights>`);
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({
        newInsights: 0, reinforced: 0, rejectedInsights: 1,
      });
      expect(await kv.list("mem:insights")).toEqual([]);
    });

    it("distinguishes malformed model output from a deliberate abstention", async () => {
      await seedFacts();
      provider.summarize.mockResolvedValueOnce("not an insight response");
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ success: false, failedClusters: 1, newInsights: 0 });
      provider.summarize.mockResolvedValueOnce("<insights></insights>");
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ success: true, failedClusters: 0, newInsights: 0 });
    });

    it.each([
      'confidence="NaN" title="Invalid" sources="F1,F2"',
      'confidence="Infinity" title="Invalid" sources="F1,F2"',
      'confidence="1.1" title="Invalid" sources="F1,F2"',
      'confidence="-0.1" title="Invalid" sources="F1,F2"',
      'confidence="0.8" title=" " sources="F1,F2"',
      'confidence="0.8" confidence="0.9" title="Invalid" sources="F1,F2"',
      'confidence="0.8" title="Invalid" sources="F1,F2" sources="F2,F3"',
      'confidence="0.8" title="Invalid" sources="F1,F2" confidence=0.9',
      `meta='sources="F1,F2"' confidence="0.8" title="Invalid"`,
    ])("rejects malformed insight attributes: %s", async (attributes) => {
      await seedFacts();
      provider.summarize.mockResolvedValue(`<insights><insight ${attributes}>Test validation.</insight></insights>`);
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
    });

    it("accepts reordered single-quoted attributes and decodes XML text once", async () => {
      await seedFacts();
      provider.summarize.mockResolvedValue("<insights><insight sources='F1, F2, F1' title='Checks &amp; guards' confidence='0.8'>Reject &lt;unsafe&gt; &amp; retain &amp;lt;literal&amp;gt;.</insight></insights>");
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 1 });
      const [insight] = await kv.list<Insight>("mem:insights");
      expect(insight.title).toBe("Checks & guards");
      expect(insight.content).toBe("Reject <unsafe> & retain &lt;literal&gt;.");
      expect(insight.sourceMemoryIds).toEqual(["sem_a", "sem_b"]);
    });

    it("keeps valid candidates while reporting an unterminated insight", async () => {
      await seedFacts();
      provider.summarize.mockResolvedValue('<insights><insight confidence="0.8" title="Checks" sources="F1,F2">Test validation.</insight><insight confidence="0.8" title="Broken" sources="F2,F3">unterminated');
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 1, rejectedInsights: 1, failedClusters: 1, success: false });
    });

    it("refreshes cited evidence on reinforcement and ignores repeated conclusions within a run", async () => {
      await seedFacts();
      const first = '<insight confidence="0.8" title="Checks" sources="F1,F2">Test validation.</insight>';
      provider.summarize.mockResolvedValueOnce(`<insights>${first}${first}</insights>`);
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 1, reinforced: 0, rejectedInsights: 1 });
      provider.summarize.mockResolvedValueOnce('<insights><insight confidence="0.8" title="Checks" sources="F2,F3">Test validation.</insight></insights>');
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 0, reinforced: 1 });
      const insights = await kv.list<Insight>("mem:insights");
      expect(insights).toHaveLength(1);
      expect(insights[0].sourceMemoryIds).toEqual(["sem_b", "sem_c"]);
      expect(insights[0].reinforcements).toBe(1);
    });

    it.each(["delete", "change"])("rejects evidence that sources %s while the model is running", async (operation) => {
      await seedFacts();
      provider.summarize.mockImplementationOnce(async () => {
        if (operation === "delete") await kv.delete("mem:semantic", "sem_a");
        else await kv.set("mem:semantic", "sem_a", makeSemantic("Unrelated replacement", "sem_a"));
        return '<insights><insight confidence="0.8" title="Stale" sources="F1,F2">Test validation.</insight></insights>';
      });
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 0, rejectedInsights: 1 });
      expect(await kv.list("mem:insights")).toEqual([]);
    });

    it("serializes concurrent creation and reinforcement for the same project conclusion", async () => {
      await seedFacts();
      const get = kv.get.bind(kv);
      kv.get = async <T>(scope: string, id: string): Promise<T | null> => structuredClone(await get<T>(scope, id));
      provider.summarize.mockResolvedValue('<insights><insight confidence="0.8" title="Checks" sources="F1,F2">Test validation.</insight></insights>');
      const results = await Promise.all(Array.from({ length: 5 }, () => sdk.trigger("mem::reflect", { project: "project-a" }))) as Array<{ newInsights: number; reinforced: number }>;
      expect(results.reduce((n, r) => n + r.newInsights, 0)).toBe(1);
      expect(results.reduce((n, r) => n + r.reinforced, 0)).toBe(4);
      const insights = await kv.list<Insight>("mem:insights");
      expect(insights).toHaveLength(1);
      expect(insights[0].reinforcements).toBe(4);
    });

    it("distinguishes equal imported IDs in different evidence collections", async () => {
      await seedFacts();
      await kv.set("mem:lessons", "sem_a", { ...makeLesson("security validation lesson", ["security"]), id: "sem_a" });
      provider.summarize.mockResolvedValue('<insights><insight confidence="0.8" title="Two records" sources="F1,L1">Test validation.</insight></insights>');
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 1 });
      const [insight] = await kv.list<Insight>("mem:insights");
      expect(insight.sourceMemoryIds).toEqual(["sem_a"]);
      expect(insight.sourceLessonIds).toEqual(["sem_a"]);
    });

    it("does not let a stale decay snapshot overwrite newly reinforced evidence", async () => {
      await seedFacts();
      provider.summarize.mockResolvedValueOnce('<insights><insight confidence="0.12" title="Checks" sources="F1,F2">Test validation.</insight></insights>');
      await sdk.trigger("mem::reflect", {});
      const [first] = await kv.list<Insight>("mem:insights");
      first.createdAt = new Date(Date.now() - 21 * 86400000).toISOString();
      first.lastDecayedAt = first.createdAt;
      await kv.set("mem:insights", first.id, first);
      const list = kv.list.bind(kv);
      let release!: () => void;
      let read!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      const readSnapshot = new Promise<void>((resolve) => { read = resolve; });
      let hold = true;
      kv.list = async <T>(scope: string): Promise<T[]> => {
        const snapshot = structuredClone(await list<T>(scope));
        if (scope === "mem:insights" && hold) {
          hold = false;
          read();
          await pending;
        }
        return snapshot;
      };
      const sweep = sdk.trigger("mem::insight-decay-sweep", {});
      await readSnapshot;
      provider.summarize.mockResolvedValueOnce('<insights><insight confidence="0.8" title="Checks" sources="F2,F3">Test validation.</insight></insights>');
      await sdk.trigger("mem::reflect", {});
      release();
      expect(await sweep).toMatchObject({ decayed: 0, softDeleted: 0 });
      const after = await kv.get<Insight>("mem:insights", first.id);
      expect(after).toMatchObject({ reinforcements: 1, sourceMemoryIds: ["sem_b", "sem_c"] });
      expect(after?.deleted).not.toBe(true);
    });

    it("keeps identical generated content independent across projects and global runs", async () => {
      await seedFacts();
      provider.summarize.mockResolvedValue('<insights><insight sources="F1,F2" title="Same conclusion" confidence="0.8">Test validation.</insight></insights>');
      for (const project of ["project-a", "project-b", undefined]) {
        expect(await sdk.trigger("mem::reflect", { project })).toMatchObject({ newInsights: 1, reinforced: 0 });
      }
      const before = await kv.list<Insight>("mem:insights");
      expect(before).toHaveLength(3);
      expect(new Set(before.map((i) => i.id)).size).toBe(3);
      expect(await sdk.trigger("mem::reflect", { project: "project-a" })).toMatchObject({ newInsights: 0, reinforced: 1 });
      const after = await kv.list<Insight>("mem:insights");
      expect(after.find((i) => i.project === "project-b")?.reinforcements).toBe(0);
      expect(after.find((i) => i.project === undefined)?.reinforcements).toBe(0);
    });

    it("preserves a legacy record whose content resembles the new identity payload", async () => {
      await seedFacts();
      const content = '[1,null,"test validation."]';
      const legacy: Insight = {
        id: fingerprintId("ins", content), title: "Legacy claim", content,
        confidence: 0.5, reinforcements: 0, sourceConceptCluster: [],
        sourceMemoryIds: [], sourceLessonIds: [], sourceCrystalIds: [], tags: [],
        createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z", decayRate: 0.05,
      };
      await kv.set("mem:insights", legacy.id, legacy);
      provider.summarize.mockResolvedValue('<insights><insight sources="F1,F2" title="Checks" confidence="0.8">Test validation.</insight></insights>');
      expect(await sdk.trigger("mem::reflect", {})).toMatchObject({ newInsights: 1, reinforced: 0 });
      expect(await kv.get("mem:insights", legacy.id)).toEqual(legacy);
      const insights = await kv.list<Insight>("mem:insights");
      expect(insights).toHaveLength(2);
      expect(insights.find((i) => i.evidenceVersion === 1)?.content).toBe("Test validation.");
    });

    it("stores only the evidence cited by each generated insight", async () => {
      await kv.set("mem:graph:nodes", "node_security", makeConceptNode("security"));
      await kv.set("mem:graph:nodes", "node_validation", makeConceptNode("validation"));
      await kv.set("mem:graph:edges", "edge_1", makeEdge("security", "validation"));
      await kv.set("mem:semantic", "sem_a", makeSemantic("security validation protects inputs", "sem_a"));
      await kv.set("mem:semantic", "sem_b", makeSemantic("security validation checks boundaries", "sem_b"));
      await kv.set("mem:semantic", "sem_unused", makeSemantic("security validation unused evidence", "sem_unused"));
      const lesson = makeLesson("security validation needs runtime tests", ["security"]);
      await kv.set("mem:lessons", lesson.id, lesson);
      const crystal = makeCrystal("runtime security validation succeeded", ["security"]);
      await kv.set("mem:crystals", crystal.id, crystal);
      provider.summarize.mockResolvedValue(`<insights>
        <insight confidence="0.8" title="Boundary tests" sources="F1,L1">Test validation at runtime.</insight>
        <insight confidence="0.7" title="Runtime evidence" sources="F2,C1">Use observed outcomes to refine checks.</insight>
      </insights>`);

      const result = await sdk.trigger("mem::reflect", {});
      expect(result).toMatchObject({ success: true, newInsights: 2, rejectedInsights: 0 });
      const insights = await kv.list<Insight>("mem:insights");
      expect(insights.find((i) => i.title === "Boundary tests")).toMatchObject({
        sourceMemoryIds: ["sem_a"], sourceLessonIds: [lesson.id], sourceCrystalIds: [], evidenceVersion: 1,
      });
      expect(insights.find((i) => i.title === "Runtime evidence")).toMatchObject({
        sourceMemoryIds: ["sem_b"], sourceLessonIds: [], sourceCrystalIds: [crystal.id], evidenceVersion: 1,
      });
      const prompt = provider.summarize.mock.calls[0][1];
      expect(prompt).toContain('"source":"F1"');
      expect(prompt).toContain('"source":"L1"');
      expect(prompt).toContain('"source":"C1"');
    });

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

      await kv.set("mem:semantic", "sem_1", makeSemantic("Always validate security inputs", "sem_1"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("Testing improves security coverage", "sem_2"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("Validation prevents injection attacks", "sem_3"));
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
      await kv.set("mem:semantic", "sem_1", makeSemantic("One sparse fact", "sem_1"));

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
      await kv.set("mem:semantic", "sem_1", makeSemantic("Always validate security inputs", "sem_1"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("Testing improves security coverage", "sem_2"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("Validation prevents injection", "sem_3"));

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

    it("clusters every disconnected concept group instead of stopping at a visited seed", async () => {
      await kv.set("mem:graph:nodes", "node_alpha", makeConceptNode("alpha"));
      await kv.set("mem:graph:nodes", "node_beta", makeConceptNode("beta"));
      await kv.set("mem:graph:nodes", "node_gamma", makeConceptNode("gamma"));
      await kv.set("mem:graph:nodes", "node_delta", makeConceptNode("delta"));
      await kv.set("mem:graph:nodes", "node_epsilon", makeConceptNode("epsilon"));
      await kv.set("mem:graph:edges", "edge_ab", makeEdge("alpha", "beta"));
      await kv.set("mem:graph:edges", "edge_bg", makeEdge("beta", "gamma"));
      await kv.set("mem:graph:edges", "edge_ga", makeEdge("gamma", "alpha"));
      await kv.set("mem:graph:edges", "edge_de", makeEdge("delta", "epsilon"));

      await kv.set("mem:semantic", "sem_a1", makeSemantic("alpha beta gamma pipeline", "sem_a1"));
      await kv.set("mem:semantic", "sem_a2", makeSemantic("alpha caching layer", "sem_a2"));
      await kv.set("mem:semantic", "sem_a3", makeSemantic("beta gamma queue", "sem_a3"));
      await kv.set("mem:semantic", "sem_b1", makeSemantic("delta epsilon storage", "sem_b1"));
      await kv.set("mem:semantic", "sem_b2", makeSemantic("delta epsilon index", "sem_b2"));
      await kv.set("mem:semantic", "sem_b3", makeSemantic("epsilon delta flush", "sem_b3"));
      provider.summarize
        .mockResolvedValueOnce('<insights><insight confidence="0.8" title="Pipeline caching" sources="F1,F2">The alpha pipeline includes a caching layer.</insight></insights>')
        .mockResolvedValueOnce('<insights><insight confidence="0.8" title="Storage indexing" sources="F1,F2">Delta and epsilon provide storage and indexing.</insight></insights>');

      const result = (await sdk.trigger("mem::reflect", {})) as {
        clustersProcessed: number;
        newInsights: number;
      };

      expect(result.clustersProcessed).toBe(2);
      expect(result.newInsights).toBe(2);
      expect(provider.summarize).toHaveBeenCalledTimes(2);
      expect(await kv.list<Insight>("mem:insights")).toMatchObject([
        { title: "Pipeline caching", sourceMemoryIds: ["sem_a1", "sem_a2"] },
        { title: "Storage indexing", sourceMemoryIds: ["sem_b1", "sem_b2"] },
      ]);
    });

    it("stops at the maxClusters bound even when more groups exist", async () => {
      await kv.set("mem:graph:nodes", "node_alpha", makeConceptNode("alpha"));
      await kv.set("mem:graph:nodes", "node_beta", makeConceptNode("beta"));
      await kv.set("mem:graph:nodes", "node_gamma", makeConceptNode("gamma"));
      await kv.set("mem:graph:nodes", "node_delta", makeConceptNode("delta"));
      await kv.set("mem:graph:nodes", "node_epsilon", makeConceptNode("epsilon"));
      await kv.set("mem:graph:edges", "edge_ab", makeEdge("alpha", "beta"));
      await kv.set("mem:graph:edges", "edge_bg", makeEdge("beta", "gamma"));
      await kv.set("mem:graph:edges", "edge_ga", makeEdge("gamma", "alpha"));
      await kv.set("mem:graph:edges", "edge_de", makeEdge("delta", "epsilon"));

      await kv.set("mem:semantic", "sem_a1", makeSemantic("alpha beta gamma pipeline", "sem_a1"));
      await kv.set("mem:semantic", "sem_a2", makeSemantic("alpha caching layer", "sem_a2"));
      await kv.set("mem:semantic", "sem_a3", makeSemantic("beta gamma queue", "sem_a3"));
      await kv.set("mem:semantic", "sem_b1", makeSemantic("delta epsilon storage", "sem_b1"));
      await kv.set("mem:semantic", "sem_b2", makeSemantic("delta epsilon index", "sem_b2"));
      await kv.set("mem:semantic", "sem_b3", makeSemantic("epsilon delta flush", "sem_b3"));
      provider.summarize.mockResolvedValue('<insights><insight confidence="0.8" title="Pipeline caching" sources="F1,F2">The alpha pipeline includes a caching layer.</insight></insights>');

      const result = (await sdk.trigger("mem::reflect", { maxClusters: 1 })) as {
        clustersProcessed: number;
      };

      expect(result.clustersProcessed).toBe(1);
      expect(provider.summarize).toHaveBeenCalledTimes(1);
      expect(await kv.list<Insight>("mem:insights")).toMatchObject([
        { title: "Pipeline caching", sourceMemoryIds: ["sem_a1", "sem_a2"] },
      ]);
    });

    it("falls back to Jaccard grouping when graph is empty", async () => {
      await kv.set("mem:semantic", "sem_1", makeSemantic("security validation is important", "sem_1"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("security testing prevents bugs", "sem_2"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("validation testing framework", "sem_3"));
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
      await kv.set("mem:semantic", "sem_1", makeSemantic("fact about concept_a", "sem_1"));
      await kv.set("mem:semantic", "sem_2", makeSemantic("fact about concept_b", "sem_2"));
      await kv.set("mem:semantic", "sem_3", makeSemantic("concept_a and concept_b together", "sem_3"));

      const result = (await sdk.trigger("mem::reflect", {})) as {
        success: boolean;
        newInsights: number;
      };

      expect(result.success).toBe(false);
      expect(result).toMatchObject({ failedClusters: 1 });
      expect(result.newInsights).toBe(0);
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

describe("bounded reflection graph context", () => {
  async function fixture() {
    const kv = mockKV();
    await initializeGraphIndex(kv as never, { status: "ready" });
    await kv.set(KV.graphNodes, "node_security", makeConceptNode("security"));
    await kv.set(KV.graphNodes, "node_validation", makeConceptNode("validation"));
    await kv.set(KV.graphEdges, "edge", makeEdge("security", "validation"));
    const sdk = mockSdk();
    const summarize = vi.fn(async () => "<insights></insights>");
    registerReflectFunctions(sdk as never, kv as never, { name: "fixture", summarize } as never);
    return { kv, sdk, summarize };
  }

  it("skips unmigrated graph state without enumerating canonical graph scopes", async () => {
    const f = await fixture();
    await f.kv.delete(KV.graphRetrievalControl, "current");
    const list = vi.spyOn(f.kv, "list");
    const result = await f.sdk.trigger("mem::reflect", {});
    expect(result).toMatchObject({ usedFallback: true, graph: { status: "unavailable", nodes: 0, edges: 0 } });
    expect(list.mock.calls.some(([scope]) => scope === KV.graphNodes || scope === KV.graphEdges)).toBe(false);
  });

  it("excludes foreign and forgotten graph provenance before forming project clusters", async () => {
    const f = await fixture();
    await f.kv.set(KV.sessions, "session", { id: "session", project: "private" });
    expect(await f.sdk.trigger("mem::reflect", { project: "public" })).toMatchObject({ graph: { nodes: 0, edges: 0 } });
    expect(await f.sdk.trigger("mem::reflect", { project: "private" })).toMatchObject({ graph: { nodes: 2, edges: 1 } });
    await f.kv.delete(KV.observations("session"), "obs_security");
    expect(await f.sdk.trigger("mem::reflect", { project: "private" })).toMatchObject({ graph: { nodes: 1, edges: 0 } });
  });

  it("reports partial inventory and remains within its point-read budget", async () => {
    const f = await fixture();
    for (let i = 0; i < 100; i++) await f.kv.set(KV.graphNodes, `node_${i}`, makeConceptNode(String(i)));
    const get = vi.spyOn(f.kv, "get");
    const result = await f.sdk.trigger("mem::reflect", {});
    expect(result.graph.truncated).toBe(true);
    expect(result.graph.nodes).toBeLessThanOrEqual(64);
    expect(get.mock.calls.length).toBeLessThanOrEqual(258);
  });

  it("reports incomplete projections even when the inventory fits in one page", async () => {
    const f = await fixture();
    await f.kv.set(KV.graphNodes, "node_security", {
      ...makeConceptNode("security"), properties: { description: "x".repeat(513) },
    });
    expect(await f.sdk.trigger("mem::reflect", {})).toMatchObject({
      graph: { status: "ready", truncated: true, nodes: 2, edges: 1 },
    });
  });
});
