// The credential seam.
//
// Everything that needs an OrcaRouter key asks this module, and the module
// always returns the same thing: an `OrcaRouterCredential`. There are two
// adapters that produce one — a pasted `sk-orca-…` key, and an OAuth 2.0 +
// PKCE login — and nothing downstream of `resolveCredential()` can tell (or
// needs to tell) which one it was, because both yield an ordinary OrcaRouter
// API key.
//
// The key lives where the project already keeps provider secrets:
// `~/.agentmemory/.env`, mode 0600, merged into the process env by
// `getMergedEnv()`. No second credential store, no keychain, no plaintext side
// file.

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { getEnvVar, __resetEnvFileCache } from "../config.js";
import { OrcaRouterAuthError } from "./pkce.js";

/** Env var holding the key. Follows the repo's `<PROVIDER>_API_KEY` idiom. */
export const ORCA_API_KEY_ENV = "ORCAROUTER_API_KEY";
/** Env var holding the model override. */
export const ORCA_MODEL_ENV = "ORCAROUTER_MODEL";

const DATA_DIR = join(homedir(), ".agentmemory");
const ENV_FILE = join(DATA_DIR, ".env");

/** Which adapter produced a credential. Diagnostics only — never a branch. */
export type CredentialOrigin = "api_key" | "pkce" | "env";

/**
 * A usable OrcaRouter credential. Both adapters return this exact shape; the
 * provider, the model catalog, and every AI entry point consume it without
 * knowing which path minted it.
 */
export interface OrcaRouterCredential {
  /** The `sk-orca-…` key. Never log, never serialize to a browser. */
  apiKey: string;
  origin: CredentialOrigin;
  /** `needsReauth` credentials are retained but must not be used. */
  status: "ok" | "needsReauth";
  /**
   * Monotonic per-account generation. A late 401 from a request issued under
   * generation N must never mark generation N+1 as broken.
   */
  generation: number;
  /** OrcaRouter user id when known (the PKCE exchange reports it). */
  userId?: string;
  /** Granted scope when known. */
  scope?: string;
  /** Why the credential needs reauthentication, when it does. */
  needsReauthReason?: string;
}

/**
 * Lifecycle metadata persisted in `~/.agentmemory/.env` under
 * ORCAROUTER_CREDENTIAL_STATE.
 *
 * Deliberately does NOT contain the key. The key has exactly one home —
 * ORCAROUTER_API_KEY, the same line every other provider uses — so revoking or
 * rotating it cannot leave a stale copy behind in a second field.
 */
export interface StoredCredentialState {
  origin: CredentialOrigin;
  generation: number;
  userId?: string;
  scope?: string;
  needsReauth: boolean;
  needsReauthReason?: string;
  updatedAt?: string;
}

/**
 * Show enough of a secret to recognise it, never enough to use it. Used
 * anywhere a key could otherwise reach a log line, an error body, or the
 * viewer UI.
 */
export function maskSecret(secret: string | undefined | null): string {
  if (!secret) return "";
  const trimmed = secret.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STATE_KEY = "ORCAROUTER_CREDENTIAL_STATE";

interface FileState {
  credential?: StoredCredentialState;
  /** Last successfully fetched catalog, so an outage keeps a real list. */
  lastKnownGoodCatalog?: unknown;
  lastKnownGoodCatalogAt?: number;
}

/** The secret directory is created on first write, never lazily on read. */
function ensureStoreDir(): void {
  mkdirSync(dirname(ENV_FILE), { recursive: true });
}

function readEnvFileRaw(): string {
  try {
    // The parsed file is memoized for the process lifetime, so drop the cache
    // before reading: a write made moments ago must be visible to the read
    // that follows it, or "save the key" would need a restart to take effect.
    __resetEnvFileCache();
    return existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";
  } catch {
    return "";
  }
}

/** Forget the memoized .env so the next `getEnvVar()` re-reads from disk. */
function invalidateEnvCache(): void {
  __resetEnvFileCache();
}

function parseFileState(): FileState {
  const raw = getEnvVar(STATE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as FileState) : {};
  } catch {
    // A corrupt state blob must not make the provider unusable: fall back to
    // "no credential" so the user is asked to reconnect.
    return {};
  }
}

/**
 * Upsert a single `KEY=value` line in `~/.agentmemory/.env`, preserving every
 * other line and comment. Returns true when the file changed.
 *
 * The file is created 0600 and re-chmodded on every write so an existing
 * world-readable file is tightened rather than inherited.
 */
export function upsertEnvVar(key: string, value: string): boolean {
  const content = readEnvFileRaw();
  const lines = content.length > 0 ? content.split("\n") : [];
  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map((line) => {
    if (line.trim().startsWith("#")) return line;
    if (line.trim().startsWith(prefix)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) {
    // Drop a single trailing empty line so repeated upserts don't grow the
    // file with blank lines.
    while (next.length > 0 && next[next.length - 1] === "") next.pop();
    next.push(`${key}=${value}`, "");
  }

  ensureStoreDir();
  writeFileSync(ENV_FILE, next.join("\n"), { mode: 0o600 });
  try {
    chmodSync(ENV_FILE, 0o600);
  } catch {
    /* best effort — the mode above already applies on create */
  }
  invalidateEnvCache();
  return true;
}

/** Remove a `KEY=...` line entirely. Returns true when something was removed. */
export function removeEnvVar(key: string): boolean {
  const content = readEnvFileRaw();
  if (!content) return false;
  const prefix = `${key}=`;
  const lines = content.split("\n");
  const next = lines.filter(
    (line) => !(!line.trim().startsWith("#") && line.trim().startsWith(prefix)),
  );
  if (next.length === lines.length) return false;
  ensureStoreDir();
  writeFileSync(ENV_FILE, next.join("\n"), { mode: 0o600 });
  try {
    chmodSync(ENV_FILE, 0o600);
  } catch {
    /* best effort */
  }
  invalidateEnvCache();
  return true;
}

function writeFileState(state: FileState): void {
  upsertEnvVar(STATE_KEY, JSON.stringify(state));
}

/**
 * In-process override for the tests and for a caller that just minted a
 * credential and does not want to re-read the file it wrote.
 */
let current: StoredCredentialState | null | undefined;

export function __resetCredentialCache(): void {
  current = undefined;
}

// ---------------------------------------------------------------------------
// The seam
// ---------------------------------------------------------------------------

/**
 * Resolve the current credential.
 *
 * Precedence: a credential this process already established (either adapter
 * wrote one) → a bare `ORCAROUTER_API_KEY` from the environment or `.env`,
 * which is the pattern users already have for every other provider.
 */
export function resolveCredential(): OrcaRouterCredential | null {
  if (current === undefined) {
    current = parseFileState().credential ?? null;
  }

  const apiKey = readEnvApiKey();
  if (!apiKey) return null;

  // Lifecycle metadata is only meaningful alongside the key it describes. A
  // key pasted straight into the environment has no recorded generation, so it
  // is generation 0 — old enough that a late 401 can still mark it.
  if (!current) {
    return { apiKey, origin: "env", status: "ok", generation: 0 };
  }

  return {
    apiKey,
    origin: current.origin,
    status: current.needsReauth ? "needsReauth" : "ok",
    generation: current.generation,
    userId: current.userId,
    scope: current.scope,
    needsReauthReason: current.needsReauthReason,
  };
}

function readEnvApiKey(): string | null {
  const value = getEnvVar(ORCA_API_KEY_ENV);
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Look like an OrcaRouter key. A prefix check catches typos (a pasted
 * OpenRouter `sk-or-…` key, a trailing space); it is not proof of validity, so
 * this never claims a key works — the first real request decides.
 */
export function looksLikeOrcaRouterKey(key: string): boolean {
  return /^sk-orca-[A-Za-z0-9_-]{8,}$/.test(key.trim());
}

export interface AuthAdapterResult {
  credential: OrcaRouterCredential;
  /** Safe to display. Never contains the key. */
  message: string;
}

/**
 * Adapter 1 — the user pastes a key they already hold.
 *
 * Persists to the project's existing secret file and returns the same
 * credential shape the PKCE adapter returns.
 */
export function connectWithApiKey(rawKey: string): AuthAdapterResult {
  const apiKey = rawKey.trim();
  if (!apiKey) {
    throw new OrcaRouterAuthError(
      "malformed_response",
      "Enter an OrcaRouter API key to continue.",
    );
  }
  if (!looksLikeOrcaRouterKey(apiKey)) {
    throw new OrcaRouterAuthError(
      "malformed_response",
      `That does not look like an OrcaRouter API key — OrcaRouter keys start with "sk-orca-". ` +
        `Copy one from https://www.orcarouter.ai/console/api-keys.`,
    );
  }

  persist(
    {
      origin: "api_key",
      generation: nextGeneration(),
      needsReauth: false,
      updatedAt: new Date().toISOString(),
    },
    apiKey,
  );

  return {
    credential: resolveCredential()!,
    message: `OrcaRouter API key saved (${maskSecret(apiKey)}).`,
  };
}

function nextGeneration(): number {
  return (parseFileState().credential?.generation ?? 0) + 1;
}

function persist(state: StoredCredentialState, apiKey?: string): void {
  const fileState = parseFileState();
  fileState.credential = state;
  writeFileState(fileState);
  // Write the key with its metadata, never before it: a crash between the two
  // writes must not leave a stored key that no metadata describes.
  if (apiKey) upsertEnvVar(ORCA_API_KEY_ENV, apiKey);
  current = state;
}

/**
 * Record the credential produced by the PKCE adapter.
 *
 * Keeping this separate from `connectWithApiKey` matters for the lifecycle:
 * a login that succeeds must clear a prior `needsReauth`, and it must replace
 * the stored secret only once the new key is in hand — never before.
 */
export function persistPkceCredential(opts: {
  apiKey: string;
  userId?: string;
  scope?: string;
  /** Generation of the credential this login replaces, for logging only. */
  previousGeneration?: number;
}): OrcaRouterCredential {
  persist(
    {
      origin: "pkce",
      generation: nextGeneration(),
      userId: opts.userId,
      scope: opts.scope,
      needsReauth: false,
      updatedAt: new Date().toISOString(),
    },
    // Only now — after the exchange returned a real key — is the previously
    // stored secret replaced. A failed login never destroys the old one.
    opts.apiKey,
  );
  return resolveCredential()!;
}

/**
 * Mark a credential as rejected by the relay so the UI stops calling it.
 *
 * Scoped to the exact generation that made the rejected request: a 401 that
 * arrives late from a request issued under an older credential must not mark
 * the credential the user just re-authorized as broken.
 *
 * Returns true when the transition happened.
 */
export function markNeedsReauth(opts: {
  /** Generation observed when the rejected request was issued. */
  generation: number;
  reason: string;
}): boolean {
  const state = parseFileState();
  const stored = state.credential;
  if (!stored) return false;

  const live = resolveCredential();
  if (!live || live.generation !== opts.generation) {
    // A newer credential has already replaced the rejected one. Leave it be —
    // this is what stops a late 401 from poisoning a fresh login.
    return false;
  }
  if (stored.needsReauth) return false;

  stored.needsReauth = true;
  stored.needsReauthReason = opts.reason;
  // Deliberately no key argument: the stored secret is retained, not deleted.
  // Dropping it here would turn a misclassified transient failure into
  // irreversible account loss.
  persist(stored);
  return true;
}

/**
 * Remove the stored credential.
 *
 * The env-var fallback is cleared too: leaving it behind would make "sign out"
 * look broken, because `resolveCredential()` would immediately hand back the
 * old key.
 */
export function clearCredential(): boolean {
  const state = parseFileState();
  const hadState = Boolean(state.credential);
  if (hadState) {
    delete state.credential;
    writeFileState(state);
  }
  const hadEnv = removeEnvVar(ORCA_API_KEY_ENV);
  // Drop the memoized credential too, so a sign-out takes effect in this
  // process without waiting for a restart.
  current = null;
  return hadState || hadEnv;
}

/** True when any credential (either adapter) is available. */
export function hasCredential(): boolean {
  const cred = resolveCredential();
  return Boolean(cred && cred.status === "ok");
}

export function getStoredCredentialState(): StoredCredentialState | null {
  return parseFileState().credential ?? null;
}

// ---------------------------------------------------------------------------
// Last-known-good catalog
// ---------------------------------------------------------------------------

export function readLastKnownGoodCatalog(): { catalog: unknown; at: number } | null {
  const state = parseFileState();
  if (!state.lastKnownGoodCatalog) return null;
  return {
    catalog: state.lastKnownGoodCatalog,
    at: state.lastKnownGoodCatalogAt ?? 0,
  };
}

export function writeLastKnownGoodCatalog(catalog: unknown): void {
  const state = parseFileState();
  state.lastKnownGoodCatalog = catalog;
  state.lastKnownGoodCatalogAt = Date.now();
  writeFileState(state);
}

/** Path of the secret file, for diagnostics. Never contains the key itself. */
export function credentialStorePath(): string {
  return ENV_FILE;
}

export function credentialStoreDir(): string {
  return dirname(ENV_FILE);
}
