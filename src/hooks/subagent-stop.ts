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

  const sessionId = (data.session_id as string) || "unknown";
  const lastMsg =
    typeof data.last_assistant_message === "string"
      ? data.last_assistant_message.slice(0, 4000)
      : "";

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: "subagent_stop",
        sessionId,
        project: data.cwd || process.cwd(),
        cwd: data.cwd || process.cwd(),
        timestamp: new Date().toISOString(),
        data: {
          agent_id: data.agent_id,
          agent_type: data.agent_type,
          last_message: lastMsg,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // fire and forget
  }
}

main();
