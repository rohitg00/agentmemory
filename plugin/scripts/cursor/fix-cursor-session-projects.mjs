#!/usr/bin/env node
/**
 * One-off migration: fix sessions stored with project/cwd ".cursor"
 * by re-resolving the real workspace from Cursor transcript paths.
 *
 * Usage:
 *   node fix-cursor-session-projects.mjs          # apply
 *   node fix-cursor-session-projects.mjs --dry-run  # preview only
 */
import {
  getRestUrl,
  getSecret,
  isCursorMetadataPath,
  resolveWorkspace
} from './agentmemory-lib.mjs';

const dryRun = process.argv.includes('--dry-run');

function isBadSession(session) {
  const { project, cwd } = session;
  return isCursorMetadataPath(project) || isCursorMetadataPath(cwd);
}

async function main() {
  const restUrl = getRestUrl();
  const secret = getSecret();
  if (!restUrl || !secret) {
    console.error('Missing AGENTMEMORY_URL or AGENTMEMORY_SECRET in ~/.agentmemory/.env');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json'
  };

  const listRes = await fetch(`${restUrl}/agentmemory/sessions`, { headers });
  if (!listRes.ok) {
    console.error('Failed to list sessions:', listRes.status, await listRes.text());
    process.exit(1);
  }

  const { sessions } = await listRes.json();
  const bad = sessions.filter(isBadSession);
  console.log(`Found ${bad.length} session(s) with .cursor project/cwd (of ${sessions.length} total)`);

  const fixes = [];
  const skipped = [];

  for (const session of bad) {
    const resolved = resolveWorkspace({ session_id: session.id });
    if (
      !resolved?.project ||
      resolved.project === '.cursor' ||
      resolved.project === 'unknown-project'
    ) {
      skipped.push({ id: session.id, reason: 'could not resolve workspace', resolved });
      continue;
    }
    if (resolved.project === session.project && resolved.cwd === session.cwd) {
      skipped.push({ id: session.id, reason: 'already correct', resolved });
      continue;
    }
    fixes.push({
      id: session.id,
      from: { project: session.project, cwd: session.cwd },
      to: resolved,
      session: { ...session, project: resolved.project, cwd: resolved.cwd }
    });
  }

  for (const fix of fixes) {
    console.log(`  ${fix.id}: ${fix.from.project} → ${fix.to.project}`);
  }
  for (const s of skipped) {
    console.log(`  skip ${s.id}: ${s.reason}`);
  }

  if (!fixes.length) {
    console.log('Nothing to update.');
    return;
  }

  if (dryRun) {
    console.log(`Dry run: would update ${fixes.length} session(s).`);
    return;
  }

  const importRes = await fetch(`${restUrl}/agentmemory/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      strategy: 'merge',
      exportData: {
        version: '0.9.21',
        sessions: fixes.map((f) => f.session),
        memories: [],
        summaries: [],
        observations: {}
      }
    })
  });

  const result = await importRes.json();
  if (!importRes.ok || result.success === false) {
    console.error('Import failed:', importRes.status, result);
    process.exit(1);
  }

  console.log('Import result:', result);
  console.log(`Updated ${fixes.length} session(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
