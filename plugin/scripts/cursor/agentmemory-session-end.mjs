#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  isConfigEnabled,
  readWorkerHookPayload,
  resolveWorkspace,
  runDetachedHookParent
} from './agentmemory-lib.mjs';

const IS_WORKER = process.env.AM_HOOK_WORKER === '1';

async function runWorker() {
  const HARD_LIMIT_MS = 250000;
  const watchdog = setTimeout(() => process.exit(0), HARD_LIMIT_MS);

  try {
    const data = readWorkerHookPayload();
    if (!data) return;

    const sessionId = data.session_id || 'unknown';
    const { project } = resolveWorkspace(data);

    try {
      await fetch(`${getRestUrl()}/agentmemory/session/end`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, project }),
        signal: AbortSignal.timeout(30000)
      });
    } catch (err) {
      console.error('[agentmemory] session/end failed:', err.message);
    }

    if (isConfigEnabled('CONSOLIDATION_ENABLED')) {
      try {
        await fetch(`${getRestUrl()}/agentmemory/crystals/auto`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ olderThanDays: 0, project }),
          signal: AbortSignal.timeout(60000)
        });
      } catch (err) {
        console.error('[agentmemory] crystals/auto failed:', err.message);
      }
      try {
        await fetch(`${getRestUrl()}/agentmemory/consolidate-pipeline`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ tier: 'all', force: true, project }),
          signal: AbortSignal.timeout(120000)
        });
      } catch (err) {
        console.error('[agentmemory] consolidate-pipeline failed:', err.message);
      }
    }

    if (isConfigEnabled('CLAUDE_MEMORY_BRIDGE')) {
      try {
        await fetch(`${getRestUrl()}/agentmemory/claude-bridge/sync`, {
          method: 'POST',
          headers: authHeaders(),
          signal: AbortSignal.timeout(30000)
        });
      } catch (err) {
        console.error('[agentmemory] claude-bridge/sync failed:', err.message);
      }
    }
  } finally {
    clearTimeout(watchdog);
    process.exit(0);
  }
}

if (IS_WORKER) {
  runWorker();
} else {
  runDetachedHookParent(import.meta.url);
}
