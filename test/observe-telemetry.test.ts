import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RawObservation } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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
    update: async (scope: string, key: string, updates: Array<{ path: string; value: unknown }>) => {
      const m = store.get(scope);
      if (!m) return;
      const v = (m.get(key) as Record<string, unknown>) ?? {};
      for (const u of updates) v[u.path] = u.value;
      m.set(key, v);
    },
    delete: async (scope: string, key: string) => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const m = store.get(scope);
      return m ? (Array.from(m.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    fns,
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    registerTrigger: vi.fn(),
    trigger: async (
      idOrInput: string | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : (idOrInput.payload as unknown);
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

function payload(hookType: string, data: unknown) {
  return {
    sessionId: "ses_telemetry",
    project: "/home/user/myrepo",
    cwd: "/home/user/myrepo",
    hookType,
    timestamp: new Date().toISOString(),
    data,
  };
}

async function observeAndGetRaw(hookType: string, data: unknown): Promise<RawObservation> {
  process.env["AGENTMEMORY_AUTO_COMPRESS"] = "true";
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const sdk = mockSdk();
  const kv = mockKV();
  registerObserveFunction(sdk as never, kv as never);
  const result = (await sdk.trigger("mem::observe", payload(hookType, data))) as { observationId: string };
  expect(result.observationId).toBeTruthy();
  const scope = `mem:obs:ses_telemetry`;
  const stored = kv.store.get(scope);
  expect(stored).toBeTruthy();
  const entry = Array.from(stored!.values())[0] as RawObservation & Record<string, unknown>;
  process.env["AGENTMEMORY_AUTO_COMPRESS"] = "false";
  return entry as RawObservation;
}

describe("observe telemetry layer 1", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("patch_applied extracts files + title (strings only, cap 50)", async () => {
    const raw = await observeAndGetRaw("patch_applied", {
      files: ["src/a.ts", "src/b.ts", 123, null, "src/c.ts"],
      hash: "abc123",
    });
    expect(raw.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(raw.title).toBe("Applied patch to 3 file(s)");
  });

  it("patch_applied with no files array yields empty files and Applied patch to 0 file(s) title", async () => {
    const raw = await observeAndGetRaw("patch_applied", { hash: "abc123" });
    expect(raw.files).toEqual([]);
    expect(raw.title).toBe("Applied patch to 0 file(s)");
  });

  it("patch_applied caps files at 50", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `src/file${i}.ts`);
    const raw = await observeAndGetRaw("patch_applied", { files: many });
    expect(raw.files!.length).toBe(50);
    expect(raw.title).toBe("Applied patch to 50 file(s)");
  });

  it("command_executed extracts toolName/toolInput + title", async () => {
    const raw = await observeAndGetRaw("command_executed", {
      name: "npm test",
      arguments: "npm run test --coverage",
    });
    expect(raw.toolName).toBe("npm test");
    expect(raw.toolInput).toBe("npm run test --coverage");
    expect(raw.title).toBe("Executed command: npm test");
  });

  it("command_executed slices long arguments to 2000", async () => {
    const longArgs = "x".repeat(3000);
    const raw = await observeAndGetRaw("command_executed", {
      name: "bash",
      arguments: longArgs,
    });
    expect((raw.toolInput as string).length).toBe(2000);
  });

  it("command_executed with missing arguments yields undefined toolInput", async () => {
    const raw = await observeAndGetRaw("command_executed", { name: "ls" });
    expect(raw.toolInput).toBeUndefined();
    expect(raw.title).toBe("Executed command: ls");
  });

  it("subagent_start title from description", async () => {
    const raw = await observeAndGetRaw("subagent_start", {
      description: "Explore codebase",
      agent: "Explore",
      prompt: "find all files",
    });
    expect(raw.title).toBe("Started subagent: Explore codebase");
    expect(raw.toolInput).toBe("find all files");
  });

  it("subagent_start title falls back to agent when description missing", async () => {
    const raw = await observeAndGetRaw("subagent_start", {
      agent: "Plan",
      prompt: "make a plan",
    });
    expect(raw.title).toBe("Started subagent: Plan");
  });

  it("subagent_start title falls back to prompt slice 120 when description and agent missing", async () => {
    const longPrompt = "a".repeat(200);
    const raw = await observeAndGetRaw("subagent_start", {
      prompt: longPrompt,
    });
    expect(raw.title).toBe(`Started subagent: ${longPrompt.slice(0, 120)}`);
  });

  it("subagent_start toolInput sliced to 4000 when prompt is long", async () => {
    const longPrompt = "y".repeat(5000);
    const raw = await observeAndGetRaw("subagent_start", {
      prompt: longPrompt,
      description: "desc",
    });
    expect((raw.toolInput as string).length).toBe(4000);
  });

  it("task_completed title counts completed/total", async () => {
    const raw = await observeAndGetRaw("task_completed", {
      completed: [{ content: "done 1" }, { content: "done 2" }],
      total: 5,
    });
    expect(raw.title).toBe("Task completed: 2/5 items");
  });

  it("task_completed handles missing completed/total", async () => {
    const raw = await observeAndGetRaw("task_completed", {});
    expect(raw.title).toBe("Task completed");
  });

  it("prompt_submit keeps userPrompt and extracts files cap 20 strings only", async () => {
    const raw = await observeAndGetRaw("prompt_submit", {
      prompt: "hello world",
      files: ["src/a.ts", "src/b.ts", 42, null, "src/c.ts"],
    });
    expect(raw.userPrompt).toBe("hello world");
    expect(raw.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("prompt_submit files capped at 20", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `src/file${i}.ts`);
    const raw = await observeAndGetRaw("prompt_submit", { prompt: "hi", files: many });
    expect(raw.files!.length).toBe(20);
  });

  it("assistant_message is routed to session metrics without creating observation", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const sdk = mockSdk();
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never);
    const result = (await sdk.trigger("mem::observe", payload("assistant_message", { text: "hi" }))) as any;
    expect(result.telemetry).toBe(true);
    expect(result.observationId).toBeUndefined();
  });

  it("session_status is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("session_status", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("step_finish is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("step_finish", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("llm_params is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("llm_params", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("reasoning is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("reasoning", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("config_loaded is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("config_loaded", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("session_updated is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("session_updated", {});
    expect(raw.isTelemetry).toBe(true);
  });

  it("notification is marked isTelemetry", async () => {
    const raw = await observeAndGetRaw("notification", { message: "hi" });
    expect(raw.isTelemetry).toBe(true);
  });

  it("tool hooks unchanged (tool_input/tool_output still extracted)", async () => {
    const raw = await observeAndGetRaw("post_tool_use", {
      tool_name: "Read",
      tool_input: { file_path: "src/foo.ts" },
      tool_output: "contents",
    });
    expect(raw.toolName).toBe("Read");
    expect(raw.toolInput).toEqual({ file_path: "src/foo.ts" });
    expect(raw.toolOutput).toBe("contents");
    expect(raw.isTelemetry).toBeUndefined();
  });

  it("post_tool_failure still extracts tool fields", async () => {
    const raw = await observeAndGetRaw("post_tool_failure", {
      tool_name: "Bash",
      tool_input: { command: "ls" },
      error: "failed",
    });
    expect(raw.toolName).toBe("Bash");
    expect(raw.toolOutput).toBe("failed");
  });

  it("dedup still works for distinct non-tool events", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk();
    const kv = mockKV();
    const dedup = new DedupMap();
    registerObserveFunction(sdk as never, kv as never, dedup);

    const first = (await sdk.trigger("mem::observe", payload("patch_applied", { files: ["a.ts"] }))) as { observationId?: string; deduplicated?: boolean };
    const second = (await sdk.trigger("mem::observe", payload("patch_applied", { files: ["b.ts"] }))) as { observationId?: string; deduplicated?: boolean };
    expect(first.observationId).toBeTruthy();
    expect(second.observationId).toBeTruthy();
    expect(second.deduplicated).toBeUndefined();

    const third = (await sdk.trigger("mem::observe", payload("patch_applied", { files: ["a.ts"] }))) as { deduplicated?: boolean };
    expect(third.deduplicated).toBe(true);
  });
});

describe("compress-synthetic layer 2", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses title as narrative seed when narrative would otherwise be empty", async () => {
    const { buildSyntheticCompression } = await import("../src/functions/compress-synthetic.js");
    const raw: RawObservation = {
      id: "obs_1",
      sessionId: "ses_1",
      timestamp: new Date().toISOString(),
      hookType: "patch_applied" as never,
      title: "Applied patch to 2 file(s)",
      files: ["src/a.ts", "src/b.ts"],
      raw: {},
    };
    const synth = buildSyntheticCompression(raw);
    expect(synth.narrative).toBe("Applied patch to 2 file(s)");
    expect(synth.title).toBe("Applied patch to 2 file(s)");
  });

  it("includes files from obs.files (dedup, cap 20)", async () => {
    const { buildSyntheticCompression } = await import("../src/functions/compress-synthetic.js");
    const many = Array.from({ length: 25 }, (_, i) => `src/file${i}.ts`);
    const raw: RawObservation = {
      id: "obs_2",
      sessionId: "ses_1",
      timestamp: new Date().toISOString(),
      hookType: "command_executed" as never,
      title: "Executed command: npm test",
      toolName: "npm test",
      toolInput: { file_path: "src/a.ts" },
      files: many,
      raw: {},
    };
    const synth = buildSyntheticCompression(raw);
    expect(synth.files.length).toBeLessThanOrEqual(20);
    expect(synth.files).toContain("src/a.ts");
    expect(synth.title).toBe("Executed command: npm test");
  });

  it("telemetry with no title/files/tool fields keeps empty narrative/files", async () => {
    const { buildSyntheticCompression } = await import("../src/functions/compress-synthetic.js");
    const raw: RawObservation = {
      id: "obs_3",
      sessionId: "ses_1",
      timestamp: new Date().toISOString(),
      hookType: "assistant_message" as never,
      isTelemetry: true,
      raw: {},
    };
    const synth = buildSyntheticCompression(raw);
    expect(synth.narrative).toBe("");
    expect(synth.files).toEqual([]);
  });

  it("keeps existing behavior for toolInput/toolOutput/userPrompt", async () => {
    const { buildSyntheticCompression } = await import("../src/functions/compress-synthetic.js");
    const raw: RawObservation = {
      id: "obs_4",
      sessionId: "ses_1",
      timestamp: new Date().toISOString(),
      hookType: "post_tool_use",
      toolName: "Read",
      toolInput: { file_path: "src/foo.ts" },
      toolOutput: "file contents",
      raw: {},
    };
    const synth = buildSyntheticCompression(raw);
    expect(synth.narrative).toContain("file contents");
    expect(synth.files).toContain("src/foo.ts");
    expect(synth.type).toBe("file_read");
  });
});
