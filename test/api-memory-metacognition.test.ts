import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRequest } from "iii-sdk";
import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("memory metacognition REST API", () => {
  let sdk: ReturnType<typeof mockSdk>;

  beforeEach(() => {
    sdk = mockSdk();
  });

  function register(secret = "test-secret") {
    registerApiTriggers(sdk as never, mockKV() as never, secret);
  }

  function request(
    body?: Record<string, unknown>,
    query_params: Record<string, string> = {},
    headers: Record<string, string> = { authorization: "Bearer test-secret" },
  ): ApiRequest {
    return { body, query_params, headers } as unknown as ApiRequest;
  }

  it("enforces auth for policy reads", async () => {
    register();
    const result = await sdk.trigger(
      "api::policy-get",
      request(undefined, {}, {}),
    );

    expect(result).toEqual({
      status_code: 401,
      body: { error: "unauthorized" },
    });
  });

  it("registers exactly the Phase 1 endpoint paths", () => {
    register();

    expect(sdk.registerTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "http",
        function_id: "api::policy-get",
        config: expect.objectContaining({
          api_path: "/agentmemory/policy",
          http_method: "GET",
        }),
      }),
    );
    expect(sdk.registerTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "http",
        function_id: "api::readback-list",
        config: expect.objectContaining({
          api_path: "/agentmemory/readback",
          http_method: "GET",
        }),
      }),
    );
  });

  it("whitelists policy update fields before triggering mem::policy-update", async () => {
    let payload: unknown;
    sdk.registerFunction("mem::policy-update", async (data) => {
      payload = data;
      return { success: true, policy: data };
    });
    register();

    const result = await sdk.trigger(
      "api::policy-update",
      request({
        queryExpansions: [
          {
            id: "rule_1",
            trigger: "报错",
            expansions: ["error", "fix"],
            scope: "project",
            project: "agentmemory",
            enabled: true,
            ignored: "drop me",
          },
        ],
        writePolicy: {
          mode: "shadow",
          autoWriteThreshold: 0.9,
          allowedAutoTypes: ["preference"],
          neverAutoWriteShared: true,
          ignored: "drop me",
        },
        preflightRules: [],
        ignored: "drop me",
      }),
    );

    expect(result).toMatchObject({ status_code: 200 });
    expect(payload).toEqual({
      queryExpansions: [
        {
          id: "rule_1",
          trigger: "报错",
          expansions: ["error", "fix"],
          scope: "project",
          project: "agentmemory",
          enabled: true,
        },
      ],
      writePolicy: {
        mode: "shadow",
        autoWriteThreshold: 0.9,
        allowedAutoTypes: ["preference"],
        neverAutoWriteShared: true,
      },
      preflightRules: [],
    });
  });

  it("rejects invalid expand-query requests before triggering memory functions", async () => {
    const mem = vi.fn();
    sdk.registerFunction("mem::policy-expand-query", async (data) => mem(data));
    register();

    const result = await sdk.trigger(
      "api::policy-expand-query",
      request({ maxQueries: 3 }),
    );

    expect(result).toEqual({
      status_code: 400,
      body: { error: "query is required and must be a non-empty string" },
    });
    expect(mem).not.toHaveBeenCalled();
  });

  it("whitelists write candidate generation and review payloads", async () => {
    const calls: unknown[] = [];
    sdk.registerFunction("mem::write-candidates-generate", async (data) => {
      calls.push(data);
      return { success: true, candidates: [] };
    });
    sdk.registerFunction("mem::write-candidates-review", async (data) => {
      calls.push(data);
      return { success: true, candidate: data };
    });
    register();

    await sdk.trigger(
      "api::write-candidates-generate",
      request({
        sourceText: "我更喜欢短句",
        sessionId: "s1",
        observationId: "o1",
        project: "agentmemory",
        agentId: "codex",
        ignored: "drop me",
      }),
    );
    await sdk.trigger(
      "api::write-candidates-review",
      request({
        candidateId: "cand_1",
        decision: "approve",
        reason: "explicit preference",
        ignored: "drop me",
      }),
    );

    expect(calls).toEqual([
      {
        sourceText: "我更喜欢短句",
        sessionId: "s1",
        observationId: "o1",
        project: "agentmemory",
        agentId: "codex",
      },
      {
        candidateId: "cand_1",
        decision: "approve",
        reason: "explicit preference",
      },
    ]);
  });

  it("rejects invalid write candidate review decisions", async () => {
    const mem = vi.fn();
    sdk.registerFunction("mem::write-candidates-review", async (data) => mem(data));
    register();

    const result = await sdk.trigger(
      "api::write-candidates-review",
      request({ candidateId: "cand_1", decision: "maybe" }),
    );

    expect(result).toEqual({
      status_code: 400,
      body: { error: "decision must be approve or reject" },
    });
    expect(mem).not.toHaveBeenCalled();
  });

  it("maps readback verify and list to whitelisted payloads", async () => {
    const calls: unknown[] = [];
    sdk.registerFunction("mem::readback-verify", async (data) => {
      calls.push(data);
      return { success: true, readback: data };
    });
    sdk.registerFunction("mem::readback-list", async (data) => {
      calls.push(data);
      return { success: true, readbacks: [] };
    });
    register();

    await sdk.trigger(
      "api::readback-verify",
      request({
        candidateId: "cand_1",
        memoryId: "mem_1",
        queries: ["短句偏好"],
        limit: 5,
        mode: "smart-search",
        ignored: "drop me",
      }),
    );
    await sdk.trigger(
      "api::readback-list",
      request(undefined, {
        candidateId: "cand_1",
        memoryId: "mem_1",
        limit: "5",
      }),
    );

    expect(calls).toEqual([
      {
        candidateId: "cand_1",
        memoryId: "mem_1",
        queries: ["短句偏好"],
        limit: 5,
        mode: "smart-search",
      },
      { candidateId: "cand_1", memoryId: "mem_1", limit: 5 },
    ]);
  });
});
