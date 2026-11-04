import { describe, expect, it } from "vitest";
import { supersededAt } from "../src/state/memory-utils.js";

describe("supersededAt", () => {
  it("uses the successor's timestamp when it is later than the stored one", () => {
    expect(supersededAt("2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toBe("2026-01-02T00:00:00.000Z");
  });

  it("moves one millisecond past a stored timestamp equal to now", () => {
    expect(supersededAt("2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toBe("2026-01-02T00:00:00.001Z");
  });

  it("moves one millisecond past a stored timestamp ahead of now", () => {
    expect(supersededAt("2026-01-03T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toBe("2026-01-03T00:00:00.001Z");
  });

  it("uses now when the stored timestamp is missing or invalid", () => {
    expect(supersededAt(undefined, "2026-01-02T00:00:00.000Z")).toBe("2026-01-02T00:00:00.000Z");
    expect(supersededAt("not-a-date", "2026-01-02T00:00:00.000Z")).toBe("2026-01-02T00:00:00.000Z");
  });
});
