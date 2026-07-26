import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  isCursorMetadataPath,
  normalizePathSlashes,
  pathUnderHome,
  resolveWorkspace
} from '../src/hooks/cursor/workspace.js';

// resolveWorkspace caches per session id, so every test needs a fresh one or
// it is served the previous run's answer instead of exercising its branch.
const sessionId = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The last resort before "unknown" reads the environment. Tests that assert a
// payload was rejected have to blank it, or the developer's own shell (PWD)
// answers instead and the assertion passes for the wrong reason.
const ENV_KEYS = [
  'CURSOR_WORKSPACE_ROOT',
  'CURSOR_WORKSPACE_FOLDER',
  'CURSOR_WORKSPACE_LABEL',
  'PWD',
  'VSCODE_CWD'
];

function withoutWorkspaceEnv<T>(fn: () => T): T {
  const saved = ENV_KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of ENV_KEYS) delete process.env[k];
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
  }
}

describe('cursor workspace resolver', () => {
  it('isCursorMetadataPath rejects substring false positives', () => {
    expect(isCursorMetadataPath('.cursor')).toBe(true);
    expect(isCursorMetadataPath('/foo/.cursor/bar')).toBe(true);
    expect(isCursorMetadataPath('C:\\Users\\me\\.cursor-backup')).toBe(false);
    expect(isCursorMetadataPath('/home/user/.cursor-workspace-clone')).toBe(false);
  });

  it('treats ~/.cursor/worktrees as real checkouts, not metadata', () => {
    // Cursor puts background-agent worktrees there. Classifying them as
    // metadata sends those sessions to whatever the transcript scan guesses.
    expect(isCursorMetadataPath('/home/me/.cursor/worktrees/myrepo-a1b2')).toBe(false);
    expect(isCursorMetadataPath('/home/me/.cursor/extensions')).toBe(true);
  });

  it('pathUnderHome requires a path-component boundary after HOME', () => {
    const home = normalizePathSlashes(process.env.HOME || process.env.USERPROFILE || '/home/alice');
    expect(pathUnderHome(home)).toBe(true);
    expect(pathUnderHome(`${home}/projects/agentmemory`)).toBe(true);
    expect(pathUnderHome(`${home}-backup`)).toBe(false);
  });

  it('uses workspace_roots when cwd is .cursor metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-ws-'));
    try {
      const resolved = resolveWorkspace({
        session_id: sessionId('metadata-cwd'),
        workspace_roots: [normalizePathSlashes(dir)],
        cwd: '.cursor'
      });
      expect(resolved.project).toBe(basename(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a tool_input file path to its directory, outside $HOME', () => {
    // Doubles as the container case: on CI the temp dir is /tmp/... (POSIX
    // absolute, not under $HOME), which a HOME-only rule silently rejected --
    // the same way it rejects a Codespaces checkout under /workspaces.
    const dir = mkdtempSync(join(tmpdir(), 'am-ws-'));
    writeFileSync(join(dir, 'package.json'), '{}');
    try {
      const resolved = resolveWorkspace({
        session_id: sessionId('tool-input'),
        tool_input: { path: normalizePathSlashes(join(dir, 'package.json')) }
      });
      expect(resolved.project).toBe(basename(dir));
      expect(normalizePathSlashes(resolved.cwd)).toBe(normalizePathSlashes(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never reports an OS directory as the project', () => {
    // A stray /usr/lib/... in tool_input must not produce a project "lib".
    const resolved = withoutWorkspaceEnv(() =>
      resolveWorkspace({
        session_id: sessionId('system-path'),
        tool_input: { path: '/usr/lib/node_modules/whatever.js' }
      })
    );
    expect(resolved.project).toBe('unknown-project');
  });

  it('never reports a tool metadata directory as the project', () => {
    // Sessions were landing under ".codex"; only ".cursor" used to be blocked.
    const home = process.env.HOME || process.env.USERPROFILE || tmpdir();
    const dotDir = join(home, `.am-test-dot-${Date.now()}`);
    mkdirSync(dotDir, { recursive: true });
    try {
      const resolved = withoutWorkspaceEnv(() =>
        resolveWorkspace({ session_id: sessionId('dot-dir'), cwd: normalizePathSlashes(dotDir) })
      );
      expect(resolved.project).toBe('unknown-project');
    } finally {
      rmSync(dotDir, { recursive: true, force: true });
    }
  });

  it('keeps a dot-named directory that is version controlled', () => {
    // ~/.dotfiles, ~/.emacs.d, ~/.config under chezmoi, and GitHub's own
    // convention of a repository named ".github" are all real projects people
    // open in an editor. What separates them from ~/.codex is not the leading
    // dot, it is that a human deliberately version controls them.
    const parent = mkdtempSync(join(tmpdir(), 'am-ws-'));
    const repo = join(parent, '.dotfiles');
    mkdirSync(repo, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
    try {
      const resolved = withoutWorkspaceEnv(() =>
        resolveWorkspace({
          session_id: sessionId('dot-repo'),
          workspace_roots: [normalizePathSlashes(repo)]
        })
      );
      expect(resolved.project).toBe('.dotfiles');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('never reports the home directory as the project', () => {
    // An agent launched with no workspace reports $HOME, which used to become
    // a project named after the account -- 18 real sessions in one day filed
    // under "Andrew", cwd C:\Users\Andrew. Unless $HOME is itself a
    // repository, "no workspace" is the honest answer.
    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return;
    const resolved = withoutWorkspaceEnv(() =>
      resolveWorkspace({ session_id: sessionId('home-cwd'), cwd: normalizePathSlashes(home) })
    );
    expect(resolved.project).toBe('unknown-project');
  });

  it('never reports a bare drive root as the project', () => {
    const resolved = withoutWorkspaceEnv(() =>
      resolveWorkspace({ session_id: sessionId('drive-root'), cwd: 'C:/' })
    );
    expect(resolved.project).toBe('unknown-project');
  });

  it('terminates on paths whose parent is itself', () => {
    // Regression: the ancestor walk used dirname() with only a `!== "/"`
    // guard, but dirname is a fixed point at every root -- dirname("//") is
    // "//", dirname("C:") is "C:". Any URL-shaped path ("//host/x", which the
    // transcript scan produces constantly) spun forever and hung the hook.
    const started = Date.now();
    for (const cwd of ['//', '//host/share/project', 'C:', 'D:/', '/']) {
      withoutWorkspaceEnv(() => resolveWorkspace({ session_id: sessionId('root-ish'), cwd }));
    }
    expect(Date.now() - started).toBeLessThan(10000);
  });

  it('ignores an IDE install directory', () => {
    const resolved = withoutWorkspaceEnv(() =>
      resolveWorkspace({
        session_id: sessionId('ide-install'),
        // VSCODE_CWD leaks this shape and used to yield the project "cursor".
        cwd: 'C:/Users/me/AppData/Local/Programs/cursor'
      })
    );
    expect(resolved.project).not.toBe('cursor');
  });
});
