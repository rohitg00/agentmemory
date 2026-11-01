import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanCapture, createCapture } from "../integrations/omp/capture.js";
import { appendSpool } from "../src/capture/spool.js";

const url = "http://127.0.0.1:43392";
const body = { eventId: "event-12345678", hookType: "post_tool_use", sessionId: "session-1", project: "test", cwd: "/tmp/test", timestamp: new Date().toISOString(), data: { tool_name: "read", tool_output: "hello" } };
describe("OMP capture recovery", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "omp-spool-")); vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL_DIR", dir); vi.stubEnv("AGENTMEMORY_CAPTURE_SPOOL", "true"); });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
  it.each([0, 408, 429, 503])("persists a failed capture (%i) and replays the same identity after a new host starts", async status => {
    const offline = createCapture(url, async () => ({ status, body: null }));
    offline.enqueue(body); await offline.flush(); offline.stop();
    expect(offline.status().records).toBe(1);
    expect(readFileSync(offline.status().path, "utf8")).toContain(body.eventId);
    const send = vi.fn(async () => ({ status: 202, body: { status: "accepted" } }));
    const online = createCapture(url, send); await online.flush(); online.stop();
    expect(send).toHaveBeenCalledWith(body);
    expect(online.status().records).toBe(0);
  });
  it.each([400, 401, 403])("does not endlessly retry a rejected capture (%i)", async status => {
    const capture = createCapture(url, async () => ({ status, body: null }));
    capture.enqueue(body); await capture.flush(); capture.stop();
    expect(capture.status().records).toBe(0); expect(capture.status().error).toContain("rejected");
  });
  it("bounds replay of slow successful requests and leaves the remaining events queued", async () => {
    for (let i = 0; i < 10; i++) appendSpool(url, `event-${i}`, { ...body, eventId: `event-${i}` }, "offline");
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const send = vi.fn(async () => { now += 400; return { status: 202, body: { status: "accepted" } }; });
    const capture = createCapture(url, send);
    try {
      await capture.replay();
      expect(send).toHaveBeenCalledTimes(2);
      expect(capture.status().records).toBe(8);
    } finally { capture.stop(); clock.mockRestore(); }
  });
  it("retains acknowledgements until durable and requeues them if the daemon boot changes", async () => {
    let bootId = "oldboot1234";
    const send = vi.fn(async () => ({ status: 202, body: { status: "accepted", bootId, durableAfterMs: 60_000 } }));
    const capture = createCapture(url, send);
    capture.enqueue(body); await capture.flush(); expect(capture.status().retained).toBe(1);
    bootId = "newboot1234";
    capture.enqueue({ ...body, eventId: "event-23456789" }); await capture.flush(); capture.stop();
    expect(send.mock.calls.filter(([event]) => event.eventId === body.eventId)).toHaveLength(2);
    expect(capture.status().records).toBe(0);
  });
  it("redacts private blocks and structured secrets before serialization, including JSON tool output", () => {
    const keys = ["secret_key", "private_key", "accessKey", "aws_secret_access_key", "passwd", "secret-key"];
    const raw = { password: "short", nested: { api_key: "private-key", content: "hello <private>personal</private>", credentials: [Object.fromEntries(keys.map(key => [key, "opaque-value"]))] } };
    const cleaned = JSON.stringify(cleanCapture({ input: raw, output: JSON.stringify(raw) }));
    for (const value of ["short", "private-key", "personal", "opaque-value"]) expect(cleaned).not.toContain(value);
    expect(cleaned).toContain("hello"); expect(cleaned).toContain("REDACTED");
  });
});
