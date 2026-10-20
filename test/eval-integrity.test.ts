import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolateQuestion, loadLongMemEval } from "../eval/runner/load.js";
import { aggregate, scoreQuestion } from "../eval/runner/score.js";
import { runEvaluation } from "../eval/runner/run.js";
import { createAgentMemoryAdapter } from "../eval/runner/adapters/agentmemory.js";
import type { Adapter, Question } from "../eval/runner/types.js";

const dirs: string[] = [];
function temporary(): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-unit-"));
  dirs.push(dir);
  return dir;
}

const question: Question = {
  id: "q", type: "multi-session", question: "Needs A and B", answer: "secret gold",
  timestamp: "2025-02-01", goldSessionIds: ["a", "b"],
  haystack: [{ id: "a", content: "A" }, { id: "b", content: "B" }],
};

function dataset(rows: unknown[]): string {
  const path = join(temporary(), "data.json");
  writeFileSync(path, JSON.stringify(rows));
  return path;
}

const raw = {
  question_id: "q", question_type: "multi-session", question: "Needs A and B", answer: "gold",
  question_date: "2025-02-01", answer_session_ids: ["answer_a", "b"],
  haystack_session_ids: ["answer_a", "b"], haystack_dates: ["2025-01-01", "2025-01-02"],
  haystack_sessions: [[{ role: "user", content: "A", has_answer: true }], [{ role: "assistant", content: "B" }]],
};

afterEach(() => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("evaluation integrity", () => {
  it("distinguishes partial, any and complete evidence", () => {
    const row = scoreQuestion(question, [{ sessionId: "a", score: 1 }], 5, "test", 2);
    expect(row).toMatchObject({ precisionAtK: 0.2, recallAtK: 0.5, recallAllAtK: 0, hit: true });
  });

  it("deduplicates before applying the distinct-session cutoff", () => {
    const ranked = ["a", "a", "a", "b"].map((sessionId) => ({ sessionId, score: 1 }));
    expect(scoreQuestion(question, ranked, 2, "test", 0)).toMatchObject({
      recallAtK: 1, recallAllAtK: 1, precisionAtK: 1, returnedCount: 2,
    });
    expect(scoreQuestion(question, [{ sessionId: "x", score: 1 }, ...ranked], 1, "test", 0).topGoldRank).toBeNull();
  });

  it("does not treat zero-gold retrieval as an abstention success", () => {
    const answerable = scoreQuestion(question, [{ sessionId: "a", score: 1 }], 5, "test", 2);
    const absent = scoreQuestion({ ...question, id: "abs", goldSessionIds: [], answerability: "unanswerable" },
      [{ sessionId: "a", score: 1 }], 5, "test", 2);
    expect(absent).toMatchObject({ recallAtK: null, recallAllAtK: null, hit: null, returnedCount: 1 });
    expect(aggregate([answerable, absent]).byAdapter.test).toMatchObject({ n: 2, scored: 1, unanswerable: 1, r: 0.5 });
  });

  it("rejects empty answerable gold and retains failed unanswerable attempts", () => {
    expect(() => isolateQuestion({ ...question, goldSessionIds: [] })).toThrow("no gold");
    expect(() => scoreQuestion({ ...question, goldSessionIds: [] }, [], 5, "test", 0)).toThrow("no gold");
    const row = scoreQuestion({ ...question, goldSessionIds: [], answerability: "unanswerable" }, [], 5, "test", 0);
    expect(aggregate([{ ...row, status: "error" }]).byAdapter.test).toMatchObject({
      unanswerable: 1, unanswerableCompleted: 0, unanswerableFailed: 1,
    });
  });

  it("preserves dates and hides gold IDs and per-turn labels", () => {
    const path = dataset([raw]);
    const [loaded] = loadLongMemEval(path);
    expect(loaded.timestamp).toBe(raw.question_date);
    expect(loaded.haystack[0].timestamp).toBe(raw.haystack_dates[0]);
    expect(JSON.stringify(loaded.haystack)).not.toMatch(/answer_a|has_answer|secret gold/);
    expect(loaded.goldSessionIds).toEqual(loaded.haystack.map((s) => s.id));
    expect(loadLongMemEval(path)).toEqual([loaded]);
    const other = loadLongMemEval(dataset([{ ...raw, question_id: "other" }]))[0];
    expect(other.haystack[0].id).not.toBe(loaded.haystack[0].id);
  });

  it.each([
    { haystack_dates: ["one"] },
    { haystack_session_ids: ["a", "a"] },
    { answer_session_ids: ["missing"] },
    { answer_session_ids: [] },
  ])("rejects malformed corpora before running: %j", (change) => {
    expect(() => loadLongMemEval(dataset([{ ...raw, ...change }]))).toThrow();
  });

  it("coalesces identical repeated sources while retaining every supplied date", () => {
    const [loaded] = loadLongMemEval(dataset([{ ...raw,
      haystack_session_ids: ["answer_a", "b", "b"],
      haystack_dates: ["2025-01-01", "2025-01-02", "2025-01-03"],
      haystack_sessions: [...raw.haystack_sessions, raw.haystack_sessions[1]],
    }]));
    expect(loaded.haystack).toHaveLength(2);
    expect(loaded.haystack[1].timestamp).toBe("2025-01-02");
    expect(loaded.haystack[1].content).toContain("[Additional source session date: 2025-01-03]");
    expect(loaded.goldSessionIds).toHaveLength(2);
  });

  it.each([
    [{ sessionId: "alien", score: 1 }],
    [{ sessionId: "a", score: Number.NaN }],
    null,
  ])("records invalid adapter output as a failed attempt: %j", async (result) => {
    const adapter: Adapter = { name: "invalid", init: async () => ({}), query: async () => result as never };
    const rows = await runEvaluation({ benchmark: "fixture", questions: [question], adapters: [adapter],
      k: 2, datasetFiles: [dataset([raw])], outDir: join(temporary(), "run") });
    expect(rows[0]).toMatchObject({ status: "error", phase: "query" });
    expect(aggregate(rows).byAdapter.invalid.strictSuccessOverAttempts).toBe(0);
  });

  it("loads abstention without inventing gold evidence", () => {
    const [loaded] = loadLongMemEval(dataset([{ ...raw, question_id: "q_abs", answer_session_ids: [] }]));
    expect(loaded.answerability).toBe("unanswerable");
    expect(loaded.goldSessionIds).toEqual([]);
  });

  it("keeps failures in attempted counts, preserves query date, and always tears down", async () => {
    const init = vi.fn(async () => ({}));
    const teardown = vi.fn(async () => {});
    const query = vi.fn().mockResolvedValueOnce([{ sessionId: "a", score: 1 }, { sessionId: "b", score: 1 }])
      .mockRejectedValueOnce(new Error("synthetic outage"));
    const adapter: Adapter = { name: "fixture", init, query, teardown };
    const data = dataset([raw]);
    const outDir = join(temporary(), "run");
    const rows = await runEvaluation({ benchmark: "fixture", questions: [question, { ...question, id: "q2" }],
      adapters: [adapter], k: 2, datasetFiles: [data], outDir, config: { fixture: true } });
    expect(init.mock.calls[0]).toEqual([question.haystack, { fixture: true }]);
    expect(query.mock.calls[0][3]).toBe(question.timestamp);
    expect(teardown).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.status)).toEqual(["ok", "error"]);
    const summary = JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ planned: 2, completed: 1, failed: 1 });
    expect(summary.byAdapter.fixture).toMatchObject({ recallAll: 1, strictSuccessOverAttempts: 0.5 });
    await expect(runEvaluation({ benchmark: "fixture", questions: [question], adapters: [adapter],
      k: 2, datasetFiles: [data], outDir })).rejects.toThrow("not empty");
  });

  it("records teardown failure instead of declaring a clean run", async () => {
    const adapter: Adapter = { name: "fixture", init: async () => ({}),
      query: async () => [], teardown: async () => { throw new Error("cleanup failed"); } };
    const rows = await runEvaluation({ benchmark: "fixture", questions: [question], adapters: [adapter],
      k: 2, datasetFiles: [dataset([raw])], outDir: join(temporary(), "run") });
    expect(rows[0]).toMatchObject({ status: "error", phase: "teardown" });
  });

  it("maps only returned memory IDs and closes partially initialized HTTP fixtures", async () => {
    const request = vi.fn().mockResolvedValueOnce({ success: true, memory: { id: "mem_1" } })
      .mockResolvedValueOnce({ results: [{ observation: { id: "mem_1", narrative: "A" }, sessionId: "memory", score: 1 }] });
    const close = vi.fn(async () => {});
    const adapter = createAgentMemoryAdapter(async () => ({ request, close }));
    const state = await adapter.init([{ id: "source_a", timestamp: "2025-01-01", content: "A" }]);
    expect(request.mock.calls[0][1]).toMatchObject({ content: "[Source session date: 2025-01-01]\nA" });
    expect(JSON.stringify(request.mock.calls[0][1])).not.toContain("source_a");
    expect(await adapter.query("A", state, 5)).toEqual([{ sessionId: "source_a", score: 1, content: "A" }]);
    await adapter.teardown!(state);
    expect(close).toHaveBeenCalledOnce();
    request.mockResolvedValueOnce({ success: false });
    await expect(adapter.init([{ id: "b", content: "B" }])).rejects.toThrow("memory ID");
    expect(close).toHaveBeenCalledTimes(2);
  });
});
