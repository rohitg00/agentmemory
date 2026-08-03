#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Antigravity CLI (`agy`) bridge.
//
// Antigravity ships a first-party hooks system, but its contract differs
// from the Claude Code / Codex / Droid family in three ways that make the
// bundled hook scripts unusable as direct `command` targets:
//
//   1. Only five events exist — PreToolUse, PostToolUse, PreInvocation,
//      PostInvocation, Stop. There is no SessionStart, SessionEnd or
//      UserPromptSubmit, so the session lifecycle has to be synthesized
//      from PreInvocation (first invocation) and Stop.
//   2. The stdin payload is camelCase and nested: tool calls arrive as
//      `toolCall.name` + `toolCall.args` (args themselves PascalCase, e.g.
//      `AbsolutePath`, `TargetFile`, `Query`), and the session key is
//      `conversationId`, not `session_id`.
//   3. stdout must be a JSON object. `pre-tool-use.mjs` writes raw context
//      text when AGENTMEMORY_INJECT_CONTEXT=true, which Antigravity would
//      fail to parse as a PreToolUse decision.
//
// So this bridge sits in front of the canonical hooks: it normalizes the
// payload into the shape they already accept, pipes it to the right
// script(s), discards their stdout, and emits the minimal well-formed
// response for the event. Auto-capture is the goal; the bridge never blocks
// or rewrites a tool call — see `responseFor` for why PreToolUse is the one
// event that cannot answer with a bare `{}`.
//
// Invoked as: node antigravity-bridge.mjs <PreInvocation|PreToolUse|PostToolUse|Stop>
// Sources: antigravity.google/docs/hooks, antigravity.google/docs/cli/using

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

// Antigravity inherits Cascade-style tool names. Map them onto the tool
// vocabulary pre-tool-use.ts / post-tool-use.ts already understand so the
// existing file-activity heuristics keep working unchanged.
const TOOL_NAME_MAP: Record<string, string> = {
  view_file: "read",
  view_line_range: "read",
  view_code_item: "read",
  read_file: "read",
  read_url_content: "read",
  edit_file: "edit",
  replace_file_content: "edit",
  propose_code: "edit",
  write_to_file: "write",
  create_file: "write",
  grep_search: "grep",
  codebase_search: "grep",
  find_by_name: "glob",
  list_dir: "glob",
};

// Antigravity tool args are PascalCase; the canonical hooks look for
// snake_case keys. Only the keys those hooks actually read are mapped.
const ARG_KEY_MAP: Record<string, string> = {
  AbsolutePath: "file_path",
  TargetFile: "file_path",
  DirectoryPath: "path",
  SearchDirectory: "path",
  Pattern: "pattern",
  Query: "pattern",
  CommandLine: "command",
};

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function normalizeToolArgs(args: Json | undefined): Json {
  if (!args) return {};
  const out: Json = { ...args };
  for (const [from, to] of Object.entries(ARG_KEY_MAP)) {
    if (out[to] === undefined && args[from] !== undefined) out[to] = args[from];
  }
  return out;
}

/**
 * Translate one Antigravity hook payload into the flat, snake_case shape
 * the bundled hooks consume. Unknown fields are passed through so future
 * Antigravity additions stay visible to the capture pipeline.
 */
export function normalizePayload(event: string, raw: Json): Json {
  const toolCall = asObject(raw["toolCall"]);
  const workspacePaths = Array.isArray(raw["workspacePaths"])
    ? (raw["workspacePaths"] as unknown[])
    : [];

  const sessionId =
    firstString(raw["conversationId"], raw["session_id"], raw["sessionId"]) ??
    "unknown";
  const cwd =
    firstString(raw["cwd"], workspacePaths[0]) ?? process.cwd();

  const out: Json = {
    ...raw,
    session_id: sessionId,
    cwd,
    hook_event_name: event,
  };

  const transcriptPath = firstString(
    raw["transcript_path"],
    raw["transcriptPath"],
  );
  if (transcriptPath) out["transcript_path"] = transcriptPath;

  if (toolCall) {
    const args = normalizeToolArgs(
      asObject(toolCall["args"]) ?? asObject(toolCall["toolArgs"]),
    );
    const rawName = firstString(
      toolCall["name"],
      toolCall["toolName"],
      args["ToolName"],
      args["toolName"],
    );
    if (rawName) {
      out["tool_name"] = TOOL_NAME_MAP[rawName] ?? rawName;
      // Keep the host-native name so captured observations stay traceable
      // back to the tool Antigravity actually ran.
      out["native_tool_name"] = rawName;
    }
    out["tool_input"] = args;
    const result = toolCall["result"] ?? raw["toolResult"] ?? raw["result"];
    if (result !== undefined) out["tool_result"] = result;
  }

  return out;
}

/**
 * Map an Antigravity event to the bundled scripts it should drive.
 *
 * PreInvocation stands in for both SessionStart and UserPromptSubmit: the
 * first invocation of a conversation opens the session, every later one is
 * a fresh user turn. PostInvocation is deliberately unmapped — PostToolUse
 * already captures the work, and firing again would double-record it.
 */
export function targetsFor(event: string, raw: Json): string[] {
  switch (event) {
    case "PreInvocation": {
      const n = raw["invocationNum"];
      const isFirst = typeof n !== "number" || n <= 1;
      return isFirst
        ? ["session-start.mjs", "prompt-submit.mjs"]
        : ["prompt-submit.mjs"];
    }
    case "PreToolUse":
      return ["pre-tool-use.mjs"];
    case "PostToolUse":
      return ["post-tool-use.mjs"];
    case "Stop":
      return ["stop.mjs", "session-end.mjs"];
    default:
      return [];
  }
}

/**
 * The stdout contract, per event.
 *
 * Antigravity documents `decision` as a *required* field of PreToolUse hook
 * output, and agy treats a response that omits it as a denial: a bare `{}`
 * on PreToolUse makes the agent refuse every matched tool call (reported
 * against agy 1.0.5 in cmux#5358). A passive capture hook must therefore say
 * `allow` explicitly. No other event carries a permission decision, so they
 * stay on `{}` — emitting `decision` or `terminationBehavior` there would
 * override the user's own settings.
 */
export function responseFor(event: string): string {
  return event === "PreToolUse" ? '{"decision":"allow"}' : "{}";
}

async function main() {
  const event = process.argv[2];
  if (!event) return;

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let raw: Json;
  try {
    raw = JSON.parse(input) as Json;
  } catch {
    return;
  }
  if (!raw || typeof raw !== "object") return;

  const payload = JSON.stringify(normalizePayload(event, raw));

  for (const script of targetsFor(event, raw)) {
    // Synchronous so the hook process does not exit before the capture
    // POSTs are issued. Each bundled hook already caps its own fetch
    // timeout, so the worst case here is bounded by those.
    spawnSync(process.execPath, [join(SCRIPTS_DIR, script)], {
      input: payload,
      // Child stdout is discarded on purpose: Antigravity parses this
      // process's stdout as the hook response, and the bundled scripts
      // emit prose when context injection is enabled.
      stdio: ["pipe", "ignore", "ignore"],
    });
  }
}

// Guarded so the pure helpers above stay importable from tests without the
// module blocking on stdin. Every other bundled hook is a leaf script and
// needs no such guard.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main()
    .catch(() => {})
    .finally(() => {
      // Always a well-formed, non-blocking response, emitted even when the
      // capture above threw or the payload was unparseable — a hook that
      // writes nothing is as fatal to PreToolUse as one that writes `{}`.
      process.stdout.write(responseFor(process.argv[2] ?? ""));
      process.exit(0);
    });
}
