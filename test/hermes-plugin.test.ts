import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { parse } from "yaml";

const PYTHON = execFileSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();

const HERMES_PLUGIN_HOOKS = new Set([
  "agent_loop_stopped", "api_request_error", "gateway_platform_event", "kanban_task_blocked",
  "kanban_task_claimed", "kanban_task_completed", "on_human_input_request", "on_human_input_resolved",
  "on_interim_message", "on_kanban_dispatch_tick", "on_kanban_task_updated", "on_kanban_worker_exited",
  "on_kanban_worker_spawned", "on_kanban_worker_stale_claim", "on_room_member_activity", "on_session_delete",
  "on_session_end", "on_session_finalize", "on_session_open", "on_session_reset", "on_session_start",
  "on_skill_lifecycle", "on_stream_delta", "on_stream_end", "on_stream_start", "post_api_request",
  "post_approval_response", "post_auxiliary_call", "post_compaction", "post_curator_run",
  "post_gateway_admission", "post_llm_call", "post_tool_call", "pre_api_request", "pre_approval_request",
  "pre_auxiliary_call", "pre_command", "pre_gateway_dispatch", "pre_llm_call", "pre_tool_call",
  "pre_transcription", "pre_verify", "subagent_start", "subagent_stop", "transform_api_error_classification",
  "transform_llm_output", "transform_terminal_output", "transform_tool_result",
]);

const HERMES_MEMORY_PROVIDER_METHODS = new Set([
  "system_prompt_block", "prefetch", "queue_prefetch", "sync_turn", "on_turn_start", "on_session_end",
  "on_session_switch", "on_pre_compress", "on_delegation", "on_memory_write", "on_profile_created",
  "on_profile_renamed",
]);

const expectedProviderMethods = [
  "on_turn_start",
  "system_prompt_block",
  "prefetch",
  "queue_prefetch",
  "sync_turn",
  "on_session_end",
  "on_session_switch",
  "on_pre_compress",
  "on_memory_write",
];

function readManifest(): Record<string, unknown> {
  return parse(readFileSync("integrations/hermes/plugin.yaml", "utf8"));
}

function readProviderMethods(): string[] {
  const source = readFileSync("integrations/hermes/__init__.py", "utf8");
  const start = source.indexOf("class AgentMemoryProvider(");
  const methods: string[] = [];
  for (const match of source.slice(start).matchAll(/^    def ([a-z_][a-z0-9_]*)\(/gm)) {
    if (HERMES_MEMORY_PROVIDER_METHODS.has(match[1])) methods.push(match[1]);
  }
  return methods;
}

describe("Hermes plugin manifest", () => {
  it("declares only hooks that Hermes plugins doctor accepts", () => {
    const manifest = readManifest();
    const declared = [
      ...((manifest.provides_hooks as string[] | undefined) ?? []),
      ...((manifest.hooks as string[] | undefined) ?? []),
    ];

    for (const hook of declared) expect(HERMES_PLUGIN_HOOKS.has(hook), hook).toBe(true);
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.provides_hooks).toEqual([]);
  });

  it("declares no hooks because registration adds none", () => {
    const source = readFileSync("integrations/hermes/__init__.py", "utf8");
    expect(source).not.toContain("register_hook");
    expect(source).toContain("ctx.register_memory_provider(AgentMemoryProvider())");
  });

  it("requires a Hermes version with the memory provider lifecycle it implements", () => {
    expect(readManifest().requires_hermes).toBe(">=0.21.6");
    expect(readProviderMethods()).toEqual(expectedProviderMethods);
  });

  it("satisfies native provider runtime and credential contracts", () => {
    const result = spawnSync(PYTHON, ["test/hermes-provider-contracts.py", "-v"], {
      encoding: "utf8",
      timeout: 60_000,
      env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: "1" },
    });
    const diagnostics = [result.error?.message, result.signal, result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n");
    expect(result.status, diagnostics).toBe(0);
  }, 70_000);
});
