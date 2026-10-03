import { describe, it, expect } from "vitest";
import { deriveEventId, isValidEventId, stableStringify } from "../src/capture/event-id.js";

describe("capture event id derivation", () => {
  const content = { tool_name: "Bash", tool_input: { command: "npm test" }, tool_output: "12 passed" };

  it("uses the host id when the payload carries one, whatever the content", () => {
    const a = deriveEventId("post_tool_use", "s1", { tool_use_id: "toolu_01" }, content);
    const b = deriveEventId("post_tool_use", "s1", { tool_use_id: "toolu_01" }, { ...content, tool_output: "changed" });
    expect(a).toBe(b);
    expect(a.startsWith("evh_")).toBe(true);
    expect(isValidEventId(a)).toBe(true);
  });

  it("keeps two host events with identical content apart", () => {
    const a = deriveEventId("post_tool_use", "s1", { tool_use_id: "toolu_01" }, content);
    const b = deriveEventId("post_tool_use", "s1", { tool_use_id: "toolu_02" }, content);
    expect(a).not.toBe(b);
  });

  it("hashes session, hook type and content when there is no host id", () => {
    const a = deriveEventId("post_tool_use", "s1", {}, content);
    expect(a.startsWith("evc_")).toBe(true);
    expect(deriveEventId("post_tool_use", "s1", {}, { ...content })).toBe(a);
    expect(deriveEventId("post_tool_use", "s2", {}, content)).not.toBe(a);
    expect(deriveEventId("post_tool_failure", "s1", {}, content)).not.toBe(a);
    expect(deriveEventId("post_tool_use", "s1", {}, { ...content, tool_output: "13 passed" })).not.toBe(a);
  });

  it("separates identical content by the host timestamp when present", () => {
    const a = deriveEventId("prompt_submit", "s1", { timestamp: "2026-10-01T10:00:00Z" }, { prompt: "continue" });
    const b = deriveEventId("prompt_submit", "s1", { timestamp: "2026-10-01T10:05:00Z" }, { prompt: "continue" });
    expect(a).not.toBe(b);
  });

  it("does not depend on object key order", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
    expect(deriveEventId("post_tool_use", "s1", {}, { tool_input: { a: 1, b: 2 } })).toBe(
      deriveEventId("post_tool_use", "s1", {}, { tool_input: { b: 2, a: 1 } }),
    );
  });

  it("validates event ids", () => {
    expect(isValidEventId("evh_0123456789abcdef")).toBe(true);
    expect(isValidEventId("short")).toBe(false);
    expect(isValidEventId("has space in it")).toBe(false);
    expect(isValidEventId(42)).toBe(false);
    expect(isValidEventId("x".repeat(129))).toBe(false);
  });
});
