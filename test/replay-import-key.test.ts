import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerReplayFunctions } from "../src/functions/replay.js";
import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { KV } from "../src/state/schema.js";
import type { Lesson } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  const setCalls: Array<{ scope: string; key: string | undefined; value: any }> = [];
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      setCalls.push({ scope, key, value });
      if (!store.has(scope)) store.set(scope, new Map());
      // Mirror the engine: a state::set with key=undefined fails. We
      // surface this via setCalls so the test can assert key !== undefined.
      if (key === undefined) {
        throw new Error("missing field `key`");
      }
      store.get(scope)!.set(key, value);
      return value;
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
    getSetCalls: () => setCalls,
  };
}

function mockSdk(kv: ReturnType<typeof mockKV>) {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, handler: Function) => fns.set(id, handler),
    registerTrigger: () => {},
    trigger: async (
      idOrInput: string | { function_id: string; payload?: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : (idOrInput as any).payload;
      const fn = fns.get(id);
      if (!fn) return { success: true };
      return fn(payload);
    },
    _kv: kv,
  } as any;
}

describe("import-jsonl re-key on parsed.sessionId (#775)", () => {
  let tmpRoot: string;

  beforeEach(() => {
    delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
    tmpRoot = mkdtempSync(join(tmpdir(), "replay-import-key-"));
  });

  afterEach(() => {
    delete process.env["AGENTMEMORY_LESSON_ACCESS_MODE"];
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeFixture(
    sessionId: string,
    ts = "2026-04-17T10:00:00.000Z",
    assistantText = "world",
  ) {
    const dir = join(tmpRoot, "proj");
    rmSync(dir, { recursive: true, force: true });
    require("node:fs").mkdirSync(dir, { recursive: true });
    const lines = [
      JSON.stringify({
        type: "user",
        uuid: "u1",
        sessionId,
        timestamp: ts,
        cwd: tmpRoot,
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        sessionId,
        timestamp: ts,
        message: {
          role: "assistant",
          content: [{ type: "text", text: assistantText }],
        },
      }),
    ];
    writeFileSync(join(dir, `${sessionId}.jsonl`), lines.join("\n") + "\n");
  }

  it("re-imports a session whose stored row is missing the `id` field without aborting the batch", async () => {
    writeFixture("sess-no-id");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    // Seed an existing session row that is MISSING `id` — the
    // pre-fix code would re-key on `existing.id` (undefined) and
    // throw `missing field \`key\``, aborting the whole import.
    await kv.set(KV.sessions, "sess-no-id", {
      project: "proj",
      cwd: tmpRoot,
      startedAt: "2026-04-17T09:00:00Z",
      endedAt: "2026-04-17T09:30:00Z",
      status: "completed",
      observationCount: 2,
      tags: [],
    });

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean; imported?: number; error?: string };

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);

    const undefinedKeyWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === undefined);
    expect(undefinedKeyWrites.length).toBe(0);

    const sessionWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === "sess-no-id");
    expect(sessionWrites.length).toBeGreaterThan(0);
    // The handler also backfills the missing id field so future reads
    // are well-formed.
    expect((sessionWrites.at(-1)!.value as any).id).toBe("sess-no-id");
  });

  it("fresh import (no existing row) still writes session keyed by parsed.sessionId", async () => {
    writeFixture("sess-fresh");
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerReplayFunctions(sdk, kv as never);

    const result = (await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    })) as { success: boolean; imported?: number };

    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    const sessionWrites = kv
      .getSetCalls()
      .filter((c) => c.scope === KV.sessions && c.key === "sess-fresh");
    expect(sessionWrites.length).toBe(1);
  });

  it("uses the same canonical lesson identity as save and deduplicates replay lessons", async () => {
    const content = "Always validate imported sessions before replay.";
    writeFixture(
      "sess-canonical-lesson",
      "2026-04-17T10:00:00.000Z",
      content,
    );
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerLessonsFunctions(sdk, kv as never);
    registerReplayFunctions(sdk, kv as never);
    const saved = (await sdk.trigger("mem::lesson-save", {
      content,
      project: "proj",
    })) as { lesson: Lesson };

    const result = await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    });
    const lessons = await kv.list<Lesson>(KV.lessons);

    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      id: saved.lesson.id,
      sourceIds: ["sess-canonical-lesson"],
      tags: ["auto-import"],
      reinforcements: 1,
    });
  });

  it("preserves a retracted tombstone when replay rediscovers the same canonical lesson", async () => {
    const content = "Always preserve terminal lesson tombstones during replay.";
    writeFixture(
      "sess-terminal-lesson",
      "2026-04-17T10:00:00.000Z",
      content,
    );
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerLessonsFunctions(sdk, kv as never);
    registerReplayFunctions(sdk, kv as never);
    const saved = (await sdk.trigger("mem::lesson-save", {
      content,
      project: "proj",
    })) as { lesson: Lesson };
    await sdk.trigger("mem::lesson-delete", {
      lessonId: saved.lesson.id,
      reason: "The replayed evidence was invalid",
      actor: "reviewer",
    });

    const result = await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    });
    const lessons = await kv.list<Lesson>(KV.lessons);

    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      id: saved.lesson.id,
      lifecycle: "retracted",
      deleted: true,
      deletedBy: "reviewer",
      deleteReason: "The replayed evidence was invalid",
    });
  });

  it("finds a legacy replay lesson by canonical identity without creating a duplicate", async () => {
    const content = "Never trust a replay path without validation.";
    writeFixture(
      "sess-legacy-lesson",
      "2026-04-17T10:00:00.000Z",
      content,
    );
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerLessonsFunctions(sdk, kv as never);
    registerReplayFunctions(sdk, kv as never);
    const legacy: Lesson = {
      id: "lesson_legacy_replay_id",
      content,
      context: "legacy replay",
      confidence: 0.4,
      reinforcements: 0,
      source: "consolidation",
      sourceIds: ["old-session"],
      project: "proj",
      tags: ["auto-import"],
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
      decayRate: 0.05,
    };
    await kv.set(KV.lessons, legacy.id, legacy);

    await sdk.trigger("mem::replay::import-jsonl", { path: tmpRoot });
    const save = (await sdk.trigger("mem::lesson-save", {
      content,
      project: "proj",
    })) as { success: boolean; action: string; lesson: Lesson };
    const lessons = await kv.list<Lesson>(KV.lessons);

    expect(save).toMatchObject({
      success: true,
      action: "strengthened",
      lesson: { id: legacy.id },
    });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      id: legacy.id,
      identityKind: "legacy-prose",
      sourceIds: ["old-session", "sess-legacy-lesson"],
      reinforcements: 2,
    });
    expect(lessons[0].idAliases).toEqual([
      expect.stringMatching(/^lsn_[a-f0-9]{16}$/),
    ]);
  });

  it("does not mutate lessons directly when enforce mode has no caller authority", async () => {
    const content =
      "Always reject replay-derived lessons without caller authority.";
    writeFixture(
      "sess-enforce-no-authority",
      "2026-04-17T10:00:00.000Z",
      content,
    );
    const kv = mockKV();
    const sdk = mockSdk(kv);
    registerLessonsFunctions(sdk, kv as never);
    registerReplayFunctions(sdk, kv as never);
    const saved = (await sdk.trigger("mem::lesson-save", {
      content,
      project: "proj",
    })) as { lesson: Lesson };

    process.env["AGENTMEMORY_LESSON_ACCESS_MODE"] = "enforce";
    const result = await sdk.trigger("mem::replay::import-jsonl", {
      path: tmpRoot,
    });
    const stored = await kv.get<Lesson>(KV.lessons, saved.lesson.id);

    expect(result).toMatchObject({ success: true, imported: 1 });
    expect(stored).toMatchObject({
      id: saved.lesson.id,
      reinforcements: 0,
      sourceIds: [],
    });
  });
});
