#!/usr/bin/env node

import { isSdkChildContext } from "./sdk-guard.js";

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

// When INJECT_CONTEXT=true the hook awaits the response so its body can
// be written to stdout. Otherwise the request is purely passive — fire
// it and let main() return; node still keeps the event loop alive until
// the request resolves or aborts, but Claude Code is not blocked on it.
//
// The previous unconditional 5 s await blocked every session start by
// the full timeout when REST was slow, which under concurrent fan-out
// (e.g. a Slack-bot orchestrator spawning many `claude -p`) stacked up
// and starved the engine.
const TIMEOUT_MS = INJECT_CONTEXT ? 1500 : 800;

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

  const sessionId =
    (data.session_id as string) || `ses_${Date.now().toString(36)}`;
  const project = (data.cwd as string) || process.cwd();

  const request = fetch(`${REST_URL}/agentmemory/session/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId, project, cwd: project }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);

  if (!INJECT_CONTEXT) return; // fire-and-forget; request resolves in the background

  const res = await request;
  if (!res?.ok) return;
  try {
    const result = (await res.json()) as { context?: string };
    if (result.context) process.stdout.write(result.context);
  } catch {
    // malformed response body — never block startup on it
  }
}

main();
