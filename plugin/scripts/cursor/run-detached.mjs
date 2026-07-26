#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readHookStdinComplete, readWorkerHookPayload, writeHookPayloadTemp } from './workspace.mjs';
import { delegateHook } from './run-hook.mjs';

const IS_WORKER = process.env.AM_HOOK_WORKER === '1';
const hookKey = process.argv[2];

async function runWorker() {
  const hardLimitMs = hookKey === 'sessionEnd' ? 250000 : 130000;
  const watchdog = setTimeout(() => process.exit(0), hardLimitMs);

  try {
    const data = readWorkerHookPayload();
    if (!data || !hookKey) return;
    delegateHook(hookKey, data);
  } finally {
    clearTimeout(watchdog);
    process.exit(0);
  }
}

async function runParent() {
  if (!hookKey) process.exit(0);

  const input = await readHookStdinComplete();
  const payloadFile = writeHookPayloadTemp(input);

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), hookKey], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      AM_HOOK_WORKER: '1',
      AM_HOOK_INPUT_FILE: payloadFile
    }
  });
  child.unref();

  const bail = setTimeout(() => process.exit(0), 2000);
  if (bail.unref) bail.unref();
  child.on('spawn', () => process.exit(0));
  child.on('error', (err) => {
    console.error('[agentmemory] failed to spawn detached hook worker:', err.message);
    try {
      unlinkSync(payloadFile);
    } catch {}
    process.exit(0);
  });
}

if (IS_WORKER) {
  runWorker();
} else {
  runParent();
}
