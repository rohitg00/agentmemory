import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { KV } from "../src/state/schema.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");
const SESSION = "ses_hook_ids";

const turn = {
  session_id: SESSION,
  prompt_id: "6f1c2a4e-0b7d-4c22-9e83-5a4b3c2d1e0f",
  transcript_path: `/home/u/.claude/projects/p/${SESSION}.jsonl`,
  cwd: "/work/hook-ids",
};

function subagentStop(agentId: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    ...turn,
    hook_event_name: "SubagentStop",
    stop_hook_active: false,
    agent_id: agentId,
    agent_type: "Explore",
    agent_transcript_path: `/home/u/.claude/projects/p/${SESSION}/subagents/agent-${agentId}.jsonl`,
    last_assistant_message: message,
    ...extra,
  };
}

function subagentStart(agentId: string) {
  return { ...turn, hook_event_name: "SubagentStart", agent_id: agentId, agent_type: "Explore" };
}

function taskCompleted(taskId: string, subject: string) {
  return { ...turn, hook_event_name: "TaskCompleted", task_id: taskId, task_subject: subject };
}

function permissionPrompt(message: string) {
  return { ...turn, hook_event_name: "Notification", notification_type: "permission_prompt", title: "Permission needed", message };
}

describe("hook event ids for distinct events under one prompt", () => {
  let server: Server;
  let received: Array<Record<string, unknown>>;
  let env: Record<string, string>;

  beforeAll(async () => {
    received = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          received.push(JSON.parse(raw));
        } catch {}
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const home = mkdtempSync(join(tmpdir(), "am-hook-ids-"));
    env = {
      PATH: process.env["PATH"] ?? "",
      HOME: home,
      AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
      AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool"),
    };
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function send(script: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const before = received.length;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(HOOKS_DIR, script)], { env, stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", reject);
      child.on("close", () => resolve());
      child.stdin.end(JSON.stringify(payload));
    });
    expect(received).toHaveLength(before + 1);
    return received[received.length - 1]!;
  }

  it("gives two subagents that stop in the same prompt different ids", async () => {
    const a = await send("subagent-stop.mjs", subagentStop("a1c4e7f0b2d5a8c13", "Found the race in auth.ts"));
    const b = await send("subagent-stop.mjs", subagentStop("b9d2f5a8c1e4b7d06", "No tests cover the parser"));
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("gives two subagents that start in the same prompt different ids", async () => {
    const a = await send("subagent-start.mjs", subagentStart("a1c4e7f0b2d5a8c13"));
    const b = await send("subagent-start.mjs", subagentStart("b9d2f5a8c1e4b7d06"));
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("gives two tasks completed in the same prompt different ids", async () => {
    const a = await send("task-completed.mjs", taskCompleted("task-001", "Add login endpoint"));
    const b = await send("task-completed.mjs", taskCompleted("task-002", "Add signup endpoint"));
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("gives two permission prompts in the same prompt different ids", async () => {
    const a = await send("notification.mjs", permissionPrompt("Claude needs your permission to use Bash"));
    const b = await send("notification.mjs", permissionPrompt("Claude needs your permission to use Bash"));
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("keeps one id when the same subagent or task event is delivered twice", async () => {
    for (const [script, payload] of [
      ["subagent-stop.mjs", subagentStop("c3e6a9d2f5b8c1e47", "Done")],
      ["subagent-start.mjs", subagentStart("c3e6a9d2f5b8c1e47")],
      ["task-completed.mjs", taskCompleted("task-003", "Write the migration")],
    ] as const) {
      const first = await send(script, payload);
      const again = await send(script, payload);
      expect(again.eventId).toBe(first.eventId);
    }
  });

  it("keeps subagents without a host agent id apart even when their reports match", async () => {
    const payload = { sessionId: SESSION, cwd: turn.cwd, agentName: "explore", last_assistant_message: "Done" };
    const a = await send("subagent-stop.mjs", payload);
    const b = await send("subagent-stop.mjs", payload);
    expect(a.eventId).not.toBe(b.eventId);
  });

  it("gives a subagent that stops again after a blocking stop hook a new id", async () => {
    const first = await send("subagent-stop.mjs", subagentStop("d4f7b0e3a6c9d2f58", "Draft ready"));
    const final = await send(
      "subagent-stop.mjs",
      subagentStop("d4f7b0e3a6c9d2f58", "Draft ready, tests added", { stop_hook_active: true }),
    );
    expect(final.eventId).not.toBe(first.eventId);
  });

  it("stores both subagent reports when the server dedups by event id", async () => {
    const a = await send("subagent-stop.mjs", subagentStop("e5a8c1f4b7d0e3a69", "Report A"));
    const b = await send("subagent-stop.mjs", subagentStop("f6b9d2a5c8e1f4b70", "Report B"));
    const retry = await send("subagent-stop.mjs", subagentStop("e5a8c1f4b7d0e3a69", "Report A"));

    vi.resetModules();
    const kv = mockKV();
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { registerCaptureFunctions } = await import("../src/functions/capture.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    registerObserveFunction(sdk as never, kv as never, new DedupMap());
    registerCaptureFunctions(sdk as never, kv as never, {});
    const capture = ({ eventId, ...payload }: Record<string, unknown>) =>
      sdk.trigger("mem::capture", { payload, eventId }) as Promise<Record<string, unknown>>;

    expect(await capture(a)).toMatchObject({ status: "accepted" });
    expect(await capture(b)).toMatchObject({ status: "accepted" });
    expect(await capture(retry)).toMatchObject({ status: "duplicate" });
    expect(kv.store.get(KV.observations(SESSION))?.size).toBe(2);
  });
});
