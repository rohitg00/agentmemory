import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import { VERSION } from "../src/version.js";
import { getSearchIndex } from "../src/functions/search.js";
import type {
  Session,
  CompressedObservation,
  Memory,
  SessionSummary,
  ExportData,
} from "../src/types.js";

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

const testSession: Session = {
  id: "ses_1",
  project: "my-project",
  cwd: "/tmp",
  startedAt: "2026-02-01T00:00:00Z",
  status: "completed",
  observationCount: 1,
};

const testObs: CompressedObservation = {
  id: "obs_1",
  sessionId: "ses_1",
  timestamp: "2026-02-01T10:00:00Z",
  type: "file_edit",
  title: "Edit auth",
  facts: ["Added check"],
  narrative: "Auth changes",
  concepts: ["auth"],
  files: ["src/auth.ts"],
  importance: 7,
};

const testMemory: Memory = {
  id: "mem_1",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  type: "pattern",
  title: "Auth pattern",
  content: "Always validate tokens",
  concepts: ["auth"],
  files: [],
  sessionIds: ["ses_1"],
  strength: 5,
  version: 1,
  isLatest: true,
};

const testSummary: SessionSummary = {
  sessionId: "ses_1",
  project: "my-project",
  createdAt: "2026-02-01T00:00:00Z",
  title: "Auth work",
  narrative: "Worked on auth",
  keyDecisions: ["Use JWT"],
  filesModified: ["src/auth.ts"],
  concepts: ["auth"],
  observationCount: 1,
};

describe("Export/Import Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    // getSearchIndex() returns a module-level singleton shared across
    // tests. Clear it so index assertions here don't see rows added by
    // a prior test's import.
    getSearchIndex().clear();
    registerExportImportFunction(sdk as never, kv as never);

    await kv.set("mem:sessions", "ses_1", testSession);
    await kv.set("mem:obs:ses_1", "obs_1", testObs);
    await kv.set("mem:memories", "mem_1", testMemory);
    await kv.set("mem:summaries", "ses_1", testSummary);
  });

  it("export produces valid ExportData structure", async () => {
    const result = (await sdk.trigger("mem::export", {})) as ExportData;

    expect(result.version).toBe(VERSION);
    expect(result.exportedAt).toBeDefined();
    expect(result.sessions.length).toBe(1);
    expect(result.sessions[0].id).toBe("ses_1");
    expect(result.observations["ses_1"].length).toBe(1);
    expect(result.memories.length).toBe(1);
    expect(result.summaries.length).toBe(1);
  });

  it("import with merge strategy adds data", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [{ ...testSession, id: "ses_2", observationCount: 0 }],
      observations: {},
      memories: [{ ...testMemory, id: "mem_2", title: "New pattern" }],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; sessions: number; memories: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);
    expect(result.memories).toBe(1);

    const allSessions = await kv.list("mem:sessions");
    expect(allSessions.length).toBe(2);
  });

  it("import adds imported records to the search index", async () => {
    // Regression: mem::import wrote rows to KV but never indexed them.
    // On an existing install the boot rebuild gate (bm25.size === 0) is
    // false, so imported data stayed invisible to mem::search forever.
    const importedObs: CompressedObservation = {
      id: "obs_imported",
      sessionId: "ses_imported",
      timestamp: "2026-03-01T10:00:00Z",
      type: "file_edit",
      title: "Kubernetes deployment rollout",
      facts: ["Scaled replicas"],
      narrative: "Adjusted the kubernetes deployment rollout strategy",
      concepts: ["k8s"],
      files: ["deploy.yaml"],
      importance: 6,
    };
    const importedMem: Memory = {
      ...testMemory,
      id: "mem_imported",
      title: "Postgres connection pooling",
      content: "Use pgbouncer for postgres connection pooling",
    };
    const exportData: ExportData = {
      version: "0.9.28",
      exportedAt: new Date().toISOString(),
      sessions: [
        { ...testSession, id: "ses_imported", observationCount: 1 },
      ],
      observations: { ses_imported: [importedObs] },
      memories: [importedMem],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; observations: number; memories: number };

    expect(result.success).toBe(true);
    expect(result.observations).toBe(1);
    expect(result.memories).toBe(1);

    const idx = getSearchIndex();
    expect(idx.has("obs_imported")).toBe(true);
    expect(idx.has("mem_imported")).toBe(true);

    const obsHit = idx.search("kubernetes rollout");
    expect(obsHit.some((r) => r.obsId === "obs_imported")).toBe(true);

    const memHit = idx.search("postgres pooling");
    expect(memHit.some((r) => r.obsId === "mem_imported")).toBe(true);
  });

  it("import with skip strategy does not overwrite existing", async () => {
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [testSession],
      observations: { ses_1: [testObs] },
      memories: [testMemory],
      summaries: [testSummary],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "skip",
    })) as { success: boolean; skipped: number; sessions: number };

    expect(result.success).toBe(true);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.sessions).toBe(0);
  });

  it("import with replace strategy clears existing data first", async () => {
    const newSession: Session = {
      id: "ses_new",
      project: "new-project",
      cwd: "/tmp/new",
      startedAt: "2026-03-01T00:00:00Z",
      status: "active",
      observationCount: 0,
    };
    const exportData: ExportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      sessions: [newSession],
      observations: {},
      memories: [],
      summaries: [],
    };

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "replace",
    })) as { success: boolean; sessions: number };

    expect(result.success).toBe(true);
    expect(result.sessions).toBe(1);

    const oldSession = await kv.get("mem:sessions", "ses_1");
    expect(oldSession).toBeNull();
  });

  it("export then import round-trip preserves data", async () => {
    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const freshKv = mockKV();
    const freshSdk = mockSdk();
    registerExportImportFunction(freshSdk as never, freshKv as never);

    const importResult = (await freshSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "merge",
    })) as {
      success: boolean;
      sessions: number;
      observations: number;
      memories: number;
    };

    expect(importResult.success).toBe(true);
    expect(importResult.sessions).toBe(1);
    expect(importResult.observations).toBe(1);
    expect(importResult.memories).toBe(1);

    const reExported = (await freshSdk.trigger(
      "mem::export",
      {},
    )) as ExportData;
    expect(reExported.sessions.length).toBe(exported.sessions.length);
    expect(reExported.memories.length).toBe(exported.memories.length);
  });

  it("import rejects unsupported version", async () => {
    const exportData = {
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
    } as unknown as ExportData;

    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported export version");
  });
});

const bloatedIds = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}_${String(i).padStart(3, "0")}`);

describe("import bounds graph provenance", () => {
  it("caps sourceObservationIds on imported graph nodes and edges", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const exportData = {
      version: "0.9.28",
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      graphNodes: [
        {
          id: "gn_bloat",
          type: "file",
          name: "src/hot.ts",
          properties: {},
          sourceObservationIds: bloatedIds("obs", 400),
          createdAt: "2026-03-01T00:00:00Z",
        },
        {
          id: "gn_small",
          type: "file",
          name: "src/cold.ts",
          properties: {},
          sourceObservationIds: ["obs_x"],
          createdAt: "2026-03-01T00:00:00Z",
        },
      ],
      graphEdges: [
        {
          id: "ge_bloat",
          type: "related_to",
          sourceNodeId: "gn_bloat",
          targetNodeId: "gn_small",
          weight: 0.5,
          sourceObservationIds: bloatedIds("eobs", 100),
          createdAt: "2026-03-01T00:00:00Z",
        },
      ],
    } as unknown as ExportData;
    const result = (await sdk.trigger("mem::import", {
      exportData,
      strategy: "merge",
    })) as { success: boolean };
    expect(result.success).toBe(true);
    const n = await kv.get<{ sourceObservationIds: string[] }>("mem:graph:nodes", "gn_bloat");
    const s = await kv.get<{ sourceObservationIds: string[] }>("mem:graph:nodes", "gn_small");
    const e = await kv.get<{ sourceObservationIds: string[] }>("mem:graph:edges", "ge_bloat");
    expect(n!.sourceObservationIds).toEqual(bloatedIds("obs", 400).slice(-32));
    expect(s!.sourceObservationIds).toEqual(["obs_x"]);
    expect(e!.sourceObservationIds).toEqual(bloatedIds("eobs", 100).slice(-32));
  });
});

describe("Export collection pagination", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set("mem:sessions", "ses_1", testSession);
    for (let i = 0; i < 7; i++) {
      await kv.set("mem:memories", `mem_${i}`, { ...testMemory, id: `mem_${i}` });
    }
    for (let i = 0; i < 5; i++) {
      await kv.set("mem:graph:nodes", `node_${i}`, { id: `node_${i}`, label: `n${i}` });
    }
  });

  it("returns every collection in full when no collection limit is given", async () => {
    const result = (await sdk.trigger("mem::export", {})) as ExportData;

    expect(result.memories.length).toBe(7);
    expect(result.graphNodes?.length).toBe(5);
    expect(result.collectionPagination).toBeUndefined();
  });

  it("bounds every collection, not just sessions, when a collection limit is given", async () => {
    const result = (await sdk.trigger("mem::export", {
      collectionLimit: 3,
    })) as ExportData;

    expect(result.memories.length).toBe(3);
    expect(result.graphNodes?.length).toBe(3);
    expect(result.collectionPagination?.limit).toBe(3);
    expect(result.collectionPagination?.offset).toBe(0);
    expect(result.collectionPagination?.totals["memories"]).toBe(7);
    expect(result.collectionPagination?.totals["graphNodes"]).toBe(5);
    expect(result.collectionPagination?.hasMore).toBe(true);
  });

  it("walks a collection to its end across pages", async () => {
    const page2 = (await sdk.trigger("mem::export", {
      collectionLimit: 3,
      collectionOffset: 3,
    })) as ExportData;
    expect(page2.memories.length).toBe(3);
    expect(page2.collectionPagination?.offset).toBe(3);
    expect(page2.collectionPagination?.limit).toBe(3);
    expect(page2.collectionPagination?.hasMore).toBe(true);

    const page3 = (await sdk.trigger("mem::export", {
      collectionLimit: 3,
      collectionOffset: 6,
    })) as ExportData;
    expect(page3.memories.length).toBe(1);
    expect(page3.collectionPagination?.hasMore).toBe(false);
  });
});

describe("Export collection pages and import", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const logged = ["mem_0", "mem_2", "mem_4", "mem_5", "mem_6"];

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    for (let i = 0; i < 7; i++) {
      await kv.set("mem:memories", `mem_${i}`, { ...testMemory, id: `mem_${i}` });
    }
    for (const id of logged) {
      await kv.set("mem:access", id, { memoryId: id, count: 2, lastAt: "2026-02-01T00:00:00Z", recent: [] });
    }
  });

  it("pages access logs together with the memories they belong to", async () => {
    const seen: string[] = [];
    for (const collectionOffset of [0, 3, 6]) {
      const page = (await sdk.trigger("mem::export", {
        collectionLimit: 3,
        collectionOffset,
      })) as ExportData;
      const ids = new Set(page.memories.map((m) => m.id));
      const logIds = (page.accessLogs ?? []).map((l) => l.memoryId);
      expect(logIds.every((id) => ids.has(id))).toBe(true);
      expect(page.collectionPagination?.totals["accessLogs"]).toBe(5);
      seen.push(...logIds);
    }
    expect(seen.sort()).toEqual(logged);
  });

  it("restores every access log when the pages are imported one by one", async () => {
    const target = mockKV();
    const targetSdk = mockSdk();
    registerExportImportFunction(targetSdk as never, target as never);
    for (const collectionOffset of [0, 3, 6]) {
      const page = await sdk.trigger("mem::export", { collectionLimit: 3, collectionOffset });
      const result = (await targetSdk.trigger("mem::import", {
        exportData: page,
        strategy: "merge",
      })) as { success: boolean };
      expect(result.success).toBe(true);
    }
    expect((await target.list("mem:memories")).length).toBe(7);
    expect((await target.list("mem:access")).length).toBe(5);
  });

  it("refuses to replace the store with a page of an export", async () => {
    const page = await sdk.trigger("mem::export", { collectionLimit: 3 });
    const result = (await sdk.trigger("mem::import", {
      exportData: page,
      strategy: "replace",
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/replace/);
    expect((await kv.list("mem:memories")).length).toBe(7);
  });

  it("refuses to replace the store with a selection of collections", async () => {
    const selection = await sdk.trigger("mem::export", { collections: "memories" });
    const result = (await sdk.trigger("mem::import", {
      exportData: selection,
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(false);
    expect((await kv.list("mem:access")).length).toBe(5);
  });
});

describe("Export collection allowlist", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set("mem:sessions", "ses_1", testSession);
    await kv.set("mem:obs:ses_1", "obs_1", testObs);
    await kv.set("mem:summaries", "ses_1", testSummary);
    for (let i = 0; i < 7; i++) {
      await kv.set("mem:memories", `mem_${i}`, { ...testMemory, id: `mem_${i}` });
    }
    for (let i = 0; i < 20; i++) {
      await kv.set("mem:graph:nodes", `node_${i}`, { id: `node_${i}`, label: `n${i}` });
    }
  });

  it("drops the collections outside the allowlist", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: ["memories", "summaries"],
    })) as ExportData;

    expect(result.memories.length).toBe(7);
    expect(result.summaries.length).toBe(1);
    expect(result.graphNodes).toBeUndefined();
  });

  it("accepts the allowlist as a comma-separated string", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: "memories, summaries",
    })) as ExportData;

    expect(result.memories.length).toBe(7);
    expect(result.summaries.length).toBe(1);
    expect(result.graphNodes).toBeUndefined();
  });

  it("keeps collectionTotals reporting every collection", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: ["memories"],
      collectionLimit: 3,
    })) as ExportData;

    expect(result.collectionPagination?.totals["memories"]).toBe(7);
    expect(result.collectionPagination?.totals["summaries"]).toBe(1);
    expect(result.collectionPagination?.totals["graphNodes"]).toBe(20);
  });

  it("computes hasMore from the allowlist alone", async () => {
    const selected = (await sdk.trigger("mem::export", {
      collections: ["memories"],
      collectionLimit: 7,
    })) as ExportData;
    expect(selected.collectionPagination?.hasMore).toBe(false);

    const everything = (await sdk.trigger("mem::export", {
      collectionLimit: 7,
    })) as ExportData;
    expect(everything.collectionPagination?.hasMore).toBe(true);
  });

  it("ignores unknown collection names instead of failing", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: ["memories", "notACollection"],
      collectionLimit: 7,
    })) as ExportData;

    expect(result.memories.length).toBe(7);
    expect(result.graphNodes).toBeUndefined();
    expect(result.collectionPagination?.hasMore).toBe(false);
  });

  it("selects nothing when the allowlist names no known collection", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: ["notACollection"],
      collectionLimit: 3,
    })) as ExportData;

    expect(result.memories).toEqual([]);
    expect(result.summaries).toEqual([]);
    expect(result.graphNodes).toBeUndefined();
    expect(result.collectionPagination?.totals["memories"]).toBe(7);
    expect(result.collectionPagination?.hasMore).toBe(false);
  });

  it("treats an empty allowlist as an explicit empty selection", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: "",
    })) as ExportData;

    expect(result.memories).toEqual([]);
    expect(result.graphNodes).toBeUndefined();
  });

  it("exports sessions only when the selection names them", async () => {
    const without = (await sdk.trigger("mem::export", {
      collections: ["memories"],
    })) as ExportData;
    expect(without.sessions).toEqual([]);
    expect(without.observations).toEqual({});

    const withSessions = (await sdk.trigger("mem::export", {
      collections: ["memories", "sessions"],
    })) as ExportData;
    expect(withSessions.sessions.length).toBe(1);
    expect(withSessions.observations["ses_1"].length).toBe(1);
  });

  it("marks a selection without a collection limit as partial", async () => {
    const result = (await sdk.trigger("mem::export", {
      collections: "memories",
    })) as ExportData;

    expect(result.collectionPagination?.collections).toEqual(["memories"]);
    expect(result.collectionPagination?.limit).toBeUndefined();
    expect(result.collectionPagination?.totals["graphNodes"]).toBe(20);
    expect(result.collectionPagination?.hasMore).toBe(false);
  });
});
