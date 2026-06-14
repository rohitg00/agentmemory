#!/usr/bin/env node
import { authHeaders, guardedFetch } from "./_http.js";
import { resolveProject } from "./_project.js";

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
  const project = resolveProject(data.cwd);

  if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") {
    try {
      await guardedFetch(REST_URL, "/agentmemory/claude-bridge/sync", SECRET, {
        method: "POST",
        headers: authHeaders(SECRET),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // best-effort
    }
  }

  try {
    const res = await guardedFetch(REST_URL, "/agentmemory/context", SECRET, {
      method: "POST",
      headers: authHeaders(SECRET),
      body: JSON.stringify({ sessionId, project, budget: 1500 }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res) return;

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
