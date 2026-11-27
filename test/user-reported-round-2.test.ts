import { afterEach, describe, expect, it } from "vitest";
import { getCompressionTimeoutMs, COMPRESSION_TIMEOUT_MS } from "../src/functions/compress.js";
import { buildJaccardClusters } from "../src/functions/reflect.js";
import { getVectorBackfillReason, getVectorBackfillState, setVectorBackfillState } from "../src/functions/search.js";
import { parseCompressionXml } from "../src/prompts/compression-output.js";
import type { SemanticMemory } from "../src/types.js";

const observation = (fact: string, title = "Ran the test suite") => `<observation>
<type>command</type><title>${title}</title>
<facts><fact>${fact}</fact></facts>
<narrative>Ran the command and read the result.</narrative>
<concepts><concept>testing</concept></concepts><files><file>src/rows.rs</file></files>
<importance>5</importance></observation>`;

describe("compression output with unescaped text", () => {
  it("keeps shell and generic syntax the model did not escape", () => {
    expect(parseCompressionXml(observation("Redirected stderr to stdout with `2>&1`"))?.facts).toEqual(["Redirected stderr to stdout with `2>&1`"]);
    expect(parseCompressionXml(observation("Original signature: fn rows(v: Vec<Row>) -> Option<usize>"))?.facts).toEqual([
      "Original signature: fn rows(v: Vec<Row>) -> Option<usize>",
    ]);
    expect(parseCompressionXml(observation("ok", "git status && npm test"))?.title).toBe("git status && npm test");
    expect(parseCompressionXml(observation("The page starts with <h2>Setup</h2>"))?.facts).toEqual(["The page starts with <h2>Setup</h2>"]);
  });

  it("still decodes entities and rejects schema tags inside text", () => {
    expect(parseCompressionXml(observation("a &amp; b &lt; c"))?.facts).toEqual(["a & b < c"]);
    expect(parseCompressionXml(observation("first <fact>second"))).toBeNull();
    expect(parseCompressionXml(observation("ok", "<title>Other</title>"))).toBeNull();
  });
});

describe("compression time budget", () => {
  const previous = process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS;
  afterEach(() => {
    if (previous === undefined) delete process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS;
    else process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS = previous;
  });

  it("reads AGENTMEMORY_COMPRESS_TIMEOUT_MS and falls back on a value out of range", () => {
    delete process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS;
    expect(getCompressionTimeoutMs()).toBe(COMPRESSION_TIMEOUT_MS);
    process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS = "180000";
    expect(getCompressionTimeoutMs()).toBe(180_000);
    for (const bad of ["0", "999", "600001", "2m", "-5"]) {
      process.env.AGENTMEMORY_COMPRESS_TIMEOUT_MS = bad;
      expect(getCompressionTimeoutMs()).toBe(COMPRESSION_TIMEOUT_MS);
    }
  });
});

describe("reflect clusters without a concept graph", () => {
  const fact = (id: string, text: string) => ({ id, fact: text }) as SemanticMemory;

  it("continues past a word that already joined a cluster", () => {
    const clusters = buildJaccardClusters(
      [
        fact("s1", "redis cache layer timeout"),
        fact("s2", "redis cache layer eviction"),
        fact("s3", "postgres index vacuum bloat"),
        fact("s4", "postgres index vacuum autovacuum"),
      ],
      [],
      10,
    );
    expect(clusters).toEqual([["redis", "cache", "layer"], ["postgres", "index", "vacuum"]]);
  });

  it("stops at the cluster limit", () => {
    const clusters = buildJaccardClusters(
      [
        fact("s1", "redis cache layer timeout"),
        fact("s2", "redis cache layer eviction"),
        fact("s3", "postgres index vacuum bloat"),
        fact("s4", "postgres index vacuum autovacuum"),
      ],
      [],
      1,
    );
    expect(clusters).toHaveLength(1);
  });
});

describe("vector backfill pause reason", () => {
  afterEach(() => setVectorBackfillState("idle"));

  it("keeps the reason only while the backfill is paused", () => {
    setVectorBackfillState("paused", "Vector recovery did not start for this run.");
    expect(getVectorBackfillState()).toBe("paused");
    expect(getVectorBackfillReason()).toBe("Vector recovery did not start for this run.");
    setVectorBackfillState("running");
    expect(getVectorBackfillReason()).toBeNull();
  });
});
