# agentmemory × DeepSeek Harness (dsh) — Integration Design

## Background

dsh (DeepSeek Harness) is a cordis-based agent harness with no long-term memory: session transcripts and compaction summaries stay per-session and are not semantically retrievable. This PR closes the gap using agentmemory's existing surfaces — the REST lifecycle endpoints (`/session/start`, `/observe`, `/context`, `/session/end`, `/remember`) and the MCP shim (`@agentmemory/mcp`) — mirroring the OpenCode plugin pattern (`plugin/opencode/`).

## Architecture (four layers)

| Layer | What | Where |
|---|---|---|
| L1 MCP bridge | `mcp__agentmemory__*` tools via `@deepseek-ai/dsh-mcp-client` (stdio → `@agentmemory/mcp` shim, proxies to the daemon; reduced local fallback when unreachable) | `~/.dsh/profiles/<p>/cordis.patch.yml` entry, written by `agentmemory connect dsh` |
| L2 Behavior guidance | memory-usage guideline injected into every session (`~/.dsh/AGENTS.md`, read by dsh-agent-instructions) + `agentmemory-sync` skill (`~/.dsh/skills/`) | `src/cli/connect/guidelines.ts` + adapter |
| L3 Auto-capture plugin | `@agentmemory/dsh` cordis plugin: session lifecycle → REST | `plugin/dsh/` |
| L4 Deep collaboration | per-agent isolation (`agentId`), compaction bridge, team memory | plugin config / future |

## Event mapping: agentmemory hooks ↔ dsh events

The plugin mirrors the official Claude Code hook semantics 1:1 on dsh's event stream:

| agentmemory hook (Claude Code) | dsh event | Form |
|---|---|---|
| SessionStart | `session/created` → `POST /agentmemory/session/start` | injecting (await + timeout + fail silent) |
| SessionStart stdout injection | `agent/pre-step` (step 1) middleware → first-step batch fold (idempotent per session) | injecting |
| UserPromptSubmit | `session/event` (`user/message`) → `/observe prompt_submit` | telemetry (fire-and-forget) |
| PreToolUse (matcher) | `session/event` (`tool/call`) → `/observe post_tool_use` (`mcp__agentmemory__*` self-calls filtered) | telemetry |
| Notification | `approval/asked` → `/observe notification` (allowlisted fields) | telemetry |
| Stop / SessionEnd | `session/disposed` → `POST /agentmemory/session/end` | telemetry (30s, promise-tracked) |
| PreCompact | `compaction/summary` → `POST /agentmemory/remember` (compaction bridge) | telemetry |

Event names are taken from `@deepseek-ai/dsh-session` / `@deepseek-ai/dsh-agent` (`session/created`, `session/disposed`, `session/event` stream types `user/message`/`tool/call`/`tool/result`, `agent/pre-step` middleware with `(_assembly, _context, next)`-style chaining, `approval/asked`, `compaction/summary`).

## Design contract (same as the official hooks)

- Injecting handlers **await + time out + fail silently**; they never throw into cordis (`signal.aborted` returns the unmodified decision).
- Telemetry handlers are **fire-and-forget** and never block the agent loop; in-flight promises are tracked so nothing is dropped at teardown.
- Project resolution (`git rev-parse`) is cached per cwd — no child process per event; per-session `{cwd, project}` captured at `session/created`.
- Zero runtime dependencies: the plugin is a thin REST bridge (Node built-ins only), so dsh `file:` consumers need no build step; `lib/` is committed (repo convention, cf. `plugin/scripts/*.mjs`).

## Verification (live, macOS)

- `npm test`: full suite green (1620/1627; 6 pre-existing environment failures in `embedding-provider.test.ts` unrelated to this change).
- `@agentmemory/mcp` stdio handshake: initialize + `tools/list` → 53 tools; `memory_sessions` returns real daemon data.
- dsh `session.create` → daemon registers a session with `agentId=dsh`; observations captured during active sessions.
- `~/.dsh/AGENTS.md` guideline injected into live dsh sessions; `agentmemory-sync` skill picked up by dsh's skill registry.

## Known environment caveat

A root-owned `~/.npm/_cacache` (npm historical bug) makes `npx -y @agentmemory/mcp` fail with EPERM, so the dsh MCP bridge cannot spawn the shim. Fix: `sudo chown -R 501:20 ~/.npm`, or add `--cache <dir>` to the entry's `args` (both documented in `plugin/dsh/install/cordis.patch.yml`).

## Installer

`scripts/dsh-install.cjs` applies L1+L2 and declares the L3 plugin dependency idempotently (`--dry-run` preview, `--no-plugin` for config-only).
