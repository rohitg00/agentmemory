import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const script = join(resolve(__dirname, ".."), "plugin", "scripts", "pre-tool-use.mjs");
const CONTEXT = '<agentmemory-context>remembered "quoted"\nline</agentmemory-context>';

const HOST_ENV_KEYS = [
  "AGENTMEMORY_INJECT_CONTEXT",
  "AGENTMEMORY_ENRICH_TIMEOUT_MS",
  "CLAUDE_PLUGIN_OPTION_AGENTMEMORY_ENRICH_TIMEOUT_MS",
  "FACTORY_PROJECT_DIR",
  "DROID_PLUGIN_ROOT",
];

async function runPreToolUse(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
  delayMs = 0,
): Promise<{ stdout: string }> {
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: CONTEXT }));
      }, delayMs);
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
        AGENTMEMORY_INJECT_CONTEXT: "true",
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
        reject(new Error("pre-tool-use timed out"));
      }, 10_000);
      child.on("error", reject);
      child.on("close", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
    return { stdout };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

const claudePayload = {
  session_id: "ses-1",
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: "src/foo.ts" },
};

describe("pre-tool-use context output", () => {
  it("wraps context in the PreToolUse hook envelope so Claude Code shows it to the model", async () => {
    const { stdout } = await runPreToolUse(claudePayload);
    expect(JSON.parse(stdout)).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: CONTEXT },
    });
  });

  it("keeps plain text for payloads without a PreToolUse event name", async () => {
    const { hook_event_name: _ignored, ...payload } = claudePayload;
    const { stdout } = await runPreToolUse(payload);
    expect(stdout).toBe(CONTEXT);
  });

  it("keeps plain text on plain-text hosts", async () => {
    const { stdout } = await runPreToolUse(claudePayload, { FACTORY_PROJECT_DIR: "/repo" });
    expect(stdout).toBe(CONTEXT);
  });

  it("drops a reply slower than the default 2 s budget", async () => {
    const { stdout } = await runPreToolUse(claudePayload, {}, 2500);
    expect(stdout).toBe("");
  });

  it("AGENTMEMORY_ENRICH_TIMEOUT_MS gives a slow enrich reply time to arrive", async () => {
    const { stdout } = await runPreToolUse(claudePayload, { AGENTMEMORY_ENRICH_TIMEOUT_MS: "6000" }, 2500);
    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext).toBe(CONTEXT);
  });

  it.each(["0.5", "3000000000"])("falls back to the default instead of aborting at once for %s", async (value) => {
    const { stdout } = await runPreToolUse(claudePayload, { AGENTMEMORY_ENRICH_TIMEOUT_MS: value }, 100);
    expect(JSON.parse(stdout).hookSpecificOutput.additionalContext).toBe(CONTEXT);
  });

  it.each(["1e6", "6000ms"])("keeps the 2 s default for the malformed value %s", async (value) => {
    const { stdout } = await runPreToolUse(claudePayload, { AGENTMEMORY_ENRICH_TIMEOUT_MS: value }, 2500);
    expect(stdout).toBe("");
  });

  it("writes nothing for Cursor, whose preToolUse response has no context field", async () => {
    const { stdout } = await runPreToolUse({ ...claudePayload, hook_event_name: "preToolUse", cursor_version: "1.7.0" });
    expect(stdout).toBe("");
  });
});
