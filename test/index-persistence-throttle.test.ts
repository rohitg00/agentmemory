import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexPersistence, V8_MAX_STRING_CHARS } from "../src/state/index-persistence.js";
import { SearchIndex } from "../src/state/search-index.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { evaluateStatus, renderStatusHtml, type StatusInputs } from "../src/functions/status.js";
import type { CompressedObservation } from "../src/types.js";

const BM25_SCOPE = "mem:index:bm25";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const sets: Array<{ scope: string; key: string }> = [];
  return {
    sets,
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> => (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      sets.push({ scope, key });
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

function obs(id: string, title: string): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title,
    facts: [],
    narrative: `${title} narrative`,
    concepts: [],
    files: [],
    importance: 5,
  };
}

function manifestSaves(kv: ReturnType<typeof mockKV>, key: string): number {
  return kv.sets.filter((s) => s.scope === BM25_SCOPE && s.key === key).length;
}

describe("IndexPersistence save throttling", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    kv = mockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves at most once per interval however often changes are scheduled", async () => {
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const persistence = new IndexPersistence(kv as never, bm25, null, { saveIntervalMs: 60_000 });

    for (let i = 0; i < 50; i++) persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(1);

    for (let i = 0; i < 50; i++) persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(2);
  });

  it("an explicit save runs immediately and cancels the pending timer", async () => {
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const persistence = new IndexPersistence(kv as never, bm25, null, { saveIntervalMs: 60_000 });

    persistence.scheduleSave();
    await persistence.save();
    expect(manifestSaves(kv, "data:manifest")).toBe(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(1);
  });

  it("never runs two saves at once and coalesces requests made during a save into one", async () => {
    let release: () => void = () => undefined;
    let inFlight = 0;
    let maxInFlight = 0;
    let gate: Promise<void> | null = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (gate) await gate;
        const result = await kv.set(scope, key, data);
        inFlight--;
        return result;
      },
    };
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const persistence = new IndexPersistence(slowKv as never, bm25, null, { saveIntervalMs: 60_000 });

    const first = persistence.save();
    const second = persistence.save();
    const third = persistence.save();
    expect(second).toBe(third);
    expect(persistence.status().saving).toBe(true);

    gate = null;
    release();
    await Promise.all([first, second, third]);

    expect(manifestSaves(kv, "data:manifest")).toBe(2);
    expect(maxInFlight).toBe(1);
    expect(persistence.status().saving).toBe(false);
  });

  it("a failing BM25 leg does not stop the vector leg from saving", async () => {
    const failingKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === "data:manifest") throw new Error("bm25 manifest write failed");
        return kv.set(scope, key, data);
      },
    };
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const vector = new VectorIndex();
    vector.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    const persistence = new IndexPersistence(failingKv as never, bm25, vector, { saveIntervalMs: 60_000 });

    persistence.scheduleSave();
    await persistence.save();

    const status = persistence.status();
    expect(status.bm25.lastError).toBe("bm25 manifest write failed");
    expect(status.bm25.dirtySince).not.toBeNull();
    expect(status.vector?.lastError).toBeNull();
    expect(status.vector?.lastSavedAt).not.toBeNull();
    expect(status.vector?.dirtySince).toBeNull();
    expect(status.vector?.serializedChars).toBeGreaterThan(0);

    const loaded = await new IndexPersistence(kv as never, new SearchIndex(), null).load();
    expect(loaded.bm25).toBeNull();
    expect(loaded.vector?.size).toBe(1);
  });

  it("keeps a leg dirty when a change arrives while it is being saved", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const slowKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (!held) {
          held = true;
          await gate;
        }
        return kv.set(scope, key, data);
      },
    };
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const persistence = new IndexPersistence(slowKv as never, bm25, null, { saveIntervalMs: 60_000 });

    const saving = persistence.save();
    persistence.scheduleSave();
    release();
    await saving;

    expect(persistence.status().bm25.lastSavedAt).not.toBeNull();
    expect(persistence.status().bm25.dirtySince).not.toBeNull();

    await persistence.save();
    expect(persistence.status().bm25.dirtySince).toBeNull();
  });

  it("clears vector dirtySince when a change arrives during the bm25 leg's write", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldBm25Manifest = false;
    const slowKv = {
      ...kv,
      set: async <T>(scope: string, key: string, data: T): Promise<T> => {
        if (scope === BM25_SCOPE && key === "data:manifest" && !heldBm25Manifest) {
          heldBm25Manifest = true;
          await gate;
        }
        return kv.set(scope, key, data);
      },
    };
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const vector = new VectorIndex();
    vector.add("obs_1", "ses_1", new Float32Array([0.1, 0.2, 0.3]));
    const persistence = new IndexPersistence(slowKv as never, bm25, vector, { saveIntervalMs: 60_000 });

    const saving = persistence.save();
    persistence.scheduleSave();
    release();
    await saving;

    const status = persistence.status();
    expect(status.bm25.dirtySince).not.toBeNull();
    expect(status.vector?.dirtySince).toBeNull();
    expect(status.vector?.lastSavedAt).not.toBeNull();
  });

  it("stop prevents later scheduled saves", async () => {
    const bm25 = new SearchIndex();
    bm25.add(obs("obs_1", "alpha"));
    const persistence = new IndexPersistence(kv as never, bm25, null, { saveIntervalMs: 1_000 });
    persistence.stop();
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(manifestSaves(kv, "data:manifest")).toBe(0);
  });
});

function statusInputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    now: new Date("2026-09-25T12:00:00.000Z"),
    version: "0.9.29",
    engineVersion: "0.22.1",
    uptimeSeconds: 100,
    ports: { rest: 3111, streams: 3112, viewer: 3113 },
    health: { status: "healthy", alerts: [], notes: [], connectionState: "connected" },
    circuitBreaker: null,
    functionMetrics: [],
    provider: "llm",
    embeddingProvider: "embeddings",
    flags: [],
    index: { bm25Documents: 1, vectorDocuments: 1, observationsIndexed: 1, missingObservations: 0, sessions: 1 },
    graph: null,
    graphExtractionEnabled: false,
    ...overrides,
  };
}

const cleanLeg = {
  lastSavedAt: "2026-09-25T11:59:00.000Z",
  lastError: null,
  lastErrorAt: null,
  dirtySince: null,
  serializedChars: 1000,
};

describe("status reports index persistence", () => {
  it("is quiet when both legs saved cleanly", () => {
    const report = evaluateStatus(
      statusInputs({ indexPersistence: { saveIntervalMs: 600_000, saving: false, bm25: cleanLeg, vector: cleanLeg } }),
    );
    expect(report.problems).toEqual([]);
    expect(report.indexPersistence?.vector?.serializedChars).toBe(1000);
  });

  it("reports a failing leg as an error", () => {
    const report = evaluateStatus(
      statusInputs({
        indexPersistence: {
          saveIntervalMs: 600_000,
          saving: false,
          bm25: cleanLeg,
          vector: { ...cleanLeg, lastError: "Invalid string length", lastErrorAt: "2026-09-25T11:59:30.000Z" },
        },
      }),
    );
    expect(report.status).toBe("error");
    expect(report.problems.map((p) => p.code)).toEqual(["index-save-failing"]);
    expect(report.problems[0].message).toContain("vector");
  });

  it("warns when the vector index passes 80% of the Node.js string limit", () => {
    const report = evaluateStatus(
      statusInputs({
        indexPersistence: {
          saveIntervalMs: 600_000,
          saving: false,
          bm25: cleanLeg,
          vector: { ...cleanLeg, serializedChars: Math.ceil(V8_MAX_STRING_CHARS * 0.85) },
        },
      }),
    );
    expect(report.status).toBe("warn");
    expect(report.problems.map((p) => p.code)).toEqual(["vector-index-near-string-limit"]);
    expect(report.problems[0].message).toContain("85%");
  });

  it("warns when unsaved changes are older than twice the save interval", () => {
    const report = evaluateStatus(
      statusInputs({
        indexPersistence: {
          saveIntervalMs: 600_000,
          saving: false,
          bm25: { ...cleanLeg, dirtySince: "2026-09-25T11:30:00.000Z" },
          vector: { ...cleanLeg, dirtySince: "2026-09-25T11:55:00.000Z" },
        },
      }),
    );
    expect(report.problems.map((p) => p.code)).toEqual(["index-save-stale"]);
    expect(report.problems[0].message).toContain("BM25");
  });

  it("shows save state and vector size on the status page", () => {
    const report = evaluateStatus(
      statusInputs({
        indexPersistence: {
          saveIntervalMs: 600_000,
          saving: false,
          bm25: { ...cleanLeg, dirtySince: "2026-09-25T11:59:50.000Z" },
          vector: { ...cleanLeg, serializedChars: 53_687_089 },
        },
      }),
    );
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("<th>BM25 save</th><td>saved 1m ago, unsaved changes pending</td>");
    expect(html).toContain("53,687,089 characters (10% of the Node.js string limit)");
  });
});
