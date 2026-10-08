import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/schema.js", () => ({
  KV: {
    sessions: "sessions",
    summaries: "summaries",
    observations: (sessionId: string) => `obs:${sessionId}`,
    audit: "audit",
  },
}));

vi.mock("../src/eval/schemas.js", () => ({
  SummaryOutputSchema: {},
}));

vi.mock("../src/eval/validator.js", () => ({
  validateOutput: () => ({ valid: true, result: { errors: [] } }),
}));

vi.mock("../src/eval/quality.js", () => ({
  scoreSummary: () => 100,
}));

vi.mock("../src/functions/audit.js", () => ({
  safeAudit: vi.fn(),
}));

import { registerSummarizeFunction } from "../src/functions/summarize.js";
import { REDUCE_SYSTEM, SUMMARY_SYSTEM } from "../src/prompts/summary.js";
import type { CompressedObservation, MemoryProvider, Session, SessionSummary } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    functions,
    registerFunction: (id: string, handler: Function) => {
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async () => ({}),
  };
}

function at(minute: number): string {
  return new Date(Date.UTC(2026, 9, 8, 12, minute, 0)).toISOString();
}

function makeObs(i: number, sessionId: string, visibleAt: string, timestamp = visibleAt): CompressedObservation {
  return {
    id: `obs_${String(i).padStart(3, "0")}`,
    sessionId,
    timestamp,
    compressedAt: visibleAt,
    type: "conversation",
    title: `obs ${i}`,
    facts: [`fact ${i}`],
    narrative: `narrative for obs ${i}`,
    concepts: [],
    files: [`src/file_${i}.ts`],
    importance: 5,
  };
}

function summaryXml(title: string): string {
  return `<summary><title>${title}</title><narrative>${title} narrative</narrative><decisions><decision>${title} decision</decision></decisions><files><file>src/a.ts</file></files><concepts><concept>${title}</concept></concepts></summary>`;
}

function makeProvider(): MemoryProvider & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  return {
    name: "test",
    calls,
    compress: async () => "",
    summarize: async (system: string, user: string) => {
      calls.push({ system, user });
      return summaryXml(system === REDUCE_SYSTEM ? `merged ${calls.length}` : `summary ${calls.length}`);
    },
  };
}

async function setup(sessionId: string) {
  const sdk = mockSdk();
  const kv = mockKV();
  const provider = makeProvider();
  const session: Session = {
    id: sessionId,
    project: "test-project",
    cwd: "/tmp",
    startedAt: at(0),
    status: "active",
    observationCount: 0,
  };
  await kv.set("sessions", sessionId, session);
  registerSummarizeFunction(sdk as never, kv as never, provider);
  const handler = sdk.functions.get("mem::summarize")!;
  const addObs = async (from: number, to: number, visibleMinute: (i: number) => number) => {
    for (let i = from; i <= to; i++) {
      const o = makeObs(i, sessionId, at(visibleMinute(i)));
      await kv.set(`obs:${sessionId}`, o.id, o);
    }
  };
  const stored = async () => (await kv.get<SessionSummary>("summaries", sessionId))!;
  return { handler, kv, provider, addObs, stored };
}

describe("mem::summarize watermark", () => {
  it("records how far the stored summary reaches", async () => {
    const t = await setup("ses_first");
    await t.addObs(1, 5, (i) => i);

    const result = await t.handler({ sessionId: "ses_first" });

    expect(result).toMatchObject({ success: true, incremental: false });
    expect(t.provider.calls).toHaveLength(1);
    expect(t.provider.calls[0].system).toBe(SUMMARY_SYSTEM);
    const summary = await t.stored();
    expect(summary.observationCount).toBe(5);
    expect(summary.coveredThrough).toBe(at(5));
  });

  it("makes no LLM call when nothing was captured since the last summary", async () => {
    const t = await setup("ses_same");
    await t.addObs(1, 5, (i) => i);
    await t.handler({ sessionId: "ses_same" });

    const result = await t.handler({ sessionId: "ses_same" });

    expect(result).toMatchObject({ success: true, unchanged: true });
    expect(t.provider.calls).toHaveLength(1);
    expect((result as { summary: SessionSummary }).summary.title).toBe("summary 1");
  });

  it("summarizes only the new observations and merges them into the stored summary", async () => {
    const t = await setup("ses_delta");
    await t.addObs(1, 5, (i) => i);
    await t.handler({ sessionId: "ses_delta" });
    await t.addObs(6, 8, (i) => i);

    const result = await t.handler({ sessionId: "ses_delta" });

    expect(result).toMatchObject({ success: true, incremental: true });
    expect(t.provider.calls).toHaveLength(3);
    const chunk = t.provider.calls[1];
    expect(chunk.system).toBe(SUMMARY_SYSTEM);
    expect(chunk.user).toContain("obs 6");
    expect(chunk.user).toContain("obs 8");
    expect(chunk.user).not.toContain("obs 1");
    const reduce = t.provider.calls[2];
    expect(reduce.system).toBe(REDUCE_SYSTEM);
    expect(reduce.user).toContain("summary 1");
    expect(reduce.user).toContain("summary 2");
    const summary = await t.stored();
    expect(summary.title).toBe("merged 3");
    expect(summary.observationCount).toBe(8);
    expect(summary.coveredThrough).toBe(at(8));
  });

  it("treats an observation compressed after the last summary as new even when its capture time is old", async () => {
    const t = await setup("ses_late");
    await t.addObs(1, 5, (i) => i);
    await t.handler({ sessionId: "ses_late" });
    const late = makeObs(99, "ses_late", at(9), at(2));
    await t.kv.set("obs:ses_late", late.id, late);

    const result = await t.handler({ sessionId: "ses_late" });

    expect(result).toMatchObject({ success: true, incremental: true });
    expect(t.provider.calls[1].user).toContain("obs 99");
    expect((await t.stored()).coveredThrough).toBe(at(9));
  });

  it("re-reads everything when asked to force a summary", async () => {
    const t = await setup("ses_force");
    await t.addObs(1, 5, (i) => i);
    await t.handler({ sessionId: "ses_force" });

    const result = await t.handler({ sessionId: "ses_force", force: true });

    expect(result).toMatchObject({ success: true, incremental: false });
    expect(t.provider.calls).toHaveLength(2);
    expect(t.provider.calls[1].user).toContain("obs 1");
    expect(t.provider.calls[1].user).toContain("obs 5");
  });

  it("rebuilds a summary stored before watermarks existed, once", async () => {
    const t = await setup("ses_legacy");
    await t.addObs(1, 5, (i) => i);
    await t.kv.set("summaries", "ses_legacy", {
      sessionId: "ses_legacy",
      project: "test-project",
      createdAt: at(0),
      title: "legacy",
      narrative: "legacy narrative",
      keyDecisions: [],
      filesModified: [],
      concepts: [],
      observationCount: 5,
    });

    const first = await t.handler({ sessionId: "ses_legacy" });
    const second = await t.handler({ sessionId: "ses_legacy" });

    expect(first).toMatchObject({ success: true, incremental: false });
    expect(second).toMatchObject({ success: true, unchanged: true });
    expect(t.provider.calls).toHaveLength(1);
    expect((await t.stored()).coveredThrough).toBe(at(5));
  });
});
