import { homedir } from "node:os";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { ISdk } from "iii-sdk";
import type {
  CompressedObservation,
  Crystal,
  Lesson,
  RawObservation,
  Session,
} from "../types.js";
import type { StateKV } from "../state/kv.js";
import { KV, generateId, fingerprintId } from "../state/schema.js";
import { parseJsonlText } from "../replay/jsonl-parser.js";
import { projectTimeline, type Timeline } from "../replay/timeline.js";
import { safeAudit } from "./audit.js";
import { buildSyntheticCompression } from "./compress-synthetic.js";
import { getSearchIndex } from "./search.js";
import { logger } from "../logger.js";

export const MAX_FILES_DEFAULT = 200;
export const MAX_FILES_UPPER_BOUND = 1000;

const SENSITIVE_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/_.-])secret([\\/_.-]|s?$)/i,
  /(^|[\\/_.-])credentials?([\\/_.-]|$)/i,
  /(^|[\\/_.-])private[_-]?key([\\/_.-]|$)/i,
  /(^|[\\/])\.env(\.[\w-]+)?$/i,
  /(^|[\\/_.-])id_rsa([\\/_.-]|$)/i,
  /(^|[\\/])auth[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])bearer[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])access[_-]?token([\\/_.-]|$)/i,
  /(^|[\\/])api[_-]?token([\\/_.-]|$)/i,
];

export function isSensitive(path: string): boolean {
  return SENSITIVE_PATH_PATTERNS.some((re) => re.test(path));
}

async function isSymlink(path: string): Promise<boolean> {
  try {
    const st = await lstat(path);
    return st.isSymbolicLink();
  } catch {
    return false;
  }
}

function rawFromCompressed(obs: CompressedObservation): RawObservation {
  return {
    id: obs.id,
    sessionId: obs.sessionId,
    timestamp: obs.timestamp,
    hookType: "post_tool_use",
    toolName: undefined,
    toolInput: undefined,
    toolOutput: undefined,
    userPrompt: obs.type === "conversation" ? obs.narrative : undefined,
    assistantResponse: undefined,
    raw: { title: obs.title, narrative: obs.narrative, facts: obs.facts },
  };
}

const LESSON_PATTERNS: RegExp[] = [
  /\b(always|never|don'?t|do not|make sure|remember to|note:|caveat:|warning:)\b[^.\n]{10,200}[.!\n]/gi,
  /\b(prefer|avoid)\s[^.\n]{10,200}[.!\n]/gi,
];

async function deriveCrystalAndLessons(
  kv: StateKV,
  sessionId: string,
  project: string,
  rawObs: RawObservation[],
  compressed: CompressedObservation[],
  firstPrompt: string | undefined,
): Promise<void> {
  if (rawObs.length === 0) return;
  const createdAt = new Date().toISOString();

  const files = new Set<string>();
  const tools = new Set<string>();
  for (const c of compressed) {
    for (const f of c.files || []) files.add(f);
    if (c.type && c.type !== "conversation" && c.title) tools.add(c.title);
  }

  const assistantTexts: string[] = [];
  const userPrompts: string[] = [];
  for (const r of rawObs) {
    if (typeof r.assistantResponse === "string" && r.assistantResponse.trim()) {
      assistantTexts.push(r.assistantResponse);
    }
    if (typeof r.userPrompt === "string" && r.userPrompt.trim()) {
      userPrompts.push(r.userPrompt);
    }
  }

  const lessonMatches = new Map<string, string>();
  for (const text of assistantTexts.concat(userPrompts).slice(0, 200)) {
    for (const pat of LESSON_PATTERNS) {
      pat.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text)) !== null && lessonMatches.size < 40) {
        const snippet = m[0].replace(/\s+/g, " ").trim();
        if (snippet.length >= 20 && snippet.length <= 220) {
          const key = snippet.toLowerCase();
          if (!lessonMatches.has(key)) lessonMatches.set(key, snippet);
        }
      }
    }
  }

  const lessonEntries = Array.from(lessonMatches.values()).slice(0, 20);
  const lessonIds: string[] = [];
  for (const content of lessonEntries) {
    // Content-addressed ID so re-importing the same JSONL does not
    // duplicate lessons. fingerprintId hashes the normalized content,
    // giving a stable lesson_xxx for identical text.
    const lessonId = fingerprintId("lesson", content.trim().toLowerCase());
    try {
      const existing = await kv.get<Lesson>(KV.lessons, lessonId);
      if (existing) {
        const existingSources = existing.sourceIds || [];
        const mergedSources = existingSources.includes(sessionId)
          ? existingSources
          : [...existingSources, sessionId];
        const existingTags = existing.tags || [];
        const mergedTags = existingTags.includes("auto-import")
          ? existingTags
          : [...existingTags, "auto-import"];
        const merged: Lesson = {
          ...existing,
          sourceIds: mergedSources,
          tags: mergedTags,
          reinforcements: (existing.reinforcements || 0) + 1,
          updatedAt: createdAt,
          lastReinforcedAt: createdAt,
        };
        await kv.set(KV.lessons, lessonId, merged);
      } else {
        const lesson: Lesson = {
          id: lessonId,
          content,
          context: firstPrompt || project,
          confidence: 0.4,
          reinforcements: 0,
          source: "consolidation",
          sourceIds: [sessionId],
          project,
          tags: ["auto-import"],
          createdAt,
          updatedAt: createdAt,
          decayRate: 0.05,
        };
        await kv.set(KV.lessons, lessonId, lesson);
      }
      lessonIds.push(lessonId);
    } catch {}
  }

  // Content-addressed on sessionId so re-importing the same session
  // upserts the crystal in place instead of creating a new one.
  const crystalId = fingerprintId("crystal", sessionId);
  const narrativePreview = firstPrompt
    ? firstPrompt.slice(0, 300)
    : compressed
        .slice(0, 5)
        .map((c) => c.narrative || c.title)
        .filter(Boolean)
        .join(" · ")
        .slice(0, 300);

  try {
    const existingCrystal = await kv.get<Crystal>(KV.crystals, crystalId);
    const crystal: Crystal = {
      id: crystalId,
      narrative: narrativePreview || `Session ${sessionId.slice(0, 12)} (${rawObs.length} observations)`,
      keyOutcomes: Array.from(tools).slice(0, 8),
      filesAffected: Array.from(files).slice(0, 20),
      lessons: lessonIds,
      sourceActionIds: existingCrystal?.sourceActionIds ?? [],
      sessionId,
      project,
      createdAt: existingCrystal?.createdAt ?? createdAt,
    };
    await kv.set(KV.crystals, crystalId, crystal);
  } catch {}
}

function isRawShape(o: unknown): o is RawObservation {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  return typeof r.hookType === "string";
}

async function loadObservations(
  kv: StateKV,
  sessionId: string,
): Promise<RawObservation[]> {
  const rows = await kv.list<RawObservation | CompressedObservation>(
    KV.observations(sessionId),
  );
  return rows.map((r) => (isRawShape(r) ? r : rawFromCompressed(r as CompressedObservation)));
}

async function findJsonlFiles(
  root: string,
  limit = 200,
): Promise<{
  files: string[];
  truncated: boolean;
  discovered: number;
  traversalCapped: boolean;
}> {
  const out: string[] = [];
  let discovered = 0;
  let walked = 0;
  // Hard bound on entries visited (regardless of extension) so trees
  // dominated by non-jsonl files (node_modules, lockfiles, etc.) cannot
  // lock the 30s function timeout. `discovered` may underrepresent the
  // true count when traversalCapped fires — callers should surface that
  // distinction to the user.
  const traversalCap = Math.max(limit * 50, 50_000);
  async function walk(dir: string) {
    if (walked >= traversalCap) return;
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (walked >= traversalCap) return;
      walked++;
      const full = join(dir, name);
      let st;
      try {
        st = await lstat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        await walk(full);
      } else if (st.isFile() && name.endsWith(".jsonl")) {
        discovered++;
        if (out.length < limit) out.push(full);
      }
    }
  }
  await walk(root);
  const traversalCapped = walked >= traversalCap;
  return {
    files: out,
    truncated: discovered > out.length || traversalCapped,
    discovered,
    traversalCapped,
  };
}

export function registerReplayFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::replay::load",
    async (data: { sessionId: string }): Promise<
      | { success: true; timeline: Timeline; session: Session | null }
      | { success: false; error: string }
    > => {
      if (!data?.sessionId || typeof data.sessionId !== "string") {
        return { success: false, error: "sessionId is required" };
      }
      const session = await kv.get<Session>(KV.sessions, data.sessionId);
      const observations = await loadObservations(kv, data.sessionId);
      const timeline = projectTimeline(observations);
      return { success: true, timeline, session };
    },
  );

  sdk.registerFunction(
    "mem::replay::sessions",
    async (): Promise<{ success: true; sessions: Session[] }> => {
      const sessions = await kv.list<Session>(KV.sessions);
      sessions.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
      return { success: true, sessions };
    },
  );

  sdk.registerFunction(
    "mem::replay::import-jsonl",
    async (
      data: { path?: string; maxFiles?: number } = {},
    ): Promise<
      | {
          success: true;
          imported: number;
          sessionIds: string[];
          observations: number;
          discovered: number;
          truncated: boolean;
          traversalCapped: boolean;
          maxFiles: number;
          maxFilesUpperBound: number;
        }
      | { success: false; error: string }
    > => {
      const defaultRoot = join(homedir(), ".claude", "projects");
      const rawPath = data.path || defaultRoot;
      if (typeof rawPath !== "string" || rawPath.length === 0) {
        return { success: false, error: "path must be a non-empty string" };
      }
      const expanded = rawPath.startsWith("~")
        ? join(homedir(), rawPath.slice(1))
        : rawPath;
      const abs = resolve(expanded);
      if (isSensitive(abs)) {
        return { success: false, error: "refusing to process sensitive-looking path" };
      }
      if (await isSymlink(abs)) {
        return { success: false, error: "symlinks are not supported" };
      }

      let stat;
      try {
        stat = await lstat(abs);
      } catch {
        return { success: false, error: "path not found" };
      }

      // Valid integer requests are clamped to MAX_FILES_UPPER_BOUND so
      // callers see a stable maxFiles in the response. Non-integer or
      // <= 0 falls back to the safe default. The HTTP layer rejects
      // out-of-range up front; this is the SDK-callable safety net.
      const maxFiles =
        Number.isInteger(data.maxFiles) && (data.maxFiles as number) > 0
          ? Math.min(data.maxFiles as number, MAX_FILES_UPPER_BOUND)
          : MAX_FILES_DEFAULT;
      let files: string[] = [];
      let truncated = false;
      let discovered = 0;
      let traversalCapped = false;
      if (stat.isDirectory()) {
        const found = await findJsonlFiles(abs, maxFiles);
        files = found.files;
        truncated = found.truncated;
        discovered = found.discovered;
        traversalCapped = found.traversalCapped;
      } else if (stat.isFile() && abs.endsWith(".jsonl")) {
        files = [abs];
        discovered = 1;
      } else {
        return { success: false, error: "path must be a .jsonl file or directory" };
      }

      if (files.length === 0) {
        return {
          success: true,
          imported: 0,
          sessionIds: [],
          observations: 0,
          discovered,
          truncated,
          traversalCapped,
          maxFiles,
          maxFilesUpperBound: MAX_FILES_UPPER_BOUND,
        };
      }

      const sessionIds: string[] = [];
      let observationCount = 0;

      for (const file of files) {
        if (isSensitive(file)) continue;
        if (await isSymlink(file)) continue;
        let text: string;
        try {
          text = await readFile(file, "utf-8");
        } catch (err) {
          logger.warn("replay: failed to read jsonl", {
            file,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        }

        const parsed = parseJsonlText(text, generateId("sess"));
        if (parsed.observations.length === 0) continue;

        const firstPromptObs = parsed.observations.find(
          (o) => typeof o.userPrompt === "string" && o.userPrompt.trim().length > 0,
        );
        const firstPrompt = firstPromptObs?.userPrompt
          ? firstPromptObs.userPrompt.replace(/\s+/g, " ").trim().slice(0, 200)
          : undefined;

        const existing = await kv.get<Session>(KV.sessions, parsed.sessionId);
        if (existing) {
          existing.observationCount =
            (existing.observationCount || 0) + parsed.observations.length;
          if (parsed.endedAt > (existing.endedAt || "")) {
            existing.endedAt = parsed.endedAt;
          }
          if (existing.status === "active") existing.status = "completed";
          const existingTags = existing.tags || [];
          if (!existingTags.includes("jsonl-import")) {
            existing.tags = [...existingTags, "jsonl-import"];
          }
          if (!existing.firstPrompt && firstPrompt) {
            existing.firstPrompt = firstPrompt;
          }
          await kv.set(KV.sessions, existing.id, existing);
        } else {
          const session: Session = {
            id: parsed.sessionId,
            project: parsed.project,
            cwd: parsed.cwd,
            startedAt: parsed.startedAt,
            endedAt: parsed.endedAt,
            status: "completed",
            observationCount: parsed.observations.length,
            tags: ["jsonl-import"],
            firstPrompt,
          };
          await kv.set(KV.sessions, session.id, session);
        }

        const searchIndex = getSearchIndex();
        const compressed: CompressedObservation[] = [];
        await Promise.all(
          parsed.observations.map(async (obs) => {
            const synthetic = buildSyntheticCompression(obs);
            compressed.push(synthetic);
            await kv.set(KV.observations(parsed.sessionId), obs.id, synthetic);
            searchIndex.add(synthetic);
          }),
        );
        observationCount += parsed.observations.length;
        sessionIds.push(parsed.sessionId);

        await deriveCrystalAndLessons(
          kv,
          parsed.sessionId,
          parsed.project,
          parsed.observations,
          compressed,
          firstPrompt,
        );
      }

      await safeAudit(kv, "import", "mem::replay::import-jsonl", sessionIds, {
        source: "jsonl",
        path: abs,
        files: files.length,
        observations: observationCount,
      });

      return {
        success: true,
        imported: files.length,
        sessionIds,
        observations: observationCount,
        discovered,
        truncated,
        traversalCapped,
        maxFiles,
        maxFilesUpperBound: MAX_FILES_UPPER_BOUND,
      };
    },
  );
}
