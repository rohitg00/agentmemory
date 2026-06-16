import { describe, expect, it, vi } from "vitest";
import {
  buildVectorDimensionMismatchError,
  handleVectorDimensionMismatch,
  shellQuote,
} from "../src/boot/vector-dim-recovery.js";
import { VectorIndex } from "../src/state/vector-index.js";

describe("vector dimension recovery", () => {
  it("quotes the env file path in the recovery command", () => {
    expect(shellQuote("/Users/Agent Test/.agentmemory/.env")).toBe(
      "'/Users/Agent Test/.agentmemory/.env'",
    );
    expect(shellQuote("/Users/o'hara/.agentmemory/.env")).toBe(
      "'/Users/o'\"'\"'hara/.agentmemory/.env'",
    );
  });

  it("builds an actionable mismatch error with resolved paths", () => {
    const error = buildVectorDimensionMismatchError({
      activeDim: 384,
      activeProviderName: "local",
      dataDir: "/Users/Agent Test/.agentmemory",
      envFile: "/Users/Agent Test/.agentmemory/.env",
      envFileExists: true,
      loadedVectorSize: 2,
      mismatches: [
        { obsId: "obs_1", dim: 2048 },
        { obsId: "obs_2", dim: 2048 },
      ],
      seenDimensions: new Set([2048]),
    });

    expect(error.message).toContain("persisted vector index has 2 of 2");
    expect(error.message).toContain(
      "env file: /Users/Agent Test/.agentmemory/.env (exists: true)",
    );
    expect(error.message).toContain(
      "echo 'AGENTMEMORY_DROP_STALE_INDEX=true' >> '/Users/Agent Test/.agentmemory/.env'",
    );
  });

  it("persists an empty vector snapshot once when drop-stale recovery is enabled", async () => {
    const loadedVector = new VectorIndex();
    loadedVector.add("obs_1", "ses_1", new Float32Array(2048));
    const targetVector = new VectorIndex();
    targetVector.add("existing", "ses_1", new Float32Array(384));
    const save = vi.fn(async () => {});
    const warn = vi.fn();

    const result = await handleVectorDimensionMismatch({
      activeDim: 384,
      activeProviderName: "local",
      dataDir: "/Users/test/.agentmemory",
      dropStale: true,
      envFile: "/Users/test/.agentmemory/.env",
      envFileExists: false,
      indexPersistence: { save },
      loadedVector,
      targetVector,
      warn,
    });

    expect(result).toBe("dropped");
    expect(targetVector.size).toBe(0);
    expect(save).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("AGENTMEMORY_DROP_STALE_INDEX=true is set"),
    );
  });
});
