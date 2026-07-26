#!/usr/bin/env node
/**
 * Close agentmemory sessions stuck in status "active" (sessionEnd hook never ran).
 *
 * Usage:
 *   node close-stale-am-sessions.mjs --dry-run
 *   node close-stale-am-sessions.mjs --min-age-hours 24
 *   node close-stale-am-sessions.mjs --min-age-hours 6 --project 智能报表-wrenai
 *   node close-stale-am-sessions.mjs --exclude ses_abc123,def456
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function loadEnv() {
  const envPath = join(homedir(), '.agentmemory', '.env');
  const env = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: args.includes('--dry-run'),
    minAgeHours: 24,
    project: null,
    exclude: new Set()
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--min-age-hours' && args[i + 1]) {
      opts.minAgeHours = Number(args[++i]);
    } else if (args[i] === '--project' && args[i + 1]) {
      opts.project = args[++i];
    } else if (args[i] === '--exclude' && args[i + 1]) {
      for (const id of args[++i].split(',')) {
        const t = id.trim();
        if (t) opts.exclude.add(t);
      }
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  const { AGENTMEMORY_URL, AGENTMEMORY_SECRET } = loadEnv();
  if (!AGENTMEMORY_URL || !AGENTMEMORY_SECRET) {
    console.error('Missing AGENTMEMORY_URL or AGENTMEMORY_SECRET in ~/.agentmemory/.env');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${AGENTMEMORY_SECRET}`,
    'Content-Type': 'application/json'
  };

  const listRes = await fetch(`${AGENTMEMORY_URL}/agentmemory/sessions`, { headers });
  if (!listRes.ok) {
    console.error('Failed to list sessions:', listRes.status, await listRes.text());
    process.exit(1);
  }

  const { sessions } = await listRes.json();
  const cutoff = Date.now() - opts.minAgeHours * 3600000;
  const candidates = sessions.filter((s) => {
    if (s.status !== 'active') return false;
    if (opts.exclude.has(s.id)) return false;
    if (opts.project && s.project !== opts.project) return false;
    const started = Date.parse(s.startedAt);
    if (!Number.isFinite(started) || started > cutoff) return false;
    return true;
  });

  candidates.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  console.log(
    `Found ${candidates.length} active session(s) older than ${opts.minAgeHours}h` +
      (opts.project ? ` (project=${opts.project})` : '')
  );

  for (const s of candidates) {
    const ageH = ((Date.now() - Date.parse(s.startedAt)) / 3600000).toFixed(1);
    console.log(
      `  ${s.id.slice(0, 12)}… ${s.project} obs=${s.observationCount ?? 0} age=${ageH}h`
    );
  }

  if (!candidates.length) {
    console.log('Nothing to close.');
    return;
  }

  if (opts.dryRun) {
    console.log(`Dry run: would close ${candidates.length} session(s) via POST /agentmemory/session/end`);
    return;
  }

  let closed = 0;
  let failed = 0;

  for (const s of candidates) {
    const res = await fetch(`${AGENTMEMORY_URL}/agentmemory/session/end`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId: s.id })
    });
    if (res.ok) {
      closed++;
    } else {
      failed++;
      console.error(`  failed ${s.id}: ${res.status} ${await res.text()}`);
    }
  }

  console.log(`Closed ${closed} session(s), ${failed} failed.`);

  const verify = await fetch(`${AGENTMEMORY_URL}/agentmemory/sessions`, { headers }).then((r) =>
    r.json()
  );
  const stillActive = verify.sessions.filter(
    (s) => s.status === 'active' && Date.parse(s.startedAt) <= cutoff
  ).length;
  console.log(`Remaining stale active (>${opts.minAgeHours}h): ${stillActive}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
