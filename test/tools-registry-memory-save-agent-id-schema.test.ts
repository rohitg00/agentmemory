import { describe, it, expect } from "vitest";

import { getAllTools } from "../src/mcp/tools-registry.js";

describe("memory_save tool schema exposes agentId", () => {
  it("declares a string agentId property", () => {
    const tool = getAllTools().find((t) => t.name === "memory_save");
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties["agentId"]?.type).toBe("string");
  });

  it("keeps required as [content] and does not change the total tool count", () => {
    const tool = getAllTools().find((t) => t.name === "memory_save");
    expect(tool!.inputSchema.required).toEqual(["content"]);
    expect(getAllTools().length).toBe(54);
  });
});
