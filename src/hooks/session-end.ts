#!/usr/bin/env node
import { authHeaders, guardedFetch } from "./_http.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

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

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";

  guardedFetch(REST_URL, "/agentmemory/session/end", SECRET, {
    method: "POST",
    headers: authHeaders(SECRET),
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(30000),
  })?.catch(() => {});

  if (process.env["CONSOLIDATION_ENABLED"] === "true") {
    guardedFetch(REST_URL, "/agentmemory/crystals/auto", SECRET, {
      method: "POST",
      headers: authHeaders(SECRET),
      body: JSON.stringify({ olderThanDays: 0 }),
      signal: AbortSignal.timeout(60000),
    })?.catch(() => {});

    guardedFetch(REST_URL, "/agentmemory/consolidate-pipeline", SECRET, {
      method: "POST",
      headers: authHeaders(SECRET),
      body: JSON.stringify({ tier: "all", force: true }),
      signal: AbortSignal.timeout(120000),
    })?.catch(() => {});
  }

  if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") {
    guardedFetch(REST_URL, "/agentmemory/claude-bridge/sync", SECRET, {
      method: "POST",
      headers: authHeaders(SECRET),
      signal: AbortSignal.timeout(30000),
    })?.catch(() => {});
  }

  setTimeout(() => process.exit(0), 1500).unref();
}

main();
