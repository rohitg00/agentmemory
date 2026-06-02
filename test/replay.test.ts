import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseJsonlText } from "../src/replay/jsonl-parser.js";
import { projectTimeline } from "../src/replay/timeline.js";
import { registerReplayFunctions } from "../src/functions/replay.js";
import { KV } from "../src/state/schema.js";

const fx = (name: string) =>
  readFileSync(join(__dirname, "fixtures/jsonl", name), "utf-8");

describe("parseJsonlText", () => {
  it("parses basic user/assistant exchange", () => {
    const out = parseJsonlText(fx("basic.jsonl"));
    expect(out.sessionId).toBe("sess-basic");
    expect(out.project).toBe("project");
    expect(out.cwd).toBe("/Users/alice/project");
    expect(out.observations).toHaveLength(2);
    expect(out.observations[0].hookType).toBe("prompt_submit");
    expect(out.observations[0].userPrompt).toBe("Fix the login bug");
    expect(out.observations[1].hookType).toBe("stop");
    expect(out.observations[1].assistantResponse).toBe("Looking into it now.");
  });

  it("parses tool_use + tool_result pairs", () => {
    const out = parseJsonlText(fx("tool-use.jsonl"));
    expect(out.sessionId).toBe("sess-tool");
    const kinds = out.observations.map((o) => o.hookType);
    expect(kinds).toEqual([
      "prompt_submit",
      "pre_tool_use",
      "post_tool_use",
      "stop",
    ]);
    const toolCall = out.observations[1];
    expect(toolCall.toolName).toBe("Bash");
    expect((toolCall.toolInput as { command: string }).command).toBe("ls");
    const toolResult = out.observations[2];
    expect(toolResult.toolOutput).toBe("README.md\nsrc\n");
  });

  it("tolerates malformed lines and marks tool errors", () => {
    const out = parseJsonlText(fx("errors.jsonl"));
    const errObs = out.observations.find((o) => o.hookType === "post_tool_failure");
    expect(errObs).toBeDefined();
    expect(errObs?.toolOutput).toBe("exit 1");
  });

  it("falls back to generated sessionId when missing", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.sessionId).toMatch(/^sess_/);
  });

  it("returns empty observations for blank input", () => {
    const out = parseJsonlText("");
    expect(out.observations).toHaveLength(0);
  });

  it("prefers the file's sessionId over the fallback", () => {
    const text = [
      JSON.stringify({
        type: "user",
        sessionId: "real-session-from-file",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    ].join("\n");
    const out = parseJsonlText(text, "fallback-should-be-ignored");
    expect(out.sessionId).toBe("real-session-from-file");
    for (const obs of out.observations) {
      expect(obs.sessionId).toBe("real-session-from-file");
    }
  });

  it("returns the same sessionId across repeated parses of one file", () => {
    const text = JSON.stringify({
      type: "user",
      sessionId: "stable-id",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const a = parseJsonlText(text, "fb-1");
    const b = parseJsonlText(text, "fb-2");
    expect(a.sessionId).toBe("stable-id");
    expect(b.sessionId).toBe("stable-id");
  });

  it("uses the fallback only when the file has no sessionId", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text, "fb-used");
    expect(out.sessionId).toBe("fb-used");
  });
});

describe("projectTimeline", () => {
  it("preserves ordering and computes offsets from real timestamps", () => {
    const parsed = parseJsonlText(fx("tool-use.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.eventCount).toBe(4);
    expect(tl.events[0].kind).toBe("prompt");
    expect(tl.events[1].kind).toBe("tool_call");
    expect(tl.events[2].kind).toBe("tool_result");
    expect(tl.events[3].kind).toBe("response");
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[3].offsetMs).toBeGreaterThan(0);
  });

  it("synthesizes pacing when all timestamps identical", () => {
    const parsed = parseJsonlText(fx("basic.jsonl"));
    for (const obs of parsed.observations) obs.timestamp = "2026-04-17T10:00:00.000Z";
    const tl = projectTimeline(parsed.observations);
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[1].offsetMs).toBeGreaterThanOrEqual(300);
  });

  it("returns empty timeline for no observations", () => {
    const tl = projectTimeline([]);
    expect(tl.eventCount).toBe(0);
    expect(tl.totalDurationMs).toBe(0);
    expect(tl.events).toHaveLength(0);
  });

  it("marks errored tool results as tool_error kind", () => {
    const parsed = parseJsonlText(fx("errors.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.events.some((e) => e.kind === "tool_error")).toBe(true);
  });

  it("uses one shared fallback timestamp when metadata missing", () => {
    const text = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.startedAt).toBe(out.endedAt);
  });
});

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (key === undefined) throw new Error("missing field `key`");
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
    store,
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, handler: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, handler);
    },
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(payload);
    },
  };
}

describe("mem::replay::import-jsonl", () => {
  it("updates malformed existing sessions using the parsed session id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentmemory-replay-"));
    try {
      const file = join(dir, "session.jsonl");
      await writeFile(file, fx("basic.jsonl"), "utf-8");

      const kv = mockKV();
      await kv.set(KV.sessions, "sess-basic", {
        project: "project",
        cwd: "/Users/alice/project",
        startedAt: "2026-04-17T09:00:00.000Z",
        endedAt: "2026-04-17T09:00:00.000Z",
        status: "active",
        observationCount: 1,
      });
      const sdk = mockSdk();
      registerReplayFunctions(sdk as never, kv as never);

      const result = await sdk.trigger("mem::replay::import-jsonl", { path: file });

      expect(result).toMatchObject({
        success: true,
        imported: 1,
        sessionIds: ["sess-basic"],
        observations: 2,
      });
      const updated = kv.store.get(KV.sessions)?.get("sess-basic") as { id?: string; observationCount?: number; status?: string; tags?: string[] };
      expect(updated.id).toBe("sess-basic");
      expect(updated.observationCount).toBe(3);
      expect(updated.status).toBe("completed");
      expect(updated.tags).toContain("jsonl-import");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
