import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Kv = ReturnType<typeof mockKV>;

function payload(marker: string, sessionId = "ses_deleted") {
  return {
    hookType: "post_tool_use",
    sessionId,
    project: "proj",
    cwd: "/work/proj",
    timestamp: new Date().toISOString(),
    data: { tool_name: "Bash", tool_input: { command: `echo ${marker}` }, tool_output: marker },
  };
}

async function boot(kv: Kv) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerRememberFunction } = await import("../src/functions/remember.js");
  const { DedupMap } = await import("../src/functions/dedup.js");
  const { getSearchIndex } = await import("../src/functions/search.js");
  const sdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sdk as never, kv as never, new DedupMap());
  registerRememberFunction(sdk as never, kv as never);
  const controller = registerCaptureFunctions(sdk as never, kv as never);
  const capture = (p: unknown, eventId?: string) =>
    sdk.trigger("mem::capture", { payload: p, eventId }) as Promise<Record<string, unknown>>;
  const forget = (sessionId: string, observationIds: string[]) =>
    sdk.trigger("mem::forget", { sessionId, observationIds }) as Promise<Record<string, unknown>>;
  return { sdk, controller, capture, forget, searchIndex: getSearchIndex };
}

function observations(kv: Kv, sessionId = "ses_deleted") {
  return [...(kv.store.get(KV.observations(sessionId))?.values() ?? [])] as Array<{ id: string; captureKey?: string }>;
}

function eventRecords(kv: Kv) {
  return [...kv.store.entries()]
    .filter(([scope]) => scope.startsWith("mem:capture:events:"))
    .flatMap(([, entries]) => [...entries.values()]) as Array<Record<string, unknown>>;
}

function clearEventRecords(kv: Kv) {
  for (const [scope, entries] of kv.store) {
    if (scope.startsWith("mem:capture:events:")) entries.clear();
  }
}

describe("deleted captured observations", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("records the capture key on the stored observation and ignores one sent by a client", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const forged = `cap_${"f".repeat(40)}`;
    await capture({ ...payload("keyed"), captureKey: forged }, "evc_000000000101");
    const [obs] = observations(kv);
    expect(obs!.captureKey).toMatch(/^cap_[0-9a-f]{40}$/);
    expect(obs!.captureKey).not.toBe(forged);
    expect(eventRecords(kv).map((r) => r.key)).toEqual([obs!.captureKey]);
  });

  it("keeps a forgotten observation deleted when its event is replayed", async () => {
    const kv = mockKV();
    const { capture, forget, sdk, searchIndex } = await boot(kv);
    const body = payload("forgotten");
    const first = await capture(body, "evc_000000000102");
    await forget("ses_deleted", [first.observationId as string]);
    expect(observations(kv)).toHaveLength(0);
    expect(eventRecords(kv)[0]).toMatchObject({ state: "deleted", observationId: first.observationId });

    const observeCalls = vi.fn(sdk.fns.get("mem::observe")!);
    sdk.fns.set("mem::observe", observeCalls);
    const replay = await capture(body, "evc_000000000102");
    expect(replay).toMatchObject({ status: "duplicate", observationId: first.observationId, deduplicated: true });
    expect(observeCalls).not.toHaveBeenCalled();
    expect(observations(kv)).toHaveLength(0);
    expect(searchIndex().has(first.observationId as string)).toBe(false);
  });

  it("keeps it deleted when the event record was lost in a crash before the delete", async () => {
    const kv = mockKV();
    const { capture, forget } = await boot(kv);
    const body = payload("crash-split");
    const first = await capture(body, "evc_000000000103");
    clearEventRecords(kv);
    await forget("ses_deleted", [first.observationId as string]);
    expect(eventRecords(kv)).toEqual([
      expect.objectContaining({ state: "deleted", observationId: first.observationId, sessionId: "ses_deleted" }),
    ]);
    const replay = await capture(body, "evc_000000000103");
    expect(replay).toMatchObject({ status: "duplicate", observationId: first.observationId });
    expect(observations(kv)).toHaveLength(0);
  });

  it("drops a stranded inbox entry for a deleted observation instead of storing it again", async () => {
    const kv = mockKV();
    const { capture, forget, controller } = await boot(kv);
    const body = payload("stranded-deleted");
    const first = await capture(body, "evc_000000000104");
    const [record] = eventRecords(kv);
    clearEventRecords(kv);
    await kv.set(KV.captureInbox, record!.key as string, {
      ...record,
      eventSource: "client",
      hookType: "post_tool_use",
      status: "pending",
      attempts: 1,
      updatedAt: new Date().toISOString(),
      payload: body,
    });
    await forget("ses_deleted", [first.observationId as string]);
    await controller.sweep();
    expect(observations(kv)).toHaveLength(0);
    expect([...(kv.store.get(KV.captureInbox)?.values() ?? [])]).toHaveLength(0);
    expect((await capture(body, "evc_000000000104")).status).toBe("duplicate");
    expect(observations(kv)).toHaveLength(0);
  });

  it("still stores an observation lost in a crash when nobody deleted it", async () => {
    const kv = mockKV();
    const { capture } = await boot(kv);
    const body = payload("lost-not-deleted");
    const first = await capture(body, "evc_000000000105");
    kv.store.get(KV.observations("ses_deleted"))!.clear();
    const resent = await capture(body, "evc_000000000105");
    expect(resent).toMatchObject({ status: "accepted", state: "completed", observationId: first.observationId });
    expect(observations(kv).map((o) => o.id)).toEqual([first.observationId]);
  });

  it("keeps the deleted marker for the retention window counted from the delete", async () => {
    const kv = mockKV();
    vi.stubEnv("AGENTMEMORY_CAPTURE_DEDUP_HOURS", "1");
    const { capture, forget, controller } = await boot(kv);
    const body = payload("retained-marker");
    const first = await capture(body, "evc_000000000106");
    vi.useFakeTimers({ now: Date.now() + 50 * 60_000, toFake: ["Date"] });
    await forget("ses_deleted", [first.observationId as string]);
    vi.setSystemTime(Date.now() + 20 * 60_000);
    expect(await controller.prune()).toBe(0);
    expect((await capture(body, "evc_000000000106")).status).toBe("duplicate");
    expect(observations(kv)).toHaveLength(0);
  });
});
