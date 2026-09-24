import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deriveCrystalAndLessons } from "../src/functions/replay.js";
import { KV } from "../src/state/schema.js";
import type { StateKV } from "../src/state/kv.js";
import type { Lesson, RawObservation } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
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
  } as unknown as StateKV;
}

// Matches LESSON_PATTERNS ("always ..." clause, 20-220 chars).
const ASSISTANT_TEXT =
  "Always run the migration before restarting the worker, or the index rebuild silently drops rows.";

const rawObs = (sessionId: string): RawObservation[] =>
  [
    {
      id: `${sessionId}-1`,
      sessionId,
      timestamp: new Date().toISOString(),
      hookType: "stop",
      assistantResponse: ASSISTANT_TEXT,
    },
  ] as unknown as RawObservation[];

async function importSession(kv: StateKV, sessionId: string): Promise<void> {
  await deriveCrystalAndLessons(kv, sessionId, "proj", rawObs(sessionId), [], undefined);
}

describe("deriveCrystalAndLessons lesson reinforcement", () => {
  it("raises confidence when the same lesson is imported again", async () => {
    const kv = mockKV();

    await importSession(kv, "sess-1");
    const first = (await kv.list<Lesson>(KV.lessons))[0];
    expect(first).toBeDefined();
    expect(first.confidence).toBe(0.4);
    expect(first.reinforcements).toBe(0);

    await importSession(kv, "sess-2");
    const second = (await kv.list<Lesson>(KV.lessons))[0];
    expect(second.id).toBe(first.id);
    expect(second.reinforcements).toBe(1);
    // 0.4 + 0.1 * (1 - 0.4)
    expect(second.confidence).toBeCloseTo(0.46, 10);

    await importSession(kv, "sess-3");
    const third = (await kv.list<Lesson>(KV.lessons))[0];
    expect(third.reinforcements).toBe(2);
    expect(third.confidence).toBeCloseTo(0.514, 10);
  });

  it("keeps confidence and reinforcements in step over many imports", async () => {
    const kv = mockKV();
    for (let i = 0; i < 10; i++) await importSession(kv, `sess-${i}`);
    const lesson = (await kv.list<Lesson>(KV.lessons))[0];
    expect(lesson.reinforcements).toBe(9);
    // 1 - (1 - 0.4) * 0.9 ** 9
    expect(lesson.confidence).toBeCloseTo(1 - 0.6 * 0.9 ** 9, 10);
    expect(lesson.confidence).toBeLessThan(1);
  });
});
