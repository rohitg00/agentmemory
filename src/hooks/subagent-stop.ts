#!/usr/bin/env node

import { resolveProject } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  if (isSdkChildContext(data)) return;

  const sessionId = (data.session_id as string) || "unknown";
  // Trim before the length check so a whitespace-only `data.cwd`
  // (e.g. `"   "` from a misformed JSON payload) falls back to
  // process.cwd() instead of being forwarded as-is. CodeRabbit caught
  // this in the #475 re-review on session-start.ts:58 and
  // post-tool-failure.ts:40.
  const trimmedCwd = typeof data.cwd === "string" ? data.cwd.trim() : "";
  const cwd = trimmedCwd || process.cwd();
  const project = resolveProject(cwd);
  const lastMsg =
    typeof data.last_assistant_message === "string"
      ? data.last_assistant_message.slice(0, 4000)
      : "";

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: "subagent_stop",
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          agent_id: data.agent_id,
          agent_type: data.agent_type,
          last_message: lastMsg,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // fire and forget
  }
}

main();
