#!/usr/bin/env node

// Session-start hook.
//
// Always registers the session for observation tracking (so memories
// captured on PostToolUse get attached to the right session). Only writes
// project context to stdout — which Claude Code prepends to the very first
// turn — when AGENTMEMORY_INJECT_CONTEXT=true. Default off as of 0.8.10
// (#143); see pre-tool-use.ts for the full explanation.
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";

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

  const sessionId =
    (data.session_id as string) || `ses_${Date.now().toString(36)}`;
  const project = (data.cwd as string) || process.cwd();

  try {
    const res = await fetch(`${REST_URL}/agentmemory/session/start`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId, project, cwd: project }),
      signal: AbortSignal.timeout(5000),
    });

    // Only write context to stdout when the user has explicitly opted
    // into injection. Registering the session is cheap and doesn't touch
    // Claude Code's input token window.
    if (INJECT_CONTEXT && res.ok) {
      const result = (await res.json()) as { context?: string };
      if (result.context) {
        process.stdout.write(result.context);
      }
    }
  } catch {
    // silently fail -- don't block Claude Code startup
  }
}

main();
