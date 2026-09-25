import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexPersistence } from "../src/state/index-persistence.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { evaluateStatus, renderStatusHtml, type StatusInputs } from "../src/functions/status.js";

const META_KEY = "vectors:meta";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const sets: Array<{ scope: string; key: string }> = [];
  return {
    sets,
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

function metaSaves(kv: ReturnType<typeof mockKV>): number {
  return kv.sets.filter((s) => s.key === META_KEY).length;
}

function touch(vector: VectorIndex, id: string): void {
  vector.add(id, "ses_1", new Float32Array([Math.random(), 0.2, 0.3]));
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
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 60_000, buckets: 16 });

    for (let i = 0; i < 50; i++) {
      touch(vector, `obs_${i}`);
      persistence.scheduleSave();
    }
    await vi.advanceTimersByTimeAsync(59_000);
    expect(metaSaves(kv)).toBe(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(metaSaves(kv)).toBe(1);

    for (let i = 0; i < 50; i++) {
      touch(vector, `obs_more_${i}`);
      persistence.scheduleSave();
    }
    await vi.advanceTimersByTimeAsync(30_000);
    expect(metaSaves(kv)).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(metaSaves(kv)).toBe(2);
  });

  it("an explicit save runs immediately and cancels the pending timer", async () => {
    const vector = new VectorIndex();
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 60_000, buckets: 16 });

    touch(vector, "obs_1");
    persistence.scheduleSave();
    await persistence.save();
    expect(metaSaves(kv)).toBe(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(metaSaves(kv)).toBe(1);
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
    const vector = new VectorIndex();
    touch(vector, "obs_1");
    const persistence = new IndexPersistence(slowKv as never, vector, { saveIntervalMs: 60_000, buckets: 16 });

    const first = persistence.save();
    touch(vector, "obs_2");
    const second = persistence.save();
    const third = persistence.save();
    expect(second).toBe(third);
    expect(persistence.status().saving).toBe(true);

    gate = null;
    release();
    await Promise.all([first, second, third]);

    expect(metaSaves(kv)).toBe(2);
    expect(maxInFlight).toBe(1);
    expect(persistence.status().saving).toBe(false);
  });

  it("keeps the index dirty when a change arrives while it is being saved", async () => {
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
    const vector = new VectorIndex();
    touch(vector, "obs_1");
    const persistence = new IndexPersistence(slowKv as never, vector, { saveIntervalMs: 60_000, buckets: 16 });

    const saving = persistence.save();
    touch(vector, "obs_2");
    persistence.scheduleSave();
    release();
    await saving;

    expect(persistence.status().vector?.lastSavedAt).not.toBeNull();
    expect(persistence.status().vector?.dirtySince).not.toBeNull();

    await persistence.save();
    expect(persistence.status().vector?.dirtySince).toBeNull();
  });

  it("stop prevents later scheduled saves", async () => {
    const vector = new VectorIndex();
    touch(vector, "obs_1");
    const persistence = new IndexPersistence(kv as never, vector, { saveIntervalMs: 1_000, buckets: 16 });
    persistence.stop();
    persistence.scheduleSave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(metaSaves(kv)).toBe(0);
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
};

function persistenceStatus(vector: typeof cleanLeg | null, pendingChanges = 0) {
  return { saveIntervalMs: 600_000, saving: false, buckets: 256, pendingChanges, vector };
}

describe("status reports index persistence", () => {
  it("is quiet when the vector index saved cleanly", () => {
    const report = evaluateStatus(statusInputs({ indexPersistence: persistenceStatus(cleanLeg) }));
    expect(report.problems).toEqual([]);
    expect(report.indexPersistence?.buckets).toBe(256);
  });

  it("reports a failing vector save as an error", () => {
    const report = evaluateStatus(
      statusInputs({
        indexPersistence: persistenceStatus({
          ...cleanLeg,
          lastError: "3 of 10 vector writes failed: timed out",
          lastErrorAt: "2026-09-25T11:59:30.000Z",
        } as never),
      }),
    );
    expect(report.status).toBe("error");
    expect(report.problems.map((p) => p.code)).toEqual(["index-save-failing"]);
    expect(report.problems[0].message).toContain("3 of 10 vector writes failed");
  });

  it("warns when unsaved changes are older than twice the save interval", () => {
    const report = evaluateStatus(
      statusInputs({ indexPersistence: persistenceStatus({ ...cleanLeg, dirtySince: "2026-09-25T11:30:00.000Z" } as never, 4) }),
    );
    expect(report.problems.map((p) => p.code)).toEqual(["index-save-stale"]);
  });

  it("does not report vector persistence when vector search is off", () => {
    const report = evaluateStatus(statusInputs({ indexPersistence: persistenceStatus(null) }));
    expect(report.problems).toEqual([]);
  });

  it("shows save state and bucket storage on the status page", () => {
    const report = evaluateStatus(
      statusInputs({ indexPersistence: persistenceStatus({ ...cleanLeg, dirtySince: "2026-09-25T11:59:50.000Z" } as never, 3) }),
    );
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("<th>BM25 index</th><td>rebuilt from stored content at boot</td>");
    expect(html).toContain("<th>Vector save</th><td>saved 1m ago, unsaved changes pending</td>");
    expect(html).toContain("<th>Vector storage</th><td>256 buckets, 3 unsaved changes</td>");
  });
});
