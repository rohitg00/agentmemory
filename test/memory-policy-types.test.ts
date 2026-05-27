import { describe, expect, it } from "vitest";
import { KV } from "../src/state/schema.js";

describe("memory metacognition KV scopes", () => {
  it("defines stable scopes for policy, candidates, readback, and suggestions", () => {
    expect(KV.memoryPolicy).toBe("mem:policy");
    expect(KV.writeCandidates).toBe("mem:write-candidates");
    expect(KV.readbackResults).toBe("mem:readback");
    expect(KV.policySuggestions).toBe("mem:policy-suggestions");
  });
});
