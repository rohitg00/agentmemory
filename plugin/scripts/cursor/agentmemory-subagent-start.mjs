#!/usr/bin/env node
import { authHeaders, getRestUrl, resolveWorkspace } from './agentmemory-lib.mjs';

const TIMEOUT_MS = 800;

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
  fetch(`${getRestUrl()}/agentmemory/observe`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      hookType: 'subagent_start',
      sessionId,
      project,
      cwd,
      timestamp: new Date().toISOString(),
      data: {
        agent_id: data.agent_id,
        agent_type: data.agent_type
      }
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => {});
}

main();
