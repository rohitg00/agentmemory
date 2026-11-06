import { afterEach, describe, expect, it, vi } from "vitest";
import { runCompressionCommand } from "../src/cli/compression.js";

afterEach(() => vi.unstubAllGlobals());

function fixture(result: unknown = { success: true, items: [], dryRun: true }) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const log = vi.fn();
  const run = (args: string[], secret?: string) => runCompressionCommand({ base: "http://127.0.0.1:18999", args, secret, log });
  return { fetch, log, run };
}

describe("compression CLI", () => {
  it("defaults to authenticated inspection with encoded project and agent filters", async () => {
    const f = fixture();
    expect(await f.run(["--project", "a/b & c", "--agent-id", "agent/one", "--limit", "2"], "synthetic-credential")).toBe(0);
    const [url, options] = f.fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/agentmemory/compression");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ project: "a/b & c", agentId: "agent/one", limit: "2" });
    expect(options).toMatchObject({ method: "GET", headers: { Authorization: "Bearer synthetic-credential" } });
    expect(options.body).toBeUndefined();
    expect(f.log.mock.calls.flat().join(" ")).not.toContain("synthetic-credential");
  });

  it("retries only when explicitly requested and returns the server's unsuccessful result", async () => {
    const result = { success: false, items: [{ sessionId: "s", observationId: "o", status: "failed", retryable: true, outcome: "failed", error: "compression_failed" }], attempted: 1, recovered: 0, failed: 1 };
    const f = fixture(result);
    expect(await f.run(["--retry", "--session", "s", "--project", "p", "--json"])).toBe(1);
    const [url, options] = f.fetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:18999/agentmemory/compression/retry");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({ sessionId: "s", project: "p", limit: 10 });
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual(result);
  });

  it("treats an empty cursor as the first page and accepts global port selectors", async () => {
    const f = fixture();
    expect(await f.run(["--session", "s", "--cursor", "", "--dry-run", "--port", "18888", "--instance", "2"])).toBe(0);
    expect(new URL(f.fetch.mock.calls[0][0]).searchParams.has("cursor")).toBe(false);
    expect(f.fetch.mock.calls[0][1].method).toBe("GET");
  });

  it("accepts equals-form global port and instance selectors", async () => {
    const f = fixture();
    expect(await f.run(["--session", "s", "--port=18888", "--instance=0"])).toBe(0);
    expect(f.fetch.mock.calls[0][1].method).toBe("GET");
  });

  it.each([
    [], ["--retry"], ["--project", ""], ["--project", "   "], ["--session"], ["--session", "--json"],
    ["--session", "s", "--session", "s2"], ["--session", "s", "--wat"],
    ["--session", "s", "--retry", "--dry-run"], ["--session", "s", "--port"],
    ["--session", "s", "--port="], ["--session", "s", "--instance="],
    ["--session", "s", "--cursor", "bad-cursor"], ["--session", "s", "--agent-id", ""],
    ...["0", "101", "-1", "1.5", "1e2", "Infinity", "2x"].map((limit) => ["--session", "s", "--limit", limit]),
  ])("rejects invalid options without contacting the service: %j", async (...args: string[]) => {
    const f = fixture();
    expect(await f.run(args)).toBe(1);
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 503])("reports HTTP %i without echoing sensitive server details", async (status) => {
    const f = fixture();
    f.fetch.mockResolvedValue(new Response("private provider error", { status }));
    expect(await f.run(["--session", "s", "--json"])).toBe(1);
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ success: false, error: `Compression endpoint returned HTTP ${status}` });
  });

  it.each([{ items: [] }, { success: true }, [], null])("rejects malformed successful responses: %j", async (result) => {
    const f = fixture(result);
    expect(await f.run(["--session", "s"])).toBe(1);
  });

  it("reports a network failure with an unsuccessful exit", async () => {
    const f = fixture();
    f.fetch.mockRejectedValue(new Error("Connection refused"));
    expect(await f.run(["--session", "s", "--json"])).toBe(1);
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ success: false, error: "Connection refused" });
  });

  it("shows source availability and the continuation cursor during inspection", async () => {
    const f = fixture({ success: true, items: [{ sessionId: "s", observationId: "o", status: "failed", retryable: false, error: "source_unavailable" }], nextCursor: "continuation" });
    expect(await f.run(["--session", "s"])).toBe(0);
    const output = f.log.mock.calls.flat().join("\n");
    expect(output).toContain("[source unavailable]");
    expect(output).toContain("--cursor continuation");
    expect(output).not.toContain("Use --retry");
  });

  it("explains how to restart pagination when an imported-ID cursor anchor changes", async () => {
    const f = fixture({ success: false, error: "cursor_stale", items: [] });
    expect(await f.run(["--project", "p"])).toBe(1);
    expect(f.log.mock.calls.flat().join("\n")).toContain("Restart without --cursor");
  });
});
