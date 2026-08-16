import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: Server;
let port: number;
const posts: Array<{ path: string; body: Record<string, unknown> }> = [];

function runHook(payload: Record<string, unknown>): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", ["plugin/scripts/session-end.mjs"], {
      env: { ...process.env, AGENTMEMORY_URL: `http://127.0.0.1:${port}` },
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("session-end transcript prompt backfill", () => {
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "am-transcript-"));
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          posts.push({ path: req.url ?? "", body: JSON.parse(body || "{}") });
        } catch {
          posts.push({ path: req.url ?? "", body: {} });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("posts each user_query from a Cursor transcript before session end", async () => {
    posts.length = 0;
    const transcript = join(dir, "t1.jsonl");
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          role: "user",
          message: {
            content: [
              {
                type: "text",
                text: "<timestamp>Sunday</timestamp>\n<user_query>\nfirst prompt here\n</user_query>",
              },
            ],
          },
        }),
        JSON.stringify({
          role: "assistant",
          message: { content: [{ type: "text", text: "answer" }] },
        }),
        JSON.stringify({
          role: "user",
          message: {
            content: [{ type: "text", text: "bare second prompt" }],
          },
        }),
        "",
      ].join("\n"),
    );

    const code = await runHook({
      session_id: "ses_t1",
      hook_event_name: "sessionEnd",
      workspace_roots: ["/tmp"],
      reason: "completed",
      transcript_path: transcript,
    });
    expect(code).toBe(0);

    const observes = posts.filter((p) => p.path.includes("/observe"));
    expect(observes.map((p) => (p.body.data as { prompt: string }).prompt)).toEqual([
      "first prompt here",
      "bare second prompt",
    ]);
    for (const p of observes) {
      expect(p.body.hookType).toBe("prompt_submit");
      expect(p.body.sessionId).toBe("ses_t1");
    }
    const endIndex = posts.findIndex((p) => p.path.includes("/session/end"));
    expect(endIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < posts.length; i++) {
      if (posts[i].path.includes("/observe")) expect(i).toBeLessThan(endIndex);
    }
  });

  it("caps backfill at 50 prompts even within a single transcript record", async () => {
    posts.length = 0;
    const transcript = join(dir, "t-cap.jsonl");
    const blocks = Array.from({ length: 60 }, (_, i) => ({
      type: "text",
      text: `<user_query>\nprompt number ${i}\n</user_query>`,
    }));
    writeFileSync(
      transcript,
      JSON.stringify({ role: "user", message: { content: blocks } }) + "\n",
    );

    const code = await runHook({
      session_id: "ses_cap",
      hook_event_name: "sessionEnd",
      reason: "completed",
      transcript_path: transcript,
    });
    expect(code).toBe(0);
    expect(posts.filter((p) => p.path.includes("/observe"))).toHaveLength(50);
  });

  it("skips backfill cleanly when transcript_path is absent or unreadable", async () => {
    posts.length = 0;
    expect(
      await runHook({
        session_id: "ses_t2",
        hook_event_name: "sessionEnd",
        reason: "completed",
      }),
    ).toBe(0);
    expect(
      await runHook({
        session_id: "ses_t3",
        hook_event_name: "sessionEnd",
        reason: "completed",
        transcript_path: join(dir, "missing.jsonl"),
      }),
    ).toBe(0);
    expect(posts.filter((p) => p.path.includes("/observe"))).toHaveLength(0);
    expect(
      posts.filter((p) => p.path.includes("/session/end")),
    ).toHaveLength(2);
  });
});
