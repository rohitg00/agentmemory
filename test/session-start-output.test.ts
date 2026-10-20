import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const script = join(resolve(__dirname, ".."), "plugin", "scripts", "session-start.mjs");
const CONTEXT = '<agentmemory-context project="repo">remembered "quoted"\nline</agentmemory-context>';

const HOST_ENV_KEYS = [
  "AGENTMEMORY_INJECT_CONTEXT",
  "DEVIN_PROJECT_DIR",
  "FACTORY_PROJECT_DIR",
  "DROID_PLUGIN_ROOT",
];

async function runSessionStart(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<{ stdout: string }> {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ context: CONTEXT }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("test server did not bind to a TCP port");
  }
  const baseEnv: Record<string, string | undefined> = { ...process.env };
  for (const k of HOST_ENV_KEYS) delete baseEnv[k];
  try {
    const child = spawn(process.execPath, [script], {
      env: {
        ...baseEnv,
        AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`,
        AGENTMEMORY_SECRET: "",
        ...env,
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stdin.end(JSON.stringify(payload));
    await new Promise<void>((resolveExit, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("session-start timed out"));
      }, 5000);
      child.on("error", reject);
      child.on("close", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
    return { stdout };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const hookPayload = {
  session_id: "ses-1",
  cwd: "/repo",
  hook_event_name: "SessionStart",
  source: "startup",
};

describe("session-start stdout shape", () => {
  it("wraps context in the structured SessionStart envelope for hook_event_name payloads", async () => {
    const { stdout } = await runSessionStart(hookPayload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
    });
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: CONTEXT,
      },
    });
  });

  it("keeps plain text for payloads without hook_event_name", async () => {
    const { stdout } = await runSessionStart(
      { sessionId: "ses-2", cwd: "/repo" },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );
    expect(stdout).toBe(CONTEXT);
  });

  it("keeps plain text on hosts that read stdout as context", async () => {
    const { stdout } = await runSessionStart(hookPayload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
      FACTORY_PROJECT_DIR: "/repo",
    });
    expect(stdout).toBe(CONTEXT);
  });

  it("keeps the camelCase additional_context shape for sessionStart payloads", async () => {
    const { stdout } = await runSessionStart(
      { conversation_id: "c-1", hook_event_name: "sessionStart", cursor_version: "1.0" },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );
    expect(JSON.parse(stdout)).toEqual({ additional_context: CONTEXT });
  });

  it("prints nothing when injection is off, for either payload shape", async () => {
    const structured = await runSessionStart(hookPayload);
    const plain = await runSessionStart({ sessionId: "ses-3", cwd: "/repo" });
    expect(structured.stdout).toBe("");
    expect(plain.stdout).toBe("");
  });
});
