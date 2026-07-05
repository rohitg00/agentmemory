import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";

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

async function runHookWithServer(
  scriptName: string,
  stdin: string,
  env: Record<string, string>,
): Promise<{
  stdout: string;
  exitCode: number | null;
  requests: Array<{ path: string; body: Record<string, unknown> }>;
}> {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      requests.push({
        path: req.url ?? "",
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ context: "remembered context" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("test server did not bind to a TCP port");
  }

  try {
    const result = await runHook(scriptName, stdin, {
      ...env,
      AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`,
    });
    return { stdout: result.stdout, exitCode: result.exitCode, requests };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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

  it("enriches Codex apply_patch events by parsing patch file headers", async () => {
    const payload = JSON.stringify({
      session_id: "ses_codex",
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: src/hooks/pre-tool-use.ts",
          "@@",
          "-old",
          "+new",
          "*** Add File: test/codex-hook.test.ts",
          "+it('works', () => {})",
          "*** End Patch",
        ].join("\n"),
      },
      project: "agentmemory",
    });

    const result = await runHookWithServer("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("remembered context");
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      path: "/agentmemory/enrich",
      body: {
        sessionId: "ses_codex",
        files: ["src/hooks/pre-tool-use.ts", "test/codex-hook.test.ts"],
        terms: [],
        toolName: "edit",
        project: "agentmemory",
      },
    });
  });

  it("ignores Codex apply_patch events without concrete patch file headers", async () => {
    const payload = JSON.stringify({
      session_id: "ses_codex",
      tool_name: "apply_patch",
      tool_input: { patch: "*** Begin Patch\n*** End Patch" },
    });

    const result = await runHook("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
      AGENTMEMORY_URL: "http://127.0.0.1:1",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("enriches conservative Codex exec_command grep events", async () => {
    const payload = JSON.stringify({
      session_id: "ses_codex",
      tool_name: "exec_command",
      tool_input: { cmd: "rg pre-tool-use src test" },
    });

    const result = await runHookWithServer("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
    });

    expect(result.stdout).toBe("remembered context");
    expect(result.requests[0]).toMatchObject({
      path: "/agentmemory/enrich",
      body: {
        sessionId: "ses_codex",
        files: ["src", "test"],
        terms: ["pre-tool-use"],
        toolName: "grep",
      },
    });
  });

  it("does not parse compound Codex shell commands", async () => {
    const payload = JSON.stringify({
      session_id: "ses_codex",
      tool_name: "exec_command",
      tool_input: { cmd: "sed -n '1,40p' src/hooks/pre-tool-use.ts | cat" },
    });

    const result = await runHookWithServer("pre-tool-use.mjs", payload, {
      AGENTMEMORY_INJECT_CONTEXT: "true",
    });

    expect(result.stdout).toBe("");
    expect(result.requests).toHaveLength(0);
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
