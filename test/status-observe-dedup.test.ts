import { describe, it, expect } from "vitest";
import { evaluateStatus, renderStatusHtml, type StatusInputs } from "../src/functions/status.js";

function inputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return {
    now: new Date("2026-09-24T12:00:00.000Z"),
    version: "0.9.29",
    engineVersion: "0.22.1",
    uptimeSeconds: 125,
    stateBackend: "file",
    ports: { rest: 3111, streams: 3112, viewer: 3113 },
    health: { status: "healthy", alerts: [], notes: [], connectionState: "connected" },
    circuitBreaker: { state: "closed", failures: 0 },
    functionMetrics: [],
    provider: "llm",
    embeddingProvider: "embeddings",
    flags: [],
    index: {
      bm25Documents: 117,
      vectorDocuments: 117,
      observationsIndexed: 110,
      missingObservations: 0,
      sessions: 95,
      bm25Incomplete: false,
      pendingVectorBackfill: 0,
    },
    graph: null,
    graphExtractionEnabled: true,
    auditLegacy: null,
    ...overrides,
  };
}

describe("observe repeat counter", () => {
  it("reports and renders skipped repeated tool calls", () => {
    const report = evaluateStatus(inputs({ observeDedup: { skippedSinceStart: 4, windowSeconds: 300 } }));
    expect(report.observeDedup).toEqual({ skippedSinceStart: 4, windowSeconds: 300 });
    const html = renderStatusHtml(report, "n");
    expect(html).toContain("Repeats skipped");
    expect(html).toContain("4 since start");
  });

  it("leaves the counter out when it is not reported", () => {
    const report = evaluateStatus(inputs());
    expect(report.observeDedup).toBeNull();
    expect(renderStatusHtml(report, "n")).not.toContain("Repeats skipped");
  });
});
