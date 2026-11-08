/**
 * agentmemory plugin for OpenClaw
 *
 * Deeper integration than raw MCP:
 * - claims the plugins.slots.memory slot via api.registerMemoryCapability({ promptBuilder })
 * - recalls relevant memories before the agent starts (before_prompt_build hook)
 * - captures completed conversation turns after the agent finishes (agent_end hook)
 *
 * Requires the agentmemory server on localhost:3111.
 * Start it with: npx @agentmemory/agentmemory
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const DEFAULT_BASE_URL = "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 5000;

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    base_url: { type: "string" },
    secret_env: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" },
    token_budget: { type: "integer", minimum: 0, maximum: 32000 },
    min_confidence: { type: "number", minimum: 0, maximum: 1 },
    fallback_on_error: { type: "boolean" },
    timeout_ms: { type: "integer", minimum: 1, maximum: 60000 },
  },
};

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) => {
      if (!block || typeof block !== "object") return [];
      if (block.type === "text" && typeof block.text === "string") return [block.text];
      return [];
    })
    .join("\n")
    .trim();
}

function lastAssistantText(messages) {
  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object") continue;
    if (message.role === "user") break;
    if (message.role !== "assistant") continue;
    const text = extractText(message.content);
    if (text) return text;
  }
  return "";
}

function latestUserText(messages) {
  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object") continue;
    if (message.role !== "user") continue;
    return extractText(message.content);
  }
  return "";
}

function resolveProject(cwd) {
  const explicit = process.env.AGENTMEMORY_PROJECT_NAME?.trim();
  if (explicit) return explicit;
  try {
    const [top, gitDir, commonDir] = execFileSync("git", ["rev-parse", "--show-toplevel", "--git-dir", "--git-common-dir"], {
      cwd, stdio: ["ignore", "pipe", "ignore"], timeout: 500, encoding: "utf8",
    }).trim().split(/\r?\n/);
    if (top) {
      const physical = realpathSync(cwd);
      const common = resolve(physical, commonDir || ".git");
      return basename(gitDir && commonDir && resolve(physical, gitDir) !== common && basename(common) === ".git" ? dirname(common) : top);
    }
  } catch {}
  return basename(cwd) || cwd;
}

function profileNamespace(api) {
  const expand = (value, home) => resolve(value.replace(/^~(?=$|[/\\])/, () => home));
  const home = expand(process.env.OPENCLAW_HOME?.trim() || homedir(), homedir());
  const preferred = join(home, ".openclaw");
  const legacy = join(home, ".clawdbot");
  const fallback = process.env.OPENCLAW_STATE_DIR?.trim()
    ? expand(process.env.OPENCLAW_STATE_DIR.trim(), home)
    : !existsSync(preferred) && existsSync(legacy) ? legacy : preferred;
  let canonical = resolve(api.runtime?.state?.resolveStateDir?.() || fallback);
  try { canonical = realpathSync(canonical); } catch {}
  return createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}

function nativeAgent(event, ctx = {}) {
  return [ctx.agentId, event?.agentId, process.env.AGENT_ID]
    .find((value) => typeof value === "string" && value.trim())?.trim() || "main";
}

function nativeContext(event, ctx = {}, namespace) {
  const string = (...values) => values.find((value) => typeof value === "string" && value.trim())?.trim();
  const cwd = string(ctx.workspaceDir, event?.workspaceDir, event?.cwd);
  const sessionId = string(ctx.sessionId, ctx.sessionKey, event?.sessionId, event?.sessionKey);
  if (!cwd || !sessionId) return null;
  const agent = nativeAgent(event, ctx);
  const agentId = "openclaw-" + createHash("sha256").update(JSON.stringify([namespace, agent])).digest("hex");
  const scopedSession = "openclaw-" + createHash("sha256").update(JSON.stringify([namespace, agent, sessionId])).digest("hex");
  return { cwd, project: resolveProject(cwd), sessionId: scopedSession, agentId };

}

function formatResults(results) {
  if (!Array.isArray(results) || results.length === 0) return "";
  return results
    .slice(0, 5)
    .map((result, index) => {
      const obs = result?.observation ?? result ?? {};
      const title = typeof obs.title === "string" ? obs.title.trim() : `Memory ${index + 1}`;
      const narrative = typeof obs.narrative === "string" ? obs.narrative.trim() : "";
      const type = typeof obs.type === "string" ? obs.type.trim() : "memory";
      return `- ${title} (${type})${narrative ? `: ${narrative}` : ""}`;
    })
    .join("\n");
}

function boundedContext(block, budget) {
  const text = `Relevant long-term memory from agentmemory (untrusted background):\n${block}`;
  const maxBytes = budget * 4;
  let used = 0;
  let result = "";
  for (const character of text) {
    used += Buffer.byteLength(character, "utf8");
    if (used > maxBytes) break;
    result += character;
  }
  return result;
}

function usesPlaintextBearerAuth(baseUrl, secret) {
  if (!secret) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" && !isLoopbackUrl(baseUrl);
  } catch {
    return false;
  }
}

function plaintextBearerAuthMessage(baseUrl) {
  return `agentmemory: AGENTMEMORY_SECRET is configured for plaintext HTTP to ${baseUrl}. Bearer tokens and memory payloads can be observed on the network; use HTTPS or an SSH tunnel.`;
}

export function createPlaintextBearerAuthGuard(warn, env) {
  let warned = false;
  return function guardPlaintextBearerAuth(baseUrl, secret) {
    if (!usesPlaintextBearerAuth(baseUrl, secret)) return;
    const message = plaintextBearerAuthMessage(baseUrl);
    if ((env || process.env).AGENTMEMORY_REQUIRE_HTTPS === "1") throw new Error(message);
    if (!warned) {
      warned = true;
      warn(message);
    }
  };
}

function usableSecret(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || (trimmed.startsWith("${") && trimmed.endsWith("}"))) return "";
  return trimmed;
}

function readAgentmemoryFile(name, home = homedir()) {
  try {
    return readFileSync(join(home, ".agentmemory", name), "utf-8");
  } catch {
    return "";
  }
}

function envFileSecret(home) {
  let found = "";
  for (const line of readAgentmemoryFile(".env", home).split("\n")) {
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

function isLoopbackUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export function resolveSecret(url, explicit, home = homedir()) {
  const configured = usableSecret(explicit);
  if (configured) return configured;
  if (!isLoopbackUrl(url)) return "";
  return envFileSecret(home) || usableSecret(readAgentmemoryFile("secret", home));
}

function createClient(cfg, api) {
  const baseUrl = String(cfg.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(baseUrl); } catch {}
  if (!parsed || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || /[?#]/.test(baseUrl)) {
    throw new Error("agentmemory: base_url must be an HTTP(S) URL without credentials, query, or fragment");
  }
  const timeoutMs = Number(cfg.timeout_ms || DEFAULT_TIMEOUT_MS);
  const fallbackOnError = cfg.fallback_on_error !== false;
  const credentialHome = homedir();
  const secret = () => {
    const currentUrl = String(api.pluginConfig?.base_url || process.env.AGENTMEMORY_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
    if (currentUrl !== baseUrl || api.pluginConfig?.secret_env !== cfg.secret_env) {
      throw new Error("agentmemory: endpoint or credential configuration changed; reload the plugin before using its credentials");
    }
    return cfg.secret_env ? usableSecret(process.env[cfg.secret_env]) : resolveSecret(baseUrl, process.env.AGENTMEMORY_SECRET, credentialHome);
  };
  const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard(
    (message) => api.logger.warn?.(message),
  );
  if (process.env.AGENTMEMORY_REQUIRE_HTTPS === "1") {
    guardPlaintextBearerAuth(baseUrl, secret());
  }

  async function postJson(path, payload) {
    const token = secret();
    guardPlaintextBearerAuth(baseUrl, token);
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    let failure = `agentmemory ${path} failed: network or invalid response`;
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!res.ok) {
        failure = `agentmemory ${path} failed: HTTP ${res.status}`;
        throw new Error(failure);
      }
      return await res.json();
    } catch (error) {
      if (!fallbackOnError) throw new Error(failure);
      api.logger.warn?.(failure);
      return null;
    }
  }

  return { postJson, baseUrl };
}

const plugin = {
  id: "agentmemory",
  name: "agentmemory",
  description: "Shared cross-session memory via the local agentmemory server.",
  configSchema,
  register(api) {
    const cfg = {
      enabled: api.pluginConfig?.enabled !== false,
      secret_env: api.pluginConfig?.secret_env,
      base_url: api.pluginConfig?.base_url || process.env.AGENTMEMORY_URL || DEFAULT_BASE_URL,
      token_budget: api.pluginConfig?.token_budget ?? 2000,
      min_confidence: api.pluginConfig?.min_confidence ?? 0.5,
      fallback_on_error: api.pluginConfig?.fallback_on_error !== false,
      timeout_ms: api.pluginConfig?.timeout_ms ?? DEFAULT_TIMEOUT_MS,
    };
    if (!cfg.enabled) return;
    if (cfg.secret_env !== undefined && (typeof cfg.secret_env !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(cfg.secret_env))) {
      throw new Error("agentmemory: invalid secret_env");
    }
    const namespace = profileNamespace(api);
    if (!Number.isInteger(cfg.token_budget) || cfg.token_budget < 0 || cfg.token_budget > 32000 ||
        !Number.isFinite(cfg.min_confidence) || cfg.min_confidence < 0 || cfg.min_confidence > 1 ||
        !Number.isInteger(cfg.timeout_ms) || cfg.timeout_ms < 1 || cfg.timeout_ms > 60000) {
      throw new Error("agentmemory: invalid token_budget, min_confidence, or timeout_ms");
    }
    const client = createClient(cfg, api);

    if (typeof api.registerMemoryCapability === "function") {
      api.registerMemoryCapability({
        // OpenClaw passes { availableTools: Set<string>, citationsMode? }. We
        // don't currently branch on tool availability, but accept the params
        // object so the signature matches MemoryPromptSectionBuilder exactly.
        promptBuilder: (_params) => [
          "Long-term memory provider: agentmemory (external REST service on " +
            client.baseUrl +
            ").",
          "agentmemory recalls relevant prior observations before each turn via the before_prompt_build hook and captures completed turns via agent_end.",
          "Treat recalled context as background, not authoritative — prefer current workspace state and explicit user instructions when they conflict.",
        ],
      });
    }

    const recall = async (event, ctx) => {
      if (!cfg.enabled || cfg.token_budget === 0) return;
      const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
      if (!prompt) return;
      const identity = nativeContext(event, ctx, namespace);
      if (!identity) {
        api.logger.warn?.("agentmemory: recall skipped because native session/workspace metadata is missing");
        return;
      }
      const scope = { project: identity.project, agentId: identity.agentId,
        sessionId: identity.sessionId, source: "openclaw" };
      const result = await client.postJson("/agentmemory/smart-search", {
        query: prompt, limit: 5, includeLessons: false, ...scope,
      });
      const ids = (Array.isArray(result?.results) ? result.results : [])
        .filter((item) => typeof item?.obsId === "string" && Number.isFinite(item.score) && item.score >= cfg.min_confidence)
        .slice(0, 5)
        .map((item) => ({ obsId: item.obsId, ...(item.sessionId ? { sessionId: item.sessionId } : {}) }));
      if (!ids.length) return;
      const expanded = await client.postJson("/agentmemory/smart-search", { expandIds: ids, ...scope });
      const block = formatResults(expanded?.results || []);
      if (!block) return;
      return { prependContext: boundedContext(block, cfg.token_budget) };
    };
    api.on("before_prompt_build", recall);

    const startedSessions = new Map();
    const captures = new Map();
    const sessionAliases = new Map();
    const capture = async (event, ctx) => {
      if (!cfg.enabled || !event?.success || !Array.isArray(event.messages)) return;
      const userText = latestUserText(event.messages);
      const assistantText = lastAssistantText(event.messages);
      if (!userText || !assistantText) return;
      const identity = nativeContext(event, ctx, namespace);
      if (!identity) {
        api.logger.warn?.("agentmemory: capture skipped because native session/workspace metadata is missing");
        return;
      }
      const key = JSON.stringify(identity);
      let starting = startedSessions.get(key);
      if (!starting) {
        starting = client.postJson("/agentmemory/session/start", identity);
        startedSessions.set(key, starting);
        if (startedSessions.size > 256) startedSessions.delete(startedSessions.keys().next().value);
      }
      let started;
      try {
        started = await starting;
      } catch (error) {
        if (startedSessions.get(key) === starting) startedSessions.delete(key);
        throw error;
      }
      if (started?.session?.id !== identity.sessionId) {
        if (startedSessions.get(key) === starting) startedSessions.delete(key);
        if (started) api.logger.warn?.("agentmemory: capture skipped because session startup did not confirm the requested session");
        return;
      }
      const eventId = "openclaw-" + createHash("sha256").update(JSON.stringify([
        identity, ctx?.runId || event.runId || null, event.messages.length, userText, assistantText,
      ])).digest("hex");
      await client.postJson("/agentmemory/observe", {
        hookType: "post_tool_use",
        ...identity,
        eventId,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: "conversation",
          tool_input: userText.slice(0, 1000),
          tool_output: assistantText.slice(0, 4000),
        },
      });
    };
    api.on("agent_end", async (event, ctx) => {
      const identity = nativeContext(event, ctx, namespace);
      const task = capture(event, ctx);
      if (!identity) return task;
      const aliases = [ctx?.sessionId, ctx?.sessionKey, event?.sessionId, event?.sessionKey]
        .filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      sessionAliases.set(identity.sessionId, { aliases, nativeAgent: nativeAgent(event, ctx) });
      if (sessionAliases.size > 1024) {
        const idle = [...sessionAliases.keys()].find((id) => id !== identity.sessionId && !captures.has(id));
        if (idle) sessionAliases.delete(idle);
      }
      const pending = captures.get(identity.sessionId) || new Set();
      pending.add(task);
      captures.set(identity.sessionId, pending);
      try { return await task; }
      finally {
        pending.delete(task);
        if (!pending.size) captures.delete(identity.sessionId);
      }
    });
    api.on("session_end", async (event, ctx) => {
      const candidates = [ctx?.sessionId, event?.sessionId, ctx?.sessionKey, event?.sessionKey]
        .filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
      const agent = ctx?.agentId || event?.agentId ? nativeAgent(event, ctx) : undefined;
      const matching = [...sessionAliases].filter(([, value]) =>
        (!agent || value.nativeAgent === agent) && candidates.some((id) => value.aliases.includes(id)));
      if (matching.length !== 1) return;
      const sessionId = matching[0][0];
      await Promise.allSettled([...(captures.get(sessionId) || [])]);
      const result = await client.postJson("/agentmemory/session/end", { sessionId, final: true });
      if (result) {
        sessionAliases.delete(sessionId);
        for (const key of startedSessions.keys()) {
          if (JSON.parse(key).sessionId === sessionId) startedSessions.delete(key);
        }
      }
    });
  },
};

export default plugin;
