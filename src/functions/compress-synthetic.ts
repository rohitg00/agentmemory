import type {
  RawObservation,
  CompressedObservation,
  ObservationType,
} from "../types.js";
import { TELEMETRY_HOOKS } from "../types.js";
export { TELEMETRY_HOOKS } from "../types.js";

function inferType(
  toolName: string | undefined,
  hookType: string,
): ObservationType {
  if (TELEMETRY_HOOKS.has(hookType as never)) return "other";
  if (hookType === "post_tool_failure") return "error";
  if (hookType === "prompt_submit") return "conversation";
  if (hookType === "patch_applied") return "file_edit";
  if (hookType === "command_executed") return "command_run";
  if (hookType === "subagent_start" || hookType === "subagent_stop" || hookType === "task_completed")
    return "subagent";
  if (hookType === "notification") return "notification";

  if (!toolName) return "other";
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
  if (!input) return [];
  if (Array.isArray(input)) {
    return (input as unknown[]).filter(
      (v): v is string => typeof v === "string" && v.length > 0 && v.length < 512,
    ) as string[];
  }
  if (typeof input !== "object") return [];
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
  const contentStr = raw.content ?? "";
  const titleStr = typeof raw.title === "string" ? raw.title : "";

  if (raw.isTelemetry || TELEMETRY_HOOKS.has(raw.hookType as never)) {
    const result: CompressedObservation = {
      id: raw.id,
      sessionId: raw.sessionId,
      timestamp: raw.timestamp,
      type: inferType(toolName, raw.hookType),
      title: truncate(titleStr || toolName || "observation", 80),
      subtitle: undefined,
      facts: [],
      narrative: "",
      concepts: [],
      files: [],
      importance: 5,
      confidence: 0.3,
      isTelemetry: true,
    };
    if (raw.modality) result.modality = raw.modality;
    if (raw.imageData) result.imageData = raw.imageData;
    if (raw.agentId) result.agentId = raw.agentId;
    if (raw.origin) result.origin = raw.origin;
    return result;
  }

  const isZeroContent =
    titleStr.trim().length === 0 &&
    inputStr.trim().length === 0 &&
    outputStr.trim().length === 0 &&
    promptStr.trim().length === 0 &&
    contentStr.trim().length === 0 &&
    (!Array.isArray(raw.files) || raw.files.length === 0);

  if (isZeroContent) {
    const result: CompressedObservation = {
      id: raw.id,
      sessionId: raw.sessionId,
      timestamp: raw.timestamp,
      type: inferType(toolName, raw.hookType),
      title: "",
      subtitle: undefined,
      facts: [],
      narrative: "",
      concepts: [],
      files: [],
      importance: 5,
      confidence: 0.3,
    };
    if (raw.modality) result.modality = raw.modality;
    if (raw.imageData) result.imageData = raw.imageData;
    if (raw.agentId) result.agentId = raw.agentId;
    if (raw.origin) result.origin = raw.origin;
    return result;
  }

  let narrative: string;
  const narrativeParts = [promptStr, inputStr, outputStr, contentStr].filter(
    (s) => s.length > 0,
  );
  narrative = narrativeParts.join(" | ");
  if (narrative.length === 0 && titleStr.length > 0) narrative = titleStr;

  const filesFromInput = extractFiles(raw.toolInput);
  let files: string[];
  if (Array.isArray(raw.files) && raw.files.length > 0) {
    const dedup = new Set<string>();
    for (const f of filesFromInput) dedup.add(f);
    for (const f of raw.files) {
      if (typeof f === "string" && f.length > 0 && f.length < 512) {
        dedup.add(f);
        if (dedup.size >= 50) break;
      }
    }
    files = [...dedup].slice(0, 20);
  } else {
    files = filesFromInput;
    if (Array.isArray(raw.files) && raw.files.length === 0) {
      files = [];
    }
    if (Array.isArray(raw.toolInput) && files.length === 0) {
      const arrFiles = (raw.toolInput as unknown[]).filter(
        (v): v is string => typeof v === "string" && v.length > 0 && v.length < 512,
      ) as string[];
      if (arrFiles.length > 0) files = arrFiles.slice(0, 20);
    }
  }

  if (Array.isArray(raw.files) && raw.files.length > 0 && files.length === 0) {
    const rawFileList = raw.files.filter(
      (v): v is string => typeof v === "string" && v.length > 0 && v.length < 512,
    ) as string[];
    files = rawFileList.slice(0, 20);
  }

  const effectiveTitle = titleStr.length > 0 ? titleStr : truncate(toolName || "observation", 80);
  const effectiveSubtitle = inputStr
    ? truncate(inputStr, 120)
    : titleStr
      ? truncate(titleStr, 120)
      : undefined;

  const result: CompressedObservation = {
    id: raw.id,
    sessionId: raw.sessionId,
    timestamp: raw.timestamp,
    type: inferType(toolName, raw.hookType),
    title: truncate(effectiveTitle, 80),
    subtitle: effectiveSubtitle,
    facts: [],
    narrative: truncate(narrative, 400),
    concepts: [],
    files,
    importance: 5,
    confidence: 0.3,
  };
  if (raw.modality) result.modality = raw.modality;
  if (raw.imageData) result.imageData = raw.imageData;
  if (raw.agentId) result.agentId = raw.agentId;
  if (raw.origin) result.origin = raw.origin;
  return result;
}
