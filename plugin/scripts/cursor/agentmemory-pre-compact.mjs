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
  if (process.env.CLAUDE_MEMORY_BRIDGE === 'true' || config.CLAUDE_MEMORY_BRIDGE === 'true') {
    try {
      await fetch(`${REST_URL}/agentmemory/claude-bridge/sync`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000)
      });
    } catch {}
  }
  try {
    const res = await fetch(`${REST_URL}/agentmemory/context`, {
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
