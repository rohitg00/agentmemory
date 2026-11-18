import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const firstEvent = "gh_1111111111111111111111111111111111111111111111111111111111111111";
const editedEvent = "gh_2222222222222222222222222222222222222222222222222222222222222222";

function snapshot(eventId = firstEvent) {
  return {
    eventId,
    hookType: "post_tool_use",
    sessionId: "gh_123_issue_456",
    project: "example-project",
    cwd: "/work/example-project",
    timestamp: "2026-11-10T12:00:00Z",
    data: {
      source: "github-watcher",
      tool_name: "GitHubIssue",
      tool_output: "Issue #7: preserve a durable design decision",
    },
  };
}

async function boot(kv = mockKV()) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  const { KV } = await import("../src/state/schema.js");
  const sdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sdk as never, kv as never);
  const controller = registerCaptureFunctions(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never);
  const call = async (body: unknown) => {
    const result = await sdk.trigger({ function_id: "api::observe", payload: { body } });
    return result as { status_code: number; body: Record<string, unknown> };
  };
  const observations = () => [...(kv.store.get(KV.observations("gh_123_issue_456"))?.values() ?? [])];
  return { kv, sdk, controller, call, observations };
}

describe("GitHub connector existing capture boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AGENTMEMORY_CAPTURE_MAX_ATTEMPTS", "3");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects the illustrative repository-slash event ID before any store write", async () => {
    const h = await boot();
    const result = await h.call(snapshot("gh:owner/repository:issue:456:2026-11-10T12:00:00Z"));
    expect(result).toEqual({
      status_code: 400,
      body: { status: "rejected", error: "eventId must be 8 to 128 characters of letters, digits, '_', '.', ':' or '-'" },
    });
    expect(h.kv.store.size).toBe(0);
  });

  it("requires project and cwd in the real REST payload before any store write", async () => {
    const h = await boot();
    const result = await h.call({ ...snapshot(), project: "", cwd: "" });
    expect(result.status_code).toBe(400);
    expect(result.body).toEqual({ error: "hookType, sessionId, project, cwd, and timestamp are required strings" });
    expect(h.kv.store.size).toBe(0);
  });

  it("completes one snapshot and returns its same observation on an immediate repeat", async () => {
    const h = await boot();
    const first = await h.call(snapshot());
    const repeat = await h.call(snapshot());
    expect(first.status_code).toBe(201);
    expect(first.body).toMatchObject({ status: "accepted", state: "completed", eventId: firstEvent });
    expect(typeof first.body.observationId).toBe("string");
    expect(repeat).toEqual({ status_code: 200, body: {
      status: "duplicate", state: "completed", eventId: firstEvent,
      observationId: first.body.observationId, deduplicated: true,
      ...h.controller.durability(),
      acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    } });
    expect(h.observations()).toHaveLength(1);
  });

  it("deduplicates after module restart with the same retained KV and thread identity", async () => {
    const before = await boot();
    const first = await before.call(snapshot());
    vi.resetModules();
    const after = await boot(before.kv);
    const repeat = await after.call(snapshot());
    expect(repeat).toEqual({ status_code: 200, body: {
      status: "duplicate", state: "completed", eventId: firstEvent,
      observationId: first.body.observationId, deduplicated: true,
      ...after.controller.durability(),
      acceptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    } });
    expect(after.observations()).toHaveLength(1);
  });

  it("records an edited revision as a second observation in the same thread", async () => {
    const h = await boot();
    const first = await h.call(snapshot());
    const changed = snapshot(editedEvent);
    changed.timestamp = "2026-11-11T12:00:00Z";
    changed.data.tool_output = "Issue #7: the decision has changed";
    const edited = await h.call(changed);
    expect(edited.status_code).toBe(201);
    expect(edited.body).toMatchObject({ status: "accepted", state: "completed", eventId: editedEvent });
    expect(edited.body.observationId).not.toBe(first.body.observationId);
    expect(h.observations()).toHaveLength(2);
  });

  it("does not claim cross-project deduplication from a stable event ID alone", async () => {
    const h = await boot();
    await h.call(snapshot());
    const other = await h.call({ ...snapshot(), project: "different-project" });
    expect(other.status_code).toBe(201);
    expect(other.body).toMatchObject({ status: "accepted", state: "completed" });
    expect(h.observations()).toHaveLength(2);
  });

  it("keeps real retrying responses distinct from completed captures on both first send and duplicate", async () => {
    const h = await boot();
    h.sdk.fns.set("mem::observe", async () => { throw new Error("isolated store unavailable"); });
    const first = await h.call(snapshot());
    const repeat = await h.call(snapshot());
    expect(first.status_code).toBe(202);
    expect(first.body).toMatchObject({ status: "accepted", state: "retrying", eventId: firstEvent, attempts: 1 });
    expect(repeat.status_code).toBe(200);
    expect(repeat.body).toMatchObject({ status: "duplicate", state: "retrying", eventId: firstEvent });
    expect(h.observations()).toHaveLength(0);
  });
});
