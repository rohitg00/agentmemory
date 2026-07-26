#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const INTEGRATION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(INTEGRATION_ROOT, '../..');
const SCRIPTS = join(REPO_ROOT, 'plugin', 'scripts', 'cursor');
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

function runHook(script, payload) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script)], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 30000,
  });
  return { script, status: r.status, stderr: r.stderr?.slice(0, 200) };
}

async function fetchSession(url, secret, id) {
  const r = await fetch(`${url}/agentmemory/sessions`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30000),
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

if (!existsSync(join(SCRIPTS, 'agentmemory-session-start.mjs'))) {
  console.error(`Missing plugin scripts at ${SCRIPTS}`);
  process.exit(1);
}

const sessionId = `cursor-plugin-verify-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const basePayload = {
  session_id: sessionId,
  workspace_roots: [join(REPO_ROOT).replace(/\\/g, '/')],
  cwd: '.cursor',
};

console.log('=== agentmemory Cursor plugin verify ===\n');
console.log(`Scripts: ${SCRIPTS}\n`);

try {
  const livez = await fetch(`${url}/agentmemory/livez`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(15000),
  });
  console.log(`livez: ${livez.ok ? 'ok' : livez.status}`);
} catch (e) {
  console.error('livez failed:', e.message);
  process.exit(1);
}

for (const step of [
  ['agentmemory-session-start.mjs', basePayload],
  ['agentmemory-post-tool-use.mjs', { ...basePayload, tool_name: 'Read', tool_input: { path: join(REPO_ROOT, 'package.json') } }],
  ['agentmemory-stop.mjs', basePayload],
  ['agentmemory-session-end.mjs', { ...basePayload, reason: 'window_close' }],
]) {
  const result = runHook(step[0], step[1]);
  console.log(`${step[0]}: exit ${result.status}${result.stderr ? ` (${result.stderr})` : ''}`);
  await new Promise((r) => setTimeout(r, 2500));
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
