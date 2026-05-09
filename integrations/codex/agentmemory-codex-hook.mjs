#!/usr/bin/env node

/**
 * Codex lifecycle hook bridge for agentmemory.
 *
 * Codex sends one JSON payload on stdin for each configured hook event.
 * This script translates those events into agentmemory's REST API shape.
 * It is best-effort by design: memory capture should never block Codex.
 */

const REST_URL = process.env.AGENTMEMORY_URL || "http://localhost:3111";
const SECRET = process.env.AGENTMEMORY_SECRET || "";
const INJECT_CONTEXT = process.env.AGENTMEMORY_CODEX_INJECT_CONTEXT !== "false";
const REST_TIMEOUT_MS = positiveIntEnv(
  process.env.AGENTMEMORY_CODEX_REST_TIMEOUT_MS,
  4000,
);
const MAX_TOOL_OUTPUT_CHARS = positiveIntEnv(
  process.env.AGENTMEMORY_CODEX_MAX_TOOL_OUTPUT,
  8000,
);
const MAX_ASSISTANT_MESSAGE_CHARS = positiveIntEnv(
  process.env.AGENTMEMORY_CODEX_MAX_ASSISTANT_MESSAGE,
  12000,
);

function positiveIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers.Authorization = `Bearer ${SECRET}`;
  return headers;
}

async function readJsonFromStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function projectFrom(data) {
  return data.cwd || process.cwd();
}

function truncate(value, maxChars) {
  if (value === null || value === undefined) return value;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxChars) return value;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

async function post(path, body, timeoutMs = REST_TIMEOUT_MS) {
  const response = await fetch(`${REST_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function observe(data, sessionId, hookType, observedData) {
  return post("/agentmemory/observe", {
    hookType,
    sessionId,
    project: projectFrom(data),
    cwd: projectFrom(data),
    timestamp: new Date().toISOString(),
    data: observedData,
  });
}

function sessionStartContext(context) {
  const text =
    typeof context === "string" ? context : JSON.stringify(context, null, 2);
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text,
    },
  };
}

async function main() {
  const data = await readJsonFromStdin();
  if (!data) return;

  const event = data.hook_event_name;
  const sessionId = data.session_id || `codex_${Date.now().toString(36)}`;
  const project = projectFrom(data);

  try {
    if (event === "SessionStart") {
      const result = await post(
        "/agentmemory/session/start",
        { sessionId, project, cwd: project },
        5000,
      );
      if (INJECT_CONTEXT && result?.context) {
        process.stdout.write(JSON.stringify(sessionStartContext(result.context)));
      }
      return;
    }

    if (event === "UserPromptSubmit") {
      await observe(data, sessionId, "prompt_submit", {
        prompt: data.prompt,
        turn_id: data.turn_id,
        model: data.model,
      });
      return;
    }

    if (event === "PreToolUse") {
      await observe(data, sessionId, "pre_tool_use", {
        tool_name: data.tool_name,
        tool_input: data.tool_input,
        tool_use_id: data.tool_use_id,
        turn_id: data.turn_id,
      });
      return;
    }

    if (event === "PostToolUse") {
      await observe(data, sessionId, "post_tool_use", {
        tool_name: data.tool_name,
        tool_input: data.tool_input,
        tool_output: truncate(data.tool_response, MAX_TOOL_OUTPUT_CHARS),
        tool_use_id: data.tool_use_id,
        turn_id: data.turn_id,
      });
      return;
    }

    if (event === "Stop") {
      await observe(data, sessionId, "stop", {
        last_assistant_message: truncate(
          data.last_assistant_message,
          MAX_ASSISTANT_MESSAGE_CHARS,
        ),
        stop_hook_active: data.stop_hook_active,
        turn_id: data.turn_id,
      });
    }
  } catch {
    // Best effort only. Do not block Codex when agentmemory is down.
  }
}

main();
