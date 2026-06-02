import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  buildAllowedHosts,
  isLoopbackHost,
  requireInboundBearer,
  resolveViewerHost,
  startViewerServer,
  ViewerConfigError,
} from "../src/viewer/server.js";

describe("resolveViewerHost", () => {
  const originalEnv = process.env.AGENTMEMORY_VIEWER_HOST;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_VIEWER_HOST;
    } else {
      process.env.AGENTMEMORY_VIEWER_HOST = originalEnv;
    }
  });

  it("defaults to 127.0.0.1 when AGENTMEMORY_VIEWER_HOST is unset", () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    expect(resolveViewerHost()).toBe("127.0.0.1");
  });

  it("defaults to 127.0.0.1 when AGENTMEMORY_VIEWER_HOST is empty", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "";
    expect(resolveViewerHost()).toBe("127.0.0.1");
  });

  it("returns the configured value when AGENTMEMORY_VIEWER_HOST is set", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "::";
    expect(resolveViewerHost()).toBe("::");
  });

  it("trims surrounding whitespace", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "  ::1  ";
    expect(resolveViewerHost()).toBe("::1");
  });
});

describe("isLoopbackHost", () => {
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["localhost", true],
    ["  127.0.0.1  ", true],
    ["LOCALHOST", true],
    ["::", false],
    ["0.0.0.0", false],
    ["10.0.0.1", false],
    ["fly-local-6pn", false],
  ])("classifies %s as loopback=%s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
});

describe("buildAllowedHosts", () => {
  const originalOverride = process.env.VIEWER_ALLOWED_HOSTS;

  afterEach(() => {
    if (originalOverride === undefined) {
      delete process.env.VIEWER_ALLOWED_HOSTS;
    } else {
      process.env.VIEWER_ALLOWED_HOSTS = originalOverride;
    }
  });

  it("seeds loopback defaults and CORS origins when bind is loopback", () => {
    delete process.env.VIEWER_ALLOWED_HOSTS;
    const allowed = buildAllowedHosts(
      ["http://localhost:3111", "http://127.0.0.1:3111"],
      3113,
      "127.0.0.1",
    );
    expect(allowed.has("localhost:3113")).toBe(true);
    expect(allowed.has("127.0.0.1:3113")).toBe(true);
    expect(allowed.has("[::1]:3113")).toBe(true);
    expect(allowed.has("localhost:3111")).toBe(true);
    expect(allowed.has("127.0.0.1:3111")).toBe(true);
  });

  it("drops loopback defaults when bind is non-loopback, leaving only VIEWER_ALLOWED_HOSTS", () => {
    process.env.VIEWER_ALLOWED_HOSTS = "viewer.example.com,localhost:3113";
    const allowed = buildAllowedHosts(
      ["http://localhost:3111", "http://127.0.0.1:3111"],
      3113,
      "::",
    );
    expect(allowed.has("viewer.example.com")).toBe(true);
    expect(allowed.has("localhost:3113")).toBe(true); // came in via the override
    // Origin-derived loopback hostnames must not silently land in the
    // allowlist when bind is non-loopback — otherwise Host header
    // spoofing reopens the very gap the override is meant to close.
    expect(allowed.has("localhost:3111")).toBe(false);
    expect(allowed.has("127.0.0.1:3111")).toBe(false);
    expect(allowed.has("127.0.0.1:3113")).toBe(false);
    expect(allowed.has("[::1]:3113")).toBe(false);
  });

  it("returns an empty set when bind is non-loopback and the override is empty", () => {
    delete process.env.VIEWER_ALLOWED_HOSTS;
    const allowed = buildAllowedHosts(
      ["http://localhost:3111"],
      3113,
      "0.0.0.0",
    );
    expect(allowed.size).toBe(0);
  });
});

describe("requireInboundBearer", () => {
  const secret = "s3cr3t-bearer-value";

  it("accepts a matching Bearer token", () => {
    expect(requireInboundBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("accepts case-insensitive scheme", () => {
    expect(requireInboundBearer(`bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a mismatching Bearer token", () => {
    expect(requireInboundBearer(`Bearer wrong-token`, secret)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(requireInboundBearer(undefined, secret)).toBe(false);
  });

  it("rejects a non-Bearer scheme", () => {
    expect(requireInboundBearer(`Basic ${secret}`, secret)).toBe(false);
  });

  it("rejects an array Authorization header", () => {
    expect(requireInboundBearer([`Bearer ${secret}`], secret)).toBe(false);
  });
});

describe("startViewerServer host binding", () => {
  const originalEnv = process.env.AGENTMEMORY_VIEWER_HOST;
  const originalOverride = process.env.VIEWER_ALLOWED_HOSTS;
  let server: Server | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_VIEWER_HOST;
    } else {
      process.env.AGENTMEMORY_VIEWER_HOST = originalEnv;
    }
    if (originalOverride === undefined) {
      delete process.env.VIEWER_ALLOWED_HOSTS;
    } else {
      process.env.VIEWER_ALLOWED_HOSTS = originalOverride;
    }
  });

  async function waitForListening(s: Server): Promise<void> {
    if (s.listening) return;
    await new Promise<void>((resolve) => s.once("listening", () => resolve()));
  }

  it("binds to 127.0.0.1 by default — preserves loopback-only security", async () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    server = startViewerServer(0, null, null);
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe("127.0.0.1");
  });

  it("binds to AGENTMEMORY_VIEWER_HOST when set — covers the deploy/fly fix for #434", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "::1";
    server = startViewerServer(0, null, null);
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    expect(addr.address).toBe("::1");
  });

  it("refuses to start when bind is non-loopback and no AGENTMEMORY_SECRET is configured", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    process.env.VIEWER_ALLOWED_HOSTS = "viewer.example.com";
    expect(() => startViewerServer(0, null, null)).toThrow(ViewerConfigError);
    expect(() => startViewerServer(0, null, null)).toThrow(
      /unset AGENTMEMORY_VIEWER_HOST/,
    );
    expect(() => startViewerServer(0, null, null)).toThrow(
      /set AGENTMEMORY_SECRET/,
    );
  });

  it("refuses to start when bind is non-loopback and VIEWER_ALLOWED_HOSTS is empty", () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    delete process.env.VIEWER_ALLOWED_HOSTS;
    expect(() =>
      startViewerServer(0, null, null, "test-secret"),
    ).toThrow(ViewerConfigError);
    expect(() => startViewerServer(0, null, null, "test-secret")).toThrow(
      /set VIEWER_ALLOWED_HOSTS/,
    );
    expect(() => startViewerServer(0, null, null, "test-secret")).toThrow(
      /unset AGENTMEMORY_VIEWER_HOST/,
    );
  });

  it("returns 401 for non-Bearer API calls when bind is non-loopback", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    // Pre-seed an entry so refuse-start passes. The request-time
    // buildAllowedHosts call will re-read the env, so we widen it after
    // the port is known.
    process.env.VIEWER_ALLOWED_HOSTS = "placeholder";
    const secret = "test-secret-xyz";
    server = startViewerServer(0, null, null, secret);
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    process.env.VIEWER_ALLOWED_HOSTS = `127.0.0.1:${addr.port}`;

    const unauthed = await fetch(
      `http://127.0.0.1:${addr.port}/agentmemory/livez`,
    );
    expect(unauthed.status).toBe(401);

    const wrongBearer = await fetch(
      `http://127.0.0.1:${addr.port}/agentmemory/livez`,
      { headers: { Authorization: "Bearer wrong-token" } },
    );
    expect(wrongBearer.status).toBe(401);

    // Correct bearer reaches the proxy. Upstream is not running in
    // this test, so we expect a non-401 status (the proxy will fail
    // with 502/504) — the key invariant is that the auth gate let it
    // through.
    const goodBearer = await fetch(
      `http://127.0.0.1:${addr.port}/agentmemory/livez`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    expect(goodBearer.status).not.toBe(401);
  });

  it("does not require inbound auth on the loopback default bind", async () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    delete process.env.VIEWER_ALLOWED_HOSTS;
    server = startViewerServer(0, null, null, "test-secret-xyz");
    await waitForListening(server);
    const addr = server.address() as AddressInfo;

    const res = await fetch(
      `http://127.0.0.1:${addr.port}/agentmemory/livez`,
    );
    // No 401: the loopback bind keeps the legacy behaviour where any
    // local process is implicitly trusted. Upstream is not running, so
    // we expect a proxy-error status, just not the auth gate.
    expect(res.status).not.toBe(401);
  });

  it("serves HTML at / on non-loopback bind without requiring a Bearer", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    process.env.VIEWER_ALLOWED_HOSTS = "placeholder";
    server = startViewerServer(0, null, null, "test-secret-xyz");
    await waitForListening(server);
    const addr = server.address() as AddressInfo;
    process.env.VIEWER_ALLOWED_HOSTS = `127.0.0.1:${addr.port}`;

    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    // The HTML shell stays unauthenticated so a browser can fetch it;
    // the embedded JS still needs the bearer for the data calls.
    expect(res.status).not.toBe(401);
  });

  it("logs non-loopback bind mode and inbound auth requirements", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    process.env.VIEWER_ALLOWED_HOSTS = "localhost:3113,[::1]:3113";
    server = startViewerServer(0, null, null, "test-secret-xyz");
    await waitForListening(server);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("bound to 0.0.0.0; inbound Bearer required"),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("allowed Host headers: localhost:3113, [::1]:3113"),
    );
  });

  it("does not retry EADDRINUSE when bind is non-loopback", async () => {
    process.env.AGENTMEMORY_VIEWER_HOST = "0.0.0.0";
    process.env.VIEWER_ALLOWED_HOSTS = "localhost:3113";

    const blocker = createServer((_req, res) => res.end("busy"));
    await new Promise<void>((resolve) => blocker.listen(0, "0.0.0.0", resolve));
    const blockedPort = (blocker.address() as AddressInfo).port;

    try {
      const viewer = startViewerServer(
        blockedPort,
        null,
        null,
        "test-secret-xyz",
      );
      const err = await new Promise<NodeJS.ErrnoException>((resolve) =>
        viewer.once("error", resolve),
      );
      expect(err.code).toBe("EADDRINUSE");
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(viewer.listening).toBe(false);
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(`fallback from ${blockedPort}`),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not retrying because non-loopback viewer binds"),
      );
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
