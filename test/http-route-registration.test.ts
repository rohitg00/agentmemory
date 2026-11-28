import { afterEach, describe, expect, it, vi } from "vitest";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../src/state/kv.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { createHttpRegistrationRecorder, type TriggerRegistration } from "./helpers/http-registrations.js";
import oracle from "./fixtures/http-route-registration.json";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const secret = "route-test-secret";

async function boot(value: string | undefined) {
  vi.resetModules();
  const { registerApiTriggers, checkAuth } = await import("../src/triggers/api.js");
  const { registerEventTriggers } = await import("../src/triggers/events.js");
  const { registerViewerStreamTriggers } = await import("../src/triggers/viewer-streams.js");
  const { registerViewerSse } = await import("../src/triggers/viewer-sse.js");
  const { registerMcpEndpoints } = await import("../src/mcp/server.js");
  const sdk = mockSdk();
  const kv = mockKV();
  const capture = createHttpRegistrationRecorder();
  const registrationSdk = { ...sdk, registerTrigger: capture.recordTrigger };
  const client = registrationSdk as unknown as IIIClient;
  const state = kv as unknown as StateKV;
  registerApiTriggers(client, state, value);
  registerEventTriggers(client, state);
  registerViewerStreamTriggers(client, state, { secret: value });
  registerViewerSse(client);
  registerMcpEndpoints(client, state, value);
  return { sdk, kv, capture, checkAuth };
}

function status(response: unknown): number {
  if (typeof response !== "object" || response === null ||
      !("status_code" in response) || typeof response.status_code !== "number") {
    throw new Error("Expected an HTTP response with a numeric status_code");
  }
  return response.status_code;
}

async function dispatchWrongBearer(sdk: ReturnType<typeof mockSdk>, route: TriggerRegistration) {
  const request = { method: String(route.config.http_method ?? "GET"), path: route.config.api_path,
    path_params: {}, query_params: {}, body: {},
    headers: { authorization: "Bearer wrong", "content-type": "application/json" } };
  const middleware = route.config.middleware_function_ids;
  if (middleware !== undefined) {
    if (!Array.isArray(middleware)) throw new Error("Expected middleware IDs to be an array");
    for (const id of middleware) {
      if (typeof id !== "string") throw new Error("Expected a string middleware ID");
      const outcome = await sdk.trigger({ function_id: id, payload: { request } });
      if (typeof outcome !== "object" || outcome === null || !("action" in outcome)) {
        throw new Error("Expected an HTTP middleware action");
      }
      if (outcome.action === "respond" && "response" in outcome) return status(outcome.response);
      if (outcome.action !== "continue") throw new Error("Unexpected HTTP middleware action");
    }
  }
  return status(await sdk.trigger({ function_id: route.function_id, payload: request }));
}

describe("boot HTTP registration and authentication contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const configured of [false, true]) {
    it(`preserves the complete ordered boot registry with secret ${configured ? "configured" : "unset"}`, async () => {
      const h = await boot(configured ? secret : undefined);
      const actual = h.capture.snapshot();
      expect(actual).toEqual(oracle.map(({ registration }) => ({ transport: "trigger", registration })));
      expect(actual).toHaveLength(153);
      for (const row of actual) {
        if (row.transport !== "trigger") throw new Error("Unexpected boot registration transport");
        expect(h.sdk.fns.has(row.registration.function_id), row.registration.function_id).toBe(true);
      }
      expect(h.kv.store.size).toBe(0);
    });

    it(`preserves real auth guards and bounded safe handlers with secret ${configured ? "configured" : "unset"}`, async () => {
      const value = configured ? secret : undefined;
      const h = await boot(value);
      for (const [name, headers] of [
        ["missing", { "content-type": "application/json" }],
        ["wrong", { "content-type": "application/json", authorization: "Bearer wrong" }],
        ["correct", { "content-type": "application/json", authorization: `Bearer ${secret}` }],
        ["hostile-origin", { "content-type": "application/json", authorization: `Bearer ${secret}`, origin: "https://untrusted.example" }],
      ] as const) {
        const request = { method: "POST", headers, body: {}, query_params: {} };
        const result = await h.sdk.trigger({ function_id: "middleware::api-auth", payload: { request } });
        const direct = h.checkAuth(request as never, value);
        const expected = name === "hostile-origin" ? 403 : configured && name !== "correct" ? 401 : undefined;
        expect(direct?.status_code, name).toBe(expected);
        expect(result, name).toEqual(expected
          ? { action: "respond", response: direct }
          : { action: "continue" });
      }
      for (const target of ["api::config-flags", "api::graph-index-status", "mcp::tools::list"]) {
        const fanout = vi.fn(async () => ({ ready: true }));
        h.sdk.fns.set("mem::graph-index-status", fanout);
        const invoke = (token: string) => h.sdk.trigger({ function_id: target, payload: {
          method: "GET", headers: { authorization: `Bearer ${token}` }, query_params: {},
        } });
        expect(status(await invoke("wrong")), target).toBe(configured ? 401 : 200);
        if (configured) expect(fanout).not.toHaveBeenCalled();
        expect(status(await invoke(secret)), target).toBe(200);
        if (target === "api::graph-index-status") expect(fanout).toHaveBeenCalledTimes(configured ? 1 : 2);
      }
      expect(status(await h.sdk.trigger({ function_id: "api::liveness", payload: {
        method: "GET", headers: { authorization: "Bearer wrong" },
      } }))).toBe(200);
      expect(h.kv.store.size).toBe(0);
    });
  }

  it("denies a wrong bearer on every protected route, including handlers without middleware", async () => {
    const h = await boot(secret);
    const actual = h.capture.snapshot();
    expect(actual).toEqual(oracle.map(({ registration }) => ({ transport: "trigger", registration })));
    const observations = [];
    for (const row of actual) {
      if (row.transport !== "trigger") throw new Error("Unexpected boot registration transport");
      const wrongBearerStatus = await dispatchWrongBearer(h.sdk, row.registration);
      observations.push({ registration: row.registration, wrongBearerStatus,
        authRequiredWhenSecretConfigured: wrongBearerStatus === 401 });
    }
    expect(observations).toEqual(oracle);
    expect(observations.filter((row) => row.authRequiredWhenSecretConfigured)).toHaveLength(152);
    expect(observations.filter((row) => !row.authRequiredWhenSecretConfigured).map((row) => row.registration.function_id))
      .toEqual(["api::liveness"]);
    expect(h.kv.store.size).toBe(0);
  });
});
