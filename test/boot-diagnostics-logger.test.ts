import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { EmbeddingProvider } from "../src/types.js";

// #931-class fix: `bootLog` (src/logger.ts) only reaches stderr when
// --verbose / AGENTMEMORY_VERBOSE is set (setBootVerbose is called from
// exactly one place, src/cli.ts, driven by a CLI flag a daemon start
// never passes). Otherwise the line is pushed into an in-memory buffer
// that nothing ever reads (getBootBuffer has exactly one occurrence in
// the repo: its own definition). So on a live daemon deploy, every
// bootLog-only line was silently discarded. This suite proves the
// embedding boot probe also reaches `logger`, which does land in the
// daemon's stderr log.
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  bootLog: vi.fn(),
}));

import { logger, bootLog } from "../src/logger.js";
import { reportEmbeddingProbeResult } from "../src/providers/embedding/index.js";

function fakeProvider(
  overrides: Partial<EmbeddingProvider> & Pick<EmbeddingProvider, "embedBatch">,
): EmbeddingProvider {
  return {
    name: "test-provider",
    dimensions: 768,
    embed: async () => new Float32Array(768),
    ...overrides,
  };
}

describe("boot diagnostics reach the daemon log via logger, not just bootLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("reportEmbeddingProbeResult (the embedding boot probe from src/index.ts)", () => {
    it("success: logs via logger.info with the provider name and dimensions as structured fields", async () => {
      const provider = fakeProvider({
        name: "gemini",
        dimensions: 768,
        embedBatch: async (texts) => texts.map(() => new Float32Array(768)),
      });

      await reportEmbeddingProbeResult(provider);

      expect(logger.info).toHaveBeenCalledWith("Embedding provider verified", {
        provider: "gemini",
        dimensions: 768,
      });
      expect(logger.warn).not.toHaveBeenCalled();
      // bootLog is kept alongside for --verbose parity.
      expect(bootLog).toHaveBeenCalledWith("Embeddings: gemini (768d)");
    });

    it("failure: logs via logger.warn, including the underlying error and the BM25-only degradation", async () => {
      const boom = new Error("ECONNREFUSED");
      const provider = fakeProvider({
        name: "local",
        dimensions: 384,
        embedBatch: async () => {
          throw boom;
        },
      });

      // The call site in src/index.ts dispatches this fire-and-forget
      // (`void reportEmbeddingProbeResult(embeddingProvider)`), so
      // main() itself never awaits the failure branch settling. Calling
      // the exported function directly and awaiting it here is the only
      // way to observe that branch run to completion.
      await reportEmbeddingProbeResult(provider);

      expect(logger.warn).toHaveBeenCalledWith(
        "Embedding provider failed boot probe - semantic search degrades to BM25-only",
        { provider: "local", error: "ECONNREFUSED" },
      );
      expect(logger.info).not.toHaveBeenCalled();
      expect(bootLog).toHaveBeenCalledWith(
        "Embeddings: local FAILED - semantic search will be BM25-only. ECONNREFUSED",
      );
    });

    it("fails the probe when embedBatch returns a wrong-dimension vector, since the index guard would drop every batch", async () => {
      const provider = fakeProvider({
        name: "test-provider",
        dimensions: 768,
        embedBatch: async (texts) => texts.map(() => new Float32Array(10)),
      });

      await reportEmbeddingProbeResult(provider);

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        "Embedding provider failed boot probe - semantic search degrades to BM25-only",
        {
          provider: "test-provider",
          error:
            "embedBatch returned 1 vector(s) of length 10, expected 1 of length 768",
        },
      );
    });

    it("never rejects even when embedBatch() throws, so the fire-and-forget dispatch cannot surface an unhandled rejection", async () => {
      const provider = fakeProvider({
        embedBatch: async () => {
          throw new Error("boom");
        },
      });

      await expect(reportEmbeddingProbeResult(provider)).resolves.toBeUndefined();
    });
  });
});

// The EMBEDDING_PROVIDER=none / disabled branch is left inline in
// main() (src/index.ts) rather than extracted, since extracting it
// would have required renaming the `embeddingConfig.provider`
// expression that test/embedding-boot-log.test.ts already asserts on
// verbatim. main() itself cannot be invoked from a unit test at all:
// importing src/index.ts runs `main().catch(...)` as a module-level
// side effect, which registers a real iii-sdk worker and opens real
// HTTP listeners - reaching this branch behaviorally would mean
// standing up the whole daemon, which is disproportionate for one log
// line. So this is a structural check instead, matching the idiom
// test/stop-worker-pidfile.test.ts and test/embedding-boot-log.test.ts
// already use for boot-time wiring in src/index.ts.
describe("embedding-disabled boot line also reaches logger.info (structural)", () => {
  it("logs the disabled/opt-out case via logger.info immediately before the existing bootLog line", () => {
    const source = readFileSync("src/index.ts", "utf-8");
    expect(source).toMatch(
      /logger\.info\(\s*"Embeddings disabled",\s*\{\s*provider:\s*embeddingConfig\.provider\s*\?\?\s*"none",\s*\}\s*\);\s*bootLog\(\s*`Embeddings: disabled/,
    );
  });
});
