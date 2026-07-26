#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  resolveWorkspace,
  truncateValue
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
  if (data.is_interrupt) return;
  const sessionId = data.session_id || 'unknown';
  const { project, cwd } = resolveWorkspace(data);
  try {
    await fetch(`${getRestUrl()}/agentmemory/observe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: 'post_tool_failure',
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: data.tool_name,
          tool_input: truncateValue(data.tool_input, 4000),
          error: truncateValue(data.error, 4000)
        }
      }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

main();
