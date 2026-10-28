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
    const key = trimmed.slice(0, idx).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(idx + 1).trim();
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
    if (quote) {
      const close = value.indexOf(quote, 1);
      if (close !== -1) value = value.slice(1, close);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
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

/** Resolve local credentials without forwarding stored secrets to remote daemons. */
export function requireConnection(path = ENV_PATH) {
  const { AGENTMEMORY_URL: url } = loadConfig(['AGENTMEMORY_URL'], path);
  if (!url) throw new Error(`Missing AGENTMEMORY_URL. Set it in the environment or in ${path}.`);
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('AGENTMEMORY_URL must use HTTP or HTTPS.');
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
  const usable = value => typeof value === 'string' && !value.trim().startsWith('${') ? value.trim() : '';
  let secret = usable(process.env.AGENTMEMORY_SECRET);
  if (!secret && local && process.env.AGENTMEMORY_CREDENTIAL_MODE !== 'explicit') {
    secret = usable(parseEnvFile(path).AGENTMEMORY_SECRET);
    if (!secret) {
      try { secret = usable(readFileSync(join(homedir(), '.agentmemory/secret'), 'utf8')); } catch {}
    }
  }
  if (secret && !local && parsed.protocol !== 'https:') throw new Error('Remote daemon credentials require HTTPS.');
  return { url: url.replace(/\/+$/, ''), secret };
}

/** Bearer header only when a secret is configured. */
export function authHeader(secret) {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
