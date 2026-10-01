import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
    store,
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

  it("counts concepts from the project's latest memories", async () => {
    await kv.set("mem:memories", "mem_1", {
      id: "mem_1",
      project: "my-project",
      concepts: ["caching", "typescript"],
      isLatest: true,
    });
    await kv.set("mem:memories", "mem_2", {
      id: "mem_2",
      project: "my-project",
      concepts: ["caching"],
      isLatest: false,
    });
    await kv.set("mem:memories", "mem_3", {
      id: "mem_3",
      project: "other-project",
      concepts: ["caching"],
      isLatest: true,
    });

    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile };

    const concepts = Object.fromEntries(
      result.profile.topConcepts.map((c) => [c.concept, c.frequency]),
    );
    expect(concepts["typescript"]).toBe(3);
    expect(concepts["caching"]).toBe(1);
  });

  it("does not write an audit entry when it builds a profile", async () => {
    await sdk.trigger("mem::profile", { project: "my-project", refresh: true });

    const auditScopes = Array.from(kv.store.keys()).filter((scope) =>
      scope.startsWith("mem:audit"),
    );
    expect(auditScopes).toEqual([]);
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

  it("drops search paths and patterns that older observations recorded as files", async () => {
    await kv.set("mem:obs:ses_1", "obs_4", {
      id: "obs_4",
      sessionId: "ses_1",
      timestamp: "2026-02-01T13:00:00Z",
      type: "search",
      title: "Grep",
      facts: [],
      narrative: "search",
      concepts: [],
      files: ["/tmp/my-project", "/tmp/my-project/", "computeTotal", "web-app", "src/**/*.ts", "/project/src/components", "Dockerfile", "/project/.env"],
      importance: 3,
    });

    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
      refresh: true,
    })) as { profile: ProjectProfile };

    expect(result.profile.topFiles.map((f) => f.file).sort()).toEqual([
      "/project/.env",
      "/project/src/auth.ts",
      "/project/src/db.ts",
      "/project/src/middleware.ts",
      "Dockerfile",
    ]);
  });

  it("cleans a cached profile built before search paths were filtered", async () => {
    await kv.set("mem:profiles", "my-project", {
      project: "my-project",
      updatedAt: new Date().toISOString(),
      topConcepts: [],
      topFiles: [
        { file: "web-app", frequency: 5 },
        { file: "computeTotal", frequency: 5 },
        { file: "src/api/orders.ts", frequency: 4 },
      ],
      conventions: ["TypeScript project"],
      commonErrors: [],
      recentActivity: [],
      sessionCount: 1,
      totalObservations: 3,
    });

    const result = (await sdk.trigger("mem::profile", {
      project: "my-project",
    })) as { profile: ProjectProfile; cached: boolean };

    expect(result.cached).toBe(true);
    expect(result.profile.topFiles).toEqual([{ file: "src/api/orders.ts", frequency: 4 }]);
  });

  it("returns null profile for unknown project", async () => {
    const result = (await sdk.trigger("mem::profile", {
      project: "nonexistent",
    })) as { profile: null; reason: string };

    expect(result.profile).toBeNull();
    expect(result.reason).toBe("no_sessions");
  });
});
