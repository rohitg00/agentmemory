import { afterEach, describe, expect, it, vi } from "vitest";
import { registerFlowCompressFunction } from "../src/functions/flow-compress.js";
import { getSearchIndex } from "../src/functions/search.js";
import type { Action, Memory, MemoryProvider } from "../src/types.js";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../src/state/kv.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function doneAction(id: string, project = "proj-a"): Action {
  const ts = "2026-11-20T00:00:00.000Z";
  return {
    id,
    title: `Finish ${id}`,
    description: `Work for ${id}`,
    status: "done",
    priority: 1,
    createdAt: ts,
    updatedAt: ts,
    createdBy: "agent-a",
    project,
    tags: [],
    sourceObservationIds: [],
    sourceMemoryIds: [],
    result: "shipped",
  };
}

const SUMMARY_XML = [
  "<summary>",
  "<goal>Quasar deploy pipeline</goal>",
  "<outcome>Pipeline shipped</outcome>",
  "<steps>Built image, pushed, rolled out</steps>",
  "<discoveries>Registry needed auth</discoveries>",
  "<lesson>Cache credentials early</lesson>",
  "</summary>",
].join("\n");

function fixture(
  summarize: (system: string, prompt: string) => Promise<string> = async () => SUMMARY_XML,
  extraScopes: Record<string, Map<string, unknown>> = {},
) {
  const store = new Map<string, Map<string, unknown>>([
    ["mem:actions", new Map([["act_1", doneAction("act_1")]])],
    ...Object.entries(extraScopes),
  ]);
  const kv = {
    get: async (scope: string, id: string) => store.get(scope)?.get(id) ?? null,
    set: async (scope: string, id: string, value: unknown) => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(id, value);
      return value;
    },
    list: async (scope: string) => [...(store.get(scope)?.values() ?? [])],
  };
  let handler: (args: object) => Promise<{ success: boolean; memoryId?: string; compressed?: number }>;
  const sdk = { registerFunction: (_: string, fn: typeof handler) => { handler = fn; } };
  const provider = { summarize: vi.fn(summarize) };
  registerFlowCompressFunction(sdk as unknown as IIIClient, kv as unknown as StateKV, provider as unknown as MemoryProvider);
  const memory = (id: string) => store.get("mem:memories")?.get(id) as Memory | undefined;
  return { call: (args: object) => handler(args), provider, memory };
}

describe("flow-compressed memories", () => {
  afterEach(() => getSearchIndex().clear());

  it("are searchable immediately after mem::flow-compress returns", async () => {
    const f = fixture();
    const result = await f.call({ actionIds: ["act_1"] });
    expect(result.success).toBe(true);
    expect(result.memoryId).toMatch(/^mem_/);
    expect(f.provider.summarize).toHaveBeenCalledOnce();

    const idx = getSearchIndex();
    expect(idx.has(result.memoryId!)).toBe(true);
    expect(idx.layerOf(result.memoryId!)).toBe("memory");
    expect(
      idx.search("quasar deploy pipeline", 5, "memory").map((r) => r.obsId),
    ).toContain(result.memoryId);
    expect(f.memory(result.memoryId!)).toMatchObject({
      id: result.memoryId,
      title: "Quasar deploy pipeline",
      isLatest: true,
      metadata: expect.objectContaining({ flowCompressed: true }),
    });
  });

  it("stamps the agent so scoped recall can find it", async () => {
    vi.stubEnv("AGENT_ID", "agent-x");
    try {
      const f = fixture();
      const result = await f.call({ actionIds: ["act_1"] });
      expect(result.success).toBe(true);
      expect(f.memory(result.memoryId!)!.agentId).toBe("agent-x");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("stay searchable when the provider output has no summary tags", async () => {
    const f = fixture(
      async () => "quasar deploy failed where left < threshold && threshold > right on retry",
    );
    const result = await f.call({ actionIds: ["act_1"] });
    expect(result.success).toBe(true);
    expect(result.memoryId).toBeTruthy();

    expect(getSearchIndex().has(result.memoryId!)).toBe(true);
    expect(f.memory(result.memoryId!)!.content).toContain("quasar");
    expect(f.memory(result.memoryId!)!.content).toContain("left < threshold && threshold > right");
  });

  it("keeps long fallback summaries searchable past the embedding input limit", async () => {
    const response = "deployment notes ".repeat(1100) + "Quasar rollback checkpoint";
    const f = fixture(async () => response);
    const result = await f.call({ actionIds: ["act_1"] });

    expect(result.success).toBe(true);
    const stored = f.memory(result.memoryId!)!;
    expect(stored.title.length).toBeLessThanOrEqual(80);
    expect(stored.content).toBe(response);
    expect(
      getSearchIndex().search("quasar rollback checkpoint", 5, "memory").map((r) => r.obsId),
    ).toContain(result.memoryId);
  });

  it("parses attributed summary tags instead of dropping them", async () => {
    const f = fixture(
      async () =>
        '<summary format="xml"><goal confidence="high">Quasar pipeline</goal>' +
        '<steps count="2">built and pushed</steps></summary>',
    );
    const result = await f.call({ actionIds: ["act_1"] });
    expect(result.success).toBe(true);

    const stored = f.memory(result.memoryId!)!;
    expect(stored.title).toBe("Quasar pipeline");
    expect(stored.content).toContain("built and pushed");
    expect(stored.content).not.toContain("<");
    expect(getSearchIndex().has(result.memoryId!)).toBe(true);
  });

  it("returns failure and indexes nothing when summarization fails", async () => {
    const f = fixture(async () => { throw new Error("provider down"); });
    const result = await f.call({ actionIds: ["act_1"] });
    expect(result.success).toBe(false);
    expect(result.memoryId).toBeUndefined();
    expect(getSearchIndex().size).toBe(0);
  });

  it("falls back to generic content when the provider returns nothing", async () => {
    const f = fixture(async () => "");
    const result = await f.call({ actionIds: ["act_1"] });
    expect(result.success).toBe(true);
    expect(result.memoryId).toBeTruthy();
    expect(getSearchIndex().has(result.memoryId!)).toBe(true);
    expect(f.memory(result.memoryId!)!.content).toContain("completed actions");
  });

  it("stamps the project only when project selected the actions", async () => {
    const byProject = fixture();
    const scoped = await byProject.call({ project: "proj-a" });
    expect(scoped.success).toBe(true);
    expect(byProject.memory(scoped.memoryId!)!.project).toBe("proj-a");

    const byIds = fixture();
    const unscoped = await byIds.call({ actionIds: ["act_1"], project: "other" });
    expect(unscoped.success).toBe(true);
    expect(byIds.memory(unscoped.memoryId!)!.project).toBeUndefined();
    expect(getSearchIndex().has(unscoped.memoryId!)).toBe(true);

    const matching = fixture();
    const confirmed = await matching.call({ actionIds: ["act_1"], project: "proj-a" });
    expect(confirmed.success).toBe(true);
    expect(matching.memory(confirmed.memoryId!)!.project).toBe("proj-a");

    const run = {
      id: "run_1", routineId: "r", status: "completed", startedAt: "2026-11-20T00:00:00.000Z",
      actionIds: ["act_1"], stepStatus: {}, initiatedBy: "agent-a",
    };
    const byRun = fixture(undefined, { "mem:routine-runs": new Map([["run_1", run]]) });
    const fromRun = await byRun.call({ runId: "run_1", project: "other" });
    expect(fromRun.success).toBe(true);
    expect(byRun.memory(fromRun.memoryId!)!.project).toBeUndefined();

    const inferred = fixture(undefined, { "mem:routine-runs": new Map([["run_1", run]]) });
    const fromRunNoScope = await inferred.call({ runId: "run_1" });
    expect(fromRunNoScope.success).toBe(true);
    expect(inferred.memory(fromRunNoScope.memoryId!)!.project).toBe("proj-a");
  });
});
