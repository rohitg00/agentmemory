import { afterEach, describe, it, expect } from "vitest";
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

function childEnv(url: string): NodeJS.ProcessEnv {
  const env = {
    ...process.env,
    AGENTMEMORY_INJECT_CONTEXT: "true",
    AGENTMEMORY_URL: url,
  };
  delete env.AGENTMEMORY_PROJECT_ID;
  delete env.AGENTMEMORY_PROJECT_NAME;
  return env;
}

function withoutProjectEnv<T>(callback: () => T): T {
  const projectId = process.env.AGENTMEMORY_PROJECT_ID;
  const projectName = process.env.AGENTMEMORY_PROJECT_NAME;
  delete process.env.AGENTMEMORY_PROJECT_ID;
  delete process.env.AGENTMEMORY_PROJECT_NAME;
  try {
    return callback();
  } finally {
    if (projectId === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_ID;
    } else {
      process.env.AGENTMEMORY_PROJECT_ID = projectId;
    }
    if (projectName === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = projectName;
    }
  }
}

function runHook(payload: unknown, url: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["plugin/scripts/pre-tool-use.mjs"],
      {
        cwd: process.cwd(),
        env: childEnv(url),
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
  const originalProjectId = process.env.AGENTMEMORY_PROJECT_ID;
  const originalProjectName = process.env.AGENTMEMORY_PROJECT_NAME;

  afterEach(() => {
    if (originalProjectId === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_ID;
    } else {
      process.env.AGENTMEMORY_PROJECT_ID = originalProjectId;
    }
    if (originalProjectName === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalProjectName;
    }
  });

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
        project: withoutProjectEnv(() => resolveProject(cwd)),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("ignores non-string payload cwd instead of crashing", async () => {
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
      const result = await runHook(
        {
          session_id: "session-1",
          cwd: { path: process.cwd() },
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
        project: withoutProjectEnv(() => resolveProject()),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("does not inherit project env overrides from the test runner", async () => {
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

    process.env.AGENTMEMORY_PROJECT_ID = "host-runner-project";
    process.env.AGENTMEMORY_PROJECT_NAME = "host-runner-name";

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
      expect(capturedBody?.project).toBe(withoutProjectEnv(() => resolveProject(cwd)));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
