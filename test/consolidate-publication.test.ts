import { afterEach, describe, expect, it, vi } from "vitest";
import { registerConsolidateFunction } from "../src/functions/consolidate.js";
import { KV } from "../src/state/schema.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";
import type { CompressedObservation, Memory, MemoryProvider, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("../src/functions/audit.js", () => ({ safeAudit: vi.fn() }));

function fixture() {
  const rows = new Map<string, Map<string, unknown>>();
  const kv = {
    get: async <T>(scope: string, id: string): Promise<T | null> =>
      structuredClone(rows.get(scope)?.get(id) as T ?? null),
    list: async <T>(scope: string): Promise<T[]> =>
      structuredClone([...rows.get(scope)?.values() ?? []] as T[]),
    set: vi.fn(async <T>(scope: string, id: string, value: T): Promise<T> => {
      if (!rows.has(scope)) rows.set(scope, new Map());
      rows.get(scope)!.set(id, structuredClone(value));
      return value;
    }),
    delete: vi.fn(async (scope: string, id: string) => { rows.get(scope)?.delete(id); }),
  };
  const functions = new Map<string, (data: unknown) => Promise<unknown>>();
  const sdk = { registerFunction: (id: string, handler: (data: unknown) => Promise<unknown>) => functions.set(id, handler) };
  const compress = vi.fn(async () => xml("Shared title"));
  registerConsolidateFunction(sdk as never, kv as never, { compress } as unknown as MemoryProvider);
  const run = (project = "app") => functions.get("mem::consolidate")!({ project, minObservations: 1 });
  const memories = () => kv.list<Memory>(KV.memories);
  return { kv, compress, run, memories };
}

function xml(title: string) {
  return `<memory><type>fact</type><title>${title}</title><content>Independent content</content><concepts><concept>auth</concept></concepts><files></files><strength>8</strength></memory>`;
}

async function seed(f: ReturnType<typeof fixture>, sessionId = "session-a", concept = "auth", project = "app") {
  const session: Session = { id: sessionId, project, cwd: "/synthetic", startedAt: "2026-01-01T00:00:00Z", status: "completed", observationCount: 3 };
  await f.kv.set(KV.sessions, sessionId, session);
  for (let i = 0; i < 3; i++) {
    const id = `${sessionId}-${concept}-${i}`;
    const observation: CompressedObservation = {
      id, sessionId, timestamp: session.startedAt, type: "decision", title: `${concept} ${i}`,
      narrative: `Evidence ${i}`, facts: [], concepts: [concept], files: [], importance: 8,
    };
    await f.kv.set(KV.observations(sessionId), id, observation);
  }
}

function memory(id: string, extra: Partial<Memory> = {}): Memory {
  return {
    id, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", type: "fact",
    title: "Shared title", content: "Previous content", concepts: [], files: [], sessionIds: [],
    strength: 7, version: 1, isLatest: true, project: "app", ...extra,
  };
}

afterEach(() => vi.useRealTimers());

describe("consolidation publication", () => {
  it("publishes overlapping concurrent runs once even when model titles differ", async () => {
    const f = fixture();
    await seed(f);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let started = 0;
    f.compress.mockImplementation(async () => {
      const title = `Title ${++started}`;
      if (started === 2) release();
      await barrier;
      return xml(title);
    });
    const results = await Promise.all([f.run(), f.run()]);
    expect(results.map((r) => (r as { consolidated: number }).consolidated).sort()).toEqual([0, 1]);
    expect(await f.memories()).toHaveLength(1);
    expect(f.compress).toHaveBeenCalledTimes(2);
  });

  it("uses the current latest version for multiple groups within one run", async () => {
    const f = fixture();
    await seed(f, "session-a", "auth");
    await seed(f, "session-a", "tokens");
    await f.kv.set(KV.memories, "old", memory("old", { isLatest: false }));
    await f.kv.set(KV.memories, "current", memory("current", { version: 2, parentId: "old", supersedes: ["old"] }));
    expect(await f.run()).toMatchObject({ consolidated: 2 });
    const rows = await f.memories();
    const latest = rows.filter((m) => m.isLatest !== false);
    expect(latest).toHaveLength(1);
    expect(latest[0].version).toBe(4);
    expect(latest[0].supersedes).toHaveLength(3);
    expect(latest[0].supersedes).toContain("current");
  });

  it.each(["delete", "edit", "move-project", "move-agent"])("discards model output after source changes: %s", async (change) => {
    const f = fixture();
    await seed(f);
    f.compress.mockImplementation(async () => {
      if (change === "delete") {
        await f.kv.delete(KV.observations("session-a"), "session-a-auth-0");
      } else if (change === "edit") {
        const row = await f.kv.get<CompressedObservation>(KV.observations("session-a"), "session-a-auth-0");
        await f.kv.set(KV.observations("session-a"), row!.id, { ...row, narrative: "Changed evidence" });
      } else {
        const session = await f.kv.get<Session>(KV.sessions, "session-a");
        await f.kv.set(KV.sessions, "session-a", { ...session,
          ...(change === "move-project" ? { project: "other" } : { agentId: "other-agent" }),
        });
      }
      return xml("Stale model result");
    });
    expect(await f.run()).toMatchObject({ consolidated: 0 });
    expect(await f.memories()).toHaveLength(0);
  });

  it.each(["session-a", "session-b"])("holds source locks through publication before a writer changes %s", async (sessionId) => {
    const f = fixture();
    await seed(f, "session-b");
    await seed(f, "session-a");
    let entered!: () => void;
    let release!: () => void;
    const publicationEntered = new Promise<void>((resolve) => { entered = resolve; });
    const publicationBarrier = new Promise<void>((resolve) => { release = resolve; });
    const list = f.kv.list;
    f.kv.list = async <T>(scope: string): Promise<T[]> => {
      if (scope === KV.memories) {
        entered();
        await publicationBarrier;
      }
      return list<T>(scope);
    };
    const publication = f.run();
    await publicationEntered;
    let writerStarted = false;
    const writer = withKeyedLock(`obs:${sessionId}`, async () => {
      writerStarted = true;
      await f.kv.delete(KV.observations(sessionId), `${sessionId}-auth-0`);
    });
    try {
      await Promise.resolve();
      expect(writerStarted).toBe(false);
    } finally {
      release();
      await Promise.all([publication, writer]);
    }
    expect(await publication).toMatchObject({ consolidated: 1 });
    expect(writerStarted).toBe(true);
    expect(await f.memories()).toHaveLength(1);
    expect(await f.kv.get(KV.observations(sessionId), `${sessionId}-auth-0`)).toBeNull();
  });

  it("does not deduplicate equal observation IDs from different sessions", async () => {
    const f = fixture();
    await seed(f);
    await f.kv.set(KV.memories, "elsewhere", memory("elsewhere", {
      sessionIds: ["another-session"], sourceObservationIds: ["session-a-auth-0", "session-a-auth-1", "session-a-auth-2"],
    }));
    expect(await f.run()).toMatchObject({ consolidated: 1 });
    expect((await f.memories()).filter((m) => m.isLatest !== false)).toHaveLength(1);
  });

  it("does not deduplicate another project's matching provenance", async () => {
    const f = fixture();
    await seed(f);
    await f.kv.set(KV.memories, "elsewhere", memory("elsewhere", {
      project: "other", sessionIds: ["session-a"], sourceObservationIds: ["session-a-auth-0", "session-a-auth-1", "session-a-auth-2"],
    }));
    expect(await f.run()).toMatchObject({ consolidated: 1 });
    expect((await f.memories()).filter((m) => m.isLatest !== false)).toHaveLength(2);
  });

  it("preserves the previous latest memory when successor creation fails", async () => {
    const f = fixture();
    await seed(f);
    const previous = memory("previous");
    await f.kv.set(KV.memories, previous.id, previous);
    const write = f.kv.set.getMockImplementation()!;
    f.kv.set.mockImplementation(async (scope, id, value) => {
      if (scope === KV.memories && id !== previous.id) throw new Error("storage unavailable");
      return write(scope, id, value);
    });
    expect(await f.run()).toMatchObject({ consolidated: 0 });
    expect(await f.memories()).toEqual([previous]);
  });

  it("confirms a committed successor after its write acknowledgement fails", async () => {
    const f = fixture();
    await seed(f);
    await f.kv.set(KV.memories, "previous", memory("previous"));
    const write = f.kv.set.getMockImplementation()!;
    f.kv.set.mockImplementation(async (scope, id, value) => {
      await write(scope, id, value);
      if (scope === KV.memories && id !== "previous") throw new Error("lost acknowledgement");
      return value;
    });
    expect(await f.run()).toMatchObject({ consolidated: 1 });
    const rows = await f.memories();
    expect(rows.filter((m) => m.isLatest !== false)).toHaveLength(1);
    expect(rows.find((m) => m.id === "previous")?.isLatest).toBe(false);
  });

  it("repairs an interrupted publication before evolving changed evidence", async () => {
    const f = fixture();
    await seed(f);
    await f.kv.set(KV.memories, "previous", memory("previous"));
    await f.kv.set(KV.memories, "committed", memory("committed", {
      version: 2, parentId: "previous", supersedes: ["previous"],
      sourceObservationIds: ["older-source"], sessionIds: ["session-a"],
    }));
    expect(await f.run()).toMatchObject({ consolidated: 1 });
    const rows = await f.memories();
    const latest = rows.filter((m) => m.isLatest !== false);
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ version: 3, parentId: "committed" });
  });

  it("does not repair ambiguous siblings or unrelated parent references", async () => {
    const f = fixture();
    await seed(f);
    for (const row of [memory("parent"),
      memory("child-one", { version: 2, parentId: "parent", supersedes: ["parent"] }),
      memory("child-two", { version: 2, parentId: "parent", supersedes: ["parent"] }),
      memory("other", { title: "Other title" }),
      memory("unrelated", { title: "Another title", version: 2, parentId: "other", supersedes: ["other"] }),
    ]) await f.kv.set(KV.memories, row.id, row);
    f.compress.mockResolvedValue(xml("New independent title"));
    await f.run();
    expect((await f.memories()).filter((m) => m.isLatest !== false)).toHaveLength(6);
  });

  it.each([false, true])("rolls back a failed predecessor demotion (write committed: %s)", async (committed) => {
    const f = fixture();
    await seed(f);
    const previous = memory("previous");
    await f.kv.set(KV.memories, previous.id, previous);
    const write = f.kv.set.getMockImplementation()!;
    f.kv.set.mockImplementation(async (scope, id, value) => {
      if (scope === KV.memories && id === previous.id && (value as Memory).isLatest === false) {
        if (committed) await write(scope, id, value);
        throw new Error("acknowledgement failed");
      }
      return write(scope, id, value);
    });
    expect(await f.run()).toMatchObject({ consolidated: 0 });
    expect(await f.memories()).toEqual([previous]);
  });

  it("keeps the successor if restoring the predecessor also fails", async () => {
    const f = fixture();
    await seed(f);
    await f.kv.set(KV.memories, "previous", memory("previous"));
    const write = f.kv.set.getMockImplementation()!;
    f.kv.set.mockImplementation(async (scope, id, value) => {
      if (scope === KV.memories && id === "previous") {
        if ((value as Memory).isLatest === false) await write(scope, id, value);
        throw new Error("storage unavailable");
      }
      return write(scope, id, value);
    });
    await f.run();
    const latest = (await f.memories()).filter((m) => m.isLatest !== false);
    expect(latest).toHaveLength(1);
    expect(latest[0].parentId).toBe("previous");
    expect(f.kv.delete).not.toHaveBeenCalled();
  });

  it("limits failed provider attempts and clears every timeout", async () => {
    vi.useFakeTimers();
    const f = fixture();
    for (let i = 0; i < 15; i++) await seed(f, "session-a", `concept-${i}`);
    f.compress.mockRejectedValue(new Error("provider unavailable"));
    expect(await f.run()).toMatchObject({ consolidated: 0 });
    expect(f.compress).toHaveBeenCalledTimes(10);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timeout after a valid or malformed response", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await seed(f);
    await f.run();
    expect(vi.getTimerCount()).toBe(0);
    f.compress.mockResolvedValue("not XML");
    await f.run();
    expect(vi.getTimerCount()).toBe(0);
  });
});
