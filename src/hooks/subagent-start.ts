#!/usr/bin/env node

// Inlined from ./sdk-guard so each hook bundles to a single self-contained
// .mjs (matches the pattern used by every other hook entry in tsdown.config).
function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

// Passive telemetry only — nothing reads the response, so the previous
// `await` was pure latency. Tightened from 2000ms to a defensive cap so a
// slow/unreachable server can't stack onto every concurrent subagent
// startup (#221).
const TIMEOUT_MS = 800;

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

  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "subagent_start",
      sessionId,
      project: data.cwd || process.cwd(),
      cwd: data.cwd || process.cwd(),
      timestamp: new Date().toISOString(),
      data: {
        agent_id: data.agent_id,
        agent_type: data.agent_type,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => {});
}

main();
