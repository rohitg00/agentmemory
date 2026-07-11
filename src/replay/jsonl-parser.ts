import { createHash } from "node:crypto";
import type { HookType, RawObservation } from "../types.js";
import { fingerprintId } from "../state/schema.js";

interface JsonlEntry {
  type?: string;
  uuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  payload?: Record<string, unknown>;
  message?: {
    role?: string;
    content?: unknown;
  };
  toolUseResult?: unknown;
  [k: string]: unknown;
}

interface ParsedEntry {
  entry: JsonlEntry;
  line: number;
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
  const parts = cwd.split(/[\\/]/).filter(Boolean);
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

function stableObservationId(
  sessionId: string,
  line: number,
  kind: string,
  payload: unknown,
): string {
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return fingerprintId("obs", `${sessionId}\n${line}\n${kind}\n${payloadHash}`);
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export function parseJsonlText(text: string, fallbackSessionId?: string): ParsedTranscript {
  const entries: ParsedEntry[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") {
        entries.push({ entry: parsed as JsonlEntry, line: index + 1 });
      }
    } catch {
      // Malformed transcript lines cannot produce a trustworthy observation.
    }
  }

  let sessionId = "";
  let cwd = "";
  let firstTs = "";
  let lastTs = "";

  for (const { entry } of entries) {
    if (entry.sessionId && !sessionId) sessionId = entry.sessionId;
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.type === "session_meta" && entry.payload) {
      if (!sessionId && typeof entry.payload.id === "string") sessionId = entry.payload.id;
      if (!cwd && typeof entry.payload.cwd === "string") cwd = entry.payload.cwd;
      if (!firstTs && typeof entry.payload.timestamp === "string") firstTs = entry.payload.timestamp;
    }
    if (entry.timestamp) {
      if (!firstTs) firstTs = entry.timestamp;
      lastTs = entry.timestamp;
    }
  }

  const effectiveSessionId = sessionId || fallbackSessionId || fingerprintId("sess", text);
  const observations: RawObservation[] = [];
  const nowIso = new Date().toISOString();

  for (const { entry, line } of entries) {
    const ts = entry.timestamp || nowIso;
    const role = entry.message?.role;
    const content = entry.message?.content;

    if (entry.type === "event_msg" && entry.payload?.type === "user_message") {
      const prompt = payloadString(entry.payload, "message");
      if (prompt.trim()) {
        observations.push({
          id: stableObservationId(effectiveSessionId, line, "codex:user_message", entry.payload),
          sessionId: effectiveSessionId,
          timestamp: ts,
          hookType: "prompt_submit",
          userPrompt: prompt,
          raw: entry,
        });
      }
      continue;
    }

    if (entry.type === "event_msg" && entry.payload?.type === "task_complete") {
      observations.push({
        id: stableObservationId(effectiveSessionId, line, "codex:task_complete", entry.payload),
        sessionId: effectiveSessionId,
        timestamp: ts,
        hookType: "task_completed",
        assistantResponse: payloadString(entry.payload, "last_agent_message") || undefined,
        raw: entry,
      });
      continue;
    }

    if (entry.type === "user" && role === "user") {
      const toolResults = extractToolResults(content);
      if (toolResults.length > 0) {
        for (const [resultIndex, result] of toolResults.entries()) {
          observations.push({
            id: stableObservationId(effectiveSessionId, line, `claude:tool_result:${resultIndex}`, result),
            sessionId: effectiveSessionId,
            timestamp: ts,
            hookType: (result.isError ? "post_tool_failure" : "post_tool_use") as HookType,
            toolName: undefined,
            toolInput: { toolUseId: result.toolUseId },
            toolOutput: result.output,
            raw: entry,
          });
        }
      } else {
        const prompt = toText(content);
        if (prompt.trim()) {
          observations.push({
            id: stableObservationId(effectiveSessionId, line, "claude:user", entry),
            sessionId: effectiveSessionId,
            timestamp: ts,
            hookType: "prompt_submit",
            userPrompt: prompt,
            raw: entry,
          });
        }
      }
    } else if (entry.type === "assistant" && role === "assistant") {
      const response = toText(content);
      const tools = extractToolUses(content);
      if (response.trim()) {
        observations.push({
          id: stableObservationId(effectiveSessionId, line, "claude:assistant", entry),
          sessionId: effectiveSessionId,
          timestamp: ts,
          hookType: "stop",
          assistantResponse: response,
          raw: entry,
        });
      }
      for (const [toolIndex, tool] of tools.entries()) {
        observations.push({
          id: stableObservationId(effectiveSessionId, line, `claude:tool_use:${toolIndex}`, tool),
          sessionId: effectiveSessionId,
          timestamp: ts,
          hookType: "pre_tool_use",
          toolName: tool.name,
          toolInput: tool.input,
          raw: { toolUseId: tool.id, entry },
        });
      }
    }
  }

  return {
    sessionId: effectiveSessionId,
    project: deriveProject(cwd),
    cwd: cwd || process.cwd(),
    startedAt: firstTs || nowIso,
    endedAt: lastTs || firstTs || nowIso,
    observations,
  };
}
