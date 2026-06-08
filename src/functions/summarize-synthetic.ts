import type {
  CompressedObservation,
  ObservationType,
  Session,
  SessionSummary,
} from "../types.js";

// Zero-LLM session summary. Aggregates already-compressed (typically
// synthetic, see compress-synthetic.ts) observations into a deterministic
// SessionSummary so recap, handoff, and skill-extract keep working without
// an external LLM call. Mirrors the #138 philosophy: when
// AGENTMEMORY_AUTO_COMPRESS is off, the whole memory hot-path stays
// LLM-free — no token spend, no circuit-breaker exposure. Users who want a
// richer narrative opt back into LLM summaries via AGENTMEMORY_AUTO_COMPRESS.

const MODIFY_TYPES: ReadonlySet<ObservationType> = new Set<ObservationType>([
  "file_write",
  "file_edit",
]);

// Singular labels; pluralized at the call site with a trailing "s".
const TYPE_LABEL: Record<string, string> = {
  file_read: "file read",
  file_write: "file write",
  file_edit: "edit",
  command_run: "command",
  search: "search",
  web_fetch: "web fetch",
  conversation: "prompt",
  error: "error",
  decision: "decision",
  discovery: "discovery",
  subagent: "subagent task",
  notification: "notification",
  task: "task",
  image: "image",
  other: "action",
};

const EXT_LANG: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  py: "Python",
  rs: "Rust",
  go: "Go",
  java: "Java",
  rb: "Ruby",
  c: "C",
  h: "C",
  cpp: "C++",
  cc: "C++",
  hpp: "C++",
  cs: "C#",
  php: "PHP",
  swift: "Swift",
  kt: "Kotlin",
  scala: "Scala",
  sh: "Shell",
  bash: "Shell",
  fish: "Shell",
  zsh: "Shell",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  html: "HTML",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  md: "Markdown",
  sql: "SQL",
  vue: "Vue",
  svelte: "Svelte",
  dart: "Dart",
  lua: "Lua",
  ex: "Elixir",
  exs: "Elixir",
};

function basename(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p;
}

function extOf(p: string): string | undefined {
  const base = basename(p);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

// Up to two leading directory segments give useful scope context
// (e.g. "src/functions") without leaking absolute machine paths.
function scopeDir(file: string): string | undefined {
  const parts = file.split(/[/\\]/).filter((p) => p && p !== ".");
  if (parts.length < 2) return undefined;
  const dirSegments = parts.slice(0, parts.length - 1);
  return dirSegments.slice(-2).join("/");
}

function rankByFreq(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (!it) continue;
    counts.set(it, (counts.get(it) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

function truncate(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function humanizeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function pluralize(label: string, count: number): string {
  if (count === 1) return label;
  // "search" → "searches", "web fetch" → "web fetches"; -es for sibilant
  // endings, plain -s otherwise ("edit" → "edits", "command" → "commands").
  return /(ch|sh|s|x|z)$/i.test(label) ? `${label}es` : `${label}s`;
}

export function buildSyntheticSummary(
  compressed: CompressedObservation[],
  sessionId: string,
  project: string,
  session?: Session,
): SessionSummary {
  const obs = [...compressed].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const total = obs.length;

  // ── activity tally ────────────────────────────────────────────────
  const typeCounts = new Map<string, number>();
  for (const o of obs) {
    typeCounts.set(o.type, (typeCounts.get(o.type) ?? 0) + 1);
  }
  const dominantType = [...typeCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  // ── files ─────────────────────────────────────────────────────────
  const modified: string[] = [];
  const read: string[] = [];
  for (const o of obs) {
    if (!o.files || o.files.length === 0) continue;
    if (MODIFY_TYPES.has(o.type)) modified.push(...o.files);
    else if (o.type === "file_read") read.push(...o.files);
  }
  const filesModified = rankByFreq(modified).slice(0, 30);
  const allFiles = [...modified, ...read];

  // ── concepts: explicit (from LLM-compressed obs) + derived ────────
  const conceptPool: string[] = [];
  for (const o of obs) {
    if (o.concepts && o.concepts.length) conceptPool.push(...o.concepts);
  }
  for (const f of allFiles) {
    const dir = scopeDir(f);
    if (dir) conceptPool.push(dir);
  }
  for (const f of allFiles) {
    const ext = extOf(f);
    if (ext && EXT_LANG[ext]) conceptPool.push(EXT_LANG[ext]);
  }
  let concepts = rankByFreq(conceptPool).slice(0, 12);
  if (concepts.length === 0) {
    // No files and no explicit concepts (e.g. a conversation-only
    // session): fall back to the dominant activity types so the field
    // is never empty and recall still has something to match on.
    concepts = [...typeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => TYPE_LABEL[t] ?? t);
  }

  // ── key decisions ─────────────────────────────────────────────────
  const decisions: string[] = [];
  for (const o of obs) {
    if (o.type === "decision") {
      const body = o.subtitle
        ? `${o.title}: ${o.subtitle}`
        : o.narrative || o.title;
      decisions.push(truncate(body, 160));
    }
  }
  if (decisions.length < 6) {
    for (const o of obs) {
      if (o.type === "discovery") {
        decisions.push(truncate(o.title, 160));
        if (decisions.length >= 6) break;
      }
    }
  }
  const errorCount = typeCounts.get("error") ?? 0;
  if (errorCount > 0 && decisions.length < 8) {
    const firstErr = obs.find((o) => o.type === "error");
    if (firstErr) {
      decisions.push(truncate(`Encountered error: ${firstErr.title}`, 160));
    }
  }
  const keyDecisions = [...new Set(decisions)].slice(0, 8);

  // ── title ─────────────────────────────────────────────────────────
  const firstPrompt =
    (session?.firstPrompt && session.firstPrompt.trim()) ||
    obs.find((o) => o.type === "conversation")?.narrative?.trim() ||
    obs.find((o) => o.type === "conversation")?.title?.trim() ||
    "";
  let title: string;
  if (firstPrompt.length >= 5) {
    title = truncate(firstPrompt, 80);
  } else {
    const label = dominantType ? TYPE_LABEL[dominantType] ?? dominantType : "activity";
    const where = scopeDir(filesModified[0] || allFiles[0] || "") || project;
    title = truncate(`${label} session in ${where}`, 80);
  }

  // ── narrative ─────────────────────────────────────────────────────
  const startTs = obs[0]?.timestamp;
  const endTs = obs[total - 1]?.timestamp;
  const dur =
    startTs && endTs
      ? humanizeDuration(new Date(endTs).getTime() - new Date(startTs).getTime())
      : "";

  const activityOrder: ObservationType[] = [
    "file_edit",
    "file_write",
    "file_read",
    "command_run",
    "search",
    "web_fetch",
    "subagent",
    "error",
    "conversation",
  ];
  const activityBits: string[] = [];
  for (const t of activityOrder) {
    const c = typeCounts.get(t);
    if (c) activityBits.push(`${c} ${pluralize(TYPE_LABEL[t], c)}`);
  }

  const parts: string[] = [];
  parts.push(
    `Session on ${project} with ${total} ${pluralize("observation", total)}${
      dur ? ` over ${dur}` : ""
    }.`,
  );
  if (activityBits.length) parts.push(`Activity: ${activityBits.join(", ")}.`);
  if (filesModified.length) {
    const shown = filesModified.slice(0, 8).map(basename).join(", ");
    parts.push(
      `Modified ${filesModified.length} ${pluralize("file", filesModified.length)}: ${shown}${
        filesModified.length > 8 ? ", …" : ""
      }.`,
    );
  }
  if (firstPrompt.length >= 5) {
    parts.push(`Initial intent: ${truncate(firstPrompt, 200)}.`);
  }
  if (errorCount > 0) {
    parts.push(
      `${errorCount} ${pluralize("error", errorCount)} surfaced during the session.`,
    );
  }
  const narrative = parts.join(" ");

  return {
    sessionId,
    project,
    createdAt: new Date().toISOString(),
    title,
    narrative,
    keyDecisions,
    filesModified,
    concepts,
    observationCount: total,
  };
}
