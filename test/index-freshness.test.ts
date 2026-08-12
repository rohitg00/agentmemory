import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { evaluateHealth } from "../src/health/thresholds.js";
import type { HealthSnapshot } from "../src/types.js";

function snapshot(
  indexPersistence?: HealthSnapshot["indexPersistence"],
): HealthSnapshot {
  return {
    connectionState: "connected",
    workers: [],
    memory: { heapUsed: 10, heapTotal: 100, rss: 10 * 1024 * 1024, external: 0 },
    cpu: { userMicros: 0, systemMicros: 0, percent: 1 },
    eventLoopLagMs: 1,
    uptimeSeconds: 100,
    kvConnectivity: { status: "ok", latencyMs: 1 },
    indexPersistence,
    status: "healthy",
    alerts: [],
  };
}

describe("search-index freshness in health", () => {
  it("reports docs, vectors and save age as a note when the index is being written", () => {
    const res = evaluateHealth(
      snapshot({
        bm25Docs: 12400,
        vectors: 12400,
        lastSavedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        lastError: null,
        dirtySince: null,
        stale: false,
      }),
    );
    expect(res.status).toBe("healthy");
    expect(res.notes.join(" ")).toContain("index_docs_12400_vec_12400_saved_5m_ago");
  });

  it("degrades when the index has been dirty past the stale window", () => {
    const res = evaluateHealth(
      snapshot({
        bm25Docs: 12400,
        vectors: 12400,
        lastSavedAt: new Date(Date.now() - 20 * 24 * 3600_000).toISOString(),
        lastError: null,
        dirtySince: Date.now() - 3 * 3600_000,
        stale: true,
      }),
    );
    expect(res.status).toBe("degraded");
    expect(res.alerts.some((a) => a.startsWith("index_persist_stale_"))).toBe(true);
  });

  it("degrades when the last save failed", () => {
    const res = evaluateHealth(
      snapshot({
        bm25Docs: 100,
        vectors: 0,
        lastSavedAt: null,
        lastError: "TIMEOUT: invocation timed out after 180000ms",
        dirtySince: Date.now(),
        stale: false,
      }),
    );
    expect(res.status).toBe("degraded");
    expect(res.alerts).toContain("index_persist_error");
  });

  it("says nothing when the snapshot carries no index information", () => {
    const res = evaluateHealth(snapshot(undefined));
    expect(res.status).toBe("healthy");
    expect(res.notes.join(" ")).not.toContain("index_");
  });
});

describe("index persistence status tracking", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts clean, marks dirty on scheduleSave and reports stale only past the window", async () => {
    const { getIndexPersistenceStatus, resetIndexPersistenceStatus, IndexPersistence } =
      await import("../src/state/index-persistence.js");
    const { SearchIndex } = await import("../src/state/search-index.js");
    resetIndexPersistenceStatus();

    expect(getIndexPersistenceStatus().dirtySince).toBeNull();
    expect(getIndexPersistenceStatus().stale).toBe(false);

    const kv = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      list: async () => [],
    };
    const persistence = new IndexPersistence(kv as never, new SearchIndex(), null);
    persistence.scheduleSave();

    const dirty = getIndexPersistenceStatus();
    expect(dirty.dirtySince).not.toBeNull();
    expect(dirty.stale).toBe(false); // just went dirty, well inside the window

    persistence.stop();
  });
});
