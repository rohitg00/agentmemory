import { describe, it, expect } from "vitest";
import { SearchIndex } from "../src/state/search-index.js";
import type { CompressedObservation, Memory } from "../src/types.js";

// Mirrors the helper used by remember.ts and rebuildIndex(). Kept inline
// here rather than exporting from src/ so the test asserts the contract,
// not the implementation.
function memoryAsIndexable(memory: Memory): CompressedObservation {
  return {
    id: memory.id,
    sessionId: memory.sessionIds[0] ?? "memory",
    timestamp: memory.createdAt,
    type: "decision",
    title: memory.title,
    facts: [memory.content],
    narrative: memory.content,
    concepts: memory.concepts,
    files: memory.files,
    importance: memory.strength,
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "mem_test_001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    type: "fact",
    title: "BM25 test memory",
    content: "BM25 search returns this memory by keyword match",
    concepts: ["bm25", "search", "test"],
    files: [],
    sessionIds: [],
    strength: 7,
    version: 1,
    isLatest: true,
    ...overrides,
  };
}

describe("SearchIndex.has()", () => {
  it("returns false for unknown ids", () => {
    expect(new SearchIndex().has("mem_unknown")).toBe(false);
  });

  it("returns true after add()", () => {
    const idx = new SearchIndex();
    idx.add(memoryAsIndexable(makeMemory()));
    expect(idx.has("mem_test_001")).toBe(true);
  });
});

describe("memory indexing into SearchIndex (closes #257)", () => {
  it("makes a saved memory findable by keyword search", () => {
    const idx = new SearchIndex();
    idx.add(memoryAsIndexable(makeMemory({
      id: "mem_user_001",
      title: "JWT middleware uses jose for Edge compatibility",
      content: "Chose jose over jsonwebtoken because Cloudflare Workers don't ship Node crypto",
      concepts: ["auth", "jose", "edge"],
    })));

    const hits = idx.search("jose middleware", 5);
    expect(hits).toHaveLength(1);
    expect(hits[0].obsId).toBe("mem_user_001");
  });

  it("returns the memory when the issue's reproduction query is run", () => {
    // From issue #257: user saved a memory containing 'BM25 test'
    // keywords and the search returned empty — recall failure.
    const idx = new SearchIndex();
    idx.add(memoryAsIndexable(makeMemory({
      id: "mem_moy3u6ua_8c6962b668e7",
      title: "BM25 test",
      content: "Confirmed BM25 indexing works for memories saved via memory_save",
      concepts: [],
    })));

    const hits = idx.search("BM25 test", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].obsId).toBe("mem_moy3u6ua_8c6962b668e7");
  });

  it("matches concepts as well as title and content", () => {
    const idx = new SearchIndex();
    idx.add(memoryAsIndexable(makeMemory({
      id: "mem_concept_001",
      title: "Generic title",
      content: "Generic content",
      concepts: ["unique-concept-marker"],
    })));

    const hits = idx.search("unique-concept-marker", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].obsId).toBe("mem_concept_001");
  });
});
