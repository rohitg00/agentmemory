#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolveProject, hookCwd } from "./_project.js";

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

function extractTranscriptPrompts(data: Record<string, unknown>): string[] {
  const path = data.transcript_path;
  if (typeof path !== "string" || !path.endsWith(".jsonl")) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const prompts: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let msg: {
      role?: string;
      message?: { content?: Array<{ type?: string; text?: string }> };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.role !== "user") continue;
    for (const block of msg.message?.content ?? []) {
      if (prompts.length >= 50) return prompts;
      if (block.type !== "text" || typeof block.text !== "string") continue;
      const m = block.text.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
      const text = (m ? m[1] : block.text).trim();
      if (text) prompts.push(text.slice(0, 8000));
    }
  }
  return prompts;
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

  const sessionId = ((data.session_id || data.sessionId || data.conversation_id) as string) || "unknown";

  const transcriptPrompts = extractTranscriptPrompts(data);
  if (transcriptPrompts.length > 0) {
    const cwd = hookCwd(data) || process.cwd();
    const project = resolveProject(cwd);
    const timestamp = new Date().toISOString();
    await Promise.allSettled(
      transcriptPrompts.map((prompt) =>
        fetch(`${REST_URL}/agentmemory/observe`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            hookType: "prompt_submit",
            sessionId,
            project,
            cwd,
            timestamp,
            data: { prompt },
          }),
          signal: AbortSignal.timeout(3000),
        }),
      ),
    );
  }

  fetch(`${REST_URL}/agentmemory/session/end`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => {});

  if (process.env["CLAUDE_MEMORY_BRIDGE"] === "true") {
    fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
      method: "POST",
      headers: authHeaders(),
      signal: AbortSignal.timeout(30000),
    }).catch(() => {});
  }

  setTimeout(() => process.exit(0), 1500).unref();
}

main().catch(() => process.exit(0));
