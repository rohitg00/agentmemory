#!/usr/bin/env node

// Inlined — see src/hooks/sdk-guard.ts for canonical version. Kept local
// per-hook so tsdown does not emit a shared hashed chunk that would churn
// the diff on every rebuild.
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

  if (isSdkChildContext(data)) {
    // Do not summarize from inside a Claude Agent SDK child session;
    // would re-enter agent-sdk provider and loop (see sdk-guard.ts).
    return;
  }

  const sessionId = (data.session_id as string) || "unknown";

  try {
    await fetch(`${REST_URL}/agentmemory/summarize`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(120000), // Increased from 30s to 120s
    });
  } catch {
    // summarize is best-effort
  }

  // Claude Code fires a separate `SessionEnd` hook that closes the
  // viewer session lifecycle. Codex does not have a SessionEnd event,
  // so the only signal we get when a Codex session ends is this Stop
  // hook (#493). Always best-effort POST /agentmemory/session/end here
  // so the viewer shows `completed` for Codex sessions; for Claude Code
  // this is a harmless idempotent second call (session-end.mjs runs on
  // SessionEnd and sets the same fields).
  try {
    await fetch(`${REST_URL}/agentmemory/session/end`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // session/end is best-effort
  }
}

main();