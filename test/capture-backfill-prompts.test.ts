import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import { withEventId, type ObserveBody } from "../src/hooks/_capture.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

type Kv = ReturnType<typeof mockKV>;

const SESSION = "ses_cursor_backfill";
const TRANSCRIPT = "/home/u/.cursor/projects/p/agent-transcripts/t.jsonl";

async function boot(kv: Kv) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { DedupMap } = await import("../src/functions/dedup.js");
  const sdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sdk as never, kv as never, new DedupMap());
  const controller = registerCaptureFunctions(sdk as never, kv as never, {});
  const send = (body: ObserveBody) => {
    const { eventId, ...payload } = body;
    return sdk.trigger("mem::capture", { payload, eventId }) as Promise<Record<string, unknown>>;
  };
  return { send, controller };
}

function base(timestamp: string, data: Record<string, unknown>, sessionId = SESSION): ObserveBody {
  return { hookType: "prompt_submit", sessionId, project: "proj", cwd: "/work/proj", timestamp, data };
}

function cursorLive(prompt: string, timestamp: string): ObserveBody {
  const host = { conversation_id: SESSION, generation_id: "gen-1", hook_event_name: "beforeSubmitPrompt", prompt };
  return withEventId(base(timestamp, { prompt }), host);
}

function backfill(prompt: string, index: number, timestamp = "2026-10-03T12:00:00.000Z"): ObserveBody {
  return withEventId(
    base(timestamp, { prompt, backfill: true }),
    {},
    { source: "transcript", transcript: TRANSCRIPT, index, prompt },
    { stable: true },
  );
}

function prompts(kv: Kv, sessionId = SESSION) {
  return [...(kv.store.get(KV.observations(sessionId))?.values() ?? [])] as Array<{ id: string }>;
}

describe("transcript back-fill of prompts without a host prompt id", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores a prompt once when the back-fill replays a live capture", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    const live = cursorLive("fix the login bug", "2026-10-03T10:00:00.000Z");
    const replay = backfill("fix the login bug", 0);
    expect(live.eventId).not.toBe(replay.eventId);
    expect(await send(live)).toMatchObject({ status: "accepted" });
    expect(await send(replay)).toMatchObject({ status: "duplicate" });
    expect(prompts(kv)).toHaveLength(1);
  });

  it("matches the back-fill when only whitespace differs", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("  fix the\nlogin   bug ", "2026-10-03T10:00:00.000Z"));
    expect(await send(backfill("fix the login bug", 0))).toMatchObject({ status: "duplicate" });
    expect(prompts(kv)).toHaveLength(1);
  });

  it("keeps two identical live prompts and absorbs a two-entry back-fill", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("continue", "2026-10-03T10:00:00.000Z"));
    await send(cursorLive("continue", "2026-10-03T10:00:05.000Z"));
    expect(prompts(kv)).toHaveLength(2);
    expect(await send(backfill("continue", 0))).toMatchObject({ status: "duplicate" });
    expect(await send(backfill("continue", 1))).toMatchObject({ status: "duplicate" });
    expect(prompts(kv)).toHaveLength(2);
  });

  it("stores the extra occurrence when the back-fill has more copies than were captured live", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("continue", "2026-10-03T10:00:00.000Z"));
    await send(backfill("continue", 0));
    expect(await send(backfill("continue", 1))).toMatchObject({ status: "accepted" });
    expect(prompts(kv)).toHaveLength(2);
  });

  it("stores a back-filled prompt that was never captured live", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("first prompt", "2026-10-03T10:00:00.000Z"));
    expect(await send(backfill("first prompt", 0))).toMatchObject({ status: "duplicate" });
    expect(await send(backfill("prompt lost while the service was down", 1))).toMatchObject({ status: "accepted" });
    expect(prompts(kv)).toHaveLength(2);
  });

  it("does not store the back-fill again when the session end hook runs twice", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("continue", "2026-10-03T10:00:00.000Z"));
    await send(backfill("continue", 0));
    await send(backfill("never live", 1));
    await send(backfill("continue", 0, "2026-10-03T13:00:00.000Z"));
    await send(backfill("never live", 1, "2026-10-03T13:00:00.000Z"));
    expect(prompts(kv)).toHaveLength(2);
  });

  it("keeps sessions apart", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    await send(cursorLive("continue", "2026-10-03T10:00:00.000Z"));
    const other = withEventId(
      base("2026-10-03T12:00:00.000Z", { prompt: "continue", backfill: true }, "ses_other_session"),
      {},
      { source: "transcript", transcript: TRANSCRIPT, index: 0, prompt: "continue" },
      { stable: true },
    );
    expect(await send(other)).toMatchObject({ status: "accepted" });
    expect(prompts(kv, "ses_other_session")).toHaveLength(1);
  });

  it("still matches after a restart between the live capture and the back-fill", async () => {
    const kv = mockKV();
    const first = await boot(kv);
    await first.send(cursorLive("fix the login bug", "2026-10-03T10:00:00.000Z"));
    vi.resetModules();
    const second = await boot(kv);
    expect(await second.send(backfill("fix the login bug", 0))).toMatchObject({ status: "duplicate" });
    expect(prompts(kv)).toHaveLength(1);
  });

  it("drops idle ledgers on prune", async () => {
    vi.stubEnv("AGENTMEMORY_CAPTURE_DEDUP_HOURS", "1");
    const kv = mockKV();
    const { send, controller } = await boot(kv);
    await send(cursorLive("continue", "2026-10-03T10:00:00.000Z"));
    const ledgers = kv.store.get(KV.capturePrompts)!;
    expect(ledgers.size).toBe(1);
    for (const ledger of ledgers.values()) (ledger as { updatedAt: string }).updatedAt = "2020-01-01T00:00:00.000Z";
    await controller.prune();
    expect(ledgers.size).toBe(0);
  });
});

describe("prompts with a host prompt id", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps the host derived id and stores the prompt once", async () => {
    const kv = mockKV();
    const { send } = await boot(kv);
    const host = { session_id: SESSION, prompt_id: "prompt_0123456789", prompt: "continue" };
    const live = withEventId(base("2026-10-03T10:00:00.000Z", { prompt: "continue" }), host);
    const replay = withEventId(base("2026-10-03T12:00:00.000Z", { prompt: "continue" }), host, undefined, { stable: true });
    expect(live.eventId).toMatch(/^evh_/);
    expect(replay.eventId).toBe(live.eventId);
    await send(live);
    expect(await send(replay)).toMatchObject({ status: "duplicate" });
    expect(prompts(kv)).toHaveLength(1);
  });
});

describe("prompt ledger durability", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fails instead of treating an unreadable ledger as empty", async () => {
    const { recordLivePrompt } = await import("../src/capture/prompt-ledger.js");
    const kv = mockKV();
    await recordLivePrompt(kv as never, SESSION, "continue", "obs_ref_one_aaaa");
    const before = JSON.stringify([...kv.store.get(KV.capturePrompts)!.values()]);
    const failing = { ...kv, get: async () => { throw new Error("state read timed out"); } };
    await expect(recordLivePrompt(failing as never, SESSION, "continue", "obs_ref_two_bbbb")).rejects.toThrow("state read timed out");
    expect(JSON.stringify([...kv.store.get(KV.capturePrompts)!.values()])).toBe(before);
  });

  it("answers a retried back-fill claim with the same identity without using another live slot", async () => {
    const { recordLivePrompt, claimBackfillPrompt } = await import("../src/capture/prompt-ledger.js");
    const kv = mockKV();
    await recordLivePrompt(kv as never, SESSION, "continue", "obs_live_one_aaaa");
    expect(await claimBackfillPrompt(kv as never, SESSION, "continue", "obs_fill_one_aaaa")).toBe(true);
    expect(await claimBackfillPrompt(kv as never, SESSION, "continue", "obs_fill_one_aaaa")).toBe(true);
    expect(await claimBackfillPrompt(kv as never, SESSION, "continue", "obs_fill_two_bbbb")).toBe(false);
    await recordLivePrompt(kv as never, SESSION, "continue", "obs_live_one_aaaa");
    expect(await claimBackfillPrompt(kv as never, SESSION, "continue", "obs_fill_two_bbbb")).toBe(false);
  });

  it("records the live prompt on a retry that finds the observation already stored", async () => {
    const kv = mockKV();
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk({ looseTrigger: true });
    registerObserveFunction(sdk as never, kv as never);
    const realSet = kv.set;
    let failLedger = true;
    kv.set = (async (scope: string, key: string, data: unknown) => {
      if (scope === KV.capturePrompts && failLedger) {
        failLedger = false;
        throw new Error("ledger write failed");
      }
      return realSet(scope, key, data);
    }) as typeof kv.set;
    const live = {
      hookType: "prompt_submit",
      sessionId: SESSION,
      project: "proj",
      cwd: "/work/proj",
      timestamp: "2026-10-03T10:00:00.000Z",
      data: { prompt: "ship it" },
      eventId: "evc_live_ship_it",
      observationId: "obs_live_ship_it_0001",
    };
    await expect(sdk.trigger("mem::observe", live)).rejects.toThrow("ledger write failed");
    expect(await sdk.trigger("mem::observe", live)).toMatchObject({ existing: true });
    const fill = {
      ...live,
      data: { prompt: "ship it", backfill: true },
      eventId: "evc_fill_ship_it",
      observationId: "obs_fill_ship_it_0001",
    };
    expect(await sdk.trigger("mem::observe", fill)).toMatchObject({ deduplicated: true });
    expect(prompts(kv)).toHaveLength(1);
  });
});
