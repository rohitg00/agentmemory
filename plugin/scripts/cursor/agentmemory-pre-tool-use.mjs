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

const INJECT_CONTEXT = process.env.AGENTMEMORY_INJECT_CONTEXT === 'true' || config.AGENTMEMORY_INJECT_CONTEXT === 'true';
const REST_URL = process.env.AGENTMEMORY_URL || config.AGENTMEMORY_URL || 'http://localhost:3111';
const SECRET = process.env.AGENTMEMORY_SECRET || config.AGENTMEMORY_SECRET || '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (SECRET) h['Authorization'] = `Bearer ${SECRET}`;
  return h;
}


async function main() {
  if (!INJECT_CONTEXT) return;
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }
  const toolName = data.tool_name;
  if (!toolName) return;
  if (!['Edit', 'Write', 'Read', 'Glob', 'Grep', 'Shell'].includes(toolName)) return;

  const toolInput = data.tool_input || {};
  const files = [];
  const fileKeys = toolName === 'Grep' ? ['path', 'file'] : ['file_path', 'path', 'file', 'pattern'];

  for (const key of fileKeys) {
    const val = toolInput[key];
    if (typeof val === 'string' && val.length > 0) files.push(val);
  }
  if (files.length === 0) return;

  const terms = [];
  if (toolName === 'Grep' || toolName === 'Glob') {
    const pattern = toolInput['pattern'];
    if (typeof pattern === 'string' && pattern.length > 0) terms.push(pattern);
  }
  const sessionId = data.session_id || 'unknown';
  const { project, cwd } = resolveWorkspace(data);
  try {
    const res = await fetch(`${REST_URL}/agentmemory/enrich`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        sessionId,
        project,
        files,
        terms,
        toolName
      }),
      signal: AbortSignal.timeout(2000)
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
