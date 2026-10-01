import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeMetadataPath } from "../src/runtime-paths.js";

describe("runtime metadata paths", () => {
  it("uses an explicit runtime directory so instances do not share metadata", () => {
    expect(
      runtimeMetadataPath("engine-state.json", {
        env: { AGENTMEMORY_RUNTIME_DIR: "/var/lib/agentmemory/instance-2" },
        home: "/home/test",
      }),
    ).toBe(join("/var/lib/agentmemory/instance-2", "engine-state.json"));
  });

  it("keeps instance-zero lifecycle state canonical across data-dir changes", () => {
    expect(
      runtimeMetadataPath("engine-state.json", {
        env: { AGENTMEMORY_DATA_DIR: "/var/lib/agentmemory/custom" },
        home: "/home/test",
      }),
    ).toBe(join("/home/test", ".agentmemory", "engine-state.json"));
  });

  it("keeps the legacy home fallback for direct worker launches", () => {
    expect(runtimeMetadataPath("worker.pid", { env: {}, home: "/home/test" })).toBe(
      join("/home/test", ".agentmemory", "worker.pid"),
    );
  });
});
