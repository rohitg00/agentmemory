import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("adopts legacy data without sharing it with another instance", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-data-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, "data"));
    writeFileSync(join(cwd, "data", "iii-config.yaml"), "");
    const home = "/home/alex";
    const base = { cwd, home, platform: "linux" as const };
    const defaultDir = join(home, ".local", "share", "agentmemory");
    try {
      expect(resolveDataDir({ args: [], env: {}, ...base })).toEqual({
        dataDir: join(cwd, "data"),
        source: "default",
      });
      expect(
        resolveDataDir({
          args: ["--instance", "1"],
          env: { XDG_DATA_HOME: join(cwd, "xdg") },
          ...base,
        }),
      ).toEqual({
        dataDir: join(defaultDir, "instance-1"),
        source: "default",
        relocatedFrom: join(cwd, "xdg", "agentmemory"),
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not adopt an unrelated data directory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-data-"));
    mkdirSync(join(cwd, ".git"));
    mkdirSync(join(cwd, "data"));
    const home = "/home/alex";
    try {
      expect(
        resolveDataDir({
          args: [],
          env: {},
          cwd,
          home,
          platform: "linux",
        }),
      ).toEqual({
        dataDir: join(home, ".local", "share", "agentmemory"),
        source: "default",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps an XDG data directory outside the current git worktree", () => {
    const cwd = mkdtempSync(join(tmpdir(), "agentmemory-data-"));
    mkdirSync(join(cwd, ".git"));
    const xdgDataHome = mkdtempSync(join(tmpdir(), "agentmemory-xdg-"));
    try {
      expect(
        resolveDataDir({
          args: [],
          env: { XDG_DATA_HOME: xdgDataHome },
          cwd,
          home: "/home/alex",
          platform: "linux",
        }),
      ).toEqual({
        dataDir: join(xdgDataHome, "agentmemory"),
        source: "default",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(xdgDataHome, { recursive: true, force: true });
    }
  });
});
