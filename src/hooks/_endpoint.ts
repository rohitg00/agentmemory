import { isLoopbackUrl, resolveClientSecret } from "../secret-store.js";

const OPTION_PREFIX = "CLAUDE_PLUGIN_OPTION_";
const DEFAULT_URL = "http://localhost:3111";

export interface HookEndpoint {
  url: string;
  secret: string;
  blocked: boolean;
}

export function hookSetting(
  name: "AGENTMEMORY_URL" | "AGENTMEMORY_SECRET",
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const optionKey = `${OPTION_PREFIX}${name}`;
  if (optionKey in env) {
    const option = env[optionKey]?.trim();
    return option ? option : undefined;
  }
  return env[name];
}

export function secretTransportAllowed(url: string): boolean {
  try {
    return new URL(url).protocol === "https:" || isLoopbackUrl(url);
  } catch {
    return false;
  }
}

export function resolveHookEndpoint(env: NodeJS.ProcessEnv = process.env): HookEndpoint {
  const url = hookSetting("AGENTMEMORY_URL", env) || DEFAULT_URL;
  const secretEnv: NodeJS.ProcessEnv = { ...env };
  const explicit = hookSetting("AGENTMEMORY_SECRET", env);
  if (explicit === undefined) delete secretEnv["AGENTMEMORY_SECRET"];
  else secretEnv["AGENTMEMORY_SECRET"] = explicit;
  const secret = resolveClientSecret(url, secretEnv);
  const blocked = Boolean(secret) && !secretTransportAllowed(url);
  return { url, secret: blocked ? "" : secret, blocked };
}

let blockedNoticeShown = false;

export function reportBlockedTransport(endpoint: HookEndpoint): boolean {
  if (!endpoint.blocked) return false;
  if (!blockedNoticeShown) {
    blockedNoticeShown = true;
    process.stderr.write(
      "[agentmemory] AGENTMEMORY_URL must use HTTPS when a secret is set, except for loopback URLs. Nothing was sent.\n",
    );
  }
  return true;
}

export function hookAuthHeaders(endpoint: HookEndpoint): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (endpoint.secret) h["Authorization"] = `Bearer ${endpoint.secret}`;
  return h;
}
