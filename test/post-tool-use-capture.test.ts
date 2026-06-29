import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");

function runHook(
  scriptName: string,
  stdin: string,
  env: Record<string, string>,
): Promise<{ exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HOOKS_DIR, scriptName)], {
      env: {
        PATH: process.env["PATH"] ?? "",
        ...env,
      },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

describe("post-tool-use hook — capture filter (#993)", () => {
  let server: Server;
  let observeCalls = 0;
  let port = 0;

  afterEach(async () => {
    observeCalls = 0;
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  async function startServer() {
    server = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/agentmemory/observe") {
        observeCalls += 1;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") port = addr.port;
        resolve();
      });
    });
  }

  it("does not observe memory_* MCP tools", async () => {
    await startServer();
    const payload = JSON.stringify({
      session_id: "ses_test",
      tool_name: "mcp__agentmemory__memory_smart_search",
      tool_input: { query: "hooks" },
      tool_output: "results",
    });
    const result = await runHook("post-tool-use.mjs", payload, {
      AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
    });
    await new Promise((r) => setTimeout(r, 600));
    expect(result.exitCode).toBe(0);
    expect(observeCalls).toBe(0);
  });

  it("still observes normal tools", async () => {
    await startServer();
    const payload = JSON.stringify({
      session_id: "ses_test",
      tool_name: "Bash",
      tool_input: { command: "ls" },
      tool_output: "ok",
    });
    const result = await runHook("post-tool-use.mjs", payload, {
      AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
    });
    await new Promise((r) => setTimeout(r, 600));
    expect(result.exitCode).toBe(0);
    expect(observeCalls).toBe(1);
  });
});
