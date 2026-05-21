import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

async function freshPrefs() {
  vi.resetModules();
  return await import("../src/cli/preferences.js");
}

describe("cli preferences", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-prefs-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("returns defaults when no preferences file exists", async () => {
    const { readPrefs } = await freshPrefs();
    const p = readPrefs();
    expect(p.schemaVersion).toBe(1);
    expect(p.lastAgent).toBeNull();
    expect(p.lastAgents).toEqual([]);
    expect(p.lastProvider).toBeNull();
    expect(p.skipSplash).toBe(false);
    expect(p.skipNpxHint).toBe(false);
    expect(p.firstRunAt).toBeNull();
  });

  it("isFirstRun is true when no preferences file exists", async () => {
    const { isFirstRun } = await freshPrefs();
    expect(isFirstRun()).toBe(true);
  });

  it("writePrefs persists values and merges with existing keys", async () => {
    const { writePrefs, readPrefs, prefsPath } = await freshPrefs();
    writePrefs({ lastAgent: "claude-code", lastAgents: ["claude-code", "cursor"] });
    let p = readPrefs();
    expect(p.lastAgent).toBe("claude-code");
    expect(p.lastAgents).toEqual(["claude-code", "cursor"]);
    expect(p.lastProvider).toBeNull();

    writePrefs({ lastProvider: "anthropic", skipSplash: true });
    p = readPrefs();
    expect(p.lastAgent).toBe("claude-code");
    expect(p.lastProvider).toBe("anthropic");
    expect(p.skipSplash).toBe(true);

    const raw = JSON.parse(readFileSync(prefsPath(), "utf-8"));
    expect(raw.schemaVersion).toBe(1);
    expect(raw.lastAgents).toEqual(["claude-code", "cursor"]);
  });

  it("isFirstRun flips to false after firstRunAt is recorded", async () => {
    const { writePrefs, isFirstRun } = await freshPrefs();
    writePrefs({ firstRunAt: new Date().toISOString() });
    expect(isFirstRun()).toBe(false);
  });

  it("readPrefs falls back to defaults when the file is corrupt", async () => {
    const { readPrefs, prefsDir, prefsPath } = await freshPrefs();
    mkdirSync(prefsDir(), { recursive: true });
    writeFileSync(prefsPath(), "{not json", "utf-8");
    const p = readPrefs();
    expect(p.lastAgent).toBeNull();
    expect(p.schemaVersion).toBe(1);
  });

  it("readPrefs forces schemaVersion to 1 even when the file lies", async () => {
    const { readPrefs, prefsDir, prefsPath } = await freshPrefs();
    mkdirSync(prefsDir(), { recursive: true });
    writeFileSync(
      prefsPath(),
      JSON.stringify({ schemaVersion: 99, lastAgent: "cursor" }),
      "utf-8",
    );
    const p = readPrefs();
    expect(p.schemaVersion).toBe(1);
    expect(p.lastAgent).toBe("cursor");
  });

  it("resetPrefs removes the file", async () => {
    const { writePrefs, resetPrefs, isFirstRun, prefsPath } = await freshPrefs();
    writePrefs({ firstRunAt: new Date().toISOString() });
    expect(isFirstRun()).toBe(false);
    resetPrefs();
    expect(() => readFileSync(prefsPath())).toThrow();
    expect(isFirstRun()).toBe(true);
  });
});
