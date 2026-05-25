#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HOOKS = new Set([
  "session-start",
  "prompt-submit",
  "pre-tool-use",
  "post-tool-use",
  "post-tool-failure",
  "pre-compact",
  "subagent-start",
  "subagent-stop",
  "notification",
  "task-completed",
  "stop",
  "session-end",
  "post-commit",
]);

async function main(): Promise<void> {
  const hookName = process.argv[2];
  if (!hookName || !HOOKS.has(hookName)) {
    process.stderr.write(
      `Usage: agentmemory-hook <hook-name>\nKnown hooks: ${Array.from(HOOKS).join(", ")}\n`,
    );
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const hookPath = join(here, "hooks", `${hookName}.mjs`);
  await import(pathToFileURL(hookPath).href);
}

void main();
