import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLessonsFunctions } from "../src/functions/lessons.js";
import type { Lesson } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("Lessons", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerLessonsFunctions(sdk as never, kv as never);
  });

  describe("mem::lesson-save", () => {
    it("creates a lesson with default confidence 0.5", async () => {
      const result = (await sdk.trigger("mem::lesson-save", {
        content: "Always use execFile instead of exec",
        context: "Security best practice",
        project: "/test",
        tags: ["security"],
      })) as { success: boolean; action: string; lesson: Lesson };

      expect(result.success).toBe(true);
      expect(result.action).toBe("created");
      expect(result.lesson.confidence).toBe(0.5);
      expect(result.lesson.content).toBe("Always use execFile instead of exec");
      expect(result.lesson.source).toBe("manual");
      expect(result.lesson.reinforcements).toBe(0);
    });

    it("accepts custom confidence", async () => {
      const result = (await sdk.trigger("mem::lesson-save", {
        content: "Test lesson",
        confidence: 0.8,
      })) as { lesson: Lesson };

      expect(result.lesson.confidence).toBe(0.8);
    });

    it("clamps invalid confidence to default", async () => {
      const result = (await sdk.trigger("mem::lesson-save", {
        content: "Bad confidence",
        confidence: 5.0,
      })) as { lesson: Lesson };

      expect(result.lesson.confidence).toBe(0.5);
    });

    it("strengthens existing lesson on duplicate content", async () => {
      const first = (await sdk.trigger("mem::lesson-save", {
        content: "Duplicate lesson",
      })) as { action: string; lesson: Lesson };

      expect(first.action).toBe("created");
      const originalId = first.lesson.id;

      const second = (await sdk.trigger("mem::lesson-save", {
        content: "Duplicate lesson",
      })) as { action: string; lesson: Lesson };

      expect(second.action).toBe("strengthened");
      expect(second.lesson.id).toBe(originalId);
      expect(second.lesson.reinforcements).toBe(1);
      expect(second.lesson.confidence).toBeGreaterThan(0.5);
    });

    it("rejects empty content", async () => {
      const result = (await sdk.trigger("mem::lesson-save", {
        content: "",
      })) as { success: boolean };

      expect(result.success).toBe(false);
    });

    it("sets crystal source and sourceIds when provided", async () => {
      const result = (await sdk.trigger("mem::lesson-save", {
        content: "Crystal-derived lesson",
        source: "crystal",
        sourceIds: ["crys_123"],
        confidence: 0.6,
      })) as { lesson: Lesson };

      expect(result.lesson.source).toBe("crystal");
      expect(result.lesson.sourceIds).toEqual(["crys_123"]);
      expect(result.lesson.confidence).toBe(0.6);
    });
  });

  describe("mem::lesson-recall", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::lesson-save", {
        content: "Database indexing improves query performance",
        project: "/app",
        tags: ["database"],
        confidence: 0.9,
      });
      await sdk.trigger("mem::lesson-save", {
        content: "Always validate user input at boundaries",
        project: "/app",
        tags: ["security"],
        confidence: 0.3,
      });
      await sdk.trigger("mem::lesson-save", {
        content: "Use TypeScript strict mode for type safety",
        project: "/other",
        tags: ["typescript"],
      });
    });

    it("finds lessons matching query", async () => {
      const result = (await sdk.trigger("mem::lesson-recall", {
        query: "database performance",
      })) as { success: boolean; lessons: Array<Lesson & { score: number }> };

      expect(result.success).toBe(true);
      expect(result.lessons.length).toBeGreaterThan(0);
      expect(result.lessons[0].content).toContain("Database indexing");
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::lesson-recall", {
        query: "type safety typescript",
        project: "/other",
      })) as { lessons: Lesson[] };

      expect(result.lessons.length).toBe(1);
      expect(result.lessons[0].project).toBe("/other");
    });

    it("filters by minConfidence", async () => {
      const result = (await sdk.trigger("mem::lesson-recall", {
        query: "validate input",
        minConfidence: 0.5,
      })) as { lessons: Lesson[] };

      expect(result.lessons.length).toBe(0);
    });

    it("returns empty for no matches", async () => {
      const result = (await sdk.trigger("mem::lesson-recall", {
        query: "xyznonexistent",
      })) as { lessons: Lesson[] };

      expect(result.lessons.length).toBe(0);
    });

    it("rejects empty query", async () => {
      const result = (await sdk.trigger("mem::lesson-recall", {
        query: "",
      })) as { success: boolean };

      expect(result.success).toBe(false);
    });
  });

  describe("mem::lesson-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::lesson-save", { content: "Lesson A", confidence: 0.9, project: "/app" });
      await sdk.trigger("mem::lesson-save", { content: "Lesson B", confidence: 0.3, project: "/app" });
      await sdk.trigger("mem::lesson-save", { content: "Lesson C", confidence: 0.7, source: "crystal" });
    });

    it("lists all lessons sorted by confidence", async () => {
      const result = (await sdk.trigger("mem::lesson-list", {})) as { lessons: Lesson[] };

      expect(result.lessons.length).toBe(3);
      expect(result.lessons[0].confidence).toBe(0.9);
      expect(result.lessons[2].confidence).toBe(0.3);
    });

    it("filters by project", async () => {
      const result = (await sdk.trigger("mem::lesson-list", { project: "/app" })) as { lessons: Lesson[] };
      expect(result.lessons.length).toBe(2);
    });

    it("filters by source", async () => {
      const result = (await sdk.trigger("mem::lesson-list", { source: "crystal" })) as { lessons: Lesson[] };
      expect(result.lessons.length).toBe(1);
    });

    it("filters by minConfidence", async () => {
      const result = (await sdk.trigger("mem::lesson-list", { minConfidence: 0.5 })) as { lessons: Lesson[] };
      expect(result.lessons.length).toBe(2);
    });

    it("respects limit", async () => {
      const result = (await sdk.trigger("mem::lesson-list", { limit: 1 })) as { lessons: Lesson[] };
      expect(result.lessons.length).toBe(1);
    });
  });

  describe("mem::lesson-strengthen", () => {
    it("increases confidence with diminishing returns", async () => {
      const saved = (await sdk.trigger("mem::lesson-save", {
        content: "Strengthen me",
        confidence: 0.5,
      })) as { lesson: Lesson };

      const result = (await sdk.trigger("mem::lesson-strengthen", {
        lessonId: saved.lesson.id,
      })) as { success: boolean; lesson: Lesson };

      expect(result.success).toBe(true);
      expect(result.lesson.reinforcements).toBe(1);
      expect(result.lesson.confidence).toBeCloseTo(0.55, 2);
      expect(result.lesson.lastReinforcedAt).toBeDefined();
    });

    it("caps confidence at 1.0", async () => {
      const saved = (await sdk.trigger("mem::lesson-save", {
        content: "High confidence",
        confidence: 0.95,
      })) as { lesson: Lesson };

      const result = (await sdk.trigger("mem::lesson-strengthen", {
        lessonId: saved.lesson.id,
      })) as { lesson: Lesson };

      expect(result.lesson.confidence).toBeLessThanOrEqual(1.0);
    });

    it("fails for missing lessonId", async () => {
      const result = (await sdk.trigger("mem::lesson-strengthen", {
        lessonId: "nonexistent",
      })) as { success: boolean };

      expect(result.success).toBe(false);
    });
  });

  describe("mem::lesson-decay-sweep", () => {
    it("decays old lessons incrementally", async () => {
      const saved = (await sdk.trigger("mem::lesson-save", {
        content: "Old lesson",
        confidence: 0.8,
      })) as { lesson: Lesson };

      const lessons = await kv.list<Lesson>("mem:lessons");
      const lesson = lessons[0];
      lesson.createdAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      await kv.set("mem:lessons", lesson.id, lesson);

      const result = (await sdk.trigger("mem::lesson-decay-sweep", {})) as {
        decayed: number;
        softDeleted: number;
      };

      expect(result.decayed).toBe(1);

      const after = await kv.get<Lesson>("mem:lessons", lesson.id);
      expect(after!.confidence).toBeLessThan(0.8);
      expect(after!.lastDecayedAt).toBeDefined();
    });

    it("does not decay lessons less than 1 week old", async () => {
      await sdk.trigger("mem::lesson-save", {
        content: "Recent lesson",
        confidence: 0.5,
      });

      const result = (await sdk.trigger("mem::lesson-decay-sweep", {})) as {
        decayed: number;
      };

      expect(result.decayed).toBe(0);
    });

    it("soft-deletes low-confidence unreinforced lessons", async () => {
      const saved = (await sdk.trigger("mem::lesson-save", {
        content: "Weak lesson",
        confidence: 0.12,
      })) as { lesson: Lesson };

      const lesson = await kv.get<Lesson>("mem:lessons", saved.lesson.id);
      lesson!.createdAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
      await kv.set("mem:lessons", lesson!.id, lesson!);

      const result = (await sdk.trigger("mem::lesson-decay-sweep", {})) as {
        softDeleted: number;
      };

      expect(result.softDeleted).toBe(1);

      const after = await kv.get<Lesson>("mem:lessons", saved.lesson.id);
      expect(after!.deleted).toBe(true);
    });

    it("uses lastDecayedAt for incremental delta (not full age)", async () => {
      const saved = (await sdk.trigger("mem::lesson-save", {
        content: "Incremental decay",
        confidence: 0.8,
      })) as { lesson: Lesson };

      const lesson = await kv.get<Lesson>("mem:lessons", saved.lesson.id);
      lesson!.createdAt = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
      lesson!.lastDecayedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      lesson!.confidence = 0.6;
      await kv.set("mem:lessons", lesson!.id, lesson!);

      await sdk.trigger("mem::lesson-decay-sweep", {});

      const after = await kv.get<Lesson>("mem:lessons", saved.lesson.id);
      expect(after!.confidence).toBeCloseTo(0.55, 2);
      expect(after!.confidence).toBeGreaterThan(0.4);
    });
  });
});
