import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const STATE_DIR = path.join(os.homedir(), "Library/Application Support/agentmemory/state_store.db");
const TELEMETRY_HOOKS = new Set([
  "assistant_message",
  "session_status",
  "session_updated",
  "session_compacted",
  "config_loaded",
  "llm_params",
  "reasoning",
  "step_finish",
  "message_removed",
  "permission_replied",
  "compaction_event",
  "session_diff",
  "invalid",
  "notification",
  "retry_attempt",
  "council_session",
  "permission_prompt",
]);

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath);
  const cut = raw.lastIndexOf(0x7d); // '}'
  if (cut === -1) return null;
  try {
    return JSON.parse(raw.slice(0, cut + 1).toString("utf8"));
  } catch (e) {
    return null;
  }
}

function isEmpty(val) {
  if (val == null) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

const files = fs.readdirSync(STATE_DIR).filter(f => f.startsWith("mem%3Aobs%3A") && f.endsWith(".bin"));
let totalScanned = 0, totalFlagged = 0, totalSkipped = 0, filesWritten = 0;
const failedFiles = [];

for (const fname of files) {
  const fpath = path.join(STATE_DIR, fname);
  const obj = parseFile(fpath);
  if (!obj || typeof obj !== "object") {
    failedFiles.push(fname);
    continue;
  }
  let dirty = false;
  for (const [obsId, row] of Object.entries(obj)) {
    if (!row || typeof row !== "object") continue;
    totalScanned++;
    if (row.isTelemetry !== undefined) continue;

    // Determine hook name: prefer hookType, fallback to type, fallback to title when type==='other'
    let hookName = null;
    if (typeof row.hookType === "string") hookName = row.hookType;
    else if (typeof row.type === "string") hookName = row.type;

    // For old rows, type is ObservationType like "other" with title == hook name
    // But per spec: check (hookType || type) in TELEMETRY_HOOKS OR title match when type==='other' + old-empty shape
    // Simpler: if hookName in set, check empty shape; if title in set and type==='other' and empty, also flag.

    let isTelemetryCandidate = false;
    if (hookName && TELEMETRY_HOOKS.has(hookName)) {
      isTelemetryCandidate = true;
    } else if (row.type === "other" && typeof row.title === "string" && TELEMETRY_HOOKS.has(row.title)) {
      // title match for old-empty shape
      isTelemetryCandidate = true;
    }

    if (!isTelemetryCandidate) continue;

    // OLD-EMPTY shape: empty narrative AND empty facts AND empty files
    const narrativeEmpty = isEmpty(row.narrative);
    const factsEmpty = !row.facts || !Array.isArray(row.facts) || row.facts.length === 0;
    const filesEmpty = !row.files || !Array.isArray(row.files) || row.files.length === 0;

    if (narrativeEmpty && factsEmpty && filesEmpty) {
      row.isTelemetry = true;
      totalFlagged++;
      dirty = true;
    } else {
      // content-bearing: skip, do not flag
      totalSkipped++;
    }
  }
  if (dirty) {
    // Write back clean JSON (no trailing garbage)
    // Preserve formatting: JSON.stringify(obj, null, 2) — verified head shows pretty-printed
    fs.writeFileSync(fpath, JSON.stringify(obj, null, 2));
    filesWritten++;
  }
}

console.log(JSON.stringify({ filesScanned: files.length, totalScanned, totalFlagged, totalSkipped, filesWritten, failedFiles }, null, 2));
