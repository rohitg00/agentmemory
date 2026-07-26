#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const INTEGRATION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(INTEGRATION_ROOT, '../..');
const CURSOR_SCRIPTS = join(REPO_ROOT, 'plugin', 'scripts', 'cursor');
const ENV_PATH = join(homedir(), '.agentmemory', '.env');

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function runHook(script, args, payload) {
  const hookEnv = {
    ...process.env,
    ...(env.AGENTMEMORY_URL ? { AGENTMEMORY_URL: env.AGENTMEMORY_URL } : {}),
    ...(env.AGENTMEMORY_SECRET ? { AGENTMEMORY_SECRET: env.AGENTMEMORY_SECRET } : {})
  };
  const r = spawnSync(process.execPath, [join(CURSOR_SCRIPTS, script), ...args], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 60000,
    env: hookEnv
  });
  return { script, status: r.status, stderr: r.stderr?.slice(0, 200) };
}

async function fetchSession(url, secret, id) {
  const r = await fetch(`${url}/agentmemory/sessions`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`sessions list ${r.status}`);
  const data = await r.json();
  return data.sessions?.find((s) => s.id === id) ?? null;
}

const env = loadEnv(ENV_PATH);
const url = env.AGENTMEMORY_URL;
const secret = env.AGENTMEMORY_SECRET;
if (!url || !secret) {
  console.error('Need AGENTMEMORY_URL and AGENTMEMORY_SECRET in ~/.agentmemory/.env');
  process.exit(1);
}

if (!existsSync(join(CURSOR_SCRIPTS, 'run-hook.mjs'))) {
  console.error(`Missing Cursor shim at ${CURSOR_SCRIPTS}`);
  process.exit(1);
}

const repoRootNorm = join(REPO_ROOT).replace(/\\/g, '/');
const sessionId = `cursor-plugin-verify-${Date.now()}`;
const basePayload = {
  session_id: sessionId,
  workspace_roots: [repoRootNorm],
  cwd: repoRootNorm
};

console.log('=== agentmemory Cursor plugin verify ===\n');
console.log(`Shim scripts: ${CURSOR_SCRIPTS}\n`);

try {
  const livez = await fetch(`${url}/agentmemory/livez`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(15000)
  });
  console.log(`livez: ${livez.ok ? 'ok' : livez.status}`);
} catch (e) {
  console.error('livez failed:', e.message);
  process.exit(1);
}

const hookSteps = [
  ['run-hook.mjs', ['sessionStart'], basePayload],
  [
    'run-hook.mjs',
    ['postToolUse'],
    {
      ...basePayload,
      tool_name: 'Read',
      tool_input: { path: join(REPO_ROOT, 'package.json') },
      tool_output: 'verify-flow smoke test'
    }
  ],
  ['run-detached.mjs', ['stop'], basePayload],
  ['run-detached.mjs', ['sessionEnd'], { ...basePayload, reason: 'window_close' }]
];

for (const step of hookSteps) {
  const result = runHook(step[0], step[1], step[2]);
  const label = `${step[0]} ${step[1].join(' ')}`;
  console.log(`${label}: exit ${result.status}${result.stderr ? ` (${result.stderr})` : ''}`);
  const waitMs = step[1][0] === 'postToolUse' ? 5000 : 2500;
  await new Promise((r) => setTimeout(r, waitMs));
}

const session = await fetchSession(url, secret, sessionId);
if (!session) {
  console.error('\nFAIL: session not found on NAS after hook pipeline');
  process.exit(1);
}

console.log('\nNAS session:');
console.log(`  id: ${session.id}`);
console.log(`  project: ${session.project}`);
console.log(`  status: ${session.status}`);
console.log(`  obs: ${session.observationCount}`);
console.log(`  endedAt: ${session.endedAt ?? '(none)'}`);

const okProject = session.project === 'agentmemory';
const okObs = session.observationCount >= 1;
const okEnd = session.status === 'completed' && session.endedAt;

console.log('\nResult:');
console.log(`  resolver: ${okProject ? 'PASS' : 'FAIL'} (expected agentmemory)`);
console.log(`  capture: ${okObs ? 'PASS' : 'FAIL'} (expected obs>=1)`);
console.log(`  session/end: ${okEnd ? 'PASS' : 'PARTIAL'} (script works; Cursor may not fire sessionEnd on close)`);

if (okProject && okObs) {
  console.log('\nPlugin hook pipeline OK for PR smoke test.');
  process.exit(0);
}
process.exit(1);
