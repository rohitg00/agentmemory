#!/usr/bin/env node
import { preCompactBudget } from "./_capture-filter.js";
import { hookAuthHeaders, reportBlockedTransport, resolveHookEndpoint } from "./_endpoint.js";
import { resolveProject, hookCwd } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";
const ENDPOINT = resolveHookEndpoint();
const REST_URL = ENDPOINT.url;

function authHeaders(): Record<string, string> {
  return hookAuthHeaders(ENDPOINT);
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

  if (!data || typeof data !== "object") return;
  if (isSdkChildContext(data)) return;
  if (reportBlockedTransport(ENDPOINT)) return;

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";
  const project = resolveProject(hookCwd(data));

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

  if (!INJECT_CONTEXT) return;
  const budget = preCompactBudget();
  if (budget === 0) return;

  try {
    const res = await fetch(`${REST_URL}/agentmemory/context`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId, project, budget }),
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

main().catch(() => process.exit(0));
