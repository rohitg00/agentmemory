import { describe, expect, it } from "vitest";
import {
  DURABLE_CANDIDATE_MIN_CONFIDENCE,
  buildDurableCandidateId,
  materializeDurableCandidate,
  normalizeDurableText,
} from "../src/functions/durable-candidate-utils.js";

describe("durable candidate normalization", () => {
  it("removes relative time phrases but preserves concrete dates and versions", () => {
    const normalized = normalizeDurableText(
      "Yesterday we pinned v0.9.27 on 2026-07-10 in PR #579",
    );

    expect(normalized).not.toContain("yesterday");
    expect(normalized).toContain("2026-07-10");
    expect(normalized).toContain("v0.9.27");
    expect(normalized).toContain("pr #579");
  });

  it("builds a stable id across whitespace and relative-time variations", () => {
    const a = buildDurableCandidateId({
      sessionId: "sess_1",
      type: "workflow",
      title: "Archive promote flow",
      content: "Today archive candidates are promoted manually.",
      sourceObservationIds: ["obs_b", "obs_a"],
    });
    const b = buildDurableCandidateId({
      sessionId: "sess_1",
      type: "workflow",
      title: " archive promote flow ",
      content: "archive candidates are promoted manually yesterday",
      sourceObservationIds: ["obs_a", "obs_b"],
    });

    expect(a).toBe(b);
  });
});

describe("materializeDurableCandidate", () => {
  it("caps no-evidence candidates to 0.6 and keeps them force-only", () => {
    const candidate = materializeDurableCandidate({
      sessionId: "sess_1",
      type: "fact",
      title: "No evidence",
      content: "Long-lived fact without source observation ids.",
      confidence: 0.95,
      createdAt: "2026-07-10T00:00:00.000Z",
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.confidence).toBe(0.6);
    expect(candidate?.sourceObservationIds).toEqual([]);
  });

  it("drops candidates below the minimum generation threshold", () => {
    const candidate = materializeDurableCandidate({
      sessionId: "sess_1",
      type: "fact",
      title: "Too weak",
      content: "This should not survive thresholding.",
      confidence: DURABLE_CANDIDATE_MIN_CONFIDENCE - 0.01,
      createdAt: "2026-07-10T00:00:00.000Z",
      sourceObservationIds: ["obs_1"],
    });

    expect(candidate).toBeNull();
  });

  it("filters hallucinated observation ids against the known session ids", () => {
    const candidate = materializeDurableCandidate({
      sessionId: "sess_1",
      type: "architecture",
      title: "Candidate",
      content: "Only real observation ids should survive.",
      confidence: 0.8,
      createdAt: "2026-07-10T00:00:00.000Z",
      sourceObservationIds: ["obs_real", "obs_fake"],
      validObservationIds: new Set(["obs_real"]),
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.sourceObservationIds).toEqual(["obs_real"]);
  });
});
