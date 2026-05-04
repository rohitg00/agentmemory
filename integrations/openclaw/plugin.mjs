/**
 * agentmemory plugin for OpenClaw
 *
 * Deeper integration than raw MCP:
 * - recalls relevant memories before the agent starts
 * - captures completed conversation turns after the agent finishes
 *
 * Requires the agentmemory server on localhost:3111.
 * Start it with: npx @agentmemory/agentmemory
 */

const DEFAULT_BASE_URL = "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 5000;

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
    const text = extractText(message.content);
    if (text) return text;
  }
  return "";
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
  const secret = process.env.AGENTMEMORY_SECRET;

  async function postJson(path, payload) {
    const headers = { "Content-Type": "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;
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

    api.on("before_agent_start", async (event) => {
      if (!cfg.enabled) return;
      const prompt = typeof event?.prompt === "string" ? event.prompt.trim() : "";
      if (!prompt) return;
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

    api.on("agent_end", async (event) => {
      if (!cfg.enabled || !event?.success || !Array.isArray(event.messages)) return;
      const userText = latestUserText(event.messages);
      const assistantText = lastAssistantText(event.messages);
      if (!userText || !assistantText) return;
      const sessionId =
        event.sessionId ||
        event.sessionKey ||
        event.runId ||
        `openclaw-${Date.now()}`;
      await client.postJson("/agentmemory/observe", {
        hookType: "post_tool_use",
        sessionId,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: "conversation",
          tool_input: userText.slice(0, 1000),
          tool_output: assistantText.slice(0, 4000),
        },
      });
    });
  },
};

export default plugin;
