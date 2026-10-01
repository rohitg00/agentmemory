import { describe, expect, it } from "vitest";
import { processStatIsRunning } from "../src/cli/process-state.js";

describe("processStatIsRunning", () => {
  it("treats zombie processes as stopped", () => {
    expect(processStatIsRunning("Z+")).toBe(false);
    expect(processStatIsRunning(" Z ")).toBe(false);
  });

  it("keeps active process states running", () => {
    expect(processStatIsRunning("S+")).toBe(true);
    expect(processStatIsRunning("R")).toBe(true);
  });
});
