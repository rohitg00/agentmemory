#!/usr/bin/env node
import { resolveProject } from "./_project.js";

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

  if (isSdkChildContext(data)) return;
  if (data.is_interrupt) return;

  const sessionId = (data.session_id as string) || "unknown";

  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "post_tool_failure",
      sessionId,
      project: resolveProject(data.cwd as string | undefined),
      cwd: (data.cwd as string | undefined) || process.cwd(),
      timestamp: new Date().toISOString(),
      data: {
        tool_name: data.tool_name,
        tool_input:
          typeof data.tool_input === "string"
            ? data.tool_input.slice(0, 4000)
            : JSON.stringify(data.tool_input ?? "").slice(0, 4000),
        error:
          typeof data.error === "string"
            ? data.error.slice(0, 4000)
            : JSON.stringify(data.error ?? "").slice(0, 4000),
      },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

main();
