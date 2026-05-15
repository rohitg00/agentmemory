import { afterEach, describe, expect, it, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";

type ApiResponse = {
  status_code: number;
  body: unknown;
};

type ApiHandler = (req: {
  body?: unknown;
  headers?: Record<string, string>;
}) => Promise<ApiResponse>;

function createSdk(
  triggerImpl: (input: { function_id: string; payload: unknown }) => Promise<unknown>,
) {
  const functions = new Map<string, ApiHandler>();
  const sdk = {
    registerFunction: vi.fn((id: string, handler: ApiHandler) => {
      functions.set(id, handler);
    }),
    registerTrigger: vi.fn(),
    trigger: vi.fn(triggerImpl),
  };

  return { sdk, functions };
}

describe("graph REST endpoints", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { apiFunction: "api::graph-query", request: { headers: {} } },
    { apiFunction: "api::graph-stats", request: { headers: {} } },
    { apiFunction: "api::graph-extract", request: { headers: {} } },
  ])("returns disabled response for $apiFunction when graph extraction is off", async ({
    apiFunction,
    request,
  }) => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "false");
    const { sdk, functions } = createSdk(async () => ({ ok: true }));

    registerApiTriggers(sdk as never, {} as never);
    const response = await functions.get(apiFunction)!(request);

    expect(response.status_code).toBe(503);
    expect(response.body).toMatchObject({
      error: "Knowledge graph not enabled",
      flag: "GRAPH_EXTRACTION_ENABLED",
    });
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("returns graph stats when graph extraction is on", async () => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "true");
    const stats = { success: true, nodes: 2, edges: 1 };
    const { sdk, functions } = createSdk(async () => stats);

    registerApiTriggers(sdk as never, {} as never);
    const response = await functions.get("api::graph-stats")!({ headers: {} });

    expect(response).toEqual({ status_code: 200, body: stats });
    expect(sdk.trigger).toHaveBeenCalledWith({
      function_id: "mem::graph-stats",
      payload: {},
    });
  });

  it.each([
    {
      apiFunction: "api::graph-query",
      memFunction: "mem::graph-query",
      request: { headers: {}, body: { query: "index" } },
    },
    {
      apiFunction: "api::graph-stats",
      memFunction: "mem::graph-stats",
      request: { headers: {} },
    },
    {
      apiFunction: "api::graph-extract",
      memFunction: "mem::graph-extract",
      request: { headers: {}, body: { observations: [{ id: "obs-1" }] } },
    },
  ])("reports $memFunction trigger failures separately from disabled graph extraction", async ({
    apiFunction,
    memFunction,
    request,
  }) => {
    vi.stubEnv("GRAPH_EXTRACTION_ENABLED", "true");
    const { sdk, functions } = createSdk(async () => {
      throw new Error(`iii::engine Function not found: ${memFunction}`);
    });

    registerApiTriggers(sdk as never, {} as never);
    const response = await functions.get(apiFunction)!(request);

    expect(response.status_code).toBe(500);
    expect(response.body).toMatchObject({
      error: "Knowledge graph request failed",
      functionId: memFunction,
      message: `iii::engine Function not found: ${memFunction}`,
    });
  });
});
