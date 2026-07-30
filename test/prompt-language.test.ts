import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_OUTPUT_LANGUAGE = process.env["AGENTMEMORY_OUTPUT_LANGUAGE"];

async function loadPromptSystems() {
  vi.resetModules();
  const [compression, summary, graph, reflect] = await Promise.all([
    import("../src/prompts/compression.js"),
    import("../src/prompts/summary.js"),
    import("../src/prompts/graph-extraction.js"),
    import("../src/prompts/reflect.js"),
  ]);
  return {
    compression: compression.COMPRESSION_SYSTEM,
    summary: summary.SUMMARY_SYSTEM,
    reduce: summary.REDUCE_SYSTEM,
    graph: graph.GRAPH_EXTRACTION_SYSTEM,
    reflect: reflect.REFLECT_SYSTEM,
  };
}

describe("prompt output language", () => {
  afterEach(() => {
    if (ORIGINAL_OUTPUT_LANGUAGE === undefined) {
      delete process.env["AGENTMEMORY_OUTPUT_LANGUAGE"];
    } else {
      process.env["AGENTMEMORY_OUTPUT_LANGUAGE"] = ORIGINAL_OUTPUT_LANGUAGE;
    }
    vi.resetModules();
  });

  it("defaults to matching the dominant input language", async () => {
    delete process.env["AGENTMEMORY_OUTPUT_LANGUAGE"];

    const systems = await loadPromptSystems();

    for (const system of Object.values(systems)) {
      expect(system).toContain("Match the dominant natural language");
      expect(system).toContain("If the input is Chinese");
    }
  });

  it("supports forcing zh-CN human-readable output", async () => {
    process.env["AGENTMEMORY_OUTPUT_LANGUAGE"] = "zh-CN";

    const systems = await loadPromptSystems();

    for (const system of Object.values(systems)) {
      expect(system).toContain("Write human-readable output in zh-CN");
      expect(system).toContain("Do not translate source-language user wording");
    }
  });

  it("preserves machine-readable XML structure and enums", async () => {
    process.env["AGENTMEMORY_OUTPUT_LANGUAGE"] = "zh-CN";

    const systems = await loadPromptSystems();

    expect(systems.compression).toContain("observation type enum values");
    expect(systems.summary).toContain("XML tag names");
    expect(systems.reduce).toContain("XML tag names");
    expect(systems.graph).toContain("relationship type enum values");
    expect(systems.reflect).toContain("attribute names");
  });
});
