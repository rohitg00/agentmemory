import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  isCursorMetadataPath,
  normalizePathSlashes,
  pathUnderHome,
  resolveWorkspace
} from '../plugin/scripts/cursor/workspace.mjs';

describe('cursor workspace resolver', () => {
  it('isCursorMetadataPath rejects substring false positives', () => {
    expect(isCursorMetadataPath('.cursor')).toBe(true);
    expect(isCursorMetadataPath('/foo/.cursor/bar')).toBe(true);
    expect(isCursorMetadataPath('C:\\Users\\me\\.cursor-backup')).toBe(false);
    expect(isCursorMetadataPath('/home/user/.cursor-workspace-clone')).toBe(false);
  });

  it('pathUnderHome requires a path-component boundary after HOME', () => {
    const home = normalizePathSlashes(process.env.HOME || process.env.USERPROFILE || '/home/alice');
    expect(pathUnderHome(home)).toBe(true);
    expect(pathUnderHome(`${home}/projects/agentmemory`)).toBe(true);
    expect(pathUnderHome(`${home}-backup`)).toBe(false);
  });

  it('resolveWorkspace uses workspace_roots when cwd is .cursor metadata', () => {
    const repoRoot = join(process.cwd()).replace(/\\/g, '/');
    const resolved = resolveWorkspace({
      session_id: 'test-session',
      workspace_roots: [repoRoot],
      cwd: '.cursor'
    });
    expect(resolved.project).toBe('agentmemory');
    expect(normalizePathSlashes(resolved.cwd)).toBe(repoRoot);
  });

  it('resolveWorkspace uses tool_input paths under home', () => {
    const repoRoot = join(process.cwd()).replace(/\\/g, '/');
    const resolved = resolveWorkspace({
      session_id: `tool-${Date.now()}`,
      tool_input: { path: `${repoRoot}/package.json` }
    });
    expect(resolved.project).toBe('agentmemory');
    expect(normalizePathSlashes(resolved.cwd)).toBe(repoRoot);
  });
});
