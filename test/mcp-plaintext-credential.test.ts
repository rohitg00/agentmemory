import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidateHandle,
  resetHandleForTests,
  resolveHandle,
  setLivezProbe,
} from "../src/mcp/rest-proxy.js";
import { createProxyBackend } from "../src/mcp/http.js";

afterEach(() => {
  resetHandleForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function configureCredential(
  name: "AGENTMEMORY_SECRET" | "AGENTMEMORY_CALLER_TOKEN",
  value = "test-credential",
): void {
  vi.stubEnv("AGENTMEMORY_SECRET", "");
  vi.stubEnv("AGENTMEMORY_CALLER_TOKEN", "");
  vi.stubEnv(name, value);
}

describe("standalone MCP proxy plaintext credential guard", () => {
  it("warns once before proxying credentials over non-loopback HTTP", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "http://remote.example:3111");
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "");
    configureCredential("AGENTMEMORY_SECRET");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const livezProbe = vi.fn(async () => ({ ok: true }));
    setLivezProbe(livezProbe);

    expect((await resolveHandle()).mode).toBe("proxy");
    invalidateHandle();
    expect((await resolveHandle()).mode).toBe("proxy");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(
      "plaintext HTTP to http://remote.example:3111",
    );
    expect(livezProbe).toHaveBeenCalledTimes(2);
  });

  it("refuses caller-token-only remote HTTP before the livez probe", async () => {
    vi.stubEnv("AGENTMEMORY_URL", "http://remote.example:3111");
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "1");
    configureCredential("AGENTMEMORY_CALLER_TOKEN");
    const livezProbe = vi.fn(async () => ({ ok: true }));
    setLivezProbe(livezProbe);

    await expect(resolveHandle()).rejects.toThrow(
      /plaintext HTTP to http:\/\/remote\.example:3111/,
    );
    expect(livezProbe).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3111",
    "http://127.0.0.1:3111",
    "http://[::1]:3111",
    "https://remote.example",
  ])("allows credentials with AGENTMEMORY_REQUIRE_HTTPS=1 for %s", async (url) => {
    vi.stubEnv("AGENTMEMORY_URL", url);
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "1");
    configureCredential("AGENTMEMORY_SECRET");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setLivezProbe(async () => ({ ok: true }));

    expect((await resolveHandle()).mode).toBe("proxy");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Streamable HTTP MCP backend plaintext credential guard", () => {
  it("warns once before proxying credentials over non-loopback HTTP", async () => {
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "");
    configureCredential("AGENTMEMORY_SECRET");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const backend = createProxyBackend({
      baseUrl: "http://remote.example:3111",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(await backend.health()).toBe(true);
    expect(await backend.health()).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(
      "plaintext HTTP to http://remote.example:3111",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses caller-token-only remote HTTP before creating the backend", () => {
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "1");
    configureCredential("AGENTMEMORY_CALLER_TOKEN");
    const fetchImpl = vi.fn();

    expect(() =>
      createProxyBackend({
        baseUrl: "http://remote.example:3111",
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).toThrow(/plaintext HTTP to http:\/\/remote\.example:3111/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3111",
    "http://127.0.0.1:3111",
    "http://[::1]:3111",
    "https://remote.example",
  ])("allows credentials with AGENTMEMORY_REQUIRE_HTTPS=1 for %s", async (baseUrl) => {
    vi.stubEnv("AGENTMEMORY_REQUIRE_HTTPS", "1");
    configureCredential("AGENTMEMORY_SECRET");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const backend = createProxyBackend({
      baseUrl,
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(await backend.health()).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
