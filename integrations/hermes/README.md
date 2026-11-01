# AgentMemory for Hermes Agent

The native provider adds automatic recall, conversation capture, and three memory tools to Hermes. Its default memory scope follows the active Hermes profile and, on a messaging gateway, the author of each turn. The connector installs the provider and the bundled skills from the same AgentMemory package.

## Setup

Start AgentMemory in a separate terminal, then connect the installed package to Hermes:

```bash
agentmemory
```

```bash
agentmemory connect hermes
hermes memory setup
hermes memory status
```

In the Hermes setup wizard, select AgentMemory and enter the backend URL and its bearer credential. An optional project name overrides workspace detection. Run the commands with the same `HERMES_HOME` used to launch Hermes; without it, the connector uses `~/.hermes`.

The connector installs the provider into `$HERMES_HOME/plugins/agentmemory` and the skills into `$HERMES_HOME/skills/agentmemory`, then enables the provider in `config.yaml`. It preserves unrelated YAML settings. Existing custom provider files, disabled integrations, and a different selected memory provider require an explicit `--force` replacement, with a backup. Use `--dry-run` to inspect the intended changes.

The connector does not start the backend or verify authentication. `hermes memory status` checks configuration and provider loading. A real save and recall verifies connectivity:

1. Start a new Hermes session and ask it to remember a distinctive, non-sensitive fact using `memory_save`.
2. Start another session under the same Hermes home and project, then ask it to recall that fact using `memory_recall`.
3. Restart AgentMemory with the same data directory and repeat the recall.
4. Use a different Hermes home with the same project and workspace. Default native recall should not return the first profile's fact.

## Credentials and profile scope

The provider reads credentials only through Hermes's `agent.secret_scope.get_secret` API. Hermes manages the values entered through its setup wizard. The provider never reads AgentMemory's `.env` or `secret` files, and ignores legacy credentials in `agentmemory.json`. If the backend generated a local secret, supply that credential through Hermes setup as well.

URL precedence is the active Hermes scope's `AGENTMEMORY_URL`, the active home's non-secret `agentmemory.json`, then `http://localhost:3111`. `save_config` writes only the validated URL. A missing scoped credential API, a missing routed-profile scope, or a mismatch between the active home and credential scope fails closed. An initialized provider cannot send requests under another profile or endpoint. Same-endpoint credential rotations apply on the next request; changing the endpoint or explicit identity requires a fresh session.

| Variable | Default | Purpose |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | HTTP or HTTPS backend endpoint |
| `AGENTMEMORY_SECRET` | Unset | Bearer credential resolved by Hermes |
| `AGENTMEMORY_PROJECT_NAME` | Active workspace's repository or directory name | Explicit project scope |
| `AGENTMEMORY_AGENT_ID` | Derived from the Hermes home and author | Deliberate shared identity override |
| `AGENTMEMORY_REQUIRE_HTTPS` | Off | Process policy: refuse bearer authentication over remote plaintext HTTP |

The default `agentId` is a deterministic hash of the canonical Hermes home and the local or gateway-author identity. Backend session IDs also include that identity, so equal Hermes session IDs in separate profiles or gateway authors do not collide. New sessions and restarts under the same profile retain the same default identity. Moving a profile to another directory creates a new default scope.

Hermes supplies the active workspace as `cwd` when available. The provider otherwise uses Hermes's runtime workspace, then the local CLI working directory or nonlocal profile home. `AGENTMEMORY_PROJECT_NAME` provides a deliberate override. Gateway author changes are applied per turn; a gateway turn without an author cannot fall back to the profile's previous author. Background writes retain the context of the originating turn. Subagent, cron, and flush contexts do not write native memory.

Native `memory_save`, `memory_recall`, and `memory_search` default to the current project and identity. They accept explicit `project` and `agentId` arguments for a deliberately selected scope; wildcard identities are rejected. `AGENTMEMORY_AGENT_ID` can deliberately share an identity across profiles. These filters are application-level scope, not separate server credentials or a replacement for access control. Legacy unscoped records are not automatically included in native recall.

Remote plaintext HTTP emits a warning unless HTTPS is required. Redirects are refused. Authentication failures and unavailable servers return errors, never an empty successful recall result or a save into a fallback store.

## Lifecycle and limits

- `system_prompt_block` supplies static tool guidance. Recalled content enters through `prefetch` with project and identity filters.
- `on_turn_start` records the current author in context-local state.
- `sync_turn` captures conversation text through Hermes's serialized background worker.
- `on_session_switch` ends the previous session and binds later writes to the new session.
- `on_session_end` completes the current session; failed completion requests remain retryable.
- `on_pre_compress` returns bounded, scoped recall without changing the transcript.
- `on_memory_write` mirrors native add and replacement content.

Capture retains up to 500 user characters and 2,000 assistant characters per turn. It does not capture individual tool executions. Automatic recall and compression context exclude project-wide lessons because those records do not carry the provider's author scope.

Native replacement evolves a record only when Hermes supplies its full `previous_content` and the provider has the exact backend ID from its own earlier write. A profile-local ownership file, keyed by endpoint, project, and identity, preserves that mapping across restarts. If another client has already evolved the record, the server rejects the conflict. Older notifications without previous-content identity save the replacement and report that the earlier record could not be superseded. Removing a native Hermes entry does not delete AgentMemory records; use an explicit AgentMemory deletion tool with verified record IDs.

Compression context is best effort, not checkpoint API v2. Shutdown waits for in-flight writes within a bounded deadline. There is no durable offline queue, and repeated notifications without a stable event ID are not deduplicated by the provider.

## Optional MCP tools

Native setup includes save, recall, and search. Enable the wider AgentMemory tool surface only when needed:

```bash
agentmemory connect hermes --with-mcp
```

This adds a bundled stdio bridge under `mcp_servers.agentmemory` in the same profile's `config.yaml`. It uses the installed package, requires the configured backend, and obtains URL and secret values from Hermes. It does not fetch a second npm runtime or silently create a standalone memory store. Re-run the connector after upgrading to refresh the installed provider and skills. Existing MCP entries are preserved; if the package location changed, review any custom MCP settings and run `agentmemory connect hermes --with-mcp --force` to refresh its absolute runtime path with a backup.

The MCP bridge does not enforce the native provider's profile or author filters. Its tools include operations across the configured backend. Enable it only for a trusted, deliberately shared backend, or use a separate AgentMemory instance and credential for each isolated user. A workflow requiring tools beyond native save, recall, and search needs this explicit MCP connection; use the names exposed by Hermes's tool catalog.

The skills are installed with the native provider. Verify discovery with Hermes's `skills_list` and `skill_view`. Each skill includes its referenced support files.

## Verification

Run `python3 test/hermes-provider-contracts.py` or `npx vitest run test/hermes-plugin.test.ts` for the provider regression suite. The packaged runtime harness in `test/hermes-native-e2e.py` exercises the real Hermes loader and CLI against the installed AgentMemory daemon. The separate `test/hermes-live-model.py` harness tests real model conversations, fresh-session recall, and profile isolation. Use each harness's `--help` for isolated runtime inputs.
