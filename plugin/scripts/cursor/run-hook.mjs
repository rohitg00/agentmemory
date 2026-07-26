#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWorkspace } from './workspace.mjs';

export const HOOK_MAP = {
  sessionStart: 'session-start.mjs',
  beforeSubmitPrompt: 'prompt-submit.mjs',
  preToolUse: 'pre-tool-use.mjs',
  postToolUse: 'post-tool-use.mjs',
  postToolUseFailure: 'post-tool-failure.mjs',
  preCompact: 'pre-compact.mjs',
  subagentStart: 'subagent-start.mjs',
  subagentStop: 'subagent-stop.mjs',
  stop: 'stop.mjs',
  sessionEnd: 'session-end.mjs'
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OFFICIAL_DIR = join(SCRIPT_DIR, '..');

const SLOW_HOOKS = new Set(['stop', 'sessionEnd']);

export function enrichPayload(data) {
  const { project, cwd } = resolveWorkspace(data);
  return {
    project,
    payload: {
      ...data,
      session_id: data.session_id ?? data.sessionId,
      cwd
    }
  };
}

export function delegateHook(hookKey, data) {
  const script = HOOK_MAP[hookKey];
  if (!script) return 0;

  const { project, payload } = enrichPayload(data);
  const scriptPath = join(OFFICIAL_DIR, script);
  const child = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    env: { ...process.env, AGENTMEMORY_PROJECT_NAME: project },
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: SLOW_HOOKS.has(hookKey) ? 180000 : 30000
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  return child.status ?? 0;
}

async function main() {
  const hookKey = process.argv[2];
  if (!hookKey || !HOOK_MAP[hookKey]) process.exit(0);

  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) process.exit(0);

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  process.exit(delegateHook(hookKey, data));
}

main();
