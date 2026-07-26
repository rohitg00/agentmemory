#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  readWorkerHookPayload,
  resolveWorkspace,
  runDetachedHookParent
} from './agentmemory-lib.mjs';

const IS_WORKER = process.env.AM_HOOK_WORKER === '1';

async function runWorker() {
  const HARD_LIMIT_MS = 130000;
  const watchdog = setTimeout(() => process.exit(0), HARD_LIMIT_MS);

  try {
    const data = readWorkerHookPayload();
    if (!data) return;

    const sessionId = data.session_id || 'unknown';
    const { project } = resolveWorkspace(data);

    try {
      await fetch(`${getRestUrl()}/agentmemory/summarize`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sessionId, project }),
        signal: AbortSignal.timeout(120000)
      });
    } catch (err) {
      console.error('[agentmemory] summarize failed:', err.message);
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
