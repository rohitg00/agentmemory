import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerExportImportFunction } from "../src/functions/export-import.js";
import { MAX_IMPORT_OBS_PER_SESSION } from "../src/config.js";
import { VERSION } from "../src/version.js";
import { KV, fingerprintId } from "../src/state/schema.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { getSearchIndex } from "../src/functions/search.js";
import type {
  Session,
  CompressedObservation,
  Memory,
  MemoryRelation,
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
    listKeys: async (scope: string): Promise<string[]> =>
      Array.from(store.get(scope)?.keys() ?? []),
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

const testLesson = { id: "les_1", content: "Validate tokens" };

const testAccessLog = { memoryId: "mem_1", count: 3, lastAt: "2026-02-01T00:00:00Z", recent: [] };

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
    await kv.set("mem:lessons", "les_1", testLesson);
    await kv.set("mem:access", "mem_1", testAccessLog);
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

  it.each(["merge", "skip"] as const)("serializes a summary-only %s import with summary publication", async (strategy) => {
    await kv.delete(KV.summaries, testSession.id);
    const published = { ...testSummary, title: "Concurrent published summary" };
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const publishing = withKeyedLock(`obs:${testSession.id}`, async () => {
      entered(); await gate;
      await kv.set(KV.summaries, testSession.id, published);
    });
    await ready;
    const importing = sdk.trigger("mem::import", { strategy, exportData: {
      version: VERSION, exportedAt: new Date().toISOString(), sessions: [], observations: {}, memories: [], summaries: [testSummary],
    } });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      expect(await kv.get(KV.summaries, testSession.id)).toBeNull();
    } finally { release(); await publishing; }
    expect(await importing).toMatchObject({ success: true, summaries: strategy === "skip" ? 0 : 1 });
    expect(await kv.get(KV.summaries, testSession.id)).toEqual(strategy === "skip" ? published : testSummary);
  });

  it("keeps summary mutation locks until sibling writes settle after an import failure", async () => {
    const delayed = { ...testSummary, sessionId: "ses_delayed", title: "Imported delayed summary" };
    const published = { ...delayed, title: "Summary published after import" };
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const originalSet = kv.set;
    vi.spyOn(kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.summaries && key === testSession.id) throw new Error("summary write failed");
      if (scope === KV.summaries && key === delayed.sessionId && value === delayed) {
        entered(); await gate;
      }
      return originalSet(scope, key, value);
    });
    let settled = false;
    const importing = sdk.trigger("mem::import", { exportData: {
      version: VERSION, exportedAt: new Date().toISOString(), sessions: [], observations: {}, memories: [],
      summaries: [testSummary, delayed],
    } }).then(() => { settled = true; return null; }, (error: Error) => { settled = true; return error; });
    await ready;
    let publishedWhileImporting = false;
    const publishing = withKeyedLock(`obs:${delayed.sessionId}`, async () => {
      publishedWhileImporting = true;
      await kv.set(KV.summaries, delayed.sessionId, published);
    });
    try {
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(publishedWhileImporting).toBe(false);
    } finally { release(); await publishing; }
    expect(await importing).toMatchObject({ message: "summary write failed" });
    expect(await kv.get(KV.summaries, delayed.sessionId)).toEqual(published);
  });

  it("import with replace strategy clears existing data first", async () => {
    await kv.set(KV.summaryRepairs, testSession.id, { sessionId: testSession.id, token: "old-repair", dueAt: 0, attempts: 0 });
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
    expect(await kv.get(KV.summaryRepairs, testSession.id)).toBeNull();
  });

  it.each([
    { section: "lessons", shape: "an object", value: { les_1: { id: "les_1" } }, error: "lessons must be an array" },
    { section: "profiles", shape: "a string", value: "ab", error: "profiles must be an array" },
    { section: "accessLogs", shape: "a string", value: "oops", error: "accessLogs must be an array" },
    { section: "lessons", shape: "null", value: null, error: "lessons must be an array" },
    { section: "profiles", shape: "null", value: null, error: "profiles must be an array" },
    { section: "accessLogs", shape: "null", value: null, error: "accessLogs must be an array" },
    { section: "graphNodes", shape: "null", value: null, error: "graphNodes must be an array" },
    {
      section: "accessLogs",
      shape: "over the cap",
      value: Array.from({ length: 50_001 }, () => ({ memoryId: testMemory.id })),
      error: "Too many access logs (max 50000)",
    },
    { section: "lessons", shape: "a null row", value: [null], error: "lessons[0] must be an object with a string id" },
    { section: "facets", shape: "a null row", value: [null], error: "facets[0] must be an object with a string id" },
    { section: "memories", shape: "a null row", value: [null], error: "memories[0] must be an object with a string id" },
    { section: "accessLogs", shape: "a null row", value: [null], error: "accessLogs[0] must be an object with a string memoryId" },
    { section: "lessons", shape: "a row without id", value: [{ content: "x" }], error: "lessons[0] must be an object with a string id" },
    { section: "lessons", shape: "a row with an empty id", value: [{ id: "" }], error: "lessons[0] must be an object with a string id" },
    { section: "profiles", shape: "a row without project", value: [{ id: "my-project" }], error: "profiles[0] must be an object with a string project" },
    { section: "sessions", shape: "a row without id", value: [{}], error: "sessions[0] must be an object with a string id" },
    { section: "summaries", shape: "a row without sessionId", value: [{ id: "ses_1" }], error: "summaries[0] must be an object with a string sessionId" },
    {
      section: "observations",
      shape: "a row without id",
      value: { ses_1: [{ sessionId: "ses_1" }] },
      error: "observations.ses_1[0] must be an object with a string id",
    },
  ])("replace import leaves the store intact when $section is $shape", async ({ section, value, error }) => {
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      [section]: value,
    } as unknown as ExportData;

    const result = await sdk
      .trigger("mem::import", { exportData, strategy: "replace" })
      .catch((thrown: unknown) => thrown);

    expect(result).not.toBeInstanceOf(Error);
    expect(result).toMatchObject({ success: false, error });
    expect(await kv.get(KV.sessions, testSession.id)).toEqual(testSession);
    expect(await kv.get(KV.memories, testMemory.id)).toEqual(testMemory);
    expect(await kv.get(KV.lessons, testLesson.id)).toEqual(testLesson);
    expect(await kv.get(KV.accessLog, testAccessLog.memoryId)).toEqual(testAccessLog);
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

  it("refuses to replace the store with a page of sessions", async () => {
    for (const id of ["ses_1", "ses_2", "ses_3"]) {
      await kv.set("mem:sessions", id, { ...testSession, id });
    }
    for (const offset of [0, 2]) {
      const page = await sdk.trigger("mem::export", { maxSessions: 2, offset });
      const result = (await sdk.trigger("mem::import", {
        exportData: page,
        strategy: "replace",
      })) as { success: boolean };
      expect(result.success).toBe(false);
    }
    expect((await kv.list("mem:sessions")).length).toBe(3);
    expect((await kv.list("mem:memories")).length).toBe(7);
  });

  it("replaces the store with a session window that covers every session", async () => {
    await kv.set("mem:sessions", "ses_1", testSession);
    const whole = await sdk.trigger("mem::export", { maxSessions: 10 });
    const result = (await sdk.trigger("mem::import", {
      exportData: whole,
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(true);
  });

  it("reports no further page for an access-log selection", async () => {
    const page = (await sdk.trigger("mem::export", {
      collections: "accessLogs",
      collectionLimit: 3,
    })) as ExportData;

    expect(page.collectionPagination?.hasMore).toBe(false);
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
    await kv.set("mem:access", "mem_0", { memoryId: "mem_0", count: 1, lastAt: "2026-02-01T00:00:00Z", recent: [] });
    const result = (await sdk.trigger("mem::export", {
      collections: ["memories", "summaries"],
    })) as ExportData;

    expect(result.memories.length).toBe(7);
    expect(result.summaries.length).toBe(1);
    expect(result.graphNodes).toBeUndefined();
    expect(result.accessLogs).toBeUndefined();
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
    expect(result.collectionPagination?.collections).toEqual(["memories"]);
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

describe("Export/import relations", () => {
  const relation: MemoryRelation = {
    type: "extends",
    sourceId: "mem_a",
    targetId: "mem_b",
    createdAt: "2026-02-05T00:00:00Z",
    confidence: 0.9,
  };

  const seedRelationStores = async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_a", { ...testMemory, id: "mem_a", relatedIds: ["mem_b"] });
    await kv.set(KV.memories, "mem_b", { ...testMemory, id: "mem_b", relatedIds: ["mem_a"] });
    await kv.set(KV.relations, "rel_1", relation);
    return { sdk, kv };
  };

  const freshTarget = () => {
    const kv = mockKV();
    const sdk = mockSdk();
    registerExportImportFunction(sdk as never, kv as never);
    return { kv, sdk };
  };

  const runImport = (sdk: ReturnType<typeof mockSdk>, exportData: ExportData, strategy: "merge" | "replace" | "skip") =>
    sdk.trigger("mem::import", { exportData, strategy }) as Promise<{
      success: boolean;
      skipped: number;
      error?: string;
    }>;

  it("exports each relation with its KV storage key", async () => {
    const { sdk } = await seedRelationStores();

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    expect(exported.relations).toEqual([{ ...relation, storageKey: "rel_1" }]);
  });

  it.each(["merge", "replace", "skip"] as const)(
    "restores both confidence variants under their generated keys on %s",
    async (strategy) => {
      const { sdk, kv } = await seedRelationStores();
      const lowConfidence = { ...relation, confidence: 0.2 };
      await kv.set(KV.relations, "rel_2", lowConfidence);

      const exported = (await sdk.trigger("mem::export", {})) as ExportData;
      expect(exported.relations).toEqual([
        { ...relation, storageKey: "rel_1" },
        { ...lowConfidence, storageKey: "rel_2" },
      ]);

      const target = freshTarget();
      const result = await runImport(target.sdk, exported, strategy);

      expect(result.success).toBe(true);
      expect(await target.kv.get(KV.relations, "rel_1")).toEqual(relation);
      expect(await target.kv.get(KV.relations, "rel_2")).toEqual(lowConfidence);
      expect(await target.kv.list(KV.relations)).toHaveLength(2);
    },
  );

  it.each(["merge", "skip"] as const)("re-importing its own export is idempotent under %s", async (strategy) => {
    const { sdk, kv } = await seedRelationStores();
    const lowConfidence = { ...relation, confidence: 0.2 };
    await kv.set(KV.relations, "rel_2", lowConfidence);
    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const result = await runImport(sdk, exported, strategy);

    expect(result.success).toBe(true);
    const stored = await kv.list<MemoryRelation>(KV.relations);
    expect(stored).toHaveLength(2);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);
    expect(await kv.get(KV.relations, "rel_2")).toEqual(lowConfidence);
  });

  it("leaves the stored row untouched when skip sees the same storage key", async () => {
    const { sdk } = await seedRelationStores();
    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const target = freshTarget();
    const existing = { ...relation, confidence: 0.4 };
    await target.kv.set(KV.relations, "rel_1", existing);

    const result = await runImport(target.sdk, exported, "skip");

    expect(result.success).toBe(true);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(await target.kv.get(KV.relations, "rel_1")).toEqual(existing);
  });

  it("keeps identical relation rows stored under different generated keys", async () => {
    const { sdk, kv } = await seedRelationStores();
    await kv.set(KV.relations, "rel_2", { ...relation });

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    expect(exported.relations).toHaveLength(2);

    const target = freshTarget();
    const result = await runImport(target.sdk, exported, "merge");

    expect(result.success).toBe(true);
    expect(await target.kv.get(KV.relations, "rel_1")).toEqual(relation);
    expect(await target.kv.get(KV.relations, "rel_2")).toEqual(relation);
    expect(await target.kv.list(KV.relations)).toHaveLength(2);
  });

  it("clears every relation row on replace, not only composite-keyed ones", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "replace");

    expect(result.success).toBe(true);
    expect(await kv.get(KV.memories, "mem_a")).toBeNull();
    expect(await kv.list(KV.relations)).toEqual([]);
  });

  it.each([
    { shape: "missing a key component", rows: [{ sourceId: "mem_a", targetId: "mem_b" }] },
    { shape: "an empty storageKey", rows: [{ ...relation, storageKey: "" }] },
    { shape: "a non-string storageKey", rows: [{ ...relation, storageKey: 7 }] },
  ])("rejects relation rows with $shape before mutating", async ({ rows }) => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: rows,
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "merge");

    expect(result.success).toBe(false);
    expect(result.error).toContain("relations[0]");
    expect((await kv.list(KV.relations)).length).toBe(1);
  });

  it("matches a keyless row to the stored generated key by full identity on merge", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [relation],
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "merge");

    expect(result.success).toBe(true);
    expect(await kv.list<MemoryRelation>(KV.relations)).toEqual([relation]);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);
  });

  it("honors an existing identity-matched relation under skip", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [relation],
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "skip");

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(1);
    expect(await kv.list<MemoryRelation>(KV.relations)).toEqual([relation]);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);
  });

  it("keeps repeated keyless rows distinct and idempotent across imports", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [
        relation,
        { ...relation },
        { ...relation, confidence: 0.2 },
      ],
    } as unknown as ExportData;

    const first = await runImport(sdk, exportData, "merge");
    expect(first.success).toBe(true);
    const keys = await kv.listKeys(KV.relations);
    expect(keys).toHaveLength(3);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);
    const confidences = (await kv.list<MemoryRelation>(KV.relations))
      .map((rel) => rel.confidence)
      .sort();
    expect(confidences).toEqual([0.2, 0.9, 0.9]);

    const second = await runImport(sdk, exportData, "merge");
    expect(second.success).toBe(true);
    expect(await kv.listKeys(KV.relations)).toHaveLength(3);
    const confidencesAfter = (await kv.list<MemoryRelation>(KV.relations))
      .map((rel) => rel.confidence)
      .sort();
    expect(confidencesAfter).toEqual([0.2, 0.9, 0.9]);
  });

  it("preserves relation confidence through export and import", async () => {
    const { registerRelationsFunction } = await import(
      "../src/functions/relations.js"
    );
    const build = async (withRelation: boolean) => {
      const sdk = mockSdk();
      const kv = mockKV();
      registerExportImportFunction(sdk as never, kv as never);
      registerRelationsFunction(sdk as never, kv as never);
      await kv.set(KV.sessions, testSession.id, testSession);
      await kv.set(KV.memories, "mem_a", { ...testMemory, id: "mem_a", relatedIds: ["mem_b"] });
      await kv.set(KV.memories, "mem_b", { ...testMemory, id: "mem_b", relatedIds: ["mem_a"] });
      if (withRelation) await kv.set(KV.relations, "rel_1", relation);
      return { sdk, kv };
    };

    const before = await build(true);
    const relatedBefore = (await before.sdk.trigger("mem::get-related", {
      memoryId: "mem_a",
      minConfidence: 0.8,
    })) as { results: unknown[] };
    const exported = (await before.sdk.trigger("mem::export", {})) as ExportData;

    const after = await build(false);
    await after.sdk.trigger("mem::import", { exportData: exported, strategy: "merge" });
    const relatedAfter = (await after.sdk.trigger("mem::get-related", {
      memoryId: "mem_a",
      minConfidence: 0.8,
    })) as { results: unknown[] };

    expect(relatedBefore.results.length).toBe(1);
    expect(relatedAfter.results.length).toBe(1);
  });

  it("keeps every confidence tier visible to get-related after a round trip", async () => {
    const { registerRelationsFunction } = await import(
      "../src/functions/relations.js"
    );
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    registerRelationsFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_a", { ...testMemory, id: "mem_a", relatedIds: ["mem_b"] });
    await kv.set(KV.memories, "mem_b", { ...testMemory, id: "mem_b", relatedIds: ["mem_a"] });
    await kv.set(KV.relations, "rel_hi", relation);
    await kv.set(KV.relations, "rel_lo", { ...relation, confidence: 0.2 });

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    const target = mockKV();
    const targetSdk = mockSdk();
    registerExportImportFunction(targetSdk as never, target as never);
    registerRelationsFunction(targetSdk as never, target as never);
    await targetSdk.trigger("mem::import", { exportData: exported, strategy: "merge" });

    expect(await target.list(KV.relations)).toHaveLength(2);
    const confident = (await targetSdk.trigger("mem::get-related", {
      memoryId: "mem_a",
      minConfidence: 0.8,
    })) as { results: unknown[] };
    const strict = (await targetSdk.trigger("mem::get-related", {
      memoryId: "mem_a",
      minConfidence: 0.95,
    })) as { results: unknown[] };
    expect(confident.results).toHaveLength(1);
    expect(strict.results).toHaveLength(0);
  });

  it("keeps both rows when a fingerprinted sibling was deleted between imports", async () => {
    const { sdk, kv } = freshTarget();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [relation, { ...relation }],
    } as unknown as ExportData;

    const first = await runImport(sdk, exportData, "merge");
    expect(first.success).toBe(true);
    const keys = await kv.listKeys(KV.relations);
    expect(keys).toHaveLength(2);

    await kv.delete(KV.relations, keys[0]);
    const second = await runImport(sdk, exportData, "merge");
    expect(second.success).toBe(true);

    const after = await kv.listKeys(KV.relations);
    expect(after).toHaveLength(2);
    expect(after).toContain(keys[1]);
    expect((await kv.list<MemoryRelation>(KV.relations)).map((rel) => rel.confidence).sort()).toEqual([0.9, 0.9]);
  });

  it("does not let a keyless row borrow an explicit incoming storageKey, and stays idempotent", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [
        { ...relation, storageKey: "rel_1" },
        { ...relation },
      ],
    } as unknown as ExportData;

    const first = await runImport(sdk, exportData, "merge");
    expect(first.success).toBe(true);
    expect(await kv.listKeys(KV.relations)).toHaveLength(2);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);

    for (const strategy of ["merge", "skip"] as const) {
      const again = await runImport(sdk, exportData, strategy);
      expect(again.success).toBe(true);
      expect(await kv.listKeys(KV.relations)).toHaveLength(2);
      expect((await kv.list<MemoryRelation>(KV.relations)).map((rel) => rel.confidence).sort()).toEqual([0.9, 0.9]);
    }
  });

  it("rejects duplicate explicit storageKeys before mutating", async () => {
    const { sdk, kv } = await seedRelationStores();
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [
        { ...relation, storageKey: "rel_9" },
        { ...relation, targetId: "mem_c", storageKey: "rel_9" },
      ],
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "merge");

    expect(result.success).toBe(false);
    expect(result.error).toContain("duplicate storageKey");
    expect(await kv.listKeys(KV.relations)).toEqual(["rel_1"]);
  });

  it("aborts the import when a stored relation read fails", async () => {
    const { sdk, kv } = await seedRelationStores();
    const realGet = kv.get;
    const getter = vi
      .spyOn(kv, "get")
      .mockImplementation(async (scope: string, key: string) => {
        if (scope === KV.relations) throw new Error("relation read failed");
        return realGet(scope, key);
      });
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [relation],
    } as unknown as ExportData;

    const result = await runImport(sdk, exportData, "merge").catch((err: unknown) => err);

    expect(result).toBeInstanceOf(Error);
    getter.mockRestore();
    expect(await kv.listKeys(KV.relations)).toEqual(["rel_1"]);
    expect(await kv.get(KV.relations, "rel_1")).toEqual(relation);
  });

  it("does not let a keyless fallback collide with a later explicit storageKey", async () => {
    const { sdk, kv } = freshTarget();
    const identity = JSON.stringify([
      relation.sourceId,
      relation.targetId,
      relation.type,
      relation.createdAt,
      relation.confidence ?? null,
    ]);
    const explicitKey = fingerprintId("rel", `${identity}:0`);
    const explicitRow = { ...relation, targetId: "mem_c", storageKey: explicitKey };
    const exportData = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      relations: [{ ...relation }, explicitRow],
    } as unknown as ExportData;

    const first = await runImport(sdk, exportData, "merge");
    expect(first.success).toBe(true);
    expect(await kv.listKeys(KV.relations)).toHaveLength(2);
    expect(await kv.get(KV.relations, explicitKey)).toEqual({
      ...relation,
      targetId: "mem_c",
    });

    for (const strategy of ["merge", "skip"] as const) {
      const again = await runImport(sdk, exportData, strategy);
      expect(again.success).toBe(true);
      expect(await kv.listKeys(KV.relations)).toHaveLength(2);
      expect(await kv.get(KV.relations, explicitKey)).toEqual({
        ...relation,
        targetId: "mem_c",
      });
    }
  });

  it("bounds relation reads to the chunk size and preserves key order under out-of-order completion", async () => {
    const { sdk, kv } = freshTarget();
    const keys = Array.from({ length: 25 }, (_, i) => `rel_${String(i).padStart(2, "0")}`);
    for (const key of keys) {
      await kv.set(KV.relations, key, { ...relation, targetId: `mem_${key}` });
    }

    let inflight = 0;
    let maxInflight = 0;
    const realGet = kv.get;
    vi.spyOn(kv, "get").mockImplementation(async (scope: string, key: string) => {
      if (scope !== KV.relations) return realGet(scope, key);
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((resolve) => setTimeout(resolve, keys.length - keys.indexOf(key)));
      inflight--;
      return realGet(scope, key);
    });

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;

    expect(maxInflight).toBeLessThanOrEqual(20);
    expect(maxInflight).toBeGreaterThan(1);
    expect(exported.relations?.map((rel) => rel.storageKey)).toEqual(keys);
    expect(exported.relations).toHaveLength(25);
  });
});

describe("Export/import sessionless observation scope", () => {
  it("exports the migrated observation bucket and restores it on import", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, testSession.id, testSession);
    await kv.set(KV.observations(testSession.id), testObs.id, testObs);
    const migratedObs: CompressedObservation = {
      ...testObs,
      id: "obs_migrated",
      sessionId: "migrated",
    };
    await kv.set(KV.observations("migrated"), migratedObs.id, migratedObs);

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    expect(exported.observations[testSession.id]).toEqual([testObs]);
    expect(exported.observations["migrated"]).toEqual([migratedObs]);

    const target = mockKV();
    const targetSdk = mockSdk();
    registerExportImportFunction(targetSdk as never, target as never);
    const result = (await targetSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "merge",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(
      await target.get(KV.observations("migrated"), "obs_migrated"),
    ).toMatchObject({ id: "obs_migrated", sessionId: "migrated" });
  });

  it("clears the sessionless observation bucket on replace", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.observations("migrated"), "obs_migrated", {
      ...testObs,
      id: "obs_migrated",
      sessionId: "migrated",
    });

    const result = (await sdk.trigger("mem::import", {
      exportData: {
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessions: [],
        observations: {},
        memories: [],
        summaries: [],
      } as unknown as ExportData,
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.list(KV.observations("migrated"))).toEqual([]);
  });

  it("replace-imports a sessionless bucket above the per-session ceiling", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const rows = Array.from(
      { length: MAX_IMPORT_OBS_PER_SESSION + 1 },
      (_, i) => ({ ...testObs, id: `obs_mig_${i}`, sessionId: "migrated" }),
    );
    for (const row of rows) {
      await kv.set(KV.observations("migrated"), row.id, row);
    }

    const exported = (await sdk.trigger("mem::export", {})) as ExportData;
    expect(exported.observations["migrated"]).toHaveLength(
      MAX_IMPORT_OBS_PER_SESSION + 1,
    );

    const target = mockKV();
    const targetSdk = mockSdk();
    registerExportImportFunction(targetSdk as never, target as never);
    const result = (await targetSdk.trigger("mem::import", {
      exportData: exported,
      strategy: "replace",
    })) as { success: boolean; observations: number };

    expect(result.success).toBe(true);
    expect(result.observations).toBe(MAX_IMPORT_OBS_PER_SESSION + 1);
    expect(
      await target.list(KV.observations("migrated")),
    ).toHaveLength(MAX_IMPORT_OBS_PER_SESSION + 1);
  });

  it("still rejects a session bucket above the per-session ceiling", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const rows = Array.from(
      { length: MAX_IMPORT_OBS_PER_SESSION + 1 },
      (_, i) => ({ ...testObs, id: `obs_big_${i}`, sessionId: "ses_big" }),
    );

    const result = (await sdk.trigger("mem::import", {
      exportData: {
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessions: [],
        observations: { ses_big: rows },
        memories: [],
        summaries: [],
      } as unknown as ExportData,
      strategy: "merge",
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many observations in session ses_big");
  });

  it("still rejects a sessionless bucket above the total observation ceiling", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const row = { ...testObs, id: "obs_mig", sessionId: "migrated" };

    const result = (await sdk.trigger("mem::import", {
      exportData: {
        version: VERSION,
        exportedAt: new Date().toISOString(),
        sessions: [],
        observations: { migrated: new Array(500_001).fill(row) },
        memories: [],
        summaries: [],
      } as unknown as ExportData,
      strategy: "merge",
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Too many total observations");
  });
});

describe("Import image reference accounting", () => {
  const imageExport = (rows: Partial<ExportData>): ExportData =>
    ({
      version: VERSION,
      exportedAt: new Date().toISOString(),
      sessions: [],
      observations: {},
      memories: [],
      summaries: [],
      ...rows,
    }) as ExportData;

  it("registers an imageRef for each imported memory under merge", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const mem: Memory = { ...testMemory, id: "mem_img", imageRef: "/tmp/img-a.png" };

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({ memories: [mem] }),
      strategy: "merge",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, "/tmp/img-a.png")).toBe(1);
  });

  it("counts an observation's image once when imageData and imageRef match", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const obs: CompressedObservation = {
      ...testObs,
      id: "obs_img",
      imageData: "/tmp/img-b.png",
      imageRef: "/tmp/img-b.png",
    };

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({ observations: { ses_1: [obs] } }),
      strategy: "merge",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, "/tmp/img-b.png")).toBe(1);
  });

  it("moves the refcount when merge overwrites a memory with a new image", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);

    await sdk.trigger("mem::import", {
      exportData: imageExport({
        memories: [{ ...testMemory, id: "mem_img", imageRef: "/tmp/img-old.png" }],
      }),
      strategy: "merge",
    });
    await sdk.trigger("mem::import", {
      exportData: imageExport({
        memories: [{ ...testMemory, id: "mem_img", imageRef: "/tmp/img-new.png" }],
      }),
      strategy: "merge",
    });

    expect(await kv.get(KV.imageRefs, "/tmp/img-old.png")).toBeNull();
    expect(await kv.get(KV.imageRefs, "/tmp/img-new.png")).toBe(1);
  });

  it("does not double-count an unchanged memory merged twice", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    const data = imageExport({
      memories: [{ ...testMemory, id: "mem_img", imageRef: "/tmp/img-a.png" }],
    });

    await sdk.trigger("mem::import", { exportData: data, strategy: "merge" });
    await sdk.trigger("mem::import", { exportData: data, strategy: "merge" });

    expect(await kv.get(KV.imageRefs, "/tmp/img-a.png")).toBe(1);
  });

  it("adds no refcount for rows skipped under skip", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_img", {
      ...testMemory,
      id: "mem_img",
      imageRef: "/tmp/img-a.png",
    });
    await kv.set(KV.imageRefs, "/tmp/img-a.png", 1);

    await sdk.trigger("mem::import", {
      exportData: imageExport({
        memories: [{ ...testMemory, id: "mem_img", imageRef: "/tmp/img-a.png" }],
      }),
      strategy: "skip",
    });

    expect(await kv.get(KV.imageRefs, "/tmp/img-a.png")).toBe(1);
  });

  it("releases refcounts for rows deleted by replace", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, testSession.id, testSession);
    await kv.set(KV.observations(testSession.id), "obs_img", {
      ...testObs,
      id: "obs_img",
      imageData: "/tmp/img-obs.png",
    });
    await kv.set(KV.memories, "mem_img", {
      ...testMemory,
      id: "mem_img",
      imageRef: "/tmp/img-mem.png",
    });
    await kv.set(KV.imageRefs, "/tmp/img-obs.png", 1);
    await kv.set(KV.imageRefs, "/tmp/img-mem.png", 1);

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({}),
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, "/tmp/img-obs.png")).toBeNull();
    expect(await kv.get(KV.imageRefs, "/tmp/img-mem.png")).toBeNull();
  });

  it("keeps refs and embeddings for image paths re-imported under replace", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, testSession.id, testSession);
    const obs: CompressedObservation = {
      ...testObs,
      id: "obs_img",
      imageData: "/tmp/img-obs.png",
    };
    await kv.set(KV.observations(testSession.id), obs.id, obs);
    await kv.set(KV.imageRefs, "/tmp/img-obs.png", 1);
    await kv.set(KV.imageEmbeddings, "/tmp/img-obs.png", { dims: 3 });

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({
        sessions: [testSession],
        observations: { [testSession.id]: [obs] },
      }),
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, "/tmp/img-obs.png")).toBe(1);
    expect(await kv.get(KV.imageEmbeddings, "/tmp/img-obs.png")).toEqual({ dims: 3 });
  });

  it("releases only the net refcount for shared paths under replace", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.sessions, testSession.id, testSession);
    const shared = "/tmp/img-shared.png";
    const first: CompressedObservation = { ...testObs, id: "obs_a", imageData: shared };
    const second: CompressedObservation = { ...testObs, id: "obs_b", imageData: shared };
    await kv.set(KV.observations(testSession.id), first.id, first);
    await kv.set(KV.observations(testSession.id), second.id, second);
    await kv.set(KV.imageRefs, shared, 2);
    await kv.set(KV.imageEmbeddings, shared, { dims: 3 });

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({
        sessions: [testSession],
        observations: { [testSession.id]: [first] },
      }),
      strategy: "replace",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(await kv.get(KV.imageRefs, shared)).toBe(1);
    expect(await kv.get(KV.imageEmbeddings, shared)).toEqual({ dims: 3 });
  });

  it("keeps committed refcount changes when a later replace write fails", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    await kv.set(KV.memories, "mem_old", {
      ...testMemory,
      id: "mem_old",
      imageRef: "/tmp/img-p.png",
    });
    await kv.set(KV.imageRefs, "/tmp/img-p.png", 1);
    const originalSet = kv.set;
    vi.spyOn(kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.memories && key === "mem_fail") {
        throw new Error("memory write failed");
      }
      return originalSet(scope, key, value);
    });

    const result = await sdk
      .trigger("mem::import", {
        exportData: imageExport({
          memories: [
            { ...testMemory, id: "mem_q", imageRef: "/tmp/img-q.png" },
            { ...testMemory, id: "mem_fail", imageRef: "/tmp/img-f.png" },
          ],
        }),
        strategy: "replace",
      })
      .then(() => null, (error: Error) => error);

    expect(result).toMatchObject({ message: "memory write failed" });
    expect(await kv.get(KV.memories, "mem_q")).toMatchObject({ id: "mem_q" });
    expect(await kv.get(KV.memories, "mem_fail")).toBeNull();
    expect(await kv.get(KV.imageRefs, "/tmp/img-p.png")).toBeNull();
    expect(await kv.get(KV.imageRefs, "/tmp/img-q.png")).toBe(1);
    expect(await kv.get(KV.imageRefs, "/tmp/img-f.png")).toBeNull();
  });

  it("reserves image references in bounded parallel chunks", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerExportImportFunction(sdk as never, kv as never);
    let inFlight = 0;
    let maxInFlight = 0;
    const realGet = kv.get;
    vi.spyOn(kv, "get").mockImplementation(async (scope, key) => {
      if (scope === KV.imageRefs) {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight--;
      }
      return realGet(scope, key);
    });
    const memories = Array.from({ length: 60 }, (_, i) => ({
      ...testMemory,
      id: `mem_${i}`,
      imageRef: `/tmp/img-${i}.png`,
    }));

    const result = (await sdk.trigger("mem::import", {
      exportData: imageExport({ memories }),
      strategy: "merge",
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(20);
    for (let i = 0; i < 60; i++) {
      expect(await kv.get(KV.imageRefs, `/tmp/img-${i}.png`)).toBe(1);
    }
  });
});
