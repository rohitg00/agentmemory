import { describe, it, expect, vi } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { registerPatternsFunction } from "../src/functions/patterns.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function session(index: number, project = "proj"): Session {
  return {
    id: `ses_${String(index).padStart(4, "0")}`,
    project,
    cwd: "/tmp",
    startedAt: new Date(2026, 0, 1 + index).toISOString(),
    status: "completed",
    observationCount: 1,
  };
}

function observation(id: string, files: string[]): CompressedObservation {
  return {
    id,
    sessionId: "unused",
    timestamp: "2026-01-01T00:00:00Z",
    type: "file_edit",
    title: "edit",
    facts: [],
    narrative: "n",
    concepts: [],
    files,
    importance: 5,
  };
}

type PatternsResult = {
  patterns: Array<{ files: string[]; frequency: number }>;
  sessionsInScope: number;
  sessionsProcessed: number;
  sessionsSkipped: string[];
  sessionLimit: number;
  observationsScanned: number;
};

async function setup() {
  const sdk = mockSdk();
  const kv = mockKV();
  registerPatternsFunction(sdk as never, kv as never);
  return { sdk, kv };
}

async function seedSessions(
  kv: ReturnType<typeof mockKV>,
  count: number,
  observationsPerSession: number,
) {
  for (let i = 0; i < count; i++) {
    const s = session(i);
    await kv.set(KV.sessions, s.id, s);
    for (let j = 0; j < observationsPerSession; j++) {
      await kv.set(
        KV.observations(s.id),
        `obs_${s.id}_${j}`,
        observation(`obs_${s.id}_${j}`, [`fileA_${s.id}.ts`, `fileB_${s.id}.ts`]),
      );
    }
  }
}

describe("mem::patterns session bound", () => {
  it("defaults to the 50 most recent sessions when no limit is given", async () => {
    const { sdk, kv } = await setup();
    await seedSessions(kv, 60, 1);

    const result = (await sdk.trigger("mem::patterns", {})) as PatternsResult;

    expect(result.sessionLimit).toBe(50);
    expect(result.sessionsInScope).toBe(50);
    expect(result.sessionsProcessed).toBe(50);
  });

  it("honors an explicit limit and scans the most recent sessions, not the oldest", async () => {
    const { sdk, kv } = await setup();
    // Sessions 0-2 are the oldest and share a file pair that would form a
    // co_change pattern (needs 3+ co-occurrences) if they were scanned.
    // Sessions 3-9 are newer and touch no files, so they never contribute
    // to that pattern. limit: 3 must select the 3 newest sessions (7, 8,
    // 9), which have no files, so the shared-old-session pattern must not
    // appear in the result.
    for (let i = 0; i < 3; i++) {
      const s = session(i);
      await kv.set(KV.sessions, s.id, s);
      await kv.set(
        KV.observations(s.id),
        `obs_${s.id}`,
        observation(`obs_${s.id}`, ["hot_a.ts", "hot_b.ts"]),
      );
    }
    for (let i = 3; i < 10; i++) {
      const s = session(i);
      await kv.set(KV.sessions, s.id, s);
      await kv.set(
        KV.observations(s.id),
        `obs_${s.id}`,
        observation(`obs_${s.id}`, []),
      );
    }

    const result = (await sdk.trigger("mem::patterns", {
      limit: 3,
    })) as PatternsResult;

    expect(result.sessionLimit).toBe(3);
    expect(result.sessionsInScope).toBe(3);
    expect(result.sessionsProcessed).toBe(3);
    expect(
      result.patterns.some((p) => p.files.includes("hot_a.ts")),
    ).toBe(false);
  });

  it("clamps an out-of-range limit to 500", async () => {
    const { sdk, kv } = await setup();
    await seedSessions(kv, 5, 0);

    const result = (await sdk.trigger("mem::patterns", {
      limit: 1_000_000,
    })) as PatternsResult;

    expect(result.sessionLimit).toBe(500);
    expect(result.sessionsInScope).toBe(5);
  });

  it("does not floor a positive fractional limit down to zero sessions", async () => {
    const { sdk, kv } = await setup();
    await seedSessions(kv, 5, 0);

    const result = (await sdk.trigger("mem::patterns", {
      limit: 0.5,
    })) as PatternsResult;

    expect(result.sessionLimit).toBeGreaterThanOrEqual(1);
    expect(result.sessionsInScope).toBeGreaterThan(0);
  });

  it("applies the project filter before the recency limit", async () => {
    const { sdk, kv } = await setup();
    for (let i = 0; i < 5; i++) {
      const s = session(i, "alpha");
      await kv.set(KV.sessions, s.id, s);
    }
    for (let i = 5; i < 10; i++) {
      const s = session(i, "beta");
      await kv.set(KV.sessions, s.id, s);
    }

    const result = (await sdk.trigger("mem::patterns", {
      project: "alpha",
      limit: 50,
    })) as PatternsResult;

    expect(result.sessionsInScope).toBe(5);
  });

  it("stops scanning early once MAX_OBSERVATIONS_SCANNED is crossed, even inside the session limit", async () => {
    const { sdk, kv } = await setup();
    const totalSessions = 11;
    const obsPerSession = 501;
    await seedSessions(kv, totalSessions, obsPerSession);

    const result = (await sdk.trigger("mem::patterns", {
      limit: 50,
    })) as PatternsResult;

    expect(result.sessionsInScope).toBe(totalSessions);
    expect(result.sessionsProcessed).toBeLessThan(totalSessions);
    expect(result.observationsScanned).toBeGreaterThanOrEqual(5_000);
    expect(result.observationsScanned).toBeLessThan(
      totalSessions * obsPerSession,
    );
  });

  it("caps work at the budget when a single session holds more observations than the budget", async () => {
    const { sdk, kv } = await setup();
    await seedSessions(kv, 1, 6_000);

    const result = (await sdk.trigger("mem::patterns", {
      limit: 50,
    })) as PatternsResult;

    expect(result.sessionsProcessed).toBe(1);
    expect(result.observationsScanned).toBe(5_000);
  });

  it("skips a session whose observationCount exceeds the remaining budget instead of listing it", async () => {
    const { sdk, kv } = await setup();

    const huge = session(0);
    huge.observationCount = 6_000;
    await kv.set(KV.sessions, huge.id, huge);
    await kv.set(
      KV.observations(huge.id),
      `obs_${huge.id}_0`,
      observation(`obs_${huge.id}_0`, ["huge.ts"]),
    );

    const small = session(1);
    small.observationCount = 1;
    await kv.set(KV.sessions, small.id, small);
    await kv.set(
      KV.observations(small.id),
      `obs_${small.id}_0`,
      observation(`obs_${small.id}_0`, ["small.ts"]),
    );

    const listSpy = vi.spyOn(kv, "list");

    const result = (await sdk.trigger("mem::patterns", {})) as PatternsResult;

    expect(result.sessionsSkipped).toEqual([huge.id]);
    expect(result.sessionsProcessed).toBe(1);
    expect(
      listSpy.mock.calls.some((c) => c[0] === KV.observations(huge.id)),
    ).toBe(false);
  });

  it("does not throw when mem::patterns is invoked with no payload", async () => {
    const { sdk, kv } = await setup();
    await seedSessions(kv, 2, 1);

    const result = (await sdk.trigger("mem::patterns", undefined)) as PatternsResult;

    expect(result.sessionLimit).toBe(50);
    expect(result.sessionsInScope).toBe(2);
    expect(result.sessionsSkipped).toEqual([]);
  });
});
