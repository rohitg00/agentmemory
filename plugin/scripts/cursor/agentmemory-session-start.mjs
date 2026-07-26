#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  isConfigEnabled,
  resolveWorkspace
} from './agentmemory-lib.mjs';

const INJECT_TIMEOUT_MS = 2500;
const REGISTER_TIMEOUT_MS = 1500;

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  const sessionId = data.session_id || `ses_${Date.now().toString(36)}`;
  const { project, cwd } = resolveWorkspace(data);
  const url = `${getRestUrl()}/agentmemory/session/start`;
  const init = {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      sessionId,
      project,
      cwd
    })
  };
  if (!isConfigEnabled('AGENTMEMORY_INJECT_CONTEXT')) {
    try {
      await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REGISTER_TIMEOUT_MS)
      });
    } catch {}
    return;
  }
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(INJECT_TIMEOUT_MS)
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
