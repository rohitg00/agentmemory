import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
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

const DEFAULT_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const guardPlaintextBearerAuth = createPlaintextBearerAuthGuard();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5000;
const TOOL_GUIDANCE = [
  "agentmemory is available for cross-session memory.",
  "Use memory_search to recall prior decisions, preferences, bugs, and workflows.",
  "Use memory_save when you discover durable facts worth remembering beyond this session.",
].join(" ");

function getBaseUrl(): string {
  return DEFAULT_URL.replace(/\/+$/, "");
}

// Mirrors src/state/schema.ts primitives — the extension is a standalone
// package that connects to the server over HTTP, so the id helpers are
// inlined instead of imported from server internals.
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${ts}_${rand}`;
}

function fingerprintId(prefix: string, content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `${prefix}_${hash.slice(0, 16)}`;
}

function isBase64Image(val: unknown): val is string {
  if (typeof val !== "string") return false;
  return val.startsWith("data:image/") || val.startsWith("iVBORw0KGgo") || val.startsWith("/9j/");
}

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

function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = cwd && cwd.trim() ? cwd : process.cwd();
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString().trim();
    if (top) return path.basename(top);
  } catch {}
  return path.basename(dir);
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
  const baseUrl = (options?.baseUrl || getBaseUrl()).replace(/\/+$/, "");
  const method = options?.method || "POST";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${baseUrl}/agentmemory/${pathname.replace(/^\/+/, "")}`;
  const headers: Record<string, string> = {};
  const secret = process.env["AGENTMEMORY_SECRET"];
  guardPlaintextBearerAuth(baseUrl, secret);
  if (options?.body !== undefined) headers["Content-Type"] = "application/json";
  if (secret) headers["Authorization"] = `Bearer ${secret}`;
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
  if (process.env["AGENTMEMORY_REQUIRE_HTTPS"] === "1") {
    guardPlaintextBearerAuth(getBaseUrl(), process.env["AGENTMEMORY_SECRET"]);
  }

  let sessionId = generateId("ephemeral");
  let currentProject = resolveProject();
  let currentCwd = process.cwd();
  let lastPrompt = "";
  let lastHealthOk = false;
  let cachedContext: string | undefined;

  const recentHashes = new Map<string, number>();
  const pendingPosts = new Set<Promise<unknown>>();
  const fileStash = new Set<string>();

  function trackPost(promise: Promise<unknown>): void {
    pendingPosts.add(promise);
    void promise.finally(() => pendingPosts.delete(promise));
  }

  function isDuplicate(data: string): boolean {
    const hash = fingerprintId("dedup", data);
    const now = Date.now();
    const prev = recentHashes.get(hash);
    if (prev && now - prev < DEDUP_WINDOW_MS) return true;
    if (recentHashes.size > 500) {
      for (const [k, ts] of recentHashes) {
        if (now - ts >= DEDUP_WINDOW_MS) recentHashes.delete(k);
      }
    }
    recentHashes.set(hash, now);
    return false;
  }

  function observePayload(hookType: string, data: Record<string, unknown>) {
    return {
      hookType,
      sessionId,
      project: currentProject,
      cwd: currentCwd,
      timestamp: new Date().toISOString(),
      data,
    };
  }

  async function getHealth() {
    return await callAgentMemory<HealthResponse>("health", { method: "GET", timeoutMs: 2000 });
  }

  async function refreshStatus(ctx: { ui: { setStatus: (key: string, text: string) => void } }) {
    const health = await getHealth();
    lastHealthOk = !!health && (health.status === "healthy" || health.health?.status === "healthy");
    ctx.ui.setStatus("agentmemory", lastHealthOk ? "🧠 agentmemory" : "🧠 agentmemory off");
  }

  const FILE_TOOL_NAMES = new Set(["read", "write", "edit", "glob", "grep"]);
  const FILE_PARAM_KEYS = ["file_path", "path", "file", "pattern"];

  function extractFilePaths(input: Record<string, unknown>): string[] {
    const files: string[] = [];
    for (const key of FILE_PARAM_KEYS) {
      const val = input[key];
      if (typeof val === "string" && val.length > 0) files.push(val);
    }
    return files;
  }

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

  const { z } = pi.zod;

  pi.registerTool({
    name: "memory_health",
    label: "Memory Health",
    description: "Check whether the local agentmemory server is reachable and healthy",
    parameters: z.object({}),
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
    parameters: z.object({
      query: z.string().describe("What to search for in memory"),
      limit: z.number().int().min(1).max(10).default(5).describe("Maximum results"),
    }),
    async execute(_toolCallId, params) {
      const result = await callAgentMemory<{ results?: SmartSearchResult[] }>("smart-search", {
        body: { query: params.query, limit: params.limit ?? 5 },
        timeoutMs: 3000,
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
    parameters: z.object({
      content: z.string().describe("What should be remembered"),
      type: z.string().default("fact").describe("Memory type"),
    }),
    async execute(_toolCallId, params) {
      const result = await callAgentMemory<Record<string, unknown>>("remember", {
        body: { content: params.content, type: params.type || "fact" },
        timeoutMs: 3000,
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

  // session_start — register session and load project profile
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    sessionId = sessionFile
      ? path.basename(sessionFile).replace(/\.[^.]+$/, "")
      : generateId("ephemeral");
    currentProject = resolveProject();
    currentCwd = process.cwd();
    await refreshStatus(ctx);
    if (lastHealthOk) {
      await callAgentMemory("session/start", {
        body: { sessionId, project: currentProject, cwd: currentCwd },
        timeoutMs: 2000,
      });
    }
  });

  // before_agent_start — recall relevant memories and inject into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    currentProject = resolveProject();
    const eventCwd = (event as Record<string, unknown>).systemPromptOptions as
      | { cwd?: string }
      | undefined;
    currentCwd = eventCwd?.cwd || process.cwd();
    const prompt = (event as Record<string, unknown>).prompt as string | undefined;
    lastPrompt = prompt?.trim() || "";
    if (!lastPrompt) return;

    await refreshStatus(ctx);

    let recallBlock = "";
    if (lastHealthOk) {
      trackPost(callAgentMemory("observe", {
        body: {
          hookType: "prompt_submit",
          sessionId,
          project: currentProject,
          cwd: currentCwd,
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
        recallBlock = [
          "Relevant long-term memory from agentmemory:",
          formatSearchResults(results),
        ].join("\n");
      }
    }

    const systemPrompt = (event as Record<string, unknown>).systemPrompt as string | undefined;
    return {
      systemPrompt: [systemPrompt, TOOL_GUIDANCE, recallBlock].filter(Boolean).join("\n\n"),
    };
  });

  // tool_call — stash file paths for enrich pipeline (Claude pre-tool-use pattern)
  pi.on("tool_call", (event) => {
    const toolName = (event.toolName || "").toLowerCase();
    if (!FILE_TOOL_NAMES.has(toolName)) return;
    const input = event.input as Record<string, unknown> | undefined;
    if (!input) return;
    for (const fp of extractFilePaths(input)) {
      fileStash.add(fp);
    }
  });

  // tool_result — per-tool observe (primary data collection hook)
  pi.on("tool_result", (event) => {
    if (!lastHealthOk) return;

    const output = stripImageData(getText(event.content));
    const input = JSON.stringify(event.input ?? {});
    if (isDuplicate(`${event.toolName}:${input}:${output}`)) return;

    trackPost(callAgentMemory("observe", {
      body: observePayload("post_tool_use", {
        tool_name: event.toolName,
        tool_input: input.slice(0, 8000),
        tool_output: output.slice(0, 8000),
        is_error: event.isError ?? false,
      }),
      timeoutMs: 3000,
    }));
  });

  // context — truncate large tool outputs; optionally inject file enrichment
  pi.on("context", async (event) => {
    const MAX_TOOL_OUTPUT = 8000;
    const trimmed = event.messages.map((msg) => {
      if (msg.role !== "toolResult") return msg;
      const content = msg.content.map((chunk) => {
        if (chunk.type !== "text" || chunk.text.length <= MAX_TOOL_OUTPUT) return chunk;
        return { ...chunk, text: chunk.text.slice(0, MAX_TOOL_OUTPUT) + "\n[... truncated by agentmemory]" };
      });
      return { ...msg, content };
    });

    const enrichEnabled = process.env["AGENTMEMORY_INJECT_CONTEXT"] === "1";
    if (enrichEnabled && fileStash.size > 0 && lastHealthOk) {
      const files = [...fileStash].slice(0, 20);
      fileStash.clear();
      try {
        const result = await callAgentMemory<{ context?: string }>("enrich", {
          body: { sessionId, files, toolName: "enrich_inject" },
          timeoutMs: 2000,
        });
        if (result?.context) {
          trimmed.push({ role: "system", content: result.context } as never);
        }
      } catch {}
    }

    return { messages: trimmed };
  });

  // session_before_compact — fetch context summary before compaction
  pi.on("session_before_compact", async () => {
    if (!lastHealthOk) return;
    const result = await callAgentMemory<{ context?: string }>("context", {
      body: { sessionId, project: currentProject, budget: 1500 },
      timeoutMs: 5000,
    });
    cachedContext = result?.context;
  });

  // session.compacting — inject cached context into compaction output
  pi.on("session.compacting", async () => {
    if (cachedContext) {
      const ctx = cachedContext;
      cachedContext = undefined;
      return { context: [ctx] };
    }
    // Cache missed (e.g. session_before_compact is still awaiting the
    // request or the server was unreachable) — fetch fresh context so the
    // compaction still gets the summary.
    if (!lastHealthOk) return;
    const result = await callAgentMemory<{ context?: string }>("context", {
      body: { sessionId, project: currentProject, budget: 1500 },
      timeoutMs: 5000,
    });
    if (result?.context) {
      return { context: [result.context] };
    }
  });

  // agent_end — capture conversation turn summary
  pi.on("agent_end", (event) => {
    if (!lastHealthOk || !lastPrompt) return;
    const assistantText = getLastAssistantText(event.messages as unknown[]);
    if (!assistantText) return;

    if (isDuplicate(`conversation:${lastPrompt}:${assistantText}`)) return;

    trackPost(callAgentMemory("observe", {
      body: observePayload("post_tool_use", {
        tool_name: "conversation",
        tool_input: lastPrompt.slice(0, 8000),
        tool_output: assistantText.slice(0, 8000),
      }),
      timeoutMs: 3000,
    }));
  });

  // session_shutdown — drain in-flight posts, consolidate, summarize, end session.
  // Handler must return within 2s; heavy work runs in a fire-and-forget chain.
  pi.on("session_shutdown", () => {
    if (!lastHealthOk) return;

    void (async () => {
      // Drain pending observe POSTs with a 1s hard cap. Most pendingPosts
      // were dispatched before session_shutdown fired; the race prevents
      // a single stalled request from blocking the entire drain.
      await Promise.race([
        Promise.allSettled([...pendingPosts]),
        (() => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 1000); return promise; })(),
      ]);

      if (process.env["AGENTMEMORY_CONSOLIDATION_ENABLED"] !== "0") {
        await callAgentMemory("crystals/auto", {
          body: { olderThanDays: 0 },
          timeoutMs: 60000,
        });
        await callAgentMemory("consolidate-pipeline", {
          body: { tier: "all", force: true },
          timeoutMs: 120000,
        });
      }

      await callAgentMemory("summarize", {
        body: { sessionId },
        timeoutMs: 120000,
      });

      await callAgentMemory("session/end", {
        body: {
          sessionId,
          project: currentProject,
          cwd: currentCwd,
          timestamp: new Date().toISOString(),
        },
        timeoutMs: 5000,
      });
    })();
  });

  // tool_approval_requested — observe permission prompts
  pi.on("tool_approval_requested", (event) => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("permission_prompt", {
        tool_name: event.toolName,
        tool_call_id: (event as Record<string, unknown>).toolCallId,
      }),
      timeoutMs: 2000,
    }));
  });

  // tool_approval_resolved — observe permission responses
  pi.on("tool_approval_resolved", (event) => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("permission_reply", {
        tool_name: event.toolName,
        approved: (event as Record<string, unknown>).approved,
      }),
      timeoutMs: 2000,
    }));
  });

  // auto_compaction_start — observe compaction begin
  pi.on("auto_compaction_start", () => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("auto_compaction_start", {}),
      timeoutMs: 2000,
    }));
  });

  // auto_compaction_end — observe compaction end
  pi.on("auto_compaction_end", () => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("auto_compaction_end", {}),
      timeoutMs: 2000,
    }));
  });

  // auto_retry_start — observe retry begin
  pi.on("auto_retry_start", () => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("auto_retry_start", {}),
      timeoutMs: 2000,
    }));
  });

  // auto_retry_end — observe retry end
  pi.on("auto_retry_end", () => {
    if (!lastHealthOk) return;
    trackPost(callAgentMemory("observe", {
      body: observePayload("auto_retry_end", {}),
      timeoutMs: 2000,
    }));
  });
}
