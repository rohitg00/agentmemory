import { describe, it, expect } from "vitest";
import {
  recencyFactor,
  decayMultiplier,
  applyTemporalDecay,
  effectiveTimestampMs,
  DEFAULT_TEMPORAL_DECAY,
  type TemporalDecayParams,
} from "../src/functions/temporal-decay.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function params(overrides: Partial<TemporalDecayParams> = {}): TemporalDecayParams {
  return { ...DEFAULT_TEMPORAL_DECAY, enabled: true, ...overrides };
}

describe("recencyFactor", () => {
  it("is 1.0 at age zero", () => {
    expect(recencyFactor(0, 14)).toBe(1);
  });

  it("is 0.5 at exactly one half-life", () => {
    expect(recencyFactor(14 * MS_PER_DAY, 14)).toBeCloseTo(0.5, 10);
  });

  it("is 0.25 at two half-lives", () => {
    expect(recencyFactor(28 * MS_PER_DAY, 14)).toBeCloseTo(0.25, 10);
  });

  it("decreases monotonically with age", () => {
    const a = recencyFactor(1 * MS_PER_DAY, 14);
    const b = recencyFactor(5 * MS_PER_DAY, 14);
    const c = recencyFactor(30 * MS_PER_DAY, 14);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it("treats negative age (clock skew) as fresh", () => {
    expect(recencyFactor(-1000, 14)).toBe(1);
  });

  it("disables decay for a non-positive half-life", () => {
    expect(recencyFactor(100 * MS_PER_DAY, 0)).toBe(1);
    expect(recencyFactor(100 * MS_PER_DAY, -5)).toBe(1);
  });

  it("never returns a value outside (0, 1]", () => {
    for (const days of [0.5, 1, 7, 90, 365, 3650]) {
      const f = recencyFactor(days * MS_PER_DAY, 14);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe("decayMultiplier", () => {
  it("is bounded in [floor, 1]", () => {
    const p = params({ floor: 0.2 });
    for (const days of [0, 1, 14, 100, 1000]) {
      for (const imp of [0, 0.5, 1]) {
        const m = decayMultiplier(days * MS_PER_DAY, imp, p);
        expect(m).toBeGreaterThanOrEqual(0.2 - 1e-9);
        expect(m).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("reaches the floor asymptotically for an ancient unimportant memory", () => {
    const p = params({ floor: 0.2, importanceWeight: 0.2 });
    // 1000 half-lives: recency ~0, importance 0 -> multiplier -> floor +
    // (1-floor)*baseWeight. baseWeight = 1 - 0.5 - 0.2 = 0.3.
    const m = decayMultiplier(14000 * MS_PER_DAY, 0, p);
    expect(m).toBeCloseTo(0.2 + 0.8 * 0.3, 6);
  });

  it("is 1.0 for a fresh maximally-important memory", () => {
    const p = params({ floor: 0.2, recencyWeight: 0.5, importanceWeight: 0.2 });
    const m = decayMultiplier(0, 1, p);
    expect(m).toBeCloseTo(1, 6);
  });

  it("ranks a fresh memory above an old one of equal importance", () => {
    const p = params();
    const fresh = decayMultiplier(0, 0.5, p);
    const old = decayMultiplier(60 * MS_PER_DAY, 0.5, p);
    expect(fresh).toBeGreaterThan(old);
  });

  it("lets importance slow decay (important old > unimportant old)", () => {
    const p = params({ importanceWeight: 0.4 });
    const important = decayMultiplier(60 * MS_PER_DAY, 1, p);
    const trivial = decayMultiplier(60 * MS_PER_DAY, 0, p);
    expect(important).toBeGreaterThan(trivial);
  });

  it("normalizes weights that sum above 1 without going below floor", () => {
    const p = params({ recencyWeight: 0.9, importanceWeight: 0.9, floor: 0.1 });
    const m = decayMultiplier(1000 * MS_PER_DAY, 0, p);
    expect(m).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });
});

describe("applyTemporalDecay", () => {
  const now = Date.parse("2026-06-13T00:00:00.000Z");

  it("is a pass-through when disabled", () => {
    const p = params({ enabled: false });
    const out = applyTemporalDecay(
      0.05,
      { effectiveTimestampMs: 0, importance: 0 },
      p,
      now,
    );
    expect(out).toBe(0.05);
  });

  it("scales relevance down for stale memories", () => {
    const p = params();
    const old = now - 90 * MS_PER_DAY;
    const out = applyTemporalDecay(
      0.05,
      { effectiveTimestampMs: old, importance: 0.3 },
      p,
      now,
    );
    expect(out).toBeLessThan(0.05);
    expect(out).toBeGreaterThan(0);
  });

  it("preserves relevance ordering it cannot invert within the floor", () => {
    // A vastly more relevant but old hit should still be able to beat a
    // marginally relevant fresh hit, thanks to the floor.
    const p = params({ floor: 0.3 });
    const oldButRelevant = applyTemporalDecay(
      0.1,
      { effectiveTimestampMs: now - 120 * MS_PER_DAY, importance: 0.5 },
      p,
      now,
    );
    const freshButWeak = applyTemporalDecay(
      0.02,
      { effectiveTimestampMs: now, importance: 0.5 },
      p,
      now,
    );
    expect(oldButRelevant).toBeGreaterThan(freshButWeak);
  });
});

describe("effectiveTimestampMs", () => {
  it("uses the observation timestamp when there is no access", () => {
    const ts = "2026-06-01T00:00:00.000Z";
    expect(effectiveTimestampMs(ts)).toBe(Date.parse(ts));
  });

  it("uses last access when it is more recent (reinforcement)", () => {
    const created = "2026-01-01T00:00:00.000Z";
    const accessed = "2026-06-10T00:00:00.000Z";
    expect(effectiveTimestampMs(created, accessed)).toBe(Date.parse(accessed));
  });

  it("keeps creation time when it is more recent than a stale access row", () => {
    const created = "2026-06-10T00:00:00.000Z";
    const accessed = "2026-01-01T00:00:00.000Z";
    expect(effectiveTimestampMs(created, accessed)).toBe(Date.parse(created));
  });

  it("handles missing/invalid timestamps without throwing", () => {
    expect(effectiveTimestampMs(undefined)).toBe(0);
    expect(effectiveTimestampMs("not-a-date")).toBe(0);
    expect(effectiveTimestampMs("not-a-date", "also-bad")).toBe(0);
  });
});
