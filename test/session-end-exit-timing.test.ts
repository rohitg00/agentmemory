import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { once } from "node:events";

// Runs the BUILT hook artifact (what ships), not the TypeScript source. CI
// builds before testing; locally run `npm run build` after editing
// src/hooks/session-end.ts or this exercises stale code.
const HOOK = join(
  import.meta.dirname,
  "..",
  "plugin",
  "scripts",
  "session-end.mjs",
);

// A server that accepts the connection and reads the request but never sends a
// response, so the hook's fire-and-forget `fetch` stays in flight. With the
// request hanging, the only thing that ends the hook process is its deferred
// `setTimeout(() => process.exit(0), N).unref()` — which lets us measure N.
let blackHole: Server;
let blackHoleUrl: string;

beforeAll(async () => {
  blackHole = createServer(() => {
    // Intentionally never respond.
  });
  blackHole.listen(0, "127.0.0.1");
  await once(blackHole, "listening");
  const address = blackHole.address();
  const port = typeof address === "object" && address ? address.port : 0;
  blackHoleUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  blackHole.close();
  await once(blackHole, "close");
});

function runHook(
  stdin: string,
  env: Record<string, string>,
): Promise<{ exitCode: number | null; tookMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(process.execPath, [HOOK], {
      env: { PATH: process.env["PATH"] ?? "", ...env },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, tookMs: Date.now() - start });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

describe("session-end hook exits within Claude Code's shutdown grace (#991)", () => {
  it("exits well under the old 1500ms cap even when the memory server hangs", async () => {
    const payload = JSON.stringify({ session_id: "ses_timing_test" });
    const { exitCode, tookMs } = await runHook(payload, {
      AGENTMEMORY_URL: blackHoleUrl,
    });

    expect(exitCode).toBe(0);
    // Positive control: the hung request must actually hold the process open to
    // the deferred-exit timer, otherwise the timing assertion is meaningless.
    expect(tookMs).toBeGreaterThan(250);
    // The deferred-exit timer must fire comfortably inside Claude Code's
    // SessionEnd shutdown grace. The bound sits between the fixed 500ms timer
    // (plus startup) and the old 1500ms cap that overran the grace, so the
    // harness killed the hook and reported "Hook cancelled" (#991).
    expect(tookMs).toBeLessThan(1400);
  });
});
