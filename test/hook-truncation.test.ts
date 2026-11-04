import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");
const SESSION = "ses_hook_truncation";
const SMILE = "\u{1F600}";
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const LONG = 9000;

type Site = {
  name: string;
  script: string;
  payload: (text: string) => Record<string, unknown>;
  field: (data: Record<string, unknown>) => unknown;
};

const base = { session_id: SESSION, cwd: "/work/hook-truncation" };
let home = "";
let transcripts = 0;

const sites: Site[] = [
  {
    name: "subagent-stop reply",
    script: "subagent-stop.mjs",
    payload: (text) => ({ ...base, agent_id: "a1", last_assistant_message: text }),
    field: (data) => data.last_message,
  },
  {
    name: "task-completed description",
    script: "task-completed.mjs",
    payload: (text) => ({ ...base, task_id: "t1", task_description: text }),
    field: (data) => data.task_description,
  },
  {
    name: "post-tool-failure string input",
    script: "post-tool-failure.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: text, error: "exit 1" }),
    field: (data) => data.tool_input,
  },
  {
    name: "post-tool-failure object input",
    script: "post-tool-failure.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: { command: text }, error: "exit 1" }),
    field: (data) => data.tool_input,
  },
  {
    name: "post-tool-failure error",
    script: "post-tool-failure.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: "ls", error: text }),
    field: (data) => data.error,
  },
  {
    name: "post-tool-failure object error",
    script: "post-tool-failure.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: "ls", error: { message: text } }),
    field: (data) => data.error,
  },
  {
    name: "post-tool-use string output",
    script: "post-tool-use.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: { command: "ls" }, tool_response: text }),
    field: (data) => data.tool_output,
  },
  {
    name: "post-tool-use object output",
    script: "post-tool-use.mjs",
    payload: (text) => ({ ...base, tool_name: "Bash", tool_input: { command: "ls" }, tool_response: { stdout: text } }),
    field: (data) => data.tool_output,
  },
  {
    name: "session-end transcript prompt",
    script: "session-end.mjs",
    payload: (text) => {
      const transcript = join(home, `transcript-${++transcripts}.jsonl`);
      writeFileSync(transcript, JSON.stringify({ type: "user", message: { role: "user", content: text } }) + "\n");
      return { ...base, transcript_path: transcript };
    },
    field: (data) => data.prompt,
  },
  {
    name: "session-end explicit user input",
    script: "session-end.mjs",
    payload: (text) => {
      const transcript = join(home, `transcript-${++transcripts}.jsonl`);
      const content = `<USER_REQUEST>\n${text}\n</USER_REQUEST>`;
      writeFileSync(transcript, JSON.stringify({ type: "USER_INPUT", source: "USER_EXPLICIT", content }) + "\n");
      return { ...base, transcript_path: transcript };
    },
    field: (data) => data.prompt,
  },
];

describe("hook truncation at a surrogate pair", () => {
  let server: Server;
  let received: Array<{ path: string; body: Record<string, unknown> }>;
  let env: Record<string, string>;

  beforeAll(async () => {
    received = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          received.push({ path: req.url ?? "", body: JSON.parse(raw) });
        } catch {}
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "accepted" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    home = mkdtempSync(join(tmpdir(), "am-hook-truncation-"));
    env = {
      PATH: process.env["PATH"] ?? "",
      HOME: home,
      AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
      AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool"),
    };
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  });

  async function sent(site: Site, text: string): Promise<string> {
    const before = received.length;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(HOOKS_DIR, site.script)], { env, stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", reject);
      child.on("close", () => resolve());
      child.stdin.end(JSON.stringify(site.payload(text)));
    });
    const observed = received.slice(before).filter((r) => r.path === "/agentmemory/observe");
    expect(observed, site.name).toHaveLength(1);
    const value = site.field(observed[0]!.body.data as Record<string, unknown>);
    expect(typeof value, site.name).toBe("string");
    return value as string;
  }

  const count = (value: string, ch: string) => value.split(ch).length - 1;

  it.each(sites.map((site) => [site.name, site] as const))("%s steps back from a split pair", async (_name, site) => {
    const kept = count(await sent(site, "x".repeat(LONG)), "x");
    expect(kept, site.name).toBeLessThan(LONG);

    const split = await sent(site, "x".repeat(kept - 1) + SMILE + "x".repeat(LONG));
    expect(split).not.toMatch(LONE_SURROGATE);
    expect(split).not.toContain(SMILE);
    expect(count(split, "x")).toBe(kept - 1);

    const whole = await sent(site, "x".repeat(kept - 2) + SMILE + "x".repeat(LONG));
    expect(whole).toContain(SMILE);
    expect(count(whole, "x")).toBe(kept - 2);
  });
});
