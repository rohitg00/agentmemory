import { describe, expect, it } from "vitest";
import { ENGINE_FLUSH_WAIT_CAP_MS, engineFlushWaitMs } from "../src/cli/engine-config.js";

const persistedState = [
  "id: iii-state",
  "value:",
  "  adapter:",
  "    config:",
  "      file_path: /data/state_store.db",
  "      store_method: file_based",
  "    name: kv",
].join("\n");

describe("engine flush wait on stop", () => {
  it("waits one default save interval plus margin for the file store", () => {
    expect(engineFlushWaitMs("file", [persistedState])).toBe(6500);
  });

  it("falls back to the default window when no config can be read", () => {
    expect(engineFlushWaitMs("file", [])).toBe(6500);
  });

  it("follows a configured save interval", () => {
    const custom = `${persistedState}\n      save_interval_ms: 2000`;
    expect(engineFlushWaitMs("file", [custom, "save_interval_ms: 9000"])).toBe(3500);
  });

  it("caps a very long save interval", () => {
    expect(engineFlushWaitMs("file", ["save_interval_ms: 600000"])).toBe(ENGINE_FLUSH_WAIT_CAP_MS);
  });

  it("does not wait for the redis state backend", () => {
    expect(engineFlushWaitMs("redis", [persistedState])).toBe(0);
  });
});
