<p align="center">
  <h1 align="center">agentmemory</h1>
  <p align="center">Persistent memory for AI coding agents.<br/>Powered by <a href="https://iii.dev">iii-engine</a>.</p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#self-evaluation">Self-Evaluation</a> &bull;
  <a href="#mcp-server">MCP Server</a> &bull;
  <a href="#skills">Skills</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#api">API</a> &bull;
  <a href="#plugin-install">Plugin Install</a>
</p>

---

Your AI coding agent forgets everything between sessions. agentmemory fixes that.

It silently captures tool usage during coding sessions, compresses observations via LLM, and injects relevant context into future sessions. No manual notes. No copy-pasting. The agent just *knows*.

```
Session 1: "Add auth to the API"
  Claude Code writes code, runs tests, fixes bugs
  agentmemory silently captures every tool use
  Session ends -> observations compressed into structured memory

Session 2: "Now add rate limiting"
  agentmemory injects context from Session 1:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - Decision: chose jose over jsonwebtoken for Edge compatibility
  Claude Code starts with full project awareness
```

## What's New in v0.3.0

- **Self-evaluation framework** — Zod I/O validation, quality scoring (0-100), self-correcting LLM retries, per-function metrics
- **Health monitoring** — Real-time CPU, memory, event loop lag tracking with degraded/critical alerts
- **Circuit breaker** — Automatic failover when LLM providers go down (closed → open → half-open recovery)
- **BM25 search** — Replaced basic TF scoring with BM25 (k1=1.2, b=0.75) for better search relevance
- **Deduplication** — SHA-256 content hashing with 5-minute TTL window prevents duplicate observations
- **Memory eviction** — Age-based + importance-based + per-project cap eviction with dry-run support
- **MCP server** — 5 tools for any MCP-compatible client (memory_recall, memory_save, memory_file_history, memory_patterns, memory_sessions)
- **4 skills** — /recall, /remember, /session-history, /forget
- **12 hooks** — All Claude Code hook types covered (up from 5)
- **OTEL telemetry** — Counters and histograms for observability

## Quick Start

### 1. Install the Plugin

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

All 12 hooks, 4 skills, and MCP server are registered automatically.

### 2. Start the Worker

```bash
git clone https://github.com/rohitg00/agentmemory.git
cd agentmemory

# Start iii-engine
docker compose up -d

# Install, build, run
npm install && npm run build && npm start
```

### 3. Verify

```bash
curl http://localhost:3111/agentmemory/health
```

Returns real health data:

```json
{
  "status": "healthy",
  "service": "agentmemory",
  "version": "0.3.0",
  "health": {
    "memory": { "heapUsed": 42000000, "heapTotal": 67000000 },
    "cpu": { "percent": 2.1 },
    "eventLoopLagMs": 1.2,
    "status": "healthy",
    "alerts": []
  },
  "functionMetrics": [...],
  "circuitBreaker": { "state": "closed", "failures": 0 }
}
```

HTTP 503 when status is `critical`.

### Manual Hook Setup (alternative)

If you prefer not to use the plugin, add hooks directly to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/session-start.mjs" }],
    "UserPromptSubmit": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/prompt-submit.mjs" }],
    "PreToolUse": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/pre-tool-use.mjs" }],
    "PostToolUse": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/post-tool-use.mjs" }],
    "PostToolUseFailure": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/post-tool-failure.mjs" }],
    "PreCompact": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/pre-compact.mjs" }],
    "SubagentStart": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/subagent-start.mjs" }],
    "SubagentStop": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/subagent-stop.mjs" }],
    "Notification": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/notification.mjs" }],
    "TaskCompleted": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/task-completed.mjs" }],
    "Stop": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/stop.mjs" }],
    "SessionEnd": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/session-end.mjs" }]
  }
}
```

## How It Works

### Observation Pipeline

Every tool use flows through this pipeline:

```
PostToolUse hook fires
  -> Dedup check      SHA-256 hash of tool_name + tool_input (5min window)
  -> mem::privacy     Strip secrets, API keys, <private> tags
  -> mem::observe     Store raw observation, push to real-time stream
  -> mem::compress    LLM extracts: type, facts, narrative, concepts, files
                      Validates output with Zod, scores quality (0-100)
                      Self-corrects on validation failure (1 retry)
                      Records latency + quality in per-function metrics
```

### Context Injection

On `SessionStart`, agentmemory builds context from your history:

```
SessionStart hook fires
  -> mem::context     Load recent sessions for this project
                      BM25-ranked search across observations
                      Prefer summaries, fall back to high-importance observations
                      Apply token budget (default: 2000 tokens)
                      Return formatted context block
  -> stdout           Claude Code injects it into the conversation
```

### What Gets Captured

| Hook | Captures |
|------|----------|
| `SessionStart` | Project path, session ID, working directory |
| `UserPromptSubmit` | User prompts (privacy-filtered) |
| `PreToolUse` | File access patterns (Read, Write, Edit, Glob, Grep) |
| `PostToolUse` | Tool name, input, output |
| `PostToolUseFailure` | Failed tool invocations with error context |
| `PreCompact` | Re-injects memory context before context compaction |
| `SubagentStart` | Sub-agent spawning events |
| `SubagentStop` | Sub-agent completion events |
| `Notification` | System notifications |
| `TaskCompleted` | Task completion events |
| `Stop` | Triggers end-of-session summary |
| `SessionEnd` | Marks session complete |

### Privacy

All data passes through `mem::privacy` before storage:
- `<private>...</private>` tags are stripped
- API keys (`sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`), JWTs, and secrets are redacted

## Self-Evaluation

agentmemory v0.3.0 monitors its own health and validates its own I/O.

### Quality Scoring

Every LLM-generated compression and summary is scored 0-100:

| Check | Points |
|-------|--------|
| Has structured facts | +20 |
| Narrative length > 10 chars | +20 |
| Concepts extracted | +20 |
| Title quality (not truncated) | +20 |
| Importance in valid range (1-10) | +20 |

Scores are tracked per-function and exposed via the `/health` endpoint.

### Self-Correction

When LLM output fails Zod validation, agentmemory retries once with a stricter prompt suffix explaining the exact validation errors. This recovers from malformed JSON, missing fields, and out-of-range values.

### Circuit Breaker

LLM providers fail. The circuit breaker prevents cascading failures:

```
Closed (normal)
  -> 3 failures in 60s -> Open (all calls rejected)
  -> 30s cooldown      -> Half-Open (one test call allowed)
  -> Success           -> Closed (normal)
  -> Failure           -> Open (restart cooldown)
```

When the circuit is open, observations are stored raw without compression. No data is lost.

### Health Monitor

Collects every 30 seconds:
- **Memory**: heap used/total, RSS, external
- **CPU**: user/system time, real percentage via delta sampling
- **Event loop lag**: detect blocking operations
- **Connection state**: engine connectivity

Thresholds:
| Metric | Warning | Critical |
|--------|---------|----------|
| Event loop lag | > 100ms | > 500ms |
| CPU | > 80% | > 90% |
| Heap usage | > 80% | > 95% |
| Connection | reconnecting | disconnected |

## MCP Server

agentmemory exposes 5 tools via MCP for any compatible client:

| Tool | Description |
|------|-------------|
| `memory_recall` | Search past observations by keyword |
| `memory_save` | Save an insight, decision, or pattern to long-term memory |
| `memory_file_history` | Get past observations about specific files |
| `memory_patterns` | Detect recurring patterns across sessions |
| `memory_sessions` | List recent sessions with status |

### MCP Endpoints

```
GET  /agentmemory/mcp/tools   — List available tools
POST /agentmemory/mcp/call    — Execute a tool
```

### Example

```bash
curl -X POST http://localhost:3111/agentmemory/mcp/call \
  -H "Content-Type: application/json" \
  -d '{"name": "memory_recall", "arguments": {"query": "authentication", "limit": 5}}'
```

## Skills

Four slash commands for interacting with memory:

| Skill | Usage |
|-------|-------|
| `/recall` | Search memory for past context (`/recall auth middleware`) |
| `/remember` | Save something to long-term memory (`/remember always use jose for JWT`) |
| `/session-history` | Show recent session summaries |
| `/forget` | Delete specific observations or entire sessions |

## Configuration

### LLM Providers

agentmemory needs an LLM for compressing observations and generating session summaries.

| Provider | Config | Cost |
|----------|--------|------|
| **Claude subscription** (default) | No config needed | Included in Max/Pro |
| **Anthropic API** | `ANTHROPIC_API_KEY` | Per-token |
| **Gemini** | `GEMINI_API_KEY` | Per-token |
| **OpenRouter** | `OPENROUTER_API_KEY` | Per-token |

No API key? agentmemory uses your Claude subscription automatically via `@anthropic-ai/claude-agent-sdk`. Zero config.

### Environment Variables

Create `~/.agentmemory/.env`:

```env
# LLM provider -- pick one (or leave empty for subscription mode)
ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...

# Optional: override model
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# GEMINI_MODEL=gemini-2.0-flash
# OPENROUTER_MODEL=anthropic/claude-sonnet-4-20250514

# Optional: bearer token for API auth
# AGENTMEMORY_SECRET=your-secret-here

# Optional: engine connection
# III_ENGINE_URL=ws://localhost:49134
# III_REST_PORT=3111
# III_STREAMS_PORT=3112

# Optional: memory tuning
# TOKEN_BUDGET=2000
# MAX_OBS_PER_SESSION=500
```

## API

All endpoints on port `3111`. Protected endpoints require `Authorization: Bearer <secret>` when `AGENTMEMORY_SECRET` is set.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check with metrics (always public) |
| `POST` | `/agentmemory/session/start` | Start session + get context |
| `POST` | `/agentmemory/session/end` | Mark session complete |
| `POST` | `/agentmemory/observe` | Capture observation |
| `POST` | `/agentmemory/context` | Generate context |
| `POST` | `/agentmemory/search` | Search observations (BM25) |
| `POST` | `/agentmemory/summarize` | Generate session summary |
| `POST` | `/agentmemory/remember` | Save to long-term memory |
| `POST` | `/agentmemory/forget` | Delete observations/sessions |
| `POST` | `/agentmemory/consolidate` | Merge duplicate observations |
| `POST` | `/agentmemory/patterns` | Detect recurring patterns |
| `POST` | `/agentmemory/generate-rules` | Generate CLAUDE.md rules from patterns |
| `POST` | `/agentmemory/file-context` | Get file-specific history |
| `POST` | `/agentmemory/evict` | Evict stale memories (supports `?dryRun=true`) |
| `POST` | `/agentmemory/migrate` | Import from SQLite |
| `GET` | `/agentmemory/sessions` | List all sessions |
| `GET` | `/agentmemory/observations?sessionId=X` | Session observations |
| `GET` | `/agentmemory/viewer` | Real-time web viewer |
| `GET` | `/agentmemory/mcp/tools` | List MCP tools |
| `POST` | `/agentmemory/mcp/call` | Execute MCP tool |

### Examples

```bash
# Start a session
curl -X POST http://localhost:3111/agentmemory/session/start \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "ses-1", "project": "/my/project", "cwd": "/my/project"}'

# Capture an observation
curl -X POST http://localhost:3111/agentmemory/observe \
  -H "Content-Type: application/json" \
  -d '{
    "hookType": "post_tool_use",
    "sessionId": "ses-1",
    "project": "/my/project",
    "cwd": "/my/project",
    "timestamp": "2026-02-25T12:00:00Z",
    "data": {"tool": "Edit", "file": "src/auth.ts", "content": "Added JWT validation"}
  }'

# Search across all observations (BM25-ranked)
curl -X POST http://localhost:3111/agentmemory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication middleware", "limit": 10}'

# Save something to long-term memory
curl -X POST http://localhost:3111/agentmemory/remember \
  -H "Content-Type: application/json" \
  -d '{"content": "Always use jose for JWT in Edge environments", "type": "preference"}'

# Preview memory eviction (dry run)
curl -X POST "http://localhost:3111/agentmemory/evict?dryRun=true"

# List sessions
curl http://localhost:3111/agentmemory/sessions
```

## Real-Time Viewer

Open [http://localhost:3111/agentmemory/viewer](http://localhost:3111/agentmemory/viewer) to watch observations flow in real-time.

Connects to iii-engine's WebSocket stream. Dark theme, timeline layout, session filtering, auto-scroll.

## Plugin Install

### From Marketplace (recommended)

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

Restart Claude Code. All 12 hooks, 4 skills, and MCP tools are registered automatically.

### Plugin Commands

```bash
/plugin install agentmemory          # Install
/plugin disable agentmemory          # Disable without uninstalling
/plugin enable agentmemory           # Re-enable
/plugin uninstall agentmemory        # Remove
```

## Migration

Import from existing SQLite-based memory systems :

```bash
npm install better-sqlite3

curl -X POST http://localhost:3111/agentmemory/migrate \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "~/.agentmemory/memory.db"}'
```

Imports sessions, observations, and summaries.

## Architecture

agentmemory is built on iii-engine's three primitives:

| What you'd normally need | What agentmemory uses |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres | iii KV State |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii-engine worker management |
| Prometheus / Grafana | iii OTEL + built-in health monitor |
| Redis (circuit breaker) | In-process circuit breaker |

**52 source files. ~4,800 LOC. 82 tests. 195KB bundled.**

### Functions

| Function | Purpose |
|----------|---------|
| `mem::observe` | Store raw observation with dedup check |
| `mem::compress` | LLM compression with validation + quality scoring |
| `mem::search` | BM25-ranked full-text search |
| `mem::context` | Build session context within token budget |
| `mem::summarize` | Generate validated session summaries |
| `mem::remember` | Save to long-term memory |
| `mem::forget` | Delete observations, sessions, or memories |
| `mem::file-index` | File-specific observation lookup |
| `mem::consolidate` | Merge duplicate observations |
| `mem::patterns` | Detect recurring patterns |
| `mem::generate-rules` | Generate CLAUDE.md rules from patterns |
| `mem::migrate` | Import from SQLite |
| `mem::evict` | Age + importance + cap-based memory eviction |

### Data Model

| Scope | Key | Stores |
|-------|-----|--------|
| `mem:sessions` | `{session_id}` | Session metadata, project, timestamps |
| `mem:obs:{session_id}` | `{obs_id}` | Compressed observations |
| `mem:summaries` | `{session_id}` | End-of-session summaries |
| `mem:memories` | `{memory_id}` | Long-term memories (remember/forget) |
| `mem:metrics` | `{function_id}` | Per-function metrics (latency, quality, success rate) |
| `mem:health` | `latest` | Latest health snapshot |
| `mem:config` | `{key}` | Runtime configuration overrides |

## Development

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # Unit tests (82 tests, ~300ms)
npm run test:integration  # API tests (requires running services)
```

### Prerequisites

- Node.js >= 18
- Docker

## License

[Apache-2.0](LICENSE)
