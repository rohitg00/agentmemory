import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  describeConsolidation,
  type ConsolidationStatusInput,
} from "../src/functions/consolidation-status.js";

function input(overrides: Partial<ConsolidationStatusInput> = {}): ConsolidationStatusInput {
  return {
    now: new Date("2026-09-25T12:00:00.000Z"),
    enabled: true,
    llmConfigured: true,
    summaries: 0,
    recurringPatterns: 0,
    semanticFacts: 0,
    procedures: 0,
    relations: 0,
    lastRun: null,
    ...overrides,
  };
}

function tier(status: ReturnType<typeof describeConsolidation>, id: string) {
  const found = status.tiers.find((t) => t.id === id);
  if (!found) throw new Error(`tier ${id} missing`);
  return found;
}

describe("describeConsolidation", () => {
  it("says what to set when no LLM key is configured", () => {
    const status = describeConsolidation(input({ enabled: false, llmConfigured: false }));
    expect(tier(status, "semantic").state).toBe("off");
    expect(tier(status, "semantic").detail).toMatch(/add an LLM provider key/);
    expect(tier(status, "procedural").state).toBe("off");
  });

  it("says consolidation was switched off on purpose when a key exists", () => {
    const status = describeConsolidation(input({ enabled: false, llmConfigured: true }));
    expect(tier(status, "semantic").detail).toMatch(/CONSOLIDATION_ENABLED is set to false/);
  });

  it("shows progress toward the semantic threshold and the procedural requirements", () => {
    const status = describeConsolidation(input({ summaries: 3, recurringPatterns: 1 }));
    expect(tier(status, "semantic")).toMatchObject({
      state: "waiting",
      detail: "Waiting: 3 of 5 session summaries needed.",
    });
    const procedural = tier(status, "procedural");
    expect(procedural.state).toBe("waiting");
    expect(procedural.detail).toMatch(/each finished session with a summary and 3\+ observations/);
    expect(procedural.detail).toMatch(/you have 1/);
  });

  it("reports ready once the inputs are there and nothing has run yet", () => {
    const status = describeConsolidation(input({ summaries: 8, recurringPatterns: 2 }));
    expect(tier(status, "semantic").state).toBe("ready");
    expect(tier(status, "procedural").state).toBe("ready");
  });

  it("reports the last run's output and errors per tier", () => {
    const status = describeConsolidation(
      input({
        summaries: 8,
        semanticFacts: 12,
        lastRun: {
          at: "2026-09-25T10:00:00.000Z",
          tier: "all",
          results: {
            semantic: { newFacts: 4, totalSummaries: 8 },
            procedural: { error: "provider timeout" },
          },
        },
      }),
    );
    expect(status.lastRunAt).toBe("2026-09-25T10:00:00.000Z");
    expect(tier(status, "semantic")).toMatchObject({ state: "ran", count: 12, detail: "Last run 2 h ago: 4 new facts." });
    expect(tier(status, "procedural")).toMatchObject({ state: "error", detail: "Last run 2 h ago failed: provider timeout" });
  });

  it("falls back to the input-based state when the last run skipped a tier", () => {
    const status = describeConsolidation(
      input({
        summaries: 2,
        lastRun: {
          at: "2026-09-25T11:59:30.000Z",
          tier: "all",
          results: { semantic: { skipped: true, reason: "fewer than 5 summaries" } },
        },
      }),
    );
    expect(tier(status, "semantic").state).toBe("waiting");
  });

  it("counts relations without depending on consolidation", () => {
    expect(tier(describeConsolidation(input({ enabled: false, relations: 3 })), "relations")).toMatchObject({
      state: "ran",
      detail: "3 links saved.",
    });
    expect(tier(describeConsolidation(input()), "relations").state).toBe("waiting");
  });
});

describe("skill extraction runs inside the consolidation cooldown", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  async function stop(env: Record<string, string | undefined>) {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY",
      "MINIMAX_API_KEY",
      "CONSOLIDATION_ENABLED",
      "AGENTMEMORY_CONSOLIDATION_COOLDOWN_MS",
    ]) {
      delete process.env[key];
    }
    Object.assign(process.env, env);
    const { registerEventTriggers } = await import("../src/triggers/events.js");
    const handlers = new Map<string, (p: unknown) => Promise<unknown>>();
    const fired: string[] = [];
    const sdk = {
      registerFunction: (id: string, fn: (p: unknown) => Promise<unknown>) => handlers.set(id, fn),
      registerTrigger: () => undefined,
      trigger: vi.fn(async (req: { function_id: string }) => {
        fired.push(req.function_id);
        return {};
      }),
    };
    const kv = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      list: vi.fn(async () => []),
    };
    registerEventTriggers(sdk as never, kv as never);
    await handlers.get("event::session::stopped")!({ sessionId: "s1" });
    return fired;
  }

  it("extracts a procedure from the session when consolidation is due and an LLM key is set", async () => {
    const fired = await stop({ ANTHROPIC_API_KEY: "sk-test", CONSOLIDATION_ENABLED: "true" });
    expect(fired).toContain("mem::consolidate-pipeline");
    expect(fired).toContain("mem::skill-extract");
  });

  it("never calls skill extraction without an LLM key, even with consolidation forced on", async () => {
    const fired = await stop({ CONSOLIDATION_ENABLED: "true" });
    expect(fired).not.toContain("mem::skill-extract");
  });

  it("never calls skill extraction when consolidation is off", async () => {
    const fired = await stop({ ANTHROPIC_API_KEY: "sk-test", CONSOLIDATION_ENABLED: "false" });
    expect(fired).not.toContain("mem::skill-extract");
    expect(fired).not.toContain("mem::consolidate-pipeline");
  });
});

describe("consolidation status wiring", () => {
  const api = readFileSync("src/triggers/api.ts", "utf-8");
  const pipeline = readFileSync("src/functions/consolidation-pipeline.ts", "utf-8");
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  it("the pipeline stores each run's per-tier results", () => {
    expect(pipeline).toMatch(/\.set\(KV\.config, CONSOLIDATION_LAST_RUN_KEY, \{ at: new Date\(\)\.toISOString\(\), tier, results \}\)/);
  });

  it("GET /agentmemory/consolidation/status is registered behind auth", () => {
    expect(api).toMatch(/registerFunction\("api::consolidation-status",\s*async \(req: HttpRequest\): Promise<Response> => \{\s*const authErr = checkAuth\(req, secret\);/);
    expect(api).toMatch(/api_path: "\/agentmemory\/consolidation\/status", http_method: "GET"/);
  });

  it("status requests share one set of store scans instead of listing every scope per request", () => {
    expect(api).toMatch(/const sharedConsolidationCounts = singleFlight\(async \(\) => \{/);
    expect(api).toMatch(/\}, CONSOLIDATION_COUNTS_REUSE_MS\);/);
    const handler = api.slice(
      api.indexOf('registerFunction("api::consolidation-status"'),
      api.indexOf('function_id: "api::consolidation-status"'),
    );
    expect(handler).toMatch(/sharedConsolidationCounts\(\)/);
    expect(handler).not.toMatch(/kv\.list\(/);
  });

  it("the dashboard shows one Memory layers panel instead of the three separate cards", () => {
    expect(viewer).toMatch(/apiGet\('consolidation\/status'\)/);
    expect(viewer).toMatch(/html \+= renderMemoryLayers\(d\.consolidation, semFacts, procItems\);/);
    expect(viewer).not.toMatch(/card-title">Semantic Memory|card-title">Procedural Memory|card-title">Consolidation Status/);
    expect(viewer).not.toMatch(/consolidation-row/);
  });
});
