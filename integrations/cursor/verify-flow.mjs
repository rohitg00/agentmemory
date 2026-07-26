#!/usr/bin/env node
/**
 * End-to-end smoke test for the Cursor plugin hook pipeline against a live
 * agentmemory daemon.
 *
 * Every assertion polls the daemon rather than sleeping for a fixed time.
 * The hook processes are deliberately not synchronous with the work they
 * cause: the canonical hooks fire-and-forget their HTTP calls and exit on a
 * short timer, and run-detached.mjs returns as soon as its background worker
 * is spawned. A fixed sleep therefore proves nothing -- too short and a
 * healthy pipeline reports FAIL, too long and a broken one still has time to
 * look healthy. Polling for the state change is the only honest check.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireConnection } from './_env.mjs';

const INTEGRATION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(INTEGRATION_ROOT, '../..');
const CURSOR_SCRIPTS = join(REPO_ROOT, 'plugin', 'scripts', 'cursor');

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 90000;

const { url, secret } = requireConnection();
const authHeaders = { Authorization: `Bearer ${secret}` };

function runHook(script, args, payload) {
  const r = spawnSync(process.execPath, [join(CURSOR_SCRIPTS, script), ...args], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 60000,
    env: { ...process.env, AGENTMEMORY_URL: url, AGENTMEMORY_SECRET: secret }
  });
  return { status: r.status, stderr: r.stderr?.trim().slice(0, 300) ?? '' };
}

async function fetchSession(id) {
  const r = await fetch(`${url}/agentmemory/sessions`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(30000)
  });
  if (!r.ok) throw new Error(`GET /agentmemory/sessions -> ${r.status}`);
  const data = await r.json();
  return data.sessions?.find((s) => s.id === id) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until `predicate(session)` holds. Returns the last session seen. */
async function waitFor(id, predicate, timeoutMs = POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await fetchSession(id);
    if (last && predicate(last)) return { session: last, ok: true, waitedMs: 0 };
    if (Date.now() >= deadline) return { session: last, ok: false };
    await sleep(POLL_INTERVAL_MS);
  }
}

if (!existsSync(join(CURSOR_SCRIPTS, 'run-hook.mjs'))) {
  console.error(`Missing Cursor shim at ${CURSOR_SCRIPTS}. Run \`npm run build\` first.`);
  process.exit(1);
}

const repoRootNorm = REPO_ROOT.replace(/\\/g, '/');
const sessionId = `cursor-plugin-verify-${Date.now()}`;
const basePayload = {
  session_id: sessionId,
  workspace_roots: [repoRootNorm],
  cwd: repoRootNorm
};

console.log('=== agentmemory Cursor plugin verify ===\n');
console.log(`Shim scripts: ${CURSOR_SCRIPTS}`);
console.log(`Session id:   ${sessionId}\n`);

// A non-2xx /livez means the daemon is up but rejecting us (usually a bad
// secret). Continuing past it turns one clear error into four confusing ones.
let livez;
try {
  livez = await fetch(`${url}/agentmemory/livez`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15000)
  });
} catch (e) {
  console.error(`livez: unreachable (${e.message})`);
  process.exit(1);
}
if (!livez.ok) {
  console.error(`livez: HTTP ${livez.status} -- check AGENTMEMORY_URL / AGENTMEMORY_SECRET`);
  process.exit(1);
}
console.log('livez: ok');

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

// 1. sessionStart: the session must show up on the daemon at all.
console.log('\n[1/4] sessionStart');
let r = runHook('run-hook.mjs', ['sessionStart'], basePayload);
console.log(`  shim exit ${r.status}${r.stderr ? ` (${r.stderr})` : ''}`);
let w = await waitFor(sessionId, (s) => Boolean(s));
record('session registered', w.ok, w.session ? `project=${w.session.project}` : 'never appeared');
record(
  'resolver picked the repo, not .cursor',
  w.session?.project === 'agentmemory',
  `got ${w.session?.project ?? '(none)'}`
);

// 2. postToolUse: an observation must land against that session.
//
//    Retried, because the daemon drops observations when it is busy -- a
//    `stop` from an earlier run leaves /summarize working in the background,
//    and observations posted into that window can vanish. The adapter's job
//    ends at "emitted a correct POST" (test/cursor-adapter.test.ts asserts
//    that deterministically against a local server); this step additionally
//    checks the daemon actually recorded it, so it has to tolerate the
//    daemon's own load. Each attempt varies tool_input: the dedup key is
//    (sessionId, tool_name, tool_input), so a byte-identical retry would be
//    discarded as a duplicate and could never succeed.
console.log('\n[2/4] postToolUse');
// Measured against a Tailscale-reachable daemon: roughly 15% of observations
// are dropped, in bursts rather than independently -- three in a row is
// normal, then thirty in a row land. The same rate applies when the canonical
// hook is invoked directly, without this adapter, so it is a property of the
// fire-and-forget hook contract plus a busy daemon, not of the Cursor path.
// Retries therefore have to be spaced, not just repeated.
const OBSERVE_ATTEMPTS = 4;
for (let attempt = 1; attempt <= OBSERVE_ATTEMPTS; attempt++) {
  if (attempt > 1) await sleep(attempt * 2000);
  r = runHook('run-hook.mjs', ['postToolUse'], {
    ...basePayload,
    tool_name: 'Read',
    tool_input: { path: join(REPO_ROOT, 'package.json'), attempt },
    tool_output: `verify-flow smoke test (attempt ${attempt})`
  });
  console.log(`  attempt ${attempt}: shim exit ${r.status}${r.stderr ? ` (${r.stderr})` : ''}`);
  if (r.status !== 0) break;
  w = await waitFor(sessionId, (s) => (s.observationCount ?? 0) >= 1, 20000);
  if (w.ok) break;
  if (attempt < OBSERVE_ATTEMPTS) console.log('    not recorded yet -- daemon may be busy, retrying');
}
record(
  'observation captured',
  Boolean(w.ok),
  w.ok ? `obs=${w.session?.observationCount ?? 0}` : `daemon never recorded it in ${OBSERVE_ATTEMPTS} attempts`
);

// 3. stop: run-detached returns immediately, so the only meaningful signal is
//    the session reaching a terminal state on the daemon afterwards.
console.log('\n[3/4] stop (detached)');
r = runHook('run-detached.mjs', ['stop'], basePayload);
console.log(`  parent exit ${r.status}${r.stderr ? ` (${r.stderr})` : ''} (worker continues in background)`);
w = await waitFor(sessionId, (s) => s.status === 'completed' || Boolean(s.endedAt));
record(
  'detached worker closed the session',
  w.ok,
  `status=${w.session?.status ?? '?'} endedAt=${w.session?.endedAt ?? '(none)'}`
);

// 4. sessionEnd is opt-in and diagnostic only, for two reasons. Cursor 3.13.x
//    frequently fails to fire it on window close ("MainThreadShellExec not
//    initialized"), so `stop` is the hook the pipeline actually relies on --
//    gating on it would report a Cursor bug as an adapter bug. And it fans out
//    to /crystals/auto plus /consolidate-pipeline on the daemon, which is
//    heavy enough that back-to-back smoke runs start losing observations to
//    the resulting load. Running it by default makes this script flaky
//    against itself.
if (process.argv.includes('--with-session-end')) {
  console.log('\n[4/4] sessionEnd (diagnostic only)');
  r = runHook('run-detached.mjs', ['sessionEnd'], { ...basePayload, reason: 'window_close' });
  console.log(`  parent exit ${r.status}${r.stderr ? ` (${r.stderr})` : ''}`);
  const final = await fetchSession(sessionId);
  console.log(`  session: status=${final?.status ?? '?'} obs=${final?.observationCount ?? 0}`);
  console.log('  (not a pass condition -- Cursor may never fire this on window close)');
} else {
  console.log('\n[4/4] sessionEnd  skipped (pass --with-session-end to exercise it)');
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.error(`FAILED: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
console.log('Cursor hook pipeline OK.');
