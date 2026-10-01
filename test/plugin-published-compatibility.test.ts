import { describe, expect, it } from "vitest";
import { publishedCompatibilityErrors } from "../scripts/plugins/verify-published.mjs";

const local = { version: "0.10.0", dependencies: { "iii-sdk": "0.22.1", "@iii-dev/helpers": "0.22.1" } };
const shim = { version: "0.10.0", dependencies: { "@agentmemory/agentmemory": "0.10.0" } };

describe("published plugin compatibility gate", () => {
  it("accepts an exact runtime, engine SDK, helper, and shim match", () => {
    expect(publishedCompatibilityErrors(local, local, shim)).toEqual([]);
  });
  it("rejects a reused version with a different engine protocol dependency", () => {
    const old = { ...local, dependencies: { "iii-sdk": "0.11.2", "@iii-dev/helpers": "0.11.2" } };
    expect(publishedCompatibilityErrors(local, old, shim)).toHaveLength(2);
  });
  it("rejects a shim that can resolve a different runtime release", () => {
    const floating = { ...shim, dependencies: { "@agentmemory/agentmemory": "~0.9.0" } };
    expect(publishedCompatibilityErrors(local, local, floating)).toEqual([
      "The published MCP shim must pin the exact matching runtime version.",
    ]);
  });
  it("rejects stale or missing package metadata", () => {
    expect(publishedCompatibilityErrors(local, { version: "0.9.29" }, { version: "0.9.29" })).toHaveLength(5);
  });
});
