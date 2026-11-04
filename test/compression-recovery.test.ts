import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCompressFunction, COMPRESSION_TIMEOUT_MS } from "../src/functions/compress.js";
import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCompressionApi } from "../src/triggers/compression.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";
import { observationRevision, pendingCompression } from "../src/functions/compression-state.js";
import { getSearchIndex, setEmbeddingProvider, setVectorIndex, vectorIndexRemove } from "../src/functions/search.js";
import { VectorIndex } from "../src/state/vector-index.js";
import { KV } from "../src/state/schema.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import { SAFE_PAYLOAD_BYTES, payloadByteLength } from "../src/state/frame-guard.js";
import type { MemoryProvider, RawObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const xml = '<observation><type>file_read</type><title>Recovered cobalt configuration</title><facts><fact>The cobalt port is 9921.</fact></facts><narrative>Read the cobalt deployment configuration successfully.</narrative><concepts><concept>configuration</concept></concepts><files></files><importance>6</importance></observation>';
const raw = (id = "obs-recovery", sessionId = "session-recovery"): RawObservation => ({
  id, sessionId, timestamp: "2026-10-13T00:00:00Z", hookType: "post_tool_use", toolName: "Read",
  toolOutput: "cobalt retained evidence <private>hidden-canary</private>", raw: {},
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function store() {
  const values = new Map<string, Map<string, any>>();
  return {
    get: async (scope: string, id: string) => structuredClone(values.get(scope)?.get(id) ?? null),
    list: async (scope: string) => structuredClone([...(values.get(scope)?.values() ?? [])]),
    set: async (scope: string, id: string, value: any) => {
      if (!values.has(scope)) values.set(scope, new Map());
      values.get(scope)!.set(id, structuredClone(value)); return value;
    },
    update: async (scope: string, id: string, updates: any[]) => {
      const row = values.get(scope)!.get(id);
      for (const update of updates) { if (update.type === "remove") delete row[update.path]; else row[update.path] = update.value; }
    },
    delete: async (scope: string, id: string) => { values.get(scope)?.delete(id); },
  };
}
function rig(provider: MemoryProvider = { name: "test", compress: vi.fn(async () => xml), summarize: vi.fn() }, kv = store()) {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const pending: Promise<unknown>[] = [];
  const sdk = {
    registerFunction: (id: string, fn: any) => handlers.set(id, fn), registerTrigger: vi.fn(),
    trigger: vi.fn(async (input: any) => {
      const result = handlers.get(input.function_id)?.({ ...input.payload, _caller_worker_id: "fixture-worker" });
      if (input.function_id === "mem::compress" && input.action) { if (result) pending.push(result); return undefined; }
      return result;
    }),
  };
  registerCompressFunction(sdk as never, kv as never, provider);
  registerObserveFunction(sdk as never, kv as never);
  registerCompressionApi(sdk as never, "test-auth");
  const call = (id: string, input: any) => handlers.get(id)!(input);
  const seed = async (id = "obs-recovery", sessionId = "session-recovery", project = "project-a", agentId = "agent-a") => {
    await kv.set(KV.sessions, sessionId, { id: sessionId, project, agentId, observationCount: 1, status: "active", startedAt: raw().timestamp });
    await kv.set(KV.observations(sessionId), id, raw(id, sessionId));
  };
  return { kv, sdk, provider, call, seed, flush: () => Promise.all(pending.splice(0)) };
}
beforeEach(() => { getSearchIndex().clear(); setEmbeddingProvider(null); setVectorIndex(null); vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); setEmbeddingProvider(null); setVectorIndex(null); });

describe("compression recovery", () => {
  it("keeps failed automatic capture searchable, then recovers after restart without changing identity or counts", async () => {
    const provider = { name: "test", compress: vi.fn(async () => { throw new Error("private-provider-body"); }), summarize: vi.fn() };
    const r = rig(provider);
    const captured = await r.call("mem::observe", { sessionId: "session-recovery", project: "project-a", cwd: "/fixture", hookType: "post_tool_use", timestamp: raw().timestamp,
      data: { tool_name: "Read", tool_output: raw().toolOutput } });
    await r.flush();
    const original = await r.kv.get(KV.observations("session-recovery"), captured.observationId);
    expect(original.compression).toMatchObject({ status: "failed", attempts: 1, error: "compression_failed" });
    expect(original.narrative).toContain("cobalt");
    expect(getSearchIndex().has(captured.observationId)).toBe(true);
    expect(JSON.stringify(original)).not.toContain("hidden-canary");
    const restarted = rig(undefined, r.kv);
    const inspect = await restarted.call("mem::compression-status", { sessionId: "session-recovery" });
    expect(inspect).toMatchObject({ dryRun: true, attempted: 0, items: [{ status: "failed", retryable: true }] });
    expect(restarted.provider.compress).not.toHaveBeenCalled();
    expect(JSON.stringify(inspect)).not.toContain("cobalt");
    expect(await restarted.call("mem::compression-retry", { sessionId: "session-recovery" })).toMatchObject({ success: true, recovered: 1 });
    const recovered = await r.kv.get(KV.observations("session-recovery"), captured.observationId);
    expect(recovered).toMatchObject({ id: original.id, timestamp: original.timestamp, source: original.source, compression: { status: "complete", attempts: 2 } });
    expect(await r.kv.get(KV.sessions, "session-recovery")).toMatchObject({ observationCount: 1 });
    expect(await restarted.call("mem::compression-retry", { sessionId: "session-recovery" })).toMatchObject({ attempted: 0, recovered: 0 });
    expect(restarted.provider.compress).toHaveBeenCalledOnce();
  });

  it("accepts the engine caller envelope only at the internal function boundary", async () => {
    const r = rig(); await r.seed();
    expect(await r.call("mem::compression-status", { sessionId: "session-recovery", _caller_worker_id: "engine-worker" })).toMatchObject({ dryRun: true, items: [{ status: "raw" }] });
    expect(await r.call("mem::compression-retry", { sessionId: "session-recovery", _caller_worker_id: "engine-worker" })).toMatchObject({ recovered: 1 });
  });

  it.each(["provider", "parse"])("preserves oversized legacy raw through %s failure and restart until successful bounded recovery", async (failure) => {
    const r = rig({ name: "test", compress: vi.fn(async () => {
      if (failure === "provider") throw new Error("down");
      return "invalid output";
    }), summarize: vi.fn() });
    await r.seed("a"); await r.seed("b");
    const original = { ...raw("a"), toolOutput: raw().toolOutput + "z".repeat(40_000) + "preserved-tail-marker" };
    await r.kv.set(KV.observations("session-recovery"), "a", original);
    const result = await r.call("mem::compression-retry", { project: "project-a", limit: 100 });
    expect(result).toMatchObject({ success: false, attempted: 1, recovered: 0, failed: 1, items: [{ truncated: true, retryable: true }] });
    expect(r.provider.compress).toHaveBeenCalledTimes(failure === "provider" ? 1 : 2);
    const failed = await r.kv.get(KV.observations("session-recovery"), "a");
    const { compression, ...retained } = failed;
    expect(retained).toEqual(original);
    expect(compression).toMatchObject({ attempts: 1, status: "failed", error: failure === "provider" ? "compression_failed" : "parse_failed" });
    expect(getSearchIndex().has("a")).toBe(false);
    expect(r.sdk.trigger.mock.calls.some(([input]) => input.function_id === "stream::send")).toBe(false);
    const modelCalls = JSON.stringify(vi.mocked(r.provider.compress).mock.calls);
    for (const canary of ["hidden-canary", "preserved-tail-marker"]) {
      expect(modelCalls).not.toContain(canary);
      expect(JSON.stringify(result)).not.toContain(canary);
    }
    expect(await r.kv.get(KV.observations("session-recovery"), "b")).toHaveProperty("hookType");
    const restarted = rig(undefined, r.kv);
    const inspect = await restarted.call("api::compression-status", { method: "GET", headers: { authorization: "Bearer test-auth" }, query_params: { sessionId: "session-recovery" } });
    expect(inspect).toMatchObject({ status_code: 200, body: { items: [{ observationId: "a", status: "failed", attempts: 1, retryable: true }, { observationId: "b", status: "raw", attempts: 0 }] } });
    expect(JSON.stringify(inspect)).not.toContain("hidden-canary");
    expect(JSON.stringify(inspect)).not.toContain("preserved-tail-marker");
    expect(restarted.provider.compress).not.toHaveBeenCalled();
    expect(await restarted.call("mem::compression-retry", { sessionId: "session-recovery", limit: 1 })).toMatchObject({ success: true, recovered: 1, items: [{ truncated: true }] });
    const recovered = await r.kv.get(KV.observations("session-recovery"), "a");
    expect(recovered).toMatchObject({ id: original.id, timestamp: original.timestamp, source: { truncated: true }, compression: { attempts: 2, status: "complete" } });
    expect(recovered).not.toHaveProperty("toolOutput");
    expect(Buffer.byteLength(JSON.stringify(recovered.source))).toBeLessThanOrEqual(16 * 1024);
    expect(JSON.stringify(recovered)).not.toContain("hidden-canary");
    expect(JSON.stringify(restarted.sdk.trigger.mock.calls)).not.toContain("hidden-canary");
    expect(JSON.stringify(restarted.sdk.trigger.mock.calls)).not.toContain("preserved-tail-marker");
    expect(getSearchIndex().has("a")).toBe(true);
    expect(await r.kv.get(KV.sessions, "session-recovery")).toMatchObject({ observationCount: 1 });
  });

  it("single-flights concurrent retries within one store while keeping independent stores separate", async () => {
    const first = deferred<string>(); const second = deferred<string>();
    const p1 = { name: "test", compress: vi.fn(() => first.promise), summarize: vi.fn() };
    const p2 = { name: "test", compress: vi.fn(() => second.promise), summarize: vi.fn() };
    const a = rig(p1); const b = rig(p2); await a.seed(); await b.seed();
    const tasks = [a.call("mem::compression-retry", { sessionId: "session-recovery" }), a.call("mem::compression-retry", { sessionId: "session-recovery" }), b.call("mem::compression-retry", { sessionId: "session-recovery" })];
    await vi.waitFor(() => { expect(p1.compress).toHaveBeenCalledOnce(); expect(p2.compress).toHaveBeenCalledOnce(); });
    first.resolve(xml); second.resolve(xml); await Promise.all(tasks);
    expect(await a.kv.get(KV.observations("session-recovery"), raw().id)).toMatchObject({ compression: { attempts: 1, status: "complete" } });
    expect(await b.kv.get(KV.observations("session-recovery"), raw().id)).toMatchObject({ compression: { attempts: 1, status: "complete" } });
  });

  it.each(["project", "agentId"])("does not return shared compression outside a joining caller's %s scope", async (field) => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const scoped = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id,
      scope: { [field]: "unrelated" } });
    model.resolve(xml);
    expect(await automatic).toMatchObject({ success: true });
    expect(await scoped).toMatchObject({ skipped: true });
    expect(await scoped).not.toHaveProperty("compressed");
    expect(provider.compress).toHaveBeenCalledOnce();
  });

  it.each(["project", "agentId"])("revalidates a joining retry after session-start changes its %s", async (field) => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const claimed = await r.kv.get(KV.observations("session-recovery"), raw().id);
    const scoped = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id,
      expectedRevision: observationRevision(claimed), scope: { project: "project-a", agentId: "agent-a" } });
    const retry = r.call("mem::compression-retry", { project: "project-a", agentId: "agent-a" });
    await vi.waitFor(() => expect(r.sdk.trigger.mock.calls.some(([input]) => input.function_id === "mem::compress")).toBe(true));
    registerApiTriggers(r.sdk as never, r.kv as never, "test-auth");
    r.sdk.registerFunction("mem::context", async () => ({ context: "" }));
    expect(await r.call("api::session::start", { method: "POST", headers: { authorization: "Bearer test-auth" },
      body: { sessionId: "session-recovery", project: "project-a", agentId: "agent-a", [field]: `${field}-b`, cwd: "/fixture-b" } })).toMatchObject({ status_code: 200 });
    model.resolve(xml);
    expect(await automatic).toMatchObject({ success: true });
    expect(await scoped).toMatchObject({ skipped: true });
    expect(await scoped).not.toHaveProperty("compressed");
    expect(await retry).toMatchObject({ recovered: 0, items: [{ outcome: "changed" }] });
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toMatchObject({ compression: { status: "complete" } });
  });

  it("rejects an obsolete expected revision even while the requested observation is active", async () => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const obsolete = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id, expectedRevision: "obsolete" });
    model.resolve(xml); await automatic;
    expect(await obsolete).toMatchObject({ skipped: true });
    expect(await obsolete).not.toHaveProperty("compressed");
    expect(provider.compress).toHaveBeenCalledOnce();
  });

  it("keeps an observation's explicit agent scope when the session agent changes", async () => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    await r.kv.set(KV.observations("session-recovery"), raw().id, { ...raw(), agentId: "agent-a" });
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const retry = r.call("mem::compression-retry", { project: "project-a", agentId: "agent-a" });
    await vi.waitFor(() => expect(r.sdk.trigger.mock.calls.some(([input]) => input.function_id === "mem::compress")).toBe(true));
    const session = await r.kv.get(KV.sessions, "session-recovery");
    await withKeyedLock("obs:session-recovery", () => r.kv.set(KV.sessions, session.id, { ...session, agentId: "agent-b" }));
    model.resolve(xml); await automatic;
    expect(await retry).toMatchObject({ recovered: 1 });
    expect(provider.compress).toHaveBeenCalledOnce();
  });

  it("retries the current replacement once after an obsolete shared attempt finishes", async () => {
    const model = deferred<string>();
    const provider = { name: "test", compress: vi.fn().mockImplementationOnce(() => model.promise).mockResolvedValue(xml), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const replacement = { ...buildSyntheticCompression({ ...raw(), toolOutput: "replacement source" }), compression: pendingCompression() };
    await withKeyedLock("obs:session-recovery", () => r.kv.set(KV.observations("session-recovery"), raw().id, replacement));
    const retries = Array.from({ length: 2 }, () => r.call("mem::compression-retry", { project: "project-a", agentId: "agent-a" }));
    await vi.waitFor(() => expect(r.sdk.trigger.mock.calls.filter(([input]) => input.function_id === "mem::compress")).toHaveLength(2));
    model.resolve(xml);
    expect(await automatic).toMatchObject({ skipped: true, error: "observation_changed" });
    for (const result of await Promise.all(retries)) expect(result).toMatchObject({ recovered: 1 });
    expect(provider.compress).toHaveBeenCalledTimes(2);
    expect(provider.compress.mock.calls[1][1]).toContain("replacement source");
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toMatchObject({ source: replacement.source, compression: { status: "complete", attempts: 1 } });
    const restarted = rig(undefined, r.kv);
    expect(await restarted.call("mem::compression-retry", { sessionId: "session-recovery" })).toMatchObject({ attempted: 0 });
    expect(restarted.provider.compress).not.toHaveBeenCalled();
  });

  it("does not share observations with equal IDs across sessions", async () => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed(); await r.seed(raw().id, "other-session", "project-b", "agent-b");
    const tasks = [r.call("mem::compression-retry", { project: "project-a", agentId: "agent-a" }),
      r.call("mem::compression-retry", { project: "project-b", agentId: "agent-b" })];
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledTimes(2));
    model.resolve(xml);
    for (const result of await Promise.all(tasks)) expect(result).toMatchObject({ recovered: 1 });
  });

  it("does not restart a joining retry when its replacement is deleted", async () => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const replacement = { ...buildSyntheticCompression(raw()), compression: pendingCompression() };
    await withKeyedLock("obs:session-recovery", () => r.kv.set(KV.observations("session-recovery"), raw().id, replacement));
    const retry = r.call("mem::compression-retry", { sessionId: "session-recovery" });
    await vi.waitFor(() => expect(r.sdk.trigger.mock.calls.some(([input]) => input.function_id === "mem::compress")).toBe(true));
    await withKeyedLock("obs:session-recovery", () => r.kv.delete(KV.observations("session-recovery"), raw().id));
    model.resolve(xml); await automatic;
    expect(await retry).toMatchObject({ recovered: 0, items: [{ outcome: "changed" }] });
    expect(provider.compress).toHaveBeenCalledOnce();
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toBeNull();
  });

  it("includes time spent waiting for obsolete work in a replacement retry's deadline", async () => {
    vi.useFakeTimers();
    const oldModel = deferred<string>(); const newModel = deferred<string>();
    const provider = { name: "test", compress: vi.fn().mockImplementationOnce(() => oldModel.promise).mockImplementation(() => newModel.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const automatic = r.call("mem::compress", { sessionId: "session-recovery", observationId: raw().id });
    await vi.advanceTimersByTimeAsync(10_000);
    const replacement = { ...buildSyntheticCompression(raw()), compression: pendingCompression() };
    await withKeyedLock("obs:session-recovery", () => r.kv.set(KV.observations("session-recovery"), raw().id, replacement));
    const retry = r.call("mem::compression-retry", { sessionId: "session-recovery" });
    await vi.advanceTimersByTimeAsync(30_000);
    oldModel.resolve(xml); await vi.advanceTimersByTimeAsync(1); await automatic;
    expect(provider.compress).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await retry).toMatchObject({ success: false, failed: 1, recovered: 0 });
    newModel.resolve(xml); await vi.advanceTimersByTimeAsync(1);
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toMatchObject({ source: replacement.source, compression: { status: "failed", attempts: 1 } });
  });

  it.each([["delete", xml], ["replace", xml], ["delete", "invalid"], ["replace", "invalid"]])("discards a late model result after %s (%s)", async (operation, output) => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const task = r.call("mem::compression-retry", { sessionId: "session-recovery" });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const replacement = { ...buildSyntheticCompression(raw()), title: "replacement kept", compression: pendingCompression() };
    await withKeyedLock("obs:session-recovery", async () => {
      if (operation === "delete") await r.kv.delete(KV.observations("session-recovery"), raw().id);
      else await r.kv.set(KV.observations("session-recovery"), raw().id, replacement);
      getSearchIndex().remove(raw().id); vectorIndexRemove(raw().id);
    });
    model.resolve(output);
    expect(await task).toMatchObject({ recovered: 0, items: [{ outcome: "changed" }] });
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toEqual(operation === "delete" ? null : replacement);
    expect(getSearchIndex().has(raw().id)).toBe(false);
  });

  it("rechecks project and agent scope before committing a pending model result", async () => {
    const model = deferred<string>(); const provider = { name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() };
    const r = rig(provider); await r.seed();
    const task = r.call("mem::compression-retry", { project: "project-a", agentId: "agent-a" });
    await vi.waitFor(() => expect(provider.compress).toHaveBeenCalledOnce());
    const session = await r.kv.get(KV.sessions, "session-recovery");
    await r.kv.set(KV.sessions, session.id, { ...session, project: "project-b", agentId: "agent-b" });
    model.resolve(xml);
    expect(await task).toMatchObject({ recovered: 0, items: [{ outcome: "changed" }] });
    const { compression, ...retained } = await r.kv.get(KV.observations(session.id), raw().id);
    expect(compression.status).toBe("pending");
    expect(retained).toEqual(raw());
    expect(getSearchIndex().has(raw().id)).toBe(false);
  });

  it("does not restore a vector after deletion while embedding is pending", async () => {
    const embedding = deferred<Float32Array>(); const embed = vi.fn(() => embedding.promise); const vectors = new VectorIndex();
    setVectorIndex(vectors); setEmbeddingProvider({ name: "test", dimensions: 2, embed } as never);
    const r = rig(); await r.seed(); const task = r.call("mem::compression-retry", { sessionId: "session-recovery" });
    await vi.waitFor(() => expect(embed).toHaveBeenCalledOnce());
    await withKeyedLock("obs:session-recovery", async () => { await r.kv.delete(KV.observations("session-recovery"), raw().id); getSearchIndex().remove(raw().id); vectorIndexRemove(raw().id); });
    embedding.resolve(new Float32Array([1, 0]));
    expect(await task).toMatchObject({ recovered: 0, items: [{ outcome: "changed" }] });
    expect(r.sdk.trigger.mock.calls.some(([input]) => input.function_id === "stream::send")).toBe(false);
    expect(vectors.has(raw().id)).toBe(false);
    expect(await r.kv.get(KV.observations("session-recovery"), raw().id)).toBeNull();
  });

  it("never sends or reports recovery for missing source, and leaves default synthetic rows alone", async () => {
    const r = rig(); await r.seed();
    const row = buildSyntheticCompression(raw()); delete row.source;
    await r.kv.set(KV.observations(row.sessionId), row.id, { ...row, compression: pendingCompression() });
    await r.kv.set(KV.observations(row.sessionId), "default", { ...buildSyntheticCompression(raw("default")) });
    const result = await r.call("mem::compression-retry", { sessionId: row.sessionId });
    expect(result).toMatchObject({ attempted: 0, recovered: 0, items: [{ retryable: false, error: "source_unavailable" }] });
    expect(result.items).toHaveLength(1); expect(r.provider.compress).not.toHaveBeenCalled();
  });

  it("leaves legacy raw unchanged when source budget is exhausted and recovers after budget is freed", async () => {
    const r = rig(); await r.seed();
    const original = await r.kv.get(KV.observations("session-recovery"), raw().id);
    const seed = buildSyntheticCompression(raw("source-budget"));
    await r.kv.set(KV.observations(seed.sessionId), seed.id, { ...seed, source: { ...seed.source, toolOutput: "x".repeat(8 * 1024 * 1024) } });
    expect(await r.call("mem::compression-retry", { sessionId: seed.sessionId })).toMatchObject({
      recovered: 0, failed: 1, items: [{ retryable: false, error: "source_unavailable" }],
    });
    expect(r.provider.compress).not.toHaveBeenCalled();
    expect(await r.kv.get(KV.observations(seed.sessionId), raw().id)).toEqual(original);
    expect(getSearchIndex().has(raw().id)).toBe(false);
    await r.kv.delete(KV.observations(seed.sessionId), seed.id);
    expect(await r.call("mem::compression-retry", { sessionId: seed.sessionId })).toMatchObject({ success: true, recovered: 1 });
    expect(await r.kv.get(KV.observations(seed.sessionId), raw().id)).toMatchObject({ compression: { status: "complete", attempts: 1 } });
  });

  it("leaves legacy rows with no usable source unchanged", async () => {
    const r = rig(); await r.seed();
    const original = { ...raw(), toolOutput: undefined };
    await r.kv.set(KV.observations(original.sessionId), original.id, original);
    expect(await r.call("mem::compress", { sessionId: original.sessionId, observationId: original.id })).toMatchObject({ success: false, error: "source_unavailable", retryable: false });
    expect(await r.kv.get(KV.observations(original.sessionId), original.id)).toEqual(original);
    expect(getSearchIndex().has(original.id)).toBe(false);
    expect(r.provider.compress).not.toHaveBeenCalled();
  });

  it.each([xml, "invalid late output"])("bounds hung model calls without starting correction calls after timeout (%s)", async (lateOutput) => {
    vi.useFakeTimers(); const model = deferred<string>(); const r = rig({ name: "test", compress: vi.fn(() => model.promise), summarize: vi.fn() }); await r.seed();
    const task = r.call("mem::compression-retry", { sessionId: "session-recovery" });
    await vi.advanceTimersByTimeAsync(COMPRESSION_TIMEOUT_MS + 1);
    expect(await task).toMatchObject({ success: false, failed: 1 });
    model.resolve(lateOutput); await vi.advanceTimersByTimeAsync(1);
    expect(r.provider.compress).toHaveBeenCalledOnce();
    const { compression, ...retained } = await r.kv.get(KV.observations("session-recovery"), raw().id);
    expect(compression).toMatchObject({ status: "failed", attempts: 1 });
    expect(retained).toEqual(raw());
  });

  it("stops starting work after the batch budget while allowing its current attempt to finish", async () => {
    vi.useFakeTimers();
    const provider = { name: "test", compress: vi.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve(xml), 29_000))), summarize: vi.fn() };
    const r = rig(provider); for (const id of ["a", "b", "c"]) await r.seed(id);
    const task = r.call("mem::compression-retry", { sessionId: "session-recovery", limit: 100 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await task).toMatchObject({ recovered: 2, attempted: 2, success: true });
    expect(provider.compress).toHaveBeenCalledTimes(2);
    expect(await r.kv.get(KV.observations("session-recovery"), "c")).toHaveProperty("hookType");
  });

  it("applies project and agent filters and paginates mixed identifiers without skipping", async () => {
    const r = rig(); const ids = ["Z", "a", "_", "Á", "😀", "-", "A"];
    for (const id of ids) await r.seed(id);
    await r.seed("other-project", "other-session", "project-b", "agent-a");
    await r.seed("other-agent", "agent-session", "project-a", "agent-b");
    let cursor: string | undefined; const seen: string[] = [];
    do {
      const result = await r.call("mem::compression-status", { project: "project-a", agentId: "agent-a", limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...result.items.map((item: any) => item.observationId)); cursor = result.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...ids].sort());
    const first = await r.call("mem::compression-status", { project: "project-a", limit: 1 });
    await expect(r.call("mem::compression-status", { project: "project-b", cursor: first.nextCursor })).rejects.toThrow("Invalid cursor");
    expect(await r.call("mem::compression-status", { sessionId: "session-recovery", project: "project-b" })).toMatchObject({ items: [] });
  });

  it.each(["界".repeat(800), "\u0001".repeat(1023) + "s"])("round-trips cursors containing long Unicode or escaped identifiers", async (sessionId) => {
    const r = rig(); const observationId = "😀".repeat(512);
    await r.seed(observationId, sessionId); await r.seed(observationId + "z", sessionId);
    const first = await r.call("mem::compression-status", { sessionId, limit: 1 });
    expect(first.nextCursor.length).toBeGreaterThan(1024);
    const second = await r.call("mem::compression-status", { sessionId, limit: 1, cursor: first.nextCursor });
    expect(second.items.map((item: any) => item.observationId)).toEqual([observationId + "z"]);
    expect(await r.call("mem::compression-status", { sessionId, limit: 1, cursor: second.nextCursor })).toMatchObject({ items: [] });
  });

  it.each(["removed", "project"])("resumes compact imported-ID bookmarks and rejects a changed anchor (%s)", async (change) => {
    const r = rig(); const sessionId = "s".repeat(40_000); const observationId = "a".repeat(40_000);
    await r.seed(observationId, sessionId); await r.seed("z", sessionId);
    const scope = { project: "project-a", agentId: "agent-a", limit: 1 };
    const first = await r.call("mem::compression-status", scope);
    expect(first.nextCursor.length).toBeLessThan(1024);
    const restarted = rig(undefined, r.kv);
    expect(await restarted.call("mem::compression-status", { ...scope, cursor: first.nextCursor })).toMatchObject({ items: [{ observationId: "z" }] });
    if (change === "removed") await r.kv.delete(KV.observations(sessionId), observationId);
    else await r.kv.set(KV.sessions, sessionId, { ...await r.kv.get(KV.sessions, sessionId), project: "project-b" });
    expect(await restarted.call("api::compression-status", { method: "GET", headers: { authorization: "Bearer test-auth" }, query_params: {
      ...scope, cursor: first.nextCursor,
    } })).toMatchObject({ status_code: 200, body: { success: false, error: "cursor_stale", items: [], attempted: 0 } });
    expect(restarted.provider.compress).not.toHaveBeenCalled();
  });

  it("resumes a scan-limit bookmark even when its anchor is excluded by the agent filter", async () => {
    const r = rig(); const sessionId = "s".repeat(40_000); await r.seed("z", sessionId);
    for (let n = 0; n < 1000; n++) {
      const id = String(n).padStart(4, "0");
      await r.kv.set(KV.observations(sessionId), id, { ...raw(id, sessionId), agentId: "agent-b" });
    }
    const scope = { project: "project-a", agentId: "agent-a", limit: 1 };
    const first = await r.call("mem::compression-status", scope);
    expect(first).toMatchObject({ items: [], scannedObservations: 1000 });
    expect(first.nextCursor).toBeTruthy();
    expect(await r.call("mem::compression-status", { ...scope, cursor: first.nextCursor })).toMatchObject({
      success: true, items: [{ observationId: "z" }], scannedObservations: 1,
    });
    expect(r.provider.compress).not.toHaveBeenCalled();
  });
});

describe("compression REST boundaries", () => {
  it("bounds response bytes across sessions even when the candidate count is small", async () => {
    const r = rig(); const large = "界".repeat(Math.ceil(SAFE_PAYLOAD_BYTES / 30));
    for (let n = 0; n < 11; n++) {
      const sessionId = `frame-${n}`; const id = `${n}-${large}`;
      await r.kv.set(KV.sessions, sessionId, { id: sessionId, project: "frame-project", startedAt: raw().timestamp });
      const row = buildSyntheticCompression(raw("fixture", sessionId)); delete row.source;
      await r.kv.set(KV.observations(sessionId), id, { ...row, id, compression: pendingCompression() });
    }
    const result = await r.call("mem::compression-status", { project: "frame-project", limit: 100 });
    expect(result).toMatchObject({ success: false, oversized: true, limitBytes: SAFE_PAYLOAD_BYTES });
    expect(result.bytes).toBeGreaterThan(SAFE_PAYLOAD_BYTES);
    expect(payloadByteLength(result)).toBeLessThan(1024);
    expect(result).not.toHaveProperty("items");
    expect(await r.call("api::compression-retry", { method: "POST", headers: { authorization: "Bearer test-auth" }, body: {
      project: "frame-project", limit: 100,
    } })).toMatchObject({ status_code: 413, body: { oversized: true } });
    expect(await r.call("mem::compression-status", { project: "frame-project", limit: 1 })).toMatchObject({ success: true, items: [{ retryable: false }] });
    expect(r.provider.compress).not.toHaveBeenCalled();
  });

  it("requires auth on inspection and retry, validates methods and whitelists scope", async () => {
    const r = rig(); await r.seed();
    for (const [id, method] of [["api::compression-status", "GET"], ["api::compression-retry", "POST"]]) {
      const request = { method, headers: {}, query_params: { sessionId: "session-recovery" }, body: { sessionId: "session-recovery" } };
      expect(await r.call(id, request)).toMatchObject({ status_code: 401 });
      const headers = { authorization: "Bearer test-auth" };
      expect(await r.call(id, { ...request, method: "DELETE", headers })).toMatchObject({ status_code: 405 });
      for (const scope of [{}, { project: " " }, { project: "p", limit: "1x" }, { project: "p", limit: 101 }, { project: "p", raw: { secret: "x" } }, { project: "p", _caller_worker_id: "forged" }, { project: "p", cursor: "bad" }]) {
        expect(await r.call(id, { ...request, headers, body: scope, query_params: scope })).toMatchObject({ status_code: 400 });
      }
    }
    expect(r.provider.compress).not.toHaveBeenCalled();
    expect(await r.call("api::compression-status", { method: "GET", headers: { authorization: "Bearer test-auth" }, query_params: { sessionId: "session-recovery", cursor: "" } })).toMatchObject({ status_code: 200, body: { dryRun: true } });
  });
  it("reports backend failures without echoing raw exception content", async () => {
    const r = rig(); vi.spyOn(r.kv, "list").mockRejectedValue(new Error("private-source-body"));
    const result = await r.call("api::compression-status", { method: "GET", headers: { authorization: "Bearer test-auth" }, query_params: { project: "project-a" } });
    expect(result).toEqual({ status_code: 503, body: { error: "compression_recovery_unavailable" } });
  });
});
