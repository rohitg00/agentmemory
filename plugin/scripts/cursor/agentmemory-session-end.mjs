#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveWorkspace } from './agentmemory-lib.mjs';

// Runs in two modes:
//   parent  -> reads stdin, spawns a DETACHED background worker, exits immediately
//              so Cursor never waits on this hook when closing / switching workspace.
//   worker  -> performs the (possibly slow, remote) memory calls, then force-exits.
//              A hard watchdog guarantees the process always terminates -> no leftover node.
const IS_WORKER = process.env.AM_HOOK_WORKER === '1';

const config = {};
const envPath = join(homedir(), '.agentmemory', '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        config[key] = val;
      }
    }
  }
}

const REST_URL = process.env.AGENTMEMORY_URL || config.AGENTMEMORY_URL || 'http://localhost:3111';
const SECRET = process.env.AGENTMEMORY_SECRET || config.AGENTMEMORY_SECRET || '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (SECRET) h['Authorization'] = `Bearer ${SECRET}`;
  return h;
}

// ---- worker mode: do the actual (slow) work, then guarantee self-termination ----
async function runWorker() {
  // Absolute backstop: even if a request wedges past its own AbortSignal, the
  // worker is force-killed. Slightly above the sum of per-request timeouts below.
  const HARD_LIMIT_MS = 250000;
  const watchdog = setTimeout(() => process.exit(0), HARD_LIMIT_MS);

  try {
    let data;
    try {
      data = JSON.parse(process.env.AM_HOOK_INPUT || '{}');
    } catch {
      data = {};
    }
    const sessionId = data.session_id || 'unknown';
    const { project } = resolveWorkspace(data);

    try {
      await fetch(`${REST_URL}/agentmemory/session/end`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, project }),
        signal: AbortSignal.timeout(30000)
      });
    } catch {}

    if (process.env.CONSOLIDATION_ENABLED === 'true' || config.CONSOLIDATION_ENABLED === 'true') {
      try {
        await fetch(`${REST_URL}/agentmemory/crystals/auto`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ olderThanDays: 0, project }),
          signal: AbortSignal.timeout(60000)
        });
      } catch {}
      try {
        await fetch(`${REST_URL}/agentmemory/consolidate-pipeline`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ tier: 'all', force: true, project }),
          signal: AbortSignal.timeout(120000)
        });
      } catch {}
    }

    if (process.env.CLAUDE_MEMORY_BRIDGE === 'true' || config.CLAUDE_MEMORY_BRIDGE === 'true') {
      try {
        await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
          method: 'POST',
          headers: authHeaders(),
          signal: AbortSignal.timeout(30000)
        });
      } catch {}
    }
  } finally {
    clearTimeout(watchdog);
    // Force exit so undici's keep-alive socket pool cannot keep the process alive.
    process.exit(0);
  }
}

// ---- parent mode: capture stdin, hand off to detached worker, exit fast ----
function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    let input = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { process.stdin.destroy(); } catch {}
      resolve(input);
    };
    const t = setTimeout(finish, timeoutMs);
    if (t.unref) t.unref();
    process.stdin.on('data', (c) => { input += c; });
    process.stdin.on('end', () => { clearTimeout(t); finish(); });
    process.stdin.on('error', () => { clearTimeout(t); finish(); });
  });
}

async function runParent() {
  const input = await readStdin(1500);

  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, AM_HOOK_WORKER: '1', AM_HOOK_INPUT: input }
  });
  child.unref();

  const bail = setTimeout(() => process.exit(0), 2000);
  if (bail.unref) bail.unref();
  child.on('spawn', () => process.exit(0));
  child.on('error', () => process.exit(0));
}

if (IS_WORKER) {
  runWorker();
} else {
  runParent();
}
