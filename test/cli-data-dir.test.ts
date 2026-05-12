import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { resolveDataDir } from "../src/cli-data-dir.js";

describe("resolveDataDir", () => {
  it("prefers --data-dir over AGENTMEMORY_DATA_DIR", () => {
    const cwd = "/repo/project";
    const home = "/home/alex";
    const resolved = resolveDataDir({
      args: ["--data-dir", "~/flag-state"],
      env: { AGENTMEMORY_DATA_DIR: "~/env-state" },
      cwd,
      home,
      platform: "linux",
    });

    expect(resolved).toEqual({
      dataDir: join(home, "flag-state"),
      source: "flag",
    });
  });

  it("uses AGENTMEMORY_DATA_DIR when --data-dir is absent", () => {
    const cwd = "/repo/project";
    const home = "/home/alex";
    const resolved = resolveDataDir({
      args: [],
      env: { AGENTMEMORY_DATA_DIR: "~/env-state" },
      cwd,
      home,
      platform: "linux",
    });

    expect(resolved).toEqual({
      dataDir: join(home, "env-state"),
      source: "env",
    });
  });

  it("defaults to a platform data directory outside cwd", () => {
    const cwd = "/repo/project";
    const home = "/home/alex";
    const resolved = resolveDataDir({
      args: [],
      env: {},
      cwd,
      home,
      platform: "linux",
    });

    expect(resolved).toEqual({
      dataDir: join(home, ".local", "share", "agentmemory"),
      source: "default",
    });
    expect(resolved.dataDir.startsWith(cwd)).toBe(false);
  });

  it("uses the macOS Application Support default", () => {
    const home = "/Users/alex";
    const resolved = resolveDataDir({
      args: [],
      env: {},
      cwd: "/repo/project",
      home,
      platform: "darwin",
    });

    expect(resolved).toEqual({
      dataDir: join(home, "Library", "Application Support", "agentmemory"),
      source: "default",
    });
  });
});
