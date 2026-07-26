import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspace } from "./workspace.js";

// Cursor fires camelCase lifecycle events; each one maps to the canonical
// hook compiled from src/hooks/*.ts. Keep this table the only place that
// knows Cursor's naming — everything downstream is the shared hook.
export const HOOK_MAP = {
  sessionStart: "session-start.mjs",
  beforeSubmitPrompt: "prompt-submit.mjs",
  preToolUse: "pre-tool-use.mjs",
  postToolUse: "post-tool-use.mjs",
  postToolUseFailure: "post-tool-failure.mjs",
  preCompact: "pre-compact.mjs",
  subagentStart: "subagent-start.mjs",
  subagentStop: "subagent-stop.mjs",
  stop: "stop.mjs",
  sessionEnd: "session-end.mjs",
} as const;

export type CursorHookKey = keyof typeof HOOK_MAP;

export function isCursorHookKey(value: unknown): value is CursorHookKey {
  return typeof value === "string" && value in HOOK_MAP;
}

// stop/sessionEnd fan out to summarize + consolidate on the daemon side, so
// they get a longer leash than the interactive hooks.
const SLOW_HOOKS = new Set<CursorHookKey>(["stop", "sessionEnd"]);

export type HookPayload = Record<string, unknown>;

export interface DelegateOptions {
  // Tests run against src/, where the canonical .mjs files do not sit one
  // level up. Bundled output resolves it correctly on its own.
  officialDir?: string;
}

// Bundled to plugin/scripts/cursor/<entry>.mjs, so the canonical hooks are
// exactly one directory up.
function defaultOfficialDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function enrichPayload(data: HookPayload): {
  project: string;
  payload: HookPayload;
} {
  const { project, cwd } = resolveWorkspace(data);
  return {
    project,
    payload: {
      ...data,
      session_id: data["session_id"] ?? data["sessionId"],
      cwd,
    },
  };
}

export function delegateHook(
  hookKey: CursorHookKey,
  data: HookPayload,
  options: DelegateOptions = {},
): number {
  const script = HOOK_MAP[hookKey];
  const { project, payload } = enrichPayload(data);
  const scriptPath = join(options.officialDir ?? defaultOfficialDir(), script);

  const child = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(payload),
    // resolveProject() in the canonical hooks reads this before falling back
    // to git/cwd, which is how the Cursor-specific resolution wins.
    env: { ...process.env, AGENTMEMORY_PROJECT_NAME: project },
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: SLOW_HOOKS.has(hookKey) ? 180000 : 30000,
  });

  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  return child.status ?? 0;
}
