import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, fingerprintId } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import type { Lesson } from "../types.js";
import { recordAudit } from "./audit.js";

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
  lesson.confidence = Math.min(
    1.0,
    lesson.confidence + 0.1 * (1 - lesson.confidence),
  );
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

    if (lesson.deleted) {
      const sameCorrection =
        lesson.deleteReason === reason &&
        lesson.supersededByLessonId === replacementLessonId;
      if (sameCorrection) {
        return {
          success: true,
          action:
            mode === "supersede"
              ? "already_superseded"
              : "already_deleted",
          lesson,
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
      if (!replacement || replacement.deleted) {
        return correctionFailure(
          "replacement_not_found",
          "replacement lesson not found",
        );
      }
      if (replacement.project !== lesson.project) {
        return correctionFailure(
          "project_mismatch",
          "replacement lesson must belong to the same project",
        );
      }
    }

    const timestamp = new Date().toISOString();
    lesson.deleted = true;
    lesson.deletedAt = timestamp;
    lesson.deletedBy = actor;
    lesson.deleteReason = reason;
    lesson.supersededByLessonId = replacementLessonId;
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
      lesson,
    };
  });
}

export function registerLessonsFunctions(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::lesson-save", 
    async (data: {
      content: string;
      context?: string;
      confidence?: number;
      project?: string;
      tags?: string[];
      source?: "crystal" | "manual" | "consolidation";
      sourceIds?: string[];
    }) => {
      if (!data.content?.trim()) {
        return { success: false, error: "content is required" };
      }

      const fp = fingerprintId("lsn", data.content.trim().toLowerCase());
      return withKeyedLock(lessonLockKey(fp), async () => {
        const existing = await kv.get<Lesson>(KV.lessons, fp);

        if (existing?.deleted) {
          return correctionFailure(
            "lesson_deleted",
            "lesson is deleted; save corrected content as a new lesson",
          );
        }

        if (existing) {
          reinforceLesson(existing);
          if (data.context && !existing.context) {
            existing.context = data.context;
          }
          await kv.set(KV.lessons, existing.id, existing);

          try {
            await recordAudit(kv, "lesson_strengthen", "mem::lesson-save", [
              existing.id,
            ]);
          } catch {}

          return {
            success: true,
            action: "strengthened",
            lesson: existing,
          };
        }

        const confidence =
          typeof data.confidence === "number" &&
          data.confidence >= 0 &&
          data.confidence <= 1
            ? data.confidence
            : 0.5;

        const now = new Date().toISOString();
        const lesson: Lesson = {
          id: fp,
          content: data.content.trim(),
          context: data.context?.trim() || "",
          confidence,
          reinforcements: 0,
          source: data.source || "manual",
          sourceIds: data.sourceIds || [],
          project: data.project,
          tags: data.tags || [],
          createdAt: now,
          updatedAt: now,
          decayRate: 0.05,
        };

        await kv.set(KV.lessons, lesson.id, lesson);

        try {
          await recordAudit(kv, "lesson_save", "mem::lesson-save", [lesson.id]);
        } catch {}

        return { success: true, action: "created", lesson };
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

      let lessons = await kv.list<Lesson>(KV.lessons);

      lessons = lessons.filter(
        (l) => !l.deleted && l.confidence >= minConfidence,
      );

      if (data.project) {
        lessons = lessons.filter((l) => l.project === data.project);
      }

      const scored = lessons
        .map((l) => {
          const text = `${l.content} ${l.context} ${l.tags.join(" ")}`.toLowerCase();
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
      let lessons = await kv.list<Lesson>(KV.lessons);

      lessons = lessons.filter(
        (l) => !l.deleted && l.confidence >= minConfidence,
      );

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
        if (!lesson || lesson.deleted) {
          return { success: false, error: "lesson not found" };
        }

        reinforceLesson(lesson);

        await kv.set(KV.lessons, lesson.id, lesson);

        try {
          await recordAudit(kv, "lesson_strengthen", "mem::lesson-strengthen", [
            lesson.id,
          ]);
        } catch {}

        return { success: true, lesson };
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

      return { success: true, decayed, softDeleted, total: lessons.length };
    },
  );
}

function lessonTimestampMs(lesson: Lesson): number {
  const parsed = Date.parse(lesson.updatedAt || lesson.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}
