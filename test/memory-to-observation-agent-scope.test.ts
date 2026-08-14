import { describe, it, expect } from "vitest";

import { memoryToObservation } from "../src/state/memory-utils.js";
import type { Memory } from "../src/types.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_test_1",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    type: "fact",
    title: "test memory",
    content: "test content",
    concepts: [],
    files: [],
    sessionIds: [],
    strength: 1,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe("memoryToObservation agentId/project passthrough", () => {
  it("transparently passes through agentId and project", () => {
    const memory = makeMemory({ agentId: "pm-agent", project: "worker-config" });
    const observation = memoryToObservation(memory);
    expect(observation.agentId).toBe("pm-agent");
    expect(observation.project).toBe("worker-config");
  });

  it("leaves agentId/project undefined without defaults or errors", () => {
    const memory = makeMemory();
    expect(() => memoryToObservation(memory)).not.toThrow();
    const observation = memoryToObservation(memory);
    expect(observation.agentId).toBeUndefined();
    expect(observation.project).toBeUndefined();
  });
});
