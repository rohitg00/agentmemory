import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");

function runHook(
  scriptName: string,
  stdin: string,
  env: Record<string, string>,
): Promise<{ exitCode: number | null; ms: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HOOKS_DIR, scriptName)], {
      env: { PATH: process.env["PATH"] ?? "", HOME: env["HOME"] ?? tmpdir(), ...env },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, ms: Date.now() - started }));
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function toolPayload(marker: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "ses_hook_capture",
    cwd: "/work/hook-proj",
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: `echo ${marker}` },
    tool_response: { stdout: marker },
    ...extra,
  });
}

function spoolLines(dir: string, port: number): Array<{ eventId: string; body: Record<string, unknown> }> {
  const file = join(dir, `local-${port}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return check();
}

describe("hooks capture when the server is unavailable", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function startServer(status: number, received: Array<Record<string, unknown>>): Promise<number> {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          received.push(JSON.parse(body));
        } catch {}
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: status === 201 ? "accepted" : "x" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    return typeof addr === "object" && addr ? addr.port : 0;
  }

  async function closedPort(): Promise<number> {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
    const addr = probe.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    return port;
  }

  it("exits 0 quickly and spools the observation with its event id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const port = await closedPort();
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    const result = await runHook("post-tool-use.mjs", toolPayload("offlinecerulean947", { tool_use_id: "toolu_1" }), env);
    expect(result.exitCode).toBe(0);
    expect(result.ms).toBeLessThan(3000);
    const [rec] = spoolLines(dir, port);
    expect(rec!.eventId).toMatch(/^evh_[0-9a-f]{32}$/);
    expect(JSON.stringify(rec!.body)).toContain("offlinecerulean947");
    const again = await runHook("post-tool-use.mjs", toolPayload("offlinecerulean947", { tool_use_id: "toolu_1" }), env);
    expect(again.exitCode).toBe(0);
    const recs = spoolLines(dir, port);
    expect(recs).toHaveLength(2);
    expect(recs[1]!.eventId).toBe(recs[0]!.eventId);
  });

  it("gives two screenshots with the same tool input different event ids", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const port = await closedPort();
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    await runHook("post-tool-use.mjs", toolPayload("shot", { tool_response: "iVBORw0KGgoAAAA1" }), env);
    await runHook("post-tool-use.mjs", toolPayload("shot", { tool_response: "iVBORw0KGgoAAAA2" }), env);
    const recs = spoolLines(dir, port);
    expect(recs).toHaveLength(2);
    expect(recs[0]!.eventId).not.toBe(recs[1]!.eventId);
  });

  it("spools on a 5xx answer but not on a 4xx rejection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const received: Array<Record<string, unknown>> = [];
    const port = await startServer(500, received);
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    expect((await runHook("post-tool-use.mjs", toolPayload("five-hundred"), env)).exitCode).toBe(0);
    expect(spoolLines(dir, port)).toHaveLength(1);
    expect(received[0]!.eventId).toBe(spoolLines(dir, port)[0]!.eventId);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    const dir2 = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const port2 = await startServer(400, []);
    const env2 = { AGENTMEMORY_URL: `http://127.0.0.1:${port2}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir2 };
    expect((await runHook("post-tool-use.mjs", toolPayload("four-hundred"), env2)).exitCode).toBe(0);
    expect(spoolLines(dir2, port2)).toHaveLength(0);
  });

  it("does not spool when the spool is turned off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const port = await closedPort();
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir, AGENTMEMORY_CAPTURE_SPOOL: "false" };
    expect((await runHook("post-tool-use.mjs", toolPayload("disabled"), env)).exitCode).toBe(0);
    expect(spoolLines(dir, port)).toHaveLength(0);
  });

  it("keeps every record when many hooks spool at once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const port = await closedPort();
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => runHook("post-tool-use.mjs", toolPayload(`parallel-${i}`), env)),
    );
    expect(results.every((r) => r.exitCode === 0)).toBe(true);
    const recs = spoolLines(dir, port);
    expect(recs).toHaveLength(12);
    expect(new Set(recs.map((r) => r.eventId)).size).toBe(12);
  });

  it("sends the spool in the background once the server answers again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-spool-"));
    const received: Array<Record<string, unknown>> = [];
    const port = await startServer(201, received);
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect((await runHook("prompt-submit.mjs", JSON.stringify({ session_id: "ses_hook_capture", cwd: "/work/hook-proj", prompt: "spooled prompt" }), env)).exitCode).toBe(0);
    const spooled = spoolLines(dir, port);
    expect(spooled).toHaveLength(1);

    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(201, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server!.listen(port, "127.0.0.1", () => resolve()));
    const live = await runHook("post-tool-use.mjs", toolPayload("back-online"), env);
    expect(live.exitCode).toBe(0);
    expect(live.ms).toBeLessThan(3000);
    expect(await waitFor(() => received.some((r) => r.eventId === spooled[0]!.eventId), 8000)).toBe(true);
    expect(await waitFor(() => spoolLines(dir, port).length === 0, 3000)).toBe(true);
    expect(received.filter((r) => r.eventId === spooled[0]!.eventId)).toHaveLength(1);
  });
});

describe("hooks keep accepted observations until the server saved them", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  });

  async function markServer(received: Array<Record<string, unknown>>, mark: () => Record<string, unknown>): Promise<number> {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          received.push(JSON.parse(body));
        } catch {}
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "accepted", state: "completed", ...mark() }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    return typeof addr === "object" && addr ? addr.port : 0;
  }

  function sentRecords(dir: string): Array<{ eventId: string; bootId?: string }> {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.includes(".sent-"))
      .flatMap((f) => readFileSync(join(dir, f), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
  }

  it("releases a kept observation on a later call once the window passed, without sending it again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-keep-"));
    const received: Array<Record<string, unknown>> = [];
    const port = await markServer(received, () => ({ bootId: "aaaaaaaaaaaaaaaaaaaaaaaa", durableAfterMs: 0 }));
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    expect((await runHook("post-tool-use.mjs", toolPayload("kept-one", { tool_use_id: "toolu_k1" }), env)).exitCode).toBe(0);
    const first = sentRecords(dir);
    expect(first).toHaveLength(1);
    expect(first[0]!.eventId).toBe(received[0]!.eventId);
    expect(spoolLines(dir, port)).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await runHook("post-tool-use.mjs", toolPayload("kept-two", { tool_use_id: "toolu_k2" }), env)).exitCode).toBe(0);
    const second = sentRecords(dir);
    expect(second.map((r) => r.eventId)).toEqual([received[1]!.eventId]);
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toHaveLength(2);
  });

  it("re-sends a kept observation with the same event id after the server restarted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-keep-"));
    const received: Array<Record<string, unknown>> = [];
    let bootId = "aaaaaaaaaaaaaaaaaaaaaaaa";
    const port = await markServer(received, () => ({ bootId, durableAfterMs: 60_000 }));
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    await runHook("post-tool-use.mjs", toolPayload("before-restart", { tool_use_id: "toolu_r1" }), env);
    const lost = received[0]!.eventId;
    bootId = "bbbbbbbbbbbbbbbbbbbbbbbb";
    expect((await runHook("post-tool-use.mjs", toolPayload("after-restart", { tool_use_id: "toolu_r2" }), env)).exitCode).toBe(0);
    expect(await waitFor(() => received.filter((r) => r.eventId === lost).length === 2, 8000)).toBe(true);
    expect(await waitFor(() => sentRecords(dir).every((r) => r.bootId === bootId) && sentRecords(dir).length === 2, 3000)).toBe(true);
    expect(spoolLines(dir, port)).toHaveLength(0);
  });

  it("keeps nothing when the server sends no boot id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-keep-"));
    const received: Array<Record<string, unknown>> = [];
    const port = await markServer(received, () => ({}));
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir };
    expect((await runHook("post-tool-use.mjs", toolPayload("old-server"), env)).exitCode).toBe(0);
    expect(received).toHaveLength(1);
    expect(sentRecords(dir)).toHaveLength(0);
    expect(spoolLines(dir, port)).toHaveLength(0);
  });

  it("keeps nothing when the spool is turned off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-keep-"));
    const received: Array<Record<string, unknown>> = [];
    const port = await markServer(received, () => ({ bootId: "aaaaaaaaaaaaaaaaaaaaaaaa", durableAfterMs: 60_000 }));
    const env = { AGENTMEMORY_URL: `http://127.0.0.1:${port}`, AGENTMEMORY_CAPTURE_SPOOL_DIR: dir, AGENTMEMORY_CAPTURE_SPOOL: "false" };
    expect((await runHook("post-tool-use.mjs", toolPayload("spool-off"), env)).exitCode).toBe(0);
    expect(received).toHaveLength(1);
    expect(existsSync(dir) ? readdirSync(dir) : []).toHaveLength(0);
  });
});
