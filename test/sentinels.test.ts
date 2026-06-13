import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSentinelsFunction } from "../src/functions/sentinels.js";
import { registerActionsFunction } from "../src/functions/actions.js";
import { registerMcpEndpoints } from "../src/mcp/server.js";
import { KV } from "../src/state/schema.js";
import type { Action, ActionEdge, CompressedObservation, Sentinel, Session } from "../src/types.js";

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
    getFunction: (id: string) => functions.get(id),
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeMcpReq(body?: unknown, headers?: Record<string, string>) {
  return {
    body,
    headers: headers || {},
    query_params: {},
  };
}

describe("Sentinels Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerSentinelsFunction(sdk as never, kv as never);
    registerActionsFunction(sdk as never, kv as never);
  });

  describe("mem::sentinel-create", () => {
    it("creates a webhook sentinel with valid config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "deploy-hook",
        type: "webhook",
        config: { path: "/hooks/deploy" },
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.id).toMatch(/^snl_/);
      expect(result.sentinel.name).toBe("deploy-hook");
      expect(result.sentinel.type).toBe("webhook");
      expect(result.sentinel.status).toBe("watching");
      expect(result.sentinel.config).toEqual({ path: "/hooks/deploy" });
      expect(result.sentinel.linkedActionIds).toEqual([]);
      expect(result.sentinel.createdAt).toBeDefined();
    });

    it("creates a timer sentinel with valid config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "timeout-check",
        type: "timer",
        config: { durationMs: 5000 },
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.type).toBe("timer");
      expect(result.sentinel.status).toBe("watching");
    });

    it("creates a threshold sentinel with valid config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "high-calls",
        type: "threshold",
        config: { metric: "api_calls", operator: "gt", value: 100 },
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.type).toBe("threshold");
    });

    it("creates a pattern sentinel with valid config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "error-watcher",
        type: "pattern",
        config: { pattern: "error|fail" },
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.type).toBe("pattern");
    });

    it("creates an approval sentinel without config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "needs-approval",
        type: "approval",
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.type).toBe("approval");
      expect(result.sentinel.config).toEqual({});
    });

    it("creates a custom sentinel without config", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "custom-gate",
        type: "custom",
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.type).toBe("custom");
    });

    it("returns error when name is missing", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        type: "webhook",
        config: { path: "/hooks/deploy" },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("name is required");
    });

    it("returns error for invalid type", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-type",
        type: "invalid_type",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("type must be one of");
    });

    it("returns error for timer config missing durationMs", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-timer",
        type: "timer",
        config: {},
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("positive durationMs");
    });

    it("returns error for timer config with negative durationMs", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "neg-timer",
        type: "timer",
        config: { durationMs: -100 },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("positive durationMs");
    });

    it("returns error for threshold config missing metric", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-threshold",
        type: "threshold",
        config: { operator: "gt", value: 10 },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("threshold config requires");
    });

    it("returns error for threshold config with invalid operator", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-op",
        type: "threshold",
        config: { metric: "calls", operator: "gte", value: 10 },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("threshold config requires");
    });

    it("returns error for threshold config missing value", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "no-val",
        type: "threshold",
        config: { metric: "calls", operator: "gt" },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("threshold config requires");
    });

    it("returns error for pattern config missing pattern", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-pattern",
        type: "pattern",
        config: {},
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("pattern config requires");
    });

    it("rejects invalid pattern regex before persisting it", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-pattern",
        type: "pattern",
        config: { pattern: "(" },
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("valid regular expression");
      expect(await kv.list<Sentinel>(KV.sentinels)).toHaveLength(0);
    });

    it("rejects unsafe pattern regex shapes before persisting them", async () => {
      const unsafePatterns = [
        "^(a+)+$",
        "^(a|aa)+$",
        "(.*a){2,}",
        "([a-z]+)*",
        "(error)?",
        "(?=error)",
        "error\\1",
        "\\k<name>",
        "a++",
        "^a*a*a*a*a*a*a*a*b$",
        "a".repeat(129),
      ];

      for (const pattern of unsafePatterns) {
        const result = (await sdk.trigger("mem::sentinel-create", {
          name: `bad-${pattern}`,
          type: "pattern",
          config: { pattern },
        })) as { success: boolean; error: string };

        expect(result.success, pattern).toBe(false);
        expect(result.error, pattern).toContain("pattern config");
      }

      expect(await kv.list<Sentinel>(KV.sentinels)).toHaveLength(0);
    });

    it("returns error for webhook config missing path", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-webhook",
        type: "webhook",
        config: {},
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("webhook config requires");
    });

    it("creates gated_by edges for linkedActionIds", async () => {
      const action = (await sdk.trigger("mem::action-create", {
        title: "Gated task",
      })) as { success: boolean; action: Action };

      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "gate-sentinel",
        type: "approval",
        linkedActionIds: [action.action.id],
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.linkedActionIds).toEqual([action.action.id]);

      const edges = await kv.list<ActionEdge>("mem:action-edges");
      const gatedEdges = edges.filter(
        (e) =>
          e.type === "gated_by" &&
          e.sourceActionId === action.action.id &&
          e.targetActionId === result.sentinel.id,
      );
      expect(gatedEdges.length).toBe(1);
    });

    it("returns error for non-existent linkedActionId", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "bad-link",
        type: "approval",
        linkedActionIds: ["nonexistent_action"],
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("linked action not found");
    });

    it("sets expiresAt when expiresInMs is provided", async () => {
      const result = (await sdk.trigger("mem::sentinel-create", {
        name: "expiring",
        type: "custom",
        expiresInMs: 60000,
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.expiresAt).toBeDefined();
      const created = new Date(result.sentinel.createdAt).getTime();
      const expires = new Date(result.sentinel.expiresAt!).getTime();
      expect(expires - created).toBeCloseTo(60000, -2);
    });
  });

  describe("mem::sentinel-trigger", () => {
    it("triggers a watching sentinel", async () => {
      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "trigger-me",
        type: "approval",
      })) as { success: boolean; sentinel: Sentinel };

      const result = (await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: sentinel.sentinel.id,
        result: { approvedBy: "admin" },
      })) as { success: boolean; sentinel: Sentinel; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.sentinel.status).toBe("triggered");
      expect(result.sentinel.triggeredAt).toBeDefined();
      expect(result.sentinel.result).toEqual({ approvedBy: "admin" });
      expect(result.unblockedCount).toBe(0);
    });

    it("returns error when triggering already-triggered sentinel", async () => {
      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "already-fired",
        type: "custom",
      })) as { success: boolean; sentinel: Sentinel };

      await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: sentinel.sentinel.id,
      });

      const result = (await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: sentinel.sentinel.id,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("already triggered");
    });

    it("returns error for non-existent sentinel", async () => {
      const result = (await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: "nonexistent_sentinel",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sentinel not found");
    });

    it("returns error when sentinelId is missing", async () => {
      const result = (await sdk.trigger("mem::sentinel-trigger", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sentinelId is required");
    });

    it("unblocks gated actions when triggered", async () => {
      const action = (await sdk.trigger("mem::action-create", {
        title: "Blocked task",
      })) as { success: boolean; action: Action };

      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "gate",
        type: "approval",
        linkedActionIds: [action.action.id],
      })) as { success: boolean; sentinel: Sentinel };

      await sdk.trigger("mem::action-update", {
        actionId: action.action.id,
        status: "blocked",
      });

      const result = (await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: sentinel.sentinel.id,
      })) as { success: boolean; sentinel: Sentinel; unblockedCount: number };

      expect(result.success).toBe(true);
      expect(result.unblockedCount).toBe(1);

      const updated = (await sdk.trigger("mem::action-get", {
        actionId: action.action.id,
      })) as { success: boolean; action: Action };

      expect(updated.action.status).toBe("pending");
    });
  });

  describe("mem::sentinel-cancel", () => {
    it("cancels a watching sentinel", async () => {
      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "cancel-me",
        type: "custom",
      })) as { success: boolean; sentinel: Sentinel };

      const result = (await sdk.trigger("mem::sentinel-cancel", {
        sentinelId: sentinel.sentinel.id,
      })) as { success: boolean; sentinel: Sentinel };

      expect(result.success).toBe(true);
      expect(result.sentinel.status).toBe("cancelled");
    });

    it("returns error when cancelling non-watching sentinel", async () => {
      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "already-triggered",
        type: "custom",
      })) as { success: boolean; sentinel: Sentinel };

      await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: sentinel.sentinel.id,
      });

      const result = (await sdk.trigger("mem::sentinel-cancel", {
        sentinelId: sentinel.sentinel.id,
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot cancel sentinel with status");
    });

    it("returns error for non-existent sentinel", async () => {
      const result = (await sdk.trigger("mem::sentinel-cancel", {
        sentinelId: "nonexistent_sentinel",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sentinel not found");
    });

    it("returns error when sentinelId is missing", async () => {
      const result = (await sdk.trigger("mem::sentinel-cancel", {})) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("sentinelId is required");
    });
  });

  describe("mem::sentinel-list", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::sentinel-create", {
        name: "webhook-1",
        type: "webhook",
        config: { path: "/a" },
      });
      await sdk.trigger("mem::sentinel-create", {
        name: "timer-1",
        type: "timer",
        config: { durationMs: 1000 },
      });
      await sdk.trigger("mem::sentinel-create", {
        name: "approval-1",
        type: "approval",
      });
    });

    it("returns all sentinels", async () => {
      const result = (await sdk.trigger("mem::sentinel-list", {})) as {
        success: boolean;
        sentinels: Sentinel[];
      };

      expect(result.success).toBe(true);
      expect(result.sentinels.length).toBe(3);
    });

    it("filters by status", async () => {
      const all = (await sdk.trigger("mem::sentinel-list", {})) as {
        sentinels: Sentinel[];
      };
      await sdk.trigger("mem::sentinel-trigger", {
        sentinelId: all.sentinels[0].id,
      });

      const result = (await sdk.trigger("mem::sentinel-list", {
        status: "triggered",
      })) as { success: boolean; sentinels: Sentinel[] };

      expect(result.success).toBe(true);
      expect(result.sentinels.length).toBe(1);
      expect(result.sentinels[0].status).toBe("triggered");
    });

    it("filters by type", async () => {
      const result = (await sdk.trigger("mem::sentinel-list", {
        type: "webhook",
      })) as { success: boolean; sentinels: Sentinel[] };

      expect(result.success).toBe(true);
      expect(result.sentinels.length).toBe(1);
      expect(result.sentinels[0].type).toBe("webhook");
    });

    it("filters by both status and type", async () => {
      const result = (await sdk.trigger("mem::sentinel-list", {
        status: "watching",
        type: "approval",
      })) as { success: boolean; sentinels: Sentinel[] };

      expect(result.success).toBe(true);
      expect(result.sentinels.length).toBe(1);
      expect(result.sentinels[0].type).toBe("approval");
      expect(result.sentinels[0].status).toBe("watching");
    });
  });

  describe("mem::sentinel-expire", () => {
    it("expires sentinels past their expiresAt", async () => {
      await sdk.trigger("mem::sentinel-create", {
        name: "will-expire",
        type: "custom",
        expiresInMs: 1,
      });

      await new Promise((r) => setTimeout(r, 10));

      const result = (await sdk.trigger("mem::sentinel-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(1);

      const list = (await sdk.trigger("mem::sentinel-list", {
        status: "expired",
      })) as { sentinels: Sentinel[] };
      expect(list.sentinels.length).toBe(1);
    });

    it("skips sentinels that have not expired", async () => {
      await sdk.trigger("mem::sentinel-create", {
        name: "not-expired",
        type: "custom",
        expiresInMs: 600000,
      });

      const result = (await sdk.trigger("mem::sentinel-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });

    it("skips sentinels without expiresAt", async () => {
      await sdk.trigger("mem::sentinel-create", {
        name: "no-expiry",
        type: "custom",
      });

      const result = (await sdk.trigger("mem::sentinel-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });

    it("skips non-watching sentinels even if expired", async () => {
      const sentinel = (await sdk.trigger("mem::sentinel-create", {
        name: "already-cancelled",
        type: "custom",
        expiresInMs: 1,
      })) as { success: boolean; sentinel: Sentinel };

      await sdk.trigger("mem::sentinel-cancel", {
        sentinelId: sentinel.sentinel.id,
      });

      await new Promise((r) => setTimeout(r, 10));

      const result = (await sdk.trigger("mem::sentinel-expire", {})) as {
        success: boolean;
        expired: number;
      };

      expect(result.success).toBe(true);
      expect(result.expired).toBe(0);
    });
  });

  describe("mem::sentinel-check", () => {
    it("triggers threshold sentinel when condition is met", async () => {
      await kv.set("mem:metrics", "api_calls", {
        totalCalls: 150,
        errorCount: 0,
        avgDurationMs: 50,
      });

      await sdk.trigger("mem::sentinel-create", {
        name: "high-traffic",
        type: "threshold",
        config: { metric: "api_calls", operator: "gt", value: 100 },
      });

      const result = (await sdk.trigger("mem::sentinel-check", {})) as {
        success: boolean;
        triggered: string[];
        checkedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.triggered.length).toBe(1);
      expect(result.checkedCount).toBe(1);
    });

    it("does not trigger threshold sentinel when condition is not met", async () => {
      await kv.set("mem:metrics", "api_calls", {
        totalCalls: 50,
        errorCount: 0,
        avgDurationMs: 50,
      });

      await sdk.trigger("mem::sentinel-create", {
        name: "low-traffic",
        type: "threshold",
        config: { metric: "api_calls", operator: "gt", value: 100 },
      });

      const result = (await sdk.trigger("mem::sentinel-check", {})) as {
        success: boolean;
        triggered: string[];
        checkedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.triggered.length).toBe(0);
    });

    it("returns empty triggered list when no active sentinels", async () => {
      const result = (await sdk.trigger("mem::sentinel-check", {})) as {
        success: boolean;
        triggered: string[];
        checkedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.triggered).toEqual([]);
      expect(result.checkedCount).toBe(0);
    });

    it("triggers pattern sentinel for a safe recent observation title", async () => {
      const created = (await sdk.trigger("mem::sentinel-create", {
        name: "error-watcher",
        type: "pattern",
        config: { pattern: "error|fail" },
      })) as { success: boolean; sentinel: Sentinel };
      const session: Session = {
        id: "ses_pattern",
        project: "demo",
        cwd: "/demo",
        startedAt: new Date().toISOString(),
        status: "active",
        observationCount: 1,
      };
      const observation: CompressedObservation = {
        id: "obs_error",
        sessionId: session.id,
        timestamp: new Date(Date.now() + 1000).toISOString(),
        type: "error",
        title: "Build error in watcher",
        facts: [],
        narrative: "",
        concepts: [],
        files: [],
        importance: 5,
      };
      await kv.set(KV.sessions, session.id, session);
      await kv.set(KV.observations(session.id), observation.id, observation);

      const result = (await sdk.trigger("mem::sentinel-check", {})) as {
        success: boolean;
        triggered: string[];
      };

      expect(result.success).toBe(true);
      expect(result.triggered).toEqual([created.sentinel.id]);
    });

    it("skips legacy unsafe pattern sentinels and still processes valid sentinels", async () => {
      const now = new Date().toISOString();
      const legacyInvalidSyntax: Sentinel = {
        id: "snl_invalid_syntax",
        name: "legacy invalid syntax",
        type: "pattern",
        status: "watching",
        config: { pattern: "(" },
        createdAt: now,
        linkedActionIds: [],
      };
      const legacyUnsafeShape: Sentinel = {
        id: "snl_unsafe_shape",
        name: "legacy unsafe shape",
        type: "pattern",
        status: "watching",
        config: { pattern: "(fail)?" },
        createdAt: now,
        linkedActionIds: [],
      };
      const legacyMalformed: Sentinel = {
        id: "snl_malformed",
        name: "legacy malformed",
        type: "pattern",
        status: "watching",
        config: {},
        createdAt: now,
        linkedActionIds: [],
      };
      const valid: Sentinel = {
        id: "snl_valid",
        name: "valid",
        type: "pattern",
        status: "watching",
        config: { pattern: "error|fail" },
        createdAt: now,
        linkedActionIds: [],
      };
      const session: Session = {
        id: "ses_legacy",
        project: "demo",
        cwd: "/demo",
        startedAt: now,
        status: "active",
        observationCount: 1,
      };
      const observation: CompressedObservation = {
        id: "obs_fail",
        sessionId: session.id,
        timestamp: new Date(Date.now() + 1000).toISOString(),
        type: "error",
        title: "Deploy fail",
        facts: [],
        narrative: "",
        concepts: [],
        files: [],
        importance: 5,
      };
      await kv.set(KV.sentinels, legacyInvalidSyntax.id, legacyInvalidSyntax);
      await kv.set(KV.sentinels, legacyUnsafeShape.id, legacyUnsafeShape);
      await kv.set(KV.sentinels, legacyMalformed.id, legacyMalformed);
      await kv.set(KV.sentinels, valid.id, valid);
      await kv.set(KV.sessions, session.id, session);
      await kv.set(KV.observations(session.id), observation.id, observation);

      const result = (await sdk.trigger("mem::sentinel-check", {})) as {
        success: boolean;
        triggered: string[];
        checkedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.checkedCount).toBe(4);
      expect(result.triggered).toEqual([valid.id]);
    });
  });
});

describe("MCP sentinel create", () => {
  it("returns failed result for unsafe pattern config through MCP wrapper", async () => {
    const sdk = mockSdk();
    const kv = mockKV();
    registerSentinelsFunction(sdk as never, kv as never);
    registerMcpEndpoints(sdk as never, kv as never);

    const call = sdk.getFunction("mcp::tools::call");
    expect(call).toBeDefined();

    const result = (await call!(makeMcpReq({
      name: "memory_sentinel_create",
      arguments: {
        name: "unsafe",
        type: "pattern",
        config: JSON.stringify({ pattern: "^(a+)+$" }),
      },
    }))) as {
      status_code: number;
      body: { content: Array<{ text: string }> };
    };

    expect(result.status_code).toBe(200);
    const parsed = JSON.parse(result.body.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("pattern config");
  });
});
