import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
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
