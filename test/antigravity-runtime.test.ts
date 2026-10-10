import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const exec = promisify(execFile);
let server: Server | undefined;
let root: string;
afterEach(async () => {
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("bundled Antigravity bridge", () => {
  it("injects context, captures transcript prompts and tool identities, and closes only when idle", async () => {
    root = mkdtempSync(join(tmpdir(), "am-agy-runtime-"));
    const plugin = join(root, "plugin");
    symlinkSync(
      resolve(__dirname, "../plugin"),
      plugin,
      process.platform === "win32" ? "junction" : "dir",
    );
    const posts: Array<{ path: string; body: any }> = [];
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      posts.push({ path: req.url!, body: JSON.parse(raw || "{}") });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ context: "Synthetic recalled decision" }));
    });
    await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
    const port = (server.address() as { port: number }).port;
    const transcriptPath = join(root, "transcript.jsonl");
    writeFileSync(
      transcriptPath,
      [
        {
          step_index: 0,
          type: "USER_INPUT",
          source: "USER_EXPLICIT",
          content:
            "<USER_REQUEST>\nRead sample.txt.\n</USER_REQUEST>\n<ADDITIONAL_METADATA>synthetic metadata</ADDITIONAL_METADATA>",
        },
        {
          step_index: 1,
          type: "PLANNER_RESPONSE",
          source: "MODEL",
          content: "Not a user prompt",
        },
        {
          step_index: 2,
          type: "USER_INPUT",
          source: "SYSTEM",
          content: "Not an explicit user prompt",
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n"),
    );
    const run = async (event: string, extra = {}) => {
      const child = exec(
        process.execPath,
        [join(plugin, "scripts/antigravity-bridge.mjs"), event],
        {
          env: {
            ...process.env,
            AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
            AGENTMEMORY_INJECT_CONTEXT: "true",
            AGENTMEMORY_DATA_DIR: join(root, "capture"),
          },
          timeout: 15_000,
        },
      );
      child.child.stdin!.end(
        JSON.stringify({
          conversationId: "ag-test",
          workspacePaths: [root],
          transcriptPath,
          ...extra,
        }),
      );
      return JSON.parse((await child).stdout);
    };
    expect(await run("PreInvocation", { invocationNum: 0 })).toEqual({
      injectSteps: [{ ephemeralMessage: "Synthetic recalled decision" }],
    });
    expect(await run("PreInvocation", { invocationNum: 1 })).toEqual({});
    expect(
      await run("PreToolUse", {
        toolCall: { name: "view_file", args: { AbsolutePath: "/repo/a.ts" } },
      }),
    ).toEqual({ decision: "allow" });
    const tool = {
      stepIdx: 2,
      toolCall: { name: "view_file", args: { AbsolutePath: "/repo/a.ts" } },
    };
    await run("PostToolUse", tool);
    await run("PostToolUse", tool);
    await run("Stop", { fullyIdle: false });
    expect(posts.filter((p) => p.path.endsWith("/session/end"))).toHaveLength(
      0,
    );
    await run("Stop", { fullyIdle: true });
    expect(posts.filter((p) => p.path.endsWith("/session/start"))).toHaveLength(
      1,
    );
    expect(posts.filter((p) => p.path.endsWith("/session/end"))).toHaveLength(
      1,
    );
    const prompts = posts.filter((p) => p.body.hookType === "prompt_submit");
    expect(prompts.map((p) => p.body.data.prompt)).toEqual([
      "Read sample.txt.",
    ]);
    const tools = posts.filter((p) => p.body.hookType === "post_tool_use");
    expect(tools).toHaveLength(2);
    expect(tools[0].body.data.tool_name).toBe("read");
    expect(tools[0].body.eventId).toBe(tools[1].body.eventId);
  }, 30_000);
});
