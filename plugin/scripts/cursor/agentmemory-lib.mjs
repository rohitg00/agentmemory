#!/usr/bin/env node
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const CURSOR_PROJECTS_DIR = join(HOME, '.cursor', 'projects');
const SESSION_CACHE_PATH = join(HOME, '.cursor', 'hooks', '.agentmemory-session-cache.json');
const ENV_FILE_PATH = join(HOME, '.agentmemory', '.env');

let cachedEnvFile = null;

export function loadAgentmemoryEnv(envPath = ENV_FILE_PATH) {
  const out = {};
  if (!existsSync(envPath)) return out;
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {}
  return out;
}

function getEnvFile() {
  if (!cachedEnvFile) cachedEnvFile = loadAgentmemoryEnv();
  return cachedEnvFile;
}

export function getConfigValue(key) {
  if (process.env[key] !== undefined && process.env[key] !== '') return process.env[key];
  return getEnvFile()[key];
}

export function isConfigEnabled(key) {
  return getConfigValue(key) === 'true';
}

export function getRestUrl() {
  return getConfigValue('AGENTMEMORY_URL') || 'http://localhost:3111';
}

export function getSecret() {
  return getConfigValue('AGENTMEMORY_SECRET') || '';
}

export function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const secret = getSecret();
  if (secret) h.Authorization = `Bearer ${secret}`;
  return h;
}

export function truncateValue(value, max) {
  if (typeof value === 'string') {
    if (value.length > max) return `${value.slice(0, max)}\n[...truncated]`;
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    const str = JSON.stringify(value);
    if (str.length > max) return `${str.slice(0, max)}...[truncated]`;
    return str;
  }
  return value;
}

export function normalizePathSlashes(value) {
  return String(value).replace(/\\/g, '/');
}

export function isCursorMetadataPath(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = normalizePathSlashes(value.trim());
  if (trimmed === '.cursor') return true;
  return /(^|\/)\.cursor(\/|$)/.test(trimmed);
}

function isBadPath(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = normalizePathSlashes(value.trim());
  if (!trimmed || trimmed === '/' || trimmed === '.') return true;
  if (isCursorMetadataPath(trimmed)) return true;
  return false;
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function withSessionCacheLock(fn) {
  const lockPath = `${SESSION_CACHE_PATH}.lock`;
  mkdirSync(dirname(SESSION_CACHE_PATH), { recursive: true });
  let fd;
  for (let i = 0; i < 50; i++) {
    try {
      fd = openSync(lockPath, 'wx');
      break;
    } catch {
      sleepMs(10);
    }
  }
  if (!fd) return;
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {}
  }
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
  withSessionCacheLock(() => {
    try {
      const cache = loadSessionCache();
      cache[sessionId] = { project, cwd, updatedAt: new Date().toISOString() };
      const tmp = `${SESSION_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
      writeFileSync(tmp, JSON.stringify(cache, null, 2));
      renameSync(tmp, SESSION_CACHE_PATH);
    } catch {}
  });
}

function recallSession(sessionId) {
  if (!sessionId) return null;
  const cache = loadSessionCache();
  return cache[sessionId] || null;
}

function pathUnderHome(value) {
  if (typeof value !== 'string') return false;
  const homeNorm = normalizePathSlashes(HOME);
  const valueNorm = normalizePathSlashes(value);
  return valueNorm === homeNorm || valueNorm.startsWith(`${homeNorm}/`);
}

function collectPathStrings(value, out = []) {
  if (typeof value === 'string') {
    if (pathUnderHome(value) && !isCursorMetadataPath(value)) out.push(value);
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
  const normalized = normalizePathSlashes(dirPath).replace(/\/+$/, '');
  if (!normalized) return 'unknown-project';

  const claudeWt = normalized.match(/^(.*?)\/\.claude\/worktrees\/[^/]+$/i);
  if (claudeWt?.[1]) return cleanRepoName(claudeWt[1]);

  const baseName = basename(normalized);
  if (/^agent-[a-f0-9]{6,}$/i.test(baseName)) {
    const parent = dirname(normalized);
    if (parent && parent !== normalized && parent !== '.' && parent !== '/') {
      return cleanRepoName(parent);
    }
  }

  let name = baseName.replace(/(-worktree-\d+|-worktree|-[a-f0-9]{7,40})$/i, '');
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

  const chunk = normalizePathSlashes(readFileSync(transcriptFile, 'utf-8').slice(0, 250000));
  const escapedHome = normalizePathSlashes(HOME).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escapedHome}[^\\s"'\\\\]+`, 'g');
  const counts = new Map();

  for (const match of chunk.match(re) || []) {
    if (isCursorMetadataPath(match)) continue;
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

export function readHookStdinComplete(maxWaitMs = 30000) {
  return new Promise((resolve) => {
    let input = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        process.stdin.destroy();
      } catch {}
      resolve(input);
    };
    const t = setTimeout(finish, maxWaitMs);
    if (t.unref) t.unref();
    process.stdin.on('data', (c) => {
      input += c;
    });
    process.stdin.on('end', () => {
      clearTimeout(t);
      finish();
    });
    process.stdin.on('error', () => {
      clearTimeout(t);
      finish();
    });
  });
}

const HOOK_PAYLOAD_DIR = join(HOME, '.cursor', 'hooks', '.am-hook-payloads');

export function writeHookPayloadTemp(input) {
  mkdirSync(HOOK_PAYLOAD_DIR, { recursive: true });
  try {
    chmodSync(HOOK_PAYLOAD_DIR, 0o700);
  } catch {}
  const path = join(HOOK_PAYLOAD_DIR, `am-hook-${process.pid}-${Date.now()}.json`);
  writeFileSync(path, input, { encoding: 'utf-8', mode: 0o600 });
  return path;
}

export function readWorkerHookPayload() {
  const file = process.env.AM_HOOK_INPUT_FILE;
  if (!file) {
    console.error('[agentmemory] missing AM_HOOK_INPUT_FILE in worker');
    return null;
  }
  try {
    const raw = readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[agentmemory] failed to parse hook payload:', err.message);
    return null;
  } finally {
    try {
      unlinkSync(file);
    } catch {}
  }
}

export function spawnDetachedHookWorker(scriptUrl, input) {
  const payloadFile = writeHookPayloadTemp(input);
  const child = spawn(process.execPath, [fileURLToPath(scriptUrl)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      AM_HOOK_WORKER: '1',
      AM_HOOK_INPUT_FILE: payloadFile
    }
  });
  child.unref();

  const bail = setTimeout(() => process.exit(0), 2000);
  if (bail.unref) bail.unref();
  child.on('spawn', () => process.exit(0));
  child.on('error', (err) => {
    console.error('[agentmemory] failed to spawn hook worker:', err.message);
    try {
      unlinkSync(payloadFile);
    } catch {}
    process.exit(0);
  });
}

export async function runDetachedHookParent(scriptUrl) {
  const input = await readHookStdinComplete();
  spawnDetachedHookWorker(scriptUrl, input);
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
