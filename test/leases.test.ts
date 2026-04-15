import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLeasesFunction } from "../src/functions/leases.js";
import type { Action, Lease } from "../src/types.js";

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

function makeAction(
  id: string,
  status: Action["status"] = "pending",
): Action {
  return {
    id,
    title: `Action ${id}`,
    description: `Description for ${id}`,
    status,
    priority: 5,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    createdBy: "agent-setup",
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
  };
}

describe("Lease Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerLeasesFunction(sdk as never, kv as never);

    await kv.set("mem:actions", "act_1", makeAction("act_1", "pending"));
    await kv.set("mem:actions", "act_2", makeAction("act_2", "done"));
    await kv.set("mem:actions", "act_3", makeAction("act_3", "cancelled"));
    await kv.set("mem:actions", "act_4", makeAction("act_4", "pending"));
  });

  describe("mem::lease-acquire", () => {
    it("acquires a lease for a valid action", async () => {
      const result = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease; renewed: boolean };

      expect(result.success).toBe(true);
      expect(result.lease.actionId).toBe("act_1");
      expect(result.lease.agentId).toBe("agent-a");
      expect(result.lease.status).toBe("active");
      expect(result.renewed).toBe(false);
      expect(result.lease.id).toMatch(/^lse_/);
    });

    it("returns error when actionId or agentId is missing", async () => {
      const r1 = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "",
      })) as { success: boolean; error: string };
      expect(r1.success).toBe(false);
      expect(r1.error).toBe("actionId and agentId are required");

      const r2 = (await sdk.trigger("mem::lease-acquire", {
        actionId: "",
        agentId: "agent-a",
      })) as { success: boolean; error: string };
      expect(r2.success).toBe(false);
      expect(r2.error).toBe("actionId and agentId are required");
    });

    it("returns error for nonexistent action", async () => {
      const result = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_nonexistent",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("action not found");
    });

    it("returns error for done action", async () => {
      const result = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_2",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("action already completed");
    });

    it("returns error for cancelled action", async () => {
      const result = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_3",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("action already completed");
    });

    it("returns existing lease when same agent already holds it", async () => {
      const first = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      const second = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease; renewed: boolean; message: string };

      expect(second.success).toBe(true);
      expect(second.lease.id).toBe(first.lease.id);
      expect(second.renewed).toBe(false);
      expect(second.message).toBe("Already holding this lease");
    });

    it("returns conflict error when different agent holds the lease", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      const result = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-b",
      })) as { success: boolean; error: string; heldBy: string; expiresAt: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("action already leased");
      expect(result.heldBy).toBe("agent-a");
      expect(result.expiresAt).toBeDefined();
    });

    it("sets action status to active after acquire", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("active");
      expect(action!.assignedTo).toBe("agent-a");
    });
  });

  describe("mem::lease-release", () => {
    it("releases an active lease", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      const result = (await sdk.trigger("mem::lease-release", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; released: boolean };

      expect(result.success).toBe(true);
      expect(result.released).toBe(true);
    });

    it("sets action to done when result is provided", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      await sdk.trigger("mem::lease-release", {
        actionId: "act_1",
        agentId: "agent-a",
        result: "completed successfully",
      });

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("done");
      expect(action!.result).toBe("completed successfully");
      expect(action!.assignedTo).toBeUndefined();
    });

    it("sets action to pending when no result is provided", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      await sdk.trigger("mem::lease-release", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("pending");
      expect(action!.assignedTo).toBeUndefined();
    });

    it("returns error when no active lease exists for agent", async () => {
      const result = (await sdk.trigger("mem::lease-release", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("no active lease found for this agent");
    });

    it("returns error when actionId or agentId is missing", async () => {
      const result = (await sdk.trigger("mem::lease-release", {
        actionId: "",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("actionId and agentId are required");
    });
  });

  describe("mem::lease-renew", () => {
    it("renews an active non-expired lease", async () => {
      const acquired = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      const originalExpiry = acquired.lease.expiresAt;

      const result = (await sdk.trigger("mem::lease-renew", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      expect(result.success).toBe(true);
      expect(result.lease.renewedAt).toBeDefined();
      expect(
        new Date(result.lease.expiresAt).getTime(),
      ).toBeGreaterThanOrEqual(new Date(originalExpiry).getTime());
    });

    it("returns error when lease is expired", async () => {
      const acquired = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      acquired.lease.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:leases", acquired.lease.id, acquired.lease);

      const result = (await sdk.trigger("mem::lease-renew", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("no active (non-expired) lease to renew");
    });

    it("returns error when actionId or agentId is missing", async () => {
      const result = (await sdk.trigger("mem::lease-renew", {
        actionId: "",
        agentId: "agent-a",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("actionId and agentId are required");
    });
  });

  describe("mem::lease-cleanup", () => {
    it("expires active leases past their expiresAt and resets actions to pending", async () => {
      const acquired = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      acquired.lease.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:leases", acquired.lease.id, acquired.lease);

      const result = (await sdk.trigger("mem::lease-cleanup", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(1);

      const lease = await kv.get<Lease>("mem:leases", acquired.lease.id);
      expect(lease!.status).toBe("expired");

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("pending");
      expect(action!.assignedTo).toBeUndefined();
    });

    it("does not expire non-expired active leases", async () => {
      await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      });

      const result = (await sdk.trigger("mem::lease-cleanup", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("active");
    });

    it("handles multiple expired leases across different actions", async () => {
      const a1 = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      const a4 = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_4",
        agentId: "agent-b",
      })) as { success: boolean; lease: Lease };

      a1.lease.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:leases", a1.lease.id, a1.lease);

      a4.lease.expiresAt = new Date(Date.now() - 30000).toISOString();
      await kv.set("mem:leases", a4.lease.id, a4.lease);

      const result = (await sdk.trigger("mem::lease-cleanup", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(2);
    });

    it("does not reset action when action is no longer active", async () => {
      const acquired = (await sdk.trigger("mem::lease-acquire", {
        actionId: "act_1",
        agentId: "agent-a",
      })) as { success: boolean; lease: Lease };

      acquired.lease.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:leases", acquired.lease.id, acquired.lease);

      const action = await kv.get<Action>("mem:actions", "act_1");
      action!.status = "done";
      await kv.set("mem:actions", "act_1", action);

      await sdk.trigger("mem::lease-cleanup", {});

      const updatedAction = await kv.get<Action>("mem:actions", "act_1");
      expect(updatedAction!.status).toBe("done");
    });
  });
});
