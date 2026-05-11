const DEFAULT_URL = "http://localhost:3111";
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 2_000;
const CALL_TIMEOUT_MS = 15_000;
const LOCAL_MODE_TTL_MS = 30_000;

function probeTimeoutMs(): number {
  const raw = process.env["AGENTMEMORY_PROBE_TIMEOUT_MS"];
  if (!raw) return DEFAULT_HEALTH_PROBE_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_HEALTH_PROBE_TIMEOUT_MS;
}

function forceProxy(): boolean {
  const raw = process.env["AGENTMEMORY_FORCE_PROXY"];
  return raw === "1" || raw === "true";
}

export interface ProxyHandle {
  mode: "proxy";
  baseUrl: string;
  call: (path: string, init?: RequestInit) => Promise<unknown>;
}

export interface LocalHandle {
  mode: "local";
}

export type Handle = ProxyHandle | LocalHandle;

let cached: Handle | null = null;
let cachedAt = 0;
let probeInFlight: Promise<Handle> | null = null;

function baseUrl(): string {
  return (process.env["AGENTMEMORY_URL"] || DEFAULT_URL).replace(/\/+$/, "");
}

function authHeader(): Record<string, string> {
  const secret = process.env["AGENTMEMORY_SECRET"];
  return secret ? { authorization: `Bearer ${secret}` } : {};
}

async function probe(url: string): Promise<boolean> {
  const timeout = probeTimeoutMs();
  try {
    const res = await fetch(`${url}/agentmemory/livez`, {
      method: "GET",
      headers: authHeader(),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      process.stderr.write(
        `[@agentmemory/mcp] livez probe ${url}/agentmemory/livez -> ${res.status} ${res.statusText}; falling back to local InMemoryKV (set AGENTMEMORY_FORCE_PROXY=1 to skip the probe)\n`,
      );
    }
    return res.ok;
  } catch (err) {
    process.stderr.write(
      `[@agentmemory/mcp] livez probe ${url}/agentmemory/livez failed in ${timeout}ms: ${err instanceof Error ? err.message : String(err)}; falling back to local InMemoryKV (set AGENTMEMORY_FORCE_PROXY=1 to skip the probe, or raise AGENTMEMORY_PROBE_TIMEOUT_MS)\n`,
    );
    return false;
  }
}

export function invalidateHandle(): void {
  cached = null;
  cachedAt = 0;
}

export async function resolveHandle(): Promise<Handle> {
  const now = Date.now();
  if (cached) {
    if (cached.mode === "local" && now - cachedAt >= LOCAL_MODE_TTL_MS) {
      cached = null;
      cachedAt = 0;
    } else {
      return cached;
    }
  }
  if (probeInFlight) return probeInFlight;
  const url = baseUrl();
  const skipProbe = forceProxy();
  probeInFlight = (async () => {
    const up = skipProbe ? true : await probe(url);
    if (skipProbe) {
      process.stderr.write(
        `[@agentmemory/mcp] AGENTMEMORY_FORCE_PROXY set; skipping livez probe and trusting ${url}\n`,
      );
    }
    if (up) {
      const handle: ProxyHandle = {
        mode: "proxy",
        baseUrl: url,
        call: async (path, init) => {
          const res = await fetch(`${url}${path}`, {
            ...init,
            headers: {
              "content-type": "application/json",
              ...authHeader(),
              ...(init?.headers as Record<string, string> | undefined),
            },
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
          });
          if (!res.ok) {
            throw new Error(
              `${init?.method || "GET"} ${path} -> ${res.status} ${res.statusText}`,
            );
          }
          const text = await res.text();
          return text ? JSON.parse(text) : null;
        },
      };
      cached = handle;
      cachedAt = Date.now();
      return handle;
    }
    const local: LocalHandle = { mode: "local" };
    cached = local;
    cachedAt = Date.now();
    return local;
  })();
  try {
    return await probeInFlight;
  } finally {
    probeInFlight = null;
  }
}

export function resetHandleForTests(): void {
  cached = null;
  cachedAt = 0;
  probeInFlight = null;
}
