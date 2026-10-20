#!/usr/bin/env node
import { shouldCaptureTool } from "./_capture-filter.js";
import { resolveProject, hookCwd } from "./_project.js";
import { captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const OBSERVE_TIMEOUT_MS = 3000;
const EXIT_CAP_MS = 3500;

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
  if (data.is_interrupt || data.isInterrupt) return;

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";
  const toolName = data.tool_name ?? data.toolName;
  if (!shouldCaptureTool(toolName)) return;

  const toolInput = data.tool_input ?? data.toolArgs;
  const error = data.error ?? data.errorMessage;

  const cwd = hookCwd(data) || process.cwd();

  void captureObservation(
    withEventId(
      {
        hookType: "post_tool_failure",
        sessionId,
        project: resolveProject(cwd),
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: toolName,
          tool_input:
            typeof toolInput === "string"
              ? toolInput.slice(0, 4000)
              : JSON.stringify(toolInput ?? "").slice(0, 4000),
          error:
            typeof error === "string"
              ? error.slice(0, 4000)
              : JSON.stringify(error ?? "").slice(0, 4000),
        },
      },
      data,
    ),
    OBSERVE_TIMEOUT_MS,
  );
  setTimeout(() => process.exit(0), EXIT_CAP_MS).unref();
}

main().catch(() => process.exit(0));
