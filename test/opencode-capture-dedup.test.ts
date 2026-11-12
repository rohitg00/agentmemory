import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SID = "ses_opencode_replay";
const cleanups: Array<() => void | Promise<void>> = [];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("AGENTMEMORY_SECRET", "local-capture-fixture");
  vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "capture-fixture");
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { DedupMap } = await import("../src/functions/dedup.js");
  const kv = mockKV();
  const sdk = mockSdk({ looseTrigger: true });
  let dedup = new DedupMap();
  registerObserveFunction(sdk as never, kv as never, dedup);
  let capture = registerCaptureFunctions(sdk as never, kv as never);
  cleanups.push(() => { capture.stop(); dedup.stop(); });
  const requests: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith("/observe")) requests.push(body);
    const result = url.endsWith("/observe")
      ? await sdk.trigger("mem::capture", { payload: body, eventId: body.eventId })
      : { ok: true };
    return Response.json(result);
  });
  const { default: plugin } = await import("../plugin/opencode/agentmemory-capture.js");
  async function instance() {
    const hooks = new Map<string, (event: unknown) => Promise<void>>();
    const sessionHooks = new Map<string, (event: unknown) => Promise<void>>();
    const controller = new AbortController();
    const queue: Array<{ event: unknown; done: () => void }> = [];
    let wake: (() => void) | undefined;
    const emit = (event: unknown) => new Promise<void>((done) => {
      queue.push({ event, done });
      wake?.();
    });
    const context = {
      location: { directory: process.cwd() },
      tool: { hook: async (name: string, handler: (event: unknown) => Promise<void>) => { hooks.set(name, handler); } },
      session: { hook: async (name: string, handler: (event: unknown) => Promise<void>) => { sessionHooks.set(name, handler); } },
      event: {
        subscribe: async function* ({ signal }: { signal: AbortSignal }) {
          signal.addEventListener("abort", () => wake?.(), { once: true });
          controller.signal.addEventListener("abort", () => wake?.(), { once: true });
          while (!signal.aborted && !controller.signal.aborted) {
            if (!queue.length) await new Promise<void>((resolve) => { wake = resolve; });
            const next = queue.shift();
            if (!next) continue;
            yield next.event;
            next.done();
          }
        },
      },
    };
    const dispose = await plugin.setup(context);
    const close = async () => { controller.abort(); await dispose?.(); };
    cleanups.push(close);
    return { tool: (event: unknown) => hooks.get("execute.after")!(event),
      prompt: (event: unknown) => sessionHooks.get("prompt")!(event), emit, close };
  }
  const first = await instance();
  const second = await instance();
  const observations = (sid = SID) => [...(kv.store.get(KV.observations(sid))?.values() ?? [])] as CompressedObservation[];
  return { first, second, observations, requests, instance,
    restartCapture: () => {
      capture.stop();
      dedup.stop();
      dedup = new DedupMap();
      registerObserveFunction(sdk as never, kv as never, dedup);
      capture = registerCaptureFunctions(sdk as never, kv as never);
    },
  };
}

function completedTool(id: string, output = "file contents") {
  return {
    tool: "read", sessionID: SID, id, status: "completed",
    input: { filePath: "/work/readme.txt" },
    result: { content: [{ type: "text", text: output }], metadata: { started: 1, ended: 3 } },
  };
}

describe("OpenCode capture delivery", () => {
  it("stores a concurrent tool delivery from two plugin instances once", async () => {
    const h = await setup();
    const event = completedTool("call_1");
    await Promise.all([h.first.tool(event), h.second.tool(event)]);
    expect(h.observations()).toHaveLength(1);
  });

  it("keeps distinct tool calls with the same content", async () => {
    const h = await setup();
    await h.first.tool(completedTool("call_1"));
    await h.first.tool(completedTool("call_2"));
    expect(h.observations()).toHaveLength(2);
  });

  it("keeps different output under the same host call id", async () => {
    const h = await setup();
    await h.first.tool(completedTool("call_1", "first result"));
    await h.second.tool(completedTool("call_1", "updated result"));
    expect(h.observations()).toHaveLength(2);
  });

  it("deduplicates tool metadata with a different object key order", async () => {
    const h = await setup();
    const first = completedTool("call_1");
    const second = completedTool("call_1");
    second.result.metadata = { ended: 3, started: 1 };
    await Promise.all([h.first.tool(first), h.second.tool(second)]);
    expect(h.observations()).toHaveLength(1);
  });

  it("keeps the same call id in separate sessions", async () => {
    const h = await setup();
    await h.first.tool(completedTool("call_1"));
    await h.second.tool({ ...completedTool("call_1"), sessionID: "ses_child" });
    expect(h.observations()).toHaveLength(1);
    expect(h.observations("ses_child")).toHaveLength(1);
    expect(h.requests[0].eventId).not.toBe(h.requests[1].eventId);
  });

  it("deduplicates a replay after plugin disposal and capture restart", async () => {
    const h = await setup();
    await h.first.tool(completedTool("call_1"));
    await h.first.close();
    h.restartCapture();
    const reloaded = await h.instance();
    await reloaded.tool(completedTool("call_1"));
    expect(h.observations()).toHaveLength(1);
    await reloaded.tool(completedTool("call_2"));
    expect(h.observations()).toHaveLength(2);
  });

  it("retains legacy capture when the callback has no event identity", async () => {
    const h = await setup();
    const { id, ...event } = completedTool("unused");
    await h.first.tool(event);
    expect(h.requests[0]).not.toHaveProperty("eventId");
    expect(h.observations()).toHaveLength(1);
  });
});

function textEvent(id: string, text: string) {
  return { type: "session.text.ended", id, created: 1, location: {},
    data: { sessionID: SID, assistantMessageID: "message_1", ordinal: 0, text } };
}

describe("OpenCode event stream identity", () => {
  it("stores initial snapshots once across concurrent registration and restart", async () => {
    const h = await setup();
    const event = { type: "session.created", id: "created_1", created: 1, data: { sessionID: SID }, location: {} };
    await Promise.all([h.first.emit(event), h.second.emit(event)]);
    const starts = () => h.observations().filter((observation) => observation.source?.hookType === "session_started");
    const configs = () => h.observations().filter((observation) => observation.source?.hookType === "config_loaded");
    expect(starts()).toHaveLength(1);
    expect(configs()).toHaveLength(1);
    await h.first.close();
    h.restartCapture();
    const reloaded = await h.instance();
    await reloaded.emit(event);
    expect(starts()).toHaveLength(1);
    expect(configs()).toHaveLength(1);
  });

  it("deduplicates concurrent event delivery after both instances register the session", async () => {
    const h = await setup();
    const created = { type: "session.created", id: "created_1", created: 1, data: { sessionID: SID }, location: {} };
    await h.first.emit(created);
    await h.second.emit(created);
    const before = h.observations().length;
    const event = textEvent("event_1", "finished reading");
    await Promise.all([h.first.emit(event), h.second.emit(event)]);
    expect(h.observations()).toHaveLength(before + 1);
  });

  it("preserves changed text when the host reuses its event id", async () => {
    const h = await setup();
    await h.first.emit(textEvent("event_1", "first answer"));
    const before = h.observations().length;
    await h.first.emit(textEvent("event_1", "updated answer"));
    expect(h.observations()).toHaveLength(before + 1);
  });

  it("uses the native creation time when the event id is absent", async () => {
    const h = await setup();
    const { id, ...event } = textEvent("unused", "answer");
    await h.first.emit(event);
    const before = h.observations().length;
    await h.second.emit(event);
    expect(h.observations()).toHaveLength(before);
    await h.second.emit({ ...event, created: 2 });
    expect(h.observations()).toHaveLength(before + 1);
  });

  it("does not capture an empty reasoning completion", async () => {
    const h = await setup();
    await h.first.emit({ ...textEvent("reasoning_1", ""), type: "session.reasoning.ended" });
    expect(h.requests.filter((body) => body.hookType === "reasoning")).toHaveLength(0);
  });

  it("deduplicates fallback failures after cached tool details are cleared", async () => {
    const h = await setup();
    const event = { type: "session.created", id: "created_1", created: 1, data: { sessionID: SID }, location: {} };
    await Promise.all([h.first.emit(event), h.second.emit(event)]);
    await h.first.emit({ ...event, type: "session.tool.input.started", id: "input_1",
      data: { sessionID: SID, id: "call_1", name: "read" } });
    await h.first.emit({ ...event, type: "session.tool.called", id: "called_1",
      data: { sessionID: SID, id: "call_1", input: { filePath: "/work/readme.txt" } } });
    const failure = { ...event, type: "session.tool.failed", id: "failed_1",
      data: { sessionID: SID, id: "call_1", error: { message: "denied" } } };
    const before = h.observations().length;
    await h.first.emit(failure);
    expect(h.observations()).toHaveLength(before + 1);
    await h.first.emit(failure);
    await h.second.emit(failure);
    expect(h.observations()).toHaveLength(before + 1);
    expect(h.observations().find((observation) => observation.source?.hookType === "post_tool_failure")?.source)
      .toMatchObject({ toolName: "read", toolInput: JSON.stringify({ filePath: "/work/readme.txt" }), toolOutput: "denied" });
    await h.second.emit({ ...failure, data: { ...failure.data, error: { message: "missing" } } });
    expect(h.observations()).toHaveLength(before + 2);
  });
});

describe("OpenCode prompt delivery", () => {
  it("deduplicates native prompt delivery by message id across instances", async () => {
    const h = await setup();
    const event = { sessionID: SID, messageID: "message_1", prompt: { text: "read the file" }, delivery: "steer" };
    await Promise.all([h.first.prompt(event), h.second.prompt(event)]);
    expect(h.observations()).toHaveLength(1);
  });

  it("keeps repeated prompt text with a distinct message id", async () => {
    const h = await setup();
    const event = { sessionID: SID, messageID: "message_1", prompt: { text: "read the file" }, delivery: "steer" };
    await h.first.prompt(event);
    await h.first.prompt({ ...event, messageID: "message_2" });
    expect(h.observations()).toHaveLength(2);
  });
});
