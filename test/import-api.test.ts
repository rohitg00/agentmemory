import { describe, expect, it, vi } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

const SECRET = "synthetic-import-secret";
const exportData = { version: "0.9.33", sessions: [], observations: {}, memories: [], summaries: [] };

function setup() {
  const sdk = mockSdk();
  const importing = vi.fn(async () => ({ success: true }));
  sdk.fns.set("mem::import", importing);
  registerApiTriggers(sdk as never, mockKV() as never, SECRET);
  const call = (body: unknown, authorized = true) => sdk.fns.get("api::import")!({
    headers: authorized ? { authorization: `Bearer ${SECRET}` } : {},
    body,
  });
  return { call, importing };
}

describe("POST /agentmemory/import", () => {
  it.each([undefined, "merge", "replace", "skip"])("forwards only the export and valid strategy %s", async (strategy) => {
    const { call, importing } = setup();
    expect(await call({ exportData, strategy, imagePins: ["unexpected"], secret: "unexpected" }))
      .toMatchObject({ status_code: 200, body: { success: true } });
    expect(importing).toHaveBeenCalledExactlyOnceWith({ exportData, strategy });
  });

  it.each([null, "", "overwrite", 1, {}, ["replace"]])("rejects an invalid strategy before dispatch: %j", async (strategy) => {
    const { call, importing } = setup();
    expect(await call({ exportData, strategy })).toMatchObject({ status_code: 400 });
    expect(importing).not.toHaveBeenCalled();
  });

  it("requires both authentication and an export before dispatch", async () => {
    const { call, importing } = setup();
    expect(await call({ exportData }, false)).toMatchObject({ status_code: 401 });
    expect(await call(undefined)).toMatchObject({ status_code: 400 });
    expect(importing).not.toHaveBeenCalled();
  });
});
