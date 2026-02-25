# agentmemory

Persistent memory for AI coding agents, powered by [iii-engine](https://iii.dev)'s three primitives (Worker / Function / Trigger).

agentmemory captures tool usage during coding sessions, compresses observations via LLM, and injects relevant context into future sessions. Your AI agent remembers what it did yesterday.

## How It Works

```
Session 1: "Add auth to the API"
  Claude Code writes code, runs tests, fixes bugs
  agentmemory silently captures every tool use
  Session ends -> LLM compresses observations into structured memory

Session 2: "Now add rate limiting"
  agentmemory injects context from Session 1:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - Decision: chose jose over jsonwebtoken for Edge compatibility
  Claude Code starts with full project awareness
```

No manual notes. No copy-pasting. The agent just knows.

## Architecture

agentmemory replaces the traditional memory stack with iii-engine's three primitives:

| Traditional Stack | agentmemory |
|---|---|
| Express.js server | iii Worker + HTTP Triggers |
| SQLite + FTS5 | iii KV State |
| SSE streaming | iii Streams (WebSocket) |
| Process manager (pm2/systemd) | iii-engine manages workers |
| 20+ REST endpoints | API Triggers -> Functions |

**27 source files. 1,808 lines of code. 35KB bundled.**

Scalable from day one -- iii-engine handles orchestration, state persistence, and real-time streaming natively.

## Quick Start

```bash
# 1. Start iii-engine
docker compose up -d

# 2. Install and build
npm install && npm run build

# 3. Start agentmemory worker
npm start
```

That's it. agentmemory connects to iii-engine on `ws://localhost:49134` and exposes REST endpoints on port `3111`.

### Configure Claude Code Hooks

Add to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "type": "command", "command": "node /path/to/agentmemory/dist/hooks/session-start.mjs" }],
    "UserPromptSubmit": [{ "type": "command", "command": "node /path/to/agentmemory/dist/hooks/prompt-submit.mjs" }],
    "PostToolUse": [{ "type": "command", "command": "node /path/to/agentmemory/dist/hooks/post-tool-use.mjs" }],
    "Stop": [{ "type": "command", "command": "node /path/to/agentmemory/dist/hooks/stop.mjs" }],
    "SessionEnd": [{ "type": "command", "command": "node /path/to/agentmemory/dist/hooks/session-end.mjs" }]
  }
}
```

Or install as a Claude Code plugin (see [Plugin Install](#claude-code-plugin)).

## Observation Pipeline

Every tool use flows through a four-stage pipeline:

```
Claude Code PostToolUse hook
  |
  v
mem::observe        Store raw observation to KV, push to real-time stream
  |
  v
mem::compress       LLM extracts structured data (type, facts, narrative, concepts, files)
  |                 Runs async -- doesn't block the coding session
  v
mem::summarize      End-of-session: LLM generates session summary from all observations
```

### What Gets Captured

| Hook | Data |
|------|------|
| `SessionStart` | Project path, session ID, working directory |
| `UserPromptSubmit` | User prompts (privacy-filtered) |
| `PostToolUse` | Tool name, input, output (Read, Write, Edit, Bash, etc.) |
| `Stop` | Triggers session summarization |
| `SessionEnd` | Marks session complete |

### Privacy

All observations pass through `mem::privacy` before storage:
- `<private>...</private>` blocks are stripped
- API keys, tokens, and secrets are redacted (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, etc.)

## Context Injection

On `SessionStart`, agentmemory builds a context block from previous sessions:

```
mem::context
  |
  +-- Load recent sessions for this project (up to 10)
  +-- For each: prefer session summary, fall back to high-importance observations
  +-- Apply token budget (default: 2000 tokens)
  +-- Return formatted <agentmemory-context> block
```

The hook writes the context to stdout, and Claude Code injects it into the conversation.

## LLM Providers

agentmemory uses LLM calls for two operations: compressing observations and generating session summaries. Four providers are supported:

| Provider | Config | Cost |
|----------|--------|------|
| **Claude subscription** (default) | No config needed | Included in Max/Pro |
| **Anthropic API** | `ANTHROPIC_API_KEY` | Per-token |
| **Gemini** | `GEMINI_API_KEY` | Per-token |
| **OpenRouter** | `OPENROUTER_API_KEY` | Per-token |

Provider is auto-detected. No API key configured = subscription mode via `@anthropic-ai/claude-agent-sdk`.

### Configure

Create `~/.agentmemory/.env`:

```env
# Pick one (or leave empty for subscription mode)
ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...

# Optional: override model
# ANTHROPIC_MODEL=claude-sonnet-4-20250514
# GEMINI_MODEL=gemini-2.0-flash
# OPENROUTER_MODEL=anthropic/claude-sonnet-4-20250514

# Optional: engine connection (defaults shown)
# III_ENGINE_URL=ws://localhost:49134
# III_REST_PORT=3111
# III_STREAMS_PORT=3112

# Optional: memory settings
# TOKEN_BUDGET=2000
# MAX_OBS_PER_SESSION=500
```

## API Endpoints

All endpoints are served via iii-engine's REST API on port `3111`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check |
| `POST` | `/agentmemory/session/start` | Start session, return context from previous sessions |
| `POST` | `/agentmemory/session/end` | Mark session complete |
| `POST` | `/agentmemory/observe` | Capture a tool-use observation |
| `POST` | `/agentmemory/context` | Generate context for a project |
| `POST` | `/agentmemory/search` | Search observations by keyword |
| `POST` | `/agentmemory/summarize` | Generate session summary |
| `GET` | `/agentmemory/sessions` | List all sessions |
| `GET` | `/agentmemory/observations?sessionId=X` | Get observations for a session |
| `GET` | `/agentmemory/viewer` | Real-time web viewer |
| `POST` | `/agentmemory/migrate` | Import from SQLite database |

### Examples

```bash
# Health check
curl http://localhost:3111/agentmemory/health

# Search observations
curl -X POST http://localhost:3111/agentmemory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication middleware", "limit": 10}'

# Get context for a project
curl -X POST http://localhost:3111/agentmemory/context \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "current", "project": "/path/to/project"}'

# List all sessions
curl http://localhost:3111/agentmemory/sessions
```

## Real-Time Viewer

Open `http://localhost:3111/agentmemory/viewer` in your browser.

The viewer connects to iii-engine's WebSocket stream on port `3112` and shows observations as they flow in -- raw captures first, then structured data after LLM compression.

Dark theme. Timeline layout. Filter by session. Auto-scrolls.

## Claude Code Plugin

Install as a plugin for automatic hook registration:

```bash
# Build first
npm run build

# Option 1: Symlink the plugin directory
ln -s /path/to/agentmemory/plugin ~/.claude/plugins/agentmemory

# Option 2: Copy plugin manifest
cp -r plugin/ ~/.claude/plugins/agentmemory
```

The plugin registers all 5 hooks automatically via `hooks.json`.

## Migration

Import data from existing SQLite-based memory systems:

```bash
curl -X POST http://localhost:3111/agentmemory/migrate \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "/path/to/memory.db"}'
```

Reads `sessions`, `observations`/`compressed_observations`, and `session_summaries` tables. Requires `better-sqlite3` as an optional dependency:

```bash
npm install better-sqlite3
```

## iii-engine Functions

agentmemory registers these iii Functions:

| Function ID | Description |
|-------------|-------------|
| `mem::observe` | Capture and store a tool-use observation |
| `mem::compress` | LLM compression of raw observation into structured data |
| `mem::privacy` | Strip private data, secrets, and API keys |
| `mem::search` | Keyword search across compressed observations |
| `mem::context` | Generate token-budgeted context from past sessions |
| `mem::summarize` | LLM-generated end-of-session summary |
| `mem::migrate` | Import data from SQLite databases |
| `api::health` | Health check endpoint |
| `api::session::start` | Session start + context retrieval |
| `api::session::end` | Mark session complete |
| `api::observe` | HTTP -> `mem::observe` |
| `api::context` | HTTP -> `mem::context` |
| `api::search` | HTTP -> `mem::search` |
| `api::summarize` | HTTP -> `mem::summarize` |
| `api::sessions` | List all sessions |
| `api::observations` | Get session observations |
| `api::viewer` | Serve web viewer |
| `api::migrate` | HTTP -> `mem::migrate` |

Event triggers (queue type) handle async lifecycle events: `session.started`, `observation`, `session.stopped`, `session.ended`.

## KV State Schema

| Scope | Key | Data |
|-------|-----|------|
| `mem:sessions` | `{session_id}` | Session metadata, project, timestamps |
| `mem:obs:{session_id}` | `{obs_id}` | Compressed observations |
| `mem:summaries` | `{session_id}` | End-of-session summaries |
| `mem:memories` | `{memory_id}` | Long-term memories |
| `mem:config` | `{key}` | Plugin settings |

## Project Structure

```
agentmemory/
├── src/
│   ├── index.ts                 # Worker entry: init SDK, register all
│   ├── types.ts                 # TypeScript interfaces
│   ├── config.ts                # Env vars, provider auto-detection
│   ├── hooks/                   # 5 Claude Code hook scripts
│   │   ├── session-start.ts     # Start session, inject context (stdout)
│   │   ├── prompt-submit.ts     # Capture user prompts
│   │   ├── post-tool-use.ts     # Capture tool usage
│   │   ├── stop.ts              # Trigger session summarization
│   │   └── session-end.ts       # Mark session complete
│   ├── providers/               # LLM provider abstraction
│   │   ├── index.ts             # Factory + auto-detection
│   │   ├── agent-sdk.ts         # Claude subscription (Agent SDK)
│   │   ├── anthropic.ts         # Direct Anthropic API
│   │   └── openrouter.ts        # OpenRouter + Gemini
│   ├── functions/               # iii Functions (core logic)
│   │   ├── observe.ts           # Capture + store + stream
│   │   ├── compress.ts          # LLM compression
│   │   ├── privacy.ts           # Secret/tag stripping
│   │   ├── search.ts            # Keyword search
│   │   ├── context.ts           # Context generation
│   │   ├── summarize.ts         # Session summary
│   │   └── migrate.ts           # SQLite import
│   ├── triggers/                # Trigger registrations
│   │   ├── api.ts               # 11 HTTP endpoints
│   │   └── events.ts            # 4 queue event handlers
│   ├── state/                   # State helpers
│   │   ├── kv.ts                # Typed KV wrapper
│   │   ├── schema.ts            # Scope constants + ID generators
│   │   └── search-index.ts      # In-memory keyword index
│   ├── prompts/                 # LLM prompts
│   │   ├── compression.ts       # Observation compression prompt
│   │   └── summary.ts           # Session summary prompt
│   └── viewer/
│       └── index.html           # Single-file dark-theme viewer
├── plugin/                      # Claude Code plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── hooks/
│       └── hooks.json
├── docker-compose.yml           # iii-engine container
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── LICENSE                      # Apache-2.0
```

## Prerequisites

- **Node.js** >= 18
- **Docker** (for iii-engine)
- **Claude Code** (for hook integration)

## Development

```bash
# Dev mode with hot reload
npm run dev

# Build
npm run build

# Run tests
npm test
```

## License

[Apache-2.0](LICENSE)
