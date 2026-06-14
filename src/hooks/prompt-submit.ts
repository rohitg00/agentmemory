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

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";

  guardedFetch(REST_URL, "/agentmemory/observe", SECRET, {
    method: "POST",
    headers: authHeaders(SECRET),
    body: JSON.stringify({
      hookType: "prompt_submit",
      sessionId,
      project: resolveProject(data.cwd),
      cwd: resolveCwd(data.cwd),
      timestamp: new Date().toISOString(),
      data: { prompt: data.prompt ?? data.userPrompt },
    }),
    signal: AbortSignal.timeout(3000),
  })?.catch(() => {});
  setTimeout(() => process.exit(0), 500).unref();
}

main();
