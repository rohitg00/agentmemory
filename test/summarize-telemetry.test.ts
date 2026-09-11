import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildSummaryPrompt } from "../src/prompts/summary.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/state/schema.js", () => ({
  KV: {
    sessions: "sessions",
    summaries: "summaries",
    summaryPartials: (sessionId: string) => `summary_partials:${sessionId}`,
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

import { registerSummarizeFunction, filterObservationsForSummary } from "../src/functions/summarize.js";
import type { CompressedObservation, Session, MemoryProvider, RawObservation } from "../src/types.js";
import { buildSyntheticCompression } from "../src/functions/compress-synthetic.js";

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

function makeProvider(responses: string[]): MemoryProvider & { calls: Array<{ system: string; user: string }> } {
  const calls: Array<{ system: string; user: string }> = [];
  let i = 0;
  return {
    name: "test",
    calls,
    compress: async () => "",
    summarize: async (system: string, user: string) => {
      calls.push({ system, user });
      const r = responses[i] ?? responses[responses.length - 1];
      i += 1;
      return r;
    },
  };
}

function summaryXml(opts: { title: string }): string {
  return `<summary><title>${opts.title}</title><narrative>n</narrative><decisions></decisions><files></files><concepts></concepts></summary>`;
}

function baseObs(overrides: Partial<CompressedObservation> & Record<string, unknown>): CompressedObservation {
  return {
    id: "obs_" + Math.random().toString(36).slice(2, 6),
    sessionId: "ses_test",
    timestamp: new Date().toISOString(),
    type: "other",
    title: "Test title",
    facts: [],
    narrative: "some narrative",
    concepts: [],
    files: [],
    importance: 5,
    ...overrides,
  } as CompressedObservation;
}

describe("buildSummaryPrompt layer 4", () => {
  it("omits Facts: label when facts empty but files present", () => {
    const prompt = buildSummaryPrompt([
      { type: "file_edit", title: "Applied patch to 2 file(s)", narrative: "Applied patch to 2 file(s)", facts: [], files: ["src/a.ts", "src/b.ts"], concepts: [] },
    ]);
    expect(prompt).not.toContain("Facts:");
    expect(prompt).toContain("Files: src/a.ts, src/b.ts");
    expect(prompt).toContain("[1] file_edit: Applied patch to 2 file(s)");
  });

  it("omits Files: label when files empty but facts present", () => {
    const prompt = buildSummaryPrompt([
      { type: "other", title: "Some title", narrative: "narrative", facts: ["fact one"], files: [], concepts: [] },
    ]);
    expect(prompt).not.toContain("Files:");
    expect(prompt).toContain("Facts:");
    expect(prompt).toContain("  - fact one");
  });

  it("emits neither label when both empty (header-only line, no dangling labels)", () => {
    const prompt = buildSummaryPrompt([
      { type: "conversation", title: "Hello", narrative: "Hello world", facts: [], files: [], concepts: [] },
    ]);
    expect(prompt).not.toContain("Facts:");
    expect(prompt).not.toContain("Files:");
    expect(prompt).toContain("[1] conversation: Hello");
    expect(prompt).toContain("Hello world");
  });

  it("uses title in header when present", () => {
    const prompt = buildSummaryPrompt([
      { type: "file_edit", title: "Applied patch to 2 file(s)", narrative: "Applied patch to 2 file(s)", facts: [], files: [], concepts: [] },
    ]);
    expect(prompt).toContain("Applied patch to 2 file(s)");
    expect(prompt).toContain("[1] file_edit: Applied patch to 2 file(s)");
  });

  it("prompt_submit userPrompt-only renders header-only without dangling labels (regression)", () => {
    const prompt = buildSummaryPrompt([
      { type: "conversation", title: "User prompt", narrative: "hello from user", facts: [], files: [], concepts: [] },
    ]);
    expect(prompt).toContain("[1] conversation: User prompt");
    expect(prompt).toContain("hello from user");
    expect(prompt).not.toContain("Facts:");
    expect(prompt).not.toContain("Files:");
  });
});

describe("summarize pipeline layer 3 filtering", () => {
  async function setupWithObservations(observations: CompressedObservation[]) {
    const sdk = mockSdk();
    const kv = mockKV();
    const session: Session = {
      id: "ses_test",
      project: "test-project",
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      status: "completed",
      observationCount: observations.length,
    };
    await kv.set("sessions", "ses_test", session);
    for (const o of observations) {
      await kv.set(`obs:ses_test`, o.id, o);
    }
    const provider = makeProvider([summaryXml({ title: "Summary" })]);
    registerSummarizeFunction(sdk as any, kv as any, provider);
    const handler = sdk.functions.get("mem::summarize")!;
    return { handler, kv, provider };
  }

  it("filters out isTelemetry observations (pipeline-produced rows, not hand-set)", async () => {
    const keep = baseObs({ id: "keep_1", title: "Keep me", narrative: "keep narrative", facts: ["keep fact"], files: ["src/keep.ts"] });
    const telemetryRaw: RawObservation = {
      id: "tele_raw_1",
      sessionId: "ses_test",
      timestamp: new Date().toISOString(),
      hookType: "assistant_message",
      raw: {},
    };
    const telemetry = buildSyntheticCompression(telemetryRaw);
    expect(telemetry.isTelemetry).toBe(true);
    expect(filterObservationsForSummary([telemetry]).length).toBe(0);
    const { handler, provider } = await setupWithObservations([keep, telemetry]);
    const result: any = await handler({ sessionId: "ses_test" });
    expect(result.success).toBe(true);
    const prompt = provider.calls[0].user;
    expect(prompt).toContain("Keep me");
    expect(prompt).not.toContain("assistant_message");
  });

  it("end-to-end: telemetry raw produces CompressedObservation with isTelemetry===true and is dropped", async () => {
    const raw: RawObservation = {
      id: "e2e_tele_1",
      sessionId: "ses_test",
      timestamp: new Date().toISOString(),
      hookType: "assistant_message",
      raw: {},
    };
    const compressed = buildSyntheticCompression(raw);
    expect(compressed.isTelemetry).toBe(true);
    expect(compressed.narrative).toBe("");
    expect(compressed.files).toEqual([]);
    expect(filterObservationsForSummary([compressed]).length).toBe(0);
    const keep = baseObs({ id: "keep_e2e", title: "Keep e2e", narrative: "something" });
    const { handler, provider } = await setupWithObservations([keep, compressed]);
    const result: any = await handler({ sessionId: "ses_test" });
    expect(result.success).toBe(true);
    expect(provider.calls[0].user).toContain("Keep e2e");
    expect(provider.calls[0].user).not.toContain("e2e_tele_1");
  });

  it("drops zero-content observations (empty narrative/facts/files/tool fields)", async () => {
    const keep = baseObs({ id: "keep_2", title: "Keep", narrative: "has content", facts: [], files: [] });
    const zero = baseObs({ id: "zero_1", title: "", narrative: "", facts: [], files: [] }) as CompressedObservation & Record<string, unknown>;
    // ensure zero has no tool fields
    delete (zero as Record<string, unknown>).toolInput;
    delete (zero as Record<string, unknown>).toolOutput;
    delete (zero as Record<string, unknown>).userPrompt;
    (zero as CompressedObservation).title = "";
    (zero as CompressedObservation).narrative = "";
    const { handler, provider } = await setupWithObservations([keep, zero as CompressedObservation]);
    const result: any = await handler({ sessionId: "ses_test" });
    expect(result.success).toBe(true);
    const prompt = provider.calls[0].user;
    expect(prompt).toContain("Keep");
    expect(prompt).not.toContain("[2]");
    expect(prompt).toContain("Session observations (1 total)");
  });

  it("KEEPS tool observations (toolInput present) and prompt_submit (userPrompt present)", async () => {
    const toolObs = baseObs({ id: "tool_1", title: "Read src/foo.ts", narrative: "", facts: [], files: [] }) as CompressedObservation & Record<string, unknown>;
    (toolObs as Record<string, unknown>).toolInput = { file_path: "src/foo.ts" };
    const promptObs = baseObs({ id: "prompt_1", title: "User prompt", narrative: "", facts: [], files: [] }) as CompressedObservation & Record<string, unknown>;
    (promptObs as Record<string, unknown>).userPrompt = "hello world";
    const { handler, provider } = await setupWithObservations([toolObs as CompressedObservation, promptObs as CompressedObservation]);
    const result: any = await handler({ sessionId: "ses_test" });
    expect(result.success).toBe(true);
    const prompt = provider.calls[0].user;
    expect(prompt).toContain("Read src/foo.ts");
    expect(prompt).toContain("User prompt");
    expect(prompt).toContain("Session observations (2 total)");
  });
});
