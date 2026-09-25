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
  const notificationType = data.notification_type ?? data.notificationType;
  if (notificationType !== "permission_prompt") return;

  const rawSessionId = [data.session_id, data.sessionId, data.conversation_id].find(
    (v) => typeof v === "string" && v.length > 0,
  );
  const sessionId = typeof rawSessionId === "string" ? rawSessionId : "unknown";

  const cwd = hookCwd(data) || process.cwd();

  postWithRetry(
    `${REST_URL}/agentmemory/observe`,
    authHeaders(),
    JSON.stringify({
      hookType: "notification",
      sessionId,
      project: resolveProject(cwd),
      cwd,
      timestamp: new Date().toISOString(),
      data: {
        notification_type: notificationType,
        title: data.title,
        message: data.message,
      },
    }),
  );
  setTimeout(() => process.exit(0), 1000).unref();
}

main().catch(() => process.exit(0));
