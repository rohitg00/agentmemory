import { describe, expect, it } from "vitest";
import {
  findIiiConfigPath,
  iiiReleaseAsset,
  iiiReleaseUrl,
  renderRuntimeIiiConfig,
  resolveDataDir,
} from "../src/cli/build-runtime.js";

describe("CLI build/runtime helpers", () => {
  it("maps supported Node platform and arch pairs to pinned iii release assets", () => {
    expect(iiiReleaseAsset("darwin", "arm64")).toBe("iii-aarch64-apple-darwin.tar.gz");
    expect(iiiReleaseAsset("darwin", "x64")).toBe("iii-x86_64-apple-darwin.tar.gz");
    expect(iiiReleaseAsset("linux", "x64")).toBe("iii-x86_64-unknown-linux-gnu.tar.gz");
    expect(iiiReleaseAsset("linux", "arm64")).toBe("iii-aarch64-unknown-linux-gnu.tar.gz");
    expect(iiiReleaseAsset("linux", "arm")).toBe("iii-armv7-unknown-linux-gnueabihf.tar.gz");
    expect(iiiReleaseAsset("win32", "x64")).toBe("iii-x86_64-pc-windows-msvc.zip");
    expect(iiiReleaseAsset("win32", "arm64")).toBe("iii-aarch64-pc-windows-msvc.zip");
  });

  it("returns null for unsupported iii release platform and arch pairs", () => {
    expect(iiiReleaseAsset("freebsd", "x64")).toBeNull();
    expect(iiiReleaseAsset("linux", "ppc64")).toBeNull();
    expect(iiiReleaseUrl("0.11.2", "freebsd", "x64")).toBeNull();
  });

  it("builds GitHub release URLs with the monorepo iii tag path", () => {
    expect(iiiReleaseUrl("0.11.2", "darwin", "arm64")).toBe(
      "https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz",
    );
  });

  it("finds iii config in the documented precedence order", () => {
    const existing = new Set([
      "/project/iii-config.yaml",
      "/home/.agentmemory/iii-config.yaml",
      "/pkg/iii-config.yaml",
      "/dist/iii-config.yaml",
    ]);

    expect(
      findIiiConfigPath({
        envPath: "/env/iii-config.yaml",
        cwd: "/project",
        homeDir: "/home",
        moduleDir: "/dist",
        packageRootDir: "/pkg",
        exists: (path) => path === "/env/iii-config.yaml" || existing.has(path),
      }),
    ).toBe("/env/iii-config.yaml");

    expect(
      findIiiConfigPath({
        cwd: "/project",
        homeDir: "/home",
        moduleDir: "/dist",
        packageRootDir: "/pkg",
        exists: (path) => existing.has(path),
      }),
    ).toBe("/project/iii-config.yaml");
  });

  it("prefers package-root bundled config before the volatile dist copy", () => {
    expect(
      findIiiConfigPath({
        cwd: "/project",
        homeDir: "/home",
        moduleDir: "/dist",
        packageRootDir: "/pkg",
        exists: (path) => path === "/pkg/iii-config.yaml" || path === "/dist/iii-config.yaml",
      }),
    ).toBe("/pkg/iii-config.yaml");
  });

  it("returns an empty path when no iii config candidate exists", () => {
    expect(
      findIiiConfigPath({
        cwd: "/project",
        homeDir: "/home",
        moduleDir: "/dist",
        packageRootDir: "/pkg",
        exists: () => false,
      }),
    ).toBe("");
  });

  it("resolves the engine data dir from flag, env, then platform default outside cwd", () => {
    expect(
      resolveDataDir({
        args: ["--data-dir", "~/flag-state"],
        env: { AGENTMEMORY_DATA_DIR: "~/env-state" },
        cwd: "/work/repo",
        homeDir: "/home/alex",
      }),
    ).toEqual({
      dataDir: "/home/alex/flag-state",
      source: "flag",
    });

    expect(
      resolveDataDir({
        args: [],
        env: { AGENTMEMORY_DATA_DIR: "relative-state" },
        cwd: "/work/repo",
        homeDir: "/home/alex",
      }),
    ).toEqual({
      dataDir: "/work/repo/relative-state",
      source: "env",
    });

    expect(
      resolveDataDir({
        args: [],
        env: {},
        cwd: "/work/repo",
        homeDir: "/home/alex",
      }),
    ).toEqual({
      dataDir: "/home/alex/.agentmemory/data",
      source: "default",
    });
  });

  it("renders runtime iii config with absolute state paths under the data dir", () => {
    const rendered = renderRuntimeIiiConfig(
      [
        "workers:",
        "  - name: iii-state",
        "    config:",
        "      adapter:",
        "        config:",
        "          file_path: ./data/state_store.db",
        "  - name: iii-stream",
        "    config:",
        "      adapter:",
        "        config:",
        "          file_path: ./data/stream_store",
      ].join("\n"),
      "/home/alex/.local/share/agentmemory",
    );

    expect(rendered).toContain("file_path: '/home/alex/.local/share/agentmemory/state_store.db'");
    expect(rendered).toContain("file_path: '/home/alex/.local/share/agentmemory/stream_store'");
    expect(rendered).not.toContain("./data/");
  });
});
