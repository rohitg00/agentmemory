#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolveProject, hookCwd } from "./_project.js";
import { REST_URL, authHeaders, captureObservation, isDrainChild, runDrainChild, withEventId } from "./_capture.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

type TranscriptBlock = { type?: string; text?: string };
type TranscriptLine = {
  role?: string;
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  promptId?: string;
  timestamp?: string;
  message?: { role?: string; content?: string | TranscriptBlock[] };
};

type TranscriptPrompt = { prompt: string; promptId?: string; timestamp?: string };

const HARNESS_TEXT =
  /^(?:<(?:command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr|task-notification|system-reminder|ci-monitor-event|cross-session-message|scheduled-task)(?=[\s>])|\[Request interrupted)/;

function isUserTurn(msg: TranscriptLine): boolean {
  if (msg.isSidechain || msg.isMeta || msg.isCompactSummary) return false;
  return (
    msg.role === "user" || msg.type === "user" || msg.message?.role === "user"
  );
}

function promptText(raw: string): string {
  const m = raw.match(/<user_query>\n?([\s\S]*?)\n?<\/user_query>/);
  const text = (m ? m[1] : raw).trim();
  return HARNESS_TEXT.test(text) ? "" : text;
}

function turnTexts(content: string | TranscriptBlock[] | undefined): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      texts.push(block.text);
    }
  }
  return texts;
}

function extractTranscriptPrompts(data: Record<string, unknown>): TranscriptPrompt[] {
  const path = data.transcript_path;
  if (typeof path !== "string" || !path.endsWith(".jsonl")) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const prompts: TranscriptPrompt[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let msg: TranscriptLine;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isUserTurn(msg)) continue;
    const texts = turnTexts(msg.message?.content).map(promptText).filter(Boolean);
    const promptId = typeof msg.promptId === "string" ? msg.promptId : undefined;
    const timestamp = typeof msg.timestamp === "string" ? msg.timestamp : undefined;
    for (const text of promptId ? [texts.join("\n\n")].filter(Boolean) : texts) {
      if (prompts.length >= 50) return prompts;
      prompts.push({ prompt: text.slice(0, 8000), promptId, timestamp });
    }
  }
  return prompts;
}

async function main() {
  if (isDrainChild()) return runDrainChild();
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
      transcriptPrompts.map(({ prompt, promptId, timestamp: at }, index) =>
        captureObservation(
          withEventId(
            { hookType: "prompt_submit", sessionId, project, cwd, timestamp: at ?? timestamp, data: { prompt, backfill: true } },
            promptId ? { prompt_id: promptId } : {},
            { source: "transcript", transcript: data.transcript_path, index, prompt },
            { stable: true },
          ),
          3000,
        ),
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
