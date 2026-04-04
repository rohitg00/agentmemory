import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV, fingerprintId } from "../state/schema.js";
import type { Lesson } from "../types.js";
import { recordAudit } from "./audit.js";

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
  sdk.registerFunction(
    { id: "mem::lesson-save" },
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
    },
  );

  sdk.registerFunction(
    { id: "mem::lesson-recall" },
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

  sdk.registerFunction(
    { id: "mem::lesson-list" },
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

  sdk.registerFunction(
    { id: "mem::lesson-strengthen" },
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

      try {
        await recordAudit(kv, "lesson_strengthen", "mem::lesson-strengthen", [
          lesson.id,
        ]);
      } catch {}

      return { success: true, lesson };
    },
  );

  sdk.registerFunction(
    { id: "mem::lesson-decay-sweep" },
    async () => {
      const lessons = await kv.list<Lesson>(KV.lessons);
      let decayed = 0;
      let softDeleted = 0;
      const now = Date.now();
      const timestamp = new Date().toISOString();
      const dirty: Lesson[] = [];

      for (const lesson of lessons) {
        if (lesson.deleted) continue;

        const baseline = lesson.lastDecayedAt || lesson.lastReinforcedAt || lesson.createdAt;
        const weeksSinceBaseline =
          (now - new Date(baseline).getTime()) / (1000 * 60 * 60 * 24 * 7);

        if (weeksSinceBaseline < 1) continue;

        const decay = lesson.decayRate * weeksSinceBaseline;
        const newConfidence = Math.max(0.05, lesson.confidence - decay);

        if (newConfidence !== lesson.confidence) {
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
        }
      }

      await Promise.all(dirty.map((l) => kv.set(KV.lessons, l.id, l)));

      return { success: true, decayed, softDeleted, total: lessons.length };
    },
  );
}
