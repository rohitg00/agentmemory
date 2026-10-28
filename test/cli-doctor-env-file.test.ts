import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "doctor-env-file-"));
  mkdirSync(join(home, ".agentmemory"));
  writeFileSync(join(home, ".agentmemory", ".env"), "# no provider key here\n");
  writeFileSync(join(home, "custom.env"), "ANTHROPIC_API_KEY=sk-ant-real-key-value\n");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function doctorDryRun(extraEnv: Record<string, string>): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("dist/cli.mjs"), "doctor", "--dry-run"], {
      env: {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        TMPDIR: home,
        AGENTMEMORY_URL: "http://127.0.0.1:1",
        NO_COLOR: "1",
        CI: "1",
        ...extraEnv,
      },
      timeout: 30000,
    });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    child.on("error", reject);
    child.on("close", () => done(output));
  });
}

it("reads provider keys from AGENTMEMORY_ENV_FILE, the file the daemon loads", async () => {
  rmSync(join(home, ".agentmemory", ".env"));
  const output = await doctorDryRun({ AGENTMEMORY_ENV_FILE: join(home, "custom.env") });
  expect(output).toContain("Dry-run complete");
  expect(output).not.toContain("[env-missing]");
  expect(output).not.toContain("[no-llm-provider-key]");
});

it("reports no provider key when only the default env file is read", async () => {
  const output = await doctorDryRun({});
  expect(output).toContain("Dry-run complete");
  expect(output).toContain("[no-llm-provider-key]");
});
