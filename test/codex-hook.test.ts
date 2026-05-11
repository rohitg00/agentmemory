import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";

const HOOK_PATH = join(
  import.meta.dirname,
  "..",
  "integrations",
  "codex",
  "agentmemory-codex-hook.mjs",
);
const HOOK_WATCHDOG_MS = 5000;

type HookResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  tookMs: number;
};

type CapturedRequest = {
  path: string;
  method: string;
  authorization?: string;
  body: unknown;
};

let servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        }),
    ),
  );
  servers = [];
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
  });
}

function runHook(
  payload: unknown,
  env: Record<string, string>,
): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(process.execPath, [HOOK_PATH], {
      env: {
        PATH: process.env["PATH"] ?? "",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const watchdog = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`hook subprocess timed out after ${HOOK_WATCHDOG_MS}ms`));
    }, HOOK_WATCHDOG_MS);

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(watchdog);
      reject(err);
    });
    child.on("close", (exitCode) => {
      clearTimeout(watchdog);
      resolve({ stdout, stderr, exitCode, tookMs: Date.now() - start });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function startCaptureServer(
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    request: CapturedRequest,
  ) => void,
): Promise<{ baseUrl: string; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const server = createServer(async (req, res) => {
    const rawBody = await readBody(req);
    const request: CapturedRequest = {
      path: req.url || "",
      method: req.method || "GET",
      authorization: req.headers.authorization,
      body: rawBody ? JSON.parse(rawBody) : null,
    };
    requests.push(request);
    handler(req, res, request);
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing server address");
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

describe("Codex hook bridge", () => {
  it("uses AGENTMEMORY_URL and AGENTMEMORY_SECRET for SessionStart and emits string context", async () => {
    const { baseUrl, requests } = await startCaptureServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ context: { project: "codex", fact: "use hooks" } }));
    });

    const result = await runHook(
      {
        hook_event_name: "SessionStart",
        session_id: "ses_codex",
        cwd: "/repo",
      },
      {
        AGENTMEMORY_URL: baseUrl,
        AGENTMEMORY_SECRET: "secret-token",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/agentmemory/session/start");
    expect(requests[0].authorization).toBe("Bearer secret-token");
    expect(requests[0].body).toMatchObject({
      sessionId: "ses_codex",
      project: "/repo",
      cwd: "/repo",
    });

    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(typeof output.hookSpecificOutput.additionalContext).toBe("string");
    expect(output.hookSpecificOutput.additionalContext).toContain("use hooks");
  });

  it.each([
    ["UserPromptSubmit", "prompt_submit"],
    ["PreToolUse", "pre_tool_use"],
    ["PostToolUse", "post_tool_use"],
    ["Stop", "stop"],
  ])("maps %s to %s observations", async (event, hookType) => {
    const { baseUrl, requests } = await startCaptureServer((_req, res) => {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });

    const result = await runHook(
      {
        hook_event_name: event,
        session_id: "ses_codex",
        turn_id: "turn-1",
        cwd: "/repo",
        prompt: "how does auth work?",
        model: "gpt-5.5",
        tool_name: "Read",
        tool_input: { file_path: "src/auth.ts" },
        tool_response: { output: "contents" },
        last_assistant_message: "done",
      },
      { AGENTMEMORY_URL: baseUrl },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/agentmemory/observe");
    expect(requests[0].body).toMatchObject({
      hookType,
      sessionId: "ses_codex",
      project: "/repo",
      cwd: "/repo",
    });
  });

  it("does not hang Codex when the REST endpoint stalls", async () => {
    const server = createServer(() => {
      // Intentionally never respond. The hook must abort its fetch.
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing server address");

    const result = await runHook(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: "ses_codex",
        cwd: "/repo",
        prompt: "do not hang",
      },
      {
        AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`,
        AGENTMEMORY_CODEX_REST_TIMEOUT_MS: "100",
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.tookMs).toBeLessThan(2000);
  });
});
