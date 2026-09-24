import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("OpenCode plugin summarize debouncing & deduplication test suite", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/summarize")) {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("collapses concurrent session.idle and session.status (idle) into exactly 1 /summarize call", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    // Simulate session creation
    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-debounce-1" } } },
    });

    // Simulate simultaneous session.idle and session.status (idle)
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-debounce-1" } },
    });
    await handlers.event({
      event: {
        type: "session.status",
        properties: { sessionID: "sess-debounce-1", status: { type: "idle" } },
      },
    });

    // Immediately, fetchMock should NOT have fired /summarize yet due to debounce window
    const summarizeCallsBefore = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(summarizeCallsBefore).toHaveLength(0);

    // Fast-forward past the debounce window (3000ms)
    await vi.advanceTimersByTimeAsync(3500);

    const summarizeCallsAfter = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(summarizeCallsAfter).toHaveLength(1);
    expect(JSON.parse(summarizeCallsAfter[0][1].body)).toEqual({
      sessionId: "sess-debounce-1",
    });
  });

  it("resets debounce timer on rapid successive session.idle events (trailing edge execution)", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-debounce-2" } } },
    });

    // Fire 5 rapid events spaced by 500ms
    for (let i = 0; i < 5; i++) {
      await handlers.event({
        event: { type: "session.idle", properties: { sessionID: "sess-debounce-2" } },
      });
      await vi.advanceTimersByTimeAsync(500);
    }

    // Total time elapsed: 2500ms (less than 3000ms after last event)
    let calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(0);

    // Fast forward 3100ms past the last event
    await vi.advanceTimersByTimeAsync(3100);

    calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(1);
  });

  it("isolates debounce timers across distinct sessions", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-A" } } },
    });
    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-B" } } },
    });

    // Fire idle on sess-A
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-A" } },
    });

    // Advance 1500ms, then fire idle on sess-B
    await vi.advanceTimersByTimeAsync(1500);
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-B" } },
    });

    // Advance 1600ms (Total 3100ms from sess-A, 1600ms from sess-B)
    await vi.advanceTimersByTimeAsync(1600);

    let callsA = fetchMock.mock.calls.filter(
      (c) =>
        typeof c[0] === "string" &&
        c[0].includes("/summarize") &&
        JSON.parse(c[1]?.body || "{}").sessionId === "sess-A",
    );
    let callsB = fetchMock.mock.calls.filter(
      (c) =>
        typeof c[0] === "string" &&
        c[0].includes("/summarize") &&
        JSON.parse(c[1]?.body || "{}").sessionId === "sess-B",
    );
    expect(callsA).toHaveLength(1);
    expect(callsB).toHaveLength(0);

    // Advance remaining 1500ms for sess-B
    await vi.advanceTimersByTimeAsync(1500);

    callsB = fetchMock.mock.calls.filter(
      (c) =>
        typeof c[0] === "string" &&
        c[0].includes("/summarize") &&
        JSON.parse(c[1]?.body || "{}").sessionId === "sess-B",
    );
    expect(callsB).toHaveLength(1);
  });

  it("cancels pending summarize timer when session is deleted/pruned", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-deleted" } } },
    });

    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-deleted" } },
    });

    // Advance 1000ms, then delete session
    await vi.advanceTimersByTimeAsync(1000);
    await handlers.event({
      event: { type: "session.deleted", properties: { sessionID: "sess-deleted" } },
    });

    // Advance past original timer window
    await vi.advanceTimersByTimeAsync(5000);

    const calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(0);
  });

  it("cancels pending summarize timer when session transitions to busy", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-busy" } } },
    });

    // Go idle
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-busy" } },
    });

    // Advance 1000ms, then session becomes busy (e.g. new action starts)
    await vi.advanceTimersByTimeAsync(1000);
    await handlers.event({
      event: {
        type: "session.status",
        properties: { sessionID: "sess-busy", status: { type: "busy" } },
      },
    });

    // Advance past original timer window (3000ms from idle)
    await vi.advanceTimersByTimeAsync(4000);

    const calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(0);
  });

  it("cancels pending summarize timer when user submits a new prompt", async () => {
    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
      "chat.message"?: (input: any, output: any) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-prompt" } } },
    });

    // Go idle
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-prompt" } },
    });

    // Advance 1000ms, user submits a new prompt
    await vi.advanceTimersByTimeAsync(1000);
    if (handlers["chat.message"]) {
      await handlers["chat.message"](
        { sessionID: "sess-prompt" },
        { message: { role: "user", parts: [{ type: "text", text: "next question" }] } },
      );
    }

    // Advance past original timer window
    await vi.advanceTimersByTimeAsync(4000);

    const calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(0);
  });

  it("prevents overlapping summarize requests while a summary is in-flight (single-flight guard)", async () => {
    let resolveFirstSummarize: () => void;
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/summarize")) {
        return new Promise((resolve) => {
          resolveFirstSummarize = () => resolve({ ok: true, json: async () => ({ success: true }) });
        });
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { AgentmemoryCapturePlugin } = await import(
      "../plugin/opencode/agentmemory-capture.ts"
    );
    const handlers = await (AgentmemoryCapturePlugin as (c: unknown) => Promise<{
      event: (msg: unknown) => Promise<void>;
    }>)({ project: { id: "test-proj" } });

    await handlers.event({
      event: { type: "session.created", properties: { info: { id: "sess-inflight" } } },
    });

    // Trigger idle 1
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-inflight" } },
    });
    await vi.advanceTimersByTimeAsync(3500);

    // 1st summarize call is now in-flight (not resolved yet)
    let calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(1);

    // While 1st summarize is in-flight, another idle event occurs
    await handlers.event({
      event: { type: "session.idle", properties: { sessionID: "sess-inflight" } },
    });
    await vi.advanceTimersByTimeAsync(3500);

    // Should NOT have spawned a 2nd concurrent HTTP request
    calls = fetchMock.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("/summarize"),
    );
    expect(calls).toHaveLength(1);

    // Resolve the first summarize
    resolveFirstSummarize!();
    await vi.advanceTimersByTimeAsync(100);
  });
});
