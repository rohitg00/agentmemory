import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function usableSecret(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || (trimmed.startsWith("${") && trimmed.endsWith("}"))) return "";
  return trimmed;
}

function readAgentmemoryFile(name: string): string {
  try {
    return readFileSync(join(homedir(), ".agentmemory", name), "utf-8");
  } catch {
    return "";
  }
}

function envFileSecret(): string {
  let found = "";
  for (const line of readAgentmemoryFile(".env").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq).replace(/^export\s+/, "").trim() !== "AGENTMEMORY_SECRET") continue;
    let value = trimmed.slice(eq + 1).trim();
    const quote = value[0];
    const close = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
    if (close > 0) value = value.slice(1, close);
    else if (value.includes(" #")) value = value.slice(0, value.indexOf(" #"));
    found = usableSecret(value);
  }
  return found;
}

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export function resolveSecret(url: string, explicit?: string): string {
  const configured = usableSecret(explicit);
  if (configured) return configured;
  if (process.env.AGENTMEMORY_CREDENTIAL_MODE === "explicit" || !isLoopbackUrl(url)) return "";
  return envFileSecret() || usableSecret(readAgentmemoryFile("secret"));
}

export function usesPlaintextBearerAuth(baseUrl: string, secret?: string): boolean {
  if (!secret) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" && !isLoopbackUrl(baseUrl);
  } catch {
    return false;
  }
}

export function guardPlaintextBearerAuth(baseUrl: string, secret?: string): void {
  if (usesPlaintextBearerAuth(baseUrl, secret)) {
    throw new Error("agentmemory: refusing to send AGENTMEMORY_SECRET over remote HTTP. Use HTTPS or an SSH tunnel to a loopback address.");
  }
}
