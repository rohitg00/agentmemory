// @agentmemory/dsh — cordis plugin for DeepSeek Harness.
//
// Bridges DSH session lifecycle events to the agentmemory REST API, mirroring
// the official agentmemory hooks for Claude Code:
//
//   session/created        -> POST /agentmemory/session/start   (register)
//   agent/pre-step (step1) -> inject instructions + recalled context
//   session/event          -> user/message -> /observe prompt_submit
//                            tool/call     -> /observe post_tool_use
//                            compaction/summary -> /remember (compaction bridge)
//   approval/asked         -> /observe notification
//   session/disposed       -> /agentmemory/session/end         (summarize)
//
// Design contract (same as the official hooks):
//   - Injecting handlers await + time out + fail silently.
//   - Telemetry handlers are fire-and-forget; they never block the agent loop.
//   - Anything REST-related failing logs once and never throws into cordis.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

// ─────────────────────────── minimal cordis surface ───────────────────────────
// The plugin intentionally does not import @deepseek-ai/cordis so it builds and
// tests standalone; the running dsh profile supplies the real Context.
// `any` at these boundaries is deliberate: cordis dispatches heterogeneous
// payloads per event and the plugin narrows at runtime; importing the real
// types would couple the package to @deepseek-ai/cordis at build time.

type AnyListener = (...args: any[]) => unknown;

interface PluginLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface PluginContext {
  on(event: string, listener: AnyListener): void;
  effect(callback: () => void | (() => void), label?: string): void;
  logger: PluginLogger;
}

export interface SessionLike {
  id: string;
  header?: { cwd?: string };
}

// Event payloads vary by event type (user/message, tool/call, compaction/...);
// consumers narrow data at runtime, so it stays `any` at this boundary.
export interface SessionEvent {
  type: string;
  seq?: number;
  data: any;
}

interface PreStepPayload {
  agent: { session: SessionLike; inbox?: { nextStep?: unknown[] } };
  messages: unknown[];
  step: number;
  signal: AbortSignal;
}

// decision.messages mirrors the agent's claimed message batch — heterogeneous
// cordis message shapes, narrowed by the caller.
type PreStepDecision = {
  kind: string;
  messages: any[];
};

type PreStepNext = () => Promise<PreStepDecision>;

// ─────────────────────────────── config ───────────────────────────────

export interface AgentmemoryConfig {
  url: string;
  secret: string;
  agentId: string;
  injectInstructions: boolean;
  injectContext: boolean;
  injectMaxChars: number;
  observeToolCalls: boolean;
  compactionBridge: boolean;
  summarizeOnDispose: boolean;
}

const DEFAULTS: AgentmemoryConfig = {
  url: "http://localhost:3111",
  secret: "",
  agentId: "dsh",
  injectInstructions: true,
  injectContext: true,
  injectMaxChars: 6000,
  observeToolCalls: true,
  compactionBridge: true,
  summarizeOnDispose: true,
};

// Telemetry/truncation budgets and timeouts (kept in one place so operators
// can tune behavior without hunting magic numbers).
const PROMPT_MAX_CHARS = 8000;
const TOOL_INPUT_MAX_CHARS = 4000;
const COMPACTION_MAX_CHARS = 6000;
const OBSERVE_TIMEOUT_MS = 1500;
const SESSION_START_TIMEOUT_MS = 2000;
const CONTEXT_TIMEOUT_MS = 3000;
const REMEMBER_TIMEOUT_MS = 5000;
const SESSION_END_TIMEOUT_MS = 30000;

// ─────────────────────────── static instructions ───────────────────────────

const INSTRUCTIONS = [
  "<agentmemory-instructions>",
  "You have persistent cross-session long-term memory via agentmemory. Tools are namespaced `mcp__agentmemory__*` (memory_recall / memory_save / memory_smart_search / memory_sessions / ...).",
  "- At the START of a task, call `mcp__agentmemory__memory_recall` (or `memory_smart_search`) to load relevant past decisions, fixes, and user preferences; do not re-ask.",
  "- When you learn something durable (a decision, a fix, a gotcha, a preference, a project convention), call `mcp__agentmemory__memory_save` (concepts: 2-5 comma-separated keywords).",
  "- Prefer recall over re-deriving; save concise reusable facts, not transcripts.",
  "- If the user asks to forget/delete something, use `memory_governance_delete` (comma-separated memoryIds).",
  "- Tool results are JSON — inspect them before presenting to the user.",
  "</agentmemory-instructions>",
].join("\n");

// ─────────────────────────── REST client ───────────────────────────

export interface RestClient {
  post<T>(path: string, body: Record<string, unknown>, timeoutMs?: number): Promise<T | null>;
  fire(path: string, body: Record<string, unknown>, timeoutMs?: number): void;
}

export function makeRestClient(url: string, secret: string, debug = false): RestClient {
  function headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) h["Authorization"] = `Bearer ${secret}`;
    return h;
  }

  async function post<T>(path: string, body: Record<string, unknown>, timeoutMs = 3000): Promise<T | null> {
    try {
      const res = await fetch(`${url}/agentmemory${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err) {
      if (debug) console.error(`[agentmemory] POST ${path} failed:`, (err as Error).message);
      return null;
    }
  }

  function fire(path: string, body: Record<string, unknown>, timeoutMs = 1500): void {
    void post(path, body, timeoutMs);
  }

  return { post, fire };
}

// ─────────────────────────── project resolution ───────────────────────────

export function resolveProjectName(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env["AGENTMEMORY_PROJECT_NAME"]?.trim();
  if (explicit) return explicit;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (top) return basename(top);
  } catch {
    // not a git repo, fall through
  }
  return basename(cwd) || cwd;
}

// ─────────────────────────── pure event mapping ───────────────────────────

export function isAgentmemoryTool(name: string): boolean {
  return name.startsWith("mcp__agentmemory__") || name.startsWith("agentmemory_");
}

export function eventTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          const b = block as { type?: string; text?: unknown };
          if (b.type === "text" && typeof b.text === "string") return b.text;
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

export function userMessagePrompt(event: SessionEvent, maxChars: number): string | null {
  if (event.type !== "user/message") return null;
  const text = eventTextContent(event.data?.content);
  if (!text.trim()) return null;
  return text.slice(0, maxChars);
}

export function toolCallObservation(event: SessionEvent, maxChars: number): Record<string, unknown> | null {
  if (event.type !== "tool/call") return null;
  const data = event.data ?? {};
  const name = typeof data.name === "string" ? data.name : "";
  if (!name || isAgentmemoryTool(name)) return null;
  let input: string;
  try {
    input = JSON.stringify(data.arguments ?? {}).slice(0, maxChars);
  } catch {
    input = String(data.arguments ?? "").slice(0, maxChars);
  }
  return { tool_name: name, call_id: typeof data.callId === "string" ? data.callId : null, tool_input: input };
}

export function compactionSummary(event: SessionEvent, maxChars: number): string | null {
  if (event.type !== "compaction/summary") return null;
  const data = event.data ?? {};
  const summary =
    (typeof data.summary === "string" && data.summary ? data.summary : undefined) ??
    (typeof data.text === "string" && data.text ? data.text : undefined) ??
    (typeof data.content === "string" && data.content ? data.content : undefined);
  if (!summary) return null;
  return summary.slice(0, maxChars);
}

// ─────────────────────────────── plugin ───────────────────────────────

export const name = "agentmemory";

export function apply(ctx: PluginContext, rawConfig: Partial<AgentmemoryConfig> = {}): void {
  const cfg: AgentmemoryConfig = { ...DEFAULTS, ...rawConfig };
  const debug = process.env["AGENTMEMORY_DSH_DEBUG"] === "1";
  const rest = makeRestClient(cfg.url, cfg.secret, debug);
  const logger = ctx.logger;

  // sessionId -> context returned by /session/start, for first-step injection.
  const startContextCache = new Map<string, string>();
  // sessionId -> set of sessions that already had their first-step injection.
  const injectedSessions = new Set<string>();
  // sessionId -> { cwd, project } captured at session/created; avoids re-spawning
  // git per event and keeps approval observations on the right session.
  const sessionInfos = new Map<string, { cwd: string; project: string }>();
  // cwd -> projectName memo: git rev-parse is a blocking child process and must
  // not run on every session/event (project identity is stable per cwd).
  const projectNameCache = new Map<string, string>();
  // In-flight REST calls still settling at teardown (e.g. /session/end on
  // shutdown); kept referenced so nothing is dropped or unhandled.
  const pendingCalls = new Set<Promise<unknown>>();

  function sessionCwd(session: SessionLike): string {
    return session.header?.cwd || process.cwd();
  }

  function cachedProjectName(cwd: string): string {
    let project = projectNameCache.get(cwd);
    if (project === undefined) {
      project = resolveProjectName(cwd);
      projectNameCache.set(cwd, project);
    }
    return project;
  }

  function trackSession(session: SessionLike): { cwd: string; project: string } | undefined {
    if (!session || typeof session.id !== "string") return undefined;
    const cwd = sessionCwd(session);
    const info = { cwd, project: cachedProjectName(cwd) };
    sessionInfos.set(session.id, info);
    return info;
  }

  function fireObserve(
    sid: string,
    info: { cwd: string; project: string },
    hookType: string,
    data: Record<string, unknown>,
  ): void {
    const call = rest
      .post("/observe", {
        hookType,
        sessionId: sid,
        project: info.project,
        cwd: info.cwd,
        timestamp: new Date().toISOString(),
        data,
      }, OBSERVE_TIMEOUT_MS)
      .catch(() => {});
    pendingCalls.add(call);
    void call.then(() => pendingCalls.delete(call));
  }

  // ── session/created → register with the daemon (await: response feeds injection) ──
  ctx.on("session/created", (session: SessionLike) => {
    if (!session || typeof session.id !== "string") return;
    const sid = session.id;
    const info = trackSession(session);
    if (!info) return;
    const call = rest
      .post<{ context?: unknown }>("/session/start", {
        sessionId: sid,
        project: info.project,
        cwd: info.cwd,
        agentId: cfg.agentId,
      }, SESSION_START_TIMEOUT_MS)
      .then((result) => {
        const context = result?.context;
        if (typeof context === "string" && context.length > 0) {
          startContextCache.set(sid, context);
        }
      })
      .catch(() => {});
    pendingCalls.add(call);
    void call.then(() => pendingCalls.delete(call));
  });

  // ── session/event stream → telemetry observations (fire-and-forget) ──
  ctx.on("session/event", (session: SessionLike, event: SessionEvent) => {
    if (!session || !event || typeof event.type !== "string") return;
    const sid = session.id;
    if (!sid) return;

    let info = sessionInfos.get(sid);
    if (!info) {
      info = trackSession(session);
      if (!info) return;
    }

    const prompt = userMessagePrompt(event, PROMPT_MAX_CHARS);
    if (prompt !== null) {
      fireObserve(sid, info, "prompt_submit", { userPrompt: prompt });
      return;
    }

    const tool = toolCallObservation(event, TOOL_INPUT_MAX_CHARS);
    if (tool !== null && cfg.observeToolCalls) {
      fireObserve(sid, info, "post_tool_use", tool);
      return;
    }

    if (cfg.compactionBridge) {
      const summary = compactionSummary(event, COMPACTION_MAX_CHARS);
      if (summary !== null) {
        const call = rest
          .post("/remember", {
            content: `[dsh compaction] ${summary}`,
            type: "fact",
            concepts: ["compaction"],
            project: info.project,
          }, REMEMBER_TIMEOUT_MS)
          .catch(() => {});
        pendingCalls.add(call);
        void call.then(() => pendingCalls.delete(call));
      }
    }
  });

  // ── agent/pre-step (step 1) → inject instructions + recalled context ──
  ctx.on("agent/pre-step", async ({ agent, messages, step, signal }: PreStepPayload, next: PreStepNext) => {
    const decision = await next();
    const session = agent?.session;
    if (!session || typeof session.id !== "string") return decision;
    const sid = session.id;
    if (step !== 1 || injectedSessions.has(sid)) return decision;
    if (decision.kind !== "enter" || !Array.isArray(decision.messages) || decision.messages.length === 0) {
      return decision;
    }
    if (signal.aborted) return decision;

    const info = sessionInfos.get(sid) ?? trackSession(session);
    const project = info?.project ?? cachedProjectName(sessionCwd(session));
    const parts: string[] = [];
    if (cfg.injectInstructions) parts.push(INSTRUCTIONS);
    if (cfg.injectContext) {
      let context = startContextCache.get(sid);
      if (!context) {
        const result = await rest.post<{ context?: unknown }>("/context", { sessionId: sid, project }, CONTEXT_TIMEOUT_MS);
        context = typeof result?.context === "string" ? result.context : "";
      } else {
        startContextCache.delete(sid);
      }
      if (context) parts.push(context);
    }
    if (parts.length === 0) return decision;

    const text = parts.join("\n\n").slice(0, cfg.injectMaxChars);
    const message = {
      id: randomUUID(),
      role: "user",
      content: [{ type: "text", text }],
      source: { kind: "agentmemory", form: "memory-context" },
    };
    injectedSessions.add(sid);
    // ES2022-compatible equivalents of findLastIndex/toSpliced (Node 18 safe).
    const lastClaimedIndex =
      decision.messages.length - 1 - [...decision.messages].reverse().findIndex((m) => messages.includes(m));
    const nextMessages = decision.messages.slice();
    nextMessages.splice(lastClaimedIndex + 1, 0, message);
    return {
      ...decision,
      messages: nextMessages,
    };
  });

  // ── approval/asked → permission observation (fire-and-forget) ──
  // Allowlisted fields only: the raw request object may carry sensitive
  // tool arguments or file paths; never forward it wholesale.
  const APPROVAL_FIELDS = ["permission", "pattern", "title", "tool_call_id", "metadata"] as const;
  ctx.on("approval/asked", (req: unknown) => {
    const data = (req ?? {}) as Record<string, unknown>;
    const sid = typeof data.sessionId === "string" ? data.sessionId : undefined;
    if (!sid) return;
    const info = sessionInfos.get(sid);
    if (!info) return; // unknown session: no cwd/project to attribute — skip
    const payload: Record<string, unknown> = { notification_type: "permission_prompt" };
    for (const key of APPROVAL_FIELDS) {
      const value = data[key];
      if (value !== undefined) payload[key] = typeof value === "string" ? value.slice(0, 2000) : value;
    }
    fireObserve(sid, info, "notification", payload);
  });

  // ── session/disposed → summarize (tracked, longer timeout) ──
  ctx.on("session/disposed", (session: SessionLike) => {
    if (!session || typeof session.id !== "string") return;
    const sid = session.id;
    if (cfg.summarizeOnDispose) {
      const call = rest
        .post("/session/end", { sessionId: sid }, SESSION_END_TIMEOUT_MS)
        .catch(() => {});
      pendingCalls.add(call);
      void call.then(() => pendingCalls.delete(call));
    }
    startContextCache.delete(sid);
    injectedSessions.delete(sid);
    sessionInfos.delete(sid);
  });

  // Dispose bookkeeping on plugin teardown: clear caches and let in-flight
  // REST calls settle (the promises are referenced, so nothing is dropped).
  ctx.effect(() => () => {
    startContextCache.clear();
    injectedSessions.clear();
    sessionInfos.clear();
    projectNameCache.clear();
  }, "agentmemory.dsh.memory");

  if (debug) {
    logger.info(
      `[agentmemory] dsh plugin active: url=${cfg.url} agentId=${cfg.agentId} inject=${cfg.injectContext} observe=${cfg.observeToolCalls} compactionBridge=${cfg.compactionBridge}`,
    );
  }
}
