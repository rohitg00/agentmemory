import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerObserveFunction } from "../src/functions/observe.js";
import { registerCaptureFunctions } from "../src/functions/capture.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { registerSessionFinalizeFunction } from "../src/functions/session-finalize.js";
import { registerSessionSweepFunction } from "../src/functions/session-sweep.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import { registerEventTriggers } from "../src/triggers/events.js";
import { getSearchIndex, setEmbeddingProvider, setVectorIndex } from "../src/functions/search.js";
import { KV } from "../src/state/schema.js";
import type { MemoryProvider } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const finalCompression = '<observation><type>decision</type><title>Verified conclusion</title><facts><fact>The cobalt fix passed verification.</fact></facts><narrative>The final cobalt fix passed verification and is ready.</narrative><concepts><concept>cobalt</concept></concepts><files></files><importance>7</importance></observation>';
const summaryXml = (final: boolean) => `<summary><title>${final ? "Verified conclusion" : "Original investigation"}</title><narrative>${final ? "The final cobalt fix passed verification and is ready." : "The original investigation is still waiting for a verified result."}</narrative><decisions><decision>Verify the cobalt fix.</decision></decisions><files></files><concepts><concept>cobalt</concept></concepts></summary>`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function store(values = new Map<string, Map<string, any>>()) {
  return {
    restart: () => store(values),
    get: async (scope: string, id: string) => structuredClone(values.get(scope)?.get(id) ?? null),
    list: async (scope: string) => structuredClone([...(values.get(scope)?.values() ?? [])]),
    set: async (scope: string, id: string, value: any) => {
      if (!values.has(scope)) values.set(scope, new Map());
      values.get(scope)!.set(id, structuredClone(value));
      return value;
    },
    update: async (scope: string, id: string, updates: any[]) => {
      const row = values.get(scope)!.get(id);
      for (const update of updates) {
        if (update.type === "remove") delete row[update.path];
        else row[update.path] = update.value;
      }
    },
    delete: async (scope: string, id: string) => { values.get(scope)?.delete(id); },
  };
}
function provider(): MemoryProvider {
  return { name: "test", compress: vi.fn(async () => finalCompression), summarize: vi.fn(async (_system, prompt) => summaryXml(prompt.includes("Verified conclusion"))) };
}
function rig(model = provider(), kv = store()) {
  const handlers = new Map<string, (input: any) => Promise<any>>();
  const pending = new Set<Promise<unknown>>();
  const sdk = {
    registerFunction: (id: string, fn: any) => handlers.set(id, fn), registerTrigger: vi.fn(),
    trigger: vi.fn(async (input: any) => {
      const result = handlers.get(input.function_id)?.({ ...input.payload, _caller_worker_id: "test-worker" });
      if (input.action && result) {
        pending.add(result);
        void result.catch(() => {}).finally(() => pending.delete(result));
        return undefined;
      }
      return result;
    }),
  };
  registerObserveFunction(sdk as never, kv as never);
  const capture = registerCaptureFunctions(sdk as never, kv as never, { durableAfterMs: 0 });
  registerCompressFunction(sdk as never, kv as never, model);
  registerSummarizeFunction(sdk as never, kv as never, model);
  registerSessionFinalizeFunction(sdk as never, kv as never);
  registerRememberFunction(sdk as never, kv as never);
  registerSessionSweepFunction(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never);
  registerEventTriggers(sdk as never, kv as never);
  const call = (id: string, input: any) => handlers.get(id)!(input);
  const observe = (eventId: string, text: string, sessionId = "summary-session") => call("api::observe", { headers: {}, body: {
    sessionId, eventId, project: "summary-project", cwd: "/fixture", hookType: "post_tool_use",
    timestamp: new Date().toISOString(), data: { tool_name: "Read", tool_output: text },
  } });
  const sessions = () => call("api::sessions", { headers: {}, query_params: { agentId: "*" } });
  const flush = async () => { while (pending.size) await Promise.allSettled([...pending]); };
  return { kv, sdk, call, model, observe, sessions, flush, close: capture.stop };
}

beforeEach(() => {
  vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
  vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", "0");
  vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
  vi.stubEnv("CONSOLIDATION_ENABLED", "false");
  vi.stubEnv("AGENTMEMORY_REFLECT", "false");
  getSearchIndex().clear(); setEmbeddingProvider(null); setVectorIndex(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("session summary recovery", () => {
  it("rechecks source coverage before acknowledging a finished repair", async () => {
    const r = rig();
    await r.observe("ack-event-0001", "Original investigation");
    await r.call("event::session::ended", { sessionId: "summary-session" });
    const get = r.kv.get; let reads = 0;
    r.kv.get = async (scope, id) => {
      if (scope === KV.summaryRepairs && ++reads === 2) {
        const [row] = await r.kv.list(KV.observations("summary-session"));
        await r.kv.set(KV.observations("summary-session"), row.id, { ...row, narrative: "Verified conclusion arrived after summary publication" });
      }
      return get(scope, id);
    };
    await r.call("mem::session-finalize", { now: Date.now() }); await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).not.toBeNull();
    await r.call("mem::session-finalize", { now: Date.now() + 600_000 }); await r.flush();
    expect((await r.sessions()).body.sessions[0].summary.title).toBe("Verified conclusion");
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    r.close();
  });

  it("does not publish into a recreated session or overwrite an independently replaced summary", async () => {
    for (const replacement of ["session", "summary"] as const) {
      const held = deferred<string>(); const model = provider();
      model.summarize = vi.fn(() => held.promise);
      const r = rig(model);
      await r.observe(`replacement-event-${replacement}`, "Original investigation");
      const task = r.call("mem::summarize", { sessionId: "summary-session" });
      await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledOnce());
      if (replacement === "session") {
        const session = await r.kv.get(KV.sessions, "summary-session");
        await r.kv.delete(KV.sessions, session.id);
        await r.kv.set(KV.sessions, session.id, { ...session, startedAt: "2040-01-01T00:00:00.000Z", project: "new-project", agentId: "new-agent" });
      } else await r.kv.set(KV.summaries, "summary-session", { title: "Imported summary" });
      held.resolve(summaryXml(false));
      expect(await task).toMatchObject({ success: false, error: "source_changed" });
      expect(await r.kv.get(KV.summaries, "summary-session")).toEqual(replacement === "session" ? null : { title: "Imported summary" });
      r.close();
    }
  });

  it("backs off transient storage errors and normalizes malformed retry counters", async () => {
    const r = rig();
    await r.observe("storage-event-0001", "Original investigation");
    await r.call("event::session::ended", { sessionId: "summary-session" });
    const queue = await r.kv.get(KV.summaryRepairs, "summary-session");
    await r.kv.set(KV.summaryRepairs, "summary-session", { ...queue, attempts: "bad" });
    const list = r.kv.list; let fail = true;
    r.kv.list = async (scope) => {
      if (scope === KV.observations("summary-session") && fail) { fail = false; throw new Error("storage unavailable"); }
      return list(scope);
    };
    await r.call("mem::session-finalize", { now: Date.now() }); await r.flush();
    const failed = await r.kv.get(KV.summaryRepairs, "summary-session");
    expect(failed).toMatchObject({ lastError: "recovery_failed", attempts: 1 });
    expect(Number.isFinite(failed.dueAt)).toBe(true);
    expect(failed.dueAt).toBeGreaterThan(Date.now());
    expect(r.model.summarize).not.toHaveBeenCalled();
    await r.call("mem::session-finalize", { now: Date.now() + 600_000 }); await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    r.close();
  });

  it("preserves newer late-replay intent while an older repair is in flight", async () => {
    const held = deferred<string>(); const model = provider();
    model.summarize = vi.fn().mockImplementationOnce(() => held.promise)
      .mockImplementation(async (_system, prompt) => summaryXml(prompt.includes("Verified conclusion")));
    const r = rig(model);
    await r.observe("token-event-0001", "Original investigation");
    await r.call("event::session::ended", { sessionId: "summary-session" });
    const original = await r.kv.get(KV.summaryRepairs, "summary-session");
    await r.call("mem::session-finalize", { now: Date.now() });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledOnce());
    await r.observe("token-event-0002", "Verified conclusion from late replay");
    const newer = await r.kv.get(KV.summaryRepairs, "summary-session");
    expect(newer.token).not.toBe(original.token);
    expect((await r.sessions()).body.sessions[0].status).toBe("completed");
    held.resolve(summaryXml(false));
    await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toEqual(newer);
    expect(await r.kv.get(KV.summaries, "summary-session")).toBeNull();
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    expect((await r.sessions()).body.sessions[0].summary).toMatchObject({ title: "Verified conclusion", observationCount: 2 });
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    r.close();
  });

  it("limits recovery to two in-flight sessions across repeated ticks", async () => {
    const held = deferred<string>(); const model = provider();
    model.summarize = vi.fn(() => held.promise);
    const r = rig(model);
    for (let i = 0; i < 4; i++) {
      const sessionId = `bounded-session-${i}`;
      await r.observe(`bounded-event-000${i}`, "Original investigation", sessionId);
      await r.call("event::session::ended", { sessionId });
    }
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledTimes(2));
    await r.call("mem::session-finalize", { now: Date.now() + 600_000 });
    expect(model.summarize).toHaveBeenCalledTimes(2);
    held.resolve(summaryXml(false)); await r.flush();
    await r.call("mem::session-finalize", { now: Date.now() + 600_000 });
    await r.flush();
    expect(model.summarize).toHaveBeenCalledTimes(4);
    expect(await r.kv.list(KV.summaryRepairs)).toEqual([]);
    r.close();
  });

  it("backs off compression failures and recovers retained source later", async () => {
    const model = provider(); model.compress = vi.fn(async () => "invalid");
    const r = rig(model);
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    await r.observe("failed-compress-event-0001", "Retained cobalt evidence");
    await r.flush();
    await r.call("event::session::ended", { sessionId: "summary-session" });
    await r.call("mem::session-finalize", { now: Date.now() });
    await r.flush();
    const calls = vi.mocked(model.compress).mock.calls.length;
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toMatchObject({ lastError: "compression_pending", attempts: 1 });
    await r.call("mem::session-finalize", { now: Date.now() }); await r.flush();
    expect(model.compress).toHaveBeenCalledTimes(calls);
    model.compress = vi.fn(async () => finalCompression);
    for (let i = 0; i < 3; i++) {
      await r.call("mem::session-finalize", { now: Date.now() + 600_000 }); await r.flush();
    }
    expect((await r.sessions()).body.sessions[0].summary.narrative).toContain("final cobalt fix passed verification");
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    r.close();
  });

  it("retains actionable source-unavailable state with slow retries", async () => {
    const r = rig();
    await r.observe("missing-source-event-0001", "Original investigation");
    const [row] = await r.kv.list(KV.observations("summary-session"));
    const { source: _source, ...withoutSource } = row;
    await r.kv.set(KV.observations("summary-session"), row.id, { ...withoutSource,
      compression: { status: "failed", attempts: 1, error: "source_unavailable" } });
    await r.call("event::session::ended", { sessionId: "summary-session" });
    await r.call("mem::session-finalize", { now: Date.now() }); await r.flush();
    const queued = await r.kv.get(KV.summaryRepairs, "summary-session");
    expect(queued).toMatchObject({ lastError: "source_unavailable" });
    expect(queued.dueAt).toBeGreaterThan(Date.now() + 3_500_000);
    expect(r.model.compress).not.toHaveBeenCalled();
    r.close();
  });

  it("clears forgotten and empty closed-session repair intent without model work", async () => {
    const r = rig();
    await r.observe("forget-event-0001", "Original investigation");
    await r.call("event::session::ended", { sessionId: "summary-session" });
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).not.toBeNull();
    await r.call("mem::forget", { sessionId: "summary-session" });
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    await r.kv.set(KV.sessions, "empty", { id: "empty", project: "empty", cwd: "/empty", startedAt: new Date().toISOString(), status: "active", observationCount: 0 });
    await r.call("event::session::ended", { sessionId: "empty" });
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, "empty")).toBeNull();
    expect(r.model.summarize).not.toHaveBeenCalled();
    r.close();
  });

  it.each(["event::session::ended", "mem::session-sweep"])("persists repair before %s closes a session", async (closeFunction) => {
    const r = rig();
    await r.observe("close-path-event-0001", "Original investigation");
    const session = await r.kv.get(KV.sessions, "summary-session");
    await r.kv.set(KV.sessions, session.id, { ...session, updatedAt: "2020-01-01T00:00:00.000Z" });
    await r.call(closeFunction, { sessionId: session.id });
    await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, session.id)).toMatchObject({ sessionId: session.id });
    const restarted = rig(provider(), r.kv.restart());
    await restarted.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await restarted.flush();
    expect((await restarted.sessions()).body.sessions[0].summary.title).toBe("Original investigation");
    expect(await restarted.kv.get(KV.summaryRepairs, session.id)).toBeNull();
    r.close(); restarted.close();
  });

  it("bounds stalled summary calls and ignores their eventual late results", async () => {
    const held = deferred<string>(); const model = provider();
    model.summarize = vi.fn(() => held.promise);
    const r = rig(model);
    await r.observe("timeout-event-0001", "Original investigation");
    vi.useFakeTimers();
    const result = r.call("mem::summarize", { sessionId: "summary-session" });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledOnce());
    let settled = false; void result.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(120_001);
    expect(settled).toBe(true);
    expect(await result).toMatchObject({ success: false, error: "summary_timeout" });
    held.resolve(summaryXml(false));
    await Promise.resolve();
    expect(await r.kv.get(KV.summaries, "summary-session")).toBeNull();
    r.close();
  });

  it("backs off provider failures and resumes after provider configuration on restart", async () => {
    const model = provider(); model.name = "noop";
    const r = rig(model);
    await r.observe("no-provider-event-0001", "Original investigation");
    await r.call("api::session::end", { body: { sessionId: "summary-session", final: true } });
    await r.flush();
    await r.call("mem::session-finalize", { now: Date.now() });
    await r.flush();
    const queued = await r.kv.get(KV.summaryRepairs, "summary-session");
    expect(queued).toMatchObject({ lastError: "no_provider", attempts: 1 });
    expect(queued.dueAt).toBeGreaterThan(Date.now() + 3_500_000);
    expect(model.summarize).not.toHaveBeenCalled();
    const configured = provider(); configured.summarize = vi.fn(async () => { throw new Error("outage"); });
    const restarted = rig(configured, r.kv.restart());
    await restarted.call("mem::session-finalize", { now: Date.now() });
    await restarted.flush();
    expect(configured.summarize).toHaveBeenCalledOnce();
    expect(await restarted.kv.get(KV.summaryRepairs, "summary-session")).toMatchObject({ lastError: "summary_failed" });
    await restarted.call("mem::session-finalize", { now: Date.now() });
    await restarted.flush();
    expect(configured.summarize).toHaveBeenCalledOnce();
    configured.summarize = vi.fn(async () => summaryXml(false));
    await restarted.call("mem::session-finalize", { now: Date.now() + 600_000 });
    await restarted.flush();
    expect(await restarted.kv.get(KV.summaryRepairs, "summary-session")).toBeNull();
    expect((await restarted.sessions()).body.sessions[0].summary.title).toBe("Original investigation");
    r.close(); restarted.close();
  });

  it("does not certify skipped summary chunks as fully covered", async () => {
    vi.stubEnv("SUMMARIZE_CHUNK_SIZE", "1");
    const model = provider();
    let fail = true;
    model.summarize = vi.fn(async (_system, prompt) =>
      fail && prompt.includes("Missing evidence") ? "invalid" : summaryXml(false));
    const r = rig(model);
    await r.observe("partial-event-0001", "Original investigation");
    await r.observe("partial-event-0002", "Missing evidence");
    const first = await r.call("mem::summarize", { sessionId: "summary-session" });
    expect(first).toMatchObject({ success: true, incomplete: true });
    expect(first.summary.coveredFingerprint).toBeUndefined();
    await r.call("api::session::end", { body: { sessionId: "summary-session", final: true } });
    await r.flush();
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).not.toBeNull();
    fail = false;
    const second = await r.call("mem::summarize", { sessionId: "summary-session" });
    expect(second).toMatchObject({ success: true });
    expect(second.unchanged).not.toBe(true);
    expect(second.summary.coveredFingerprint).toEqual(expect.any(String));
    r.close();
  });

  it("serializes overlapping summaries and skips repeated model work for unchanged inputs", async () => {
    const held = deferred<string>(); const model = provider();
    model.summarize = vi.fn(() => held.promise);
    const r = rig(model);
    await r.observe("overlap-event-0001", "Original investigation");
    const first = r.call("mem::summarize", { sessionId: "summary-session" });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledOnce());
    const second = r.call("mem::summarize", { sessionId: "summary-session" });
    await new Promise((resolve) => setImmediate(resolve));
    held.resolve(summaryXml(false));
    const results = await Promise.all([first, second]);
    expect(model.summarize).toHaveBeenCalledOnce();
    expect(results).toMatchObject([{ success: true }, { success: true, unchanged: true }]);
    r.close();
  });

  it("does not resurrect a summary after the session is forgotten during generation", async () => {
    const held = deferred<string>(); const model = provider();
    model.summarize = vi.fn(() => held.promise);
    const r = rig(model);
    await r.observe("delete-event-0001", "Original investigation");
    const task = r.call("mem::summarize", { sessionId: "summary-session" });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalledOnce());
    expect(await r.call("mem::forget", { sessionId: "summary-session" })).toMatchObject({ success: true });
    held.resolve(summaryXml(false));
    expect(await task).toMatchObject({ success: false, error: "source_changed" });
    expect(await r.kv.get(KV.summaries, "summary-session")).toBeNull();
    expect((await r.sessions()).body.sessions).toEqual([]);
    r.close();
  });

  it("retains pending repair across restart and recovers compression without another end event", async () => {
    const held = deferred<string>();
    const model = provider(); model.compress = vi.fn(() => held.promise);
    const r = rig(model);
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    await r.observe("restart-event-0001", "Retained original evidence");
    await vi.waitFor(() => expect(model.compress).toHaveBeenCalledOnce());
    await r.call("api::session::end", { body: { sessionId: "summary-session", final: true } });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalled());
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(await r.kv.get(KV.summaryRepairs, "summary-session")).not.toBeNull();
    r.close();
    const restarted = rig(provider(), r.kv.restart());
    await restarted.call("mem::session-finalize", { now: Date.now() + 600_000 });
    await restarted.flush();
    expect((await restarted.sessions()).body.sessions[0]).toMatchObject({ status: "completed",
      summary: { title: "Verified conclusion", narrative: "The final cobalt fix passed verification and is ready.", observationCount: 1 } });
    const recoveredRows = await restarted.kv.list(KV.observations("summary-session"));
    expect(recoveredRows[0].facts).toContain("The cobalt fix passed verification.");
    const recoveredSummary = await restarted.kv.get(KV.summaries, "summary-session");
    held.resolve(finalCompression);
    await r.flush();
    expect(await restarted.kv.list(KV.observations("summary-session"))).toEqual(recoveredRows);
    expect(await restarted.kv.get(KV.summaries, "summary-session")).toEqual(recoveredSummary);
    restarted.close();
  });

  it("finalizes late replay without another Stop and leaves duplicate delivery unchanged", async () => {
    const r = rig();
    await r.observe("seed-event-0002", "Original investigation");
    await r.call("api::session::end", { body: { sessionId: "summary-session", final: true } });
    await r.flush();
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", "120000");
    await r.observe("reply-event-0002", "Verified conclusion from replay");
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    const expected = (await r.sessions()).body.sessions[0];
    expect(expected).toMatchObject({ status: "completed", observationCount: 2,
      summary: { title: "Verified conclusion", observationCount: 2 } });
    const modelCalls = vi.mocked(r.model.summarize).mock.calls.length;
    expect(await r.observe("reply-event-0002", "Verified conclusion from replay")).toMatchObject({ status_code: 200 });
    await r.call("mem::session-finalize", { now: Date.now() + 600_000 });
    await r.flush();
    expect((await r.sessions()).body.sessions[0]).toEqual(expected);
    expect(r.model.summarize).toHaveBeenCalledTimes(modelCalls);
    r.close();
  });

  it("refreshes an ended session after acknowledged capture finishes compression", async () => {
    const held = deferred<string>();
    const model = provider(); model.compress = vi.fn(() => held.promise);
    const r = rig(model);
    await r.observe("seed-event-0001", "Original investigation");
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    const captured = await r.observe("reply-event-0001", "The final analysis is available");
    expect(captured).toMatchObject({ status_code: 201, body: { state: "completed" } });
    await vi.waitFor(() => expect(model.compress).toHaveBeenCalledOnce());
    await r.call("api::session::end", { headers: {}, body: { sessionId: "summary-session", final: true } });
    await vi.waitFor(() => expect(model.summarize).toHaveBeenCalled());
    held.resolve(finalCompression);
    await r.flush();
    await r.call("mem::session-finalize", { now: Date.now() + 300_000 });
    await r.flush();
    expect((await r.sessions()).body.sessions[0]).toMatchObject({
      status: "completed", summary: { title: "Verified conclusion", observationCount: 2 },
    });
    r.close();
  });
});
