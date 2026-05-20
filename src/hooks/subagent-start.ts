#!/usr/bin/env node

import { resolveProject } from "./_project.js";

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
  // Trim before the length check so a whitespace-only `data.cwd`
  // (e.g. `"   "` from a misformed JSON payload) falls back to
  // process.cwd() instead of being forwarded as-is. CodeRabbit caught
  // this in the #475 re-review on session-start.ts:58 and
  // post-tool-failure.ts:40.
  const trimmedCwd = typeof data.cwd === "string" ? data.cwd.trim() : "";
  const cwd = trimmedCwd || process.cwd();
  const project = resolveProject(cwd);

  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "subagent_start",
      sessionId,
      project,
      cwd,
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
