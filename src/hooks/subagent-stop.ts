#!/usr/bin/env node
import { resolveProject, hookCwd } from "./_project.js";
import { captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const OBSERVE_TIMEOUT_MS = 2000;
const EXIT_CAP_MS = 2500;

async function main() {
  if (isDrainChild()) return runDrainChild();
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
  const lastMsg =
    typeof data.last_assistant_message === "string"
      ? data.last_assistant_message.slice(0, 4000)
      : "";

  const cwd = hookCwd(data) || process.cwd();

  const body = {
    hookType: "subagent_stop",
    sessionId,
    project: resolveProject(cwd),
    cwd,
    timestamp: new Date().toISOString(),
    data: {
      agent_id: agentId,
      agent_type: agentType,
      last_message: lastMsg,
    },
  };
  void captureObservation(
    withEventId(
      body,
      {},
      { ...body.data, stop_hook_active: data.stop_hook_active === true },
      { stable: Boolean(data.agent_id) },
    ),
    OBSERVE_TIMEOUT_MS,
  );
  setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}

main().catch(() => process.exit(0));
