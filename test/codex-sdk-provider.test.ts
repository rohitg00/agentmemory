import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CodexSDKProvider } from "../src/providers/codex-sdk.js";

let tempDirs: string[] = [];

function makeFakeCodex(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "agentmemory-codex-"));
  tempDirs.push(dir);
  const file = join(dir, "codex");
  writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(file, 0o755);
  return file;
}

describe("CodexSDKProvider", () => {
  afterEach(() => {
    delete process.env.AGENTMEMORY_SDK_CHILD;
    delete process.env.AGENTMEMORY_CODEX_SDK_CHILD;
    delete process.env.OPENAI_API_KEY;
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("invokes codex exec through stdin with hardened flags and recursion guards", async () => {
    const command = makeFakeCodex(`
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const argv = process.argv.slice(2);
  const required = ["exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--config", "shell_environment_policy.inherit=\\"none\\"", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", "-"];
  for (const flag of required) {
    if (!argv.includes(flag)) {
      console.error("missing expected codex exec flag: " + flag + " in " + argv.join(" "));
      process.exit(8);
    }
  }
  if (process.env.AGENTMEMORY_SDK_CHILD !== "1" || process.env.AGENTMEMORY_CODEX_SDK_CHILD !== "1") {
    console.error("missing recursion guard");
    process.exit(7);
  }
  if (process.env.OPENAI_API_KEY) {
    console.error("secret env leaked");
    process.exit(9);
  }
  console.log(input.includes("<system>\\nsystem text\\n</system>") && input.includes("<user>\\nuser text\\n</user>") ? "ok" : "bad prompt");
});
`);
    process.env.OPENAI_API_KEY = "sk-test-secret";

    const provider = new CodexSDKProvider("codex-default", 128, command, 2_000);

    await expect(provider.compress("system text", "user text")).resolves.toBe("ok");
  });

  it("short-circuits when already running inside an agentmemory SDK child", async () => {
    process.env.AGENTMEMORY_CODEX_SDK_CHILD = "1";
    const provider = new CodexSDKProvider(
      "codex-default",
      128,
      "/definitely/not/codex",
      100,
    );

    await expect(provider.summarize("system", "user")).resolves.toBe("");
  });

  it("surfaces bounded codex exec failures", async () => {
    const command = makeFakeCodex(`
process.stdin.resume();
process.stdin.on("end", () => {
  console.error("boom");
  process.exit(4);
});
`);
    const provider = new CodexSDKProvider("codex-default", 128, command, 2_000);

    await expect(provider.compress("system", "user")).rejects.toThrow(
      /Codex CLI exited with code 4: boom/,
    );
  });
});
