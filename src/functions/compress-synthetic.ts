import type {
  RawObservation,
  CompressedObservation,
  ObservationType,
} from "../types.js";

// Zero-LLM compression path. Converts a RawObservation into a
// CompressedObservation using only heuristics — no Claude call, no token
// spend. This is the default as of 0.8.8 (#138); users who want richer
// LLM-generated summaries set AGENTMEMORY_AUTO_COMPRESS=true.

function inferType(
  toolName: string | undefined,
  hookType: string,
): ObservationType {
  if (hookType === "post_tool_failure") return "error";
  if (hookType === "prompt_submit") return "conversation";
  if (hookType === "subagent_stop" || hookType === "task_completed")
    return "subagent";
  if (hookType === "notification") return "notification";

  if (!toolName) return "other";
  // Normalize camelCase and kebab-case into word chunks so we can match
  // substrings like "WebFetch" -> "web" / "fetch".
  const n = toolName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  const hasWord = (word: string) =>
    new RegExp(`(^|_)${word}(_|$)`).test(n) ||
    n === word ||
    n.endsWith(word) ||
    n.startsWith(word);
  if (["fetch", "http", "web"].some(hasWord)) return "web_fetch";
  if (["grep", "search", "glob", "find"].some(hasWord)) return "search";
  if (["bash", "shell", "exec", "run"].some(hasWord)) return "command_run";
  if (["edit", "update", "patch", "replace"].some(hasWord)) return "file_edit";
  if (["write", "create"].some(hasWord)) return "file_write";
  if (["read", "view"].some(hasWord)) return "file_read";
  if (["task", "agent"].some(hasWord)) return "subagent";
  return "other";
}

function extractFiles(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const o = input as Record<string, unknown>;
  const out = new Set<string>();
  for (const key of [
    "file_path",
    "filepath",
    "path",
    "filePath",
    "file",
    "pattern",
  ]) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0 && v.length < 512) out.add(v);
  }
  return [...out];
}

function stringifyForNarrative(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

export function buildSyntheticCompression(
  raw: RawObservation,
): CompressedObservation {
  const toolName = raw.toolName ?? raw.hookType;
  const inputStr = stringifyForNarrative(raw.toolInput);
  const outputStr = stringifyForNarrative(raw.toolOutput);
  const promptStr = raw.userPrompt ?? "";

  const narrativeParts = [promptStr, inputStr, outputStr].filter(
    (s) => s.length > 0,
  );

  return {
    id: raw.id,
    sessionId: raw.sessionId,
    timestamp: raw.timestamp,
    type: inferType(toolName, raw.hookType),
    title: truncate(toolName || "observation", 80),
    subtitle: inputStr ? truncate(inputStr, 120) : undefined,
    facts: [],
    narrative: truncate(narrativeParts.join(" | "), 400),
    concepts: [],
    files: extractFiles(raw.toolInput),
    importance: 5,
    confidence: 0.3,
  };
}
