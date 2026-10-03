import type { Plugin } from "@opencode-ai/plugin";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/**
 * agentmemory-capture for OpenCode — V1 and V2 in one file.
 *
 * OpenCode V2 no longer runs the V1 `Hooks`-object plugin shape: the default
 * export must carry an `id` plus a `setup(ctx)`, and hooks are registered on
 * the domain that owns the operation. This file default-exports both, so it
 * keeps working across the V1 -> V2 transition:
 *
 *   - V1 calls `server()` and uses the returned hooks.
 *   - V2 reads `id` and `setup()` and ignores `server()`.
 *
 * The two implementations are deliberately kept separate. Sharing an export
 * does not translate V1 hooks into V2 hooks, and the hook payloads differ
 * enough (see README.md) that a shared core would be a lie about coverage.
 *
 * The V1 body below is unchanged and remains the full 22-hook implementation,
 * including `config` and `chat.params`. The V2 body carries only the hooks
 * that have a faithful V2 equivalent.
 *
 * `@opencode/plugin` is deliberately not imported: the loader only requires
 * `id` plus `setup`, so this file needs no V2 SDK dependency to be installed.
 */

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
// OpenCode reports tool names in lowercase ("read", "edit", ...); matching is
// case-insensitive at the call site so a future casing change cannot silently
// kill file enrichment again.
const FILE_TOOLS = new Set(["read", "write", "edit", "glob", "grep"]);
const FILE_KEYS = ["filePath", "file_path", "path", "file", "pattern"];
const MAX_STASHED_FILES = 20;

const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
function usableSecret(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || (trimmed.startsWith("${") && trimmed.endsWith("}"))) return "";
  return trimmed;
}

function readAgentmemoryFile(name: string): string {
  try {
    return readFileSync(join(homedir(), ".agentmemory", name), "utf-8");
  } catch {
    return "";
  }
}

function envFileSecret(): string {
  let found = "";
  for (const line of readAgentmemoryFile(".env").split("\n")) {
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

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

function resolveSecret(url: string, explicit: string | undefined): string {
  const configured = usableSecret(explicit);
  if (configured) return configured;
  if (!isLoopbackUrl(url)) return "";
  return envFileSecret() || usableSecret(readAgentmemoryFile("secret"));
}

const SECRET = resolveSecret(API, process.env.AGENTMEMORY_SECRET);

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  return headers;
}

async function post(path: string, body: Record<string, unknown>, timeoutMs = 5000): Promise<void> {
  try {
    await fetch(`${API}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (DEBUG) console.error(`[agentmemory] POST ${path} failed:`, (e as Error).message);
  }
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    if (DEBUG) console.error(`[agentmemory] POST ${path} failed:`, (e as Error).message);
    return null;
  }
}

async function observe(
  sessionId: string,
  hookType: string,
  data: Record<string, unknown>,
): Promise<void> {
  const proj = projectFor(sessionId);
  await post("/observe", {
    hookType,
    sessionId,
    project: proj.name,
    cwd: proj.cwd,
    timestamp: new Date().toISOString(),
    data,
  });
}

let activeSessionId: string | null = null;
let pendingConfig: Record<string, unknown> | null = null;
// Default scope resolved at plugin init (same resolution order as the hooks'
// resolveProject: env override, git toplevel basename, cwd basename). In a
// long-lived OpenCode process serving multiple directories these defaults are
// only a fallback — attribution is per-session via sessionProjects, resolved
// from each session's own directory at session.created. Module-level-only
// state recorded home-directory sessions under whatever repo loaded first.
let defaultProjectName: string | null = null;
let defaultProjectCwd: string | null = null;
const sessionProjects = new Map<string, { name: string; cwd: string }>();

function projectFor(sessionId: string): { name: string | null; cwd: string | null } {
  const p = sessionProjects.get(sessionId);
  return p ?? { name: defaultProjectName, cwd: defaultProjectCwd };
}

const projectNameCache = new Map<string, string>();

function resolveProjectName(dir: string): string {
  const explicit = process.env.AGENTMEMORY_PROJECT_NAME?.trim();
  if (explicit) return explicit;
  const cached = projectNameCache.get(dir);
  if (cached !== undefined) return cached;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    if (top) {
      const name = basename(top);
      projectNameCache.set(dir, name);
      return name;
    }
  } catch {
    // not a git repo, fall through
  }
  const fallback = basename(dir) || dir;
  projectNameCache.set(dir, fallback);
  return fallback;
}
const stashedFiles = new Map<string, Set<string>>();
const seenSubtaskIds = new Map<string, Set<string>>();
const seenToolCallIds = new Map<string, Set<string>>();
const contextInjectedSessions = new Set<string>();
// cache the context returned by POST /session/start so the chat
// system-transform hook can inject it without a second /context fetch.
// Auto-injection now happens at session.created (immediately) AND at
// the first prompt_submit (fallback for older OpenCode builds that
// don't implement experimental.chat.system.transform).
const startContextCache = new Map<string, string>();

function stashFor(sid: string): Set<string> {
  let s = stashedFiles.get(sid);
  if (!s) { s = new Set<string>(); stashedFiles.set(sid, s); }
  return s;
}

function subtaskSetFor(sid: string): Set<string> {
  let s = seenSubtaskIds.get(sid);
  if (!s) { s = new Set<string>(); seenSubtaskIds.set(sid, s); }
  return s;
}

function toolCallSetFor(sid: string): Set<string> {
  let s = seenToolCallIds.get(sid);
  if (!s) { s = new Set<string>(); seenToolCallIds.set(sid, s); }
  return s;
}

function pruneSessionMaps(sid: string): void {
  stashedFiles.delete(sid);
  seenSubtaskIds.delete(sid);
  seenToolCallIds.delete(sid);
  sessionProjects.delete(sid);
}

function safeSlice(v: unknown, max: number): string {
  if (typeof v === "string") return v.slice(0, max);
  if (v == null) return "";
  try { return JSON.stringify(v).slice(0, max); } catch { return ""; }
}

const AGENTMEMORY_INSTRUCTIONS = `<agentmemory-instructions>
You have access to agentmemory for persistent cross-session memory. Use these tools proactively.

CORE TOOLS:

memory_save — Save an insight, decision, or fact to long-term memory.
  Required: content (text), concepts (2-5 comma-separated keywords), type (pattern/preference/architecture/bug/workflow/fact)
  Optional: files (comma-separated paths)
  Use when: user says "remember this", after discovering a bug, after making an architectural decision, after learning a project convention.

memory_recall — Search past observations by keywords.
  Use when: user says "recall", "what did we do", "do you remember", or needs context from past sessions.

memory_smart_search — Hybrid semantic+keyword search with progressive disclosure.
  Use when: you need the most relevant past context, fuzzy/conceptual searches, or recall doesn't find what you need.

memory_sessions — List recent sessions with status and observation counts.
  Use when: user asks about session/past history, "what did we work on".

memory_file_history — Get past observations about specific files (across all sessions).
  Use when: you're about to edit a file and want to know its history, common pitfalls, or past edits.

memory_lesson_save — Save a lesson learned (what worked, what to avoid).
  Use when: you discover a pattern that could help future sessions avoid mistakes.

memory_lesson_recall — Search lessons by query. Returns lessons sorted by confidence.
  Use when: before making a decision, check if past lessons apply.

memory_governance_delete — Delete specific memories. Requires explicit user confirmation.
  Use when: user says "forget this", "delete that memory".

memory_patterns — Detect recurring patterns across sessions.
  Use when: you want to understand project-level trends over time.

memory_consolidate — Run the 4-tier memory consolidation pipeline.
  Use when: you want to compress and organize accumulated session observations.

All memory tools start with \`agentmemory_memory_\`. Use the exact names as they appear in your tool list. Tool results are JSON. Always check what was returned before presenting to the user.
</agentmemory-instructions>`;

function extractFilePaths(args: Record<string, unknown>): string[] {
  const files: string[] = [];
  for (const key of FILE_KEYS) {
    const val = args[key];
    if (typeof val === "string" && val.length > 0) {
      files.push(val);
    }
  }
  return files;
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (e.data && typeof e.data === "object") {
      const d = e.data as Record<string, unknown>;
      if (typeof d.message === "string") return d.message;
    }
    if (typeof e.name === "string") return e.name;
    try { return JSON.stringify(err); } catch { return ""; }
  }
  return String(err ?? "");
}

// ═══════════════════════════════════════════════════════════════════════════
// V1 implementation — unchanged from the original plugin
// ═══════════════════════════════════════════════════════════════════════════

const v1Hooks: Plugin = async (ctx) => {
  defaultProjectCwd = ctx.worktree || ctx.project?.id || process.cwd();
  defaultProjectName = resolveProjectName(defaultProjectCwd);

  return {
    event: async ({ event }) => {
      const type = event.type;
      const props = (event as any).properties || {};

      // ── session.created ──
      if (type === "session.created") {
        const info = props.info as Record<string, unknown> | undefined;
        activeSessionId = (info?.id as string) || props.sessionID || null;
        if (!activeSessionId) return;
        stashedFiles.set(activeSessionId, new Set());
        seenSubtaskIds.delete(activeSessionId);
        seenToolCallIds.delete(activeSessionId);
        contextInjectedSessions.delete(activeSessionId);
        // Snapshot the session id locally — `activeSessionId` is mutable
        // and another `session.created` event during the await could
        // rebind it, causing context to be cached against the wrong key.
        const sessionId = activeSessionId;
        // Attribute this session to its own directory when the event
        // carries one; a multi-directory OpenCode process otherwise
        // records every session under whichever repo loaded the plugin.
        const sessionDir =
          typeof info?.directory === "string" && info.directory
            ? info.directory
            : defaultProjectCwd;
        let proj: { name: string | null; cwd: string | null };
        if (sessionDir) {
          const entry = { cwd: sessionDir, name: resolveProjectName(sessionDir) };
          sessionProjects.set(sessionId, entry);
          proj = entry;
        } else {
          proj = projectFor(sessionId);
        }
        const startResult = await postJson("/session/start", {
          sessionId,
          title: info?.title ?? null,
          parentID: info?.parentID ?? null,
          version: info?.version ?? null,
          project: proj.name,
          cwd: proj.cwd,
        });
        // cache the context returned at session/start so the
        // chat.system.transform hook injects it without a second fetch.
        const startCtx = (startResult as any)?.context;
        if (typeof startCtx === "string" && startCtx.length > 0) {
          startContextCache.set(sessionId, startCtx);
        }
        if (pendingConfig) {
          await observe(sessionId, "config_loaded", pendingConfig);
          pendingConfig = null;
        }
      }

      // ── session.idle ── (summarize handled in session.status idle branch)

      // ── session.status ──
      if (type === "session.status") {
        const status = props.status as Record<string, unknown> | undefined;
        const sid = props.sessionID || activeSessionId;
        if (!sid || !status) return;
        if (status.type === "idle") {
          await post("/summarize", { sessionId: sid });
        }
        await observe(sid, "session_status", {
          status_type: status.type,
          attempt: status.attempt ?? null,
          message: safeSlice(status.message, 2000),
        });
      }

      // ── session.compacted ──
      if (type === "session.compacted") {
        const sid = props.sessionID || activeSessionId;
        if (sid) {
          await post("/summarize", { sessionId: sid });
          await observe(sid, "session_compacted", {});
        }
      }

      // ── session.updated ──
      if (type === "session.updated") {
        const info = props.info as Record<string, unknown> | undefined;
        const sid = (info?.id as string) || props.sessionID || activeSessionId;
        if (!sid) return;
        await observe(sid, "session_updated", {
          title: info?.title ?? null,
          parentID: info?.parentID ?? null,
          additions: (info?.summary as any)?.additions ?? null,
          deletions: (info?.summary as any)?.deletions ?? null,
          files: (info?.summary as any)?.files ?? null,
        });
      }

      // ── session.diff ──
      if (type === "session.diff") {
        const sid = props.sessionID || activeSessionId;
        if (!sid || !Array.isArray(props.diff)) return;
        const diffs = props.diff as Array<Record<string, unknown>>;
        await observe(sid, "session_diff", {
          files: diffs.map(d => d.file),
          additions: diffs.reduce((s, d) => s + ((d.additions as number) || 0), 0),
          deletions: diffs.reduce((s, d) => s + ((d.deletions as number) || 0), 0),
          diffs: diffs.slice(0, 50),
        });
      }

      // ── session.deleted ──
      if (type === "session.deleted") {
        const sid = props.info?.id || props.sessionID || activeSessionId;
        if (!sid) {
          if (DEBUG) console.error("[agentmemory] session.deleted with no session ID");
          return;
        }
        await post("/session/end", { sessionId: sid });
        post("/crystals/auto", { olderThanDays: 7 }, 30000);
        post("/consolidate-pipeline", { tier: "all", force: true }, 30000);
        if (sid === activeSessionId) activeSessionId = null;
        pruneSessionMaps(sid);
        startContextCache.delete(sid);
        contextInjectedSessions.delete(sid);
      }

      // ── session.error ──
      if (type === "session.error") {
        const sid = props.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "post_tool_failure", {
            tool_name: "session.error",
            tool_input: "",
            tool_output: safeSlice(props.error, 8000),
          });
        }
      }

      // ── message.updated ──
      if (type === "message.updated") {
        const info = props.info as Record<string, unknown> | undefined;
        if (!info) return;

        if (info.role === "assistant") {
          const sid = props.sessionID || (info.sessionID as string) || activeSessionId;
          if (!sid) return;
          const tokens = info.tokens as Record<string, unknown> | undefined;
          const error = info.error ? extractErrorMessage(info.error) : null;
          await observe(sid, "assistant_message", {
            messageID: info.id,
            parentID: info.parentID,
            modelID: info.modelID,
            providerID: info.providerID,
            mode: info.mode,
            cost: info.cost ?? 0,
            tokens: {
              input: tokens?.input ?? 0,
              output: tokens?.output ?? 0,
              reasoning: tokens?.reasoning ?? 0,
              cache_read: (tokens?.cache as any)?.read ?? 0,
              cache_write: (tokens?.cache as any)?.write ?? 0,
            },
            finish: info.finish ?? null,
            error,
            duration_ms: (info.time && typeof (info.time as any).completed === "number")
              ? (info.time as any).completed - ((info.time as any).created || 0)
              : null,
          });
        }
      }

      // ── message.removed ──
      if (type === "message.removed") {
        const sid = props.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "message_removed", {
            messageID: props.messageID,
          });
        }
      }

      // ── message.part.updated ──
      if (type === "message.part.updated") {
        const part = props.part as Record<string, unknown> | undefined;
        if (!part) return;
        const sid = (part.sessionID as string) || props.sessionID || activeSessionId;
        if (!sid) return;

        if (part.type === "subtask") {
          const subtaskId = part.id as string;
          if (!subtaskId) return;
          const subtaskSet = subtaskSetFor(sid);
          if (subtaskSet.has(subtaskId)) return;
          subtaskSet.add(subtaskId);
          await observe(sid, "subagent_start", {
            subtask_id: part.id,
            agent: part.agent,
            prompt: safeSlice(part.prompt, 4000),
            description: safeSlice(part.description, 2000),
          });
          return;
        }

        if (part.type === "tool") {
          const state = part.state as Record<string, unknown> | undefined;
          if (!state) return;
          const callId = part.callID as string;
          if (!callId) return;
          const toolName = part.tool as string;

          if (state.status === "completed") {
            const callSet = toolCallSetFor(sid);
            if (callSet.has(callId)) return;
            callSet.add(callId);
            const st = state as Record<string, unknown>;
            const rawTime = (st.time as any) || {};
            const startTime = typeof rawTime.start === "number" ? rawTime.start : null;
            const endTime = typeof rawTime.end === "number" ? rawTime.end : null;
            await observe(sid, "post_tool_use", {
              tool_name: toolName,
              call_id: callId,
              tool_input: safeSlice(st.input, 4000),
              tool_output: safeSlice(st.output, 8000),
              title: st.title ?? null,
              metadata: st.metadata || {},
              duration_ms: (startTime != null && endTime != null) ? endTime - startTime : null,
              attachments: Array.isArray(st.attachments)
                ? (st.attachments as Array<Record<string, unknown>>).map(a => a.filename || a.url)
                : [],
            });
          } else if (state.status === "error") {
            const callSet = toolCallSetFor(sid);
            if (callSet.has(callId)) return;
            callSet.add(callId);
            const st = state as Record<string, unknown>;
            const rawTime = (st.time as any) || {};
            const startTime = typeof rawTime.start === "number" ? rawTime.start : null;
            const endTime = typeof rawTime.end === "number" ? rawTime.end : null;
            await observe(sid, "post_tool_failure", {
              tool_name: toolName,
              call_id: callId,
              tool_input: safeSlice(st.input, 4000),
              tool_output: safeSlice(st.error, 8000),
              duration_ms: (startTime != null && endTime != null) ? endTime - startTime : null,
            });
          }
          return;
        }

        if (part.type === "step-finish") {
          await observe(sid, "step_finish", {
            messageID: part.messageID,
            reason: part.reason ?? null,
            cost: (part as any).cost ?? 0,
            input_tokens: ((part as any).tokens?.input as number) ?? 0,
            output_tokens: ((part as any).tokens?.output as number) ?? 0,
            reasoning_tokens: ((part as any).tokens?.reasoning as number) ?? 0,
          });
          return;
        }

        if (part.type === "reasoning") {
          await observe(sid, "reasoning", {
            messageID: part.messageID,
            text: safeSlice((part as any).text, 4000),
          });
          return;
        }

        if (part.type === "file") {
          const filename = (part as any).filename || (part as any).url || null;
          if (filename) stashFor(sid).add(filename);
          return;
        }

        if (part.type === "patch") {
          await observe(sid, "patch_applied", {
            messageID: part.messageID,
            hash: (part as any).hash,
            files: (part as any).files || [],
          });
          return;
        }

        if (part.type === "compaction") {
          await observe(sid, "compaction_event", {
            messageID: part.messageID,
            auto: (part as any).auto ?? false,
          });
          return;
        }

        if (part.type === "agent") {
          await observe(sid, "agent_selected", {
            messageID: part.messageID,
            name: (part as any).name,
          });
          return;
        }

        if (part.type === "retry") {
          await observe(sid, "retry_attempt", {
            messageID: part.messageID,
            attempt: (part as any).attempt,
            error: safeSlice((part as any).error, 2000),
          });
          return;
        }
      }

      // ── file.edited ──
      if (type === "file.edited") {
        const sid = props.sessionID || activeSessionId;
        if (sid && typeof props.file === "string" && props.file.length > 0) {
          const stash = stashFor(sid);
          stash.add(props.file);
          if (stash.size > MAX_STASHED_FILES) {
            const keep = [...stash].slice(-MAX_STASHED_FILES);
            stash.clear();
            for (const f of keep) stash.add(f);
          }
        }
      }

      // ── permission.updated ──
      if (type === "permission.updated") {
        const sid = props.sessionID || activeSessionId;
        if (!sid) return;
        await observe(sid, "notification", {
          notification_type: "permission_prompt",
          permission: props.type || "unknown",
          pattern: Array.isArray(props.pattern)
            ? props.pattern.join(", ")
            : (props.pattern || ""),
          tool_call_id: props.callID || null,
          title: props.title || props.type || "",
          metadata: props.metadata || {},
        });
      }

      // ── permission.replied ──
      if (type === "permission.replied") {
        const sid = props.sessionID || activeSessionId;
        if (!sid) return;
        await observe(sid, "permission_replied", {
          permission_id: props.permissionID || props.requestID || "",
          response: props.response || props.reply || "",
        });
      }

      // ── todo.updated ──
      if (type === "todo.updated") {
        const sid = props.sessionID || activeSessionId;
        const todos = Array.isArray(props.todos) ? props.todos.slice(0, 100) : [];
        if (!sid || todos.length === 0) return;
        const completed = todos.filter((t: any) => t.status === "completed");
        const active = todos.filter((t: any) => t.status !== "completed");
        await observe(sid, "task_completed", {
          completed: completed.map((t: any) => ({ content: t.content, priority: t.priority })),
          in_progress: active.map((t: any) => ({ content: t.content, priority: t.priority })),
          total: todos.length,
        });
      }

      // ── command.executed ──
      if (type === "command.executed") {
        const sid = props.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "command_executed", {
            name: props.name,
            arguments: props.arguments || "",
          });
        }
      }
    },

    // ── chat.message ──
    "chat.message": async (input, output) => {
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      const parts = output.parts || [];
      const files = parts
        .filter((p: any) => p.type === "file")
        .map((p: any) => p.filename || p.url)
        .filter(Boolean);
      for (const f of files) {
        const stash = stashFor(sid);
        stash.add(f);
        if (stash.size > MAX_STASHED_FILES) {
          const keep = [...stash].slice(-MAX_STASHED_FILES);
          stash.clear();
          for (const k of keep) stash.add(k);
        }
      }

      const textParts = parts.filter((p: any) => p.type === "text" && !p.synthetic && !p.ignored);
      const userText = textParts.map((p: any) => p.text || "").join("\n");

      await observe(sid, "prompt_submit", {
        agent: input.agent ?? null,
        model: input.model ?? null,
        variant: input.variant ?? null,
        prompt: userText.slice(0, 8000),
        files: files.slice(0, 20),
        parts_summary: parts.map((p: any) => p.type).filter(Boolean),
      });
    },

    // ── chat.params ──
    "chat.params": async (input, output) => {
      if (!input.model || !output) return;
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      await observe(sid, "llm_params", {
        agent: input.agent,
        model: `${input.model.providerID}/${input.model.id}`,
        provider_url: input.model.api?.url ?? null,
        temperature: output.temperature,
        topP: output.topP,
        max_output_tokens: input.model.limit?.output ?? null,
        context_limit: input.model.limit?.context ?? null,
        cost_1k_input: input.model.cost?.input ?? 0,
        cost_1k_output: input.model.cost?.output ?? 0,
      });
    },

    // ── tool.execute.before ──
    "tool.execute.before": async (input, output) => {
      if (!FILE_TOOLS.has(String(input.tool ?? "").toLowerCase())) return;
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      const args = output.args as Record<string, unknown> | undefined;
      if (!args) return;
      const stash = stashFor(sid);
      for (const fp of extractFilePaths(args)) {
        stash.add(fp);
      }
      if (stash.size > MAX_STASHED_FILES) {
        const keep = [...stash].slice(-MAX_STASHED_FILES);
        stash.clear();
        for (const f of keep) stash.add(f);
      }
    },

    // ── experimental.chat.system.transform ──
    "experimental.chat.system.transform": async (input, output) => {
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;

      if (!contextInjectedSessions.has(sid)) {
        if (!Array.isArray(output.system)) return;
        output.system.push(AGENTMEMORY_INSTRUCTIONS);
        // prefer the context already fetched at session.created;
        // fall back to a fresh /context call if the cache missed (e.g.
        // session resumed across plugin reloads).
        let ctx = startContextCache.get(sid);
        if (typeof ctx !== "string" || ctx.length === 0) {
          const result = await postJson("/context", {
            sessionId: sid,
            project: projectFor(sid).name,
          });
          ctx = (result as any)?.context;
        } else {
          startContextCache.delete(sid);
        }
        if (typeof ctx === "string" && ctx.length > 0) {
          output.system.push(ctx);
        }
        contextInjectedSessions.add(sid);
      }

      const stash = stashFor(sid);
      if (stash.size === 0) return;
      const files = [...stash].slice(0, 10);

      const enrichResult = await postJson("/enrich", {
        sessionId: sid,
        files,
        toolName: "enrich_inject",
      });

      const enrichCtx = (enrichResult as any)?.context;
      if (typeof enrichCtx === "string" && enrichCtx.length > 0) {
        if (Array.isArray(output.system)) {
          output.system.push(enrichCtx);
        }
        for (const f of files) stash.delete(f);
      }
    },

    // ── experimental.session.compacting (WIP) ──
    "experimental.session.compacting": async (input, output) => {
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;

      const result = await postJson("/context", {
        sessionId: sid,
        project: projectFor(sid).name,
      });
      const ctx = (result as any)?.context;
      if (typeof ctx === "string" && ctx.length > 0) {
        if (Array.isArray(output.context)) {
          output.context.push(ctx);
        }
      }
    },

    // ── config ──
    config: async (input) => {
      const payload: Record<string, unknown> = {
        theme: input.theme ?? null,
        model: input.model ?? null,
        autoupdate: input.autoupdate ?? null,
        agents: typeof input.agent === "object" && input.agent !== null && !Array.isArray(input.agent)
          ? Object.keys(input.agent as Record<string, unknown>)
          : Array.isArray(input.agent) ? input.agent : [],
        mcp_servers: typeof input.mcp === "object" && input.mcp !== null && !Array.isArray(input.mcp)
          ? Object.keys(input.mcp as Record<string, unknown>)
          : Array.isArray(input.mcp) ? input.mcp : [],
        providers: typeof input.provider === "object" && input.provider !== null && !Array.isArray(input.provider)
          ? Object.keys(input.provider as Record<string, unknown>)
          : Array.isArray(input.provider) ? input.provider : [],
        permission: input.permission ?? null,
      };
      if (activeSessionId) {
        await observe(activeSessionId, "config_loaded", payload);
      } else {
        pendingConfig = payload;
      }
    },
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// V2 implementation — OpenCode 2.x
//
// Registered on the domain that owns each operation. Callbacks receive one
// mutable event instead of V1's separate `input` / `output` objects.
//
// Three V1 hooks are intentionally absent here, and README.md explains why:
//   config                        — V2 exposes no mutable global config object
//                                   and no hook that observes it.
//   chat.params                   — V2 `context` starts with empty `options`
//                                   rather than resolved model settings.
//   experimental.session.compacting — V2 `compaction` can only set `result`,
//                                   which skips the model call entirely, so
//                                   memory cannot be added to the prompt.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// V2 implementation
// ═══════════════════════════════════════════════════════════════════════════
//
// Every shape below was captured from OpenCode v2.0.22 at runtime, by a probe
// plugin logging the objects as they arrived. The generated types in
// `@opencode-ai/sdk` 1.4.10 are stale for V2 and were the original source of
// the bug: they declare `event.properties` and list the V1 event names.
//
// What the runtime actually does:
//
//   * Events carry their payload in `event.data`, not `event.properties`.
//     Top-level keys are `created, data, id, location, type` (plus `durable`).
//   * The V1 event names are gone. The live stream carries `session.tool.*`,
//     `session.step.*`, `session.text.*`, `session.reasoning.*`,
//     `session.execution.*`, `session.inbox.*`, `session.instructions.*`,
//     `session.agent.selected`, `session.usage.updated`, `shell.*` and the
//     `*.updated` config/content events.
//   * `ctx.agent.list()`, `ctx.provider.list()` and `ctx.mcp.list()` resolve
//     to `{ data, location }`, so the list must be read from `.data`.
//   * `ctx.model.default()` is a promise; without `await` it is `{}`.
//   * `ctx.tool.hook("execute.after")` is the faithful replacement for the V1
//     tool-result capture, and exposes `status` plus `result.output`.
//   * `ctx.session.hook("context")` fires on every model call and exposes
//     `system` as `SystemPart[]`, so memory is injected on every call rather
//     than once per session.
//   * `session.created` exists and carries `sessionID`, `projectID`,
//     `location`, `title`, `version`, `subpath` and `slug`. An earlier revision
//     of this file claimed it did not exist: that came from observing a
//     session that was already open and never creating one.
//   * `ctx.session.hook("compaction")` registers a handler that is never
//     invoked, even when `ctx.session.compact()` is called and returns a
//     compaction message. Compaction is captured from
//     `session.compaction.started` and `session.compaction.failed` instead.
//   * `parentID` is accepted by `ctx.session.create` but appears in no event
//     payload, so the `parentID` sent to `/session/start` is always null.
//
// Session identity comes from `data.sessionID`; the `location` key on the
// envelope is process-level, not per session.
// ═══════════════════════════════════════════════════════════════════════════

// `ctx` is `any` on purpose. Typing it from `@opencode/plugin` would import
// generated types that are stale for V2: SDK 1.4.10 declares `event.properties`
// and the V1 event names, neither of which v2.0.22 emits. That would reject
// correct code while accepting the shape that broke the previous port.
//
// The cost is real and is documented in README.md: the compiler cannot catch
// V2 payload drift, cannot confirm the event names below are real, and cannot
// confirm `ctx.session.hook(...)` accepts a given name, since the loader takes
// any string. Correctness rests on runtime verification instead. Retighten this
// signature when the package ships accurate V2 types.
async function v2Setup(ctx: any) {
  const location = ctx.location;
  defaultProjectCwd = location?.directory ?? location?.project?.directory ?? process.cwd();
  defaultProjectName = resolveProjectName(defaultProjectCwd);

  // V1 keeps its state at module scope; the two implementations share it here
  // because only one of them ever runs in a given OpenCode version.
  async function observeV2(sessionId: string, hookType: string, data: Record<string, unknown>): Promise<void> {
    await observe(sessionId, hookType, data);
  }

  // Shell ids mapped to their session, so `shell.exited` (which carries no
  // sessionID) can attribute an exit code back to the right session.
  const shellSessions = new Map<string, string>();

  // Every stash write goes through here so the cap is enforced in one place.
  // The file watcher and filesystem handlers fire for any workspace change, so
  // an untrimmed write there lets the stash grow without bound.
  function stashAdd(sid: string, paths: Iterable<string>): void {
    const stash = stashFor(sid);
    for (const p of paths) stash.add(p);
    if (stash.size > MAX_STASHED_FILES) {
      const keep = [...stash].slice(-MAX_STASHED_FILES);
      stash.clear();
      for (const k of keep) stash.add(k);
    }
  }

  // Tool name per call ID: V2 puts it on the *input* events, not the call.
  const toolNames = new Map<string, string>();
  const toolCallInputs = new Map<string, Record<string, unknown>>();
  // `session:callId` pairs already reported by `execute.after`, so the
  // `session.tool.failed` event stays a fallback rather than a duplicate.
  const reportedToolCalls = new Set<string>();
  // Sessions that have been sent to `/session/start`, so registration happens
  // once per session rather than once per process.
  const registeredSessions = new Set<string>();

  // `list()` resolves to `{ data, location }`. Older/alternate shapes return the
  // array directly, so both are accepted rather than assuming either.
  function namesFrom(result: unknown): string[] {
    const arr = Array.isArray(result) ? result : (result as any)?.data;
    if (!Array.isArray(arr)) return [];
    return arr.map((x: any) => (typeof x === "string" ? x : x?.id ?? x?.name)).filter(Boolean);
  }

  // ── config snapshot ───────────────────────────────────────────────────────
  // V1's `config` hook read the global config on every load. V2 has no
  // equivalent, so the snapshot is taken at setup and refreshed when the
  // relevant `*.updated` events arrive, since editing config while OpenCode is
  // running is otherwise never observed.

  async function snapshotConfig(): Promise<void> {
    const [agents, providers, mcp, modelDefault] = await Promise.all([
      ctx.agent?.list?.().catch(() => null),
      ctx.provider?.list?.().catch(() => null),
      ctx.mcp?.list?.().catch(() => null),
      // Must be awaited: the unresolved promise stringifies to `{}`.
      Promise.resolve(ctx.model?.default?.()).catch(() => null),
    ]);
    const model = Array.isArray(modelDefault) ? modelDefault[0] : (modelDefault as any)?.data;
    const payload = {
      agents: namesFrom(agents),
      providers: namesFrom(providers),
      mcp_servers: namesFrom(mcp),
      model: model ? `${model.providerID ?? ""}/${model.id ?? model.modelID ?? ""}` : null,
      model_limits: model?.limit ?? null,
      location: defaultProjectCwd,
    };
    // `setup` runs before any session exists, so the payload is parked and
    // flushed by whichever session registers first.
    if (activeSessionId) await observeV2(activeSessionId, "config_loaded", payload);
    else pendingConfig = payload;
  }

  void snapshotConfig().catch((e) => {
    if (DEBUG) console.error("[agentmemory] config snapshot failed:", (e as Error).message);
  });

  // ── tool.execute.before -> ctx.tool.hook("execute.before") ────────────────
  // Tracks file paths from read/write/edit/glob/grep so the context hook can
  // ask agentmemory for history about the files about to be touched.

  await ctx.tool.hook("execute.before", (event: any) => {
    if (!FILE_TOOLS.has(String(event?.tool ?? "").toLowerCase())) return;
    const sid = event?.sessionID || activeSessionId;
    if (!sid) return;
    const args = event?.input as Record<string, unknown> | undefined;
    if (!args) return;
    stashAdd(sid, extractFilePaths(args));
  });

  // ── tool results -> ctx.tool.hook("execute.after") ────────────────────────
  // Replaces the V1 `message.part.updated` tool branch. This is the faithful
  // equivalent: it carries `status`, the tool name, the input and the result,
  // so post_tool_use and post_tool_failure come from a single hook instead of
  // being reconstructed from part events that V2 no longer emits.

  await ctx.tool.hook("execute.after", async (event: any) => {
    const sid = event?.sessionID || activeSessionId;
    if (!sid) return;
    const tool = String(event?.tool ?? "");
    const callId = (event?.id as string) || (event?.messageID as string) || null;
    const status = String(event?.status ?? "");
    const result = event?.result ?? {};
    const metadata = (result?.metadata ?? {}) as Record<string, unknown>;
    const output = result?.output as Record<string, unknown> | undefined;
    const raw = output?.output ?? result?.content;
    const text = Array.isArray(raw)
      ? raw.map((p: any) => (typeof p === "string" ? p : (p?.text ?? ""))).join("\n")
      : typeof raw === "string"
        ? raw
        : "";
    const startMs = typeof metadata?.started === "number" ? metadata.started : null;
    const endMs = typeof metadata?.ended === "number" ? metadata.ended : null;
    const duration = startMs != null && endMs != null ? endMs - startMs : null;

    if (status === "error") {
      await observeV2(sid, "post_tool_failure", {
        tool_name: tool,
        call_id: callId,
        tool_input: safeSlice(event?.input, 4000),
        tool_output: safeSlice(text || extractErrorMessage(metadata?.error), 8000),
        duration_ms: duration,
      });
      // Mark the call as covered so `session.tool.failed`, which fires for the
      // same call, does not report the failure a second time.
      if (callId) reportedToolCalls.add(`${sid}:${callId}`);
      return;
    }

    await observeV2(sid, "post_tool_use", {
      tool_name: tool,
      call_id: callId,
      tool_input: safeSlice(event?.input, 4000),
      tool_output: safeSlice(text, 8000),
      title: (output?.title as string) ?? null,
      metadata: metadata,
      duration_ms: duration,
      attachments: Array.isArray(output?.attachments)
        ? (output?.attachments as Array<Record<string, unknown>>).map((a) => a.filename || a.url)
        : [],
    });
    if (callId) reportedToolCalls.add(`${sid}:${callId}`);
  });

  // ── chat.message -> ctx.session.hook("prompt") ───────────────────────────

  await ctx.session.hook("prompt", async (event: any) => {
    const sid = event?.sessionID || activeSessionId;
    if (!sid) return;
    const files = (event?.prompt?.files ?? [])
      .map((f: any) => (typeof f === "string" ? f : f?.uri ?? f?.filename ?? f?.url))
      .filter(Boolean) as string[];
    stashAdd(sid, files);
    await observeV2(sid, "prompt_submit", {
      prompt: (event?.prompt?.text ?? "").slice(0, 8000),
      files: files.slice(0, 20),
      agents: event?.prompt?.agents ?? [],
      skills: event?.prompt?.skills ?? [],
      delivery: event?.delivery ?? null,
    });
  });

  // ── memory injection -> ctx.session.hook("context") ───────────────────────
  // Fires on every model call, so recalled memory is injected on every call.
  // The previous version injected once per session, which meant the first
  // prompt carried memory and every later one did not. `system` is
  // `SystemPart[]`, so every push is a part object.

  await ctx.session.hook("context", async (event: any) => {
    const sid = event?.sessionID || activeSessionId;
    if (!sid) return;
    if (!Array.isArray(event.system)) return;

    // Tool instructions once per session: they are static, unlike memory.
    if (!contextInjectedSessions.has(sid)) {
      event.system.push({ type: "text", text: AGENTMEMORY_INSTRUCTIONS });
      contextInjectedSessions.add(sid);
    }

    // Recalled memory on every call. Prefer what /session/start already
    // returned for the first call of a session, then fall back to /context.
    let ctxText = startContextCache.get(sid);
    if (typeof ctxText !== "string" || ctxText.length === 0) {
      const result = await postJson("/context", { sessionId: sid, project: projectFor(sid).name });
      ctxText = (result as any)?.context;
    } else {
      startContextCache.delete(sid);
    }
    if (typeof ctxText === "string" && ctxText.length > 0) {
      event.system.push({ type: "text", text: ctxText });
    }

    // Per-file history for files about to be touched. Consumed on success so
    // the same file is not enriched twice.
    const stash = stashFor(sid);
    if (stash.size === 0) return;
    const files = [...stash].slice(0, 10);
    const enrichResult = await postJson("/enrich", { sessionId: sid, files, toolName: "enrich_inject" });
    const enrichCtx = (enrichResult as any)?.context;
    if (typeof enrichCtx === "string" && enrichCtx.length > 0) {
      event.system.push({ type: "text", text: enrichCtx });
      for (const f of files) stash.delete(f);
    }
  });

  // ── compaction ────────────────────────────────────────────────────────────
  // Removed: `ctx.session.hook("compaction")`.
  //
  // It registers without error and the callback is never invoked, even when
  // `ctx.session.compact()` is called directly and returns a compaction
  // message. The loader validates hook names at registration but not against
  // invocation, so a registered hook is not evidence that it fires.
  //
  // Compaction is therefore captured from `session.compaction.started` and
  // `session.compaction.failed` in the event switch below. The consequence is
  // that memory can no longer be attached to the compaction prompt, which is
  // recorded as a limitation rather than approximated: no compaction event
  // carries a `system` array to inject into.

  // ── event -> ctx.event.subscribe() ───────────────────────────────────────
  // All session activity arrives on the public event stream, aborted on unload.

  const controller = new AbortController();

  // The switch body lives in a function so its `return` statements skip only
  // the current event. Inline in the loop, they would exit the async IIFE and
  // permanently end the subscription.
  const handleEvent = async (event: any): Promise<void> => {
    const type = String(event?.type ?? "");
    // V2 puts the payload in `data`, not `properties`.
    const data: any = event?.data ?? {};
    const eventSid = typeof data.sessionID === "string" && data.sessionID ? data.sessionID : null;
    const sid0 = eventSid || activeSessionId;

    // A session that appears on any event is registered once, so /session/start,
    // the config flush and per-session state all happen.
    //
    // `session.created` exists on the V2 stream and carries `sessionID`, so a
    // session normally registers on creation, with `title` and `location`
    // available at that moment. The fallback to "first event carrying an ID"
    // is still needed for sessions that predate the plugin load, which never
    // emit `session.created`.
    //
    // Registration is tracked per session ID rather than gated on
    // `activeSessionId` being unset. Gating on the global meant the first
    // session claimed it and every later one, including a subagent child
    // session running alongside its parent, skipped this block entirely: no
    // `/session/start`, no `session_started`, and no per-session state, while
    // the switch below still emitted observations for that unregistered ID.
    if (eventSid && !registeredSessions.has(eventSid)) {
      if (!activeSessionId) activeSessionId = eventSid;
      stashedFiles.set(sid0, new Set());
      seenSubtaskIds.delete(sid0);
      seenToolCallIds.delete(sid0);
      contextInjectedSessions.delete(sid0);
      const dir = (data.location?.directory as string) || (event?.location?.directory as string) || null;
      if (dir) {
        sessionProjects.set(sid0, { cwd: dir, name: resolveProjectName(dir) });
      }
      const proj = projectFor(sid0);
      const startResult = await postJson("/session/start", {
        sessionId: sid0,
        title: (data.title as string) ?? null,
        parentID: (data.parentID as string) ?? null,
        project: proj.name,
        cwd: proj.cwd,
      });

      // Only mark the session registered once `/session/start` actually
      // returned. `postJson` yields `null` on any failure, and marking it before
      // the response would make the session permanently ineligible for
      // registration, so a start that failed while agentmemory was restarting
      // would never be retried for the rest of the process.
      if (startResult === null) {
        // Drop the per-session state this attempt created so a retry starts
        // clean, and leave `eventSid` out of the set.
        stashedFiles.delete(sid0);
        contextInjectedSessions.delete(sid0);
        if (activeSessionId === eventSid) activeSessionId = null;
        if (DEBUG) {
          console.error("[agentmemory] /session/start failed, will retry on the next event for", eventSid);
        }
        return;
      }
      registeredSessions.add(eventSid);

      const startCtx = (startResult as any)?.context;
      if (typeof startCtx === "string" && startCtx.length > 0) startContextCache.set(sid0, startCtx);
      // `session_started` is emitted at registration rather than from an event
      // of its own: `session.created` has no dedicated V1 counterpart to map
      // to, and emitting it here keeps `/session/start` and the first
      // observation in order for every session, including those that only
      // reach us through the fallback path.
      await observeV2(sid0, "session_started", {});
      if (pendingConfig) {
        await observeV2(sid0, "config_loaded", pendingConfig);
        pendingConfig = null;
      }
    }

    switch (type) {
      // The V1 event names below no longer exist on the V2 stream. They are
      // listed in README.md with the V2 name each one maps to, so the gaps are
      // documented rather than silently approximated.
      //
      //   session.created   -> registration above (it carries sessionID)
      //   session.deleted   -> handled, below
      //   session.status    -> session.step.started / session.step.ended
      //   session.idle      -> session.step.ended with finish
      //   message.updated   -> session.text.*, session.reasoning.*
      //   message.part.updated -> ctx.tool.hook("execute.after")
      //   todo.updated      -> no V2 equivalent observed
      //   file.edited       -> file.watcher.updated, handled below
      //   command.executed  -> shell.created, handled below
      //   session.compacted -> session.compaction.started / .failed, below
      //   session.diff      -> no V2 equivalent observed
      //   session.error     -> session.execution.failed, handled below

      case "session.execution.failed": {
        if (!sid0) return;
        await observeV2(sid0, "post_tool_failure", {
          tool_name: "session.execution",
          tool_input: "",
          tool_output: safeSlice(extractErrorMessage(data.error ?? data), 8000),
        });
        return;
      }

      // `session.execution.succeeded` is observed but deliberately not
      // recorded: it carries only `{ sessionID }`, which every other
      // observation in the session already carries, and `session.step.ended`
      // already covers the meaningful signal. Recording it would add volume,
      // not information.

      // Compaction is captured from the stream. Neither event carries a
      // `system` array, so this observes what happened rather than injecting
      // memory into the prompt, which the dead `compaction` hook could not do
      // either.
      case "session.compaction.started": {
        if (!sid0) return;
        await observeV2(sid0, "compaction_event", {
          state: "started",
          reason: (data.reason as string) ?? null,
          inputID: (data.inputID as string) ?? null,
          recent: safeSlice(data.recent, 8000),
        });
        return;
      }

      case "session.compaction.failed": {
        if (!sid0) return;
        await observeV2(sid0, "compaction_event", {
          state: "failed",
          reason: (data.reason as string) ?? null,
          inputID: (data.inputID as string) ?? null,
          tool_output: safeSlice(extractErrorMessage(data.error ?? data.reason), 8000),
        });
        return;
      }

      case "session.step.started": {
        if (!sid0) return;
        await observeV2(sid0, "step_start", {
          messageID: (data.assistantMessageID as string) ?? null,
          agent: (data.agent as string) ?? null,
          model: data.model ? `${data.model.providerID ?? ""}/${data.model.id ?? ""}` : null,
        });
        return;
      }

      case "session.step.ended": {
        if (!sid0) return;
        const tokens = (data.tokens ?? {}) as Record<string, any>;
        await observeV2(sid0, "step_finish", {
          messageID: (data.assistantMessageID as string) ?? null,
          reason: (data.rawFinish as string) ?? (data.finish as string) ?? null,
          cost: data.cost ?? 0,
          input_tokens: tokens.input ?? 0,
          output_tokens: tokens.output ?? 0,
          reasoning_tokens: tokens.reasoning ?? 0,
          cache_read: tokens.cache?.read ?? 0,
          cache_write: tokens.cache?.write ?? 0,
        });
        return;
      }

      case "session.usage.updated": {
        if (!sid0) return;
        const tokens = (data.tokens ?? {}) as Record<string, any>;
        await observeV2(sid0, "assistant_message", {
          messageID: null,
          modelID: null,
          providerID: null,
          cost: data.cost ?? 0,
          tokens: {
            input: tokens.input ?? 0,
            output: tokens.output ?? 0,
            reasoning: tokens.reasoning ?? 0,
            cache_read: tokens.cache?.read ?? 0,
            cache_write: tokens.cache?.write ?? 0,
          },
          finish: null,
          error: null,
          duration_ms: null,
        });
        return;
      }

      case "session.agent.selected": {
        if (!sid0) return;
        await observeV2(sid0, "agent_selected", {
          name: (data.agent as string) ?? null,
          previous: (data.previous as string) ?? null,
        });
        return;
      }

      case "session.text.started": {
        if (!sid0) return;
        await observeV2(sid0, "text_started", { messageID: (data.assistantMessageID as string) ?? null });
        return;
      }

      case "session.text.ended": {
        if (!sid0) return;
        await observeV2(sid0, "text_ended", { messageID: (data.assistantMessageID as string) ?? null });
        return;
      }

      case "session.reasoning.started":
      case "session.reasoning.ended": {
        if (!sid0) return;
        await observeV2(sid0, "reasoning", {
          messageID: (data.assistantMessageID as string) ?? null,
          text: safeSlice(data.text, 4000),
        });
        return;
      }

      case "session.instructions.updated": {
        if (!sid0) return;
        await observeV2(sid0, "notification", {
          notification_type: "instructions_updated",
          text: safeSlice(data.text, 4000),
        });
        return;
      }

      case "session.inbox.delivered": {
        if (!sid0) return;
        await observeV2(sid0, "prompt_delivered", { inboxID: (data.inboxID as string) ?? null });
        return;
      }

      case "shell.created": {
        const info = (data.info ?? {}) as Record<string, any>;
        const shellSid = (info.metadata?.sessionID as string) || sid0;
        if (!shellSid) return;
        if (info.id) shellSessions.set(String(info.id), shellSid);
        await observeV2(shellSid, "command_executed", {
          name: (info.shell as string) ?? null,
          arguments: safeSlice(info.command, 2000),
          cwd: (info.cwd as string) ?? null,
        });
        return;
      }

      // `shell.exited` carries `{ id, exit, status }` with no sessionID, so the
      // session is recovered from the id recorded at `shell.created`. A non-zero
      // exit is a real tool failure and is reported as one.
      case "shell.exited": {
        const shellId = String(data.id ?? "");
        const shellSid = shellSessions.get(shellId) || activeSessionId;
        if (!shellSid) return;
        const exit = Number(data.exit ?? 0);
        if (exit !== 0) {
          await observeV2(shellSid, "post_tool_failure", {
            tool_name: "shell",
            call_id: shellId,
            tool_input: null,
            tool_output: safeSlice(data.status, 4000),
            duration_ms: null,
          });
        }
        return;
      }

      case "shell.deleted": {
        const shellId = String(data.id ?? "");
        shellSessions.delete(shellId);
        return;
      }

      // Filesystem and VCS activity.
      case "file.watcher.updated":
      case "filesystem.changed":
      case "vcs.branch.updated": {
        const sid = sid0 || activeSessionId;
        if (!sid) return;
        const file = (data.file as string) ?? (data.path as string) ?? null;
        if (file) stashAdd(sid, [file]);
        return;
      }

      // Tool call lifecycle observed on the live stream:
      //   session.tool.input.started  { sessionID, assistantMessageID, id, name }
      //   session.tool.input.ended    { sessionID, assistantMessageID, id, text }
      //   session.tool.called         { sessionID, assistantMessageID, id, input, executed }
      //   session.tool.progress       { sessionID, assistantMessageID, id, metadata }
      //   session.tool.success        { sessionID, assistantMessageID, id, content, metadata, executed }
      //   session.tool.failed         { sessionID, assistantMessageID, id, error, executed }
      //
      // The tool name lives on the *input* events as `name`, not on the call
      // events, so it is tracked per call ID to label failures correctly.
      case "session.tool.input.started": {
        if (!sid0) return;
        if (data.id) toolNames.set(String(data.id), String(data.name ?? ""));
        return;
      }

      case "session.tool.input.ended": {
        if (!sid0) return;
        // The raw JSON text is the authoritative tool name; it is parsed lazily
        // by `session.tool.called`, which carries the real input object.
        if (data.id && typeof data.text === "string" && !toolNames.has(String(data.id))) {
          try {
            const parsed = JSON.parse(data.text);
            if (typeof parsed?.name === "string") toolNames.set(String(data.id), parsed.name);
          } catch {
            // Not JSON, or not a tool envelope: the name stays unknown.
          }
        }
        return;
      }

      case "session.tool.called": {
        if (!sid0) return;
        if (data.id) toolCallInputs.set(String(data.id), (data.input ?? {}) as Record<string, unknown>);
        return;
      }

      case "session.tool.progress": {
        if (!sid0) return;
        const callId = String(data.id ?? "");
        if (!callId || !FILE_TOOLS.has((toolNames.get(callId) ?? "").toLowerCase())) return;
        const input = toolCallInputs.get(callId);
        if (!input) return;
        stashAdd(sid0, extractFilePaths(input));
        return;
      }

      // The result is known here, so the per-call bookkeeping is released.
      // Without this, every successful call kept its name, its input (which for
      // `write` and `edit` is the whole file body) and its dedupe key for the
      // lifetime of the process.
      case "session.tool.success": {
        const callId = String(data.id ?? "");
        toolNames.delete(callId);
        toolCallInputs.delete(callId);
        if (sid0) reportedToolCalls.delete(`${sid0}:${callId}`);
        return;
      }

      case "session.tool.failed": {
        if (!sid0) return;
        const callId = String(data.id ?? "");
        // `execute.after` already reported this call with full detail.
        if (callId && reportedToolCalls.has(`${sid0}:${callId}`)) return;
        await observeV2(sid0, "post_tool_failure", {
          tool_name: toolNames.get(callId) || null,
          call_id: callId || null,
          tool_input: safeSlice(toolCallInputs.get(callId), 4000),
          tool_output: safeSlice(extractErrorMessage(data.error), 8000),
          duration_ms: null,
        });
        if (callId) {
          toolNames.delete(callId);
          toolCallInputs.delete(callId);
        }
        return;
      }

      // V1 listened to `permission.updated`; V2 renames it to `permission.asked`
      // and reshapes the payload to a PermissionRequest carrying `action` and
      // `resources`. Not observed firing during development, so both the V2
      // field names and the V1 fallbacks are read.
      case "permission.asked": {
        if (!sid0) return;
        const resources = (data.resources ?? data.patterns ?? []) as unknown;
        await observeV2(sid0, "notification", {
          notification_type: "permission_prompt",
          permission: (data.action as string) ?? (data.permission as string) ?? "unknown",
          pattern: Array.isArray(resources) ? resources.join(", ") : String(resources ?? ""),
          tool_call_id: (data.tool?.callID as string) ?? (data.callID as string) ?? null,
          title: (data.action as string) ?? (data.permission as string) ?? "",
          metadata: data.metadata ?? {},
        });
        return;
      }

      case "permission.replied": {
        if (!sid0) return;
        await observeV2(sid0, "permission_replied", {
          permission_id: (data.requestID as string) ?? (data.permissionID as string) ?? "",
          response: (data.reply as string) ?? (data.response as string) ?? "",
        });
        return;
      }

      case "session.deleted": {
        const sid = (data.sessionID as string) || activeSessionId;
        if (!sid) return;
        await post("/session/end", { sessionId: sid });
        // Background consolidation: deliberately not awaited.
        void post("/crystals/auto", { olderThanDays: 7 }, 30000);
        void post("/consolidate-pipeline", { tier: "all", force: true }, 30000);
        if (sid === activeSessionId) activeSessionId = null;
        registeredSessions.delete(sid);
        pruneSessionMaps(sid);
        startContextCache.delete(sid);
        contextInjectedSessions.delete(sid);
        // Drop this session's dedupe keys so they do not accumulate.
        for (const key of reportedToolCalls) {
          if (key.startsWith(`${sid}:`)) reportedToolCalls.delete(key);
        }
        return;
      }

      // Config and content changes re-take the snapshot instead of leaving the
      // one-shot reading from `setup` permanently stale.
      case "config.updated":
      case "agent.updated":
      case "provider.updated":
      case "model.updated":
      case "mcp.status.changed": {
        if (DEBUG) console.error("[agentmemory] config changed, re-snapshotting");
        void snapshotConfig().catch(() => {});
        return;
      }
    }
  };

  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        // A throw from one event must not end the subscription.
        try {
          await handleEvent(event);
        } catch (e) {
          if (DEBUG) console.error("[agentmemory] event handler failed:", (e as Error).message);
        }
      }
    } catch (e) {
      if (DEBUG) console.error("[agentmemory] event stream failed:", (e as Error).message);
    }
  })();

  return () => {
    controller.abort();
    startContextCache.clear();
    contextInjectedSessions.clear();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Dual export
//
// V1 calls `server()` and uses the returned hooks. V2 reads `id` and
// `setup()` and ignores `server()`. The V1 object form is supported in
// OpenCode 1.18.29 and newer; older V1 releases expect a function export, so
// the named export below is kept for direct imports.
// ═══════════════════════════════════════════════════════════════════════════

export default {
  id: "agentmemory-capture",
  setup: v2Setup,
  server: v1Hooks,
};

export const AgentmemoryCapturePlugin: Plugin = v1Hooks;
