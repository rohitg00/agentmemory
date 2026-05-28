import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { inferMemoryProjects } from "../src/functions/migrate.js";
import { KV } from "../src/state/schema.js";
import type { Memory, Session } from "../src/types.js";

function makeMockKV() {
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
  };
}

function makeMemory(id: string, sessionIds: string[], project?: string): Memory {
  return {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "bug",
    title: `Memory ${id}`,
    content: `Content for ${id}`,
    concepts: [],
    files: [],
    sessionIds,
    strength: 5,
    version: 1,
    isLatest: true,
    ...(project !== undefined && { project }),
  };
}

function makeSession(id: string, project: string): Session {
  return {
    id,
    project,
    cwd: `/srv/${project}`,
    startedAt: new Date().toISOString(),
    status: "completed",
    observationCount: 0,
  };
}

describe("inferMemoryProjects", () => {
  it("skips memories that already have a project", async () => {
    const kv = makeMockKV();
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", [], "api"));

    const result = await inferMemoryProjects(kv);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.ambiguous).toBe(0);

    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBe("api");
  });

  it("marks a memory ambiguous when it has no sessionIds", async () => {
    const kv = makeMockKV();
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", []));

    const result = await inferMemoryProjects(kv);

    expect(result.ambiguous).toBe(1);
    expect(result.updated).toBe(0);

    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBeUndefined();
  });

  it("marks a memory ambiguous when none of its sessions have a project", async () => {
    const kv = makeMockKV();
    const session: Session = {
      id: "sess_a",
      project: "",
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      status: "completed",
      observationCount: 0,
    };
    await kv.set(KV.sessions, "sess_a", session);
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_a"]));

    const result = await inferMemoryProjects(kv);

    expect(result.ambiguous).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("marks a memory ambiguous when all its sessions are missing from KV", async () => {
    const kv = makeMockKV();
    // Memory references sessions that don't exist (e.g. deleted)
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["ghost_sess_1", "ghost_sess_2"]));

    const result = await inferMemoryProjects(kv);

    expect(result.ambiguous).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("infers project when all sessions belong to the same project", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_1", makeSession("sess_1", "api"));
    await kv.set(KV.sessions, "sess_2", makeSession("sess_2", "api"));
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_1", "sess_2"]));

    const result = await inferMemoryProjects(kv);

    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.ambiguous).toBe(0);

    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBe("api");
  });

  it("infers the majority project when sessions span multiple projects", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_1", makeSession("sess_1", "api"));
    await kv.set(KV.sessions, "sess_2", makeSession("sess_2", "api"));
    await kv.set(KV.sessions, "sess_3", makeSession("sess_3", "web"));
    // api appears 2 times, web 1 time — api wins strict majority
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_1", "sess_2", "sess_3"]));

    const result = await inferMemoryProjects(kv);

    expect(result.updated).toBe(1);
    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBe("api");
  });

  it("marks a memory ambiguous when sessions tie across two projects", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_1", makeSession("sess_1", "api"));
    await kv.set(KV.sessions, "sess_2", makeSession("sess_2", "web"));
    // exact 1-1 tie — no strict majority
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_1", "sess_2"]));

    const result = await inferMemoryProjects(kv);

    expect(result.ambiguous).toBe(1);
    expect(result.updated).toBe(0);

    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBeUndefined();
  });

  it("counts correctly but does not write to KV in dry-run mode", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_1", makeSession("sess_1", "api"));
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_1"]));

    const result = await inferMemoryProjects(kv, true);

    expect(result.updated).toBe(1);

    // KV must not have been written
    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBeUndefined();
  });

  it("handles a mix of already-scoped, updatable, and ambiguous memories in one pass", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_api", makeSession("sess_api", "api"));
    await kv.set(KV.sessions, "sess_web", makeSession("sess_web", "web"));

    // Already scoped
    await kv.set(KV.memories, "mem_scoped", makeMemory("mem_scoped", [], "existing"));
    // Will be updated
    await kv.set(KV.memories, "mem_update", makeMemory("mem_update", ["sess_api"]));
    // No sessionIds — ambiguous
    await kv.set(KV.memories, "mem_no_sess", makeMemory("mem_no_sess", []));
    // Tie — ambiguous
    await kv.set(KV.memories, "mem_tie", makeMemory("mem_tie", ["sess_api", "sess_web"]));

    const result = await inferMemoryProjects(kv);

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.ambiguous).toBe(2);

    const updated = await kv.get<Memory>(KV.memories, "mem_update");
    expect(updated?.project).toBe("api");

    const scoped = await kv.get<Memory>(KV.memories, "mem_scoped");
    expect(scoped?.project).toBe("existing");

    const noSess = await kv.get<Memory>(KV.memories, "mem_no_sess");
    expect(noSess?.project).toBeUndefined();

    const tie = await kv.get<Memory>(KV.memories, "mem_tie");
    expect(tie?.project).toBeUndefined();
  });

  it("ignores missing sessions when voting but still infers if remainder has majority", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_real", makeSession("sess_real", "api"));
    // ghost_sess does not exist in KV — should be silently skipped in voting
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_real", "ghost_sess"]));

    const result = await inferMemoryProjects(kv);

    // Only one vote collected (api), which is a strict majority of 1 project out of 1
    expect(result.updated).toBe(1);
    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBe("api");
  });

  it("is idempotent when run twice in succession", async () => {
    const kv = makeMockKV();
    await kv.set(KV.sessions, "sess_1", makeSession("sess_1", "api"));
    await kv.set(KV.memories, "mem_a", makeMemory("mem_a", ["sess_1"]));

    const first = await inferMemoryProjects(kv);
    expect(first.updated).toBe(1);

    const second = await inferMemoryProjects(kv);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(1);

    const stored = await kv.get<Memory>(KV.memories, "mem_a");
    expect(stored?.project).toBe("api");
  });
});
