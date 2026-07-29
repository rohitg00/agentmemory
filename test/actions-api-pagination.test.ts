import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerActionsFunction } from "../src/functions/actions.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type { Action } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("Actions REST pagination", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerActionsFunction(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);

    for (let index = 0; index < 75; index += 1) {
      await sdk.trigger("mem::action-create", { title: `Task ${index}` });
    }
  });

  it("forwards limit and offset and returns page metadata", async () => {
    const response = (await sdk.trigger("api::action-list", {
      headers: {},
      query_params: { limit: "50", offset: "50" },
    })) as {
      status_code: number;
      body: {
        actions: Action[];
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.actions).toHaveLength(25);
    expect(response.body.total).toBe(75);
    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(50);
    expect(response.body.hasMore).toBe(false);
  });

  it.each([
    [{ limit: "0" }, "limit must be a positive integer"],
    [{ limit: "not-a-number" }, "limit must be a positive integer"],
    [{ offset: "-1" }, "offset must be a non-negative integer"],
    [{ offset: "1.5" }, "offset must be a non-negative integer"],
  ])("rejects invalid pagination parameters", async (queryParams, error) => {
    const response = (await sdk.trigger("api::action-list", {
      headers: {},
      query_params: queryParams,
    })) as { status_code: number; body: { error: string } };

    expect(response.status_code).toBe(400);
    expect(response.body.error).toBe(error);
  });

  it("returns 409 when the collection changes between cursor pages", async () => {
    const first = (await sdk.trigger("api::action-list", {
      headers: {},
      query_params: { limit: "10" },
    })) as {
      status_code: number;
      body: { nextCursor: string; revision: number };
    };
    expect(first.status_code).toBe(200);

    await sdk.trigger("mem::action-create", { title: "Concurrent task" });
    const second = (await sdk.trigger("api::action-list", {
      headers: {},
      query_params: { limit: "10", cursor: first.body.nextCursor },
    })) as {
      status_code: number;
      body: { success: boolean; error: string };
    };

    expect(second.status_code).toBe(409);
    expect(second.body).toMatchObject({
      success: false,
      error: "revision_conflict",
    });
  });

  it("serves the bounded action graph projection without event history", async () => {
    const response = (await sdk.trigger("api::action-graph-snapshot", {
      headers: {},
      query_params: { limit: "10" },
    })) as {
      status_code: number;
      body: {
        success: boolean;
        actions: Action[];
        actionEdges: unknown[];
        limit: number;
        eventsIncluded: boolean;
      };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.actions).toHaveLength(10);
    expect(response.body.actionEdges).toEqual([]);
    expect(response.body.limit).toBe(10);
    expect(response.body.eventsIncluded).toBe(false);
  });

  it("rejects an invalid action graph limit", async () => {
    const response = (await sdk.trigger("api::action-graph-snapshot", {
      headers: {},
      query_params: { limit: "0" },
    })) as { status_code: number; body: { error: string } };

    expect(response.status_code).toBe(400);
    expect(response.body.error).toBe("limit must be a positive integer");
  });

  it("whitelists action-create fields instead of forwarding the raw body", async () => {
    let received: Record<string, unknown> | undefined;
    sdk.registerFunction("mem::action-create", async (data) => {
      received = data as Record<string, unknown>;
      return { success: true, action: { id: "act_whitelist" } };
    });

    const response = (await sdk.trigger("api::action-create", {
      headers: {},
      body: {
        title: "Allowed",
        projectId: "agentmemory",
        actor: "codex",
        injectedInternalFlag: true,
      },
    })) as { status_code: number };

    expect(response.status_code).toBe(201);
    expect(received).toMatchObject({
      title: "Allowed",
      projectId: "agentmemory",
      actor: "codex",
    });
    expect(received).not.toHaveProperty("injectedInternalFlag");
  });

  it("whitelists actions-v2 migration controls", async () => {
    let received: Record<string, unknown> | undefined;
    sdk.registerFunction("mem::migrate", async (data) => {
      received = data as Record<string, unknown>;
      return { success: true, ...received };
    });

    const response = (await sdk.trigger("api::migrate", {
      headers: {},
      body: {
        step: "actions-v2",
        projectAliases: { "/legacy": "agentmemory" },
        limit: 25,
        injectedInternalFlag: true,
      },
    })) as { status_code: number };

    expect(response.status_code).toBe(200);
    expect(received).toMatchObject({
      step: "actions-v2",
      projectAliases: { "/legacy": "agentmemory" },
      limit: 25,
    });
    expect(received).not.toHaveProperty("injectedInternalFlag");
  });
});
