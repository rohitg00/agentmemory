import type { Plugin } from "@opencode-ai/plugin";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const API = process.env.AGENTMEMORY_URL || "http://localhost:3111";
// OpenCode reports tool names in lowercase ("read", "edit", ...); matching is
// case-insensitive at the call site so a future casing change cannot silently
// kill file enrichment again.
const FILE_TOOLS = new Set(["read", "write", "edit", "glob", "grep"]);
const FILE_KEYS = ["filePath", "file_path", "path", "file"];
const MAX_STASHED_FILES = 20;

const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const SECRET = process.env.AGENTMEMORY_SECRET || "";

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

async function postJson(path: string, body: Record<string, unknown>, timeoutMs = 5000): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
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

function projectFor(sessionId: string): { name: string; cwd: string } {
  const p = sessionProjects.get(sessionId);
  const name = p?.name || defaultProjectName || "default";
  const cwd = p?.cwd || defaultProjectCwd || process.cwd() || "/";
  return { name, cwd };
}

function isAppBundle(dir: string | undefined | null): boolean {
  if (!dir || typeof dir !== "string") return true;
  const d = dir.trim();
  return d.includes(".app/") || d.endsWith(".app");
}

function resolveCandidateDir(...candidates: (string | undefined | null)[]): string {
  for (const dir of candidates) {
    if (dir && typeof dir === "string" && dir.trim().length > 0 && !isAppBundle(dir)) {
      return dir.trim();
    }
  }
  return process.cwd() || "/";
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
      timeout: 1000,
    }).trim();
    if (top) {
      const name = basename(top);
      projectNameCache.set(dir, name);
      return name;
    }
  } catch {
    // not a git repo, fall through
  }
  const fallback = basename(dir) || dir || "default";
  projectNameCache.set(dir, fallback);
  return fallback;
}
const stashedFiles = new Map<string, Set<string>>();
const seenSubtaskIds = new Map<string, Set<string>>();
const seenToolCallIds = new Map<string, Set<string>>();
const contextInjectedSessions = new Set<string>();
const pendingSummarizeTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlightSummaries = new Set<string>();
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

function cancelPendingSummarize(sid: string): void {
  const timer = pendingSummarizeTimers.get(sid);
  if (timer) {
    clearTimeout(timer);
    pendingSummarizeTimers.delete(sid);
  }
}

function pruneSessionMaps(sid: string): void {
  cancelPendingSummarize(sid);
  inFlightSummaries.delete(sid);
  stashedFiles.delete(sid);
  seenSubtaskIds.delete(sid);
  seenToolCallIds.delete(sid);
  sessionProjects.delete(sid);
}

function scheduleSummarize(sid: string, delayMs = 3000): void {
  if (!sid || typeof sid !== "string") return;
  cancelPendingSummarize(sid);
  if (inFlightSummaries.has(sid)) return;

  const timer = setTimeout(async () => {
    pendingSummarizeTimers.delete(sid);
    if (inFlightSummaries.has(sid)) return;
    inFlightSummaries.add(sid);
    try {
      await post("/summarize", { sessionId: sid });
    } catch (err) {
      if (DEBUG) {
        console.error(`[agentmemory] Failed to post /summarize for session ${sid}:`, err);
      }
    } finally {
      inFlightSummaries.delete(sid);
    }
  }, delayMs);

  if (typeof (timer as any)?.unref === "function") {
    (timer as any).unref();
  }

  pendingSummarizeTimers.set(sid, timer);
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
      // Filter out glob patterns or regexes that aren't literal file paths
      if (!/[\*\?\{\}\[\]\(\)\|\^\$]/.test(val)) {
        files.push(val);
      }
    }
  }
  return files;
}

async function linkCommitIfApplicable(
  sid: string,
  inputArgs: Record<string, unknown> | undefined,
  outputResult: unknown,
  cwd?: string,
): Promise<void> {
  try {
    const inputCmd = typeof inputArgs?.command === "string" ? inputArgs.command : "";
    const outputStr = typeof outputResult === "string" ? outputResult : JSON.stringify(outputResult || "");
    if (!/\bgit\s+commit\b/.test(inputCmd) && !/\bgit\s+commit\b/.test(outputStr)) return;

    const shaMatch =
      outputStr.match(/\[[\w./\-]+ ([0-9a-f]{7,40})\]/) ||
      outputStr.match(/^([0-9a-f]{7,40})\s/m);
    if (!shaMatch) return;
    const sha = shaMatch[1];
    if (!sha) return;

    const effectiveCwd = cwd || projectFor(sid).cwd || process.cwd();
    const runGit = (args: string[]): string => {
      return execFileSync("git", args, {
        cwd: effectiveCwd,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf8",
        timeout: 2000,
      }).trim();
    };

    let branch = "";
    let repo = "";
    let message = "";
    let author = "";
    let files: string[] = [];
    try {
      branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      const top = runGit(["rev-parse", "--show-toplevel"]);
      repo = top ? basename(top) : projectFor(sid).name;
      message = runGit(["log", "-1", "--format=%B", sha]);
      author = runGit(["log", "-1", "--format=%an", sha]);
      files = runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]).split("\n").filter(Boolean);
    } catch {
      // git lookup fallback
    }

    await postJson(
      "/session/commit",
      {
        sessionId: sid,
        sha,
        branch: branch || "main",
        repo: repo || projectFor(sid).name,
        message: message || "git commit",
        author: author || "unknown",
        files,
      },
      3000,
    );
    if (DEBUG) console.error(`[agentmemory] Linked commit ${sha} -> ${sid}`);
  } catch (e) {
    if (DEBUG) console.error("[agentmemory] commit link failed:", (e as Error).message);
  }
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

export const AgentmemoryCapturePlugin: Plugin = async (ctx) => {
  defaultProjectCwd = resolveCandidateDir(
    ctx.worktree,
    (ctx as any)?.project?.directory,
    (ctx as any)?.directory,
    ctx.project?.id,
    process.cwd(),
  );
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
        // Skip macOS .app bundles from Desktop mode so we resolve the real project path.
        const sessionDir = resolveCandidateDir(
          typeof info?.directory === "string" ? info.directory : undefined,
          (ctx as any)?.project?.directory,
          (ctx as any)?.directory,
          ctx.worktree,
          ctx.project?.id,
          defaultProjectCwd,
          process.cwd(),
        );
        const proj = { cwd: sessionDir, name: resolveProjectName(sessionDir) };
        sessionProjects.set(sessionId, proj);
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

      // ── session.idle ──
      if (type === "session.idle") {
        const sid = props.sessionID || activeSessionId;
        if (sid) {
          scheduleSummarize(sid);
        }
      }

      // ── session.status ──
      if (type === "session.status") {
        const status = props.status as Record<string, unknown> | undefined;
        const sid = props.sessionID || activeSessionId;
        if (!sid || !status) return;
        if (status.type === "idle") {
          scheduleSummarize(sid);
        } else {
          cancelPendingSummarize(sid);
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
          scheduleSummarize(sid);
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
          const callId = (part.callID as string) || (part.id as string);
          if (!callId) return;
          const toolName = part.tool as string;

          if (state.status === "completed") {
            const callSet = toolCallSetFor(sid);
            if (callSet.has(callId)) return;
            callSet.add(callId);
            const st = state as Record<string, unknown>;
            if (toolName === "bash" || toolName === "shell") {
              await linkCommitIfApplicable(sid, st.input as any, st.output, projectFor(sid).cwd);
            }
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
      cancelPendingSummarize(sid);
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

      // Skip internal/title-generator LLM requests — OpenCode fires an internal concurrent
      // title request on turn 1 using the same sessionID. If injected there, the title
      // generator consumes the one-time injection and the main conversation turn gets nothing! (Issue #1184)
      if (Array.isArray(output.system)) {
        const isInternalTitle = output.system.some(
          (s: string) =>
            typeof s === "string" &&
            /title generator|generate a (short|concise|brief) title|title for this conversation|thread title/i.test(s),
        );
        if (isInternalTitle) return;
      }

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

      // Note: We deliberately do NOT push per-turn dynamic file enrichment into output.system
      // because mutating the system prompt on subsequent turns invalidates LLM prompt/prefix caching (#720),
      // creating an unnecessary 12.5x-20x cost multiplier. Instead, volatile file enrichment is attached
      // in-memory to the tail of user message parts in `experimental.chat.messages.transform`.
    },

    // ── experimental.chat.messages.transform ──
    // In-memory message transform hook: attaches volatile file enrichment context to the tail
    // of the latest user message in-memory without touching SQLite durable events or creating UI clutter.
    "experimental.chat.messages.transform": async (input, output) => {
      const msgs = output?.messages;
      if (!Array.isArray(msgs) || msgs.length === 0) return;

      const lastUserMsg = msgs.filter((m: any) => m.info?.role === "user").pop();
      if (!lastUserMsg) return;
      const sid = lastUserMsg.info?.sessionID || activeSessionId;
      if (!sid) return;

      const stash = stashFor(sid);
      if (stash.size === 0) return;

      const stashedFileList = [...stash].slice(0, 10);
      for (const f of stashedFileList) stash.delete(f);

      const proj = projectFor(sid);
      try {
        const enrichResult = await postJson(
          "/enrich",
          {
            sessionId: sid,
            files: stashedFileList,
            project: proj.name,
            toolName: "enrich_inject",
          },
          3000,
        );
        const enrichCtx = (enrichResult as any)?.context;
        if (typeof enrichCtx === "string" && enrichCtx.length > 0 && Array.isArray(lastUserMsg.parts)) {
          const textPart = lastUserMsg.parts.filter((p: any) => p.type === "text").pop() as any;
          if (textPart) {
            textPart.text = (textPart.text || "") + `\n\n<agentmemory-file-context>\n${enrichCtx}\n</agentmemory-file-context>`;
          }
        }
      } catch (e) {
        if (DEBUG) console.error("[agentmemory] enrich injection failed:", (e as Error).message);
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
