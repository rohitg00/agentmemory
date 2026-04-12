/**
 * agentmemory plugin for OpenClaw gateway
 *
 * Hooks into the OpenClaw agent loop to:
 * - Inject relevant memories before each LLM call (prefetch)
 * - Capture every tool use as an observation (capture)
 * - Compress raw observations into structured memory at session end (consolidate)
 *
 * Requires the agentmemory server running on localhost:3111.
 * Start it with: npx @agentmemory/agentmemory
 */

const DEFAULT_BASE_URL = "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 5000;

export class AgentmemoryPlugin {
  constructor(config = {}) {
    this.baseUrl = config.base_url || DEFAULT_BASE_URL;
    this.tokenBudget = config.token_budget || 2000;
    this.minConfidence = config.min_confidence || 0.5;
    this.fallbackOnError = config.fallback_on_error !== false;
    this.timeoutMs = config.timeout_ms || DEFAULT_TIMEOUT_MS;
    this.secret = process.env.AGENTMEMORY_SECRET;
  }

  get name() {
    return "agentmemory";
  }

  headers() {
    const h = { "Content-Type": "application/json" };
    if (this.secret) {
      h["Authorization"] = `Bearer ${this.secret}`;
    }
    return h;
  }

  async fetchJson(path, init = {}) {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers || {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      if (!this.fallbackOnError) throw err;
      return null;
    }
  }

  async onSessionStart(ctx) {
    const result = await this.fetchJson("/agentmemory/session/start", {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        project: ctx.project || ctx.cwd,
        cwd: ctx.cwd,
      }),
    });
    if (result?.context) {
      ctx.injectContext(result.context);
    }
  }

  async onPreLlmCall(ctx) {
    const result = await this.fetchJson("/agentmemory/context", {
      method: "POST",
      body: JSON.stringify({
        sessionId: ctx.sessionId,
        query: ctx.userMessage || "",
        tokenBudget: this.tokenBudget,
        minConfidence: this.minConfidence,
      }),
    });
    if (result?.context) {
      ctx.injectContext(result.context);
    }
  }

  async onPostToolUse(ctx) {
    await this.fetchJson("/agentmemory/observe", {
      method: "POST",
      body: JSON.stringify({
        hookType: "post_tool_use",
        sessionId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        data: {
          tool_name: ctx.toolName,
          tool_input: ctx.toolInput,
          tool_output: ctx.toolOutput,
        },
      }),
    });
  }

  async onSessionEnd(ctx) {
    await this.fetchJson("/agentmemory/session/end", {
      method: "POST",
      body: JSON.stringify({ sessionId: ctx.sessionId }),
    });
  }
}

export default AgentmemoryPlugin;
