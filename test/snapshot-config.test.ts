import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSnapshotConfig } from "../src/config.js";

// loadSnapshotConfig reads getMergedEnv(), where process.env overrides the
// on-disk ~/.agentmemory/.env, so setting process.env here is authoritative.
//
// Regression (P1): a zero/negative SNAPSHOT_INTERVAL flowed straight into
// setInterval(fn, interval * 1000). Node clamps a non-positive delay to ~1ms,
// so the git-snapshot timer would fire on nearly every event-loop tick,
// saturating the worker with back-to-back full-state snapshots + commits.
// Non-positive values must fall back to the documented 3600s default.

const KEYS = ["SNAPSHOT_INTERVAL", "SNAPSHOT_ENABLED", "SNAPSHOT_DIR"] as const;
const DEFAULT_INTERVAL = 3600;

describe("loadSnapshotConfig interval validation", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("falls back to the default when interval is zero", () => {
    process.env["SNAPSHOT_INTERVAL"] = "0";
    expect(loadSnapshotConfig().interval).toBe(DEFAULT_INTERVAL);
  });

  it("falls back to the default when interval is negative", () => {
    process.env["SNAPSHOT_INTERVAL"] = "-5";
    expect(loadSnapshotConfig().interval).toBe(DEFAULT_INTERVAL);
  });

  it("falls back to the default when interval is non-numeric", () => {
    process.env["SNAPSHOT_INTERVAL"] = "not-a-number";
    expect(loadSnapshotConfig().interval).toBe(DEFAULT_INTERVAL);
  });

  it("uses the default when interval is unset", () => {
    expect(loadSnapshotConfig().interval).toBe(DEFAULT_INTERVAL);
  });

  it("accepts a valid positive interval unchanged", () => {
    process.env["SNAPSHOT_INTERVAL"] = "120";
    expect(loadSnapshotConfig().interval).toBe(120);
  });

  it("accepts the minimum floor of 1 second", () => {
    process.env["SNAPSHOT_INTERVAL"] = "1";
    expect(loadSnapshotConfig().interval).toBe(1);
  });

  it("never yields an interval that would clamp setInterval to sub-second", () => {
    for (const bad of ["0", "-1", "-3600", "0.5"]) {
      process.env["SNAPSHOT_INTERVAL"] = bad;
      expect(loadSnapshotConfig().interval).toBeGreaterThanOrEqual(1);
    }
  });

  it("reports enabled state from SNAPSHOT_ENABLED", () => {
    process.env["SNAPSHOT_ENABLED"] = "true";
    expect(loadSnapshotConfig().enabled).toBe(true);
    process.env["SNAPSHOT_ENABLED"] = "false";
    expect(loadSnapshotConfig().enabled).toBe(false);
  });
});
