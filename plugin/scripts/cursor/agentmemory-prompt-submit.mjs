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
  try {
    await fetch(`${getRestUrl()}/agentmemory/observe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: 'prompt_submit',
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: { prompt: data.prompt || data.user_prompt }
      }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

main();
