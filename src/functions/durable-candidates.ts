import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ISdk } from "iii-sdk";
import type {
  ArchiveImportRecord,
  DurableCandidate,
  Session,
  SessionSummary,
} from "../types.js";
import { StateKV } from "../state/kv.js";
import { KV, fingerprintId } from "../state/schema.js";
import {
  DURABLE_PROMOTE_MIN_CONFIDENCE,
  bucketCandidateConfidence,
  updateSummaryCandidate,
} from "./durable-candidate-utils.js";
import { summarizeSession } from "./summarize.js";
import {
  MAX_FILES_DEFAULT,
  MAX_FILES_UPPER_BOUND,
  findJsonlFiles,
  isSensitive,
  isSymlink,
} from "./replay.js";
import { parseJsonlText } from "../replay/jsonl-parser.js";
import type { MemoryProvider } from "../types.js";
import { safeAudit } from "./audit.js";
import { logger } from "../logger.js";

const ARCHIVE_ROOT_DEFAULT = join(homedir(), ".codex", "archived_sessions");

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isSubPath(path: string, root: string): boolean {
  const normalizedPath = resolve(path).toLowerCase();
  const normalizedRoot = resolve(root).toLowerCase();
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}\\`) ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return out;
}

function asPositiveInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
}

function asOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return null;
  return value;
}

function findCandidateInSummaries(
  summaries: SessionSummary[],
  candidateId: string,
): { summary: SessionSummary; candidate: DurableCandidate } | null {
  for (const summary of summaries) {
    for (const candidate of summary.durableCandidates || []) {
      if (candidate.id === candidateId) {
        return { summary, candidate };
      }
    }
  }
  return null;
}

function collectDurableCandidates(
  summaries: SessionSummary[],
): DurableCandidate[] {
  return summaries
    .flatMap((summary) => summary.durableCandidates || [])
    .sort((a, b) => {
      const byCreatedAt = (b.createdAt || "").localeCompare(a.createdAt || "");
      if (byCreatedAt !== 0) return byCreatedAt;
      return b.confidence - a.confidence;
    });
}

async function readArchiveTargets(
  rawPath: string,
  maxFiles?: number,
): Promise<
  | {
      success: true;
      files: string[];
      discovered: number;
      truncated: boolean;
      traversalCapped: boolean;
      rootPath: string;
      maxFiles: number;
    }
  | { success: false; error: string }
> {
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

  const effectiveMaxFiles =
    maxFiles === undefined
      ? MAX_FILES_DEFAULT
      : Math.min(maxFiles, MAX_FILES_UPPER_BOUND);

  if (stat.isDirectory()) {
    const found = await findJsonlFiles(abs, effectiveMaxFiles);
    return {
      success: true,
      files: found.files,
      discovered: found.discovered,
      truncated: found.truncated,
      traversalCapped: found.traversalCapped,
      rootPath: abs,
      maxFiles: effectiveMaxFiles,
    };
  }

  if (stat.isFile() && abs.endsWith(".jsonl")) {
    return {
      success: true,
      files: [abs],
      discovered: 1,
      truncated: false,
      traversalCapped: false,
      rootPath: abs,
      maxFiles: effectiveMaxFiles,
    };
  }

  return { success: false, error: "path must be a .jsonl file or directory" };
}

export function registerDurableCandidateFunctions(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    "mem::durable-candidates::list",
    async (data: {
      sessionId?: string;
      project?: string;
      type?: string;
      promoted?: boolean;
      minConfidence?: number;
      limit?: number;
    } = {}) => {
      const summaries = await kv.list<SessionSummary>(KV.summaries);
      let candidates = collectDurableCandidates(summaries);
      if (typeof data.sessionId === "string" && data.sessionId.trim()) {
        candidates = candidates.filter(
          (candidate) => candidate.sessionId === data.sessionId?.trim(),
        );
      }
      if (typeof data.project === "string" && data.project.trim()) {
        candidates = candidates.filter(
          (candidate) => candidate.project === data.project?.trim(),
        );
      }
      if (typeof data.type === "string" && data.type.trim()) {
        candidates = candidates.filter(
          (candidate) => candidate.type === data.type?.trim(),
        );
      }
      if (typeof data.promoted === "boolean") {
        candidates = candidates.filter((candidate) =>
          data.promoted
            ? Boolean(candidate.promotedMemoryId)
            : !candidate.promotedMemoryId,
        );
      }
      if (
        typeof data.minConfidence === "number" &&
        Number.isFinite(data.minConfidence)
      ) {
        candidates = candidates.filter(
          (candidate) => candidate.confidence >= data.minConfidence,
        );
      }
      if (typeof data.limit === "number" && Number.isInteger(data.limit) && data.limit > 0) {
        candidates = candidates.slice(0, data.limit);
      }
      return {
        success: true,
        source: "summaries-scan",
        total: candidates.length,
        candidates,
      };
    },
  );

  sdk.registerFunction(
    "mem::durable-candidates::promote",
    async (data: {
      candidateId?: string;
      dryRun?: boolean;
      force?: boolean;
    }) => {
      const candidateId =
        typeof data?.candidateId === "string" ? data.candidateId.trim() : "";
      if (!candidateId) {
        return { success: false, error: "candidateId is required" };
      }

      const summaries = await kv.list<SessionSummary>(KV.summaries);
      const found = findCandidateInSummaries(summaries, candidateId);
      if (!found) {
        return { success: false, error: "candidate_not_found" };
      }

      const { summary, candidate } = found;
      const dryRun = data?.dryRun === true;
      const force = data?.force === true;
      const requiresForce =
        candidate.confidence < DURABLE_PROMOTE_MIN_CONFIDENCE ||
        candidate.sourceObservationIds.length === 0;

      if (candidate.promotedMemoryId) {
        const existingPromoted = await kv.get(KV.memories, candidate.promotedMemoryId);
        if (existingPromoted) {
          return {
            success: true,
            promoted: false,
            dryRun,
            skipped: true,
            reason: "already_promoted",
            candidate,
            memoryId: candidate.promotedMemoryId,
          };
        }
      }

      const memories = await kv.list<import("../types.js").Memory>(KV.memories);
      const existingBySourceCandidate = memories.find(
        (memory) => memory.sourceCandidateId === candidate.id,
      );
      if (existingBySourceCandidate) {
        const promotedAt = candidate.promotedAt || existingBySourceCandidate.createdAt;
        if (!dryRun) {
          await kv.set(
            KV.summaries,
            summary.sessionId,
            updateSummaryCandidate(summary, {
              ...candidate,
              promotedMemoryId: existingBySourceCandidate.id,
              promotedAt,
            }),
          );
        }
        return {
          success: true,
          promoted: false,
          dryRun,
          skipped: true,
          reason: "existing_memory_for_source_candidate",
          candidate: {
            ...candidate,
            promotedMemoryId: existingBySourceCandidate.id,
            promotedAt,
          },
          memoryId: existingBySourceCandidate.id,
        };
      }

      if (requiresForce && !force) {
        return {
          success: false,
          error: "force_required",
          candidate,
          requiresForce: true,
        };
      }

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          promoted: false,
          requiresForce,
          wouldCreateMemory: true,
          candidate,
        };
      }

      const rememberResult = (await sdk.trigger({
        function_id: "mem::remember",
        payload: {
          title: candidate.title,
          content: candidate.content,
          type: candidate.type,
          concepts: candidate.concepts,
          files: candidate.files,
          sourceObservationIds: candidate.sourceObservationIds,
          sessionIds: [candidate.sessionId],
          sourceCandidateId: candidate.id,
          project: candidate.project,
          confidence: candidate.confidence,
          strength: Math.max(1, Math.min(10, Math.round(candidate.confidence * 10))),
        },
      })) as { success?: boolean; memory?: import("../types.js").Memory; error?: string };

      if (!rememberResult?.success || !rememberResult.memory) {
        return {
          success: false,
          error: rememberResult?.error || "remember_failed",
        };
      }

      const promotedAt = new Date().toISOString();
      const updatedSummary = updateSummaryCandidate(summary, {
        ...candidate,
        promotedMemoryId: rememberResult.memory.id,
        promotedAt,
      });
      await kv.set(KV.summaries, summary.sessionId, updatedSummary);

      return {
        success: true,
        promoted: true,
        candidate: updatedSummary.durableCandidates?.find(
          (item) => item.id === candidate.id,
        ),
        memory: rememberResult.memory,
      };
    },
  );

  sdk.registerFunction(
    "mem::durable-candidates::backfill",
    async (data: {
      dryRun?: boolean;
      limit?: number;
      sessionIds?: string[];
    } = {}) => {
      const dryRun = data.dryRun !== false;
      const limit =
        typeof data.limit === "number" && Number.isInteger(data.limit) && data.limit > 0
          ? data.limit
          : undefined;
      const requestedSessionIds = Array.isArray(data.sessionIds)
        ? new Set(data.sessionIds.map((id) => id.trim()).filter(Boolean))
        : null;

      const sessions = await kv.list<Session>(KV.sessions);
      const summaries = await kv.list<SessionSummary>(KV.summaries);
      const memories = await kv.list<import("../types.js").Memory>(KV.memories);
      const summaryBySessionId = new Map(
        summaries.map((summary) => [summary.sessionId, summary] as const),
      );

      const scope = {
        sessions: sessions.length,
        observations: sessions.reduce(
          (sum, session) => sum + (session.observationCount || 0),
          0,
        ),
        summaries: summaries.length,
        memories: memories.length,
      };

      const eligibleSessions: Array<{
        sessionId: string;
        project: string;
        observationCount: number;
      }> = [];
      const skippedSessions: Array<{ sessionId: string; reason: string }> = [];

      for (const session of sessions) {
        if (requestedSessionIds && !requestedSessionIds.has(session.id)) {
          continue;
        }
        if (!session.id || !session.project) {
          skippedSessions.push({
            sessionId: session.id || "<missing>",
            reason: "invalid_row",
          });
          continue;
        }
        if (session.status === "active") {
          skippedSessions.push({ sessionId: session.id, reason: "active" });
          continue;
        }
        const observations = await kv.list(KV.observations(session.id));
        if (observations.length === 0) {
          skippedSessions.push({ sessionId: session.id, reason: "no_observations" });
          continue;
        }
        const existingSummary = summaryBySessionId.get(session.id);
        if ((existingSummary?.durableCandidates?.length || 0) > 0) {
          skippedSessions.push({
            sessionId: session.id,
            reason: "already_has_candidates",
          });
          continue;
        }
        eligibleSessions.push({
          sessionId: session.id,
          project: session.project,
          observationCount: observations.length,
        });
      }

      const limitedEligibleSessions =
        limit !== undefined ? eligibleSessions.slice(0, limit) : eligibleSessions;
      const candidatePreview = {
        total: 0,
        byType: {} as Record<string, number>,
        byConfidence: {} as Record<string, number>,
      };
      const processedSessions: Array<{
        sessionId: string;
        candidateCount: number;
      }> = [];

      for (const eligible of limitedEligibleSessions) {
        const result = await summarizeSession(kv, provider, {
          sessionId: eligible.sessionId,
          persistSummary: !dryRun,
          mergeDurableCandidatesOnly: true,
        });
        if (!result.success) {
          skippedSessions.push({
            sessionId: eligible.sessionId,
            reason: result.error,
          });
          continue;
        }

        const candidates = result.summary.durableCandidates || [];
        processedSessions.push({
          sessionId: eligible.sessionId,
          candidateCount: candidates.length,
        });
        candidatePreview.total += candidates.length;
        for (const candidate of candidates) {
          candidatePreview.byType[candidate.type] =
            (candidatePreview.byType[candidate.type] || 0) + 1;
          const bucket = bucketCandidateConfidence(candidate.confidence);
          candidatePreview.byConfidence[bucket] =
            (candidatePreview.byConfidence[bucket] || 0) + 1;
        }
      }

      if (!dryRun && processedSessions.length > 0) {
        await safeAudit(
          kv,
          "compress",
          "mem::durable-candidates::backfill",
          processedSessions.map((item) => item.sessionId),
          {
            dryRun,
            processedSessions: processedSessions.length,
            candidateCount: candidatePreview.total,
          },
        );
      }

      return {
        success: true,
        dryRun,
        startedAt: new Date().toISOString(),
        scope,
        eligibleSessions: limitedEligibleSessions,
        skippedSessions,
        processedSessions,
        candidatePreview,
        wouldMutate: dryRun ? processedSessions.length > 0 : false,
      };
    },
  );

  sdk.registerFunction(
    "mem::archive::process",
    async (data: {
      path?: string;
      maxFiles?: number;
      force?: boolean;
      allowNonArchivePath?: boolean;
    } = {}) => {
      const rawPath =
        typeof data.path === "string" && data.path.trim()
          ? data.path.trim()
          : ARCHIVE_ROOT_DEFAULT;
      const maxFiles =
        data.maxFiles === undefined
          ? undefined
          : Math.min(data.maxFiles, MAX_FILES_UPPER_BOUND);
      const allowNonArchivePath = data.allowNonArchivePath === true;
      const fileSelection = await readArchiveTargets(rawPath, maxFiles);
      if (!fileSelection.success) {
        return { success: false, error: fileSelection.error };
      }

      if (!allowNonArchivePath && !isSubPath(fileSelection.rootPath, ARCHIVE_ROOT_DEFAULT)) {
        return {
          success: false,
          error: `archive path must live under ${ARCHIVE_ROOT_DEFAULT}`,
        };
      }

      const processed: Array<{
        archivePath: string;
        sessionId: string;
        durableCandidateCount: number;
        idempotencyKey: string;
        fileHash: string;
      }> = [];
      const skipped: Array<{
        archivePath: string;
        sessionId?: string;
        reason: string;
      }> = [];

      for (const file of fileSelection.files) {
        let text: string;
        try {
          text = await readFile(file, "utf-8");
        } catch (err) {
          skipped.push({
            archivePath: file,
            reason: err instanceof Error ? err.message : "read_failed",
          });
          continue;
        }

        const parsed = parseJsonlText(text);
        if (parsed.observations.length === 0) {
          skipped.push({
            archivePath: file,
            sessionId: parsed.sessionId,
            reason: "no_observations",
          });
          continue;
        }

        const fileHash = hashText(text);
        const idempotencyKey = fingerprintId(
          "arch",
          `${file}\n${fileHash}\n${parsed.sessionId}`,
        );
        const existingImport = await kv.get<ArchiveImportRecord>(
          KV.archiveImports,
          idempotencyKey,
        );
        if (existingImport && data.force !== true) {
          skipped.push({
            archivePath: file,
            sessionId: parsed.sessionId,
            reason: "already_processed",
          });
          continue;
        }

        const importResult = (await sdk.trigger({
          function_id: "mem::replay::import-jsonl",
          payload: { path: file, maxFiles: 1 },
        })) as { success?: boolean; error?: string };
        if (!importResult?.success) {
          skipped.push({
            archivePath: file,
            sessionId: parsed.sessionId,
            reason: importResult?.error || "import_failed",
          });
          continue;
        }

        const session = await kv.get<Session>(KV.sessions, parsed.sessionId);
        if (session) {
          const observationCount = (
            await kv.list(KV.observations(parsed.sessionId))
          ).length;
          session.observationCount = observationCount;
          session.status = "completed";
          session.endedAt = parsed.endedAt || session.endedAt;
          await kv.set(KV.sessions, parsed.sessionId, session);
        }

        const summaryResult = await summarizeSession(kv, provider, {
          sessionId: parsed.sessionId,
          persistSummary: true,
        });
        if (!summaryResult.success) {
          skipped.push({
            archivePath: file,
            sessionId: parsed.sessionId,
            reason: summaryResult.error,
          });
          continue;
        }

        const durableCandidateCount =
          summaryResult.summary.durableCandidates?.length || 0;
        await kv.set<ArchiveImportRecord>(KV.archiveImports, idempotencyKey, {
          id: idempotencyKey,
          archivePath: file,
          fileHash,
          sessionId: parsed.sessionId,
          processedAt: new Date().toISOString(),
          durableCandidateCount,
          summaryCreated: true,
          source: "archive-process",
        });
        processed.push({
          archivePath: file,
          sessionId: parsed.sessionId,
          durableCandidateCount,
          idempotencyKey,
          fileHash,
        });
      }

      if (processed.length > 0) {
        await safeAudit(
          kv,
          "import",
          "mem::archive::process",
          processed.map((item) => item.sessionId),
          {
            path: fileSelection.rootPath,
            files: processed.length,
            discovered: fileSelection.discovered,
            truncated: fileSelection.truncated,
          },
        );
      }

      return {
        success: true,
        source: "archive-process",
        archiveRoot: fileSelection.rootPath,
        discovered: fileSelection.discovered,
        truncated: fileSelection.truncated,
        traversalCapped: fileSelection.traversalCapped,
        maxFiles: fileSelection.maxFiles,
        processed,
        skipped,
      };
    },
  );
}
