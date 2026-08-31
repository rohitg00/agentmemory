# Install agentmemory (agent runbook)

You are a coding agent. Follow this runbook top to bottom to install agentmemory, wire it into yourself, and verify that persistent memory works. Run each command, check the result against the "Expect" note, then move on. If a step fails, jump to Troubleshooting, and if it still fails, stop and report the step, the exact command, and the error output.

## What you are installing

agentmemory is a local memory server for coding agents. It exposes a REST API and MCP HTTP routes on port 3111, streams on 3112, a viewer on 3113, and connects its worker to iii-engine on 49134. It is built on the iii engine, which agentmemory manages as a pinned v0.11.2 binary under `~/.agentmemory/bin` on macOS/Linux or `%USERPROFILE%\.agentmemory\bin` on Windows.

Configuration and the managed iii binary live under `~/.agentmemory`. Persistent iii state uses the platform data directory: `~/Library/Application Support/agentmemory` on macOS, `$XDG_DATA_HOME/agentmemory` or `~/.local/share/agentmemory` on Linux, and `%APPDATA%\agentmemory` on Windows. Override it with `--data-dir <path>` or `AGENTMEMORY_DATA_DIR`; use the same override on every restart. For instance 0, an existing `./data/state_store.db` or `./data/iii-config.yaml` takes precedence over the platform default, while an explicit flag or environment override still wins. Native and Docker starts use the same resolved host data directory.

Default keyless mode needs no API key or cloud account and disables vector embeddings. `memory_recall` (`mem::search`) uses BM25, while `memory_smart_search` can also fuse structural graph matches when graph data exists. Semantic vector recall is an explicit opt-in: set `EMBEDDING_PROVIDER=local` for on-device `Xenova/all-MiniLM-L6-v2`, or configure a supported remote embedding provider. Local inference is free, but the first embedding request downloads the model and therefore needs network access and extra startup time. An LLM provider is separate; LLM-written observation compression requires both a provider and `AGENTMEMORY_AUTO_COMPRESS=true`.

## Prerequisites

- Node.js >= 20 with npm and npx. Check with `node -v`, `npm -v`, and `npx -v`.
- macOS/Linux automatic iii installation also requires `curl`, a POSIX `sh`, and `tar`. Check with `command -v curl sh tar`. Minimal images such as `node:20-slim` may not include them.
- Windows: WSL2 follows the Linux path above. Native Windows requires a manually downloaded, pinned iii-engine v0.11.2 `iii.exe`, or Docker Desktop; the CLI does not auto-extract the Windows ZIP. Native automated `connect` supports only `copilot-cli`. Other Windows agents need manual MCP configuration; WSL `connect` applies only to agents installed in that same WSL environment.
- Ports 3111 (REST), 3112 (streams), 3113 (viewer), and 49134 (engine) free. If any are taken, stop whatever is using them before starting (see Troubleshooting).

## Running non-interactively

Use `npx -y @agentmemory/agentmemory@latest` as the canonical command. `-y` accepts npx's package prompt and `@latest` avoids running a stale cached release. Several agentmemory onboarding choices can still prompt on a TTY; set `CI=1` for unattended runs or use non-TTY stdin. Re-run onboarding any time with `npx -y @agentmemory/agentmemory@latest --reset`.

## 1. Verify the runtime prerequisites

```bash
node -v
npm -v
npx -v

# macOS/Linux only
command -v curl sh tar
```

Expect: Node prints v20 or newer, npm succeeds, and macOS/Linux prints a path for each automatic-installer dependency.

For native Windows, install the engine before continuing:

```powershell
# Download the archive that matches your CPU from the pinned release:
# https://github.com/iii-hq/iii/releases/tag/iii%2Fv0.11.2
# Extract iii.exe to $HOME\.agentmemory\bin\iii.exe, then verify the pin:
& "$HOME\.agentmemory\bin\iii.exe" --version
```

Expect: exactly `0.11.2`. Do not install the latest unpinned iii release. Alternatively, use WSL2 or start Docker Desktop and choose the Docker path when agentmemory starts.

## 2. Start the server

The canonical command downloads the npm package and, on macOS/Linux, auto-installs its pinned iii-engine into the private agentmemory bin directory. Run it in a dedicated terminal:

```bash
npx -y @agentmemory/agentmemory@latest
```

To prefer Docker even when a compatible native binary is present, set `AGENTMEMORY_USE_DOCKER=1` for the same command. To choose persistent storage, pass an absolute path and reuse it on every start:

```bash
npx -y @agentmemory/agentmemory@latest --data-dir /absolute/path/to/agentmemory-data
```

Docker bind-mounts that same resolved host directory at `/data`. For a second isolated daemon, add `--instance 1`; it stores data and lifecycle metadata under `instance-1` and defaults to ports 3211, 3212, 3213, and 49234. Do not use `--port` alone for concurrent daemons: it changes the ports but keeps instance 0's canonical lifecycle ownership. Use `--instance` for isolation.

Expect: iii-engine v0.11.2 starts, the agentmemory worker registers with iii, and the ready panel lists REST, viewer, streams, and engine addresses. First boot can take longer while the engine binary is downloaded.

## 3. Validate the server and all four ports

| Port | Owner | Validation |
|---|---|---|
| 3111 | agentmemory REST/MCP | `/agentmemory/livez` and `/agentmemory/health` return 200 |
| 3112 | iii streams | listed in the ready panel; must be free at startup |
| 3113 | agentmemory viewer | opening the URL returns the viewer |
| 49134 | iii engine WebSocket | listed in the ready panel and worker registration succeeds |

From a second terminal, run:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
curl -fsS http://localhost:3111/agentmemory/health
curl -fsS -o /dev/null http://localhost:3113/
npx -y @agentmemory/agentmemory@latest status
```

Expect: both REST checks return JSON, the viewer request succeeds, the startup ready panel has listed all four addresses, and `status` reports healthy agentmemory state. In keyless mode, status should report vectors disabled or `bm25-only`; `mem::search` uses BM25, while smart search may also include existing graph matches. Native PowerShell users can use `Invoke-RestMethod` instead of `curl`.

## 4. Exercise default recall and optional local semantics

```bash
npx -y @agentmemory/agentmemory@latest demo
```

The demo seeds three realistic sessions and searches them. In default keyless mode, vectors are disabled and the `mem::search` keyword queries such as `jwt auth middleware` and `rate limiting` should return BM25 hits. The deliberately semantic query `database performance optimization` can return zero because no embedding provider is active. Smart search can still add structural graph matches if graph data already exists.

To opt into on-device semantic recall, add this line to `~/.agentmemory/.env`, restart the server, and rerun the demo:

```env
EMBEDDING_PROVIDER=local
```

The first embedding request downloads `Xenova/all-MiniLM-L6-v2`; wait for that download to finish. Afterward, inference runs locally and the semantic query should find the N+1 memory. Open `http://localhost:3113` to watch the memory build live.

## 5. Wire MCP into the calling agent

Detect which agent is running this runbook, then wire its MCP config. On native Windows, run this automated step only for `copilot-cli`:

```bash
npx -y @agentmemory/agentmemory@latest connect <agent>
```

`connect` merges agentmemory into that agent's MCP config and preserves any existing servers. Supported agent names:

`claude-code`, `copilot-cli`, `codex`, `cursor`, `gemini-cli`, `opencode`, `cline`, `continue`, `droid`, `hermes`, `openclaw`, `openhuman`, `pi`, `qwen`, `warp`, `zed`, `antigravity`, `kiro`.

If you cannot tell which agent you are, default to `claude-code` on macOS/Linux. On native Windows, `copilot-cli` is the only automated adapter; configure all other agents with the manual MCP block in the README. Run `connect` inside WSL only when the target agent is installed inside the same WSL environment. After wiring, restart the agent or run its MCP reload command (for example `/mcp` in Claude Code) so it picks up the server.

Expect: the agent now lists agentmemory's tools. With the server running you should see the full set of 54 tools (for example `memory_save`, `memory_smart_search`, `memory_sessions`). If you see only 7 tools, the MCP shim could not reach the server; see Troubleshooting.

## 6. Install native skills

```bash
npx skills add rohitg00/agentmemory -y
```

This installs the native skills so the agent knows when to call the memory tools, not just that they exist. `connect` makes the tools available; skills teach the agent when to use them.

Expect: the skills are installed for the detected agent.

## 7. Verify save, recall, and restart persistence

Confirm health first:

```bash
curl -fsS http://localhost:3111/agentmemory/health
```

Expect: a JSON body with an ok status.

Now write a memory and read it back. If MCP is wired, call the `memory_save` tool followed by `memory_smart_search`. Otherwise use REST directly (note: these are the REST paths, which differ from the MCP tool names):

```bash
curl -X POST http://localhost:3111/agentmemory/remember \
  -H "Content-Type: application/json" \
  -d '{"content":"agentmemory install verification probe","concepts":["install-check"]}'

curl -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Content-Type: application/json" \
  -d '{"query":"install verification probe","limit":5}'
```

Expect: the first call returns `201`, the second returns `200` with results that include the probe memory you just saved.

If `AGENTMEMORY_SECRET` is set in the environment, the REST API requires it. Add `-H "Authorization: Bearer $AGENTMEMORY_SECRET"` to both calls. By default no secret is set and localhost is open.

Now stop and restart the processes, using the same `--data-dir` value if you set one:

```bash
npx -y @agentmemory/agentmemory@latest stop
npx -y @agentmemory/agentmemory@latest
```

After `/agentmemory/livez` returns 200 again, repeat the `smart-search` request above. Expect: the saved probe is still returned. This restart check proves the selected platform data directory is persistent rather than only proving the in-memory index.

## Optional: install a global command

The npx form above is the canonical fresh-install path. If you want the shorter `agentmemory` command afterward:

```bash
npm install -g @agentmemory/agentmemory@latest
agentmemory --version
```

If a system Node install returns `EACCES` on macOS/Linux, use a user-owned npm prefix rather than changing repository permissions. The npx form remains available without a global install.

## Optional: richer features

These are off by default because they spend tokens. Enable them only if the user wants them. Put configuration in `~/.agentmemory/.env` (no `export` prefix), then restart the server.

- `AGENTMEMORY_INJECT_CONTEXT=true` makes the SessionStart and PreToolUse hooks inject past memory into the agent's context automatically. Cost: spends session tokens proportional to tool-call frequency.
- LLM-written observation compression requires both `AGENTMEMORY_AUTO_COMPRESS=true` and a configured provider. A provider alone leaves synthetic compression active. When both are set, each observation is sent to the provider for a richer summary, spending API tokens proportional to tool-use frequency.
- Provider key: set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and similar, in the same file. Without a key, agentmemory stays in zero-LLM mode and recalls via BM25. Local embeddings remain available as the separate `EMBEDDING_PROVIDER=local` opt-in above.

## Tool surface

The MCP server exposes 54 tools by default (`--tools all`). Use `--tools core` (or `AGENTMEMORY_TOOLS=core`) for a lean 8-tool set on hosts with tight tool limits. The 8 core tools cover save, recall, consolidate, smart search, sessions, diagnose, lesson save, and reflect.

## Lifecycle commands

- `npx -y @agentmemory/agentmemory@latest status` shows server health, viewer, provider, and embedding state.
- `npx -y @agentmemory/agentmemory@latest doctor` runs diagnostics and reports what is misconfigured.
- `npx -y @agentmemory/agentmemory@latest stop` stops the engine this CLI started. Docker mode validates and preserves the exact container and `/data` mount for the next restart; `stop --force` applies only to native ownership checks.
- `npx -y @agentmemory/agentmemory@latest upgrade` upgrades agentmemory and the iii runtime, best effort.
- `npx -y @agentmemory/agentmemory@latest --reset` wipes onboarding preferences and re-runs the wizard.
- `npx -y @agentmemory/agentmemory@latest import-jsonl <file>` imports prior Claude Code session logs as memories.

## Troubleshooting

- `command not found: agentmemory`: the optional global bin is not on `PATH`. Use `npx -y @agentmemory/agentmemory@latest`.
- Automatic iii install fails on macOS/Linux: verify `command -v curl sh tar`; install the missing prerequisite or use Docker.
- Stale npx version: include both `-y` and `@latest` as shown throughout this runbook.
- Port already in use: another process holds 3111, 3112, 3113, or 49134. Stop that process, then re-run.
- Custom REST port: `--port <N>` derives streams as `N+1`, viewer as `N+2`, and the iii worker WebSocket as `N+46023` only when their explicit port/URL variables are unset (`III_STREAM_PORT` or legacy `III_STREAMS_PORT`, `III_VIEWER_PORT` or `AGENTMEMORY_VIEWER_URL`, and `III_ENGINE_PORT` or `III_ENGINE_URL`).
- Server starts but `livez` never returns 200: re-run with `npx -y @agentmemory/agentmemory@latest --verbose` to see engine stderr.
- `The engine process started but the REST API never responded.`: inspect all four derived ports, confirm the pinned iii process stayed alive, and use `--verbose` for captured engine stderr.
- Engine version warning on start: harmless. agentmemory uses its own pinned engine in `~/.agentmemory/bin` regardless of any `iii` on `PATH`. Set `AGENTMEMORY_III_VERSION` only to override deliberately.
- "engine conflict" / another iii engine already running: if a different iii version is already serving the port, agentmemory will not adopt it. Stop that engine (`npx -y @agentmemory/agentmemory@latest stop --force`, or however you started it), then rerun the canonical command. Its private v0.11.2 binary does not replace a user-managed `iii` on `PATH`.
- Only 7 tools visible in the agent: the MCP shim is in local fallback because it could not reach a server. Start `npx -y @agentmemory/agentmemory@latest`, ensure `AGENTMEMORY_URL` points at it (default `http://localhost:3111`), then reload MCP.
- Native Windows: the CLI does not auto-extract the ZIP. Install the pinned v0.11.2 `iii.exe` manually, use WSL2, or run with Docker Desktop and `AGENTMEMORY_USE_DOCKER=1`. Automated `connect` supports only `copilot-cli`; configure other native agents manually.
- Semantic demo query returns zero hits: this is expected with vectors disabled in default keyless mode. Set `EMBEDDING_PROVIDER=local`, restart, allow the first model download to complete, and rerun the demo.

## Report success

Report back to the user:

- agentmemory installed, version, and the server running on port 3111
- iii-engine v0.11.2 running, the selected platform data directory, and all four ports accounted for
- which agent was wired via `agentmemory connect`, and the tool count the agent now sees
- the save and recall round-trip returned the probe memory after a full stop/start
- the viewer is available at `http://localhost:3113`
- whether vectors were disabled (`mem::search` BM25, with optional graph matches in smart search) or an embedding provider was enabled

If any step failed, report which step, the exact command, and the error output.
