#!/usr/bin/env node

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

type CodexPayload = {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  reason?: string;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function readJsonFromStdin<T>(): Promise<T | null> {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const payload = await readJsonFromStdin<CodexPayload>();
  if (!payload) return;

  const sid = payload.session_id || `codex-${Date.now().toString(36)}`;
  const root = payload.cwd || process.cwd();
  const event = payload.hook_event_name || "";

  try {
    if (event === "SessionStart") {
      const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: sid, project: root, cwd: root }),
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data = (await res.json()) as { context?: string };
        if (typeof data.context === "string" && data.context) {
          process.stdout.write(data.context);
        }
      }
      return;
    }

    if (event === "UserPromptSubmit") {
      await fetch(`${REST_URL}/agentmemory/observe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          hookType: "prompt_submit",
          sessionId: sid,
          project: root,
          cwd: root,
          timestamp: new Date().toISOString(),
          data: { prompt: payload.prompt || "" },
        }),
        signal: AbortSignal.timeout(3000),
      });
      return;
    }

    if (event === "PostToolUse" || event === "PreToolUse") {
      await fetch(`${REST_URL}/agentmemory/observe`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          hookType: "post_tool_use",
          sessionId: sid,
          project: root,
          cwd: root,
          timestamp: new Date().toISOString(),
          data: {
            tool_name: payload.tool_name || "tool",
            tool_input: payload.tool_input || {},
            tool_output: payload.tool_output ?? "tool execution",
          },
        }),
        signal: AbortSignal.timeout(3000),
      });
      return;
    }

    if (event === "Stop") {
      await fetch(`${REST_URL}/agentmemory/session/end`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionId: sid }),
        signal: AbortSignal.timeout(1500),
      });
      return;
    }
  } catch {
    // hooks must never block host
  }
}

main();
