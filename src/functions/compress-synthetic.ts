import type {
  RawObservation,
  CompressedObservation,
  ObservationType,
} from "../types.js";
import { createObservationSource } from "./observation-source.js";

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

const SEARCH_TOOL_PATTERN = /grep|glob|search|find|^ls$|list/i;

function extractFiles(toolName: string | undefined, input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const o = input as Record<string, unknown>;
  const isSearch =
    (toolName !== undefined && SEARCH_TOOL_PATTERN.test(toolName)) ||
    typeof o["pattern"] === "string" ||
    typeof o["query"] === "string";
  const keys = isSearch
    ? ["file_path", "filepath", "filePath", "notebook_path"]
    : ["file_path", "filepath", "path", "filePath", "file", "notebook_path"];
  const out = new Set<string>();
  for (const key of keys) {
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
  if (s.length <= n) return s;
  const end = /[\uD800-\uDBFF]/.test(s[n - 2]) ? n - 2 : n - 1;
  return s.slice(0, end) + "\u2026";
}

function keepEnds(s: string, n: number): string {
  if (s.length <= n) return s;
  let head = Math.ceil((n - 1) / 2);
  let tail = s.length - (n - 1 - head);
  if (/[\uD800-\uDBFF]/.test(s[head - 1])) head--;
  if (/[\uDC00-\uDFFF]/.test(s[tail])) tail++;
  return s.slice(0, head) + "\u2026" + s.slice(tail);
}

export function buildSyntheticCompression(
  raw: RawObservation,
): CompressedObservation {
  const toolName = raw.toolName ?? raw.hookType;
  const inputStr = stringifyForNarrative(raw.toolInput);
  const outputStr = stringifyForNarrative(raw.toolOutput);
  const promptStr = raw.userPrompt ?? "";
  const responseStr = keepEnds(raw.assistantResponse ?? "", 400);
  const source = createObservationSource(raw);

  const narrativeParts = [promptStr, inputStr, outputStr, responseStr].filter(
    (s) => s.length > 0,
  );
  const payload = source.payload;
  if (narrativeParts.length === 0 && payload != null &&
      (typeof payload !== "object" || Object.keys(payload).length > 0)) {
    narrativeParts.push(stringifyForNarrative(payload));
  }

  const result: CompressedObservation = {
    id: raw.id,
    sessionId: raw.sessionId,
    timestamp: raw.timestamp,
    compressedAt: new Date().toISOString(),
    type: inferType(toolName, raw.hookType),
    title: truncate(toolName || "observation", 80),
    subtitle: inputStr ? truncate(inputStr, 120) : undefined,
    facts: [],
    narrative: truncate(narrativeParts.join(" | "), 400),
    concepts: [],
    files: extractFiles(raw.toolName, raw.toolInput),
    importance: 5,
    confidence: 0.3,
    source,
  };
  if (raw.modality) result.modality = raw.modality;
  if (raw.imageData) result.imageData = raw.imageData;
  if (raw.agentId) result.agentId = raw.agentId;
  if (raw.origin) result.origin = raw.origin;
  if (raw.captureKey) result.captureKey = raw.captureKey;
  return result;
}
