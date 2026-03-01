#!/usr/bin/env node

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

  const sessionId = (data.session_id as string) || "unknown";
  const project = (data.cwd as string) || process.cwd();

  if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") {
    try {
      await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // best-effort
    }
  }

  try {
    const res = await fetch(`${REST_URL}/agentmemory/context`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId, project, budget: 1500 }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const result = (await res.json()) as { context?: string };
      if (result.context) {
        process.stdout.write(result.context);
      }
    }
  } catch {
    // best effort -- don't block compaction
  }
}

main();
