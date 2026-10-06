import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  GRAPH_COMPACT_BOOT_KEY,
  GRAPH_COMPACT_BOOT_VERSION,
  describeGraphCompactBoot,
  getGraphCompactBootStatus,
  resetGraphCompactBootStatus,
  runGraphCompactOnBoot,
  setGraphCompactBootDisabled,
  type GraphCompactBootProgress,
} from "../src/functions/graph-compact-boot.js";
import { MAX_GRAPH_SOURCE_OBSERVATIONS, compactGraphProvenance } from "../src/functions/graph.js";
import { isGraphCompactOnBootEnabled } from "../src/config.js";
import { evaluateStatus, renderStatusHtml, type StatusInputs } from "../src/functions/status.js";
import type { GraphEdge, GraphNode } from "../src/types.js";

const NODES = "mem:graph:nodes";
const EDGES = "mem:graph:edges";
const HISTORY = "mem:graph:edge-history";
const CONFIG = "mem:config";

function mockKV(opts: { shuffle?: boolean; store?: Map<string, Map<string, unknown>> } = {}) {
  const store = opts.store ?? new Map<string, Map<string, unknown>>();
  const calls = { list: [] as string[], get: [] as string[], set: [] as string[] };
  const kv = {
    calls,
    store,
    failGet: null as ((scope: string, key: string) => boolean) | null,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      calls.get.push(`${scope}/${key}`);
      if (kv.failGet?.(scope, key)) throw new Error("state::get timed out");
      const v = store.get(scope)?.get(key);
      return (v === undefined ? null : structuredClone(v)) as T | null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      calls.set.push(`${scope}/${key}`);
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(data));
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      calls.list.push(scope);
      const values = Array.from(store.get(scope)?.values() ?? []).map((v) => structuredClone(v));
      if (opts.shuffle) {
        for (let i = values.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [values[i], values[j]] = [values[j], values[i]];
        }
      }
      return values as T[];
    },
  };
  return kv;
}
type KV = ReturnType<typeof mockKV>;

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}_${i}`);

async function seed(kv: KV, nodes: number, edges: number, history: number, bloat = 100) {
  for (let i = 0; i < nodes; i++) {
    const id = `gn_${String(i).padStart(4, "0")}`;
    const n: GraphNode = {
      id,
      type: "concept",
      name: `n${i}`,
      properties: {},
      sourceObservationIds: ids(`obs${i}`, i % 2 === 0 ? bloat : 3),
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    await kv.set(NODES, id, n);
    await kv.set("mem:graph:name-index", `concept|n${i}`, id);
  }
  for (let i = 0; i < edges; i++) {
    const id = `ge_${String(i).padStart(4, "0")}`;
    const e: GraphEdge = {
      id,
      type: "related_to",
      sourceNodeId: "gn_0000",
      targetNodeId: `gn_${i}`,
      weight: 0.5,
      sourceObservationIds: ids(`eobs${i}`, bloat),
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    await kv.set(EDGES, id, e);
    await kv.set("mem:graph:edge-key", `gn_0000|gn_${i}|related_to`, id);
  }
  for (let i = 0; i < history; i++) {
    const id = `ge_h${String(i).padStart(4, "0")}`;
    await kv.set(HISTORY, id, {
      id,
      type: "uses",
      sourceNodeId: "gn_0000",
      targetNodeId: "gn_0001",
      weight: 0.5,
      sourceObservationIds: ids(`hobs${i}`, bloat),
      createdAt: "2026-09-01T00:00:00.000Z",
      isLatest: false,
    });
  }
  await kv.set("mem:graph:snapshot", "current", {
    version: 1,
    dirty: false,
    topNodes: [await kv.get(NODES, "gn_0000")],
    topEdges: [],
    topDegrees: {},
    stats: { totalNodes: nodes, totalEdges: edges, nodesByType: {}, edgesByType: {} },
    updatedAt: "2026-09-01T00:00:00.000Z",
  });
}

async function maxIds(kv: KV): Promise<number> {
  let max = 0;
  for (const scope of [NODES, EDGES, HISTORY]) {
    for (const r of await kv.list<{ sourceObservationIds: string[] }>(scope)) {
      max = Math.max(max, r.sourceObservationIds.length);
    }
  }
  const snap = (await kv.get<{ topNodes: GraphNode[] }>("mem:graph:snapshot", "current"))!;
  for (const n of snap.topNodes) max = Math.max(max, n.sourceObservationIds.length);
  return max;
}

const fast = { sliceSize: 3, pauseMs: 0, retryDelayMs: 0, sleep: async () => {} };
const marker = (kv: KV) => kv.get<GraphCompactBootProgress>(CONFIG, GRAPH_COMPACT_BOOT_KEY);

beforeEach(() => resetGraphCompactBootStatus());
afterEach(() => vi.unstubAllEnvs());

describe("graph compaction on boot", () => {
  it("trims nodes, edges, edge history and the snapshot to the cap and marks it done", async () => {
    const kv = mockKV();
    await seed(kv, 10, 7, 5);
    const log = vi.fn();
    const s = await runGraphCompactOnBoot(kv as never, { ...fast, log });
    const listed = [...kv.calls.list];
    expect(s.state).toBe("done");
    expect(await maxIds(kv)).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
    expect(s.trimmed).toBe(5 + 7 + 5 + 1);
    expect(s.idsRemoved).toBe(17 * (100 - MAX_GRAPH_SOURCE_OBSERVATIONS));
    const m = (await marker(kv))!;
    expect(m).toMatchObject({ status: "done", version: GRAPH_COMPACT_BOOT_VERSION, cap: MAX_GRAPH_SOURCE_OBSERVATIONS });
    expect(log.mock.calls.map((c) => c[0]).at(-1)).toMatch(/done \(22 records checked, 18 trimmed/);
    expect(listed).not.toContain(NODES);
    expect(listed).not.toContain(EDGES);
  });

  it("finishes fast on a store with nothing over the cap", async () => {
    const kv = mockKV();
    await seed(kv, 4, 2, 1, 10);
    kv.calls.set.length = 0;
    const s = await runGraphCompactOnBoot(kv as never, fast);
    expect(s).toMatchObject({ state: "done", trimmed: 0, idsRemoved: 0 });
    expect(kv.calls.set.filter((c) => !c.startsWith(CONFIG))).toEqual([]);
  });

  it("resumes from the saved offset after the process dies mid-run", async () => {
    const kv = mockKV();
    await seed(kv, 12, 6, 0);
    kv.calls.get.length = 0;
    let pauses = 0;
    const hang = new Promise<void>(() => {});
    void runGraphCompactOnBoot(kv as never, {
      ...fast,
      pauseMs: 1,
      sleep: async () => {
        if (++pauses === 2) await hang;
      },
    });
    await vi.waitFor(async () => expect((await marker(kv))?.offset).toBe(6));
    const saved = (await marker(kv))!;
    expect(saved).toMatchObject({ status: "running", phase: "nodes", offset: 6 });
    const nodeReadsBefore = kv.calls.get.filter((c) => c.startsWith(`${NODES}/`)).length;
    expect(nodeReadsBefore).toBe(12);

    resetGraphCompactBootStatus();
    kv.calls.get.length = 0;
    const log = vi.fn();
    const s = await runGraphCompactOnBoot(kv as never, { ...fast, log });
    expect(log.mock.calls[0]![0]).toMatch(/resuming in the background at nodes 6/);
    expect(kv.calls.get.filter((c) => c.startsWith(`${NODES}/`))).toHaveLength(12);
    expect(s.state).toBe("done");
    expect(s.trimmed).toBe(6 + 6 + 1);
    expect(await maxIds(kv)).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
  });

  it("reports the same totals as a clean run when the last progress write is lost at any point", async () => {
    const clean = mockKV();
    await seed(clean, 10, 7, 5);
    const want = await runGraphCompactOnBoot(clean as never, fast);
    const totals = (s: { scanned?: number; trimmed?: number; idsRemoved?: number }) => ({
      scanned: s.scanned,
      trimmed: s.trimmed,
      idsRemoved: s.idsRemoved,
    });
    expect(totals(want)).toEqual({ scanned: 22, trimmed: 18, idsRemoved: 17 * (100 - MAX_GRAPH_SOURCE_OBSERVATIONS) });

    const probe = mockKV();
    await seed(probe, 10, 7, 5);
    const cuts: Map<string, Map<string, unknown>>[] = [];
    const set = probe.set;
    probe.set = async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (scope === CONFIG && key === GRAPH_COMPACT_BOOT_KEY) cuts.push(structuredClone(probe.store));
      return set(scope, key, data);
    };
    resetGraphCompactBootStatus();
    await runGraphCompactOnBoot(probe as never, fast);
    expect(cuts.length).toBeGreaterThan(20);

    for (const store of cuts) {
      const kv = mockKV({ store });
      resetGraphCompactBootStatus();
      const s = await runGraphCompactOnBoot(kv as never, fast);
      expect(s.state).toBe("done");
      expect(totals(s)).toEqual(totals(want));
      expect(await maxIds(kv)).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
    }
  });

  it("is idempotent: a second full pass trims nothing", async () => {
    const kv = mockKV();
    await seed(kv, 6, 4, 3);
    await runGraphCompactOnBoot(kv as never, fast);
    const r = await compactGraphProvenance(kv as never);
    expect(r).toMatchObject({ nodesTrimmed: 0, edgesTrimmed: 0, historyTrimmed: 0, idsRemoved: 0, snapshotTrimmed: false });
  });

  it("never runs again once the completion marker is set", async () => {
    const kv = mockKV();
    await seed(kv, 4, 2, 1);
    await runGraphCompactOnBoot(kv as never, fast);
    resetGraphCompactBootStatus();
    kv.calls.list.length = 0;
    kv.calls.set.length = 0;
    const log = vi.fn();
    const s = await runGraphCompactOnBoot(kv as never, { ...fast, log });
    expect(s.state).toBe("done");
    expect(kv.calls.list).toEqual([]);
    expect(kv.calls.set).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it("runs again when the marker was written for a different cap or version", async () => {
    const kv = mockKV();
    await seed(kv, 4, 0, 0);
    await kv.set(CONFIG, GRAPH_COMPACT_BOOT_KEY, {
      version: GRAPH_COMPACT_BOOT_VERSION,
      cap: MAX_GRAPH_SOURCE_OBSERVATIONS * 2,
      status: "done",
      phase: "snapshot",
      offset: 0,
    });
    const s = await runGraphCompactOnBoot(kv as never, fast);
    expect(s.state).toBe("done");
    expect(s.trimmed).toBeGreaterThan(0);
    expect((await marker(kv))!.cap).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
  });

  it("covers every record when the store lists in a different order on every call", async () => {
    const kv = mockKV({ shuffle: true });
    await seed(kv, 40, 30, 20);
    const s = await runGraphCompactOnBoot(kv as never, { ...fast, sliceSize: 2 });
    expect(s.state).toBe("done");
    expect(await maxIds(kv)).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
  });

  it("retries a failing slice a bounded number of times, then reports and keeps the worker alive", async () => {
    const kv = mockKV();
    await seed(kv, 6, 0, 0);
    kv.failGet = (scope, key) => scope === NODES && key === "gn_0004";
    const warn = vi.fn();
    const s = await runGraphCompactOnBoot(kv as never, { ...fast, maxAttempts: 2, warn });
    expect(s).toMatchObject({ state: "failed", phase: "nodes", processed: 3, error: "state::get timed out" });
    expect(kv.calls.get.filter((c) => c === `${NODES}/gn_0004`)).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/failed at nodes 3 of 6: state::get timed out.*POST \/agentmemory\/graph\/compact/);
    expect(await marker(kv)).toMatchObject({ status: "failed", offset: 3, error: "state::get timed out" });

    kv.failGet = null;
    resetGraphCompactBootStatus();
    const again = await runGraphCompactOnBoot(kv as never, fast);
    expect(again.state).toBe("done");
    expect(await maxIds(kv)).toBe(MAX_GRAPH_SOURCE_OBSERVATIONS);
  });

  it("does not block the caller and runs at most once at a time", async () => {
    const kv = mockKV();
    await seed(kv, 6, 0, 0);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = runGraphCompactOnBoot(kv as never, { ...fast, pauseMs: 1, sleep: () => gate });
    const second = runGraphCompactOnBoot(kv as never, fast);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(getGraphCompactBootStatus().state).toBe("running"));
    expect(describeGraphCompactBoot(getGraphCompactBootStatus())).toBe("running, nodes 3 of 6");
    release();
    expect((await first).state).toBe("done");
  });

  it("is scheduled after the viewer starts and never awaited during boot", () => {
    const src = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const viewerAt = src.indexOf("startViewerServer(\n");
    const runAt = src.indexOf("void runGraphCompactOnBoot(");
    expect(viewerAt).toBeGreaterThan(0);
    expect(runAt).toBeGreaterThan(viewerAt);
    expect(src).not.toMatch(/await runGraphCompactOnBoot/);
    expect(src).toMatch(/if \(isGraphCompactOnBootEnabled\(\)\)[\s\S]*?setGraphCompactBootDisabled\(\)/);
  });
});

describe("AGENTMEMORY_GRAPH_COMPACT_ON_BOOT", () => {
  it("is on by default and off only for false", () => {
    vi.stubEnv("AGENTMEMORY_GRAPH_COMPACT_ON_BOOT", "");
    expect(isGraphCompactOnBootEnabled()).toBe(true);
    vi.stubEnv("AGENTMEMORY_GRAPH_COMPACT_ON_BOOT", "true");
    expect(isGraphCompactOnBootEnabled()).toBe(true);
    vi.stubEnv("AGENTMEMORY_GRAPH_COMPACT_ON_BOOT", "false");
    expect(isGraphCompactOnBootEnabled()).toBe(false);
  });

  it("reports off when disabled", () => {
    setGraphCompactBootDisabled();
    expect(getGraphCompactBootStatus()).toEqual({ state: "off" });
    expect(describeGraphCompactBoot(getGraphCompactBootStatus())).toMatch(/AGENTMEMORY_GRAPH_COMPACT_ON_BOOT=false/);
  });
});

describe("graph compaction in /agentmemory/status", () => {
  const base: StatusInputs = {
    now: new Date("2026-10-01T12:00:00.000Z"),
    version: "0.9.30",
    engineVersion: "0.22.1",
    uptimeSeconds: 10,
    stateBackend: "file",
    ports: { rest: 4611, streams: 4612, viewer: 4613 },
    health: null,
    circuitBreaker: null,
    functionMetrics: [],
    provider: "llm",
    embeddingProvider: "none",
    flags: [],
    index: {
      bm25Documents: 0,
      vectorDocuments: null,
      observationsIndexed: 0,
      missingObservations: 0,
      sessions: 0,
      bm25Incomplete: false,
      pendingVectorBackfill: 0,
    },
    graph: null,
    graphExtractionEnabled: false,
    auditLegacy: null,
  };

  it("shows a running pass as info with its position", () => {
    const r = evaluateStatus({
      ...base,
      graphCompaction: { state: "running", phase: "edges", processed: 400, total: 909 },
    });
    expect(r.graphCompaction?.state).toBe("running");
    const p = r.problems.find((x) => x.code === "graph-compaction-running")!;
    expect(p.level).toBe("info");
    expect(p.message).toMatch(/edges 400 of 909/);
    expect(renderStatusHtml(r, "n")).toMatch(/Provenance compaction/);
  });

  it("shows a failed pass as a warning with the reason and the manual command", () => {
    const r = evaluateStatus({
      ...base,
      graphCompaction: { state: "failed", phase: "nodes", processed: 3, total: 6, error: "state::get timed out" },
    });
    const p = r.problems.find((x) => x.code === "graph-compaction-failed")!;
    expect(p.level).toBe("warn");
    expect(p.message).toMatch(/state::get timed out/);
    expect(p.fix).toContain("curl -X POST http://localhost:4611/agentmemory/graph/compact");
  });

  it("adds no problem when done or off", () => {
    for (const state of ["done", "off", "pending"] as const) {
      const r = evaluateStatus({ ...base, graphCompaction: { state } });
      expect(r.problems.map((x) => x.code).filter((c) => c.startsWith("graph-compaction"))).toEqual([]);
    }
  });
});
