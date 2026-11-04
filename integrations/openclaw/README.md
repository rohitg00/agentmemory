# agentmemory for OpenClaw

The native plugin recalls relevant project memories before a turn and captures completed user/assistant conversations. It includes the shared AgentMemory skills. Start the AgentMemory backend before testing either capture or recall.

## Install and configure

```bash
npm install -g @agentmemory/agentmemory
agentmemory connect openclaw --dry-run
agentmemory connect openclaw
```

The connector installs the packaged plugin and its skills before activating it in the native configuration. It honors `OPENCLAW_STATE_DIR`, `OPENCLAW_HOME` and `OPENCLAW_CONFIG_PATH`; the default is `~/.openclaw/openclaw.json`. Use the same environment as the OpenClaw profile you intend to configure. For a named profile, set `OPENCLAW_STATE_DIR` to that profile's state directory before connecting.

Setup preserves unrelated settings, supports JSON5, backs up changed configuration and checks managed plugin files before upgrading. A different selected memory provider, disabled conversation access or locally modified installation requires an explicit `--force`. Failed activation rolls back the plugin changes. Authentication is verified only by a successful request after setup.

Run `agentmemory` in another terminal, then restart OpenClaw and validate its configuration with `openclaw config validate`. A new conversation should produce an AgentMemory observation; a fresh session in the same profile should recall it.

The connector selects `plugins.slots.memory: "agentmemory"` and grants `hooks.allowConversationAccess` for capture. A separately configured `hooks.allowPromptInjection: false` still disables recalled context. Copying the source folder manually does not record native installation provenance; use the connector or the host's installer with a prepared archive.

## Credentials

`plugins.entries.agentmemory.config.base_url` overrides `AGENTMEMORY_URL`; the default is `http://localhost:3111`. Use HTTPS for a remote backend.

For an explicitly scoped credential, set `secret_env` to the **name** of an environment variable supplied to this OpenClaw profile:

```json
{
  "plugins": {
    "entries": {
      "agentmemory": {
        "config": {
          "base_url": "https://memory.example.com",
          "secret_env": "WORK_MEMORY_SECRET"
        }
      }
    }
  }
}
```

Keep the value in the host's environment or secret management, not in this configuration. A missing or unresolved named variable never falls back to another key. Without `secret_env`, the plugin uses `AGENTMEMORY_SECRET`, then the local `~/.agentmemory/.env` or generated `~/.agentmemory/secret` for loopback endpoints only. File lookup remains bound to the home where the plugin registered. Remote endpoints require an explicit environment credential.

Same-endpoint credential rotations take effect on the next request. Endpoint or credential-variable configuration changes require a plugin reload; an old instance refuses to send a new credential to its previous endpoint. Redirects are refused. `AGENTMEMORY_REQUIRE_HTTPS=1` rejects bearer authentication to remote plaintext HTTP; otherwise that combination warns once.

## Profiles and lifecycle

Automatic recall and capture derive a stable backend agent identity from the active OpenClaw state directory and native agent ID. Sessions are also namespaced. Two profiles sharing a workspace and backend cannot collide solely because both use the native agent name `main` or the same session key. A new session or restart within the same profile retains its memory scope. Moving a profile directory changes that identity.

Project resolution follows `AGENTMEMORY_PROJECT_NAME`, the canonical Git repository name (including linked worktrees), then the workspace basename. Missing workspace or session metadata skips capture/recall with a warning. Automatic recall searches and expands results with both project and profile-agent filters. Legacy unscoped memories and other clients' agent scopes are not automatically included. This is retrieval partitioning, not separate backend authorization or per-sender isolation within a shared gateway profile.

The plugin registers only `before_prompt_build` for recall, avoiding duplicate injection on hosts that still expose the older hook. `agent_end` captures the latest completed user/assistant turn, bounded to 1,000 and 4,000 characters respectively. It does not capture individual tool executions. Stable event IDs make duplicate callbacks retryable. Session startup binds the scoped identity before capture, and `session_end` drains pending captures before finalizing a known session.

Configuration supports `token_budget` (0 to 32,000; zero disables recall), `min_confidence` (0 to 1), `timeout_ms` (1 to 60,000), and `fallback_on_error`. The token budget bounds the complete injected context at approximately four UTF-8 bytes per token. Fallback warns and lets a turn continue; it does not queue failed captures for later delivery. The memory-slot capability supplies a prompt builder and uses the AgentMemory REST API, rather than implementing OpenClaw's in-process memory runtime.

## Optional full MCP tools

```bash
agentmemory connect openclaw --with-mcp
```

This adds `mcp.servers.agentmemory`, pointing to the exact installed package's `dist/standalone.mjs`, with forced proxy mode. Keep that package installation available and rerun setup after moving it. Existing custom MCP settings are preserved unless `--force` is supplied. The connector migrates its recognized older `mcpServers.agentmemory` entry; unrelated legacy entries require separate migration.

MCP exposes the full shared backend tool surface. It does not enforce the native plugin's automatic profile filters and is suitable only for a deliberately shared, trusted backend. Skills requiring `memory_*` tools need this connection; native recall/capture itself does not. Verify the tools shown by the host before running a skill. Existing MCP connections are not removed by native-only setup.

## Package and verify

From a source checkout, build the standalone archive with:

```bash
npm run skills:gen
npm run plugin:pack:openclaw
```

This prepares `dist/plugins/agentmemory-<version>.tgz` with plugin metadata, license and all 17 skills including their supporting files. Root `npm pack` also prepares these resources automatically. These commands create local artifacts and do not publish them.

The native release gate accepts an installed AgentMemory package and real host binaries:

```bash
node scripts/release-gate/openclaw.mjs \
  --package-root /path/to/node_modules/@agentmemory/agentmemory \
  --node /path/to/node \
  --openclaw-cli /path/to/openclaw/openclaw.mjs \
  --engine /path/to/iii \
  --out /tmp/agentmemory-openclaw-gate
```

Repeat `--openclaw-cli` to exercise additional hosts. The deterministic gate inspects model and backend traffic. `scripts/release-gate/openclaw-live.mjs` exercises real model conversations with separate profiles and a backend restart; see `docs/native-integration-tests.md` for its required isolated runtime inputs.
