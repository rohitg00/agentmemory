#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { resolveWorkspace } from './agentmemory-lib.mjs';

// Load config from ~/.agentmemory/.env
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

const INJECT_CONTEXT = process.env.AGENTMEMORY_INJECT_CONTEXT === 'true' || config.AGENTMEMORY_INJECT_CONTEXT === 'true';
const REST_URL = process.env.AGENTMEMORY_URL || config.AGENTMEMORY_URL || 'http://localhost:3111';
const SECRET = process.env.AGENTMEMORY_SECRET || config.AGENTMEMORY_SECRET || '';
const INJECT_TIMEOUT_MS = 2500;
const REGISTER_TIMEOUT_MS = 1500;

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
  const sessionId = data.session_id || `ses_${Date.now().toString(36)}`;
  const { project, cwd } = resolveWorkspace(data);
  const url = `${REST_URL}/agentmemory/session/start`;
  const init = {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      sessionId,
      project,
      cwd
    })
  };
  if (!INJECT_CONTEXT) {
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
