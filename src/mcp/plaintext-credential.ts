const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizedHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function usesPlaintextCredential(
  baseUrl: string,
  credential?: string,
): boolean {
  if (!credential) return false;
  try {
    const parsed = new URL(baseUrl);
    return (
      parsed.protocol === "http:" &&
      !LOOPBACK_HOSTS.has(normalizedHostname(parsed.hostname))
    );
  } catch {
    return false;
  }
}

function plaintextCredentialMessage(baseUrl: string): string {
  return `agentmemory: an AGENTMEMORY_SECRET or AGENTMEMORY_CALLER_TOKEN credential is configured for plaintext HTTP to ${baseUrl}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel.`;
}

export function createPlaintextCredentialGuard(
  warn: (message: string) => void = (message) => console.warn(message),
  env?: { AGENTMEMORY_REQUIRE_HTTPS?: string },
): (baseUrl: string, credential?: string) => void {
  let warned = false;
  return (baseUrl, credential) => {
    if (!usesPlaintextCredential(baseUrl, credential)) return;
    const message = plaintextCredentialMessage(baseUrl);
    if ((env ?? process.env).AGENTMEMORY_REQUIRE_HTTPS === "1") {
      throw new Error(message);
    }
    if (!warned) {
      warned = true;
      warn(message);
    }
  };
}
