import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { resetHandleForTests, resolveHandle, setLivezProbe } from "../src/mcp/rest-proxy.js";

describe("MCP proxy credential origins", () => {
  let home: string;
  let secretPath: string;
  const remote = "https://memory.example.invalid";
  const local = "http://127.0.0.1:3111";

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-proxy-credentials-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("AGENTMEMORY_URL", remote);
    vi.stubEnv("AGENTMEMORY_SECRET", "");
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", "");
    mkdirSync(join(home, ".agentmemory"));
    secretPath = join(home, ".agentmemory", "secret");
    writeFileSync(secretPath, "synthetic-local-secret");
    resetHandleForTests();
  });

  afterEach(() => {
    resetHandleForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it("refuses a stale handle before attaching credentials for a changed endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const handle = await resolveHandle();
    if (handle.mode !== "proxy") throw new Error("expected proxy mode");
    vi.stubEnv("AGENTMEMORY_URL", local);
    await expect(handle.call("/agentmemory/sessions")).rejects.toThrow(/endpoint changed/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("authorization")).toBe(false);
  });

  it("re-resolves a changed endpoint and binds its probe and request credentials to that URL", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      return new Response("{}");
    }));
    await resolveHandle();
    vi.stubEnv("AGENTMEMORY_URL", local);
    const handle = await resolveHandle();
    if (handle.mode !== "proxy") throw new Error("expected proxy mode");
    await handle.call("/agentmemory/sessions");
    expect(calls).toEqual([
      { url: `${remote}/agentmemory/livez`, auth: null },
      { url: `${local}/agentmemory/livez`, auth: "Bearer synthetic-local-secret" },
      { url: `${local}/agentmemory/sessions`, auth: "Bearer synthetic-local-secret" },
    ]);
  });

  it("reloads local and explicit credentials between requests to the same endpoint", async () => {
    vi.stubEnv("AGENTMEMORY_URL", local);
    const auth: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      auth.push(new Headers(init?.headers).get("authorization"));
      return new Response("{}");
    }));
    const handle = await resolveHandle();
    if (handle.mode !== "proxy") throw new Error("expected proxy mode");
    writeFileSync(secretPath, "synthetic-rotated-file");
    await handle.call("/agentmemory/sessions");
    vi.stubEnv("AGENTMEMORY_SECRET", "synthetic-rotated-env");
    await handle.call("/agentmemory/sessions");
    expect(auth).toEqual(["Bearer synthetic-local-secret", "Bearer synthetic-rotated-file", "Bearer synthetic-rotated-env"]);
  });

  it.each([false, true])("does not reuse an in-flight probe after changing endpoint and forced mode: %s", async (forceProxy) => {
    let finishOld!: (value: { ok: boolean }) => void;
    const oldProbe = new Promise<{ ok: boolean }>((resolve) => { finishOld = resolve; });
    const probe = vi.fn((url: string) => url === remote ? oldProbe : Promise.resolve({ ok: true }));
    setLivezProbe(probe);
    const previous = resolveHandle();
    vi.stubEnv("AGENTMEMORY_URL", local);
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", forceProxy ? "1" : "");
    const current = resolveHandle();
    finishOld({ ok: false });
    const handle = await current;
    expect(handle).toMatchObject({ mode: "proxy", baseUrl: local });
    expect(await previous).toBe(handle);
    expect(await resolveHandle()).toBe(handle);
    expect(probe.mock.calls.map(([url]) => url)).toEqual(forceProxy ? [remote] : [remote, local]);
  });

  it("does not return an in-flight local fallback after forced proxy mode is enabled", async () => {
    let finish!: (value: { ok: boolean }) => void;
    setLivezProbe(() => new Promise((resolve) => { finish = resolve; }));
    const previous = resolveHandle();
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", "1");
    const current = resolveHandle();
    finish({ ok: false });
    expect(await current).toMatchObject({ mode: "proxy", baseUrl: remote });
    expect(await previous).toBe(await current);
  });

  it("refuses redirects for probes and writes even when a caller requests following", async () => {
    const redirects: Array<RequestRedirect | undefined> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      redirects.push(init?.redirect);
      return new Response("{}");
    }));
    const handle = await resolveHandle();
    if (handle.mode !== "proxy") throw new Error("expected proxy mode");
    await handle.call("/agentmemory/remember", { method: "POST", body: '{"content":"synthetic"}', redirect: "follow" });
    expect(redirects).toEqual(["error", "error"]);
  });

  it.each(["probe", "write"])("does not send local credentials or data to a redirected %s destination", async (phase) => {
    const redirected: string[] = [];
    const authorization: Array<string | undefined> = [];
    const destination = createServer((req, res) => {
      redirected.push(req.url ?? "");
      res.end("{}");
    });
    const listen = async (server: Server) => {
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("missing server address");
      return `http://127.0.0.1:${address.port}`;
    };
    const destinationUrl = await listen(destination);
    const origin = createServer((req, res) => {
      authorization.push(req.headers.authorization);
      if (phase === "write" && req.url === "/agentmemory/livez") res.end("{}");
      else {
        res.writeHead(307, { location: `${destinationUrl}/redirected` });
        res.end();
      }
    });
    try {
      vi.stubEnv("AGENTMEMORY_URL", await listen(origin));
      vi.stubEnv("AGENTMEMORY_SECRET", "synthetic-local-secret");
      const handle = await resolveHandle();
      if (phase === "probe") expect(handle.mode).toBe("local");
      else {
        if (handle.mode !== "proxy") throw new Error("expected proxy mode");
        await expect(handle.call("/agentmemory/remember", {
          method: "POST", body: '{"content":"synthetic"}', redirect: "follow",
        })).rejects.toThrow();
      }
      expect(authorization).toEqual(Array(phase === "probe" ? 1 : 2).fill("Bearer synthetic-local-secret"));
      expect(redirected).toEqual([]);
    } finally {
      origin.closeAllConnections();
      destination.closeAllConnections();
      await Promise.all([origin, destination].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    }
  });

  it.each([
    "file:///synthetic-url-secret", "https://user:synthetic-url-secret@example.invalid",
    "https://example.invalid/?token=synthetic-url-secret", "https://example.invalid/#synthetic-url-secret",
    "http://localhost:3111?", "http://localhost:3111#",
    "http://localhost:invalid", "http://localhost/synthetic-url-secret bad",
  ])("rejects unsafe URL configuration before fetching or logging its value: %s", async (url) => {
    vi.stubEnv("AGENTMEMORY_URL", url);
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const logs = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await expect(resolveHandle()).rejects.toThrow("AGENTMEMORY_URL must be an HTTP(S) URL without credentials, query, or fragment");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(logs.mock.calls)).not.toContain("synthetic-url-secret");
    } finally { logs.mockRestore(); }
  });

  it("does not reuse a cached local fallback after forced proxy mode is enabled", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await resolveHandle()).mode).toBe("local");
    vi.stubEnv("AGENTMEMORY_FORCE_PROXY", "true");
    expect((await resolveHandle()).mode).toBe("proxy");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
