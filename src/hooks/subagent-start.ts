#!/usr/bin/env node
import { resolveProject, hookCwd } from "./_project.js";
import { postWithRetry } from "./_post.js";

// Inlined from ./sdk-guard so each hook bundles to a single self-contained
// .mjs (matches the pattern used by every other hook entry in tsdown.config).
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

  if (!data || typeof data !== "object") return;
  if (isSdkChildContext(data)) return;

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";
  const agentId = data.agent_id || data.agentName;
  const agentType = data.agent_type || data.agentDisplayName || data.agentName;

  const cwd = hookCwd(data) || process.cwd();

  postWithRetry(
    `${REST_URL}/agentmemory/observe`,
    authHeaders(),
    JSON.stringify({
      hookType: "subagent_start",
      sessionId,
      project: resolveProject(cwd),
      cwd,
      timestamp: new Date().toISOString(),
      data: {
        agent_id: agentId,
        agent_type: agentType,
      },
    }),
  );
  // Passive telemetry: nothing reads the response, so this cap is what keeps
  // a slow or unreachable server from stacking onto every concurrent subagent
  // startup (#221). postWithRetry's attempts and delay must stay under it; the
  // test in test/hook-post-retry.test.ts pins that.
  setTimeout(() => process.exit(0), 1000).unref();
}

main().catch(() => process.exit(0));
