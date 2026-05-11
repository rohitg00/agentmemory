import { afterEach, describe, expect, it, vi } from "vitest";
import { DedupMap } from "../src/functions/dedup.js";

const maps: DedupMap[] = [];

afterEach(() => {
  for (const map of maps) map.stop();
  maps.length = 0;
  vi.useRealTimers();
});

function makeMap(): DedupMap {
  const map = new DedupMap();
  maps.push(map);
  return map;
}

describe("DedupMap", () => {
  it("hashes stable inputs and truncates long payloads", () => {
    const map = makeMap();
    const longA = "x".repeat(500) + "a";
    const longB = "x".repeat(500) + "b";

    expect(map.computeHash("s", "Read", { path: "a" })).toBe(map.computeHash("s", "Read", { path: "a" }));
    expect(map.computeHash("s", "Read", longA)).toBe(map.computeHash("s", "Read", longB));
    expect(map.computeHash("s", "Read", null)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("records duplicates until entries expire", () => {
    vi.useFakeTimers();
    const map = makeMap();
    const hash = map.computeHash("s", "Write", "payload");

    expect(map.isDuplicate(hash)).toBe(false);
    map.record(hash);
    expect(map.size).toBe(1);
    expect(map.isDuplicate(hash)).toBe(true);

    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    expect(map.isDuplicate(hash)).toBe(false);
    expect(map.size).toBe(0);
  });

  it("removes expired entries during interval cleanup", () => {
    vi.useFakeTimers();
    const map = makeMap();
    const hash = map.computeHash("s", "Write", "payload");

    map.record(hash);
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);

    (map as any).cleanup();

    expect(map.size).toBe(0);
  });
});
