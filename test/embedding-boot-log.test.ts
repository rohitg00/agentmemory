import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// createEmbeddingProvider() (src/providers/embedding/index.ts) returns null
// for TWO different reasons: EMBEDDING_PROVIDER=none (a deliberate
// opt-out) and an unrecognized value (a typo - the switch's
// `default: return null`). The boot log used to hardcode
// "EMBEDDING_PROVIDER=none" in both cases, blaming the opt-out even when
// the user never set it - in the feature meant to make embedding
// misconfiguration loud, the loud line misattributed the cause. This is
// a structural (source-regex) check, matching the idiom
// test/stop-worker-pidfile.test.ts and test/evict.test.ts's "eviction
// scheduling" block already use for boot-time wiring in src/index.ts.
describe("embedding boot log reports the resolved value, not a hardcoded cause", () => {
  it("interpolates embeddingConfig.provider instead of a literal 'none'", () => {
    const source = readFileSync("src/index.ts", "utf-8");
    expect(source).not.toMatch(
      /bootLog\(\s*"Embeddings: disabled \(EMBEDDING_PROVIDER=none\)"\s*\)/,
    );
    expect(source).toMatch(
      /bootLog\(\s*`Embeddings: disabled \(EMBEDDING_PROVIDER=\$\{embeddingConfig\.provider[^}]*\}\)`,?\s*\);/,
    );
  });
});
