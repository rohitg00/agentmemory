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

  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: "task_completed",
        sessionId,
        project: data.cwd || process.cwd(),
        cwd: data.cwd || process.cwd(),
        timestamp: new Date().toISOString(),
        data: {
          task_id: data.task_id,
          task_subject: data.task_subject,
          task_description: typeof data.task_description === "string"
            ? data.task_description.slice(0, 2000)
            : "",
          teammate_name: data.teammate_name,
          team_name: data.team_name,
        },
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // fire and forget
  }
}

main();
