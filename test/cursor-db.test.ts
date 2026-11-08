import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sqlite = (() => { try { return createRequire(import.meta.url)('node:sqlite'); } catch { return null; } })();
describe.skipIf(!sqlite)('Cursor read-only workspace lookup', () => {
  let home: string;
  let storage: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'am-cursor-db-'));
    vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('APPDATA', join(home, 'AppData/Roaming')); vi.stubEnv('XDG_CONFIG_HOME', join(home, '.config'));
    storage = process.platform === 'darwin' ? join(home, 'Library/Application Support/Cursor/User') : process.platform === 'win32' ? join(home, 'AppData/Roaming/Cursor/User') : join(home, '.config/Cursor/User');
    mkdirSync(join(storage, 'globalStorage'), { recursive: true }); vi.resetModules();
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  function database(path: string, key: string, value: unknown) {
    const db = new sqlite.DatabaseSync(path);
    try { db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)'); db.prepare('INSERT INTO ItemTable VALUES (?, ?)').run(key, JSON.stringify(value)); }
    finally { db.close(); }
  }
  it('reads the global workspace mapping without modifying the database', async () => {
    const path = join(storage, 'globalStorage/state.vscdb');
    database(path, 'composer.composerHeaders', { allComposers: [{ composerId: 'session', workspaceIdentifier: { uri: { fsPath: '/fixture/project' } } }] });
    const original = readFileSync(path);
    const { workspaceFromCursorDb } = await import('../src/hooks/cursor/cursor-db.js');
    expect(workspaceFromCursorDb('session')).toBe('/fixture/project');
    expect(workspaceFromCursorDb('unknown')).toBeNull(); expect(readFileSync(path)).toEqual(original);
  });
  it('uses legacy metadata and rejects unmappable remote workspaces', async () => {
    const workspace = join(storage, 'workspaceStorage/legacy'); mkdirSync(workspace, { recursive: true });
    database(join(workspace, 'state.vscdb'), 'composer.composerData', { allComposers: [{ composerId: 'legacy' }] });
    writeFileSync(join(workspace, 'workspace.json'), JSON.stringify({ folder: pathToFileURL(home).href }));
    const { workspaceFromCursorDb } = await import('../src/hooks/cursor/cursor-db.js');
    expect(workspaceFromCursorDb('legacy')).toBe(home);
    writeFileSync(join(workspace, 'workspace.json'), JSON.stringify({ folder: 'vscode-remote://ssh-remote+host/project' }));
    expect(workspaceFromCursorDb('legacy')).toBeNull();
  });
});
