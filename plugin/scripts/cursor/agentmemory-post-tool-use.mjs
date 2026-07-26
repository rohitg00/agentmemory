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
  const { imageData, cleanOutput } = extractImageData(data.tool_response ?? data.tool_output);
  try {
    await fetch(`${REST_URL}/agentmemory/observe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        hookType: 'post_tool_use',
        sessionId,
        project,
        cwd,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: data.tool_name,
          tool_input: data.tool_input,
          tool_output: truncate(cleanOutput, 8000),
          ...imageData ? { image_data: imageData } : {}
        }
      }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

function isBase64Image(val) {
  return typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('iVBORw0KGgo') || val.startsWith('/9j/'));
}

function extractImageData(output) {
  if (isBase64Image(output)) return {
    imageData: output,
    cleanOutput: '[image data extracted]'
  };
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const obj = output;
    let imageData;
    const clean = {};
    for (const [key, val] of Object.entries(obj)) {
      if (!imageData && isBase64Image(val)) {
        imageData = val;
        clean[key] = '[image data extracted]';
      } else {
        clean[key] = val;
      }
    }
    return {
      imageData,
      cleanOutput: clean
    };
  }
  return {
    imageData: undefined,
    cleanOutput: output
  };
}

function truncate(value, max) {
  if (typeof value === 'string' && value.length > max) return value.slice(0, max) + '\n[...truncated]';
  if (typeof value === 'object' && value !== null) {
    const str = JSON.stringify(value);
    if (str.length > max) return str.slice(0, max) + '...[truncated]';
    return value;
  }
  return value;
}
main();
