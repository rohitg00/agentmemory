#!/usr/bin/env node

// Inlined from ./sdk-guard so each hook bundles to a single self-contained
// .mjs (matches the pattern used by every other hook entry in tsdown.config).
function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

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

// When the server is unreachable a 5s timeout multiplies hard under
// concurrent fan-out (Slack bots, multi-agent harnesses) and becomes a
// positive feedback loop that OOM-kills iii-engine (#221). Cap tight on
// both paths and skip the await entirely when the response is unused.
const INJECT_TIMEOUT_MS = 1500;
const REGISTER_TIMEOUT_MS = 800;

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

  const url = `${REST_URL}/agentmemory/session/start`;
  const init: RequestInit = {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId, project, cwd: project }),
  };

  if (!INJECT_CONTEXT) {
    // Pure telemetry path: caller never reads the response, so don't
    // block on it. AbortSignal.timeout caps the wait the event loop
    // gives the pending socket before exit.
    fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS),
    }).catch(() => {});
    return;
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(INJECT_TIMEOUT_MS),
    });
    if (res.ok) {
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
