import {
  chmodSync,
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const SECRET_KEY = "AGENTMEMORY_SECRET";

export function agentmemoryHomeDir(): string {
  return join(homedir(), ".agentmemory");
}

export function secretFilePath(): string {
  return join(agentmemoryHomeDir(), "secret");
}

function usable(value: string | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("${") && trimmed.endsWith("}")) return "";
  return trimmed;
}

function unquote(value: string): string {
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1) {
    const close = value.indexOf(quote, 1);
    if (close !== -1) return value.slice(1, close);
  }
  const hash = value.indexOf(" #");
  return hash === -1 ? value : value.slice(0, hash).trim();
}

export function readEnvFileSecret(): string {
  let content: unknown;
  try {
    content = readFileSync(join(agentmemoryHomeDir(), ".env"), "utf-8");
  } catch {
    return "";
  }
  if (typeof content !== "string") return "";
  let found = "";
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).replace(/^export\s+/, "").trim();
    if (key !== SECRET_KEY) continue;
    found = usable(unquote(trimmed.slice(eq + 1).trim()));
  }
  return found;
}

export function readStoredSecret(): string {
  try {
    return usable(readFileSync(secretFilePath(), "utf-8"));
  } catch {
    return "";
  }
}

export function explicitSecret(env: NodeJS.ProcessEnv = process.env): string {
  return usable(env[SECRET_KEY]) || readEnvFileSecret();
}

export function isLoopbackUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const bare = hostname.replace(/^\[|\]$/g, "");
  return bare === "localhost" || bare === "::1" || /^127(?:\.\d{1,3}){3}$/.test(bare);
}

export function resolveClientSecret(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = usable(env[SECRET_KEY]);
  if (fromEnv) return fromEnv;
  if (!isLoopbackUrl(baseUrl)) return "";
  return readEnvFileSecret() || readStoredSecret();
}

export function ensureServerSecret(env: NodeJS.ProcessEnv = process.env): {
  secret: string;
  source: "env" | "file" | "generated";
} {
  const configured = explicitSecret(env);
  if (configured) return { secret: configured, source: "env" };
  const stored = readStoredSecret();
  if (stored) return { secret: stored, source: "file" };
  const generated = randomBytes(32).toString("hex");
  const path = secretFilePath();
  mkdirSync(agentmemoryHomeDir(), { recursive: true, mode: 0o700 });
  const staging = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const fd = openSync(staging, "wx", 0o600);
  try {
    writeSync(fd, `${generated}\n`);
  } finally {
    closeSync(fd);
  }
  try {
    chmodSync(staging, 0o600);
    linkSync(staging, path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const raced = readStoredSecret();
    if (!raced) throw err;
    return { secret: raced, source: "file" };
  } finally {
    try {
      unlinkSync(staging);
    } catch {}
  }
  return { secret: generated, source: "generated" };
}

export function bearerHeaders(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const secret = resolveClientSecret(baseUrl, env);
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
