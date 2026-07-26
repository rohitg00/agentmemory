#!/usr/bin/env node
import { authHeaders, getRestUrl, resolveWorkspace } from './agentmemory-lib.mjs';

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
  const lastMsg = typeof data.last_assistant_message === 'string' ? data.last_assistant_message.slice(0, 4000) : '';
  try {
    await fetch(`${getRestUrl()}/agentmemory/observe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: 'subagent_stop',
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          agent_id: data.agent_id,
          agent_type: data.agent_type,
          last_message: lastMsg
        }
      }),
      signal: AbortSignal.timeout(2000)
    });
  } catch {}
}

main();
