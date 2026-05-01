#!/usr/bin/env node

import { isSdkChildContext } from "./sdk-guard.js";

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
  const project = (data.cwd as string) || process.cwd();

  // Fire-and-forget: this is purely passive telemetry; nothing reads the
  // response. The previous code carried a "fire and forget" comment in
  // the catch block but actually awaited the request, which propagated
  // REST latency into every Task/Agent dispatch.
  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "subagent_start",
      sessionId,
      project,
      cwd: project,
      timestamp: new Date().toISOString(),
      data: {
        agent_id: data.agent_id,
        agent_type: data.agent_type,
      },
    }),
    signal: AbortSignal.timeout(800),
  }).catch(() => {});
}

main();
