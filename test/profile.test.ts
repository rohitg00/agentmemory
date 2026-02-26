import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import { registerProfileFunction } from "../src/functions/profile.js";
import type {
  CompressedObservation,
  Session,
  ProjectProfile,
} from "../src/types.js";

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

describe("Profile Function", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerProfileFunction(sdk as never, kv as never);

    const session: Session = {
      id: "ses_1",
      project: "my-project",
      cwd: "/tmp/my-project",
      startedAt: "2026-02-01T00:00:00Z",
      status: "completed",
      observationCount: 3,
    };
    await kv.set("mem:sessions", "ses_1", session);

    const obs1: CompressedObservation = {
      id: "obs_1",
      sessionId: "ses_1",
      timestamp: "2026-02-01T10:00:00Z",
      type: "file_edit",
      title: "Edit auth module",
      facts: [],
      narrative: "Auth changes",
      concepts: ["typescript", "authentication"],
      files: ["/project/src/auth.ts", "/project/src/middleware.ts"],
      importance: 8,
    };
    const obs2: CompressedObservation = {
      id: "obs_2",
      sessionId: "ses_1",
      timestamp: "2026-02-01T11:00:00Z",
      type: "file_edit",
      title: "Update database",
      facts: [],
      narrative: "DB changes",
      concepts: ["typescript", "database"],
      files: ["/project/src/db.ts"],
      importance: 6,
    };
    const obs3: CompressedObservation = {
      id: "obs_3",
      sessionId: "ses_1",
      timestamp: "2026-02-01T12:00:00Z",
      type: "error",
      title: "Connection timeout",
      facts: [],
      narrative: "Error occurred",
      concepts: ["error"],
      files: ["/project/src/db.ts"],
      importance: 4,
    };

    await kv.set("mem:obs:ses_1", "obs_1", obs1);
    await kv.set("mem:obs:ses_1", "obs_2", obs2);
    await kv.set("mem:obs:ses_1", "obs_3", obs3);
  });

  it("generates profile with topConcepts sorted by frequency", async () => {
    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile; cached: boolean };

    expect(result.cached).toBe(false);
    expect(result.profile.topConcepts[0].concept).toBe("typescript");
    expect(result.profile.topConcepts[0].frequency).toBe(2);
  });

  it("generates profile with topFiles sorted by frequency", async () => {
    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile };

    expect(result.profile.topFiles[0].file).toBe("/project/src/db.ts");
    expect(result.profile.topFiles[0].frequency).toBe(2);
  });

  it("extracts conventions from file patterns", async () => {
    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile };

    expect(result.profile.conventions).toContain("TypeScript project");
    expect(result.profile.conventions).toContain(
      "Standard src/ directory structure",
    );
  });

  it("returns cached profile if fresh", async () => {
    await sdk.trigger("mem::profile", { project: "my-project" });

    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile; cached: boolean };

    expect(result.cached).toBe(true);
  });

  it("returns null profile for unknown project", async () => {
    const result = (await sdk.trigger("mem::profile", {
      project: "nonexistent",
    })) as { profile: null; reason: string };

    expect(result.profile).toBeNull();
    expect(result.reason).toBe("no_sessions");
  });
});
