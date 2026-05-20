import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { grepAdapter } from "../eval/runner/adapters/grep.js";
import { aggregate, scoreQuestion } from "../eval/runner/score.js";
import type { Question, Session } from "../eval/runner/types.js";

const DATA_DIR = resolve(__dirname, "..", "eval", "data", "coding-agent-life-v1");
const sessions = JSON.parse(readFileSync(`${DATA_DIR}/sessions.json`, "utf8")) as Session[];
const queries = JSON.parse(readFileSync(`${DATA_DIR}/queries.json`, "utf8")) as Array<
  Omit<Question, "haystack">
>;

describe("eval scaffold", () => {
  it("coding-agent-life-v1 corpus is well-formed", () => {
    expect(sessions.length).toBeGreaterThan(0);
    expect(queries.length).toBeGreaterThan(0);
    const sessionIds = new Set(sessions.map((s) => s.id));
    for (const q of queries) {
      expect(q.goldSessionIds.length).toBeGreaterThan(0);
      for (const id of q.goldSessionIds) {
        expect(sessionIds.has(id)).toBe(true);
      }
    }
  });

  it("grep adapter ranks gold session in top-5 for most queries", async () => {
    const state = await grepAdapter.init(sessions);
    let hits = 0;
    for (const q of queries) {
      const ranked = await grepAdapter.query(q.question, state, 5);
      const topIds = new Set(ranked.map((r) => r.sessionId));
      if (q.goldSessionIds.some((id) => topIds.has(id))) hits += 1;
    }
    expect(hits / queries.length).toBeGreaterThan(0.5);
  });

  it("scoreQuestion computes P@K, R@K, hit, topGoldRank", () => {
    const q: Question = {
      id: "test",
      type: "single-session",
      question: "?",
      goldSessionIds: ["a", "b"],
      haystack: [],
    };
    const ranked = [
      { sessionId: "x", score: 0.9 },
      { sessionId: "a", score: 0.7 },
      { sessionId: "y", score: 0.5 },
      { sessionId: "b", score: 0.3 },
    ];
    const row = scoreQuestion(q, ranked, 5, "test", 12);
    expect(row.hit).toBe(true);
    expect(row.recallAtK).toBe(1);
    expect(row.precisionAtK).toBeCloseTo(2 / 5);
    expect(row.topGoldRank).toBe(2);
  });

  it("scoreQuestion handles miss", () => {
    const q: Question = {
      id: "test",
      type: "x",
      question: "?",
      goldSessionIds: ["a"],
      haystack: [],
    };
    const ranked = [
      { sessionId: "x", score: 1 },
      { sessionId: "y", score: 0.5 },
    ];
    const row = scoreQuestion(q, ranked, 5, "test", 5);
    expect(row.hit).toBe(false);
    expect(row.recallAtK).toBe(0);
    expect(row.topGoldRank).toBeNull();
  });

  it("aggregate computes per-adapter and per-type means", () => {
    const q: Question = {
      id: "1",
      type: "t1",
      question: "?",
      goldSessionIds: ["a"],
      haystack: [],
    };
    const row1 = scoreQuestion(q, [{ sessionId: "a", score: 1 }], 5, "grep", 10);
    const row2 = scoreQuestion(q, [{ sessionId: "x", score: 1 }], 5, "grep", 20);
    const agg = aggregate([row1, row2]);
    expect(agg.byAdapter.grep.hit).toBe(1);
    expect(agg.byAdapter.grep.n).toBe(2);
    expect(agg.byType.t1.grep.n).toBe(2);
  });
});
