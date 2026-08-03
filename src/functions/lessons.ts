import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Lesson } from "../types.js";
import { recordAudit } from "./audit.js";
import {
  LESSON_SCHEMA_VERSION,
  isLessonListable,
  isLessonRecallable,
  lessonContentFingerprint,
  lessonIdForInput,
  normalizeLesson,
  parseLessonSaveInput,
  sameLessonScope,
  toLessonReadModel,
} from "./lesson-model.js";

const MAX_LESSON_LIST_LIMIT = 500;
const MAX_CORRECTION_REASON_LENGTH = 1000;
const MAX_CORRECTION_ACTOR_LENGTH = 128;

type LessonCorrectionData = {
  lessonId: string;
  reason: string;
  actor?: string;
  project?: string;
  expectedUpdatedAt?: string;
  replacementLessonId?: string;
};

type LessonCorrectionMode = "delete" | "supersede";

function reinforceLesson(lesson: Lesson): void {
  const now = new Date().toISOString();
  lesson.reinforcements++;
  lesson.lastReinforcedAt = now;
  lesson.updatedAt = now;
}

function lessonLockKey(lessonId: string): string {
  return `mem:lesson:${lessonId}`;
}

function withLessonLocks<T>(
  lessonIds: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const orderedIds = [...new Set(lessonIds)].sort();
  const lockNext = (index: number): Promise<T> => {
    if (index >= orderedIds.length) return fn();
    return withKeyedLock(lessonLockKey(orderedIds[index]), () =>
      lockNext(index + 1),
    );
  };
  return lockNext(0);
}

function correctionFailure(code: string, error: string) {
  return { success: false, code, error };
}

async function correctLesson(
  kv: StateKV,
  data: LessonCorrectionData,
  mode: LessonCorrectionMode,
) {
  const lessonId = data.lessonId?.trim();
  const reason = data.reason?.trim();
  const actor = data.actor?.trim() || "unknown";
  const project = data.project?.trim() || undefined;
  const expectedUpdatedAt = data.expectedUpdatedAt?.trim() || undefined;
  const replacementLessonId = data.replacementLessonId?.trim() || undefined;

  if (!lessonId) {
    return correctionFailure("invalid_request", "lessonId is required");
  }
  if (!reason) {
    return correctionFailure("invalid_request", "reason is required");
  }
  if (reason.length > MAX_CORRECTION_REASON_LENGTH) {
    return correctionFailure(
      "invalid_request",
      `reason must be at most ${MAX_CORRECTION_REASON_LENGTH} characters`,
    );
  }
  if (actor.length > MAX_CORRECTION_ACTOR_LENGTH) {
    return correctionFailure(
      "invalid_request",
      `actor must be at most ${MAX_CORRECTION_ACTOR_LENGTH} characters`,
    );
  }
  if (mode === "supersede" && !replacementLessonId) {
    return correctionFailure(
      "invalid_request",
      "replacementLessonId is required",
    );
  }
  if (replacementLessonId === lessonId) {
    return correctionFailure(
      "invalid_request",
      "replacementLessonId must differ from lessonId",
    );
  }

  const lockIds = replacementLessonId
    ? [lessonId, replacementLessonId]
    : [lessonId];
  return withLessonLocks(lockIds, async () => {
    const lesson = await kv.get<Lesson>(KV.lessons, lessonId);
    if (!lesson) {
      return correctionFailure("lesson_not_found", "lesson not found");
    }

    const normalizedLesson = normalizeLesson(lesson);
    if (!isLessonListable(lesson)) {
      const sameCorrection =
        lesson.deleteReason === reason &&
        lesson.supersededByLessonId === replacementLessonId &&
        normalizedLesson.lifecycle ===
          (mode === "supersede" ? "superseded" : "retracted");
      if (sameCorrection) {
        return {
          success: true,
          action:
            mode === "supersede"
              ? "already_superseded"
              : "already_deleted",
          lesson: toLessonReadModel(lesson),
        };
      }
      return correctionFailure(
        "lesson_already_deleted",
        "lesson is already deleted with different correction metadata",
      );
    }

    if (project !== undefined && lesson.project !== project) {
      return correctionFailure(
        "project_mismatch",
        "lesson does not belong to the requested project",
      );
    }
    if (
      expectedUpdatedAt !== undefined &&
      lesson.updatedAt !== expectedUpdatedAt
    ) {
      return correctionFailure(
        "revision_conflict",
        "lesson changed since expectedUpdatedAt",
      );
    }

    if (replacementLessonId) {
      const replacement = await kv.get<Lesson>(
        KV.lessons,
        replacementLessonId,
      );
      if (!replacement) {
        return correctionFailure(
          "replacement_not_found",
          "replacement lesson not found",
        );
      }
      if (!isLessonRecallable(replacement)) {
        return correctionFailure(
          "replacement_not_active",
          "replacement lesson must be active",
        );
      }
      if (!sameLessonScope(replacement, lesson)) {
        return correctionFailure(
          replacement.scope?.scopeId || lesson.scope?.scopeId
            ? "scope_mismatch"
            : "project_mismatch",
          "replacement lesson must belong to the same durable scope",
        );
      }
    }

    const timestamp = new Date().toISOString();
    lesson.deleted = true;
    lesson.deletedAt = timestamp;
    lesson.deletedBy = actor;
    lesson.deleteReason = reason;
    lesson.supersededByLessonId = replacementLessonId;
    lesson.lifecycle =
      mode === "supersede" ? "superseded" : "retracted";
    lesson.updatedAt = timestamp;
    await kv.set(KV.lessons, lesson.id, lesson);

    const operation =
      mode === "supersede" ? "lesson_supersede" : "lesson_delete";
    try {
      await recordAudit(kv, operation, `mem::lesson-${mode}`, [lesson.id], {
        actor,
        reason,
        project: lesson.project,
        expectedUpdatedAt,
        replacementLessonId,
        deletedAt: timestamp,
      });
    } catch {}

    return {
      success: true,
      action: mode === "supersede" ? "superseded" : "deleted",
      lesson: toLessonReadModel(lesson),
    };
  });
}

export function registerLessonsFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::lesson-save", 
    async (data: unknown) => {
      const parsed = parseLessonSaveInput(data);
      if (!parsed.success) {
        return correctionFailure("invalid_request", parsed.error);
      }
      const input = parsed.value;

      const fp = lessonIdForInput(input);
      return withKeyedLock(lessonLockKey(fp), async () => {
        const existing = await kv.get<Lesson>(KV.lessons, fp);

        if (existing && !isLessonListable(existing)) {
          return correctionFailure(
            "lesson_deleted",
            "lesson is superseded or retracted; save corrected evidence as a new lesson",
          );
        }

        if (existing) {
          reinforceLesson(existing);
          if (input.context && !existing.context) {
            existing.context = input.context;
          }
          await kv.set(KV.lessons, existing.id, existing);

          try {
            await recordAudit(
              kv,
              "lesson_strengthen",
              "mem::lesson-save",
              [existing.id],
              { confidenceChanged: false },
            );
          } catch {}

          return {
            success: true,
            action: "strengthened",
            lesson: toLessonReadModel(existing),
          };
        }

        const now = new Date().toISOString();
        const lesson: Lesson = {
          id: fp,
          content: input.content,
          context: input.context,
          confidence: input.confidence ?? 0.5,
          reinforcements: 0,
          source: input.source,
          sourceIds: input.sourceIds,
          project: input.project,
          tags: input.tags,
          createdAt: now,
          updatedAt: now,
          decayRate: 0.05,
          schemaVersion: LESSON_SCHEMA_VERSION,
          mechanismId: input.mechanismId,
          mechanismVersion: input.mechanismVersion,
          mechanismAliases: input.mechanismAliases,
          claim: input.claim,
          claimType: input.claimType,
          evidenceVerdict: input.evidenceVerdict,
          lifecycle: input.lifecycle,
          applicabilityConditions: input.applicabilityConditions,
          nonApplicabilityConditions: input.nonApplicabilityConditions,
          falsificationConditions: input.falsificationConditions,
          structuredFacets: input.structuredFacets,
          evidenceRefs: input.evidenceRefs,
          scope: input.scope,
          sensitivity: input.sensitivity,
          reviewAfter: input.reviewAfter,
          contradictedByLessonIds: input.contradictedByLessonIds,
          contentFingerprint: lessonContentFingerprint(input),
        };

        await kv.set(KV.lessons, lesson.id, lesson);

        try {
          await recordAudit(kv, "lesson_save", "mem::lesson-save", [lesson.id], {
            contentFingerprint: lesson.contentFingerprint,
            evidenceVerdict: lesson.evidenceVerdict,
            lifecycle: lesson.lifecycle,
          });
        } catch {}

        return {
          success: true,
          action: "created",
          lesson: toLessonReadModel(lesson),
        };
      });
    },
  );

  sdk.registerFunction("mem::lesson-recall", 
    async (data: {
      query: string;
      project?: string;
      minConfidence?: number;
      limit?: number;
    }) => {
      if (!data.query?.trim()) {
        return { success: false, error: "query is required" };
      }

      const query = data.query.toLowerCase();
      const minConfidence = data.minConfidence ?? 0.1;
      const limit = data.limit ?? 10;

      const storedLessons = await kv.list<Lesson>(KV.lessons);
      let lessons = storedLessons
        .filter(isLessonRecallable)
        .map((lesson) => toLessonReadModel(lesson));

      lessons = lessons.filter((l) => l.confidence >= minConfidence);

      if (data.project) {
        lessons = lessons.filter((l) => l.project === data.project);
      }

      const scored = lessons
        .map((l) => {
          const facetText = Object.entries(l.structuredFacets)
            .flatMap(([dimension, values]) => [dimension, ...values])
            .join(" ");
          const text = [
            l.content,
            l.context,
            l.claim,
            l.mechanismId,
            ...l.mechanismAliases,
            ...l.applicabilityConditions,
            ...l.nonApplicabilityConditions,
            ...l.falsificationConditions,
            facetText,
            ...l.tags,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const terms = query.split(/\s+/).filter((t) => t.length > 1);
          const matchCount = terms.filter((t) => text.includes(t)).length;
          if (matchCount === 0) return null;

          const relevance = matchCount / terms.length;
          const daysSinceReinforced = l.lastReinforcedAt
            ? (Date.now() - new Date(l.lastReinforcedAt).getTime()) /
              (1000 * 60 * 60 * 24)
            : (Date.now() - new Date(l.createdAt).getTime()) /
              (1000 * 60 * 60 * 24);
          const recencyBoost = 1 / (1 + daysSinceReinforced * 0.01);
          const score = l.confidence * relevance * recencyBoost;

          return { lesson: l, score };
        })
        .filter(Boolean) as Array<{ lesson: Lesson; score: number }>;

      scored.sort((a, b) => b.score - a.score);

      try {
        await recordAudit(kv, "lesson_recall", "mem::lesson-recall", [], {
          query: data.query,
          resultCount: scored.length,
        });
      } catch {}

      return {
        success: true,
        lessons: scored.slice(0, limit).map((s) => ({
          ...s.lesson,
          score: Math.round(s.score * 1000) / 1000,
        })),
      };
    },
  );

  sdk.registerFunction("mem::lesson-list", 
    async (data: {
      project?: string;
      source?: string;
      minConfidence?: number;
      limit?: number;
      offset?: number;
      sortBy?: "confidence" | "recent";
    }) => {
      const requestedLimit = data.limit ?? 50;
      const offset = data.offset ?? 0;
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
        return { success: false, error: "limit must be a positive integer" };
      }
      if (!Number.isInteger(offset) || offset < 0) {
        return {
          success: false,
          error: "offset must be a non-negative integer",
        };
      }
      if (
        data.sortBy !== undefined &&
        data.sortBy !== "confidence" &&
        data.sortBy !== "recent"
      ) {
        return {
          success: false,
          error: "sortBy must be confidence or recent",
        };
      }
      const limit = Math.min(requestedLimit, MAX_LESSON_LIST_LIMIT);
      const minConfidence = data.minConfidence ?? 0;
      const storedLessons = await kv.list<Lesson>(KV.lessons);
      let lessons = storedLessons
        .filter(isLessonListable)
        .map((lesson) => toLessonReadModel(lesson))
        .filter((lesson) => lesson.confidence >= minConfidence);

      if (data.project) {
        lessons = lessons.filter((l) => l.project === data.project);
      }
      if (data.source) {
        lessons = lessons.filter((l) => l.source === data.source);
      }

      lessons.sort(
        data.sortBy === "recent"
          ? (a, b) =>
              lessonTimestampMs(b) - lessonTimestampMs(a) ||
              a.id.localeCompare(b.id)
          : (a, b) =>
              b.confidence - a.confidence || a.id.localeCompare(b.id),
      );

      const total = lessons.length;
      const page = lessons.slice(offset, offset + limit);
      const hasMore = offset + page.length < total;
      return {
        success: true,
        lessons: page,
        total,
        limit,
        offset,
        hasMore,
        nextOffset: hasMore ? offset + page.length : null,
      };
    },
  );

  sdk.registerFunction("mem::lesson-strengthen", 
    async (data: { lessonId: string }) => {
      if (!data.lessonId) {
        return { success: false, error: "lessonId is required" };
      }

      return withKeyedLock(lessonLockKey(data.lessonId), async () => {
        const lesson = await kv.get<Lesson>(KV.lessons, data.lessonId);
        if (!lesson || !isLessonListable(lesson)) {
          return { success: false, error: "lesson not found" };
        }

        reinforceLesson(lesson);

        await kv.set(KV.lessons, lesson.id, lesson);

        try {
          await recordAudit(
            kv,
            "lesson_strengthen",
            "mem::lesson-strengthen",
            [lesson.id],
            { confidenceChanged: false },
          );
        } catch {}

        return { success: true, lesson: toLessonReadModel(lesson) };
      });
    },
  );

  sdk.registerFunction("mem::lesson-delete", async (data: LessonCorrectionData) =>
    correctLesson(kv, data, "delete"),
  );

  sdk.registerFunction(
    "mem::lesson-supersede",
    async (data: LessonCorrectionData) =>
      correctLesson(kv, data, "supersede"),
  );

  sdk.registerFunction("mem::lesson-decay-sweep", 
    async () => {
      const lessons = await kv.list<Lesson>(KV.lessons);
      const now = Date.now();
      const timestamp = new Date().toISOString();
      const outcomes = await Promise.all(
        lessons.map((listedLesson) =>
          withKeyedLock(lessonLockKey(listedLesson.id), async () => {
            const lesson = await kv.get<Lesson>(KV.lessons, listedLesson.id);
            if (!lesson || lesson.deleted) return null;

            if (lesson.schemaVersion === LESSON_SCHEMA_VERSION) {
              return toLessonReadModel(lesson, now).computedFlags.stale
                ? "stale"
                : null;
            }

            const baseline =
              lesson.lastDecayedAt ||
              lesson.lastReinforcedAt ||
              lesson.createdAt;
            const weeksSinceBaseline =
              (now - new Date(baseline).getTime()) /
              (1000 * 60 * 60 * 24 * 7);
            if (weeksSinceBaseline < 1) return null;

            const decay = lesson.decayRate * weeksSinceBaseline;
            const newConfidence = Math.max(
              0.05,
              lesson.confidence - decay,
            );
            if (newConfidence === lesson.confidence) return null;

            const beforeConfidence = lesson.confidence;
            lesson.confidence = Math.round(newConfidence * 1000) / 1000;
            lesson.lastDecayedAt = timestamp;
            lesson.updatedAt = timestamp;
            const softDeleted =
              lesson.confidence <= 0.1 && lesson.reinforcements === 0;
            if (softDeleted) {
              lesson.deleted = true;
              lesson.deletedAt = timestamp;
              lesson.deletedBy = "system";
              lesson.deleteReason = "decay-sweep";
            }

            await kv.set(KV.lessons, lesson.id, lesson);
            try {
              await recordAudit(
                kv,
                softDeleted ? "lesson_delete" : "lesson_strengthen",
                "mem::lesson-decay-sweep",
                [lesson.id],
                {
                  action: softDeleted ? "soft-delete" : "decay",
                  actor: "system",
                  reason: "decay-sweep",
                  before: {
                    confidence: beforeConfidence,
                    deleted: false,
                  },
                  after: {
                    confidence: lesson.confidence,
                    deleted: softDeleted,
                  },
                },
              );
            } catch {}
            return softDeleted ? "soft-delete" : "decay";
          }),
        ),
      );

      const decayed = outcomes.filter((outcome) => outcome === "decay").length;
      const softDeleted = outcomes.filter(
        (outcome) => outcome === "soft-delete",
      ).length;
      const stale = outcomes.filter((outcome) => outcome === "stale").length;

      return {
        success: true,
        decayed,
        softDeleted,
        stale,
        total: lessons.length,
      };
    },
  );
}

function lessonTimestampMs(lesson: Lesson): number {
  const parsed = Date.parse(lesson.updatedAt || lesson.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}
