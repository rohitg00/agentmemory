import type { AuditEntry, Lesson } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { logger } from "../logger.js";
import {
  buildLessonAccessIndex,
  canReadLesson,
  lessonAccessContextFromPayload,
} from "./lesson-access.js";

// Audit coverage policy (issue #125).
//
// Every structural deletion of a memory, observation, session, or
// semantic row MUST call recordAudit. Two shapes are allowed, keyed to
// whether the caller is scoped or bulk:
//
//   Scoped deletions — a user-visible, per-call action removing a
//   bounded set of items. Emit ONE audit row per call with targetIds
//   populated. Examples: mem::governance-delete, mem::forget.
//
//   Bulk deletions — automatic sweeps (retention, TTL eviction,
//   auto-forget) that can remove hundreds of rows per invocation.
//   Emit ONE batched audit row per invocation with targetIds listing
//   every removed id and details.evicted holding the count. Per-item
//   audit rows would flood the audit log during routine sweeps.
//
//   Either shape is required; silent deletes are not acceptable.
//
// operation field:
//   - "delete"          — permanent removal (governance, retention sweep, evict).
//   - "forget"          — forget/removal flows. Scoped when emitted by
//                         mem::forget (user-initiated); bulk-batched when
//                         emitted by mem::auto-forget (automatic sweep).
//   - everything else   — see AuditEntry["operation"] union in src/types.ts.
//
// When adding a new deletion path, add an explicit recordAudit call
// BEFORE kv.delete(...) and match one of the two shapes above.

export async function recordAudit(
  kv: StateKV,
  operation: AuditEntry["operation"],
  functionId: string,
  targetIds: string[],
  details: Record<string, unknown> = {},
  qualityScore?: number,
  userId?: string,
): Promise<AuditEntry> {
  const entry: AuditEntry = {
    id: generateId("aud"),
    timestamp: new Date().toISOString(),
    operation,
    userId,
    functionId,
    targetIds,
    details,
    qualityScore,
  };
  await kv.set(KV.audit, entry.id, entry);
  return entry;
}

export async function safeAudit(
  kv: StateKV,
  operation: AuditEntry["operation"],
  functionId: string,
  targetIds: string[],
  details: Record<string, unknown> = {},
  qualityScore?: number,
  userId?: string,
): Promise<void> {
  try {
    await recordAudit(kv, operation, functionId, targetIds, details, qualityScore, userId);
  } catch (err) {
    try {
      logger.warn("audit write failed", {
        functionId,
        operation,
        targetIds,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {}
  }
}

export async function queryAudit(
  kv: StateKV,
  filter?: {
    operation?: AuditEntry["operation"];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    accessContext?: unknown;
  },
): Promise<AuditEntry[]> {
  const all = await kv.list<AuditEntry>(KV.audit);
  let entries = [...all].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (filter?.operation) {
    entries = entries.filter((e) => e.operation === filter.operation);
  }
  if (filter?.dateFrom) {
    const from = new Date(filter.dateFrom).getTime();
    if (Number.isNaN(from)) {
      throw new Error(`Invalid dateFrom: ${filter.dateFrom}`);
    }
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= from);
  }
  if (filter?.dateTo) {
    const to = new Date(filter.dateTo).getTime();
    if (Number.isNaN(to)) {
      throw new Error(`Invalid dateTo: ${filter.dateTo}`);
    }
    entries = entries.filter((e) => new Date(e.timestamp).getTime() <= to);
  }

  const accessContext = lessonAccessContextFromPayload(
    filter?.accessContext,
  );
  if (accessContext.mode === "enforce") {
    const ordinaryEntries = entries.filter(
      (entry) => !isLessonRelatedAuditEntry(entry),
    );
    const lessonEntries = entries.filter(isLessonRelatedAuditEntry);
    if (lessonEntries.length > 0) {
      try {
        const lessons = await kv.list<Lesson>(KV.lessons);
        const lessonIndex = buildLessonAccessIndex(lessons);
        const readableLessonEntries = lessonEntries.filter((entry) => {
          const referencedIds = lessonAuditReferenceIds(entry);
          if (referencedIds.length === 0) return false;
          try {
            return referencedIds.every((id) => {
              const lesson = lessonIndex.get(id);
              return lesson !== undefined &&
                canReadLesson(lesson, accessContext);
            });
          } catch {
            return false;
          }
        });
        const readableEntries = new Set(readableLessonEntries);
        entries = entries.filter(
          (entry) =>
            !isLessonRelatedAuditEntry(entry) ||
            readableEntries.has(entry),
        );
      } catch {
        // An unavailable or malformed authoritative lesson index cannot prove
        // any lesson audit row is readable. Preserve unrelated audit rows.
        entries = ordinaryEntries;
      }
    }
  }

  return entries.slice(0, filter?.limit || 100);
}

function lessonAuditReferenceIds(entry: AuditEntry): string[] {
  const ids = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value === "string" && value.length > 0) ids.add(value);
  };
  if (Array.isArray(entry.targetIds)) {
    for (const id of entry.targetIds) add(id);
  }

  const details =
    entry.details && typeof entry.details === "object"
      ? entry.details
      : undefined;
  if (!details) return [...ids];

  add(details.lessonId);
  add(details.replacementLessonId);
  for (const field of ["lessonIds", "sourceLessonIds"] as const) {
    const values = details[field];
    if (Array.isArray(values)) {
      for (const value of values) add(value);
    }
  }
  for (const field of ["canonicalizedIds", "lifecycleTransitions"] as const) {
    const values = details[field];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        add((value as Record<string, unknown>).lessonId);
      }
    }
  }
  return [...ids];
}

const LESSON_AUDIT_OPERATIONS = new Set<AuditEntry["operation"]>([
  "lesson_save",
  "lesson_recall",
  "lesson_strengthen",
  "lesson_delete",
  "lesson_supersede",
]);

function isLessonRelatedAuditEntry(entry: AuditEntry): boolean {
  if (LESSON_AUDIT_OPERATIONS.has(entry.operation)) return true;
  if (
    typeof entry.functionId === "string" &&
    (entry.functionId.startsWith("mem::lesson-") ||
      entry.functionId.startsWith("mem::import:lessons"))
  ) {
    return true;
  }

  const details =
    entry.details && typeof entry.details === "object"
      ? entry.details
      : undefined;
  if (!details) return false;
  if (
    "lessonId" in details ||
    "lessonIds" in details ||
    "sourceLessonIds" in details ||
    "canonicalizedIds" in details ||
    "lifecycleTransitions" in details
  ) {
    return true;
  }
  const stats = details.stats;
  return Boolean(
    stats &&
      typeof stats === "object" &&
      "lessons" in stats &&
      typeof (stats as Record<string, unknown>).lessons === "number" &&
      (stats as Record<string, number>).lessons > 0,
  );
}
