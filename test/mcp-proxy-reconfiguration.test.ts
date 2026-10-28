import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryKV } from "../src/mcp/in-memory-kv.js";
import { resetHandleForTests, setLivezProbe } from "../src/mcp/rest-proxy.js";

const originalUrl = "https://old-memory.example.invalid";
const changedUrl = "https://new-memory.example.invalid";

describe("MCP saves during proxy reconfiguration", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-proxy-reconfiguration-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("AGENTMEMORY_URL", originalUrl);
    vi.stubEnv("AGENTMEMORY_SECRET", "synthetic-proxy-secret");
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", "");
    resetHandleForTests();
  });

  afterEach(() => {
    resetHandleForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it.each([
    { url: originalUrl, force: "1" },
    { url: changedUrl, force: "true" },
  ])("rejects saves instead of using pending local fallback after setting $force at $url", async ({ url, force }) => {
    const { handleToolCall } = await import("../src/mcp/standalone.js");
    const localKv = new InMemoryKV();
    let finishProbe!: (value: { ok: boolean }) => void;
    setLivezProbe(() => new Promise((resolve) => { finishProbe = resolve; }));
    const fetchMock = vi.fn(async (_url: string) => { throw new Error("synthetic backend unavailable"); });
    vi.stubGlobal("fetch", fetchMock);

    const waitingSave = handleToolCall("memory_save", { content: "Before reconfiguration" }, localKv);
    vi.stubEnv("AGENTMEMORY_URL", url);
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", force);
    const currentSave = handleToolCall("memory_save", { content: "After reconfiguration" }, localKv);
    const results = Promise.allSettled([waitingSave, currentSave]);
    finishProbe({ ok: false });

    for (const result of await results) {
      expect(result).toMatchObject({ status: "rejected", reason: { message: "synthetic backend unavailable" } });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${url}/agentmemory/remember`, `${url}/agentmemory/remember`,
    ]);
    expect(await localKv.list("mem:memories")).toEqual([]);
  });

  it("routes pending and new saves to the changed endpoint after an old probe fails", async () => {
    const { handleToolCall } = await import("../src/mcp/standalone.js");
    const localKv = new InMemoryKV();
    let finishProbe!: (value: { ok: boolean }) => void;
    const oldProbe = new Promise<{ ok: boolean }>((resolve) => { finishProbe = resolve; });
    setLivezProbe((url) => url === originalUrl ? oldProbe : Promise.resolve({ ok: true }));
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ id: "remote-memory", action: "created" })));
    vi.stubGlobal("fetch", fetchMock);

    const waitingSave = handleToolCall("memory_save", { content: "Before endpoint change" }, localKv);
    vi.stubEnv("AGENTMEMORY_URL", changedUrl);
    const currentSave = handleToolCall("memory_save", { content: "After endpoint change" }, localKv);
    finishProbe({ ok: false });

    for (const result of await Promise.all([waitingSave, currentSave])) {
      expect(JSON.parse(result.content[0].text)).toEqual({ id: "remote-memory", action: "created" });
    }
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `${changedUrl}/agentmemory/remember`, `${changedUrl}/agentmemory/remember`,
    ]);
    expect(await localKv.list("mem:memories")).toEqual([]);
  });
});
