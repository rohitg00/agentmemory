import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = join(import.meta.dirname, "..", "plugin", "scripts", "stop.mjs");

let server: Server;
let port: number;
let home: string;
const posts: Array<{ path: string; body: Record<string, unknown> }> = [];

function runHook(payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], {
      env: {
        PATH: process.env["PATH"] ?? "",
        HOME: home,
        AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
        AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool"),
      },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", () => resolve());
    child.stdin.end(JSON.stringify(payload));
  });
}

function observes() {
  return posts.filter((p) => p.path.endsWith("/agentmemory/observe"));
}

function sessionEnds() {
  return posts.filter((p) => p.path.endsWith("/agentmemory/session/end"));
}

const stopPayload = {
  session_id: "ses_stop_reply",
  prompt_id: "6f1c2a8e-5b7d-4c11-9a3e-2d4f6b8c0e12",
  transcript_path: "/tmp/does-not-matter.jsonl",
  cwd: "/work/project",
  hook_event_name: "Stop",
  stop_hook_active: false,
};

describe("stop hook captures the assistant reply", () => {
  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "am-stop-reply-"));
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          posts.push({ path: req.url ?? "", body: JSON.parse(raw || "{}") });
        } catch {
          posts.push({ path: req.url ?? "", body: {} });
        }
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  });

  beforeEach(() => {
    posts.length = 0;
  });

  it("posts last_assistant_message as a stop observation and still ends the turn", async () => {
    const reply = "We decided to use bge-m3 for Spanish embeddings because it handles accents.";
    await runHook({ ...stopPayload, last_assistant_message: reply });

    expect(observes()).toHaveLength(1);
    const body = observes()[0]!.body;
    expect(body["hookType"]).toBe("stop");
    expect(body["sessionId"]).toBe("ses_stop_reply");
    expect(body["cwd"]).toBe("/work/project");
    expect(typeof body["eventId"]).toBe("string");
    expect(body["data"]).toEqual({ last_assistant_message: reply });

    expect(sessionEnds()).toHaveLength(1);
    expect(sessionEnds()[0]!.body).toEqual({ sessionId: "ses_stop_reply", final: false });
  });

  it("caps a long reply at 4000 characters", async () => {
    await runHook({ ...stopPayload, last_assistant_message: "a".repeat(10_000) });

    const data = observes()[0]!.body["data"] as { last_assistant_message: string };
    expect(data.last_assistant_message).toHaveLength(4000);
  });

  it("only ends the turn when the host sends no reply text", async () => {
    await runHook({ ...stopPayload });
    await runHook({ ...stopPayload, last_assistant_message: "   \n" });
    await runHook({ ...stopPayload, last_assistant_message: 42 });

    expect(observes()).toHaveLength(0);
    expect(sessionEnds()).toHaveLength(3);
  });

  it("keeps each reply when a blocking Stop hook continues the same prompt", async () => {
    await runHook({ ...stopPayload, last_assistant_message: "First pass: tests still fail." });
    await runHook({ ...stopPayload, stop_hook_active: true, last_assistant_message: "Second pass: all tests pass." });

    const ids = observes().map((p) => p.body["eventId"]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
