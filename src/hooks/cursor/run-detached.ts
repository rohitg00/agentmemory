#!/usr/bin/env node
import { spawn } from "node:child_process";
import { unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { delegateHook, isCursorHookKey } from "./delegate.js";
import {
  readHookStdinComplete,
  readWorkerHookPayload,
  writeHookPayloadTemp,
} from "./workspace.js";

// stop/sessionEnd trigger summarize + consolidate on the daemon. Cursor
// kills its hook process tree when the window closes, so the real work runs
// in a detached worker that outlives the window; the parent only hands off
// the payload and returns control immediately.
const IS_WORKER = process.env["AM_HOOK_WORKER"] === "1";
const hookKey = process.argv[2];

function runWorker(): void {
  const hardLimitMs = hookKey === "sessionEnd" ? 250000 : 130000;
  const watchdog = setTimeout(() => process.exit(0), hardLimitMs);

  try {
    const data = readWorkerHookPayload();
    if (!data || !isCursorHookKey(hookKey)) return;
    delegateHook(hookKey, data);
  } finally {
    clearTimeout(watchdog);
    process.exit(0);
  }
}

async function runParent(): Promise<void> {
  if (!hookKey) process.exit(0);

  const input = await readHookStdinComplete();
  const payloadFile = writeHookPayloadTemp(input);

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), hookKey], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      AM_HOOK_WORKER: "1",
      AM_HOOK_INPUT_FILE: payloadFile,
    },
  });
  child.unref();

  const bail = setTimeout(() => process.exit(0), 2000);
  if (bail.unref) bail.unref();
  child.on("spawn", () => process.exit(0));
  child.on("error", (err: Error) => {
    console.error("[agentmemory] failed to spawn detached hook worker:", err.message);
    try {
      unlinkSync(payloadFile);
    } catch {}
    process.exit(0);
  });
}

if (IS_WORKER) {
  runWorker();
} else {
  void runParent();
}
