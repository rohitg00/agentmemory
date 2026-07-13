import { describe, expect, it } from "vitest";
import { loadRecallConfig } from "../src/config.js";

describe("recall config boundaries", () => {
  it("accepts zero-valued quantity limits from environment overrides", () => {
    const config = loadRecallConfig({
      AGENTMEMORY_RECALL_MAX_CONTEXT_TOKENS: "0",
      AGENTMEMORY_RECALL_RESERVED_BOOTSTRAP_TOKENS: "0",
      AGENTMEMORY_RECALL_MAX_SEMANTIC_TOKENS: "0",
      AGENTMEMORY_RECALL_MAX_MEMORIES: "0",
      AGENTMEMORY_RECALL_MAX_SESSION_SUMMARIES: "0",
      AGENTMEMORY_RECALL_MAX_OBSERVATIONS: "0",
      AGENTMEMORY_RECALL_MAX_CONTINUITY_ITEMS: "0",
      AGENTMEMORY_RECALL_TRACE_RETENTION_DAYS: "0",
      AGENTMEMORY_RECALL_TRACE_MAX_TRACES: "0",
      AGENTMEMORY_RECALL_TRACE_MAX_DROPPED_ITEMS_PER_REASON: "0",
      AGENTMEMORY_RECALL_REINJECTION_TURN_WINDOW: "0",
    });

    expect(config).toMatchObject({
      budget: {
        maxContextTokens: 0,
        reservedBootstrapTokens: 0,
        maxSemanticTokens: 0,
        maxMemories: 0,
        maxSessionSummaries: 0,
        maxObservations: 0,
        maxContinuityItems: 0,
      },
      trace: { retentionDays: 0, maxTraces: 0, maxDroppedItemsPerReason: 0 },
      injection: { reinjectionTurnWindow: 0 },
    });
  });
});
