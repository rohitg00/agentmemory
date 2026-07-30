#!/usr/bin/env node
import { getHookEnv } from "./_env.js";
import { resolveProject } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

// Prompt recall is intentionally independent from AGENTMEMORY_INJECT_CONTEXT:
// users can enable only one compact recall per submitted prompt without also
// enabling SessionStart or PreToolUse injection.
const REST_URL = getHookEnv("AGENTMEMORY_URL") || "http://localhost:3111";
const SECRET = getHookEnv("AGENTMEMORY_SECRET") || "";
const PROMPT_RECALL_ENABLED = getHookEnv("AGENTMEMORY_PROMPT_RECALL") === "true";
const RECALL_LIMIT = 5;
const RECALL_TIMEOUT_MS = 500;
const MAX_TITLE_CHARS = 500;
const MAX_TYPE_CHARS = 80;

interface CompactSearchResult {
  title?: unknown;
  type?: unknown;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Agentmemory-Source": "prompt-hook",
  };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  return headers;
}

function sanitizeInline(value: string, maxChars: number): string {
  return value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

async function recallContext(
  prompt: string,
  project: string,
  sessionId: string,
): Promise<string> {
  if (!prompt.trim()) return "";

  try {
    const response = await fetch(`${REST_URL}/agentmemory/smart-search`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        query: prompt,
        limit: RECALL_LIMIT,
        project,
        includeLessons: false,
        sessionId,
        source: "prompt-hook",
      }),
      signal: AbortSignal.timeout(RECALL_TIMEOUT_MS),
    });
    if (!response.ok) return "";

    const body = (await response.json()) as { results?: CompactSearchResult[] };
    const items = Array.isArray(body.results)
      ? body.results.slice(0, RECALL_LIMIT)
      : [];
    const lines = items.flatMap((item) => {
      if (typeof item.title !== "string") return [];
      const title = sanitizeInline(item.title, MAX_TITLE_CHARS);
      if (!title) return [];
      const itemType =
        typeof item.type === "string"
          ? sanitizeInline(item.type, MAX_TYPE_CHARS)
          : "";
      const type = itemType ? ` [${itemType}]` : "";
      return [`-${type} ${title}`];
    });
    if (lines.length === 0) return "";

    return [
      "<agentmemory-context>",
      "Relevant memories recalled for this prompt:",
      ...lines,
      "Use these as background context; verify details against the current workspace.",
      "</agentmemory-context>",
    ].join("\n");
  } catch {
    return "";
  }
}

function observePrompt(payload: Record<string, unknown>): void {
  fetch(`${REST_URL}/agentmemory/observe`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
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

  const sessionId = ((data.session_id || data.sessionId) as string) || "unknown";
  const cwd = (data.cwd as string | undefined) || process.cwd();
  const project = resolveProject(cwd);
  const prompt = String(data.prompt ?? data.userPrompt ?? "");
  observePrompt({
    hookType: "prompt_submit",
    sessionId,
    project,
    cwd,
    timestamp: new Date().toISOString(),
    data: { prompt },
  });

  // Copilot uses this script for observation capture too. Proactive recall is
  // intentionally limited to Claude Code and Codex, whose hook manifests use
  // CLAUDE_PLUGIN_ROOT rather than COPILOT_PLUGIN_ROOT.
  const promptRecall =
    PROMPT_RECALL_ENABLED && process.env["COPILOT_PLUGIN_ROOT"] === undefined;

  // Preserve the existing 500ms telemetry flush window. Prompt recall gets
  // its own 500ms deadline plus a small margin to flush model-visible stdout.
  setTimeout(
    () => process.exit(0),
    promptRecall ? RECALL_TIMEOUT_MS + 250 : 500,
  ).unref();

  if (!promptRecall) return;

  const additionalContext = await recallContext(prompt, project, sessionId);
  if (!additionalContext) return;

  await new Promise<void>((resolve) => {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext,
        },
      }),
      () => resolve(),
    );
  });
}

main().catch(() => process.exit(0));
