const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizedHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function usesPlaintextBearerAuth(baseUrl: string, secret?: string): boolean {
  if (!secret) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(normalizedHostname(parsed.hostname));
  } catch {
    return false;
  }
}

export function plaintextBearerAuthMessage(baseUrl: string): string {
  return `agentmemory: AGENTMEMORY_SECRET is configured for plaintext HTTP to ${baseUrl}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel.`;
}

export function createPlaintextBearerAuthGuard(
  warn: (message: string) => void = (message) => console.warn(message),
  env?: { AGENTMEMORY_REQUIRE_HTTPS?: string },
): (baseUrl: string, secret?: string) => void {
  let warned = false;
  return (baseUrl, secret) => {
    if (!usesPlaintextBearerAuth(baseUrl, secret)) return;
    const message = plaintextBearerAuthMessage(baseUrl);
    if ((env || process.env).AGENTMEMORY_REQUIRE_HTTPS === "1") throw new Error(message);
    if (!warned) {
      warned = true;
      warn(message);
    }
  };
}
