import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerCheckpointsFunction } from "../src/functions/checkpoints.js";
import type { Action, ActionEdge, Checkpoint } from "../src/types.js";

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
  status: Action["status"] = "blocked",
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

describe("Checkpoint Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerCheckpointsFunction(sdk as never, kv as never);
  });

  describe("mem::checkpoint-create", () => {
    it("creates a checkpoint with valid name", async () => {
      const result = (await sdk.trigger("mem::checkpoint-create", {
        name: "CI Build",
        description: "Wait for CI to pass",
        type: "ci",
      })) as { success: boolean; checkpoint: Checkpoint };

      expect(result.success).toBe(true);
      expect(result.checkpoint.name).toBe("CI Build");
      expect(result.checkpoint.description).toBe("Wait for CI to pass");
      expect(result.checkpoint.status).toBe("pending");
      expect(result.checkpoint.type).toBe("ci");
      expect(result.checkpoint.id).toMatch(/^ckpt_/);
    });

    it("returns error when name is missing", async () => {
      const result = (await sdk.trigger("mem::checkpoint-create", {
        name: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("name is required");
    });

    it("defaults type to external when not specified", async () => {
      const result = (await sdk.trigger("mem::checkpoint-create", {
        name: "External Gate",
      })) as { success: boolean; checkpoint: Checkpoint };

      expect(result.success).toBe(true);
      expect(result.checkpoint.type).toBe("external");
    });

    it("sets expiresAt when expiresInMs is provided", async () => {
      const before = Date.now();
      const result = (await sdk.trigger("mem::checkpoint-create", {
        name: "Timed Gate",
        expiresInMs: 60000,
      })) as { success: boolean; checkpoint: Checkpoint };

      expect(result.success).toBe(true);
      expect(result.checkpoint.expiresAt).toBeDefined();
      const expiresAt = new Date(result.checkpoint.expiresAt!).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 60000);
    });

    it("creates action edges for linkedActionIds", async () => {
      await kv.set("mem:actions", "act_1", makeAction("act_1"));
      await kv.set("mem:actions", "act_2", makeAction("act_2"));

      const result = (await sdk.trigger("mem::checkpoint-create", {
        name: "Deployment Gate",
        type: "deploy",
        linkedActionIds: ["act_1", "act_2"],
      })) as { success: boolean; checkpoint: Checkpoint };

      expect(result.success).toBe(true);
      expect(result.checkpoint.linkedActionIds).toEqual(["act_1", "act_2"]);

      const edges = await kv.list<ActionEdge>("mem:action-edges");
      expect(edges.length).toBe(2);
      expect(edges[0].type).toBe("gated_by");
      expect(edges[0].targetActionId).toBe(result.checkpoint.id);
      expect(edges.map((e) => e.sourceActionId).sort()).toEqual(["act_1", "act_2"]);
    });

    it("creates no edges when linkedActionIds is empty", async () => {
      await sdk.trigger("mem::checkpoint-create", {
        name: "No Links",
        linkedActionIds: [],
      });

      const edges = await kv.list<ActionEdge>("mem:action-edges");
      expect(edges.length).toBe(0);
    });
  });

  describe("mem::checkpoint-resolve", () => {
    it("resolves a pending checkpoint to passed", async () => {
      const created = (await sdk.trigger("mem::checkpoint-create", {
        name: "CI Gate",
        type: "ci",
      })) as { success: boolean; checkpoint: Checkpoint };

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: created.checkpoint.id,
        status: "passed",
        resolvedBy: "ci-bot",
        result: { buildId: 123 },
      })) as { success: boolean; checkpoint: Checkpoint; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.checkpoint.status).toBe("passed");
      expect(result.checkpoint.resolvedBy).toBe("ci-bot");
      expect(result.checkpoint.resolvedAt).toBeDefined();
      expect(result.checkpoint.result).toEqual({ buildId: 123 });
    });

    it("resolves a pending checkpoint to failed", async () => {
      const created = (await sdk.trigger("mem::checkpoint-create", {
        name: "Approval Gate",
        type: "approval",
      })) as { success: boolean; checkpoint: Checkpoint };

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: created.checkpoint.id,
        status: "failed",
        resolvedBy: "reviewer",
      })) as { success: boolean; checkpoint: Checkpoint };

      expect(result.success).toBe(true);
      expect(result.checkpoint.status).toBe("failed");
    });

    it("returns error when checkpoint is already resolved", async () => {
      const created = (await sdk.trigger("mem::checkpoint-create", {
        name: "Already Done",
      })) as { success: boolean; checkpoint: Checkpoint };

      await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: created.checkpoint.id,
        status: "passed",
      });

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: created.checkpoint.id,
        status: "failed",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("checkpoint already passed");
    });

    it("returns error for nonexistent checkpoint", async () => {
      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: "ckpt_nonexistent",
        status: "passed",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("checkpoint not found");
    });

    it("returns error when checkpointId or status is missing", async () => {
      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: "",
        status: "passed",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("checkpointId and status are required");
    });

    it("unblocks gated actions when all checkpoints pass", async () => {
      await kv.set("mem:actions", "act_1", makeAction("act_1", "blocked"));

      const cp1 = (await sdk.trigger("mem::checkpoint-create", {
        name: "Gate 1",
        type: "ci",
        linkedActionIds: ["act_1"],
      })) as { success: boolean; checkpoint: Checkpoint };

      const cp2 = (await sdk.trigger("mem::checkpoint-create", {
        name: "Gate 2",
        type: "approval",
        linkedActionIds: ["act_1"],
      })) as { success: boolean; checkpoint: Checkpoint };

      await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: cp1.checkpoint.id,
        status: "passed",
      });

      const actionAfterFirst = await kv.get<Action>("mem:actions", "act_1");
      expect(actionAfterFirst!.status).toBe("blocked");

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: cp2.checkpoint.id,
        status: "passed",
      })) as { success: boolean; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.unblockedCount).toBe(1);

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("pending");
    });

    it("does not unblock actions when checkpoint fails", async () => {
      await kv.set("mem:actions", "act_1", makeAction("act_1", "blocked"));

      const cp = (await sdk.trigger("mem::checkpoint-create", {
        name: "Failing Gate",
        linkedActionIds: ["act_1"],
      })) as { success: boolean; checkpoint: Checkpoint };

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: cp.checkpoint.id,
        status: "failed",
      })) as { success: boolean; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.unblockedCount).toBe(0);

      const action = await kv.get<Action>("mem:actions", "act_1");
      expect(action!.status).toBe("blocked");
    });

    it("does not unblock actions that are not in blocked status", async () => {
      await kv.set("mem:actions", "act_1", makeAction("act_1", "active"));

      const cp = (await sdk.trigger("mem::checkpoint-create", {
        name: "Gate for non-blocked",
        linkedActionIds: ["act_1"],
      })) as { success: boolean; checkpoint: Checkpoint };

      const result = (await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: cp.checkpoint.id,
        status: "passed",
      })) as { success: boolean; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.unblockedCount).toBe(0);
    });
  });

  describe("mem::checkpoint-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::checkpoint-create", {
        name: "CI Check",
        type: "ci",
      });
      await sdk.trigger("mem::checkpoint-create", {
        name: "Approval Check",
        type: "approval",
      });
      await sdk.trigger("mem::checkpoint-create", {
        name: "Deploy Check",
        type: "deploy",
      });
    });

    it("lists all checkpoints when no filters applied", async () => {
      const result = (await sdk.trigger("mem::checkpoint-list", {})) as {
        success: boolean;
        checkpoints: Checkpoint[];
      };

      expect(result.success).toBe(true);
      expect(result.checkpoints.length).toBe(3);
    });

    it("filters checkpoints by status", async () => {
      const all = (await sdk.trigger("mem::checkpoint-list", {})) as {
        checkpoints: Checkpoint[];
      };
      const firstId = all.checkpoints[0].id;

      await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: firstId,
        status: "passed",
      });

      const pending = (await sdk.trigger("mem::checkpoint-list", {
        status: "pending",
      })) as { success: boolean; checkpoints: Checkpoint[] };

      expect(pending.success).toBe(true);
      expect(pending.checkpoints.length).toBe(2);
      expect(pending.checkpoints.every((c) => c.status === "pending")).toBe(true);

      const passed = (await sdk.trigger("mem::checkpoint-list", {
        status: "passed",
      })) as { success: boolean; checkpoints: Checkpoint[] };

      expect(passed.checkpoints.length).toBe(1);
      expect(passed.checkpoints[0].status).toBe("passed");
    });

    it("filters checkpoints by type", async () => {
      const result = (await sdk.trigger("mem::checkpoint-list", {
        type: "ci",
      })) as { success: boolean; checkpoints: Checkpoint[] };

      expect(result.success).toBe(true);
      expect(result.checkpoints.length).toBe(1);
      expect(result.checkpoints[0].type).toBe("ci");
      expect(result.checkpoints[0].name).toBe("CI Check");
    });

    it("returns empty list when no checkpoints match filter", async () => {
      const result = (await sdk.trigger("mem::checkpoint-list", {
        type: "external",
      })) as { success: boolean; checkpoints: Checkpoint[] };

      expect(result.success).toBe(true);
      expect(result.checkpoints.length).toBe(0);
    });

    it("sorts checkpoints by createdAt descending", async () => {
      const result = (await sdk.trigger("mem::checkpoint-list", {})) as {
        success: boolean;
        checkpoints: Checkpoint[];
      };

      for (let i = 0; i < result.checkpoints.length - 1; i++) {
        const current = new Date(result.checkpoints[i].createdAt).getTime();
        const next = new Date(result.checkpoints[i + 1].createdAt).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe("mem::checkpoint-expire", () => {
    it("expires pending checkpoints past their expiresAt", async () => {
      const created = (await sdk.trigger("mem::checkpoint-create", {
        name: "Expiring Gate",
        expiresInMs: 1,
      })) as { success: boolean; checkpoint: Checkpoint };

      created.checkpoint.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:checkpoints", created.checkpoint.id, created.checkpoint);

      const result = (await sdk.trigger("mem::checkpoint-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(1);

      const cp = await kv.get<Checkpoint>("mem:checkpoints", created.checkpoint.id);
      expect(cp!.status).toBe("expired");
      expect(cp!.resolvedAt).toBeDefined();
    });

    it("does not expire non-pending checkpoints", async () => {
      const created = (await sdk.trigger("mem::checkpoint-create", {
        name: "Already Passed",
        expiresInMs: 1,
      })) as { success: boolean; checkpoint: Checkpoint };

      await sdk.trigger("mem::checkpoint-resolve", {
        checkpointId: created.checkpoint.id,
        status: "passed",
      });

      const cp = await kv.get<Checkpoint>("mem:checkpoints", created.checkpoint.id);
      cp!.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:checkpoints", created.checkpoint.id, cp);

      const result = (await sdk.trigger("mem::checkpoint-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });

    it("does not expire checkpoints without expiresAt", async () => {
      await sdk.trigger("mem::checkpoint-create", {
        name: "No Expiry",
      });

      const result = (await sdk.trigger("mem::checkpoint-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });

    it("does not expire checkpoints whose expiresAt is in the future", async () => {
      await sdk.trigger("mem::checkpoint-create", {
        name: "Future Gate",
        expiresInMs: 3600000,
      });

      const result = (await sdk.trigger("mem::checkpoint-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });

    it("handles multiple expired checkpoints", async () => {
      const cp1 = (await sdk.trigger("mem::checkpoint-create", {
        name: "Expired 1",
        expiresInMs: 1,
      })) as { success: boolean; checkpoint: Checkpoint };

      const cp2 = (await sdk.trigger("mem::checkpoint-create", {
        name: "Expired 2",
        expiresInMs: 1,
      })) as { success: boolean; checkpoint: Checkpoint };

      cp1.checkpoint.expiresAt = new Date(Date.now() - 60000).toISOString();
      await kv.set("mem:checkpoints", cp1.checkpoint.id, cp1.checkpoint);

      cp2.checkpoint.expiresAt = new Date(Date.now() - 30000).toISOString();
      await kv.set("mem:checkpoints", cp2.checkpoint.id, cp2.checkpoint);

      const result = (await sdk.trigger("mem::checkpoint-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(2);
    });
  });
});
