import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import {
  addSessionToProjectIndex,
  removeSessionFromProjectIndex,
  getProjectSessionIndex,
  buildProjectSessionIndex,
} from "../src/state/session-index.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: vi.fn(async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    }),
    set: vi.fn(async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    }),
    delete: vi.fn(async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    }),
    list: vi.fn(async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    }),
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  budget?: number;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

function wireContext(kv: ReturnType<typeof mockKV>, budget = 4000) {
  let handler: ContextHandler | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: ContextHandler) => {
      if (id === "mem::context") handler = cb;
    }),
  } as unknown as import("iii-sdk").IIIClient;
  registerContextFunction(sdk, kv as never, budget);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: over.id ?? `ses_${Math.random().toString(36).slice(2)}`,
    project: over.project ?? "/tmp/proj",
    cwd: over.cwd ?? "/tmp/proj",
    startedAt: over.startedAt ?? new Date().toISOString(),
    status: over.status ?? "completed",
    observationCount: over.observationCount ?? 0,
    agentId: over.agentId,
  };
}

describe("project session index — maintenance (kv-access finding 3)", () => {
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    kv = mockKV();
  });

  it("addSessionToProjectIndex creates the index for a new project", async () => {
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00Z",
    });

    const index = await getProjectSessionIndex(kv as never, "proj-a");
    expect(index).toEqual([{ id: "ses_1", startedAt: "2026-01-01T00:00:00Z" }]);
  });

  it("keeps entries sorted most-recent-first and dedups by id", async () => {
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00Z",
    });
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_2",
      startedAt: "2026-01-03T00:00:00Z",
    });
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_1",
      startedAt: "2026-01-05T00:00:00Z",
    });

    const index = await getProjectSessionIndex(kv as never, "proj-a");
    expect(index?.map((e) => e.id)).toEqual(["ses_1", "ses_2"]);
    expect(index?.length).toBe(2);
  });

  it("caps the index at 50 entries, dropping the oldest", async () => {
    for (let i = 0; i < 55; i++) {
      await addSessionToProjectIndex(kv as never, "proj-cap", {
        id: `ses_${i}`,
        startedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      });
    }

    const index = await getProjectSessionIndex(kv as never, "proj-cap");
    expect(index?.length).toBe(50);
    expect(index?.map((e) => e.id)).not.toContain("ses_0");
    expect(index?.map((e) => e.id)).not.toContain("ses_4");
    expect(index?.map((e) => e.id)).toContain("ses_54");
  });

  it("removeSessionFromProjectIndex drops the entry", async () => {
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_1",
      startedAt: "2026-01-01T00:00:00Z",
    });
    await addSessionToProjectIndex(kv as never, "proj-a", {
      id: "ses_2",
      startedAt: "2026-01-02T00:00:00Z",
    });

    await removeSessionFromProjectIndex(kv as never, "proj-a", "ses_1");

    const index = await getProjectSessionIndex(kv as never, "proj-a");
    expect(index?.map((e) => e.id)).toEqual(["ses_2"]);
  });

  it("removeSessionFromProjectIndex is a no-op when no index exists yet", async () => {
    await expect(
      removeSessionFromProjectIndex(kv as never, "proj-never-seen", "ses_x"),
    ).resolves.toBeUndefined();
    expect(await getProjectSessionIndex(kv as never, "proj-never-seen")).toBeNull();
  });

  it("buildProjectSessionIndex sorts and caps a raw session list", () => {
    const entries = buildProjectSessionIndex(
      Array.from({ length: 5 }, (_, i) => ({
        id: `ses_${i}`,
        startedAt: new Date(2026, 0, i + 1).toISOString(),
      })),
    );
    expect(entries.map((e) => e.id)).toEqual([
      "ses_4",
      "ses_3",
      "ses_2",
      "ses_1",
      "ses_0",
    ]);
  });
});

describe("mem::context — uses the project session index (kv-access finding 3)", () => {
  let kv: ReturnType<typeof mockKV>;
  let handler: ContextHandler;

  beforeEach(() => {
    kv = mockKV();
    handler = wireContext(kv);
  });

  it("does not call kv.list(KV.sessions) when the project index already exists", async () => {
    const other = makeSession({
      id: "ses_other",
      project: "/tmp/proj",
      startedAt: "2026-01-01T00:00:00Z",
    });
    await kv.set(KV.sessions, other.id, other);
    await addSessionToProjectIndex(kv as never, "/tmp/proj", {
      id: other.id,
      startedAt: other.startedAt,
    });
    kv.list.mockClear();

    const result = await handler({
      sessionId: "ses_new",
      project: "/tmp/proj",
    });

    expect(
      kv.list.mock.calls.some(([scope]) => scope === KV.sessions),
    ).toBe(false);
    expect(result).toBeDefined();
  });

  it("falls back to a full list and backfills the index when it is missing", async () => {
    const s1 = makeSession({
      id: "ses_1",
      project: "/tmp/proj",
      startedAt: "2026-01-01T00:00:00Z",
    });
    const s2 = makeSession({
      id: "ses_2",
      project: "/tmp/proj",
      startedAt: "2026-01-02T00:00:00Z",
    });
    const otherProject = makeSession({
      id: "ses_other_proj",
      project: "/tmp/other",
      startedAt: "2026-01-03T00:00:00Z",
    });
    await kv.set(KV.sessions, s1.id, s1);
    await kv.set(KV.sessions, s2.id, s2);
    await kv.set(KV.sessions, otherProject.id, otherProject);

    expect(await getProjectSessionIndex(kv as never, "/tmp/proj")).toBeNull();

    await handler({ sessionId: "ses_new", project: "/tmp/proj" });

    expect(
      kv.list.mock.calls.some(([scope]) => scope === KV.sessions),
    ).toBe(true);

    const index = await getProjectSessionIndex(kv as never, "/tmp/proj");
    expect(index?.map((e) => e.id).sort()).toEqual(["ses_1", "ses_2"]);
  });

  it("includes recent sessions from the index in the rendered context", async () => {
    const s1 = makeSession({
      id: "ses_recent",
      project: "/tmp/proj",
      startedAt: "2026-01-01T00:00:00Z",
      observationCount: 3,
    });
    await kv.set(KV.sessions, s1.id, s1);
    await kv.set(KV.observations(s1.id), "obs_1", {
      id: "obs_1",
      sessionId: s1.id,
      title: "index-visible-marker",
      narrative: "did a thing",
      importance: 8,
      type: "task",
    });
    await addSessionToProjectIndex(kv as never, "/tmp/proj", {
      id: s1.id,
      startedAt: s1.startedAt,
    });

    const result = await handler({
      sessionId: "ses_new",
      project: "/tmp/proj",
    });

    expect(result.context).toContain("index-visible-marker");
  });

  it("skips index entries whose session record was since deleted", async () => {
    await addSessionToProjectIndex(kv as never, "/tmp/proj", {
      id: "ses_gone",
      startedAt: "2026-01-01T00:00:00Z",
    });

    const result = await handler({
      sessionId: "ses_new",
      project: "/tmp/proj",
    });

    expect(result).toBeDefined();
    expect(result.context).not.toContain("ses_gone");
  });
});
