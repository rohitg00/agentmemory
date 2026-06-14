import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  getBoundViewerPort,
  getViewerSkipped,
  startViewerServer,
} from "../src/viewer/server.js";

type RecordedRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type HttpResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function waitForListening(server: Server): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
}

function serverPort(server: Server): number {
  return (server.address() as AddressInfo).port;
}

function startRestStub(
  handler?: (recorded: RecordedRequest) => {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{ server: Server; port: number; requests: RecordedRequest[] }> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const recorded: RecordedRequest = {
        method: req.method || "GET",
        url: req.url || "/",
        headers: req.headers,
        body,
      };
      requests.push(recorded);
      const response = handler?.(recorded) ?? {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, url: recorded.url }),
      };
      res.writeHead(response.status ?? 200, response.headers);
      res.end(response.body ?? "");
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: serverPort(server), requests });
    });
  });
}

function viewerRequest(
  port: number,
  path: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "GET",
        headers: {
          Host: `localhost:${port}`,
          ...options.headers,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

describe("viewer server routing and proxy boundaries", () => {
  const servers: Server[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    delete process.env.VIEWER_ALLOWED_HOSTS;
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    delete process.env.AGENTMEMORY_VIEWER_HOST;
    delete process.env.VIEWER_ALLOWED_HOSTS;
  });

  async function startViewer(restPort: number, secret?: string): Promise<number> {
    const viewer = startViewerServer(0, null, null, secret, restPort);
    servers.push(viewer);
    await waitForListening(viewer);
    return serverPort(viewer);
  }

  it("answers OPTIONS locally with CORS headers and does not call the REST API", async () => {
    const rest = await startRestStub();
    servers.push(rest.server);
    const viewerPort = await startViewer(rest.port);

    const res = await viewerRequest(viewerPort, "/agentmemory/health", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:3113" },
    });

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:3113",
    );
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
    expect(res.headers["access-control-max-age"]).toBe("86400");
    expect(rest.requests).toHaveLength(0);
  });

  it("forwards short viewer paths under /agentmemory with query strings and bearer headers", async () => {
    const rest = await startRestStub();
    servers.push(rest.server);
    const viewerPort = await startViewer(rest.port, "rest-secret");

    const res = await viewerRequest(viewerPort, "/health?deep=true", {
      headers: { Origin: "http://attacker.invalid" },
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3111",
    );
    expect(rest.requests).toHaveLength(1);
    expect(rest.requests[0].method).toBe("GET");
    expect(rest.requests[0].url).toBe("/agentmemory/health?deep=true");
    expect(rest.requests[0].headers.authorization).toBe("Bearer rest-secret");
  });

  it("does not double-prefix the /agentmemory boundary path", async () => {
    const rest = await startRestStub();
    servers.push(rest.server);
    const viewerPort = await startViewer(rest.port);

    const res = await viewerRequest(viewerPort, "/agentmemory?ping=1");

    expect(res.status).toBe(200);
    expect(rest.requests).toHaveLength(1);
    expect(rest.requests[0].url).toBe("/agentmemory?ping=1");
  });

  it("preserves methods, JSON content type, and body for state-changing proxy calls", async () => {
    const rest = await startRestStub((recorded) => ({
      status: 202,
      headers: { "Content-Type": "application/custom+json" },
      body: JSON.stringify({ method: recorded.method, body: recorded.body }),
    }));
    servers.push(rest.server);
    const viewerPort = await startViewer(rest.port);
    const body = JSON.stringify({ sessionId: "s1" });

    const res = await viewerRequest(viewerPort, "/session/end", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3113",
      },
    });

    expect(res.status).toBe(202);
    expect(res.headers["content-type"]).toBe("application/custom+json");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3113",
    );
    expect(JSON.parse(res.body)).toEqual({ method: "POST", body });
    expect(rest.requests[0].url).toBe("/agentmemory/session/end");
    expect(rest.requests[0].headers["content-type"]).toBe("application/json");
  });

  it("returns a safe JSON 502 when the REST API is unavailable", async () => {
    const blocker = createServer((_req, res) => res.end("closed"));
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const restPort = serverPort(blocker);
    await closeServer(blocker);
    const viewerPort = await startViewer(restPort);

    const res = await viewerRequest(viewerPort, "/agentmemory/health", {
      headers: { Origin: "http://localhost:3113" },
    });

    expect(res.status).toBe(502);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3113",
    );
    expect(JSON.parse(res.body)).toEqual({ error: "upstream error" });
    expect(errorSpy).toHaveBeenCalledWith(
      "[viewer] proxy error",
      expect.objectContaining({
        method: "GET",
        pathname: "/agentmemory/health",
      }),
    );
  });

  it("falls back to the next port on loopback EADDRINUSE and exposes runtime state", async () => {
    const blocker = createServer((_req, res) => res.end("busy"));
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    servers.push(blocker);
    const requestedPort = serverPort(blocker);

    const viewer = startViewerServer(requestedPort, null, null, undefined, 0);
    servers.push(viewer);
    await waitForListening(viewer);

    const fallbackPort = serverPort(viewer);
    expect(fallbackPort).toBeGreaterThan(requestedPort);
    expect(fallbackPort).toBeLessThanOrEqual(requestedPort + 10);
    expect(getBoundViewerPort()).toBe(fallbackPort);
    expect(getViewerSkipped()).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`fallback from ${requestedPort}`),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
