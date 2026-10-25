import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../src/integrations/dsh.js";
import { spoolSummary } from "../src/capture/spool.js";

type Session = { id: string; header: { cwd: string } };
const url = "http://127.0.0.1:43111";
let home: string;
let requests: { path: string; body: Record<string, unknown>; headers: Headers }[];
let reply: (path: string, body: Record<string, unknown>, signal: AbortSignal) => Promise<Response>;
let disposers: (() => Promise<void>)[];

function harness(config: Parameters<typeof apply>[1] = {}) {
  const listeners = new Map<string, Function>();
  let dispose!: () => Promise<void>;
  const warn = vi.fn();
  apply({ on: (event, listener) => { listeners.set(event, listener); },
    effect: callback => { dispose = callback(); }, logger: { warn } }, config);
  const stop = async () => { if (disposers.includes(stop)) { disposers.splice(disposers.indexOf(stop), 1); await dispose(); } };
  disposers.push(stop);
  const session: Session = { id: "dsh-session", header: { cwd: home } };
  const emit = (type: string, seq: number, data: Record<string, unknown>, target = session) =>
    listeners.get("session/event")!(target, { type, seq, time: 1000 + seq, data });
  const step = (decision: unknown = { kind: "enter", messages: [{ id: "prompt", role: "user", content: [] }], startsRequestSeries: true }, signal = new AbortController().signal) =>
    listeners.get("agent/pre-step")!({ agent: { session }, signal }, async () => decision);
  return { listeners, session, emit, step, stop, warn };
}
const observations = () => requests.filter(r => r.path === "/observe").map(r => r.body as Record<string, unknown> & { data: Record<string, unknown> });

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "am-dsh-native-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
  vi.stubEnv("AGENTMEMORY_URL", url);
  vi.stubEnv("AGENTMEMORY_PROJECT_NAME", "dsh-test");
  vi.stubEnv("AGENTMEMORY_SECRET", "");
  vi.stubEnv("AGENTMEMORY_CAPTURE_ALLOW", "");
  vi.stubEnv("AGENTMEMORY_CAPTURE_DENY", "");
  vi.stubEnv("AGENTMEMORY_CAPTURE_OUTPUT_MAX", "");
  vi.stubEnv("AGENTMEMORY_CREDENTIAL_MODE", "");
  vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL", "true");
  vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", join(home, "spool"));
  requests = [];
  disposers = [];
  reply = async path => Response.json(path === "/session/start" ? { context: "Saved project facts" } : {}, { status: path === "/observe" ? 201 : 200 });
  vi.stubGlobal("fetch", vi.fn(async (target: string, options: RequestInit) => {
    const path = new URL(target).pathname.replace("/agentmemory", "");
    const body = JSON.parse(String(options.body));
    requests.push({ path, body, headers: new Headers(options.headers) });
    return reply(path, body, options.signal!);
  }));
});
afterEach(async () => {
  for (const dispose of [...disposers]) await dispose();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe("bundled DSH plugin", () => {
  it("orders start, captures and end, scopes projects and deduplicates persisted events", async () => {
    const h = harness();
    h.listeners.get("session/created")!(h.session);
    h.emit("user/message", 1, { content: [{ type: "text", text: "remember this" }] });
    h.emit("user/message", 1, { content: "duplicate" });
    h.emit("tool/call", 2, { callId: "read", name: "read", arguments: '{"path":"a.ts"}' });
    h.emit("tool/result", 3, { message: { toolCallId: "read", content: [{ type: "text", text: "contents" }] } });
    h.emit("assistant/message", 4, { message: { role: "assistant", content: [{ type: "text", text: "Final plan" }] } });
    h.emit("assistant/message", 4, { message: { content: "duplicate" } });
    h.listeners.get("session/disposed")!(h.session);
    await h.stop();
    expect(requests.map(r => r.path)).toEqual(["/session/start", "/observe", "/observe", "/observe", "/session/end"]);
    expect(observations()).toMatchObject([
      { hookType: "prompt_submit", project: "dsh-test", cwd: home, sessionId: h.session.id, data: { prompt: "remember this" } },
      { hookType: "post_tool_use", data: { tool_name: "read", tool_input: '{"path":"a.ts"}', tool_output: "contents" } },
      { hookType: "stop", data: { last_assistant_message: "Final plan" } },
    ]);
    expect(observations()[0].eventId).not.toBe(observations()[1].eventId);
    h.emit("user/message", 5, { content: "late event" });
    expect(requests).toHaveLength(5);
  });

  it("handles interleaved sessions and matches out-of-order tool results by call ID", async () => {
    const h = harness();
    const other = { ...h.session, id: "other" };
    h.emit("tool/call", 1, { callId: "a", name: "read", arguments: "a" });
    h.emit("tool/call", 2, { callId: "b", name: "write", arguments: "b" });
    h.emit("tool/call", 1, { callId: "a", name: "other", arguments: "other" }, other);
    h.emit("tool/result", 3, { message: { toolCallId: "b", content: "b-result" }, error: { reason: "failed" } });
    h.emit("tool/result", 4, { message: { toolCallId: "a", content: "a-result" } });
    h.emit("tool/result", 2, { message: { toolCallId: "a", content: "other-result" } }, other);
    await h.stop();
    expect(observations()).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: "dsh-session", hookType: "post_tool_failure", data: expect.objectContaining({ tool_input: "b", tool_output: "b-result" }) }),
      expect.objectContaining({ sessionId: "dsh-session", data: expect.objectContaining({ tool_input: "a", tool_output: "a-result" }) }),
      expect.objectContaining({ sessionId: "other", data: expect.objectContaining({ tool_input: "other", tool_output: "other-result" }) }),
    ]));
  });

  it("filters synthetic messages, own MCP calls, images, private text and JSON credentials", async () => {
    const h = harness();
    h.emit("user/message", 1, { source: { kind: "compaction" }, content: "synthetic" });
    h.emit("user/message", 2, { content: [{ type: "image", data: "image-secret" }] });
    h.emit("tool/call", 3, { callId: "self", name: "mcp__agentmemory__memory_save", arguments: "self" });
    h.emit("tool/result", 4, { message: { toolCallId: "self", content: "self" } });
    h.emit("tool/call", 5, { callId: "read", name: "read", arguments: JSON.stringify({ token: "short-secret", nested: { password: "hidden", client_secret: "client-value", private_key: "private-value", aws_secret_access_key: "aws-value", auth_token: "auth-value", max_tokens: 4096 }, path: "a.ts" }) });
    h.emit("tool/result", 6, { message: { toolCallId: "read", isError: true, content: [{ type: "image", data: "image-secret" }, { type: "text", text: "<private>" + "private-value".repeat(1000) + "</private> useful" }] } });
    h.emit("compaction/summary", 7, { summary: [{ type: "text", text: "summary" }], rawOutput: "raw-secret" });
    h.emit("approval/asked", 8, { toolName: "bash", callId: "c", reason: "permission", raw: "raw-secret" });
    h.emit("assistant/message", 9, { message: { content: [{ type: "thinking", text: "reasoning-secret" }, { type: "image", data: "image-secret" }, { type: "tool-call", name: "read" }] } });
    h.emit("assistant/message", 10, { message: { content: [{ type: "text", text: "<private>private-value</private> public reply" }] } });
    await h.stop();
    expect(observations().map(r => r.hookType)).toEqual(["post_tool_failure", "pre_compact", "notification", "stop"]);
    expect(observations()[3].data.last_assistant_message).toBe("[REDACTED] public reply");
    const captured = JSON.stringify(observations());
    for (const secret of ["synthetic", "image-secret", "short-secret", "hidden", "private-value", "raw-secret", "reasoning-secret", "client-value", "aws-value", "auth-value"]) expect(captured).not.toContain(secret);
    expect(observations()[0].data.tool_output).toBe("[REDACTED] useful");
    expect(observations()[0].data.tool_input).toContain("a.ts");
    expect(JSON.parse(String(observations()[0].data.tool_input)).nested.max_tokens).toBe(4096);
  });

  it("honors shared capture filters and the configured output limit", async () => {
    vi.stubEnv("AGENTMEMORY_CAPTURE_DENY", "bash");
    vi.stubEnv("AGENTMEMORY_CAPTURE_OUTPUT_MAX", "16000");
    const h = harness();
    h.emit("tool/call", 1, { callId: "denied", name: "bash", arguments: "private command" });
    h.emit("tool/result", 2, { message: { toolCallId: "denied", content: "private output" } });
    h.emit("tool/call", 3, { callId: "large", name: "read", arguments: "file" });
    h.emit("tool/result", 4, { message: { toolCallId: "large", content: "x".repeat(17000) } });
    h.emit("assistant/message", 5, { message: { content: "y".repeat(17000) } });
    await h.stop();
    expect(observations()).toHaveLength(2);
    expect(observations()[1].data.last_assistant_message).toHaveLength(16000);
    expect(observations()[0].data.tool_output).toHaveLength(16000);
    expect(observations()[0].data.tool_output).toMatch(/\[\.\.\.truncated\]$/);
  });

  it("injects reference context once without changing the decision or capturing it", async () => {
    const h = harness();
    const result = await h.step();
    expect(result.startsRequestSeries).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toMatchObject({ role: "user", source: { kind: "agentmemory" }, content: [{ type: "text", text: expect.stringContaining("Saved project facts") }] });
    h.emit("user/message", 1, result.messages[1]);
    expect((await h.step()).messages).toHaveLength(1);
    await h.stop();
    expect(observations()).toEqual([]);
  });

  it("preserves rejected, empty and cancelled steps", async () => {
    const h = harness();
    for (const decision of [{ kind: "reject" }, { kind: "enter", messages: [] }]) expect(await h.step(decision)).toBe(decision);
    const decision = { kind: "enter", messages: [{}] };
    expect(await h.step(decision, AbortSignal.abort())).toBe(decision);
    expect(requests).toEqual([]);
  });

  it("retries unavailable context and ignores capture backlog when preparing a model request", async () => {
    let release!: () => void;
    reply = async path => {
      if (path === "/session/start") return Response.json({});
      if (path === "/context") return Response.json({ context: "late memory" });
      if (path === "/observe") await new Promise<void>(resolve => { release = resolve; });
      return Response.json({});
    };
    const h = harness();
    h.emit("user/message", 1, { content: "prompt" });
    const result = await h.step();
    expect(result.messages[1].content[0].text).toContain("late memory");
    release();
    await h.stop();
  });

  it.each([200, 503])("backs off empty context after HTTP %s and retries later in the same session", async status => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      reply = async path => Response.json({}, { status: path === "/context" ? status : 200 });
      const h = harness();
      expect((await h.step()).messages).toHaveLength(1);
      expect((await h.step()).messages).toHaveLength(1);
      expect(requests.filter(r => r.path === "/context")).toHaveLength(1);
      clock.mockReturnValue(11_001);
      reply = async () => Response.json({ context: "new memory" });
      expect((await h.step()).messages[1].content[0].text).toContain("new memory");
      expect(requests.filter(r => r.path === "/context")).toHaveLength(2);
      await h.stop();
    } finally {
      clock.mockRestore();
    }
  });

  it("uses saved local credentials and refreshes them between requests", async () => {
    mkdirSync(join(home, ".agentmemory"));
    const secretFile = join(home, ".agentmemory", "secret");
    writeFileSync(secretFile, "first-test-secret");
    const h = harness();
    await h.step();
    writeFileSync(secretFile, "rotated-test-secret");
    await h.stop();
    expect(requests[0].headers.get("authorization")).toBe("Bearer first-test-secret");
    expect(requests.at(-1)!.headers.get("authorization")).toBe("Bearer rotated-test-secret");
  });

  it("uses explicit remote HTTPS credentials without following redirects", async () => {
    const h = harness({ url: "https://memory.example.test", secret: "remote-test-secret" });
    await h.step();
    expect(requests[0].headers.get("authorization")).toBe("Bearer remote-test-secret");
    expect(fetch).toHaveBeenCalledWith("https://memory.example.test/agentmemory/session/start", expect.objectContaining({ redirect: "error" }));
  });

  it("never sends credentials over remote HTTP or includes them in warnings", async () => {
    const h = harness({ url: "http://memory.example.test", secret: "remote-test-secret" });
    await h.step();
    await h.stop();
    expect(fetch).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain("remote-test-secret");
  });

  it("spools transient failures and replays the same event ID after restart", async () => {
    reply = async () => { throw new Error("offline"); };
    const h = harness();
    h.emit("user/message", 1, { content: "offline fact <private>hidden</private>" });
    h.emit("assistant/message", 2, { message: { content: "offline reply <private>hidden</private>" } });
    await h.stop();
    const original = observations();
    expect(spoolSummary(url).records).toBe(2);
    expect(readFileSync(spoolSummary(url).path, "utf8")).not.toContain("hidden");
    reply = async () => Response.json({}, { status: 201 });
    const recovered = harness();
    await recovered.stop();
    expect(spoolSummary(url).records).toBe(0);
    expect(observations().slice(2)).toEqual(original);
  });

  it.each([400, 401, 403])("does not retry permanent HTTP %s failures", async status => {
    reply = async () => Response.json({}, { status });
    const h = harness();
    h.emit("user/message", 1, { content: "prompt" });
    await h.stop();
    expect(spoolSummary(url).records).toBe(0);
  });

  it("bounds shutdown even when the daemon hangs with queued observations", async () => {
    reply = (_path, _body, signal) => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const h = harness();
    for (let seq = 0; seq < 8; seq++) h.emit("user/message", seq, { content: `prompt ${seq}` });
    const started = Date.now();
    await h.stop();
    expect(Date.now() - started).toBeLessThan(6500);
    expect(spoolSummary(url).records).toBe(8);
    expect(requests.at(-1)?.path).toBe("/session/end");
  }, 10_000);
});
