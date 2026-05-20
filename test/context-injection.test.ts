import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");

// Spawns a compiled plugin hook as a subprocess, feeds it JSON on stdin,
// and returns { stdout, stderr, exitCode, tookMs }. The test is about
// making sure the hook writes NOTHING to stdout when context injection is
// disabled — which is what Claude Code reads to decide whether to prepend
// memory context to the next tool turn.
function runHook(
  scriptName: string,
  stdin: string,
  env: Record<string, string>,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  tookMs: number;
}> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(
      process.execPath,
      [join(HOOKS_DIR, scriptName)],
      {
        env: {
          // Start from a clean slate — don't leak test-runner env into
          // the hook. Only pass PATH and anything explicitly set by the
          // test case.
          PATH: process.env["PATH"] ?? "",
          ...env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode, tookMs: Date.now() - start });
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function makeAgentmemoryHome(envContent: string): string {
  const home = mkdtempSync(join(tmpdir(), "agentmemory-hook-"));
  mkdirSync(join(home, ".agentmemory"), { recursive: true });
  writeFileSync(join(home, ".agentmemory", ".env"), envContent);
  return home;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("pre-tool-use hook — context injection gate (#143)", () => {
  it("writes nothing to stdout when AGENTMEMORY_INJECT_CONTEXT is unset (default)", async () => {
    const payload = JSON.stringify({
      session_id: "ses_test",
      tool_name: "Read",
      tool_input: { file_path: "src/foo.ts" },
    });
    // No AGENTMEMORY_* env vars at all — simulates a fresh Claude Pro
    // install with no ~/.agentmemory/.env overrides.
    const result = await runHook("pre-tool-use.mjs", payload, {});
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("writes nothing to stdout when AGENTMEMORY_INJECT_CONTEXT=false explicitly", async () => {
    const payload = JSON.stringify({
      session_id: "ses_test",
      tool_name: "Edit",
      tool_input: { file_path: "src/foo.ts", old_string: "a", new_string: "b" },
    });
    const result = await runHook("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "false",
    });
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("exits fast when disabled (no stdin consumption, no network fetch)", async () => {
    // The disabled path must not open stdin or reach for fetch — it
    // should return immediately. A 250ms budget is generous enough to
    // account for Node startup on CI while still catching any accidental
    // fetch round-trip or stdin buffering.
    const result = await runHook("pre-tool-use.mjs", "", {});
    expect(result.tookMs).toBeLessThan(1000);
    expect(result.stdout).toBe("");
  });

  it("when AGENTMEMORY_INJECT_CONTEXT=true, hook still runs but safely errors on unreachable backend", async () => {
    // Opt-in path. We point at a port that's guaranteed closed so the
    // fetch fails fast; the hook must still exit cleanly (the whole
    // point of the try/catch is not to break Claude Code) and must not
    // echo anything to stdout when the fetch fails.
    const payload = JSON.stringify({
      session_id: "ses_test",
      tool_name: "Read",
      tool_input: { file_path: "src/foo.ts" },
    });
    const result = await runHook("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
      AGENTMEMORY_URL: "http://127.0.0.1:1",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("honors AGENTMEMORY_INJECT_CONTEXT and AGENTMEMORY_SECRET from ~/.agentmemory/.env", async () => {
    const home = makeAgentmemoryHome(
      "AGENTMEMORY_INJECT_CONTEXT=true\nAGENTMEMORY_SECRET=file-secret\n",
    );
    let authHeader: string | undefined;
    const server = createServer((req, res) => {
      authHeader = req.headers.authorization;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ context: "remembered context" }));
    });
    const baseUrl = await listen(server);

    try {
      const payload = JSON.stringify({
        session_id: "ses_test",
        tool_name: "Read",
        tool_input: { file_path: "src/foo.ts" },
      });
      const result = await runHook("pre-tool-use.mjs", payload, {
        HOME: home,
        USERPROFILE: home,
        AGENTMEMORY_URL: baseUrl,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("remembered context");
      expect(authHeader).toBe("Bearer file-secret");
    } finally {
      await closeServer(server);
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("session-start hook — context injection gate (#143)", () => {
  it("registers the session but writes nothing to stdout when AGENTMEMORY_INJECT_CONTEXT is unset", async () => {
    // Session registration POST will fail against the unreachable URL,
    // but the hook's try/catch must swallow that cleanly — Claude Code
    // must never see an error at session start.
    const payload = JSON.stringify({
      session_id: "ses_test",
      cwd: "/tmp/fake-project",
    });
    const result = await runHook("session-start.mjs", payload, {
      AGENTMEMORY_URL: "http://127.0.0.1:1",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("prompt-submit hook — auth env fallback (#518)", () => {
  it("adds Bearer auth from ~/.agentmemory/.env when the shell env omits AGENTMEMORY_SECRET", async () => {
    const home = makeAgentmemoryHome("AGENTMEMORY_SECRET=file-secret\n");
    let authHeader: string | undefined;
    const server = createServer((req, res) => {
      authHeader = req.headers.authorization;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ observationId: "obs_test" }));
    });
    const baseUrl = await listen(server);

    try {
      const payload = JSON.stringify({
        session_id: "ses_test",
        cwd: "/tmp/fake-project",
        prompt: "capture this",
      });
      const result = await runHook("prompt-submit.mjs", payload, {
        HOME: home,
        USERPROFILE: home,
        AGENTMEMORY_URL: baseUrl,
      });

      expect(result.exitCode).toBe(0);
      expect(authHeader).toBe("Bearer file-secret");
    } finally {
      await closeServer(server);
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("respects an explicitly empty shell AGENTMEMORY_SECRET over ~/.agentmemory/.env", async () => {
    const home = makeAgentmemoryHome("AGENTMEMORY_SECRET=file-secret\n");
    let authHeader: string | undefined;
    const server = createServer((req, res) => {
      authHeader = req.headers.authorization;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ observationId: "obs_test" }));
    });
    const baseUrl = await listen(server);

    try {
      const payload = JSON.stringify({
        session_id: "ses_test",
        cwd: "/tmp/fake-project",
        prompt: "capture this",
      });
      const result = await runHook("prompt-submit.mjs", payload, {
        HOME: home,
        USERPROFILE: home,
        AGENTMEMORY_URL: baseUrl,
        AGENTMEMORY_SECRET: "",
      });

      expect(result.exitCode).toBe(0);
      expect(authHeader).toBeUndefined();
    } finally {
      await closeServer(server);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
