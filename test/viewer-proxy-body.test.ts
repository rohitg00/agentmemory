import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startViewerServer } from "../src/viewer/server.js";

const waitListening = (server: Server) => new Promise<void>((resolve) => server.listening ? resolve() : server.once("listening", resolve));
const close = (server: Server) => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });

describe("viewer request proxy", () => {
  let upstream: Server | undefined;
  let viewer: Server | undefined;
  afterEach(async () => { if (viewer) await close(viewer); if (upstream) await close(upstream); viewer = undefined; upstream = undefined; });

  it("forwards POST method, JSON body, content type and configured bearer", async () => {
    upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString("utf8");
      res.writeHead(req.method === "POST" && req.headers["content-type"] === "application/json" && req.headers.authorization === "Bearer proxy-secret" && body === '{"query":"smoke","limit":1}' ? 200 : 400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ query: body }));
    });
    await new Promise<void>((resolve, reject) => upstream!.once("error", reject).once("listening", resolve).listen(0, "127.0.0.1"));
    const restPort = (upstream.address() as AddressInfo).port;
    viewer = startViewerServer(0, null, null, "proxy-secret", restPort);
    await new Promise<void>((resolve, reject) => viewer!.once("error", reject).once("listening", resolve));
    const port = (viewer.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/agentmemory/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "smoke", limit: 1 }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ query: '{"query":"smoke","limit":1}' });
  });
});
