import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/keyed-mutex.js", () => ({
  withKeyedLock: <T>(_key: string, fn: () => Promise<T>) => fn(),
}));

vi.mock("../src/functions/image-refs.js", () => ({
  decrementImageRef: vi.fn(async () => {}),
}));

import {
  deleteFacetsForTargets,
  registerFacetsFunction,
} from "../src/functions/facets.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerRememberFunction } from "../src/functions/remember.js";
import { setIndexPersistence } from "../src/functions/search.js";
import {
  indexObservationSession,
  unindexObservationSession,
} from "../src/state/obs-index.js";
import { KV } from "../src/state/schema.js";
import type { Facet, Lesson } from "../src/types.js";

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
    registerFunction: (
      idOrOpts: string | { id: string },
      handler: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeFacet(
  id: string,
  targetId: string,
  targetType: Facet["targetType"] = "memory",
): Facet {
  return {
    id,
    targetId,
    targetType,
    dimension: "probe",
    value: "value",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("facet cleanup on lesson and observation deletes", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    setIndexPersistence(null);
    registerFacetsFunction(sdk as never, kv as never);
    registerLessonsFunctions(sdk as never, kv as never);
    registerRememberFunction(sdk as never, kv as never);
  });

  afterEach(() => {
    setIndexPersistence(null);
  });

  async function saveLesson(
    content: string,
    confidence?: number,
  ): Promise<Lesson> {
    const result = (await sdk.trigger("mem::lesson-save", {
      content,
      ...(confidence !== undefined ? { confidence } : {}),
    })) as { lesson: Lesson };
    return result.lesson;
  }

  async function facetIds(): Promise<string[]> {
    const all = await kv.list<Facet>(KV.facets);
    return all.map((f) => f.id).sort();
  }

  it("lesson-delete removes facets that point at the deleted lesson", async () => {
    const lesson = await saveLesson("Delete me");
    const other = await saveLesson("Keep me");
    // Lessons are tagged through mem::facet-tag as targetType "memory"
    // because the tag function does not accept a "lesson" target type.
    await kv.set(KV.facets, "fct_lesson", makeFacet("fct_lesson", lesson.id));
    await kv.set(KV.facets, "fct_other", makeFacet("fct_other", other.id));

    const result = (await sdk.trigger("mem::lesson-delete", {
      lessonId: lesson.id,
    })) as { success: boolean };
    expect(result.success).toBe(true);

    expect(await facetIds()).toEqual(["fct_other"]);
  });

  it("lesson-decay-sweep removes facets only for soft-deleted lessons", async () => {
    const weak = await saveLesson("Weak lesson", 0.12);
    const strong = await saveLesson("Strong lesson", 0.8);
    for (const [lesson, ageDays] of [
      [weak, 21],
      [strong, 14],
    ] as Array<[Lesson, number]>) {
      const stored = await kv.get<Lesson>(KV.lessons, lesson.id);
      stored!.createdAt = new Date(
        Date.now() - ageDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      await kv.set(KV.lessons, lesson.id, stored!);
    }
    await kv.set(KV.facets, "fct_weak", makeFacet("fct_weak", weak.id));
    await kv.set(KV.facets, "fct_strong", makeFacet("fct_strong", strong.id));

    const result = (await sdk.trigger("mem::lesson-decay-sweep", {})) as {
      softDeleted: number;
      decayed: number;
    };
    expect(result.softDeleted).toBe(1);
    expect(result.decayed).toBe(1);

    expect(await facetIds()).toEqual(["fct_strong"]);
  });

  it("forget with observationIds removes facets for the forgotten observations", async () => {
    await kv.set(KV.observations("sess_1"), "obs_a", { id: "obs_a" });
    await kv.set(KV.observations("sess_1"), "obs_b", { id: "obs_b" });
    await indexObservationSession(kv as never, "obs_a", "sess_1");
    await indexObservationSession(kv as never, "obs_b", "sess_1");
    await kv.set(
      KV.facets,
      "fct_a",
      makeFacet("fct_a", "obs_a", "observation"),
    );
    await kv.set(
      KV.facets,
      "fct_b",
      makeFacet("fct_b", "obs_b", "observation"),
    );

    const result = (await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_1", observationIds: ["obs_a"] },
    })) as { success: boolean; deleted: number };
    expect(result.deleted).toBe(1);

    expect(await facetIds()).toEqual(["fct_b"]);
  });

  it("whole-session forget removes facets for every forgotten observation", async () => {
    await kv.set(KV.sessions, "sess_1", { id: "sess_1", project: "p" });
    await kv.set(KV.observations("sess_1"), "obs_a", { id: "obs_a" });
    await kv.set(KV.observations("sess_1"), "obs_b", { id: "obs_b" });
    await indexObservationSession(kv as never, "obs_a", "sess_1");
    await indexObservationSession(kv as never, "obs_b", "sess_1");
    await kv.set(
      KV.facets,
      "fct_a",
      makeFacet("fct_a", "obs_a", "observation"),
    );
    await kv.set(
      KV.facets,
      "fct_b",
      makeFacet("fct_b", "obs_b", "observation"),
    );

    const result = (await sdk.trigger({
      function_id: "mem::forget",
      payload: { sessionId: "sess_1" },
    })) as { success: boolean; deleted: number };
    expect(result.success).toBe(true);

    expect(await facetIds()).toEqual([]);
  });

  it("deleteFacetsForTargets keeps facets whose target is still live", async () => {
    const lesson = await saveLesson("Still live");
    await kv.set(KV.observations("sess_1"), "obs_live", { id: "obs_live" });
    await indexObservationSession(kv as never, "obs_live", "sess_1");
    await kv.set(KV.facets, "fct_lesson", makeFacet("fct_lesson", lesson.id));
    await kv.set(
      KV.facets,
      "fct_obs",
      makeFacet("fct_obs", "obs_live", "observation"),
    );

    await deleteFacetsForTargets(kv as never, [lesson.id]);
    await deleteFacetsForTargets(kv as never, ["obs_live"], {
      targetTypes: ["observation"],
    });

    expect(await facetIds()).toEqual(["fct_lesson", "fct_obs"]);
  });

  it("deleteFacetsForTargets leaves observation facets alone unless the caller opts in", async () => {
    await kv.set(
      KV.facets,
      "fct_obs",
      makeFacet("fct_obs", "obs_gone", "observation"),
    );

    await deleteFacetsForTargets(kv as never, ["obs_gone"]);

    expect(await facetIds()).toEqual(["fct_obs"]);
  });

  it("deleteFacetsForTargets removes observation facets for a deleted observation when opted in", async () => {
    await kv.set(KV.observations("sess_1"), "obs_a", { id: "obs_a" });
    await indexObservationSession(kv as never, "obs_a", "sess_1");
    await kv.set(
      KV.facets,
      "fct_a",
      makeFacet("fct_a", "obs_a", "observation"),
    );

    await kv.delete(KV.observations("sess_1"), "obs_a");
    await unindexObservationSession(kv as never, "obs_a");
    await deleteFacetsForTargets(kv as never, ["obs_a"], {
      targetTypes: ["observation"],
    });

    expect(await facetIds()).toEqual([]);
  });
});
