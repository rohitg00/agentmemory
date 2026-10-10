import { describe, expect, it } from "vitest";
import { engineFlushWaitMs, engineSaveIntervalMs } from "../src/cli/engine-config.js";

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
    expect(engineFlushWaitMs("file", [custom])).toBe(3500);
  });

  it("waits for the longest save interval across all configs", () => {
    const custom = `${persistedState}\n      save_interval_ms: 2000`;
    expect(engineFlushWaitMs("file", [custom, "save_interval_ms: 9000"])).toBe(10500);
  });

  it("counts a file store without an explicit interval at the engine default", () => {
    const stateAndStream = [
      "  - name: iii-state",
      "        store_method: file_based",
      "        save_interval_ms: 2000",
      "  - name: iii-stream",
      "        store_method: file_based",
    ].join("\n");
    expect(engineSaveIntervalMs([stateAndStream])).toBe(5000);
  });

  it("does not cut a long configured interval short", () => {
    expect(engineFlushWaitMs("file", ["save_interval_ms: 600000"])).toBe(601500);
  });

  it("does not wait for the redis state backend", () => {
    expect(engineFlushWaitMs("redis", [persistedState])).toBe(0);
  });
});
