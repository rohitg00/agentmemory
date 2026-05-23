#!/usr/bin/env node

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

function asText(value: unknown, max: number): string {
  if (typeof value === "string") return value.slice(0, max);
  if (value == null) return "";
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return String(value).slice(0, max);
  }
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
  const cwd = (data.cwd as string) || process.cwd();

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: "notification",
        sessionId,
        project: cwd,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          notification_type: "permission_request",
          tool_name: data.tool_name,
          tool_input: asText(data.tool_input, 4000),
          permission: data.permission || data.permission_type || data.action || null,
          title: data.title || data.tool_name || "Permission request",
          message: asText(data.message || data.reason || data, 4000),
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // best effort -- never block the permission flow
  }
}

main();
