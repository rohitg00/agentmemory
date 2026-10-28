import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { extractGraphHeuristics } from "../src/functions/graph.js";
import type { CompressedObservation } from "../src/types.js";

function obs(
  id: string,
  files: string[],
  concepts: string[],
): CompressedObservation {
  return {
    id,
    sessionId: "ses_1",
    timestamp: new Date().toISOString(),
    type: "file_edit",
    title: `obs ${id}`,
    facts: [],
    narrative: "",
    concepts,
    files,
    importance: 0.5,
  };
}

describe("extractGraphHeuristics", () => {
  it("builds file and concept nodes from structured fields", () => {
    const { nodes } = extractGraphHeuristics([
      obs("o1", ["src/auth.ts"], ["authentication", "jwt"]),
    ]);
    const byType = new Map(nodes.map((n) => [`${n.type}:${n.name}`, n]));
    expect(byType.has("file:src/auth.ts")).toBe(true);
    expect(byType.has("concept:authentication")).toBe(true);
    expect(byType.has("concept:jwt")).toBe(true);
  });

  it("links concepts to files and consecutive siblings as related_to", () => {
    const { nodes, edges } = extractGraphHeuristics([
      obs("o1", ["a.ts", "b.ts"], ["caching"]),
    ]);
    expect(edges.every((e) => e.type === "related_to")).toBe(true);
    const names = new Map(nodes.map((n) => [n.id, n.name]));
    const pairs = edges.map(
      (e) => `${names.get(e.sourceNodeId)}|${names.get(e.targetNodeId)}`,
    );
    expect(pairs).toContain("caching|a.ts");
    expect(pairs).toContain("caching|b.ts");
    expect(pairs).toContain("a.ts|b.ts");
  });

  it("merges repeated entities across observations instead of duplicating", () => {
    const { nodes } = extractGraphHeuristics([
      obs("o1", ["src/auth.ts"], []),
      obs("o2", ["src/auth.ts"], []),
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].sourceObservationIds).toEqual(["o1", "o2"]);
  });

  it("dedupes case-insensitively and skips blank names", () => {
    const { nodes } = extractGraphHeuristics([
      obs("o1", [], ["JWT", "jwt", "  "]),
    ]);
    expect(nodes).toHaveLength(1);
  });

  it("caps edges per observation", () => {
    const many = obs(
      "o1",
      Array.from({ length: 10 }, (_, i) => `f${i}.ts`),
      Array.from({ length: 10 }, (_, i) => `c${i}`),
    );
    const { edges } = extractGraphHeuristics([many]);
    expect(edges.length).toBeLessThanOrEqual(12);
  });

  it("never emits self edges or duplicate pairs", () => {
    const { edges } = extractGraphHeuristics([
      obs("o1", ["a.ts"], ["a"]),
      obs("o2", ["a.ts"], ["a"]),
    ]);
    const seen = new Set<string>();
    for (const e of edges) {
      expect(e.sourceNodeId).not.toBe(e.targetNodeId);
      const key = [e.sourceNodeId, e.targetNodeId].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// The structural pass must run keyless: session end always fires
// mem::graph-extract, and the function itself gates only the LLM pass
// on the flag plus a real provider.
describe("keyless graph extraction wiring", () => {
  it("event::session::stopped fires graph-extract without the flag gate", () => {
    const events = readFileSync("src/triggers/events.ts", "utf-8");
    const stopped = events.slice(events.indexOf("event::session::stopped"));
    const gate = stopped.indexOf("isGraphExtractionEnabled()");
    const fire = stopped.indexOf('fireVoid("mem::graph-extract"');
    expect(fire).toBeGreaterThan(-1);
    expect(gate === -1 || gate > fire).toBe(true);
  });

  it("graph functions register unconditionally so the trigger always resolves", () => {
    const index = readFileSync("src/index.ts", "utf-8");
    const reg = index.indexOf("registerGraphFunction(sdk, kv, provider)");
    expect(reg).toBeGreaterThan(-1);
    const before = index.slice(Math.max(0, reg - 200), reg);
    expect(before).not.toContain("isGraphExtractionEnabled()");
  });

  it("mem::graph-extract gates the LLM pass, not the heuristic pass", () => {
    const graph = readFileSync("src/functions/graph.ts", "utf-8");
    expect(graph).toMatch(/extractGraphHeuristics\(data\.observations\)/);
    expect(graph).toMatch(
      /isGraphExtractionEnabled\(\) && !provider\.name\.includes\("noop"\)/,
    );
  });
});
