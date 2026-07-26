#!/usr/bin/env node
import {
  authHeaders,
  getRestUrl,
  isConfigEnabled,
  resolveWorkspace
} from './agentmemory-lib.mjs';

async function main() {
  if (!isConfigEnabled('AGENTMEMORY_INJECT_CONTEXT')) return;
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
    const pattern = toolInput.pattern;
    if (typeof pattern === 'string' && pattern.length > 0) terms.push(pattern);
  }
  const sessionId = data.session_id || 'unknown';
  const { project, cwd } = resolveWorkspace(data);
  try {
    const res = await fetch(`${getRestUrl()}/agentmemory/enrich`, {
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
