/**
 * agentmemory plugin for OpenClaw
 *
 * Deeper integration than raw MCP:
 * - claims the plugins.slots.memory slot via api.registerMemoryCapability({ promptBuilder })
 * - recalls relevant memories before the agent starts (before_agent_start hook)
 * - captures completed conversation turns after the agent finishes (agent_end hook)
 *
 * Requires a reachable agentmemory REST server.
 */

const DEFAULT_BASE_URL = "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 5000;
const TURN_DEDUPE_TTL_MS = 10 * 60 * 1000;
const TURN_DEDUPE_MAX_ENTRIES = 1000;
const turnDedupeStateKey = Symbol.for("agentmemory.openclaw.turn-dedupe");

const configSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    base_url: { type: "string" },
    token_budget: { type: "number" },
    min_confidence: { type: "number" },
    fallback_on_error: { type: "boolean" },
    timeout_ms: { type: "number" },
  },
};

function extractText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((block) => extractText(block)).filter(Boolean).join("\n").trim();
  }
  if (!content || typeof content !== "object") return "";
  return firstNonEmptyString(
    extractText(content.text),
    extractText(content.content),
    extractText(content.message),
    extractText(content.output),
    extractText(content.value),
  );
}

function extractStructuredText(value) {
  return extractText(value);
}

function messageText(message) {
  if (!message || typeof message !== "object") return "";
  return extractStructuredText(message);
}

function lastAssistantText(messages) {
  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object") continue;
    if (message.role !== "assistant") continue;
    const text = messageText(message);
    if (text) return text;
  }
  return "";
}

function latestUserText(messages) {
  for (const message of [...messages].reverse()) {
    if (!message || typeof message !== "object") continue;
    if (message.role !== "user") continue;
    const text = messageText(message);
    if (text) return text;
  }
  return "";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function getTurnDedupeState() {
  const root = globalThis;
  if (!root[turnDedupeStateKey]) {
    root[turnDedupeStateKey] = {
      recalls: new Map(),
      observations: new Map(),
    };
  }
  return root[turnDedupeStateKey];
}

function pruneDedupeMap(map) {
  const cutoff = Date.now() - TURN_DEDUPE_TTL_MS;
  for (const [key, timestamp] of map.entries()) {
    if (typeof timestamp !== "number" || timestamp < cutoff) map.delete(key);
  }
  while (map.size > TURN_DEDUPE_MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
}

function claimDedupe(map, key) {
  pruneDedupeMap(map);
  if (map.has(key)) return false;
  map.set(key, Date.now());
  return true;
}

function compactDedupeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function resolveProjectContext(event, ctx) {
  const cwd =
    firstNonEmptyString(
      event?.cwd,
      event?.workspaceDir,
      ctx?.workspaceDir,
      process.cwd?.(),
    ) || "openclaw";
  return {
    project: firstNonEmptyString(event?.project, ctx?.project, cwd) || cwd,
    cwd,
  };
}

function isInternalNoReplyTurn(event, ctx, userText, assistantText) {
  const sessionKey = firstNonEmptyString(
    event?.sessionKey,
    ctx?.sessionKey,
    event?.sessionId,
    ctx?.sessionId,
  ).toLowerCase();
  if (sessionKey.includes("boot")) return true;
  if (assistantText.trim() === "NO_REPLY") return true;
  return (
    userText.includes("<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>") &&
    userText.includes("BOOT.md")
  );
}

function turnKeys(event, ctx) {
  const keys = [
    event?.runId,
    ctx?.runId,
    event?.sessionId,
    ctx?.sessionId,
    event?.sessionKey,
    ctx?.sessionKey,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim());
  return [...new Set(keys)];
}

function turnDedupeKey(event, ctx, kind, userText, assistantText = "") {
  const keys = turnKeys(event, ctx);
  return [
    kind,
    keys.length ? keys.join("|") : "no-turn-key",
    compactDedupeText(userText),
    compactDedupeText(assistantText),
  ].join("::");
}

function prunePendingTurns(pendingTurns) {
  if (pendingTurns.size <= 200) return;
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, turn] of pendingTurns.entries()) {
    if (!turn?.updatedAt || turn.updatedAt < cutoff) pendingTurns.delete(key);
  }
}

function readPendingTurn(pendingTurns, event, ctx) {
  for (const key of turnKeys(event, ctx)) {
    const turn = pendingTurns.get(key);
    if (turn) return turn;
  }
  return {};
}

function rememberTurn(pendingTurns, event, ctx, patch) {
  const keys = turnKeys(event, ctx);
  if (keys.length === 0) return;
  const current = readPendingTurn(pendingTurns, event, ctx);
  const next = { ...current, ...patch, updatedAt: Date.now() };
  for (const key of keys) pendingTurns.set(key, next);
  prunePendingTurns(pendingTurns);
}

function forgetTurn(pendingTurns, event, ctx) {
  for (const key of turnKeys(event, ctx)) pendingTurns.delete(key);
}

async function observeConversation(client, event, ctx, userText, assistantText) {
  if (isInternalNoReplyTurn(event, ctx, userText, assistantText)) {
    return false;
  }
  const dedupe = getTurnDedupeState();
  if (
    !claimDedupe(
      dedupe.observations,
      turnDedupeKey(event, ctx, "observe", userText, assistantText),
    )
  ) {
    return false;
  }
  const projectContext = resolveProjectContext(event, ctx);
  const sessionId =
    event?.sessionId ||
    ctx?.sessionId ||
    event?.sessionKey ||
    ctx?.sessionKey ||
    event?.runId ||
    ctx?.runId ||
    `openclaw-${Date.now()}`;
  await client.postJson("/agentmemory/observe", {
    hookType: "post_tool_use",
    sessionId,
    ...projectContext,
    timestamp: new Date().toISOString(),
    data: {
      tool_name: "conversation",
      tool_input: userText.slice(0, 1000),
      tool_output: assistantText.slice(0, 4000),
    },
  });
  return true;
}

function formatResults(results) {
  if (!Array.isArray(results) || results.length === 0) return "";
  return results
    .slice(0, 5)
    .map((result, index) => {
      const obs = result?.observation ?? result ?? {};
      const title = (obs.title || `Memory ${index + 1}`).trim();
      const narrative = (obs.narrative || "").trim();
      const type = (obs.type || "memory").trim();
      return `- ${title} (${type})${narrative ? `: ${narrative}` : ""}`;
    })
    .join("\n");
}

function createClient(cfg, api) {
  const baseUrl = String(cfg.base_url || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = Number(cfg.timeout_ms || DEFAULT_TIMEOUT_MS);
  const fallbackOnError = cfg.fallback_on_error !== false;

  async function postJson(path, payload) {
    // OpenClaw's local agentmemory integration uses a loopback Docker-managed
    // service. Do not read process.env or attach bearer tokens here; that keeps
    // the plugin out of OpenClaw's environment-harvesting audit path.
    const headers = { "Content-Type": "application/json" };
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        if (fallbackOnError) return null;
        const body = await res.text().catch(() => "");
        throw new Error(`agentmemory ${path} failed: ${res.status} ${body}`);
      }
      return await res.json();
    } catch (error) {
      if (!fallbackOnError) throw error;
      api.logger.warn?.(`agentmemory: ${String(error)}`);
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
      base_url: api.pluginConfig?.base_url || DEFAULT_BASE_URL,
      token_budget: api.pluginConfig?.token_budget || 2000,
      min_confidence: api.pluginConfig?.min_confidence || 0.5,
      fallback_on_error: api.pluginConfig?.fallback_on_error !== false,
      timeout_ms: api.pluginConfig?.timeout_ms || DEFAULT_TIMEOUT_MS,
    };
    const client = createClient(cfg, api);
    const pendingTurns = new Map();

    if (typeof api.registerMemoryCapability === "function") {
      api.registerMemoryCapability({
        // OpenClaw passes { availableTools: Set<string>, citationsMode? }. We
        // don't currently branch on tool availability, but accept the params
        // object so the signature matches MemoryPromptSectionBuilder exactly.
        promptBuilder: (_params) => [
          "Long-term memory provider: agentmemory (external REST service on " +
            client.baseUrl +
            ").",
          "agentmemory recalls relevant prior observations before each turn via the before_agent_start hook and captures completed turns via agent_end.",
          "Treat recalled context as background, not authoritative — prefer current workspace state and explicit user instructions when they conflict.",
        ],
      });
    }

    api.on("before_agent_start", async (event, ctx) => {
      if (!cfg.enabled) return;
      const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
      if (!prompt) return;
      rememberTurn(pendingTurns, event, ctx, { prompt });
      const dedupe = getTurnDedupeState();
      if (!claimDedupe(dedupe.recalls, turnDedupeKey(event, ctx, "recall", prompt))) {
        return;
      }
      const result = await client.postJson("/agentmemory/smart-search", {
        query: prompt,
        limit: 5,
      });
      const block = formatResults(result?.results || []);
      if (!block) return;
      return {
        prependContext: `Relevant long-term memory from agentmemory:\n${block}`,
      };
    });

    api.on("llm_output", async (event, ctx) => {
      if (!cfg.enabled) return;
      const assistantText = firstNonEmptyString(
        extractStructuredText(event?.lastAssistant),
        extractStructuredText(event?.assistantText),
        extractStructuredText(event?.assistantTexts),
      );
      if (!assistantText) return;
      const pendingTurn = readPendingTurn(pendingTurns, event, ctx);
      const userText = firstNonEmptyString(
        event?.prompt,
        event?.userText,
        ctx?.prompt,
        pendingTurn.prompt,
      );
      if (userText && !pendingTurn.observed) {
        const observed = await observeConversation(client, event, ctx, userText, assistantText);
        if (observed) {
          rememberTurn(pendingTurns, event, ctx, { assistantText, observed: true });
          return;
        }
      }
      rememberTurn(pendingTurns, event, ctx, { assistantText });
    });

    api.on("agent_end", async (event, ctx) => {
      if (!cfg.enabled) return;
      if (event?.success === false) {
        forgetTurn(pendingTurns, event, ctx);
        return;
      }
      const messages = Array.isArray(event?.messages) ? event.messages : [];
      const pendingTurn = readPendingTurn(pendingTurns, event, ctx);
      if (pendingTurn.observed) {
        forgetTurn(pendingTurns, event, ctx);
        return;
      }
      const userText = firstNonEmptyString(
        latestUserText(messages),
        event?.prompt,
        event?.userText,
        ctx?.prompt,
        pendingTurn.prompt,
      );
      const assistantText = firstNonEmptyString(
        lastAssistantText(messages),
        extractStructuredText(event?.lastAssistant),
        extractStructuredText(event?.assistantText),
        extractStructuredText(event?.assistantTexts),
        pendingTurn.assistantText,
      );
      if (!userText || !assistantText) {
        forgetTurn(pendingTurns, event, ctx);
        return;
      }
      await observeConversation(client, event, ctx, userText, assistantText);
      forgetTurn(pendingTurns, event, ctx);
    });
  },
};

export default plugin;
