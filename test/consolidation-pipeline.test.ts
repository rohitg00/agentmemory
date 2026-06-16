import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/config.js", () => ({
  getConsolidationDecayDays: () => 30,
  isConsolidationEnabled: vi.fn(() => true),
}));

import { registerConsolidationPipelineFunction } from "../src/functions/consolidation-pipeline.js";
import { isConsolidationEnabled } from "../src/config.js";
import { logger } from "../src/logger.js";
import type { SessionSummary, Memory, SemanticMemory, ProceduralMemory } from "../src/types.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
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
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    registerTrigger: () => {},
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

function makeSummary(i: number): SessionSummary {
  return {
    sessionId: `ses_${i}`,
    project: "test-project",
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    title: `Session ${i} summary`,
    narrative: `Worked on feature ${i}`,
    keyDecisions: [`Decision ${i}`],
    filesModified: [`src/file${i}.ts`],
    concepts: ["typescript", "testing"],
    observationCount: 5,
  };
}

function makePattern(i: number): Memory {
  return {
    id: `mem_${i}`,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    type: "pattern",
    title: `Pattern ${i}`,
    content: `Always do thing ${i}`,
    concepts: ["testing"],
    files: [],
    sessionIds: ["ses_1", "ses_2"],
    strength: 5,
    version: 1,
    isLatest: true,
  };
}

describe("Consolidation Pipeline", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
  });

  it("pipeline skips semantic when fewer than 5 summaries", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    for (let i = 0; i < 3; i++) {
      await kv.set("mem:summaries", `ses_${i}`, makeSummary(i));
    }

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "semantic",
    })) as { success: boolean; results: Record<string, unknown> };

    expect(result.success).toBe(true);
    const semantic = result.results.semantic as { skipped: boolean; reason: string };
    expect(semantic.skipped).toBe(true);
    expect(semantic.reason).toContain("fewer than 5");
    expect(provider.summarize).not.toHaveBeenCalled();
  });

  it("pipeline skips procedural when fewer than 2 patterns", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    const mem: Memory = {
      ...makePattern(1),
      sessionIds: ["ses_1", "ses_2"],
    };
    await kv.set("mem:memories", "mem_1", mem);

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "procedural",
    })) as { success: boolean; results: Record<string, unknown> };

    expect(result.success).toBe(true);
    const procedural = result.results.procedural as { skipped: boolean; reason: string };
    expect(procedural.skipped).toBe(true);
    expect(procedural.reason).toContain("fewer than 2");
  });

  it("with enough summaries, creates semantic memories from provider response", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(
        `<facts><fact confidence="0.9">TypeScript is the primary language</fact></facts>`,
      ),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    for (let i = 0; i < 6; i++) {
      await kv.set("mem:summaries", `ses_${i}`, makeSummary(i));
    }

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "semantic",
    })) as { success: boolean; results: Record<string, unknown> };

    expect(result.success).toBe(true);
    const semantic = result.results.semantic as { newFacts: number };
    expect(semantic.newFacts).toBe(1);

    const stored = await kv.list<SemanticMemory>("mem:semantic");
    expect(stored.length).toBe(1);
    expect(stored[0].fact).toBe("TypeScript is the primary language");
    expect(stored[0].confidence).toBe(0.9);
  });

  it("with enough patterns, creates procedural memories from provider response", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(
        `<procedures><procedure name="Test Workflow" trigger="when writing tests"><step>Create test file</step><step>Write assertions</step></procedure></procedures>`,
      ),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    for (let i = 0; i < 3; i++) {
      await kv.set("mem:memories", `mem_${i}`, makePattern(i));
    }

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "procedural",
    })) as { success: boolean; results: Record<string, unknown> };

    expect(result.success).toBe(true);
    const procedural = result.results.procedural as { newProcedures: number };
    expect(procedural.newProcedures).toBe(1);

    const stored = await kv.list<ProceduralMemory>("mem:procedural");
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe("Test Workflow");
    expect(stored[0].steps.length).toBe(2);
    expect(stored[0].triggerCondition).toBe("when writing tests");
  });

  it("creates scoped lessons for newly extracted procedural memories", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(
        `<procedures><procedure name="Scoped Workflow" trigger="when shipping scoped changes"><step>Inspect project scope</step><step>Run targeted tests</step></procedure></procedures>`,
      ),
    };
    sdk.registerFunction("mem::lesson-save", async (payload: Record<string, unknown>) => {
      await kv.set("mem:lessons", "lsn_proc", payload);
      return { success: true, action: "created", lesson: payload };
    });
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    await kv.set("mem:memories", "api_1", { ...makePattern(1), project: "api" });
    await kv.set("mem:memories", "api_2", { ...makePattern(2), project: "api" });
    await kv.set("mem:memories", "web_1", { ...makePattern(3), project: "web" });
    await kv.set("mem:memories", "web_2", { ...makePattern(4), project: "web" });

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "procedural",
      project: "api",
    })) as { success: boolean; results: Record<string, { patternsAnalyzed: number }> };

    expect(result.success).toBe(true);
    expect(result.results.procedural.patternsAnalyzed).toBe(2);

    const stored = await kv.list<ProceduralMemory>("mem:procedural");
    const lessons = await kv.list<Record<string, unknown>>("mem:lessons");
    expect(stored).toHaveLength(1);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      content: "[procedure] Scoped Workflow: Inspect project scope; Run targeted tests",
      context: "when shipping scoped changes",
      confidence: 0.6,
      project: "api",
      tags: ["procedural", "consolidated"],
      source: "consolidation",
      sourceIds: [stored[0].id],
    });
  });

  it("creates scoped lessons when extracted procedures already exist", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(
        `<procedures><procedure name="Scoped Workflow" trigger="when shipping scoped changes"><step>Inspect project scope</step><step>Run targeted tests</step></procedure></procedures>`,
      ),
    };
    sdk.registerFunction("mem::lesson-save", async (payload: Record<string, unknown>) => {
      await kv.set("mem:lessons", "lsn_existing_proc", payload);
      return { success: true, action: "created", lesson: payload };
    });
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    await kv.set("mem:procedural", "proc_existing", {
      id: "proc_existing",
      name: "Scoped Workflow",
      steps: ["Use stale global procedure"],
      triggerCondition: "when shipping scoped changes",
      frequency: 1,
      sourceSessionIds: [],
      strength: 0.5,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await kv.set("mem:memories", "api_1", { ...makePattern(1), project: "api" });
    await kv.set("mem:memories", "api_2", { ...makePattern(2), project: "api" });

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "procedural",
      project: "api",
    })) as { success: boolean; results: Record<string, { newProcedures: number }> };

    expect(result.success).toBe(true);
    expect(result.results.procedural.newProcedures).toBe(0);
    const lessons = await kv.list<Record<string, unknown>>("mem:lessons");
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      content: "[procedure] Scoped Workflow: Inspect project scope; Run targeted tests",
      project: "api",
      sourceIds: ["proc_existing"],
    });
  });

  it("keeps procedural extraction successful when lesson save throws", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn().mockResolvedValue(
        `<procedures><procedure name="Scoped Workflow" trigger="when shipping scoped changes"><step>Inspect project scope</step></procedure></procedures>`,
      ),
    };
    sdk.registerFunction("mem::lesson-save", async () => {
      throw new Error("lesson store offline");
    });
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    await kv.set("mem:memories", "api_1", { ...makePattern(1), project: "api" });
    await kv.set("mem:memories", "api_2", { ...makePattern(2), project: "api" });

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      tier: "procedural",
      project: "api",
    })) as { success: boolean; results: Record<string, { newProcedures: number }> };

    expect(result.success).toBe(true);
    expect(result.results.procedural.newProcedures).toBe(1);
    expect(await kv.list<ProceduralMemory>("mem:procedural")).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to save lesson from consolidation pipeline",
      expect.objectContaining({ error: "lesson store offline" }),
    );
  });

  it("consolidation records an audit entry", async () => {
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    await sdk.trigger("mem::consolidate-pipeline", { tier: "semantic" });

    const audits = await kv.list("mem:audit");
    expect(audits.length).toBe(1);
  });

  it("pipeline returns early when consolidation is disabled", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(false);
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    const result = (await sdk.trigger("mem::consolidate-pipeline", {})) as {
      success: boolean;
      skipped?: boolean;
      reason?: string;
    };

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("CONSOLIDATION_ENABLED");
    expect(provider.summarize).not.toHaveBeenCalled();
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
  });

  it("pipeline proceeds with internal boolean force=true even when consolidation is disabled", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(false);
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      force: true,
    })) as { success: boolean; results: Record<string, unknown> };

    expect(result.success).toBe(true);
    expect(result.results).toBeDefined();
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
  });

  it("pipeline does not treat non-boolean force values as an opt-out bypass", async () => {
    vi.mocked(isConsolidationEnabled).mockReturnValue(false);
    const provider = {
      name: "test",
      compress: vi.fn(),
      summarize: vi.fn(),
    };
    registerConsolidationPipelineFunction(sdk as never, kv as never, provider as never);

    const result = (await sdk.trigger("mem::consolidate-pipeline", {
      force: "true" as never,
    })) as {
      success: boolean;
      skipped?: boolean;
      reason?: string;
    };

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("CONSOLIDATION_ENABLED");
    expect(provider.summarize).not.toHaveBeenCalled();
    vi.mocked(isConsolidationEnabled).mockReturnValue(true);
  });
});
