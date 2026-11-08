import { describe, expect, it } from "vitest";
import { publishedCompatibilityErrors } from "../scripts/plugins/verify-published.mjs";
import { III_PINNED_VERSION } from "../src/version.js";

const local = { version: "0.9.30", dependencies: { "iii-sdk": III_PINNED_VERSION, "@iii-dev/helpers": III_PINNED_VERSION } };
const shim = { version: "0.9.30", dependencies: { "@agentmemory/agentmemory": "0.9.30" } };

describe("published plugin compatibility gate", () => {
  it("accepts an exact runtime, engine SDK, helper, and shim match", () => {
    expect(publishedCompatibilityErrors(local, local, shim)).toEqual([]);
  });
  it("rejects a reused version with legacy 0.11.2 protocol dependencies", () => {
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
