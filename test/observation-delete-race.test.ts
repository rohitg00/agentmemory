import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerAutoForgetFunction } from "../src/functions/auto-forget.js";
import { registerEvictFunction } from "../src/functions/evict.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { pendingCompression } from "../src/functions/compression-state.js";
import { getSearchIndex, setEmbeddingProvider, setIndexPersistence, setVectorIndex, vectorIndexAddGuarded } from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const sessionId = "delete-race";
const xml = "<observation><type>file_edit</type><title>Updated configuration</title><facts><fact>The port was updated.</fact></facts><narrative>The configuration was updated and verified for the local service.</narrative><concepts><concept>configuration</concept></concepts><files><file>config.ts</file></files><importance>1</importance></observation>";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture() {
  const store = new Map<string, Map<string, unknown>>();
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const kv = {
    get: async <T>(scope: string, key: string): Promise<T | null> => structuredClone(store.get(scope)?.get(key) ?? null) as T | null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, structuredClone(value));
      return value;
    },
    list: async <T>(scope: string): Promise<T[]> => structuredClone([...store.get(scope)?.values() ?? []]) as T[],
    delete: async (scope: string, key: string) => { store.get(scope)?.delete(key); },
  };
  const sdk = {
    registerFunction: (id: string, handler: (data: any) => Promise<any>) => handlers.set(id, handler),
    trigger: async ({ function_id: id, payload }: { function_id: string; payload: any }) => id.startsWith("stream::") ? {} : handlers.get(id)!(payload),
  };
  const obs: CompressedObservation = {
    ...buildSyntheticCompression({ id: "obs_race", sessionId, timestamp: "2020-01-01T00:00:00Z", hookType: "post_tool_use", toolName: "Edit", toolOutput: "Original durable evidence", raw: {} }),
    importance: 1, compression: pendingCompression(),
  };
  await kv.set(KV.sessions, sessionId, { id: sessionId, project: "race", cwd: "/race", startedAt: new Date().toISOString() });
  await kv.set(KV.observations(sessionId), obs.id, obs);
  getSearchIndex().add(obs);
  const vectors = new VectorIndex(); vectors.add(obs.id, sessionId, new Float32Array([1, 0])); setVectorIndex(vectors);
  const save = vi.fn(async () => {}); setIndexPersistence({ scheduleSave: vi.fn(), save });
  registerRememberFunction(sdk as never, kv as never);
  registerAutoForgetFunction(sdk as never, kv as never);
  registerEvictFunction(sdk as never, kv as never);
  registerCompressFunction(sdk as never, kv as never, { name: "fixture", compress: async () => xml, summarize: vi.fn() });
  const call = (id: string, payload: any = {}) => sdk.trigger({ function_id: id, payload });
  return { kv, obs, vectors, save, call };
}

beforeEach(() => { getSearchIndex().clear(); });
afterEach(() => {
  vi.restoreAllMocks();
  getSearchIndex().clear(); setVectorIndex(null); setEmbeddingProvider(null); setIndexPersistence(null);
});

describe("observation deletion and compression commits", () => {
  it.each(["selected", "session", "auto-forget", "evict"])("serializes %s deletion with a compression commit and removes both indexes", async (mode) => {
    const f = await fixture(); const entered = deferred(); const release = deferred();
    const write = f.kv.set;
    vi.spyOn(f.kv, "set").mockImplementation(async (scope, key, value) => {
      if (scope === KV.observations(sessionId) && (value as CompressedObservation).compression?.status === "complete") {
        entered.resolve(); await release.promise;
      }
      return write(scope, key, value);
    });
    const compression = f.call("mem::compress", { sessionId, observationId: f.obs.id });
    await entered.promise;
    let deleting: Promise<unknown>;
    if (mode === "selected") deleting = f.call("mem::forget", { sessionId, observationIds: [f.obs.id] });
    else if (mode === "session") deleting = f.call("mem::forget", { sessionId });
    else deleting = f.call(mode === "auto-forget" ? "mem::auto-forget" : "mem::evict");
    await new Promise((resolve) => setImmediate(resolve));
    expect(await f.kv.get(KV.observations(sessionId), f.obs.id)).not.toBeNull();
    release.resolve();
    await Promise.all([compression, deleting]);
    expect(await f.kv.get(KV.observations(sessionId), f.obs.id)).toBeNull();
    expect(getSearchIndex().has(f.obs.id)).toBe(false);
    expect(f.vectors.has(f.obs.id)).toBe(false);
    expect(f.save).toHaveBeenCalled();
    if (mode === "session") expect(await f.kv.get(KV.sessions, sessionId)).toBeNull();
  });

  it("invalidates a delayed vector job when project-cap eviction deletes its observation", async () => {
    const f = await fixture(); const entered = deferred(); const release = deferred();
    await f.kv.set(KV.config, "eviction", { lowImportanceMaxDays: 10000, maxObservationsPerProject: 0 });
    setEmbeddingProvider({ name: "deferred", dimensions: 2, embed: async () => { entered.resolve(); await release.promise; return new Float32Array([0, 1]); }, embedBatch: async () => [] });
    const adding = vectorIndexAddGuarded(f.obs.id, sessionId, "stale embedding", { kind: "observation", logId: f.obs.id });
    await entered.promise;
    expect(await f.call("mem::evict")).toMatchObject({ capEvictions: 1 });
    release.resolve();
    expect(await adding).toBe(false);
    expect(await f.kv.get(KV.observations(sessionId), f.obs.id)).toBeNull();
    expect(getSearchIndex().has(f.obs.id)).toBe(false);
    expect(f.vectors.has(f.obs.id)).toBe(false);
    expect(f.save).toHaveBeenCalled();
  });

  it.each(["auto-forget", "low-importance", "cap"])("rechecks a %s candidate changed after the sweep's scan", async (mode) => {
    const f = await fixture(); const scanned = deferred(); const release = deferred();
    if (mode === "cap") await f.kv.set(KV.config, "eviction", { lowImportanceMaxDays: 10000, maxObservationsPerProject: 0 });
    const list = f.kv.list; let paused = false;
    vi.spyOn(f.kv, "list").mockImplementation(async (scope) => {
      const rows = await list(scope);
      if (scope === KV.observations(sessionId) && !paused) { paused = true; scanned.resolve(); await release.promise; }
      return rows;
    });
    const sweeping = f.call(mode === "auto-forget" ? "mem::auto-forget" : "mem::evict");
    await scanned.promise;
    const revised = { ...f.obs, importance: 9, title: "New important evidence" };
    await withKeyedLock(`obs:${sessionId}`, () => f.kv.set(KV.observations(sessionId), f.obs.id, revised));
    release.resolve(); await sweeping;
    expect(await f.kv.get(KV.observations(sessionId), f.obs.id)).toEqual(revised);
    expect(getSearchIndex().has(f.obs.id)).toBe(true);
    expect(f.vectors.has(f.obs.id)).toBe(true);
  });
});
