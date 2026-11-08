import { describe, expect, it } from "vitest";
import { portFlagSuffix } from "../src/cli/ready-hint.js";

describe("ready hint port flags", () => {
  it("adds nothing on the default port", () => {
    expect(portFlagSuffix(3111, 0)).toBe("");
  });

  it("carries a custom --port into the suggested commands", () => {
    expect(portFlagSuffix(4321, 0)).toBe(" --port 4321");
  });

  it("uses --instance when the port comes from an instance block", () => {
    expect(portFlagSuffix(3211, 1)).toBe(" --instance 1");
  });

  it("prefers the live port when --port overrides an instance block", () => {
    expect(portFlagSuffix(4321, 1)).toBe(" --port 4321");
  });
});
