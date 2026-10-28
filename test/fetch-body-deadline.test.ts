import { createServer, type RequestListener, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../src/providers/_fetch.js";
import { OpenAIProvider } from "../src/providers/openai.js";

const servers: Server[] = [];

async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server port");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe("provider response body deadlines", () => {
  it("does not dispatch a request for an already cancelled caller", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled before dispatch"));
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(fetchWithTimeout("http://127.0.0.1:1", {
      signal: controller.signal,
    }, 1000)).rejects.toThrow("cancelled before dispatch");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps successful response metadata and JSON readable", async () => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json", "x-provider": "fixture" });
      res.end(JSON.stringify({ ok: true }));
    });
    const response = await fetchWithTimeout(url, {}, 1000);
    expect(response.status).toBe(200);
    expect(response.url).toBe(`${url}/`);
    expect(response.headers.get("x-provider")).toBe("fixture");
    expect(await response.json()).toEqual({ ok: true });
  });

  it.each([200, 400, 429, 503])("aborts a stalled %i body after headers", async status => {
    const url = await serve((_req, res) => {
      res.writeHead(status, { "content-type": "application/json", "retry-after": "60" });
      res.flushHeaders();
      res.write('{"ok":');
      const timer = setTimeout(() => res.end("true}"), 800);
      res.on("close", () => clearTimeout(timer));
    });
    const response = await fetchWithTimeout(url, {}, 150);
    expect(response.status).toBe(status);
    await expect(response.text()).rejects.toThrow();
  });

  it("keeps one deadline through a retry and the final body", async () => {
    let attempts = 0;
    const url = await serve((_req, res) => {
      attempts++;
      if (attempts === 1) {
        res.writeHead(429, { "retry-after": "0.4" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.flushHeaders();
        const timer = setTimeout(() => res.end('{"ok":true}'), 800);
        res.on("close", () => clearTimeout(timer));
      }
    });
    const response = await fetchWithTimeout(url, {}, 1000);
    await expect(response.json()).rejects.toThrow();
    expect(attempts).toBe(2);
  });

  it("cancels retry backoff promptly without another request", async () => {
    const controller = new AbortController();
    let attempts = 0;
    let arrived!: () => void;
    const firstRequest = new Promise<void>(resolve => { arrived = resolve; });
    const url = await serve((_req, res) => {
      attempts++;
      res.writeHead(503, { "retry-after": "5" });
      res.end();
      arrived();
    });
    const pending = fetchWithTimeout(url, { signal: controller.signal }, 10000);
    const rejected = expect(pending).rejects.toThrow("cancelled by caller");
    await firstRequest;
    await new Promise(resolve => setTimeout(resolve, 50));
    controller.abort(new Error("cancelled by caller"));
    await rejected;
    expect(attempts).toBe(1);
  }, 1500);

  it("preserves caller cancellation while reading a body", async () => {
    const controller = new AbortController();
    const url = await serve((_req, res) => {
      res.writeHead(200);
      res.flushHeaders();
    });
    const response = await fetchWithTimeout(url, { signal: controller.signal }, 10000);
    const pending = response.text();
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it("reports the OpenAI timeout when its body stalls", async () => {
    vi.stubEnv("OPENAI_TIMEOUT_MS", "150");
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.flushHeaders();
      const timer = setTimeout(() => res.end('{"choices":[{"message":{"content":"late"}}]}'), 800);
      res.on("close", () => clearTimeout(timer));
    });
    const provider = new OpenAIProvider("fixture", "fixture", 100, url);
    await expect(provider.compress("system", "user")).rejects.toThrow(/timed out after 150ms/);
  });
});
