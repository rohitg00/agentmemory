import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { checkRequestGuard, configuredAllowedOrigins, isJsonContentType } from "../src/auth.js";
import { checkAuth, registerApiTriggers } from "../src/triggers/api.js";
import { startViewerServer } from "../src/viewer/server.js";

const TOKEN = ["hardening", "fixture", "value"].join("-");
const BEARER = `Bearer ${TOKEN}`;

function mockKV() {
  return {
    get: async () => null,
    set: async <T>(_s: string, _k: string, d: T) => d,
    delete: async () => {},
    update: async () => {},
    list: async () => [],
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, h: Function) => fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
  };
}

function send(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function listening(server: Server): Promise<number> {
  return new Promise((resolve) => {
    const done = () => resolve((server.address() as AddressInfo).port);
    if (server.listening) done();
    else server.once("listening", done);
  });
}

describe("checkRequestGuard", () => {
  const allowed = configuredAllowedOrigins([3111, 3113]);

  it("accepts exact application/json with an optional charset", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("Application/JSON; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain; application/json")).toBe(false);
    expect(isJsonContentType("text/plain;charset=application/json")).toBe(false);
    expect(isJsonContentType("application/json; boundary=x")).toBe(false);
    expect(isJsonContentType("application/jsonx")).toBe(false);
  });

  it("rejects a write from an origin outside the allowed set", () => {
    const rejected = checkRequestGuard({
      method: "POST",
      headers: { origin: "https://example.net", "content-type": "application/json" },
      allowedOrigins: allowed,
    });
    expect(rejected?.status_code).toBe(403);
  });

  it("rejects a body whose content type only contains application/json", () => {
    const rejected = checkRequestGuard({
      method: "POST",
      headers: { "content-type": "text/plain;application/json", "content-length": "2" },
      allowedOrigins: allowed,
    });
    expect(rejected?.status_code).toBe(415);
  });

  it("rejects a body sent without a content type", () => {
    const rejected = checkRequestGuard({
      method: "POST",
      headers: { "content-length": "10" },
      allowedOrigins: allowed,
    });
    expect(rejected?.status_code).toBe(415);
  });

  it("accepts writes without an Origin header and from loopback origins", () => {
    expect(
      checkRequestGuard({ method: "POST", headers: { "content-type": "application/json" }, allowedOrigins: allowed }),
    ).toBeNull();
    expect(
      checkRequestGuard({
        method: "DELETE",
        headers: { origin: "http://localhost:3113", "content-type": "application/json; charset=utf-8" },
        allowedOrigins: allowed,
      }),
    ).toBeNull();
    expect(checkRequestGuard({ method: "DELETE", headers: { origin: "http://127.0.0.1:3111" }, allowedOrigins: allowed })).toBeNull();
  });

  it("leaves reads alone", () => {
    expect(
      checkRequestGuard({ method: "GET", headers: { origin: "https://example.net" }, allowedOrigins: allowed }),
    ).toBeNull();
  });

  it("honours VIEWER_ALLOWED_ORIGINS", () => {
    const origins = configuredAllowedOrigins([3111], { VIEWER_ALLOWED_ORIGINS: "https://memory.example.com/" });
    expect(
      checkRequestGuard({ method: "POST", headers: { origin: "https://memory.example.com" }, allowedOrigins: origins }),
    ).toBeNull();
  });
});

describe("REST request validation", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    sdk = mockSdk();
    registerApiTriggers(sdk as never, mockKV() as never, TOKEN);
  });

  async function middleware(request: { method?: string; headers?: Record<string, string> }) {
    return sdk._fns.get("middleware::api-auth")!({ request });
  }

  it("middleware rejects a disallowed origin even with a valid bearer", async () => {
    const out = await middleware({
      method: "POST",
      headers: { origin: "https://example.net", authorization: BEARER, "content-type": "application/json" },
    });
    expect(out).toMatchObject({ action: "respond", response: { status_code: 403 } });
  });

  it("middleware rejects text/plain bodies that mention application/json", async () => {
    const out = await middleware({
      method: "POST",
      headers: { authorization: BEARER, "content-type": "text/plain; application/json" },
    });
    expect(out).toMatchObject({ action: "respond", response: { status_code: 415 } });
  });

  it("middleware lets a client without an Origin header through", async () => {
    const out = await middleware({
      method: "POST",
      headers: { authorization: BEARER, "content-type": "application/json" },
    });
    expect(out).toEqual({ action: "continue" });
  });

  it("checkAuth validates origin and content type before the bearer", () => {
    const denied = checkAuth(
      { method: "POST", headers: { origin: "https://example.net", "content-type": "text/plain" } } as never,
      TOKEN,
    );
    expect(denied?.status_code).toBe(403);
    const typed = checkAuth(
      { method: "POST", headers: { authorization: BEARER, "content-type": "text/plain;application/json" } } as never,
      TOKEN,
    );
    expect(typed?.status_code).toBe(415);
    const ok = checkAuth(
      { method: "POST", headers: { authorization: BEARER, "content-type": "application/json" } } as never,
      TOKEN,
    );
    expect(ok).toBeNull();
  });
});

describe("viewer request validation", () => {
  let upstream: Server;
  let viewer: Server | null = null;
  let seen: Array<{ method?: string; url?: string; headers: IncomingHttpHeaders; body: string }>;
  const originalHost = process.env.AGENTMEMORY_VIEWER_HOST;

  beforeEach(async () => {
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    seen = [];
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    upstream.listen(0, "127.0.0.1");
    await listening(upstream);
  });

  afterEach(async () => {
    if (viewer) await new Promise((r) => viewer!.close(() => r(null)));
    viewer = null;
    await new Promise((r) => upstream.close(() => r(null)));
    if (originalHost === undefined) delete process.env.AGENTMEMORY_VIEWER_HOST;
    else process.env.AGENTMEMORY_VIEWER_HOST = originalHost;
  });

  async function startViewer(): Promise<number> {
    const upstreamPort = (upstream.address() as AddressInfo).port;
    viewer = startViewerServer(0, null, null, TOKEN, upstreamPort);
    return listening(viewer);
  }

  it("rejects a cross-origin write before proxying it", async () => {
    const port = await startViewer();
    const res = await send(port, "/agentmemory/remember", {
      method: "POST",
      headers: { host: `127.0.0.1:${port}`, origin: "https://example.net", "content-type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it("rejects a text/plain write that mentions application/json", async () => {
    const port = await startViewer();
    const res = await send(port, "/agentmemory/remember", {
      method: "POST",
      headers: { host: `127.0.0.1:${port}`, "content-type": "text/plain; application/json" },
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(415);
    expect(seen).toHaveLength(0);
  });

  it("proxies same-origin and Origin-less writes with the server bearer", async () => {
    const port = await startViewer();
    const sameOrigin = await send(port, "/agentmemory/forget", {
      method: "POST",
      headers: { host: `localhost:${port}`, origin: `http://localhost:${port}`, "content-type": "application/json" },
      body: JSON.stringify({ memoryId: "m1" }),
    });
    expect(sameOrigin.status).toBe(200);
    const cli = await send(port, "/agentmemory/forget", {
      method: "POST",
      headers: { host: `127.0.0.1:${port}`, "content-type": "application/json" },
      body: JSON.stringify({ memoryId: "m2" }),
    });
    expect(cli.status).toBe(200);
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s.headers.authorization === BEARER)).toBe(true);
  });
});
