#!/usr/bin/env node

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

  if (data.is_interrupt) return;

  const sessionId = (data.session_id as string) || "unknown";

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: "post_tool_failure",
        sessionId,
        project: data.cwd || process.cwd(),
        cwd: data.cwd || process.cwd(),
        timestamp: new Date().toISOString(),
        data: {
          tool_name: data.tool_name,
          tool_input: data.tool_input,
          error: data.error,
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // fire and forget
  }
}

main();
