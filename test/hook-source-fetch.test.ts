import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const preload = new URL("./fixtures/hook-source-fetch.mjs", import.meta.url).href;

describe("source-hook fetch observer", () => {
  it.each([
    { name: "an unexpected GET without a body", init: undefined, method: "GET", body: null },
    { name: "an unexpected non-JSON POST", init: { method: "POST", body: "not-json" }, method: "POST", body: "not-json" },
  ])("records $name so a no-fetch assertion cannot miss it", ({ init, method, body }) => {
    const dir = mkdtempSync(join(tmpdir(), "am-hook-fetch-"));
    const requests = join(dir, "requests.jsonl");
    const url = "http://127.0.0.1:3111/unexpected";
    const program = `await fetch(${JSON.stringify(url)}, ${JSON.stringify(init)}).catch(() => {});`;
    try {
      execFileSync(process.execPath, ["--import", preload, "--input-type=module", "-e", program], {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          PATH: process.env["PATH"],
          SystemRoot: process.env["SystemRoot"],
          HOME: dir,
          USERPROFILE: dir,
          AGENTMEMORY_HOOK_TEST_FETCH: "success",
          AGENTMEMORY_HOOK_TEST_REQUESTS: requests,
        },
        timeout: 5000,
        stdio: "pipe",
      });
      const observed: unknown[] = existsSync(requests)
        ? readFileSync(requests, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
        : [];
      expect(observed).toEqual([{ url, method, headers: {}, body }]);
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
