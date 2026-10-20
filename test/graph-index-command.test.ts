import { afterEach, describe, expect, it, vi } from "vitest";
import { runGraphIndexCommand } from "../src/cli/graph-index.js";

afterEach(() => vi.unstubAllGlobals());

describe("graph-index CLI", () => {
  it.each([[], ["status"], ["status", "--json"]].map((args) => ({ args })))("reads status without starting a server or migration ($args)", async ({ args }) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: "needs-migration", action: "migrate" })));
    vi.stubGlobal("fetch", fetch);
    const log = vi.fn();
    expect(await runGraphIndexCommand({ base: "http://127.0.0.1:3211", secret: "private-profile", args, log })).toBe(0);
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3211/agentmemory/graph/index", expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ Authorization: "Bearer private-profile" }),
    }));
    if (args.includes("--json")) expect(JSON.parse(log.mock.calls[0][0])).toHaveProperty("state", "needs-migration");
  });

  it.each([["migrate"], ["migrate", "--allow-legacy-scan=false"], ["status", "--allow-legacy-scan"], ["delete"], ["resume", "--wat"]].map((args) => ({ args })))("rejects unsafe or unknown arguments before any network call ($args)", async ({ args }) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await runGraphIndexCommand({ base: "http://localhost:3111", args, log: vi.fn() })).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards only explicit discovery consent and preserves the selected endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: "discovering", jobId: "job" }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    expect(await runGraphIndexCommand({ base: "https://example.test/memory", secret: "remote", args: ["migrate", "--json", "--allow-legacy-scan", "--instance", "2"], log: vi.fn() })).toBe(0);
    expect(fetch).toHaveBeenCalledWith("https://example.test/memory/agentmemory/graph/index/migrate", expect.objectContaining({
      method: "POST", body: '{"allowLegacyScan":true}',
    }));
  });

  it("resumes sealed work without authorizing a new legacy scan", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: "building" }), { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    expect(await runGraphIndexCommand({ base: "http://localhost:3111", args: ["resume"], log: vi.fn() })).toBe(0);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"allowLegacyScan":false}' });
  });

  it.each([401, 409, 500])("returns nonzero for HTTP %i and JSON diagnostics", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "refused" }), { status })));
    const log = vi.fn();
    expect(await runGraphIndexCommand({ base: "http://localhost:3111", args: ["status", "--json"], log })).toBe(1);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ error: "refused", httpStatus: status });
  });

  it("returns machine-readable connection errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const log = vi.fn();
    expect(await runGraphIndexCommand({ base: "http://localhost:3111", args: ["status", "--json"], log })).toBe(1);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ error: "offline" });
  });
});
