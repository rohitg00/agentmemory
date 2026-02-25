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
    await fetch(`${REST_URL}/agentmemory/summarize`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    // summarize is best-effort
  }
}

main();
