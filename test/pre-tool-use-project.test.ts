import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveProject } from "../src/hooks/_project.js";

function readRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function runHook(payload: unknown, url: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/hooks/pre-tool-use.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AGENTMEMORY_INJECT_CONTEXT: "true",
          AGENTMEMORY_URL: url,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

describe("pre-tool-use project resolution", () => {
  it("sends the resolved project when payload has cwd but no project", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/agentmemory/enrich") {
        capturedBody = JSON.parse(await readRequestBody(req)) as Record<string, unknown>;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: "" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const cwd = process.cwd();
      const result = await runHook(
        {
          session_id: "session-1",
          cwd,
          tool_name: "Read",
          tool_input: { file_path: "src/hooks/_project.ts" },
        },
        `http://127.0.0.1:${port}`,
      );

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      expect(capturedBody).toMatchObject({
        sessionId: "session-1",
        files: ["src/hooks/_project.ts"],
        terms: [],
        toolName: "Read",
        project: resolveProject(cwd),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
