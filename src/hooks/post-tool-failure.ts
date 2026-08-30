#!/usr/bin/env node
import { resolveProject, hookCwd } from "./_project.js";
import { postWithRetry } from "./_post.js";

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
  if (data.is_interrupt || data.isInterrupt) return;

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";
  const toolName = data.tool_name ?? data.toolName;
  const toolInput = data.tool_input ?? data.toolArgs;
  const error = data.error ?? data.errorMessage;

  const cwd = hookCwd(data) || process.cwd();

  postWithRetry(
    `${REST_URL}/agentmemory/observe`,
    authHeaders(),
    JSON.stringify({
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
    }),
  );
  setTimeout(() => process.exit(0), 1000).unref();
}

main().catch(() => process.exit(0));
