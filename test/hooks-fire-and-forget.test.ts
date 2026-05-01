import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { join } from "node:path";

const HOOKS_DIR = join(import.meta.dirname, "..", "plugin", "scripts");

// A stalling HTTP server: accepts connections, receives the request, but
// never calls res.end(). This forces fetch() to wait until its
// AbortSignal.timeout fires — exactly the slow-REST scenario the new hook
// behaviour is meant to short-circuit. Connection-refused (e.g. port 1)
// would resolve too fast to distinguish old vs. new code.
let stallServer: Server;
let stallUrl: string;

beforeAll(async () => {
  stallServer = createServer((_req, res) => {
    // Drain the request body so the client finishes sending; then never
    // end the response. The connection stays open until the client aborts.
    _req.on("data", () => {});
    _req.on("end", () => {});
    void res; // keep handle alive
  });
  await new Promise<void>((resolve) =>
    stallServer.listen(0, "127.0.0.1", () => resolve()),
  );
  const port = (stallServer.address() as AddressInfo).port;
  stallUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => stallServer.close(() => resolve()));
});

function runHook(
  scriptName: string,
  stdin: string,
  env: Record<string, string>,
): Promise<{ tookMs: number; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(process.execPath, [join(HOOKS_DIR, scriptName)], {
      env: { PATH: process.env["PATH"] ?? "", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ tookMs: Date.now() - start, exitCode });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

describe("session-start.ts + subagent-start.ts — fire-and-forget under slow REST", () => {
  const payload = JSON.stringify({
    session_id: "ses_fnf_test",
    cwd: "/tmp",
    agent_id: "test_agent",
    agent_type: "general-purpose",
  });

  it(
    "session-start with INJECT_CONTEXT unset returns from main() without awaiting REST",
    { timeout: 5000 },
    async () => {
      const { tookMs, exitCode } = await runHook(
        "session-start.mjs",
        payload,
        { AGENTMEMORY_URL: stallUrl },
      );
      expect(exitCode).toBe(0);
      // Old behaviour: await up to 5000 ms timeout. New: main() returns
      // immediately and node exits when the bg request aborts at 800 ms.
      // Allow a generous margin for cold node startup on slow CI runners.
      expect(tookMs).toBeLessThan(2000);
    },
  );

  it(
    "session-start with INJECT_CONTEXT=true honours the tightened 1500 ms ceiling",
    { timeout: 6000 },
    async () => {
      const { tookMs, exitCode } = await runHook(
        "session-start.mjs",
        payload,
        { AGENTMEMORY_URL: stallUrl, AGENTMEMORY_INJECT_CONTEXT: "true" },
      );
      expect(exitCode).toBe(0);
      // Inject path still awaits — but with the new cap, never the old
      // 5000 ms.
      expect(tookMs).toBeGreaterThan(1000);
      expect(tookMs).toBeLessThan(3500);
    },
  );

  it(
    "subagent-start does not await the observation POST",
    { timeout: 5000 },
    async () => {
      const { tookMs, exitCode } = await runHook(
        "subagent-start.mjs",
        payload,
        { AGENTMEMORY_URL: stallUrl },
      );
      expect(exitCode).toBe(0);
      // Old behaviour: await 2000 ms timeout. New: fire-and-forget; node
      // exits when the bg request aborts at 800 ms.
      expect(tookMs).toBeLessThan(2000);
    },
  );
});
