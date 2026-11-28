import { createGraphIndexState } from "./helpers/graph-index-state.js";
import { initializeGraphIndex } from "../src/state/graph-retrieval-index.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerGraphFunction } from "../src/functions/graph.js";
import {
  GRAPH_PROMPT_MAX_LIST_ITEMS,
  GRAPH_PROMPT_MAX_NARRATIVE_CHARS,
  buildGraphExtractionPrompt,
} from "../src/prompts/graph-extraction.js";
import type { CompressedObservation, GraphNode } from "../src/types.js";

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, payload: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function obs(n: number): CompressedObservation {
  return {
    id: `obs_${n}`,
    sessionId: "ses_1",
    timestamp: `2026-02-01T10:00:0${n}Z`,
    type: "file_edit",
    title: `Observation ${n}`,
    facts: [],
    narrative: `Narrative ${n}`,
    concepts: [],
    files: [],
    importance: 5,
  };
}

function entityXml(name: string): string {
  return `<entities><entity type="function" name="${name}"/></entities><relationships></relationships>`;
}

function countObservations(prompt: string): number {
  return (prompt.match(/^\[\d+\] Type:/gm) ?? []).length;
}

describe("mem::graph-extract LLM batching", () => {
  const ORIG = {
    flag: process.env["GRAPH_EXTRACTION_ENABLED"],
    batch: process.env["GRAPH_EXTRACTION_BATCH_SIZE"],
  };
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof createGraphIndexState>["kv"];
  const provider = { name: "test", compress: vi.fn(), summarize: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env["GRAPH_EXTRACTION_ENABLED"] = "true";
    process.env["GRAPH_EXTRACTION_BATCH_SIZE"] = "2";
    sdk = mockSdk();
    kv = createGraphIndexState().kv;
    await initializeGraphIndex(kv, { status: "ready" });
    registerGraphFunction(sdk as never, kv as never, provider as never);
  });

  afterEach(() => {
    for (const [key, value] of [
      ["GRAPH_EXTRACTION_ENABLED", ORIG.flag],
      ["GRAPH_EXTRACTION_BATCH_SIZE", ORIG.batch],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends at most GRAPH_EXTRACTION_BATCH_SIZE observations per LLM call", async () => {
    provider.compress.mockImplementation(async () => entityXml("fn"));

    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [1, 2, 3, 4, 5].map(obs),
    })) as { success: boolean };

    expect(result.success).toBe(true);
    expect(provider.compress).toHaveBeenCalledTimes(3);
    const sizes = provider.compress.mock.calls.map(([, prompt]) => countObservations(prompt as string));
    expect(sizes).toEqual([2, 2, 1]);
  });

  it("keeps the entities of successful batches when another batch fails", async () => {
    provider.compress
      .mockResolvedValueOnce(entityXml("first"))
      .mockRejectedValueOnce(new Error("upstream 400"))
      .mockResolvedValueOnce(entityXml("third"));

    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [1, 2, 3, 4, 5].map(obs),
    })) as { success: boolean; nodesAdded: number };

    expect(result.success).toBe(true);
    const names = (await kv.list<GraphNode>("mem:graph:nodes")).map((n) => n.name).sort();
    expect(names).toEqual(["first", "third"]);
  });

  it("records only the batch's own observations as a node's sources", async () => {
    provider.compress
      .mockResolvedValueOnce(entityXml("first"))
      .mockResolvedValueOnce(entityXml("second"));

    await sdk.trigger("mem::graph-extract", { observations: [1, 2, 3].map(obs) });

    const nodes = await kv.list<GraphNode>("mem:graph:nodes");
    expect(nodes.find((n) => n.name === "first")?.sourceObservationIds.sort()).toEqual(["obs_1", "obs_2"]);
    expect(nodes.find((n) => n.name === "second")?.sourceObservationIds).toEqual(["obs_3"]);
  });

  it("fails when every batch fails and nothing was extracted", async () => {
    provider.compress.mockRejectedValue(new Error("model down"));

    const result = (await sdk.trigger("mem::graph-extract", {
      observations: [1, 2, 3].map(obs),
    })) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe("model down");
  });
});

describe("buildGraphExtractionPrompt bounds", () => {
  it("caps narrative length and list sizes per observation", () => {
    const many = Array.from({ length: GRAPH_PROMPT_MAX_LIST_ITEMS + 5 }, (_, i) => `item${i}`);
    const prompt = buildGraphExtractionPrompt([
      {
        type: "command_run",
        title: "Long capture",
        narrative: "x".repeat(GRAPH_PROMPT_MAX_NARRATIVE_CHARS * 4),
        concepts: many,
        files: many,
      },
    ]);

    expect(prompt).toContain("x".repeat(GRAPH_PROMPT_MAX_NARRATIVE_CHARS));
    expect(prompt).not.toContain("x".repeat(GRAPH_PROMPT_MAX_NARRATIVE_CHARS + 1));
    expect(prompt).toContain(`item${GRAPH_PROMPT_MAX_LIST_ITEMS - 1}`);
    expect(prompt).not.toContain(`item${GRAPH_PROMPT_MAX_LIST_ITEMS},`);
    expect(prompt).not.toContain(`item${GRAPH_PROMPT_MAX_LIST_ITEMS + 4}`);
  });
});
