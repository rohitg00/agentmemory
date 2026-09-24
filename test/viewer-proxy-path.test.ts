import { describe, it, expect, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { startViewerServer } from "../src/viewer/server.js";

/**
 * CWE-918: Viewer proxy path-traversal SSRF
 *
 * The viewer proxies /agentmemory/* requests to the local REST API,
 * attaching the bearer token automatically. If a request path contains
 * "../" traversal sequences the proxy must reject it, otherwise
 * `new URL()` normalization in fetch() resolves the traversal and
 * the request escapes the /agentmemory/ prefix on the upstream server
 * while carrying the full bearer token.
 */
describe("viewer proxy path traversal defence (CWE-918)", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    for (const c of cleanups) await c();
  });

  /** Start a tiny upstream that records every request it receives. */
  function startUpstream(): Promise<{
    port: number;
    requests: Array<{ method: string; url: string; headers: Record<string, string | string[] | undefined> }>;
  }> {
    const requests: Array<{
      method: string;
      url: string;
      headers: Record<string, string | string[] | undefined>;
    }> = [];
    return new Promise((resolve) => {
      const srv = createServer((req, res) => {
        requests.push({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers: req.headers,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      srv.listen(0, "127.0.0.1", () => {
        const addr = srv.address() as AddressInfo;
        cleanups.push(
          () => new Promise<void>((r) => srv.close(() => r())),
        );
        resolve({ port: addr.port, requests });
      });
    });
  }

  /** Start the viewer server pointing at the given upstream REST port. */
  async function startViewer(
    restPort: number,
    secret?: string,
  ): Promise<{ port: number }> {
    const server = startViewerServer(0, {}, {}, secret, restPort);
    await new Promise<void>((resolve) =>
      server.once("listening", () => resolve()),
    );
    const addr = server.address() as AddressInfo;
    cleanups.push(
      () => new Promise<void>((r) => server.close(() => r())),
    );
    return { port: addr.port };
  }

  /** Low-level HTTP request so we can control the Host header. */
  function request(
    port: number,
    pathname: string,
    hostHeader?: string,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: pathname,
          method: "GET",
          headers: {
            Host: hostHeader ?? `127.0.0.1:${port}`,
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("rejects path traversal via /agentmemory/../../ with 400", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(
      viewer.port,
      "/agentmemory/../../admin",
    );
    expect(res.status).toBe(400);
    expect(upstream.requests).toHaveLength(0);
  });

  it("rejects percent-encoded traversal /agentmemory/%2e%2e/ with 400", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(
      viewer.port,
      "/agentmemory/%2e%2e/%2e%2e/admin",
    );
    expect(res.status).toBe(400);
    expect(upstream.requests).toHaveLength(0);
  });

  it("rejects mixed-case encoded traversal /agentmemory/%2E%2E/ with 400", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(
      viewer.port,
      "/agentmemory/%2E%2E/%2E%2E/admin",
    );
    expect(res.status).toBe(400);
    expect(upstream.requests).toHaveLength(0);
  });

  it("rejects single traversal segment /agentmemory/../ with 400", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(viewer.port, "/agentmemory/../other");
    expect(res.status).toBe(400);
    expect(upstream.requests).toHaveLength(0);
  });

  it("allows normal /agentmemory/livez to pass through", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(viewer.port, "/agentmemory/livez");
    expect(res.status).toBe(200);
    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0].url).toBe("/agentmemory/livez");
  });

  it("allows normal /agentmemory/memories path to pass through", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    const res = await request(
      viewer.port,
      "/agentmemory/memories?latest=true",
    );
    expect(res.status).toBe(200);
    expect(upstream.requests).toHaveLength(1);
    expect(upstream.requests[0].url).toBe(
      "/agentmemory/memories?latest=true",
    );
  });

  it("rejects paths that would normalize outside /agentmemory/", async () => {
    const upstream = await startUpstream();
    const viewer = await startViewer(upstream.port, "test-secret");
    // /agentmemory/foo/../../bar normalizes to /bar — escapes prefix
    const res = await request(
      viewer.port,
      "/agentmemory/foo/../../bar",
    );
    expect(res.status).toBe(400);
    expect(upstream.requests).toHaveLength(0);
  });
});
