import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installNativeBundles, prepareNativeBundle } from "../src/cli/connect/native-install.js";

const fault = vi.hoisted(() => ({ destination: "" }));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: (source: string, destination: string) => {
    if (destination === fault.destination) throw new Error("Synthetic rename failure");
    return fs.renameSync(source, destination);
  } };
});

describe("native installation transaction", () => {
  let home: string;
  let source: string;
  let target: string;
  let config: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "native-install-"));
    source = join(home, "source"); target = join(home, "installed"); config = join(home, "config.json");
    mkdirSync(source); writeFileSync(join(source, "plugin.mjs"), "version one");
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
    fault.destination = "";
  });
  afterEach(() => { fault.destination = ""; vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  const plan = () => prepareNativeBundle(source, target, "test-plugin", ["plugin.mjs"], false);
  it("rolls back the installed bundle if activation fails and preserves config plus user files", () => {
    installNativeBundles([plan()], config, '{"version":1}\n');
    writeFileSync(join(target, "custom.txt"), "keep");
    writeFileSync(join(source, "plugin.mjs"), "version two");
    fault.destination = config;
    expect(() => installNativeBundles([plan()], config, '{"version":2}\n')).toThrow("Synthetic rename failure");
    expect(readFileSync(join(target, "plugin.mjs"), "utf8")).toBe("version one");
    expect(readFileSync(join(target, "custom.txt"), "utf8")).toBe("keep");
    expect(readFileSync(config, "utf8")).toBe('{"version":1}\n');
    expect(readdirSync(home).some((name) => name.includes(".stage-") || name.includes(".previous-"))).toBe(false);
  });
  it("removes new bundles when activating a fresh install fails", () => {
    fault.destination = config;
    expect(() => installNativeBundles([plan()], config, "{}\n")).toThrow("Synthetic rename failure");
    expect(existsSync(target)).toBe(false); expect(existsSync(config)).toBe(false);
  });
  it("removes obsolete managed files while retaining unknown user files", () => {
    writeFileSync(join(source, "old.mjs"), "old");
    installNativeBundles([plan()], config, "{}\n");
    writeFileSync(join(target, "custom.txt"), "keep");
    rmSync(join(source, "old.mjs"));
    installNativeBundles([plan()], config, "{}\n");
    expect(existsSync(join(target, "old.mjs"))).toBe(false);
    expect(readFileSync(join(target, "custom.txt"), "utf8")).toBe("keep");
  });
  it("reports recovery guidance for truncated manifests without changing installed files", () => {
    installNativeBundles([plan()], config, "{}\n");
    const manifest = join(target, ".agentmemory-install.json");
    writeFileSync(manifest, '{"files":');
    expect(plan).toThrow(/Invalid native install manifest.*restore its backup/);
    expect(readFileSync(manifest, "utf8")).toBe('{"files":');
    expect(readFileSync(join(target, "plugin.mjs"), "utf8")).toBe("version one");
    expect(readFileSync(config, "utf8")).toBe("{}\n");
  });
  it("rejects an install manifest that tries to remove files outside its bundle", () => {
    mkdirSync(target);
    writeFileSync(join(target, ".agentmemory-install.json"), JSON.stringify({ files: { "../config.json": "hash" } }));
    writeFileSync(config, "keep");
    expect(plan).toThrow("Invalid native install path");
    expect(readFileSync(config, "utf8")).toBe("keep");
  });
  it.skipIf(process.platform === "win32")("does not follow symbolic links in source or destination bundles", () => {
    symlinkSync(source, target, "dir");
    expect(plan).toThrow("symbolic links");
    rmSync(target); symlinkSync(config, join(source, "foreign"));
    expect(plan).toThrow("symbolic links");
  });
});
