import { describe, expect, it, vi } from "vitest";
import { registerGraphIndexApi } from "../src/triggers/graph-index-api.js";
import { checkAuth } from "../src/triggers/api.js";

function setup(result: unknown = { success: true, state: "building", jobId: "job" }) {
  const handlers = new Map<string, (data: any) => Promise<any>>();
  const sdk = { registerFunction: (id: string, fn: (data: any) => Promise<any>) => handlers.set(id, fn), registerTrigger: vi.fn(), trigger: vi.fn(async () => result) };
  registerGraphIndexApi(sdk as never, "profile-secret", checkAuth);
  const request = (command: string, body?: unknown, authorization = "Bearer profile-secret", method = command === "status" ? "GET" : "POST") =>
    handlers.get(`api::graph-index-${command}`)!({ method, body, headers: { authorization } });
  return { sdk, request };
}

describe("graph index API", () => {
  it.each(["status", "migrate", "resume"])("authenticates %s before reading or writing graph state", async (command) => {
    const { sdk, request } = setup();
    expect((await request(command, { allowLegacyScan: true }, "Bearer another-profile")).status_code).toBe(401);
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("uses a bounded status function and disables response caching", async () => {
    const { sdk, request } = setup({ state: "needs-migration" });
    expect(await request("status")).toMatchObject({ status_code: 200, headers: { "Cache-Control": "no-store" }, body: { state: "needs-migration" } });
    expect(sdk.trigger).toHaveBeenCalledWith({ function_id: "mem::graph-index-status", payload: {} });
  });

  it.each(["true", 1, null, [], {}])("rejects non-boolean discovery consent (%j)", async (value) => {
    const { sdk, request } = setup();
    expect((await request("migrate", { allowLegacyScan: value })).status_code).toBe(400);
    expect(sdk.trigger).not.toHaveBeenCalled();
  });

  it("whitelists the consent flag and returns accepted without waiting for migration", async () => {
    const { sdk, request } = setup();
    expect((await request("migrate", { allowLegacyScan: true, generation: "foreign", scope: "private", reset: true })).status_code).toBe(202);
    expect(sdk.trigger).toHaveBeenCalledWith({ function_id: "mem::graph-index-migrate", payload: { allowLegacyScan: true } });
  });

  it("resume does not silently authorize discovery", async () => {
    const { sdk, request } = setup();
    expect((await request("resume", {})).status_code).toBe(202);
    expect(sdk.trigger).toHaveBeenCalledWith({ function_id: "mem::graph-index-resume", payload: { allowLegacyScan: false } });
  });

  it.each([["consent-required", 400], ["invalid-state", 409], ["no-job", 409], ["storage-unavailable", 503]])("reports %s as HTTP%i", async (code, status) => {
    const { request } = setup({ success: false, code, error: "refused" });
    expect((await request("resume", {})).status_code).toBe(status);
  });

  it("returns 200 for an already ready index", async () => {
    const { request } = setup({ success: true, state: "ready" });
    expect((await request("migrate", { allowLegacyScan: true })).status_code).toBe(200);
  });
});
