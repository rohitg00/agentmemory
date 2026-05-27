import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerTeamFunction } from "../src/functions/team.js";
import type { Memory, TeamConfig, TeamSharedItem, TeamProfile } from "../src/types.js";

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

const teamConfig: TeamConfig = {
  teamId: "test-team",
  userId: "user-1",
  mode: "shared" as const,
};

const testMemory: Memory = {
  id: "mem_1",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  type: "pattern",
  title: "Auth pattern",
  content: "Always validate tokens",
  concepts: ["auth", "security"],
  files: ["src/auth.ts"],
  sessionIds: ["ses_1"],
  strength: 5,
  version: 1,
  isLatest: true,
};

describe("Team Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerTeamFunction(sdk as never, kv as never, teamConfig);
    await kv.set("mem:memories", "mem_1", testMemory);
  });

  it("team-share stores item in team namespace", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(result.success).toBe(true);
    expect(result.sharedItem.sharedBy).toBe("user-1");
    expect(result.sharedItem.type).toBe("memory");
    expect(result.sharedItem.visibility).toBe("shared");

    const items = await kv.list<TeamSharedItem>("mem:team:test-team:shared");
    expect(items.length).toBe(1);
  });

  it("team-share fails for missing itemId", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemType: "memory",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });

  it("team-feed returns shared items sorted by date", async () => {
    await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
    });

    const mem2: Memory = { ...testMemory, id: "mem_2", title: "Second pattern" };
    await kv.set("mem:memories", "mem_2", mem2);

    await new Promise((r) => setTimeout(r, 10));
    await sdk.trigger("mem::team-share", {
      itemId: "mem_2",
      itemType: "memory",
    });

    const result = (await sdk.trigger("mem::team-feed", {})) as {
      items: TeamSharedItem[];
      total: number;
    };

    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
    expect(
      new Date(result.items[0].sharedAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(result.items[1].sharedAt).getTime());
  });

  it("team-profile aggregates concepts and files", async () => {
    await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "pattern",
    });

    const result = (await sdk.trigger("mem::team-profile", {})) as TeamProfile;

    expect(result.teamId).toBe("test-team");
    expect(result.members).toContain("user-1");
    expect(result.totalSharedItems).toBe(1);
    expect(result.topConcepts.length).toBeGreaterThan(0);
    expect(result.topConcepts.some((c) => c.concept === "auth")).toBe(true);
    expect(result.topFiles.some((f) => f.file === "src/auth.ts")).toBe(true);
  });

  it("team-share fails when item not found in KV", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemId: "nonexistent",
      itemType: "memory",
    })) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("Team Functions — per-request userId override", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerTeamFunction(sdk as never, kv as never, teamConfig);
    await kv.set("mem:memories", "mem_1", testMemory);
  });

  it("team-share with userId override writes with correct user", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
      userId: "user-2",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(result.success).toBe(true);
    expect(result.sharedItem.sharedBy).toBe("user-2");

    // Writes to server-level team namespace
    const items = await kv.list<TeamSharedItem>("mem:team:test-team:shared");
    expect(items.length).toBe(1);
  });

  it("team-share without userId uses config default", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(result.success).toBe(true);
    expect(result.sharedItem.sharedBy).toBe("user-1");
  });

  it("empty string userId falls back to config default", async () => {
    const result = (await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
      userId: "  ",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(result.success).toBe(true);
    expect(result.sharedItem.sharedBy).toBe("user-1");
  });

  it("team-profile shows userId override in members", async () => {
    await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "pattern",
      userId: "mama",
    });

    const result = (await sdk.trigger("mem::team-profile", {})) as TeamProfile;

    expect(result.teamId).toBe("test-team");
    expect(result.members).toContain("mama");
    expect(result.totalSharedItems).toBe(1);
  });

  it("different userIds appear as distinct members", async () => {
    await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
    });

    const mem2: Memory = { ...testMemory, id: "mem_2", title: "Second" };
    await kv.set("mem:memories", "mem_2", mem2);

    await sdk.trigger("mem::team-share", {
      itemId: "mem_2",
      itemType: "memory",
      userId: "mama",
    });

    const result = (await sdk.trigger("mem::team-profile", {})) as TeamProfile;

    expect(result.members).toContain("user-1");
    expect(result.members).toContain("mama");
    expect(result.totalSharedItems).toBe(2);
  });
});

describe("Team Functions — TEAM_MODE=private filtering", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  const privateConfig: TeamConfig = {
    teamId: "test-team",
    userId: "user-1",
    mode: "private",
  };

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerTeamFunction(sdk as never, kv as never, privateConfig);
    await kv.set("mem:memories", "mem_1", testMemory);

    // Share as user-1
    await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
    });

    // Try to share as mama — in private mode, forces sharedBy = config.userId
    const mem2: Memory = { ...testMemory, id: "mem_2", title: "Second" };
    await kv.set("mem:memories", "mem_2", mem2);
    await sdk.trigger("mem::team-share", {
      itemId: "mem_2",
      itemType: "memory",
      userId: "mama",
    });
  });

  it("team-share forces sharedBy to config.userId in private mode", async () => {
    const items = await kv.list<TeamSharedItem>("mem:team:test-team:shared");
    // Both items shared as "user-1" — userId override is ignored
    expect(items.every((i) => i.sharedBy === "user-1")).toBe(true);
    expect(items.length).toBe(2);
  });

  it("team-feed always shows only config.userId items in private mode", async () => {
    // Even passing userId: "mama" in body — ignored in private mode
    const result = (await sdk.trigger("mem::team-feed", {
      userId: "mama",
    })) as { items: TeamSharedItem[]; total: number };

    expect(result.items.length).toBe(2);
    expect(result.items.every((i) => i.sharedBy === "user-1")).toBe(true);
  });

  it("team-feed without body userId also shows config.userId items", async () => {
    const result = (await sdk.trigger("mem::team-feed", {})) as {
      items: TeamSharedItem[];
      total: number;
    };

    expect(result.items.length).toBe(2);
    expect(result.items.every((i) => i.sharedBy === "user-1")).toBe(true);
  });

  it("team-profile always shows config.userId profile in private mode", async () => {
    // Even passing userId: "mama" — ignored in private mode
    const result = (await sdk.trigger("mem::team-profile", {
      userId: "mama",
    })) as TeamProfile;

    expect(result.members).toEqual(["user-1"]);
    expect(result.totalSharedItems).toBe(2);
  });

  it("prevents impersonation in private mode", async () => {
    // Verify that team-share with userId: "mama" still writes as "user-1"
    const shareResult = (await sdk.trigger("mem::team-share", {
      itemId: "mem_1",
      itemType: "memory",
      userId: "admin",
    })) as { success: boolean; sharedItem: TeamSharedItem };

    expect(shareResult.success).toBe(true);
    expect(shareResult.sharedItem.sharedBy).toBe("user-1");

    // Only user-1 items visible, not "admin"
    const feedResult = (await sdk.trigger("mem::team-feed", {})) as {
      items: TeamSharedItem[];
    };
    expect(feedResult.items.every((i) => i.sharedBy === "user-1")).toBe(true);
  });
});
