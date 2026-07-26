#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const HOME = homedir();
const CURSOR_PROJECTS_DIR = join(HOME, '.cursor', 'projects');
const SESSION_CACHE_PATH = join(HOME, '.cursor', 'hooks', '.agentmemory-session-cache.json');

function isBadPath(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/' || trimmed === '.') return true;
  if (trimmed === '.cursor' || trimmed.endsWith('/.cursor')) return true;
  return false;
}

function loadSessionCache() {
  try {
    return JSON.parse(readFileSync(SESSION_CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function rememberSession(sessionId, project, cwd) {
  if (!sessionId || !project || project === '.cursor') return;
  try {
    const cache = loadSessionCache();
    cache[sessionId] = { project, cwd, updatedAt: new Date().toISOString() };
    writeFileSync(SESSION_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {}
}

function recallSession(sessionId) {
  if (!sessionId) return null;
  const cache = loadSessionCache();
  return cache[sessionId] || null;
}

function collectPathStrings(value, out = []) {
  if (typeof value === 'string') {
    if (value.startsWith(HOME) && !value.includes('/.cursor/')) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectPathStrings(v, out);
  }
  return out;
}

function existingAncestor(pathValue) {
  let current = pathValue;
  while (current && current !== HOME && current !== '/') {
    if (existsSync(current)) return current;
    current = dirname(current);
  }
  return null;
}

function gitRootFromPath(targetPath) {
  return execSync('git rev-parse --show-toplevel', {
    cwd: targetPath,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function cleanRepoName(dirPath) {
  const normalized = String(dirPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return 'unknown-project';

  // Claude/Cursor worktrees: .../<repo>/.claude/worktrees/agent-xxx -> <repo>
  const claudeWt = normalized.match(/^(.*?)\/\.claude\/worktrees\/[^/]+$/i);
  if (claudeWt?.[1]) return cleanRepoName(claudeWt[1]);

  // Generic git worktree folder named agent-<hash>
  const baseName = basename(normalized);
  if (/^agent-[a-f0-9]{6,}$/i.test(baseName)) {
    const parent = dirname(normalized);
    if (parent && parent !== normalized && parent !== '.' && parent !== '/') {
      return cleanRepoName(parent);
    }
  }

  let name = baseName.replace(/(-worktree-\d+|-worktree|-[a-f0-9]{7,40})$/i, '');
  // Known local variant folders that should share one memory bucket
  if (/^pxread-/i.test(name)) return 'pxread';
  return name || 'unknown-project';
}

function projectFromPath(targetPath) {
  try {
    return cleanRepoName(gitRootFromPath(targetPath));
  } catch {
    return cleanRepoName(targetPath);
  }
}

function decodeSlugCandidates(slug) {
  if (!slug || slug === 'empty-window') return [];
  const parts = slug.split('-');
  if (parts[0] !== 'Users' || parts.length < 2) return [];

  const results = new Set();

  function walk(index, currentPath) {
    if (index >= parts.length) {
      if (existsSync(currentPath)) results.add(currentPath);
      return;
    }
    walk(index + 1, `${currentPath}/${parts[index]}`);
    const remainder = parts.slice(index).join('-');
    const alt = `${currentPath}/${remainder}`;
    if (existsSync(alt)) results.add(alt);
  }

  walk(2, `/${parts[0]}/${parts[1]}`);
  return [...results];
}

function pickBestCandidate(candidates, preferredLabel) {
  if (!candidates.length) return null;
  if (preferredLabel) {
    const labelMatch = candidates.find((p) => basename(p) === preferredLabel);
    if (labelMatch) return labelMatch;
  }

  const gitRoots = [];
  for (const candidate of candidates) {
    try {
      gitRoots.push(gitRootFromPath(candidate));
    } catch {}
  }
  const uniqueGitRoots = [...new Set(gitRoots)];
  if (uniqueGitRoots.length === 1) return uniqueGitRoots[0];

  return candidates.sort((a, b) => b.length - a.length)[0];
}

function findSessionTranscript(sessionId) {
  if (!sessionId || !existsSync(CURSOR_PROJECTS_DIR)) return null;

  for (const slug of readdirSync(CURSOR_PROJECTS_DIR)) {
    const transcriptsRoot = join(CURSOR_PROJECTS_DIR, slug, 'agent-transcripts');
    if (!existsSync(transcriptsRoot)) continue;

    for (const entry of readdirSync(transcriptsRoot)) {
      if (entry === sessionId || entry.startsWith(`${sessionId}-`)) {
        const transcriptFile = join(transcriptsRoot, entry, `${entry}.jsonl`);
        return {
          slug,
          transcriptFile: existsSync(transcriptFile) ? transcriptFile : null
        };
      }
    }
  }
  return null;
}

function workspaceFromTranscriptFile(transcriptFile) {
  if (!transcriptFile || !existsSync(transcriptFile)) return null;

  const chunk = readFileSync(transcriptFile, 'utf-8').slice(0, 250000);
  const escapedHome = HOME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedHome}/[^\\s"'\\\\]+`, 'g');
  const counts = new Map();

  for (const match of chunk.match(re) || []) {
    if (match.includes('/.cursor/')) continue;
    const existing = existingAncestor(match);
    if (!existing || existing === HOME) continue;
    counts.set(existing, (counts.get(existing) || 0) + 1);
  }

  let best = null;
  let bestCount = 0;
  for (const [pathValue, count] of counts) {
    if (count > bestCount) {
      best = pathValue;
      bestCount = count;
    }
  }

  return best;
}

function workspaceFromSessionId(sessionId) {
  const hit = findSessionTranscript(sessionId);
  if (!hit) return null;

  const fromTranscript = workspaceFromTranscriptFile(hit.transcriptFile);
  if (fromTranscript) return fromTranscript;

  const preferredLabel = process.env.CURSOR_WORKSPACE_LABEL || '';
  const candidates = decodeSlugCandidates(hit.slug);
  return pickBestCandidate(candidates, preferredLabel);
}

export function resolveWorkspace(data) {
  const sessionId = data?.session_id;
  const cached = recallSession(sessionId);
  if (cached?.cwd && !isBadPath(cached.cwd)) {
    return { project: cached.project, cwd: cached.cwd };
  }

  const payloadCandidates = [
    ...(Array.isArray(data?.workspace_roots) ? data.workspace_roots : []),
    ...(Array.isArray(data?.workspace_folders) ? data.workspace_folders : []),
    data?.workspace_folder,
    data?.workspaceFolder,
    data?.workspace,
    data?.cwd,
    data?.root_path,
    data?.project_path,
    process.env.CURSOR_WORKSPACE_ROOT,
    process.env.CURSOR_WORKSPACE_FOLDER,
    process.env.PWD,
    process.env.VSCODE_CWD
  ];

  for (const candidate of payloadCandidates) {
    if (isBadPath(candidate)) continue;
    const existing = existingAncestor(candidate);
    if (!existing) continue;
    const project = projectFromPath(existing);
    if (project !== '.cursor') {
      rememberSession(sessionId, project, existing);
      return { project, cwd: existing };
    }
  }

  const toolPaths = collectPathStrings(data?.tool_input)
    .map(existingAncestor)
    .filter(Boolean);
  for (const existing of toolPaths) {
    const project = projectFromPath(existing);
    if (project !== '.cursor') {
      rememberSession(sessionId, project, existing);
      return { project, cwd: existing };
    }
  }

  if (sessionId) {
    const fromSession = workspaceFromSessionId(sessionId);
    if (fromSession) {
      const project = projectFromPath(fromSession);
      rememberSession(sessionId, project, fromSession);
      return { project, cwd: fromSession };
    }
  }

  if (process.env.CURSOR_WORKSPACE_LABEL) {
    const label = process.env.CURSOR_WORKSPACE_LABEL;
    rememberSession(sessionId, label, label);
    return { project: label, cwd: label };
  }

  return { project: 'unknown-project', cwd: 'unknown-project' };
}

export function resolveProject(data) {
  return resolveWorkspace(data).project;
}
