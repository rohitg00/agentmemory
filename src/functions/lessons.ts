import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, fingerprintId } from "../state/schema.js";
import type { Lesson } from "../types.js";
import { SearchIndex } from "../state/search-index.js";
import { lessonToObservation } from "../state/memory-utils.js";
import { recordAudit } from "./audit.js";

// Dedicated BM25 index for lessons, with the full records cached
// alongside it. Recall previously listed every lesson from KV and
// substring-matched per query — O(corpus) per call with no term
// weighting. Index and record cache are built lazily from one KV list
// (the same cost a single recall used to pay) and kept current
// incrementally on save/delete/decay. Confidence x recency reranking
// stays exactly as before — the index only replaces the relevance term,
// and the record cache keeps recall at zero KV round-trips.
let lessonIndex: SearchIndex | null = null;
const lessonRecords = new Map<string, Lesson>();
let lessonIndexBuild: Promise<void> | null = null;
let lessonIndexGeneration = 0;

export function resetLessonIndex(): void {
  lessonIndexGeneration++;
  lessonIndex = null;
  lessonRecords.clear();
}

function noteLessonMutation(): void {
  if (!lessonIndex && lessonIndexBuild) resetLessonIndex();
}

async function ensureLessonIndex(kv: StateKV): Promise<SearchIndex> {
  if (lessonIndex) return lessonIndex;
  if (!lessonIndexBuild) {
    const generation = lessonIndexGeneration;
    lessonIndexBuild = (async () => {
      const idx = new SearchIndex();
      const all = await kv.list<Lesson>(KV.lessons);
      if (generation !== lessonIndexGeneration) return;
      for (const l of all) {
        if (!l.deleted) {
          idx.add(lessonToObservation(l));
          lessonRecords.set(l.id, l);
        }
      }
      lessonIndex = idx;
    })().finally(() => {
      lessonIndexBuild = null;
    });
  }
  await lessonIndexBuild;
  return lessonIndex ?? ensureLessonIndex(kv);
}

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
      const existing = await kv.get<Lesson>(KV.lessons, fp);

      if (existing && !existing.deleted) {
        reinforceLesson(existing);
        let indexedTextChanged = false;
        if (data.context && !existing.context) {
          existing.context = data.context;
          indexedTextChanged = true;
        }
        await kv.set(KV.lessons, existing.id, existing);
        lessonRecords.set(existing.id, existing);
        if (indexedTextChanged && lessonIndex) {
          lessonIndex.remove(existing.id);
          lessonIndex.add(lessonToObservation(existing));
        }
        noteLessonMutation();

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
      lessonRecords.set(lesson.id, lesson);
      if (lessonIndex) lessonIndex.add(lessonToObservation(lesson));
      noteLessonMutation();

      try {
        await recordAudit(kv, "lesson_save", "mem::lesson-save", [lesson.id]);
      } catch {}

      return { success: true, action: "created", lesson };
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

      const minConfidence = data.minConfidence ?? 0.1;
      const limit = data.limit ?? 10;

      const idx = await ensureLessonIndex(kv);
      const filtering = !!data.project || minConfidence > 0.1;
      const fetchLimit = filtering
        ? Math.max(limit * 10, 100)
        : Math.max(limit * 5, 50);
      const hits = idx.search(data.query, fetchLimit);
      const maxHit = hits.length > 0 ? hits[0].score : 0;

      const scored: Array<{ lesson: Lesson; score: number }> = [];
      for (let i = 0; i < hits.length; i++) {
        const l = lessonRecords.get(hits[i].obsId);
        if (!l || l.deleted || l.confidence < minConfidence) continue;
        if (data.project && l.project !== data.project) continue;

        const relevance = maxHit > 0 ? hits[i].score / maxHit : 0;
        const daysSinceReinforced = l.lastReinforcedAt
          ? (Date.now() - new Date(l.lastReinforcedAt).getTime()) /
            (1000 * 60 * 60 * 24)
          : (Date.now() - new Date(l.createdAt).getTime()) /
            (1000 * 60 * 60 * 24);
        const recencyBoost = 1 / (1 + daysSinceReinforced * 0.01);
        scored.push({ lesson: l, score: l.confidence * relevance * recencyBoost });
      }

      scored.sort(
        (a, b) =>
          b.score - a.score ||
          (a.lesson.id < b.lesson.id ? -1 : a.lesson.id > b.lesson.id ? 1 : 0),
      );

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
    }) => {
      const limit = data.limit ?? 50;
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

      lessons.sort((a, b) => b.confidence - a.confidence);

      return { success: true, lessons: lessons.slice(0, limit) };
    },
  );

  sdk.registerFunction("mem::lesson-strengthen", 
    async (data: { lessonId: string }) => {
      if (!data.lessonId) {
        return { success: false, error: "lessonId is required" };
      }

      const lesson = await kv.get<Lesson>(KV.lessons, data.lessonId);
      if (!lesson || lesson.deleted) {
        return { success: false, error: "lesson not found" };
      }

      reinforceLesson(lesson);

      await kv.set(KV.lessons, lesson.id, lesson);
      lessonRecords.set(lesson.id, lesson);
      noteLessonMutation();

      try {
        await recordAudit(kv, "lesson_strengthen", "mem::lesson-strengthen", [
          lesson.id,
        ]);
      } catch {}

      return { success: true, lesson };
    },
  );

  sdk.registerFunction("mem::lesson-delete",
    async (data: { lessonId: string }) => {
      if (!data.lessonId) {
        return { success: false, error: "lessonId is required" };
      }

      const lesson = await kv.get<Lesson>(KV.lessons, data.lessonId);
      if (!lesson || lesson.deleted) {
        return { success: false, error: "lesson not found" };
      }

      lesson.deleted = true;
      lesson.updatedAt = new Date().toISOString();

      await kv.set(KV.lessons, lesson.id, lesson);
      lessonRecords.delete(lesson.id);
      if (lessonIndex) lessonIndex.remove(lesson.id);
      noteLessonMutation();

      try {
        await recordAudit(kv, "lesson_delete", "mem::lesson-delete", [
          lesson.id,
        ]);
      } catch {}

      return { success: true, lesson };
    },
  );

  sdk.registerFunction("mem::lesson-decay-sweep", 
    async () => {
      const lessons = await kv.list<Lesson>(KV.lessons);
      let decayed = 0;
      let softDeleted = 0;
      const now = Date.now();
      const timestamp = new Date().toISOString();
      const dirty: Lesson[] = [];
      const auditEvents: Array<{
        id: string;
        action: "decay" | "soft-delete";
        beforeConfidence: number;
        afterConfidence: number;
        beforeDeleted: boolean;
        afterDeleted: boolean;
      }> = [];

      for (const lesson of lessons) {
        if (lesson.deleted) continue;

        const baseline = lesson.lastDecayedAt || lesson.lastReinforcedAt || lesson.createdAt;
        const weeksSinceBaseline =
          (now - new Date(baseline).getTime()) / (1000 * 60 * 60 * 24 * 7);

        if (weeksSinceBaseline < 1) continue;

        const decay = lesson.decayRate * weeksSinceBaseline;
        const newConfidence = Math.max(0.05, lesson.confidence - decay);

        if (newConfidence !== lesson.confidence) {
          const beforeConfidence = lesson.confidence;
          const beforeDeleted = !!lesson.deleted;
          lesson.confidence = Math.round(newConfidence * 1000) / 1000;
          lesson.lastDecayedAt = timestamp;
          lesson.updatedAt = timestamp;

          if (lesson.confidence <= 0.1 && lesson.reinforcements === 0) {
            lesson.deleted = true;
            softDeleted++;
          } else {
            decayed++;
          }

          dirty.push(lesson);
          auditEvents.push({
            id: lesson.id,
            action: lesson.deleted ? "soft-delete" : "decay",
            beforeConfidence,
            afterConfidence: lesson.confidence,
            beforeDeleted,
            afterDeleted: !!lesson.deleted,
          });
        }
      }

      await Promise.all(dirty.map((l) => kv.set(KV.lessons, l.id, l)));
      for (const l of dirty) {
        if (l.deleted) {
          lessonRecords.delete(l.id);
          if (lessonIndex) lessonIndex.remove(l.id);
        } else {
          lessonRecords.set(l.id, l);
        }
      }
      if (dirty.length > 0) noteLessonMutation();
      await Promise.all(
        auditEvents.map((event) =>
          recordAudit(kv, "lesson_strengthen", "mem::lesson-decay-sweep", [event.id], {
            action: event.action,
            actor: "system",
            reason: "decay-sweep",
            before: {
              confidence: event.beforeConfidence,
              deleted: event.beforeDeleted,
            },
            after: {
              confidence: event.afterConfidence,
              deleted: event.afterDeleted,
            },
          }),
        ),
      );

      return { success: true, decayed, softDeleted, total: lessons.length };
    },
  );
}
