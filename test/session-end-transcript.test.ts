import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: Server;
let port: number;
const posts: Array<{ path: string; body: Record<string, unknown> }> = [];

function runHook(
  payload: Record<string, unknown>,
  script = "plugin/scripts/session-end.mjs",
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", [script], {
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
      expect((p.body.data as { backfill?: unknown }).backfill).toBe(true);
    }
    const endIndex = posts.findIndex((p) => p.path.includes("/session/end"));
    expect(endIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < posts.length; i++) {
      if (posts[i].path.includes("/observe")) expect(i).toBeLessThan(endIndex);
    }
  });

  it("posts prompts from a Claude Code transcript, skipping tool results", async () => {
    posts.length = 0;
    const transcript = join(dir, "t-cc.jsonl");
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "bare claude code prompt" },
        }),
        JSON.stringify({
          message: { role: "user", content: "nested role only" },
        }),
        JSON.stringify({
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: "answer" }] },
        }),
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                content: [{ type: "text", text: "tool output, not a prompt" }],
              },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "follow-up after the tool" },
        }),
        JSON.stringify({
          type: "user",
          isSidechain: true,
          message: { role: "user", content: "subagent instruction" },
        }),
        "",
      ].join("\n"),
    );

    const code = await runHook({
      session_id: "ses_cc",
      hook_event_name: "sessionEnd",
      reason: "completed",
      transcript_path: transcript,
    });
    expect(code).toBe(0);

    const observes = posts.filter((p) => p.path.includes("/observe"));
    expect(observes.map((p) => (p.body.data as { prompt: string }).prompt)).toEqual([
      "bare claude code prompt",
      "nested role only",
      "follow-up after the tool",
    ]);
  });

  it("skips Claude Code records the user did not type", async () => {
    posts.length = 0;
    const transcript = join(dir, "t-cc-harness.jsonl");
    const userLine = (content: string, extra: Record<string, unknown> = {}) =>
      JSON.stringify({ type: "user", ...extra, message: { role: "user", content } });
    writeFileSync(
      transcript,
      [
        userLine("typed by the user"),
        userLine("Base directory for this skill: /tmp/skill", { isMeta: true }),
        userLine("This session is being continued from a previous conversation.", {
          isCompactSummary: true,
        }),
        userLine("<command-name>/clear</command-name>"),
        userLine("<command-message>review</command-message>"),
        userLine("<local-command-stdout>done</local-command-stdout>"),
        userLine("<local-command-caveat>Caveat: generated locally</local-command-caveat>"),
        userLine("<task-notification><task-id>b1</task-id></task-notification>"),
        userLine("<system-reminder>context</system-reminder>"),
        userLine("<ci-monitor-event>build passed</ci-monitor-event>"),
        userLine("[Request interrupted by user]"),
        userLine("<bash-input>export API_TOKEN=secret && ls</bash-input>"),
        userLine("<bash-stdout>file.txt</bash-stdout><bash-stderr></bash-stderr>"),
        userLine("<bash-stderr>ls: no such file</bash-stderr>"),
        userLine('<cross-session-message from="other-session">status?</cross-session-message>'),
        userLine('<scheduled-task name="daily-check">run the check</scheduled-task>'),
        "",
      ].join("\n"),
    );

    await runHook({
      session_id: "ses_cc_harness",
      hook_event_name: "sessionEnd",
      reason: "completed",
      transcript_path: transcript,
    });

    const observes = posts.filter((p) => p.path.includes("/observe"));
    expect(observes.map((p) => (p.body.data as { prompt: string }).prompt)).toEqual([
      "typed by the user",
    ]);
  });

  it("gives a backfilled Claude Code prompt the event id of its live capture", async () => {
    posts.length = 0;
    const transcript = join(dir, "t-cc-live.jsonl");
    writeFileSync(
      transcript,
      [
        JSON.stringify({
          type: "user",
          promptId: "8f1d2c3b-0000-4000-8000-000000000001",
          timestamp: "2026-10-03T10:00:00.000Z",
          message: { role: "user", content: "same prompt twice" },
        }),
        "",
      ].join("\n"),
    );

    await runHook(
      {
        session_id: "ses_cc_live",
        hook_event_name: "UserPromptSubmit",
        prompt: "same prompt twice",
        prompt_id: "8f1d2c3b-0000-4000-8000-000000000001",
        transcript_path: transcript,
      },
      "plugin/scripts/prompt-submit.mjs",
    );
    await runHook({
      session_id: "ses_cc_live",
      hook_event_name: "sessionEnd",
      reason: "completed",
      transcript_path: transcript,
    });

    const observes = posts.filter((p) => p.path.includes("/observe"));
    expect(observes).toHaveLength(2);
    expect(observes[0].body.eventId).toBeTruthy();
    expect(observes[1].body.eventId).toBe(observes[0].body.eventId);
    expect(observes[1].body.timestamp).toBe("2026-10-03T10:00:00.000Z");
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
