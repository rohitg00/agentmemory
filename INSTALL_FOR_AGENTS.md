# Install agentmemory (agent runbook)

You are a coding agent. Follow this runbook top to bottom to install agentmemory, wire it into yourself, and verify that persistent memory works. Run each command, check the result against the "Expect" note, then move on. If a step fails, jump to Troubleshooting, and if it still fails, stop and report the step, the exact command, and the error output.

## What you are installing

agentmemory is a local memory server for coding agents. It runs on your machine, exposes a REST API on port 3111 and an MCP server, and stores memories on disk under `~/.agentmemory`. It is built on the iii engine, which agentmemory downloads and manages for you as a pinned binary under `~/.agentmemory/bin`. You do not install iii separately.

Default mode needs no API key and no cloud account. Out of the box it runs hybrid retrieval (BM25 keyword search plus local on-device embeddings), so a full install proves real semantic recall with zero credentials. An LLM provider key is optional and only unlocks richer summaries and auto-injection (see "Optional: richer features").

## Prerequisites

- Node.js >= 20 and npm. Check with `node -v`.
- macOS or Linux for the one-command path. On Windows, use WSL2; native Windows engine setup is manual and `agentmemory connect` is not supported there.
- Ports 3111 (REST), 3112 (streams), 3113 (viewer), and 49134 (engine) free. Override the whole block with `--port <N>` or `--instance <N>` if any are taken.

## Running non-interactively

Several commands prompt on a TTY (for example the first-run "install globally?" question). As an agent you usually want no prompts. Either set `CI=1` in the environment for the commands below, or rely on the fact that agentmemory skips all prompts automatically when stdin/stdout are not a TTY. Prompts are also never-nag: once answered they persist and are not asked again. Re-run onboarding any time with `agentmemory --reset`.

## 1. Install globally

```bash
npm install -g @agentmemory/agentmemory
```

If you hit `EACCES` on a system Node install (macOS/Linux), retry with `sudo npm install -g @agentmemory/agentmemory`.

No-install alternative: skip this step and run the server with `npx -y @agentmemory/agentmemory@latest` everywhere this runbook says `agentmemory`. The `@latest` and `-y` flags matter because npx caches per version and a bare `npx @agentmemory/agentmemory` can serve a stale release.

Expect: the install completes without errors.

## 2. Verify the install

```bash
agentmemory --version
```

Expect: a version string is printed. If `command not found`, the global bin is not on `PATH`; use the `npx -y @agentmemory/agentmemory@latest` form instead.

## 3. Start the server

The server listens on port 3111 and auto-starts its pinned iii engine on first run (this can take a few seconds the first time while the engine binary is fetched into `~/.agentmemory/bin`). Run it in the background or in a separate terminal so the rest of the runbook can talk to it.

```bash
agentmemory &
```

Or in a dedicated terminal, run `agentmemory` in the foreground. To run a second isolated instance, use `agentmemory --instance 1` (relocates the whole port block to 3211/3212/3213/49234).

Wait until it is reachable, then continue:

```bash
curl -fsS http://localhost:3111/agentmemory/livez
```

Expect: a `200` response. Retry for up to ~15 seconds on first run while the engine warms up.

## 4. Prove recall in one command

```bash
agentmemory demo --serve
```

`--serve` boots the server, seeds three realistic sessions (JWT auth, an N+1 query fix, rate limiting), runs semantic searches against them, prints the results, and tears everything down. No second terminal needed.

Expect: the demo finds the "N+1 query fix" memory when it searches for "database performance optimization", which keyword matching alone cannot do. Open `http://localhost:3113` while it runs to watch the memory build live.

## 5. Wire MCP into the calling agent

Detect which agent is running this runbook, then wire its MCP config:

```bash
agentmemory connect <agent>
```

`connect` merges agentmemory into that agent's MCP config and preserves any existing servers. Supported agent names:

`claude-code`, `copilot-cli`, `codex`, `cursor`, `gemini-cli`, `opencode`, `cline`, `continue`, `droid`, `hermes`, `openclaw`, `openhuman`, `pi`, `qwen`, `warp`, `zed`, `antigravity`, `kiro`.

If you cannot tell which agent you are, default to `claude-code`. After wiring, restart the agent or run its MCP reload command (for example `/mcp` in Claude Code) so it picks up the server.

Expect: the agent now lists agentmemory's tools. With the server running you should see the full set of 53 tools (for example `memory_save`, `memory_smart_search`, `memory_sessions`). If you see only 7 tools, the MCP shim could not reach a server, see Troubleshooting.

## 6. Install native skills

```bash
npx skills add rohitg00/agentmemory -y
```

This installs the native skills so the agent knows when to call the memory tools, not just that they exist. `connect` makes the tools available; skills teach the agent when to use them.

Expect: the skills are installed for the detected agent.

## 7. Verify a save and recall round-trip

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

## Optional: richer features

These are off by default because they spend tokens. Enable them only if the user wants them. Put configuration in `~/.agentmemory/.env` (no `export` prefix), then restart the server.

- `AGENTMEMORY_INJECT_CONTEXT=true` makes the SessionStart and PreToolUse hooks inject past memory into the agent's context automatically. Cost: spends session tokens proportional to tool-call frequency.
- `AGENTMEMORY_AUTO_COMPRESS=true` sends each observation to your LLM provider for a richer summary. Cost: spends API tokens proportional to tool-use frequency. Requires a provider key.
- Provider key: set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, and similar, in the same file. Without a key, agentmemory stays in zero-LLM mode and still indexes and recalls via BM25 plus local embeddings.

## Tool surface

The MCP server exposes 53 tools by default (`--tools all`). Use `--tools core` (or `AGENTMEMORY_TOOLS=core`) for a lean 8-tool set on hosts with tight tool limits. The 8 core tools cover save, recall, consolidate, smart search, sessions, diagnose, lesson save, and reflect.

## Lifecycle commands

- `agentmemory status` shows server and engine state.
- `agentmemory doctor` runs diagnostics and reports what is misconfigured.
- `agentmemory stop` stops the engine this CLI started (`stop --force` bypasses the Docker guard).
- `agentmemory upgrade` upgrades agentmemory and the iii runtime, best effort.
- `agentmemory --reset` wipes onboarding preferences and re-runs the wizard.
- `agentmemory import-jsonl <file>` imports prior Claude Code session logs as memories.

## Troubleshooting

- `command not found: agentmemory`: the global bin is not on `PATH`. Use `npx -y @agentmemory/agentmemory@latest`.
- `EACCES` during global install: retry with `sudo`, or use the npx form.
- Stale npx version: run `npx -y @agentmemory/agentmemory@latest`, or clear the cache with `rm -rf ~/.npm/_npx` (macOS/Linux).
- Port already in use: another instance or process holds 3111. Stop it, or relocate with `agentmemory --instance 1`.
- Server starts but `livez` never returns 200: re-run with `agentmemory --verbose` to see engine stderr.
- Engine version warning on start: harmless. agentmemory uses its own pinned engine in `~/.agentmemory/bin` regardless of any `iii` on `PATH`. Set `AGENTMEMORY_III_VERSION` only to override deliberately.
- Only 7 tools visible in the agent: the MCP shim is in local fallback because it could not reach a server. Start `npx @agentmemory/agentmemory` and ensure `AGENTMEMORY_URL` points at it (default `http://localhost:3111`), then reload MCP.
- Windows: use WSL2 for the path above. Native Windows runs the server but `connect` and the automated engine install are not supported.

## Report success

Report back to the user:

- agentmemory installed, version, and the server running on port 3111
- which agent was wired via `agentmemory connect`, and the tool count the agent now sees
- the save and recall round-trip returned the probe memory
- the viewer is available at `http://localhost:3113`
- whether any optional features were enabled

If any step failed, report which step, the exact command, and the error output.
