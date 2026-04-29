#!/usr/bin/env node

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

  try {
    await fetch(`${REST_URL}/agentmemory/session/end`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(30000), // Increased from 5s
    });
  } catch {
    // best-effort
  }

  if (process.env["CONSOLIDATION_ENABLED"] === "true") {
    try {
      await fetch(`${REST_URL}/agentmemory/crystals/auto`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ olderThanDays: 0 }),
        signal: AbortSignal.timeout(60000), // Increased from 15s
      });
    } catch {}

    try {
      await fetch(`${REST_URL}/agentmemory/consolidate-pipeline`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ tier: "all", force: true }),
        signal: AbortSignal.timeout(120000), // Increased from 30s
      });
    } catch {}
  }

  if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") {
    try {
      await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
        method: "POST",
        headers: authHeaders(),
        signal: AbortSignal.timeout(30000), // Increased from 5s
      });
    } catch {
      // best-effort
    }
  }
}

main();