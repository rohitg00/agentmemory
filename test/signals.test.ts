import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerSignalsFunction } from "../src/functions/signals.js";
import type { Signal } from "../src/types.js";

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

describe("Signals Functions", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerSignalsFunction(sdk as never, kv as never);
  });

  describe("mem::signal-send", () => {
    it("sends a signal with valid data", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        to: "agent-b",
        content: "Hello there",
        type: "info",
      })) as { success: boolean; signal: Signal };

      expect(result.success).toBe(true);
      expect(result.signal.id).toMatch(/^sig_/);
      expect(result.signal.from).toBe("agent-a");
      expect(result.signal.to).toBe("agent-b");
      expect(result.signal.content).toBe("Hello there");
      expect(result.signal.type).toBe("info");
      expect(result.signal.threadId).toMatch(/^thr_/);
      expect(result.signal.createdAt).toBeDefined();
    });

    it("returns error when from is missing", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "",
        content: "Hello",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("from and non-empty content are required");
    });

    it("returns error when content is whitespace only", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        content: "   ",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("from and non-empty content are required");
    });

    it("returns error when content is empty string", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        content: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("from and non-empty content are required");
    });

    it("auto-threads replies from parent signal", async () => {
      const parent = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        to: "agent-b",
        content: "Initial message",
      })) as { success: boolean; signal: Signal };

      const reply = (await sdk.trigger("mem::signal-send", {
        from: "agent-b",
        to: "agent-a",
        content: "Reply message",
        replyTo: parent.signal.id,
      })) as { success: boolean; signal: Signal };

      expect(reply.success).toBe(true);
      expect(reply.signal.threadId).toBe(parent.signal.threadId);
      expect(reply.signal.replyTo).toBe(parent.signal.id);
    });

    it("sets expiresAt when expiresInMs is provided", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        content: "Temporary message",
        expiresInMs: 60000,
      })) as { success: boolean; signal: Signal };

      expect(result.success).toBe(true);
      expect(result.signal.expiresAt).toBeDefined();
      const expiresAt = new Date(result.signal.expiresAt!).getTime();
      const createdAt = new Date(result.signal.createdAt).getTime();
      expect(expiresAt - createdAt).toBeCloseTo(60000, -2);
    });

    it("defaults type to info when not specified", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        content: "No type specified",
      })) as { success: boolean; signal: Signal };

      expect(result.success).toBe(true);
      expect(result.signal.type).toBe("info");
    });

    it("trims content whitespace", async () => {
      const result = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        content: "  padded content  ",
      })) as { success: boolean; signal: Signal };

      expect(result.success).toBe(true);
      expect(result.signal.content).toBe("padded content");
    });
  });

  describe("mem::signal-read", () => {
    beforeEach(async () => {
      await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        to: "agent-b",
        content: "Message 1",
        type: "info",
      });
      await sdk.trigger("mem::signal-send", {
        from: "agent-c",
        to: "agent-b",
        content: "Message 2",
        type: "request",
      });
      await sdk.trigger("mem::signal-send", {
        from: "agent-b",
        to: "agent-a",
        content: "Message 3",
        type: "response",
      });
    });

    it("reads signals for an agent", async () => {
      const result = (await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
      })) as { success: boolean; signals: Signal[] };

      expect(result.success).toBe(true);
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });

    it("marks signals as read", async () => {
      await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
      });

      const signals = await kv.list<Signal>("mem:signals");
      const toAgentB = signals.filter((s) => s.to === "agent-b");
      expect(toAgentB.every((s) => s.readAt !== undefined)).toBe(true);
    });

    it("filters by unreadOnly", async () => {
      await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
      });

      const result = (await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
        unreadOnly: true,
      })) as { success: boolean; signals: Signal[] };

      expect(result.success).toBe(true);
      expect(result.signals.length).toBe(0);
    });

    it("filters by threadId", async () => {
      const sent = (await sdk.trigger("mem::signal-send", {
        from: "agent-x",
        to: "agent-b",
        content: "Thread-specific message",
        threadId: "thr_specific",
      })) as { success: boolean; signal: Signal };

      const result = (await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
        threadId: "thr_specific",
      })) as { success: boolean; signals: Signal[] };

      expect(result.success).toBe(true);
      expect(result.signals.length).toBe(1);
      expect(result.signals[0].threadId).toBe("thr_specific");
    });

    it("filters by type", async () => {
      const result = (await sdk.trigger("mem::signal-read", {
        agentId: "agent-b",
        type: "request",
      })) as { success: boolean; signals: Signal[] };

      expect(result.success).toBe(true);
      expect(result.signals.every((s) => s.type === "request")).toBe(true);
    });

    it("returns error when agentId is missing", async () => {
      const result = (await sdk.trigger("mem::signal-read", {
        agentId: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("agentId is required");
    });
  });

  describe("mem::signal-threads", () => {
    it("groups signals by thread", async () => {
      const first = (await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        to: "agent-b",
        content: "Thread 1 message 1",
      })) as { success: boolean; signal: Signal };

      await sdk.trigger("mem::signal-send", {
        from: "agent-b",
        to: "agent-a",
        content: "Thread 1 message 2",
        replyTo: first.signal.id,
      });

      await sdk.trigger("mem::signal-send", {
        from: "agent-a",
        to: "agent-b",
        content: "Different thread",
      });

      const result = (await sdk.trigger("mem::signal-threads", {
        agentId: "agent-a",
      })) as {
        success: boolean;
        threads: Array<{
          threadId: string;
          messages: number;
          participants: string[];
        }>;
      };

      expect(result.success).toBe(true);
      expect(result.threads.length).toBe(2);

      const firstThread = result.threads.find(
        (t) => t.threadId === first.signal.threadId,
      );
      expect(firstThread).toBeDefined();
      expect(firstThread!.messages).toBe(2);
      expect(firstThread!.participants).toContain("agent-a");
      expect(firstThread!.participants).toContain("agent-b");
    });

    it("returns error when agentId is missing", async () => {
      const result = (await sdk.trigger("mem::signal-threads", {
        agentId: "",
      })) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBe("agentId is required");
    });
  });

  describe("mem::signal-cleanup", () => {
    it("removes expired signals", async () => {
      const now = Date.now();
      const expiredSignal: Signal = {
        id: "sig_expired",
        from: "agent-a",
        to: "agent-b",
        content: "Expired",
        type: "info",
        threadId: "thr_1",
        createdAt: new Date(now - 120000).toISOString(),
        expiresAt: new Date(now - 60000).toISOString(),
      };
      await kv.set("mem:signals", expiredSignal.id, expiredSignal);

      const validSignal: Signal = {
        id: "sig_valid",
        from: "agent-a",
        to: "agent-b",
        content: "Still valid",
        type: "info",
        threadId: "thr_2",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60000).toISOString(),
      };
      await kv.set("mem:signals", validSignal.id, validSignal);

      const result = (await sdk.trigger("mem::signal-cleanup", {})) as {
        success: boolean;
        removed: number;
      };

      expect(result.success).toBe(true);
      expect(result.removed).toBe(1);

      const remaining = await kv.list<Signal>("mem:signals");
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe("sig_valid");
    });

    it("keeps signals without expiration", async () => {
      const noExpiry: Signal = {
        id: "sig_noexpiry",
        from: "agent-a",
        content: "No expiration",
        type: "info",
        threadId: "thr_3",
        createdAt: new Date().toISOString(),
      };
      await kv.set("mem:signals", noExpiry.id, noExpiry);

      const result = (await sdk.trigger("mem::signal-cleanup", {})) as {
        success: boolean;
        removed: number;
      };

      expect(result.success).toBe(true);
      expect(result.removed).toBe(0);

      const remaining = await kv.list<Signal>("mem:signals");
      expect(remaining.length).toBe(1);
    });

    it("removes multiple expired signals at once", async () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        const sig: Signal = {
          id: `sig_exp_${i}`,
          from: "agent-a",
          content: `Expired ${i}`,
          type: "info",
          threadId: `thr_${i}`,
          createdAt: new Date(now - 200000).toISOString(),
          expiresAt: new Date(now - 100000).toISOString(),
        };
        await kv.set("mem:signals", sig.id, sig);
      }

      const keepSig: Signal = {
        id: "sig_keep",
        from: "agent-b",
        content: "Keep me",
        type: "alert",
        threadId: "thr_keep",
        createdAt: new Date(now).toISOString(),
      };
      await kv.set("mem:signals", keepSig.id, keepSig);

      const result = (await sdk.trigger("mem::signal-cleanup", {})) as {
        success: boolean;
        removed: number;
      };

      expect(result.success).toBe(true);
      expect(result.removed).toBe(5);

      const remaining = await kv.list<Signal>("mem:signals");
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe("sig_keep");
    });
  });
});
