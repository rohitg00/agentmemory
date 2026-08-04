import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import path from "node:path";
import crypto from "node:crypto";
import { createPlaintextBearerAuthGuard } from "./security.js";

type TextBlock = { type?: string; text?: string };
type AssistantMessage = { role?: string; content?: unknown };
type SmartSearchResult = {
  title?: string;
  narrative?: string;
  type?: string;
  combinedScore?: number;
  score?: number;
  observation?: {
    title?: string;
    narrative?: string;
    type?: string;
  };
};

type HealthResponse = {
  status?: string;
  service?: string;
  version?: string;
  health?: {
    status?: string;
    notes?: string[];
  };
};

function getBaseUrl(): string {
  return (process.env.AGENTMEMORY_URL || "http://localhost:3111").replace(/\/+$/, "");
}
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard();
const DEFAULT_TIMEOUT_MS = 5000;
const TOOL_GUIDANCE = [
  "agentmemory is available for cross-session memory.",
  "Use memory_search to recall prior decisions, preferences, bugs, and workflows.",
  "Use memory_save when you discover durable facts worth remembering beyond this session.",
].join(" ");

/** SHA-256 hex hash for dedup. */
function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Return true if value looks like a base64-encoded image. */
function isBase64Image(val: unknown): val is string {
  return (
    typeof val === "string" &&
    (val.startsWith("data:image/") || val.startsWith("iVBORw0KGgo") || val.startsWith("/9j/"))
  );
}

/** Strip base64 image data from tool output text. */
function stripImageData(text: string): string {
  if (isBase64Image(text)) return "[image data]";
  return text;
}

function getText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [] as string[];
      const block = part as TextBlock;
      if (block.type === "text" && typeof block.text === "string") return [block.text];
      return [] as string[];
    })
    .join("\n")
    .trim();
}

function getLastAssistantText(messages: unknown[]): string {
  for (const msg of [...messages].reverse()) {
    if (!msg || typeof msg !== "object") continue;
    const assistant = msg as AssistantMessage;
    if (assistant.role !== "assistant") continue;
    const text = getText(assistant.content);
    if (text) return text;
  }
  return "";
}

function formatSearchResults(results: SmartSearchResult[]): string {
  if (!results.length) return "No relevant memories found.";
  return results
    .slice(0, 5)
    .map((result, index) => {
      const obs = result.observation ?? result;
      const title = obs.title?.trim() || `Memory ${index + 1}`;
      const narrative = obs.narrative?.trim() || "";
      const type = obs.type?.trim() || "memory";
      const score = result.combinedScore ?? result.score;
      const scoreText = typeof score === "number" ? ` [score=${score.toFixed(3)}]` : "";
      return `- ${title} (${type})${scoreText}${narrative ? `: ${narrative}` : ""}`;
    })
    .join("\n");
}

async function callAgentMemory<T>(
  pathname: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    baseUrl?: string;
    timeoutMs?: number;
  },
): Promise<T | null> {
  const baseUrl = options?.baseUrl?.replace(/\/+$/, "") || getBaseUrl();
  const method = options?.method || "POST";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${baseUrl}/agentmemory/${pathname.replace(/^\/+/, "")}`;
  const headers: Record<string, string> = {};
  const secret = process.env.AGENTMEMORY_SECRET;
  guardPlaintextBearerAuth(baseUrl, secret);
  if (options?.body !== undefined) headers["Content-Type"] = "application/json";
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function agentmemoryExtension(pi: ExtensionAPI) {
  if (process.env.AGENTMEMORY_REQUIRE_HTTPS === "1") {
    guardPlaintextBearerAuth(getBaseUrl(), process.env.AGENTMEMORY_SECRET);
  }
  let sessionId = `ephemeral-${crypto.randomUUID().slice(0, 8)}`;
  let currentProject = process.cwd();
  let lastPrompt = "";
  let lastHealthOk = false;

  /**
   * Dedup window: skip observations with the same content hash within this
   * interval. Mirrors the 5-minute SHA-256 dedup the server applies, but
   * avoids unnecessary HTTP round-trips for rapid tool bursts.
   */
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;
  const recentHashes = new Map<string, number>();

  /** Track in-flight fire-and-forget POSTs so session_shutdown can drain them. */
  const pendingPosts = new Set<Promise<unknown>>();

  function trackPost(promise: Promise<unknown>): void {
    pendingPosts.add(promise);
    void promise.finally(() => pendingPosts.delete(promise));
  }

  function isDuplicate(data: string): boolean {
    const hash = sha256(data);
    const now = Date.now();
    const prev = recentHashes.get(hash);
    if (prev && now - prev < DEDUP_WINDOW_MS) return true;
    // Prune stale entries to avoid unbounded growth.
    if (recentHashes.size > 500) {
      for (const [k, ts] of recentHashes) {
        if (now - ts >= DEDUP_WINDOW_MS) recentHashes.delete(k);
      }
    }
    recentHashes.set(hash, now);
    return false;
  }

  async function getHealth() {
    return await callAgentMemory<HealthResponse>("health", { method: "GET", timeoutMs: 2000 });
  }

  async function refreshStatus(ctx: { ui: { setStatus: (key: string, text: string) => void } }) {
    const health = await getHealth();
    lastHealthOk = !!health && (health.status === "healthy" || health.health?.status === "healthy");
    ctx.ui.setStatus("agentmemory", lastHealthOk ? "🧠 agentmemory" : "🧠 agentmemory off");
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  pi.registerCommand("agentmemory-status", {
    description: "Check local agentmemory server health",
    handler: async (_args, ctx) => {
      const health = await getHealth();
      if (!health) {
        ctx.ui.notify(`agentmemory is unreachable at ${getBaseUrl()}`, "warning");
        return;
      }
      ctx.ui.notify(
        `agentmemory ${health.status || health.health?.status || "unknown"}${health.version ? ` v${health.version}` : ""}`,
        "info",
      );
    },
  });

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  pi.registerTool({
    name: "memory_health",
    label: "Memory Health",
    description: "Check whether the local agentmemory server is reachable and healthy",
    parameters: Type.Object({}),
    async execute() {
      const health = await getHealth();
      if (!health) {
        return {
          content: [{ type: "text", text: `agentmemory is unreachable at ${getBaseUrl()}` }],
          details: { ok: false },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `agentmemory status: ${health.status || health.health?.status || "unknown"}${health.version ? ` (v${health.version})` : ""}`,
          },
        ],
        details: health,
      };
    },
  });

  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search agentmemory for cross-session project memory, prior decisions, bugs, and user preferences",
    parameters: Type.Object({
      query: Type.String({ description: "What to search for in memory" }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 5, description: "Maximum results" })),
    }),
    async execute(_toolCallId, params) {
      const result = await callAgentMemory<{ results?: SmartSearchResult[] }>("smart-search", {
        body: { query: params.query, limit: params.limit ?? 5 },
      });
      const results = result?.results || [];
      return {
        content: [{ type: "text", text: formatSearchResults(results) }],
        details: { query: params.query, results },
      };
    },
  });

  pi.registerTool({
    name: "memory_save",
    label: "Memory Save",
    description: "Save a durable fact, convention, workflow, preference, or bug fix into agentmemory",
    parameters: Type.Object({
      content: Type.String({ description: "What should be remembered" }),
      type: Type.Optional(
        Type.String({
          description: "Memory type",
          default: "fact",
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      const result = await callAgentMemory<Record<string, unknown>>("remember", {
        body: { content: params.content, type: params.type || "fact" },
      });
      if (!result) {
        return {
          content: [{ type: "text", text: "Failed to save memory to agentmemory." }],
          details: { ok: false },
        };
      }
      return {
        content: [{ type: "text", text: `Saved memory (${params.type || "fact"}): ${params.content}` }],
        details: result,
      };
    },
  });

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  /** Build the common envelope for POST /observe calls. */
  function observePayload(data: Record<string, unknown>) {
    return {
      hookType: "post_tool_use",
      sessionId,
      project: currentProject,
      cwd: currentProject,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  /**
   * session_start — Notify the server that a session is starting so it can
   * load project profiles, top concepts, and prior context.
   */
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    sessionId = sessionFile
      ? path.basename(sessionFile).replace(/\.[^.]+$/, "")
      : `ephemeral-${crypto.randomUUID().slice(0, 8)}`;
    currentProject = process.cwd();

    await refreshStatus(ctx);

    if (lastHealthOk) {
      // Awaited so profiles finish loading before the first smart-search.
      await callAgentMemory("session/start", {
        body: { sessionId, project: currentProject, cwd: currentProject },
        timeoutMs: 2000,
      });
    }
  });

  /**
   * before_agent_start — Inject relevant memories into the system prompt so the
   * model has cross-session context from the first turn.
   */
  pi.on("before_agent_start", async (event, ctx) => {
    currentProject = event.systemPromptOptions.cwd || process.cwd();
    lastPrompt = event.prompt?.trim() || "";
    if (!lastPrompt) return;

    // Refresh first so a downed backend skips observe + smart-search instead of
    // paying their timeouts on every prompt.
    await refreshStatus(ctx);

    let recallBlock = "";
    if (lastHealthOk) {
      trackPost(callAgentMemory("observe", {
        body: {
          hookType: "prompt_submit",
          sessionId,
          project: currentProject,
          cwd: currentProject,
          timestamp: new Date().toISOString(),
          data: { prompt: lastPrompt },
        },
        timeoutMs: 3000,
      }));

      const result = await callAgentMemory<{ results?: SmartSearchResult[] }>("smart-search", {
        body: { query: lastPrompt, limit: 5 },
        timeoutMs: 3000,
      });
      const results = result?.results || [];
      if (results.length) {
        recallBlock = ["Relevant long-term memory from agentmemory:", formatSearchResults(results)].join("\n");
      }
    }

    return {
      systemPrompt: [event.systemPrompt, TOOL_GUIDANCE, recallBlock].filter(Boolean).join("\n\n"),
    };
  });

  /**
   * tool_result — Capture every tool execution as a granular observation.
   * This is the primary data-collection hook: the server receives each tool
   * call with its name, input arguments, output, and error status.
   */
  pi.on("tool_result", (event) => {
    if (!lastHealthOk) return;

    const output = stripImageData(getText(event.content));
    const input = JSON.stringify(event.input ?? {});
    if (isDuplicate(`${event.toolName}:${input}:${output}`)) return;

    trackPost(callAgentMemory("observe", {
      body: observePayload({
        tool_name: event.toolName,
        tool_input: input.slice(0, 8000),
        tool_output: output.slice(0, 8000),
        is_error: event.isError ?? false,
      }),
      timeoutMs: 3000,
    }));
  });

  /**
   * session_before_compact — Before pi compacts the context window, request a
   * context summary from the server. This mirrors the Codex PreCompact hook
   * which calls POST /context (not /summarize — that is for session end).
   *
   * Fire-and-forget is acceptable here: the session continues after
   * compaction, so the HTTP call can complete in the background.
   */
  pi.on("session_before_compact", () => {
    if (!lastHealthOk) return;

    void callAgentMemory("context", {
      body: {
        sessionId,
        project: currentProject,
        budget: 1500,
      },
      timeoutMs: 5000,
    });
  });

  /**
   * agent_end — Capture a high-level summary of the completed agent turn
   * (prompt + final assistant response).
   */
  pi.on("agent_end", (event) => {
    if (!lastHealthOk || !lastPrompt) return;
    const assistantText = getLastAssistantText(event.messages as unknown[]);
    if (!assistantText) return;

    if (isDuplicate(`conversation:${lastPrompt}:${assistantText}`)) return;

    trackPost(callAgentMemory("observe", {
      body: observePayload({
        tool_name: "conversation",
        tool_input: lastPrompt.slice(0, 8000),
        tool_output: assistantText.slice(0, 8000),
      }),
      timeoutMs: 3000,
    }));
  });

  /**
   * session_shutdown — Notify the server that the session is ending so it can
   * run final summarization, knowledge-graph extraction, and consolidation.
   *
   * Both calls are awaited sequentially: the process may exit immediately
   * after this hook returns, so fire-and-forget would risk losing data.
   */
  pi.on("session_shutdown", async () => {
    if (!lastHealthOk) return;

    // Drain any in-flight observe POSTs before summarizing.
    await Promise.allSettled([...pendingPosts]);

    await callAgentMemory("summarize", {
      body: { sessionId },
      timeoutMs: 120_000,
    });

    await callAgentMemory("session/end", {
      body: {
        sessionId,
        project: currentProject,
        cwd: currentProject,
        timestamp: new Date().toISOString(),
      },
      timeoutMs: 5000,
    });
  });
}
