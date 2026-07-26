#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveWorkspace } from './agentmemory-lib.mjs';

const config = {};
const envPath = join(homedir(), '.agentmemory', '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        config[key] = val;
      }
    }
  }
}

const REST_URL = process.env.AGENTMEMORY_URL || config.AGENTMEMORY_URL || 'http://localhost:3111';
const SECRET = process.env.AGENTMEMORY_SECRET || config.AGENTMEMORY_SECRET || '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (SECRET) h['Authorization'] = `Bearer ${SECRET}`;
  return h;
}


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
    await fetch(`${REST_URL}/agentmemory/observe`, {
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
