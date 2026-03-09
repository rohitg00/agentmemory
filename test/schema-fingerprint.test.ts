import { describe, it, expect } from "vitest";
import { fingerprintId, KV } from "../src/state/schema.js";

describe("fingerprintId", () => {
  it("returns string with correct prefix", () => {
    const id = fingerprintId("mem", "some content");
    expect(id).toMatch(/^mem_/);
  });

  it("same content produces same ID (deterministic)", () => {
    const id1 = fingerprintId("obs", "identical content here");
    const id2 = fingerprintId("obs", "identical content here");
    expect(id1).toBe(id2);
  });

  it("different content produces different IDs", () => {
    const id1 = fingerprintId("obs", "content alpha");
    const id2 = fingerprintId("obs", "content beta");
    expect(id1).not.toBe(id2);
  });

  it("different prefixes produce different IDs", () => {
    const id1 = fingerprintId("mem", "same content");
    const id2 = fingerprintId("obs", "same content");
    expect(id1).not.toBe(id2);
  });

  it("ID has sufficient length (prefix + underscore + 16 hex chars)", () => {
    const id = fingerprintId("mem", "test");
    const parts = id.split("_");
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe("mem");
    expect(parts[1]).toHaveLength(16);
    expect(parts[1]).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles empty content", () => {
    const id = fingerprintId("x", "");
    expect(id).toMatch(/^x_[0-9a-f]{16}$/);
  });

  it("handles long content", () => {
    const longContent = "a".repeat(10000);
    const id = fingerprintId("long", longContent);
    expect(id).toMatch(/^long_[0-9a-f]{16}$/);
  });
});

describe("KV scopes", () => {
  it("has actions scope", () => {
    expect(KV.actions).toBe("mem:actions");
  });

  it("has actionEdges scope", () => {
    expect(KV.actionEdges).toBe("mem:action-edges");
  });

  it("has leases scope", () => {
    expect(KV.leases).toBe("mem:leases");
  });

  it("has routines scope", () => {
    expect(KV.routines).toBe("mem:routines");
  });

  it("has routineRuns scope", () => {
    expect(KV.routineRuns).toBe("mem:routine-runs");
  });

  it("has signals scope", () => {
    expect(KV.signals).toBe("mem:signals");
  });

  it("has checkpoints scope", () => {
    expect(KV.checkpoints).toBe("mem:checkpoints");
  });

  it("has mesh scope", () => {
    expect(KV.mesh).toBe("mem:mesh");
  });
});
