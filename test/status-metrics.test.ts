import { describe, expect, it } from "vitest";
import {
  countMemories,
  countSessionObservations,
} from "../src/cli/status-metrics.js";

describe("countSessionObservations", () => {
  it("sums observationCount across sessions", () => {
    expect(
      countSessionObservations([
        { observationCount: 2 },
        { observationCount: 3 },
        { observationCount: 0 },
      ]),
    ).toBe(5);
  });

  it("ignores missing and invalid observation counts", () => {
    expect(
      countSessionObservations([
        {},
        { observationCount: -1 },
        { observationCount: "4" },
        { observationCount: Number.NaN },
        { observationCount: 1.9 },
      ]),
    ).toBe(1);
  });
});

describe("countMemories", () => {
  it("prefers the count endpoint total when present", () => {
    expect(countMemories({ total: 7 })).toBe(7);
  });

  it("falls back to memories array length", () => {
    expect(countMemories({ memories: [{}, {}, {}] })).toBe(3);
  });

  it("returns zero for unknown shapes", () => {
    expect(countMemories(undefined)).toBe(0);
    expect(countMemories({ total: -1 })).toBe(0);
    expect(countMemories({ memories: "nope" })).toBe(0);
  });
});
