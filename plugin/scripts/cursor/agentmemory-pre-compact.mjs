#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  isConfigEnabled,
  resolveWorkspace
} from './agentmemory-lib.mjs';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  const sessionId = data.session_id || 'unknown';
  const { project, cwd } = resolveWorkspace(data);
  if (isConfigEnabled('CLAUDE_MEMORY_BRIDGE')) {
    try {
      await fetch(`${getRestUrl()}/agentmemory/claude-bridge/sync`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000)
      });
    } catch {}
  }
  try {
    const res = await fetch(`${getRestUrl()}/agentmemory/context`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        sessionId,
        project,
        budget: 1500
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const result = await res.json();
      if (result.context) {
        process.stdout.write(JSON.stringify({
          additional_context: result.context
        }));
      }
    }
  } catch {}
}

main();
