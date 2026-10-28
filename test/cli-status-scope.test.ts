import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { expect, it } from "vitest";

it("does not query local Compose state when status selects an explicit URL with the same port", async () => {
  const home = mkdtempSync(join(tmpdir(), "status-scope-"));
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/agentmemory/health" ? { status: "healthy", version: "remote-fixture" } : {}));
  });
  const ws = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  let localConnections = 0;
  ws.on("connection", socket => { localConnections++; socket.close(); });
  try {
    await Promise.all([
      new Promise<void>(done => server.listen(0, "127.0.0.1", done)),
      new Promise<void>(done => ws.on("listening", done)),
    ]);
    const port = (server.address() as { port: number }).port;
    mkdirSync(join(home, ".agentmemory"));
    writeFileSync(join(home, ".agentmemory/engine-state.json"), JSON.stringify({
      kind: "compose", restPort: port, engineUrl: `ws://127.0.0.1:${(ws.address() as { port: number }).port}`,
      namespace: "local-fixture", file: join(home, "local.yaml"), binPath: "/fixture/iii", logFile: join(home, "local.log"),
    }));
    const result = await new Promise<{ code: number | null; output: string }>((done, reject) => {
      const child = spawn(process.execPath, [resolve("dist/cli.mjs"), "status"], {
        env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, AGENTMEMORY_URL: `http://127.0.0.1:${port}`, NO_COLOR: "1" },
        timeout: 15000,
      });
      let output = "";
      child.stdout.on("data", data => { output += data; });
      child.stderr.on("data", data => { output += data; });
      child.on("error", reject);
      child.on("close", code => done({ code, output }));
    });
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("remote-fixture");
    expect(requests).toContain("/agentmemory/health");
    expect(localConnections).toBe(0);
    expect(result.output).not.toContain("Compose");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    for (const socket of ws.clients) socket.terminate();
    await new Promise<void>(done => ws.close(() => done()));
    rmSync(home, { recursive: true, force: true });
  }
}, 20000);
