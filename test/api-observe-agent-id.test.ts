import { describe, expect, it, vi } from "vitest";

vi.mock("iii-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("iii-sdk")>();
  return {
    ...actual,
    TriggerAction: {
      ...actual.TriggerAction,
      Void: vi.fn(() => ({ type: "void" })),
    },
  };
});

import { registerApiTriggers } from "../src/triggers/api.js";

describe("POST /agentmemory/observe agent identity", () => {
  it("forwards the caller's agentId to mem::observe", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ success: true }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };

    registerApiTriggers(sdk as never, {} as never);
    const observe = handlers.get("api::observe");
    expect(observe).toBeDefined();

    const response = (await observe!({
      body: {
        hookType: "post_tool_use",
        sessionId: "session-1",
        project: "ALPHA-SelfService",
        cwd: "/workspace/ALPHA-SelfService",
        timestamp: "2026-08-27T00:00:00Z",
        data: { tool_name: "conversation" },
        agentId: "alpha",
      },
    })) as { status_code: number };

    expect(response.status_code).toBe(201);
    expect(trigger).toHaveBeenCalledWith({
      function_id: "mem::observe",
      payload: expect.objectContaining({ agentId: "alpha" }),
    });
  });
});

describe("DELETE /agentmemory/governance/memories agent identity", () => {
  it("forwards only the allowed scoped delete fields", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ success: true, deleted: 0 }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };

    registerApiTriggers(sdk as never, {} as never);
    const governanceDelete = handlers.get("api::governance-delete");
    expect(governanceDelete).toBeDefined();

    const response = (await governanceDelete!({
      body: {
        memoryIds: ["mem_beta"],
        reason: "stale",
        agentId: "alpha",
        injected: "must-not-pass",
      },
    })) as { status_code: number };

    expect(response.status_code).toBe(200);
    expect(trigger).toHaveBeenCalledWith({
      function_id: "mem::governance-delete",
      payload: {
        memoryIds: ["mem_beta"],
        reason: "stale",
        agentId: "alpha",
      },
    });
  });

  it("rejects invalid memoryIds entries before forwarding", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ success: true, deleted: 0 }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };

    registerApiTriggers(sdk as never, {} as never);
    const governanceDelete = handlers.get("api::governance-delete");

    const response = (await governanceDelete!({
      body: {
        memoryIds: ["mem_alpha", "", 42, { id: "mem_beta" }],
        agentId: "alpha",
      },
    })) as { status_code: number; body: { error?: string } };

    expect(response.status_code).toBe(400);
    expect(response.body.error).toMatch(/non-empty strings/i);
    expect(trigger).not.toHaveBeenCalled();
  });

  it("uses the trusted process identity when isolated request omits agentId", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ success: true, deleted: 0 }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };
    const previousScope = process.env["AGENTMEMORY_AGENT_SCOPE"];
    const previousAgentId = process.env["AGENT_ID"];
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
    process.env["AGENT_ID"] = "alpha";

    try {
      registerApiTriggers(sdk as never, {} as never);
      const governanceDelete = handlers.get("api::governance-delete");
      const response = (await governanceDelete!({
        body: { memoryIds: ["mem_alpha"] },
      })) as { status_code: number };

      expect(response.status_code).toBe(200);
      expect(trigger).toHaveBeenCalledWith({
        function_id: "mem::governance-delete",
        payload: { memoryIds: ["mem_alpha"], agentId: "alpha" },
      });
    } finally {
      if (previousScope === undefined) delete process.env["AGENTMEMORY_AGENT_SCOPE"];
      else process.env["AGENTMEMORY_AGENT_SCOPE"] = previousScope;
      if (previousAgentId === undefined) delete process.env["AGENT_ID"];
      else process.env["AGENT_ID"] = previousAgentId;
    }
  });

  it("fails closed when isolated delete has no effective agent identity", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ success: true, deleted: 0 }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };
    const previousScope = process.env["AGENTMEMORY_AGENT_SCOPE"];
    const previousAgentId = process.env["AGENT_ID"];
    process.env["AGENTMEMORY_AGENT_SCOPE"] = "isolated";
    delete process.env["AGENT_ID"];

    try {
      registerApiTriggers(sdk as never, {} as never);
      const governanceDelete = handlers.get("api::governance-delete");
      const response = (await governanceDelete!({
        body: { memoryIds: ["mem_alpha"] },
      })) as { status_code: number; body: { error?: string } };

      expect(response.status_code).toBe(400);
      expect(response.body.error).toMatch(/agent identity is required/i);
      expect(trigger).not.toHaveBeenCalled();
    } finally {
      if (previousScope === undefined) delete process.env["AGENTMEMORY_AGENT_SCOPE"];
      else process.env["AGENTMEMORY_AGENT_SCOPE"] = previousScope;
      if (previousAgentId === undefined) delete process.env["AGENT_ID"];
      else process.env["AGENT_ID"] = previousAgentId;
    }
  });
});

describe("GET /agentmemory/export agent identity", () => {
  it("forwards scoped export identity with bounded pagination", async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const trigger = vi.fn(async () => ({ sessions: [], memories: [] }));
    const sdk = {
      registerFunction(id: string, handler: (payload: unknown) => Promise<unknown>) {
        handlers.set(id, handler);
      },
      registerTrigger: vi.fn(),
      trigger,
    };

    registerApiTriggers(sdk as never, {} as never);
    const exportHandler = handlers.get("api::export");
    expect(exportHandler).toBeDefined();

    const response = (await exportHandler!({
      query_params: {
        agentId: "alpha",
        maxSessions: "5",
        offset: "2",
        injected: "must-not-pass",
      },
    })) as { status_code: number };

    expect(response.status_code).toBe(200);
    expect(trigger).toHaveBeenCalledWith({
      function_id: "mem::export",
      payload: { maxSessions: 5, offset: 2, agentId: "alpha" },
    });
  });
});
