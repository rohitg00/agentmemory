import type { HookType, RawObservation } from "../types.js";
import { generateId } from "../state/schema.js";

interface JsonlEntry {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  role?: string;
  content?: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
  toolUseResult?: unknown;
  [k: string]: unknown;
}

export interface ParsedTranscript {
  sessionId: string;
  project: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  observations: RawObservation[];
}

function deriveProject(cwd: string): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

function toText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === "text" && typeof entry.text === "string") {
      parts.push(entry.text);
    }
  }
  return parts.join("\n");
}

function extractToolUses(content: unknown): Array<{ id: string; name: string; input: unknown }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ id: string; name: string; input: unknown }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === "tool_use") {
      out.push({
        id: typeof entry.id === "string" ? entry.id : "",
        name: typeof entry.name === "string" ? entry.name : "unknown",
        input: entry.input,
      });
    }
  }
  return out;
}

function extractToolResults(content: unknown): Array<{ toolUseId: string; output: unknown; isError: boolean }> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ toolUseId: string; output: unknown; isError: boolean }> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (entry.type === "tool_result") {
      out.push({
        toolUseId: typeof entry.tool_use_id === "string" ? entry.tool_use_id : "",
        output: entry.content,
        isError: entry.is_error === true,
      });
    }
  }
  return out;
}

/**
 * Normalize entries emitted in OpenAI chat-format JSONL (as produced by Hermes,
 * OpenAI-compatible agents, and other tools that log raw API requests) to the
 * Claude Code transcript format that {@link parseJsonlText} already understands.
 *
 * The OpenAI chat format uses top-level `role` + `content` fields and a separate
 * `tool_calls` array on assistant messages, with tool results carried in
 * `role:"tool"` messages. Claude Code uses a `type` discriminator and packs
 * tool_use / tool_result into structured `message.content` arrays.
 *
 * Entries already in Claude Code format (those with `entry.type` or
 * `entry.message`) pass through untouched.
 */
function normalizeOpenAIEntry(entry: JsonlEntry): JsonlEntry {
  // Already in Claude Code format — leave as-is.
  if (entry.type || entry.message) return entry;

  const role = entry.role as string | undefined;
  const content = entry.content;

  // { role: "user", content: "..." }
  if (role === "user" && content !== undefined) {
    return { ...entry, type: "user", message: { role: "user", content } };
  }

  // { role: "tool", tool_call_id: "...", content: "..." }
  if (role === "tool") {
    const toolUseId = typeof entry.tool_call_id === "string" ? entry.tool_call_id : "";
    return {
      ...entry,
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
      },
    };
  }

  // { role: "assistant", content: "...", tool_calls: [...] }
  if (role === "assistant") {
    const textContent = typeof content === "string" && content.trim() ? content : undefined;
    const contentArr: unknown[] = [];
    if (textContent) contentArr.push({ type: "text", text: textContent });

    if (Array.isArray(entry.tool_calls)) {
      for (const tc of entry.tool_calls) {
        if (!tc || typeof tc !== "object") continue;
        const fn = (tc as Record<string, unknown>).function as Record<string, unknown> | undefined;
        const rawArgs = fn?.arguments;
        let input: unknown = rawArgs;
        if (typeof rawArgs === "string") {
          try { input = JSON.parse(rawArgs); } catch { input = { raw: rawArgs }; }
        }
        contentArr.push({
          type: "tool_use",
          id: (tc as Record<string, unknown>).call_id ?? (tc as Record<string, unknown>).id ?? "",
          name: fn?.name ?? "unknown",
          input: input ?? {},
        });
      }
    }

    // Only restructure if we found something to carry; otherwise leave untouched
    // so a bare {role:"assistant"} with no content doesn't create a phantom entry.
    if (contentArr.length > 0) {
      return { ...entry, type: "assistant", message: { role: "assistant", content: contentArr } };
    }
  }

  return entry;
}

export function parseJsonlText(text: string, fallbackSessionId?: string): ParsedTranscript {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const entries: JsonlEntry[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") entries.push(parsed as JsonlEntry);
    } catch {
      // skip malformed lines
    }
  }

  let sessionId = "";
  let cwd = "";
  let firstTs = "";
  let lastTs = "";

  const observations: RawObservation[] = [];

  for (const rawEntry of entries) {
    const entry = normalizeOpenAIEntry(rawEntry);

    if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
    if (entry.cwd && !cwd) cwd = entry.cwd;
    const ts = entry.timestamp || new Date().toISOString();
    if (!firstTs) firstTs = ts;
    lastTs = ts;

    const role = entry.message?.role;
    const content = entry.message?.content;

    if (entry.type === "user" && role === "user") {
      const toolResults = extractToolResults(content);
      if (toolResults.length > 0) {
        for (const result of toolResults) {
          observations.push({
            id: generateId("obs"),
            sessionId: sessionId || "imported",
            timestamp: ts,
            hookType: (result.isError ? "post_tool_failure" : "post_tool_use") as HookType,
            toolName: undefined,
            toolInput: { toolUseId: result.toolUseId },
            toolOutput: result.output,
            raw: entry,
          });
        }
      } else {
        const text = toText(content);
        if (text.trim().length > 0) {
          observations.push({
            id: generateId("obs"),
            sessionId: sessionId || "imported",
            timestamp: ts,
            hookType: "prompt_submit" as HookType,
            userPrompt: text,
            raw: entry,
          });
        }
      }
    } else if (entry.type === "assistant" && role === "assistant") {
      const text = toText(content);
      const tools = extractToolUses(content);
      if (text.trim().length > 0) {
        observations.push({
          id: generateId("obs"),
          sessionId: sessionId || "imported",
          timestamp: ts,
          hookType: "stop" as HookType,
          assistantResponse: text,
          raw: entry,
        });
      }
      for (const tool of tools) {
        observations.push({
          id: generateId("obs"),
          sessionId: sessionId || "imported",
          timestamp: ts,
          hookType: "pre_tool_use" as HookType,
          toolName: tool.name,
          toolInput: tool.input,
          raw: { toolUseId: tool.id, entry },
        });
      }
    } else if (entry.type === "summary" || entry.type === "system") {
      // ignore meta entries
    }
  }

  const effectiveSessionId = sessionId || fallbackSessionId || generateId("sess");
  for (const obs of observations) {
    if (obs.sessionId === "imported") obs.sessionId = effectiveSessionId;
  }

  const nowIso = new Date().toISOString();
  return {
    sessionId: effectiveSessionId,
    project: deriveProject(cwd),
    cwd: cwd || process.cwd(),
    startedAt: firstTs || nowIso,
    endedAt: lastTs || nowIso,
    observations,
  };
}
