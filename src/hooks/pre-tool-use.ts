#!/usr/bin/env node
import { hookAuthHeaders, hookSetting, reportBlockedTransport, resolveHookEndpoint } from "./_endpoint.js";
import { resolveProject, hookCwd } from "./_project.js";

function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const INJECT_CONTEXT = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "true";

const ENDPOINT = resolveHookEndpoint();
const REST_URL = ENDPOINT.url;

const DEFAULT_ENRICH_TIMEOUT_MS = 2000;

function authHeaders(): Record<string, string> {
  return hookAuthHeaders(ENDPOINT);
}

const MAX_TIMER_MS = 2_147_483_647;

function enrichTimeoutMs(): number {
  const raw = hookSetting("AGENTMEMORY_ENRICH_TIMEOUT_MS")?.trim() ?? "";
  const n = /^\d+$/.test(raw) ? Number(raw) : 0;
  return n >= 1 && n <= MAX_TIMER_MS ? n : DEFAULT_ENRICH_TIMEOUT_MS;
}

function isPlainTextHost(): boolean {
  return Boolean(process.env["FACTORY_PROJECT_DIR"] || process.env["DROID_PLUGIN_ROOT"]);
}

function contextPayload(data: Record<string, unknown>, context: string): string {
  if (data.hook_event_name !== "PreToolUse" || isPlainTextHost()) return context;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: context },
  });
}

async function main() {
  // Default off: exit immediately so we don't even open stdin. This keeps
  // Claude Code's tool-call hot path as cheap as possible.
  if (!INJECT_CONTEXT) return;
  if (reportBlockedTransport(ENDPOINT)) return;

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
  if (typeof data.cursor_version === "string") return;

  const toolName =
    typeof data.tool_name === "string"
      ? data.tool_name
      : typeof data.toolName === "string"
        ? data.toolName
        : undefined;
  if (!toolName) return;

  const normalizedToolName = toolName.toLowerCase();
  const fileTools = ["edit", "write", "create", "read", "view", "glob", "grep"];
  if (!fileTools.includes(normalizedToolName)) return;

  const rawToolInput = data.tool_input ?? data.toolArgs;
  const toolInput =
    typeof rawToolInput === "object" &&
    rawToolInput !== null &&
    !Array.isArray(rawToolInput)
      ? (rawToolInput as Record<string, unknown>)
      : {};
  const files: string[] = [];
  const fileKeys =
    normalizedToolName === "grep"
      ? ["path", "file"]
      : ["file_path", "path", "file", "pattern"];
  for (const key of fileKeys) {
    const val = toolInput[key];
    if (typeof val === "string" && val.length > 0) files.push(val);
  }
  if (files.length === 0) return;

  const terms: string[] = [];
  if (normalizedToolName === "grep" || normalizedToolName === "glob") {
    const pattern = toolInput["pattern"];
    if (typeof pattern === "string" && pattern.length > 0) {
      terms.push(pattern);
    }
  }

  const rawSessionId = data.session_id || data.sessionId || data.conversation_id;
  const sessionId =
    typeof rawSessionId === "string" && rawSessionId.length > 0
      ? rawSessionId
      : "unknown";
  const explicitProject =
    typeof data.project === "string" && data.project.trim().length > 0
      ? data.project.trim()
      : undefined;
  const project = (explicitProject ?? resolveProject(hookCwd(data) || process.cwd())).trim();
  if (!project) return;

  try {
    const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        sessionId,
        files,
        terms,
        toolName,
        project,
      }),
      signal: AbortSignal.timeout(enrichTimeoutMs()),
    });

    if (res.ok) {
      const result = (await res.json()) as { context?: string };
      if (result.context) {
        process.stdout.write(contextPayload(data, result.context));
      }
    }
  } catch {
    // don't block tool execution
  }
}

main().catch(() => process.exit(0));
