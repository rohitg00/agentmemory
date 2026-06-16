#!/usr/bin/env node
/**
 * Cross-runtime hook script launcher.
 *
 * Detects whether the current runtime is Bun or Node and spawns the target
 * hook script with the appropriate runtime.  This lets hook.json configs
 * use a single static "command" entry while respecting whichever runtime
 * the user has installed.
 *
 * Usage (from hooks.json):
 *   "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hook-runner.mjs\" \"${CLAUDE_PLUGIN_ROOT}/scripts/session-start.mjs\""
 *
 * The first argument is the hook script to run.  All subsequent arguments
 * are forwarded to the hook script.
 */
import { spawn } from "node:child_process";
import process from "node:process";

const IS_BUN = typeof process.versions.bun === "string";
const runtime = IS_BUN ? "bun" : "node";
const hookScript = process.argv[2];

if (!hookScript) {
  process.stderr.write("hook-runner: missing script argument\n");
  process.exit(1);
}

// Forward remaining arguments (hook engine passes stdin JSON)
const childArgs = [hookScript, ...process.argv.slice(3)];

const child = spawn(runtime, childArgs, {
  stdio: "inherit",
  shell: IS_BUN && process.platform === "win32",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  process.stderr.write(`hook-runner: failed to spawn ${runtime}: ${err.message}\n`);
  process.exit(1);
});
