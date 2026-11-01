import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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
  'CURSOR_PROJECT_DIR',
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

  it('drops a cached workspace that no longer exists', () => {
    const parent = mkdtempSync(join(tmpdir(), 'am-ws-'));
    const oldDir = join(parent, 'old-app');
    const newDir = join(parent, 'new-app');
    mkdirSync(oldDir);
    mkdirSync(newDir);
    const id = sessionId('moved');
    try {
      withoutWorkspaceEnv(() => {
        expect(resolveWorkspace({ session_id: id, workspace_roots: [oldDir] }).project).toBe('old-app');
        rmSync(oldDir, { recursive: true, force: true });
        expect(resolveWorkspace({ session_id: id, workspace_roots: [newDir] }).project).toBe('new-app');
      });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it('does not cache a workspace inferred from the launch directory', () => {
    const parent = mkdtempSync(join(tmpdir(), 'am-ws-'));
    const launchDir = join(parent, 'launch-dir');
    const realDir = join(parent, 'real-app');
    mkdirSync(launchDir);
    mkdirSync(realDir);
    const id = sessionId('pwd');
    try {
      withoutWorkspaceEnv(() => {
        process.env.PWD = launchDir;
        expect(resolveWorkspace({ session_id: id }).project).toBe('launch-dir');
        delete process.env.PWD;
        expect(resolveWorkspace({ session_id: id, workspace_roots: [realDir] }).project).toBe(
          'real-app'
        );
      });
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("uses Cursor's documented CURSOR_PROJECT_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-ws-'));
    try {
      const resolved = withoutWorkspaceEnv(() => {
        process.env.CURSOR_PROJECT_DIR = dir;
        return resolveWorkspace({ session_id: sessionId('project-dir') });
      });
      expect(resolved.project).toBe(basename(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


describe('cursor workspace cache and aliases', () => {
  let home: string;
  let cachePath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'am-cursor-cache-'));
    cachePath = join(home, '.cursor/hooks/.agentmemory-session-cache.json');
    mkdirSync(join(home, '.cursor/hooks'), { recursive: true });
    vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
    for (const key of ENV_KEYS) vi.stubEnv(key, '');
    vi.stubEnv('AGENTMEMORY_PROJECT_NAME', ''); vi.resetModules();
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  it('expires a cached mapping on reads without waiting for another write', async () => {
    const old = join(home, 'old'); const current = join(home, 'current');
    mkdirSync(old); mkdirSync(current);
    writeFileSync(cachePath, JSON.stringify({ session: { project: 'old', cwd: old, updatedAt: new Date(Date.now() - 8 * 86400000).toISOString() } }));
    const { resolveWorkspace } = await import('../src/hooks/cursor/workspace.js');
    expect(resolveWorkspace({ session_id: 'session', workspace_roots: [current] }).project).toBe('current');
  });
  it('caps the cache after inserting the new session', async () => {
    const workspace = join(home, 'project'); mkdirSync(workspace);
    const entry = { project: 'project', cwd: workspace, updatedAt: new Date(Date.now() - 1000).toISOString() };
    writeFileSync(cachePath, JSON.stringify(Object.fromEntries(Array.from({ length: 200 }, (_, i) => ['old-' + i, entry]))));
    const { resolveWorkspace } = await import('../src/hooks/cursor/workspace.js');
    resolveWorkspace({ session_id: 'new', workspace_roots: [workspace] });
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(Object.keys(cache)).toHaveLength(200); expect(cache.new.cwd).toBe(workspace);
  });
  it.each(['null', '[]', '{"session":null}'])('ignores malformed cache contents: %s', async raw => {
    const workspace = join(home, 'project'); mkdirSync(workspace); writeFileSync(cachePath, raw);
    const { resolveWorkspace } = await import('../src/hooks/cursor/workspace.js');
    expect(resolveWorkspace({ session_id: 'session', workspace_roots: [workspace] }).project).toBe('project');
  });
  it('uses conversation_id for caching and toolArgs for workspace evidence', async () => {
    const workspace = join(home, 'project'); mkdirSync(workspace); writeFileSync(join(workspace, 'file.ts'), '');
    const { resolveWorkspace } = await import('../src/hooks/cursor/workspace.js');
    expect(resolveWorkspace({ conversation_id: 'conversation', toolArgs: { path: join(workspace, 'file.ts') } }).project).toBe('project');
    expect(resolveWorkspace({ conversation_id: 'conversation' }).cwd).toBe(workspace);
  });
  it.each(['temporary', 'home'])('does not cache a generic ancestor of a missing %s tool path', async location => {
    const root = location === 'temporary' ? tmpdir() : home;
    const missing = join(root, `am-missing-${Date.now()}`, 'result.json');
    const workspace = join(home, 'actual-project');
    mkdirSync(workspace);
    const { resolveWorkspace } = await import('../src/hooks/cursor/workspace.js');

    expect(resolveWorkspace({ session_id: 'missing-tool', tool_input: { path: missing } }).project).toBe('unknown-project');
    expect(resolveWorkspace({ session_id: 'missing-tool', workspace_roots: [workspace] }).project).toBe('actual-project');

    vi.stubEnv('CURSOR_PROJECT_DIR', workspace);
    expect(resolveWorkspace({ session_id: 'tool-with-env', toolArgs: { path: missing } }).project).toBe('actual-project');
  });
  it('keeps shared project naming and explicit overrides across linked worktrees', async () => {
    const repo = join(home, 'main-repo'); const worktree = join(home, 'other-checkout'); mkdirSync(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture', '--allow-empty'], { cwd: repo });
    execFileSync('git', ['worktree', 'add', '-q', '--detach', worktree], { cwd: repo });
    const { enrichPayload } = await import('../src/hooks/cursor/delegate.js');
    const data = { session_id: 'worktree', workspace_roots: [worktree] };
    expect(enrichPayload(data).project).toBe('main-repo');
    vi.stubEnv('AGENTMEMORY_PROJECT_NAME', 'configured'); expect(enrichPayload(data).project).toBe('configured');
    expect(enrichPayload({ session_id: 'no-workspace' }).project).toBe('configured');
    vi.stubEnv('AGENTMEMORY_PROJECT_NAME', ''); expect(enrichPayload(data).project).toBe('main-repo');
  });
});
