import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerTimelineFunction } from "../src/functions/timeline.js";
import type { CompressedObservation, Session, TimelineEntry } from "../src/types.js";

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
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
  };
}

function makeObs(
  id: string,
  timestamp: string,
  title: string,
): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp,
    type: "file_edit",
    title,
    facts: [],
    narrative: title,
    concepts: [],
    files: [],
    importance: 5,
  };
}

describe("Timeline Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerTimelineFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "my-project",
      cwd: "/tmp",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 5,
    };
    await kv.set("mem:sessions", "ses_1", session);

    await kv.set("mem:obs:ses_1", "obs_1", makeObs("obs_1", "2026-02-01T10:00:00Z", "First edit"));
    await kv.set("mem:obs:ses_1", "obs_2", makeObs("obs_2", "2026-02-01T11:00:00Z", "Second edit"));
    await kv.set("mem:obs:ses_1", "obs_3", makeObs("obs_3", "2026-02-01T12:00:00Z", "Third edit"));
    await kv.set("mem:obs:ses_1", "obs_4", makeObs("obs_4", "2026-02-01T13:00:00Z", "Fourth edit"));
    await kv.set("mem:obs:ses_1", "obs_5", makeObs("obs_5", "2026-02-01T14:00:00Z", "Fifth edit"));
  });

  it("anchors by ISO date and returns surrounding observations", async () => {
    const result = (await sdk.trigger("mem::timeline", {
      anchor: "2026-02-01T12:00:00Z",
      before: 2,
      after: 2,
    })) as { entries: TimelineEntry[] };

    expect(result.entries.length).toBe(5);
    expect(result.entries[0].observation.id).toBe("obs_1");
    expect(result.entries[4].observation.id).toBe("obs_5");
  });

  it("relativePosition is correct relative to anchor", async () => {
    const result = (await sdk.trigger("mem::timeline", {
      anchor: "2026-02-01T12:00:00Z",
      before: 2,
      after: 2,
    })) as { entries: TimelineEntry[] };

    const positions = result.entries.map((e) => e.relativePosition);
    expect(positions).toEqual([-2, -1, 0, 1, 2]);
  });

  it("respects before and after limits", async () => {
    const result = (await sdk.trigger("mem::timeline", {
      anchor: "2026-02-01T12:00:00Z",
      before: 1,
      after: 1,
    })) as { entries: TimelineEntry[] };

    expect(result.entries.length).toBe(3);
    expect(result.entries[0].observation.id).toBe("obs_2");
    expect(result.entries[2].observation.id).toBe("obs_4");
  });

  it("returns empty entries when no sessions exist for project", async () => {
    const result = (await sdk.trigger("mem::timeline", {
      anchor: "2026-02-01T12:00:00Z",
      project: "nonexistent-project",
    })) as { entries: TimelineEntry[] };

    expect(result.entries.length).toBe(0);
  });

  it("handles keyword anchor by finding matching observation", async () => {
    const result = (await sdk.trigger("mem::timeline", {
      anchor: "Third",
      before: 1,
      after: 1,
    })) as { entries: TimelineEntry[] };

    expect(result.entries.length).toBe(3);
    const titles = result.entries.map((e) => e.observation.title);
    expect(titles).toContain("Third edit");
  });
});
