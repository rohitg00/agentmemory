import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { HOOK_MAP, delegateHook, isCursorHookKey } from "../src/hooks/cursor/delegate.js";

// What the Cursor adapter is responsible for is narrow and testable without a
// daemon: pick the right canonical hook, tell it which project this is, hand
// it the payload, and report what happened. These tests cover exactly that.
//
// They deliberately do not use spawnSync. spawnSync blocks the calling
// process's event loop, so an in-process HTTP server cannot accept the very
// connection the child is making -- the requests arrive only after the child
// has exited, which reads as "the hook sent nothing" and sends you hunting a
// bug that is not there.

const REPO_ROOT = join(import.meta.dirname, "..");
const CURSOR_SCRIPTS = join(REPO_ROOT, "plugin", "scripts", "cursor");
const OFFICIAL_SCRIPTS = join(REPO_ROOT, "plugin", "scripts");

const uniqueId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Capture {
  url: string;
  body: unknown;
}

function startCaptureServer(): Promise<{ url: string; captures: Capture[]; close: () => void }> {
  const captures: Capture[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {}
      captures.push({ url: req.url ?? "", body });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, sessions: [] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        captures,
        close: () => server.close(),
      });
    });
  });
}

function runShim(
  script: string,
  args: string[],
  payload: unknown,
  env: Record<string, string>,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(CURSOR_SCRIPTS, script), ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.stdout.resume();
    child.stdin.end(JSON.stringify(payload));
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForCapture(
  captures: Capture[],
  predicate: (c: Capture) => boolean,
  timeoutMs = 15000,
): Promise<Capture | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = captures.find(predicate);
    if (hit) return hit;
    await sleep(50);
  }
  return null;
}

describe("cursor hook map", () => {
  // The map is the only thing standing between a Cursor lifecycle event and
  // the hook that handles it, and its values are bare strings. A typo here
  // does not throw: the hook silently stops recording and nothing reports it.
  it("every Cursor event maps to a canonical hook that exists", () => {
    const missing = Object.entries(HOOK_MAP).filter(
      ([, script]) => !existsSync(join(OFFICIAL_SCRIPTS, script)),
    );
    expect(missing).toEqual([]);
  });

  it("covers the events hooks.cursor.json declares", () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, "plugin", "hooks", "hooks.cursor.json"), "utf-8"),
    ) as { hooks: Record<string, unknown> };
    for (const event of Object.keys(config.hooks)) {
      expect(isCursorHookKey(event), `hooks.cursor.json declares "${event}"`).toBe(true);
    }
  });
});

describe("delegateHook", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "am-cursor-delegate-"));
    // A stand-in for a canonical hook: records the environment and payload it
    // was handed so the adapter's contract with it can be asserted.
    writeFileSync(
      join(dir, "session-start.mjs"),
      [
        "let input = '';",
        "for await (const chunk of process.stdin) input += chunk;",
        "process.stdout.write(JSON.stringify({",
        "  project: process.env.AGENTMEMORY_PROJECT_NAME,",
        "  payload: JSON.parse(input || '{}'),",
        "}));",
      ].join("\n"),
    );
    writeFileSync(join(dir, "stop.mjs"), "process.exit(3);");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("passes the resolved project through the environment and cwd through the payload", () => {
    const workspace = join(dir, "my-test-project");
    mkdirSync(workspace, { recursive: true });

    const chunks: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: string) => {
      chunks.push(String(c));
      return true;
    }) as typeof process.stdout.write;
    try {
      delegateHook(
        "sessionStart",
        { session_id: uniqueId("delegate"), workspace_roots: [workspace] },
        { officialDir: dir },
      );
    } finally {
      process.stdout.write = write;
    }

    const seen = JSON.parse(chunks.join("")) as {
      project: string;
      payload: { cwd: string; session_id: string };
    };
    // resolveProject() in the canonical hooks reads AGENTMEMORY_PROJECT_NAME
    // before anything else; that is the whole delegation mechanism.
    expect(seen.project).toBe("my-test-project");
    expect(basename(seen.payload.cwd)).toBe("my-test-project");
    expect(seen.payload.session_id).toBeTruthy();
  });

  it("propagates a non-zero exit from the canonical hook", () => {
    expect(delegateHook("stop", { session_id: uniqueId("exit") }, { officialDir: dir })).toBe(3);
  });

  it("reports a hook that cannot be launched instead of returning success", () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    let status: number;
    try {
      status = delegateHook(
        "preToolUse", // pre-tool-use.mjs does not exist in the temp dir
        { session_id: uniqueId("missing") },
        { officialDir: join(dir, "does-not-exist") },
      );
    } finally {
      console.error = original;
    }
    // Fail open -- a memory hook must never block the editor -- but say so,
    // rather than reporting the silent loss as success. The message has to be
    // actionable: this is what a source checkout that never ran the build
    // hits, and a Node module-not-found stack would not explain it.
    expect(status).toBe(0);
    expect(errors.join("\n")).toMatch(/canonical hook not found/);
    expect(errors.join("\n")).toMatch(/npm run build/);
  });
});

describe("built shims against a local server", () => {
  let server: Awaited<ReturnType<typeof startCaptureServer>>;

  beforeAll(async () => {
    server = await startCaptureServer();
  });
  afterAll(() => server.close());

  const hookEnv = (): Record<string, string> => ({
    AGENTMEMORY_URL: server.url,
    AGENTMEMORY_SECRET: "test-secret",
  });

  it("run-hook delivers sessionStart with the resolved project", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "am-cursor-ws-"));
    const sessionId = uniqueId("shim-start");

    const { code } = await runShim(
      "run-hook.mjs",
      ["sessionStart"],
      { session_id: sessionId, workspace_roots: [workspace.replace(/\\/g, "/")] },
      hookEnv(),
    );
    expect(code).toBe(0);

    const hit = await waitForCapture(server.captures, (c) =>
      c.url.includes("/agentmemory/session/start"),
    );
    expect(hit, "no session/start request reached the server").not.toBeNull();
    const body = hit!.body as { sessionId: string; project: string; cwd: string };
    expect(body.sessionId).toBe(sessionId);
    expect(body.project).toBe(basename(workspace));
    rmSync(workspace, { recursive: true, force: true });
  }, 30000);

  it("run-detached completes the work in its background worker", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "am-cursor-ws-"));
    const sessionId = uniqueId("shim-stop");
    const before = server.captures.length;

    // The parent's exit says only that the worker was spawned. What matters
    // is that the detached worker -- which outlives a closing Cursor window --
    // actually reaches the daemon.
    const { code } = await runShim(
      "run-detached.mjs",
      ["stop"],
      { session_id: sessionId, workspace_roots: [workspace.replace(/\\/g, "/")] },
      hookEnv(),
    );
    expect(code).toBe(0);

    const hit = await waitForCapture(
      server.captures,
      (c, ) =>
        server.captures.indexOf(c) >= before &&
        typeof c.body === "object" &&
        c.body !== null &&
        (c.body as { sessionId?: string }).sessionId === sessionId,
      30000,
    );
    expect(hit, "detached worker never reached the server").not.toBeNull();
    rmSync(workspace, { recursive: true, force: true });
  }, 45000);
});
