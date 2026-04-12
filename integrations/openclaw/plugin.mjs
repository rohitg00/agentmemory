/**
 * agentmemory plugin for OpenClaw gateway
 *
 * Hooks into the OpenClaw agent loop:
 * - onSessionStart: starts a session on the memory server and injects any returned context
 * - onPreLlmCall:   injects token-budgeted memories before each LLM call
 * - onPostToolUse:  records every tool use, error, and decision after execution
 * - onSessionEnd:   marks the session complete for downstream compression
 *
 * Requires the agentmemory server running on localhost:3111.
 * Start it with: npx @agentmemory/agentmemory
 */

const DEFAULT_BASE_URL = "http://localhost:3111";
const DEFAULT_TIMEOUT_MS = 5000;

export class AgentmemoryPlugin {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.baseUrl = config.base_url ?? DEFAULT_BASE_URL;
    this.tokenBudget = config.token_budget ?? 2000;
    this.minConfidence = config.min_confidence ?? 0.5;
    this.fallbackOnError = config.fallback_on_error !== false;
    this.timeoutMs = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.secret = process.env.AGENTMEMORY_SECRET;
  }

  get name() {
    return "agentmemory";
  }

  async postJson(path, payload) {
    const headers = { "Content-Type": "application/json" };
    if (this.secret) headers["Authorization"] = `Bearer ${this.secret}`;

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        if (this.fallbackOnError) return null;
        const body = await res.text().catch(() => "");
        throw new Error(
          `agentmemory POST ${path} failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
        );
      }
      return await res.json();
    } catch (err) {
      if (!this.fallbackOnError) throw err;
      return null;
    }
  }

  async onSessionStart(ctx) {
    if (!this.enabled) return;
    const result = await this.postJson("/agentmemory/session/start", {
      sessionId: ctx.sessionId,
      project: ctx.project || ctx.cwd,
      cwd: ctx.cwd,
    });
    if (result?.context) ctx.injectContext(result.context);
  }

  async onPreLlmCall(ctx) {
    if (!this.enabled) return;
    const result = await this.postJson("/agentmemory/context", {
      sessionId: ctx.sessionId,
      project: ctx.project || ctx.cwd,
      budget: this.tokenBudget,
    });
    if (result?.context) ctx.injectContext(result.context);
  }

  async onPostToolUse(ctx) {
    if (!this.enabled) return;
    await this.postJson("/agentmemory/observe", {
      hookType: "post_tool_use",
      sessionId: ctx.sessionId,
      timestamp: new Date().toISOString(),
      data: {
        tool_name: ctx.toolName,
        tool_input: ctx.toolInput,
        tool_output: ctx.toolOutput,
      },
    });
  }

  async onSessionEnd(ctx) {
    if (!this.enabled) return;
    await this.postJson("/agentmemory/session/end", { sessionId: ctx.sessionId });
  }
}

export default AgentmemoryPlugin;
