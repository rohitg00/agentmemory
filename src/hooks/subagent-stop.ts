#!/usr/bin/env node
import { authHeaders, guardedFetch } from "./_http.js";
import { resolveCwd, resolveProject } from "./_project.js";

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
  const agentId = data.agent_id || data.agentName;
  const agentType = data.agent_type || data.agentDisplayName || data.agentName;
  const lastMsg =
    typeof data.last_assistant_message === "string"
      ? data.last_assistant_message.slice(0, 4000)
      : "";

  guardedFetch(REST_URL, "/agentmemory/observe", SECRET, {
    method: "POST",
    headers: authHeaders(SECRET),
    body: JSON.stringify({
      hookType: "subagent_stop",
      sessionId,
      project: resolveProject(data.cwd),
      cwd: resolveCwd(data.cwd),
      timestamp: new Date().toISOString(),
      data: {
        agent_id: agentId,
        agent_type: agentType,
        last_message: lastMsg,
      },
    }),
    signal: AbortSignal.timeout(2000),
  })?.catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

main();
