import { describe, it, expect, afterEach } from "vitest";
import { getSessionSweepIntervalMs } from "../src/config.js";

const KEY = "SESSION_SWEEP_INTERVAL_MS";
const DEFAULT_MS = 900_000;
const MIN_MS = 60_000;
const TIMER_MAX_MS = 2_147_483_647;

afterEach(() => {
  delete process.env[KEY];
});

describe("getSessionSweepIntervalMs", () => {
  it("defaults when unset", () => {
    expect(getSessionSweepIntervalMs()).toBe(DEFAULT_MS);
  });

  it("passes a sane value through", () => {
    process.env[KEY] = "300000";
    expect(getSessionSweepIntervalMs()).toBe(300_000);
  });

  it.each(["", "abc", "NaN"])(
    "falls back rather than yielding NaN for %j",
    (raw) => {
      // setInterval treats a NaN delay as ~1ms, which would run the sweep in a
      // hot loop.
      process.env[KEY] = raw;
      const ms = getSessionSweepIntervalMs();
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(MIN_MS);
    },
  );

  it.each(["0", "-1", "1000"])("floors a too-small value (%s)", (raw) => {
    process.env[KEY] = raw;
    expect(getSessionSweepIntervalMs()).toBe(MIN_MS);
  });

  it("caps a value above Node's maximum timer delay", () => {
    // Above 2^31-1 setInterval also collapses to ~1ms, so too-large fails the
    // same way garbage does.
    process.env[KEY] = "99999999999";
    expect(getSessionSweepIntervalMs()).toBe(TIMER_MAX_MS);
  });
});
