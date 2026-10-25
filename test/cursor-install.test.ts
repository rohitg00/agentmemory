import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('local Cursor setup preserves unrelated hooks and handles quoted checkout paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-cursor-install-'));
  const root = join(dir, 'checkout with $literal');
  const home = join(dir, 'home');
  try {
    mkdirSync(join(root, 'integrations/cursor'), { recursive: true });
    mkdirSync(join(root, 'plugin/scripts/cursor'), { recursive: true });
    writeFileSync(join(root, 'plugin/scripts/cursor/run-hook.mjs'), '');
    for (const name of ['install-local.mjs', '_env.mjs']) cpSync(join('integrations/cursor', name), join(root, 'integrations/cursor', name));
    mkdirSync(join(home, '.cursor'), { recursive: true });
    const own = { command: `node "${root}/plugin/scripts/cursor/run-hook.mjs" postToolUse` };
    const unrelated = [
      { command: 'node "/tools/audit.mjs"', matcher: 'agentmemory' },
      { command: 'node "/tools/audit.mjs" --label agentmemory' },
      { command: 'echo agentmemory' },
      { command: `node "${root}/plugin/scripts/cursor/run-hook.mjs.backup" postToolUse` },
    ];
    const hooks = { version: 1, hooks: { postToolUse: [own, ...unrelated] } };
    writeFileSync(join(home, '.cursor/hooks.json'), JSON.stringify(hooks));
    execFileSync(process.execPath, [join(root, 'integrations/cursor/install-local.mjs'), '--clear-user-hooks'], {
      env: { ...process.env, HOME: home, USERPROFILE: home, AGENTMEMORY_URL: 'http://127.0.0.1:3111', AGENTMEMORY_SECRET: 'fixture' }, encoding: 'utf8', timeout: 15000,
    });
    expect(JSON.parse(readFileSync(join(home, '.cursor/hooks.json'), 'utf8'))).toEqual({ ...hooks, hooks: { postToolUse: unrelated } });
    const backup = readdirSync(join(home, '.cursor')).find(name => name.startsWith('hooks.json.pre-plugin-'))!;
    expect(JSON.parse(readFileSync(join(home, '.cursor', backup), 'utf8'))).toEqual(hooks);
    expect(realpathSync(join(home, '.cursor/plugins/marketplaces/local-agentmemory'))).toBe(realpathSync(root));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
