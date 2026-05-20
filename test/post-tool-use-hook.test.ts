import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { join } from "node:path";

const HOOK = join(
  import.meta.dirname,
  "..",
  "plugin",
  "scripts",
  "post-tool-use.mjs",
);

function readBody(req: IncomingMessage): Promise<string> {
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

async function runHook(payload: Record<string, unknown>) {
  let received: unknown;
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    received = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server did not bind to a TCP port");
  }

  const result = await new Promise<{
    exitCode: number | null;
    stderr: string;
    stdout: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], {
      env: {
        PATH: process.env["PATH"] ?? "",
        AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stderr, stdout });
    });
    child.stdin.end(JSON.stringify(payload));
  });

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  return { ...result, received };
}

describe("post-tool-use hook", () => {
  it("stores Claude Code tool_response as tool_output", async () => {
    const result = await runHook({
      session_id: "ses_tool_response",
      cwd: "/tmp/project",
      tool_name: "Read",
      tool_input: { file_path: "src/foo.ts" },
      tool_response: "file contents from Claude Code",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.received).toMatchObject({
      hookType: "post_tool_use",
      sessionId: "ses_tool_response",
      data: {
        tool_name: "Read",
        tool_input: { file_path: "src/foo.ts" },
        tool_output: "file contents from Claude Code",
      },
    });
  });

  it("keeps legacy tool_output fallback", async () => {
    const result = await runHook({
      session_id: "ses_tool_output",
      cwd: "/tmp/project",
      tool_name: "Bash",
      tool_input: { command: "pwd" },
      tool_output: "/tmp/project",
    });

    expect(result.exitCode).toBe(0);
    expect(result.received).toMatchObject({
      hookType: "post_tool_use",
      sessionId: "ses_tool_output",
      data: {
        tool_name: "Bash",
        tool_input: { command: "pwd" },
        tool_output: "/tmp/project",
      },
    });
  });
});
