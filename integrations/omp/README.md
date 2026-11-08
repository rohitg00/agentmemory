# AgentMemory for Oh My Pi

Native project recall, automatic capture and memory tools for Oh My Pi (OMP). Tested with OMP 18.12.6. The extension is included in `@agentmemory/agentmemory`; no separate npm package is required.

## Install

Start the installed AgentMemory server in one terminal:

```bash
agentmemory
```

After starting OMP once to create its configuration directory, connect it:

```bash
agentmemory connect omp --with-mcp
```

Restart OMP, run `/agentmemory-status`, then save a fact with `memory_save` and recall it in a new session with `memory_search`. Use the same project directory in both sessions.

The connector copies the built extension and 17 skills into `~/.omp/agent/agentmemory` and adds that directory to `extensions` in OMP's `config.yml` (or existing `config.yaml`). It preserves unrelated settings and comments. `--dry-run` previews the installation; `--force` replaces customized managed files with a backup. Re-run connect after upgrading AgentMemory. No checkout needs to remain on disk.

`--with-mcp` adds the full memory toolset through the installed AgentMemory MCP runtime. Without it, the native extension provides `memory_search`, `memory_save`, `memory_health` and automatic capture. The other skills require the MCP connection. An existing AgentMemory server in OMP's `mcp.json` is preserved; reconnect removes the connector's redundant managed MCP file. Customized managed files require `--force` and are backed up; unmanaged conflicts require manual cleanup. Review an existing server's endpoint and tool visibility yourself. Credentials are read at runtime, never copied into OMP configuration.

Use the same `OMP_PROFILE` (or `PI_PROFILE`), `PI_CONFIG_DIR` and `PI_CODING_AGENT_DIR` when connecting and launching OMP. Named profiles use their own `profiles/<name>/agent` directory. Project `extensions` arrays override the user array: include the installed package directory in that project array too. Enabling `--no-extensions` disables this integration.

### Existing checkout installations

If you previously used `omp plugin install ./integrations/omp`, uninstall that link before connecting:

```bash
omp plugin uninstall agentmemory-omp-extension
agentmemory connect omp --with-mcp
```

Remove any manually configured duplicate AgentMemory extension paths as well. Running two copies can double capture. For development, build the repository first and run `node scripts/plugins/prepare-native.mjs`, then `omp plugin install ./integrations/omp`. That development install remains linked to the checkout; optional MCP must be configured separately.

## Capabilities and commands

- Automatic project recall of memories and lessons before each prompt, supplied as reference data without replacing the host's instructions.
- Capture of prompts, successful and failed tool results, final replies, permission decisions and retry/compaction notifications. Session switching finalizes the previous session before starting the next.
- Memory context during compaction; optional context for files touched by tools.
- `memory_search`, `memory_save`, `memory_health` and `/agentmemory-status` work natively. Status includes offline queue, retained acknowledgements and dropped captures.
- Bundled skills cover remember, recall, recap, handoff, forgetting, lessons, session history and commit context/history, plus reference guides. OMP exposes skills through `/skill:<name>`; use the name shown in its completion menu if another package has the same skill name.
- `--with-mcp` makes the broader memory tools available, including sessions, lessons, governance, export and coordination. OMP exposes MCP operations as `xd://mcp__agentmemory_<tool>` devices through its `write` tool. Their scope is controlled by their arguments and backend configuration, so specify the intended project when needed.

Automatic capture uses AgentMemory's privacy scrubber before sending or queueing data. `<private>` blocks and recognized secrets are redacted; memory tools are excluded from capture to avoid recording their own recalled output. Capture limits do not truncate the tool output seen by the model.

## Offline behavior

Failed captures from network errors, timeouts, HTTP 408/429 and server errors enter the bounded local capture spool. OMP retries at session start, before prompts, every ten seconds and on `/agentmemory-status`. Event IDs prevent duplicate storage across retries. Acknowledgements are retained through the daemon's durability window to cover restarts.

The conversation continues when the daemon is unavailable. Explicit save/search tools report failure and are not queued. Authentication and other non-retryable client errors are reported instead of retried forever. Queue limits, disabled spooling or disk failures can still drop captures; inspect `/agentmemory-status`. Session finalization is best effort within OMP's two-second shutdown budget. Summary generation and consolidation run on the server.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | Daemon URL |
| `AGENTMEMORY_SECRET` | Local discovery | Explicit bearer token; loopback connections otherwise read `~/.agentmemory/.env` or `~/.agentmemory/secret` |
| `AGENTMEMORY_CREDENTIAL_MODE` | Unset | `explicit` disables local credential discovery |
| `AGENTMEMORY_PROJECT_NAME` | Git root or cwd basename | Project for native saves, recall and capture |
| `AGENTMEMORY_INJECT_CONTEXT` | Off | `1` enables file context enrichment |
| `AGENTMEMORY_CAPTURE_ALLOW` / `AGENTMEMORY_CAPTURE_DENY` | Default memory-tool exclusions | Comma/space separated tool names or globs; allow takes precedence |
| `AGENTMEMORY_CAPTURE_OUTPUT_MAX` | `8000` | Capture input/output character limit |
| `AGENTMEMORY_PRE_COMPACT_BUDGET` | `1500` | Memory context token budget; `0` disables it |
| `AGENTMEMORY_CAPTURE_SPOOL` | Enabled | `false` disables offline queueing |
| `AGENTMEMORY_CAPTURE_SPOOL_DIR` | `<data dir>/capture-spool` | Private local queue directory |
| `AGENTMEMORY_CAPTURE_SPOOL_MAX_BYTES` | `5242880` | Queue size limit |
| `AGENTMEMORY_CAPTURE_SPOOL_MAX_AGE_HOURS` | `168` | Maximum queued-event age |

Export remote URL and credentials in the environment that starts OMP. Bearer credentials require HTTPS for non-loopback hosts; redirects are refused. Reconnect with `--with-mcp` after moving or upgrading the installed npm package so its runtime path stays current.

To remove the connector installation, remove its directory from OMP's `extensions` array and then remove the copied `agentmemory` directory. Restart OMP. Existing user MCP entries and stored memories are independent.

Automated `connect` supports macOS/Linux and OMP running in the same WSL environment. Native Windows automated OMP setup is not supported.
