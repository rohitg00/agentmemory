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
  if (data.is_interrupt || data.isInterrupt) return;

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";
  const toolName = data.tool_name ?? data.toolName;
  const toolInput = data.tool_input ?? data.toolArgs;
  const error = data.error ?? data.errorMessage;

  guardedFetch(REST_URL, "/agentmemory/observe", SECRET, {
    method: "POST",
    headers: authHeaders(SECRET),
    body: JSON.stringify({
      hookType: "post_tool_failure",
      sessionId,
      project: resolveProject(data.cwd),
      cwd: resolveCwd(data.cwd),
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
    signal: AbortSignal.timeout(3000),
  })?.catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

main();
