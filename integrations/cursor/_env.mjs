/**
 * Shared configuration loading for the Cursor integration scripts.
 *
 * The documented contract for agentmemory is that `AGENTMEMORY_URL` and
 * `AGENTMEMORY_SECRET` come from the runtime environment, with
 * `~/.agentmemory/.env` as the persistent default. These scripts end and
 * rewrite sessions on whatever host they are pointed at, so reading the file
 * only -- and ignoring an explicit `AGENTMEMORY_URL=... node ...` -- would
 * quietly aim a destructive operation at the wrong server.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENV_PATH = join(homedir(), '.agentmemory', '.env');

export function parseEnvFile(path = ENV_PATH) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

/** Runtime environment first, `~/.agentmemory/.env` second, '' if neither. */
export function loadConfig(keys, path = ENV_PATH) {
  const file = parseEnvFile(path);
  const out = {};
  for (const key of keys) {
    const fromEnv = process.env[key]?.trim();
    out[key] = fromEnv || file[key] || '';
  }
  return out;
}

/** loadConfig for the two keys every script needs, with a uniform error. */
export function requireConnection(path = ENV_PATH) {
  const { AGENTMEMORY_URL: url, AGENTMEMORY_SECRET: secret } = loadConfig(
    ['AGENTMEMORY_URL', 'AGENTMEMORY_SECRET'],
    path
  );
  if (!url || !secret) {
    console.error(
      `Missing AGENTMEMORY_URL / AGENTMEMORY_SECRET. Set them in the environment or in ${path}.`
    );
    process.exit(1);
  }
  return { url, secret };
}
