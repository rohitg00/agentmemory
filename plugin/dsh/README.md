# @agentmemory/dsh — agentmemory for DeepSeek Harness

A cordis plugin that connects agentmemory's long-term memory to DeepSeek Harness (dsh). It registers sessions on start, injects recalled context into the first step, captures user messages and tool calls, bridges compaction summaries into the memory store, and summarizes sessions on dispose — mirroring the official agentmemory hooks for Claude Code on dsh's event stream.

| agentmemory hook (Claude Code) | This plugin (dsh event) | Form |
|---|---|---|
| SessionStart | `session/created` → `POST /agentmemory/session/start` | injecting (await + timeout + fail silent) |
| SessionStart stdout injection | `agent/pre-step` (step 1) middleware → first-step batch fold | injecting |
| UserPromptSubmit | `session/event` (`user/message`) → `/observe prompt_submit` | telemetry (fire-and-forget) |
| PreToolUse (matcher) | `session/event` (`tool/call`) → `/observe post_tool_use` (filters `mcp__agentmemory__*` self-calls) | telemetry |
| Notification | `approval/asked` → `/observe notification` (allowlisted fields) | telemetry |
| Stop / SessionEnd | `session/disposed` → `POST /agentmemory/session/end` | telemetry (30s, tracked) |
| PreCompact | `compaction/summary` → `POST /agentmemory/remember` (compaction bridge) | telemetry |

## Install

Prerequisite: the agentmemory daemon is running (`npx @agentmemory/agentmemory`, REST `http://localhost:3111`).

### 1. MCP bridge (tools, optional but recommended)

Append the `mcp-agentmemory` entry from `install/cordis.patch.yml` to `~/.dsh/profiles/<profile>/cordis.patch.yml` (HMR hot-reloads it — no restart). dsh agents then get `mcp__agentmemory__*` tools.

### 2. Plugin (auto-capture)

```bash
dsh plugin --profile <profile> add @agentmemory/dsh
```

Development (local repo):

```bash
# add to ~/.dsh/profiles/web/package.json dependencies:
#   "@agentmemory/dsh": "file:/path/to/agentmemory/plugin/dsh"
cd ~/.dsh/profiles/web && pnpm install
```

Then append to `cordis.patch.yml` (defaults shown; override as needed):

```yaml
- insert:
    - id: agentmemory
      name: '@agentmemory/dsh'
      config:
        url: http://localhost:3111   # agentmemory REST
        secret: ''                   # match the daemon AGENTMEMORY_SECRET
        agentId: dsh                 # per-agent memory isolation
        injectInstructions: true     # inject memory-tool guidance on first turn
        injectContext: true          # inject recalled project context on first turn
        injectMaxChars: 6000         # injection budget (≈2k tokens)
        observeToolCalls: true       # capture tool calls as observations
        compactionBridge: true       # persist compaction summaries as memories
        summarizeOnDispose: true     # LLM summary on session dispose
```

Restart dsh (or wait for HMR to load the new plugin).

### 3. Behavior guidance (optional)

- Global guidance: `install/AGENTS.md` → `~/.dsh/AGENTS.md` (auto-injected into every session)
- Memory skill: `install/skills/agentmemory-sync/` → `~/.dsh/skills/agentmemory-sync/`

## Verify

1. The first turn of a new session should show injected recalled context/guidance.
2. `curl http://localhost:3111/agentmemory/sessions` lists the dsh sessions.
3. After ending a session, `curl http://localhost:3111/agentmemory/search -H 'Content-Type: application/json' -d '{"query":"<what you did>"}'` recalls the new memory.

## Development

```bash
npm run build    # tsdown → lib/index.js (zero runtime dependencies)
npm test         # vitest (20 cases: REST client / event mapping / injection / self-call filter / fail-open)
```

Design contract (same as the official hooks): injecting handlers await + time out + fail silently; telemetry handlers fire-and-forget and never block the agent loop; any REST failure is logged once and never throws into cordis.

## Config

| Field | Default | Description |
|---|---|---|
| `url` | `http://localhost:3111` | agentmemory REST base URL |
| `secret` | empty | Bearer auth (only if the daemon sets `AGENTMEMORY_SECRET`) |
| `agentId` | `dsh` | memory owner agent; isolation key under `AGENTMEMORY_AGENT_SCOPE=isolated` |
| `injectInstructions` | `true` | inject memory-tool guidance on the first turn |
| `injectContext` | `true` | inject `/context` recalled project context on the first turn |
| `injectMaxChars` | `6000` | total injection budget in characters |
| `observeToolCalls` | `true` | `tool/call` → `post_tool_use` observations |
| `compactionBridge` | `true` | `compaction/summary` → `/remember` |
| `summarizeOnDispose` | `true` | `session/disposed` → `/session/end` (LLM summary) |

## Build artifacts

`lib/index.js` (and the hand-written `lib/index.d.ts`) are committed alongside the source: dsh `file:` consumers load `lib/` directly with no publish-time build. After changing `src/index.ts`, run `npm run build` and commit the new `lib/` (the repo already commits build output, cf. `plugin/scripts/*.mjs`).

## Limitations

- Event payload fields follow the running dsh version (`session/created`/`disposed` carry the session object; `agent/pre-step` is middleware; `session/event` stream events are `{type, data}`).
- `approval/asked` observations are skipped when the payload has no `sessionId`.
- The plugin only bridges REST; the MCP tools still need step 1's bridge.
