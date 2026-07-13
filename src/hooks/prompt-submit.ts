#!/usr/bin/env node
import { resolveProject } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";
const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";

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

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";

  const project = resolveProject(data.cwd as string | undefined);
  const prompt = typeof data.prompt === "string"
    ? data.prompt
    : typeof data.userPrompt === "string"
      ? data.userPrompt
      : "";
  const observe = fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: "prompt_submit",
      sessionId,
      project,
      cwd: (data.cwd as string | undefined) || process.cwd(),
      timestamp: new Date().toISOString(),
      data: { prompt },
    }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
  if (!INJECT_CONTEXT || !prompt) {
    void observe;
    return;
  }
  try {
    const response = await fetch(`${REST_URL}/agentmemory/context`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        sessionId,
        project,
        cwd: (data.cwd as string | undefined) || process.cwd(),
        query: prompt,
        outputMode: "prompt_injection",
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      const result = await response.json() as { context?: unknown };
      if (typeof result.context === "string" && result.context) {
        process.stdout.write(result.context);
      }
    }
  } catch {}
  void observe;
}

main();
