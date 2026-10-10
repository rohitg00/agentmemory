#!/usr/bin/env node
import { resolveProject, hookCwd } from "./_project.js";
import { REST_URL, authHeaders, captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.js";

// Inlined — see src/hooks/sdk-guard.ts for canonical version. Kept local
// per-hook so tsdown does not emit a shared hashed chunk that would churn
// the diff on every rebuild.
function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const OBSERVE_TIMEOUT_MS = 2000;
const EXIT_CAP_MS = 2500;
const REPLY_MAX_CHARS = 4000;

async function main() {
  if (isDrainChild()) return runDrainChild();
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

  if (!data || typeof data !== "object") return;
  if (isSdkChildContext(data)) {
    // Do not summarize from inside a Claude Agent SDK child session;
    // would re-enter agent-sdk provider and loop (see sdk-guard.ts).
    return;
  }

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";

  const reply = data.last_assistant_message;
  if (typeof reply === "string" && reply.trim()) {
    const cwd = hookCwd(data) || process.cwd();
    const body = {
      hookType: "stop",
      sessionId,
      project: resolveProject(cwd),
      cwd,
      timestamp: new Date().toISOString(),
      data: { last_assistant_message: reply.slice(0, REPLY_MAX_CHARS) },
    };
    void captureObservation(withEventId(body, {}), OBSERVE_TIMEOUT_MS);
  }

  fetch(`${REST_URL}/agentmemory/session/end`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId, final: false }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});

  setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}

main().catch(() => process.exit(0));
