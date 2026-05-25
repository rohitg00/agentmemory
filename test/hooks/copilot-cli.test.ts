import { describe, expect, it } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type CopilotHookManifest = {
  hooks: Record<string, Array<{ bash: string }>>;
};

type CapturedRequest = {
  path: string;
  body: unknown;
};

const pluginRoot = join(import.meta.dirname, "..", "..", "plugin");
const scriptsRoot = join(pluginRoot, "scripts");
const hooksManifestPath = join(pluginRoot, "hooks", "hooks.copilot.json");

const payloadByScript: Record<string, Record<string, unknown>> = {
  "session-start": {
    hook_event_name: "SessionStart",
    session_id: "copilot-session-start",
    cwd: "/tmp/copilot-project",
    source: "new",
  },
  "prompt-submit": {
    hook_event_name: "UserPromptSubmit",
    session_id: "copilot-prompt-submit",
    cwd: "/tmp/copilot-project",
    prompt: "remember this",
  },
  "pre-tool-use": {
    hook_event_name: "PreToolUse",
    session_id: "copilot-pre-tool-use",
    cwd: "/tmp/copilot-project",
    tool_name: "Read",
    tool_input: { file_path: "src/example.ts" },
  },
  "post-tool-use": {
    hook_event_name: "PostToolUse",
    session_id: "copilot-post-tool-use",
    cwd: "/tmp/copilot-project",
    tool_name: "Read",
    tool_input: { file_path: "src/example.ts" },
    tool_result: { text_result_for_llm: "copilot-tool-output" },
  },
  "post-tool-failure": {
    hook_event_name: "PostToolUseFailure",
    session_id: "copilot-post-tool-failure",
    cwd: "/tmp/copilot-project",
    tool_name: "Read",
    tool_input: { file_path: "src/example.ts" },
    error: "tool failed",
  },
  "pre-compact": {
    hook_event_name: "PreCompact",
    session_id: "copilot-pre-compact",
    cwd: "/tmp/copilot-project",
  },
  "subagent-start": {
    hook_event_name: "SubagentStart",
    session_id: "copilot-subagent-start",
    cwd: "/tmp/copilot-project",
    agent_id: "a-1",
    agent_type: "task",
  },
  "subagent-stop": {
    hook_event_name: "SubagentStop",
    session_id: "copilot-subagent-stop",
    cwd: "/tmp/copilot-project",
    agent_id: "a-1",
    agent_type: "task",
    last_assistant_message: "done",
  },
  notification: {
    hook_event_name: "Notification",
    session_id: "copilot-notification",
    cwd: "/tmp/copilot-project",
    notification_type: "permission_prompt",
    title: "permission",
    message: "allow",
  },
  stop: {
    hook_event_name: "Stop",
    session_id: "copilot-stop",
    cwd: "/tmp/copilot-project",
  },
  "session-end": {
    hook_event_name: "SessionEnd",
    session_id: "copilot-session-end",
    cwd: "/tmp/copilot-project",
  },
};

const expectedPathByScript: Record<string, string> = {
  "session-start": "/agentmemory/session/start",
  "prompt-submit": "/agentmemory/observe",
  "pre-tool-use": "/agentmemory/enrich",
  "post-tool-use": "/agentmemory/observe",
  "post-tool-failure": "/agentmemory/observe",
  "pre-compact": "/agentmemory/context",
  "subagent-start": "/agentmemory/observe",
  "subagent-stop": "/agentmemory/observe",
  notification: "/agentmemory/observe",
  stop: "/agentmemory/summarize",
  "session-end": "/agentmemory/session/end",
};

async function startCaptureServer(): Promise<{
  baseUrl: string;
  captured: CapturedRequest[];
  close: () => Promise<void>;
}> {
  const captured: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      captured.push({
        path: req.url || "",
        body: parseJsonBody(req, Buffer.concat(chunks).toString("utf-8")),
      });
      const responseBody =
        req.url === "/agentmemory/session/start" ||
        req.url === "/agentmemory/context" ||
        req.url === "/agentmemory/enrich"
          ? { context: "" }
          : { ok: true };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(responseBody));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start test server");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    captured,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function parseJsonBody(req: IncomingMessage, rawBody: string): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error(`non-JSON body for ${req.url ?? "unknown url"}`);
  }
}

function scriptNameFromBashCommand(command: string): string {
  const match = command.match(/^agentmemory-hook\s+([a-z0-9-]+)$/);
  if (!match) {
    throw new Error(`unexpected hook command: ${command}`);
  }
  return match[1]!;
}

async function runHook(scriptName: string, payload: Record<string, unknown>, baseUrl: string): Promise<number | null> {
  const scriptPath = join(scriptsRoot, `${scriptName}.mjs`);
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        PATH: process.env["PATH"] ?? "",
        AGENTMEMORY_URL: baseUrl,
        AGENTMEMORY_INJECT_CONTEXT: "true",
        CONSOLIDATION_ENABLED: "false",
        CLAUDE_MEMORY_BRIDGE: "false",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.on("close", resolve);
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function waitForExpectedPath(
  captured: CapturedRequest[],
  path: string,
): Promise<CapturedRequest | undefined> {
  for (let i = 0; i < 20; i += 1) {
    const hit = captured.find((entry) => entry.path === path);
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

describe("Copilot CLI hook scripts", () => {
  it("execute every script referenced by hooks.copilot.json and hit expected REST endpoints", async () => {
    const manifest = JSON.parse(readFileSync(hooksManifestPath, "utf-8")) as CopilotHookManifest;
    const scripts = Array.from(
      new Set(
        Object.values(manifest.hooks).flatMap((entries) =>
          entries.map((entry) => scriptNameFromBashCommand(entry.bash)),
        ),
      ),
    );

    const server = await startCaptureServer();
    try {
      for (const script of scripts) {
        const payload = payloadByScript[script];
        expect(payload, `missing test payload for ${script}`).toBeDefined();
        const beforeCount = server.captured.length;
        const exitCode = await runHook(script, payload!, server.baseUrl);
        expect(exitCode, `${script} should exit cleanly`).toBe(0);

        const expectedPath = expectedPathByScript[script];
        expect(expectedPath, `missing expected endpoint for ${script}`).toBeDefined();
        const hit = await waitForExpectedPath(
          server.captured.slice(beforeCount),
          expectedPath!,
        );
        expect(hit, `${script} should call ${expectedPath}`).toBeDefined();
      }
    } finally {
      await server.close();
    }
  });

  it("uses Copilot tool_result.text_result_for_llm in post-tool-use payload", async () => {
    const server = await startCaptureServer();
    try {
      const exitCode = await runHook("post-tool-use", payloadByScript["post-tool-use"]!, server.baseUrl);
      expect(exitCode).toBe(0);

      const observeHit = await waitForExpectedPath(server.captured, "/agentmemory/observe");
      expect(observeHit).toBeDefined();
      const body = observeHit!.body as {
        data?: { tool_output?: unknown };
      };
      expect(body.data?.tool_output).toBe("copilot-tool-output");
    } finally {
      await server.close();
    }
  });
});
