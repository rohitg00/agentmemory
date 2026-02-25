<p align="center">
  <h1 align="center">agentmemory</h1>
  <p align="center">Persistent memory for AI coding agents.<br/>Powered by <a href="https://iii.dev">iii-engine</a>.</p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
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

## Quick Start

```bash
git clone https://github.com/rohitg00/agentmemory.git
cd agentmemory

# Start iii-engine
docker compose up -d

# Install, build, run
npm install && npm run build && npm start
```

agentmemory connects to iii-engine on `ws://localhost:49134` and exposes its API on port `3111`.

### Verify it works

```bash
curl http://localhost:3111/agentmemory/health
# {"status":"ok","service":"agentmemory","version":"0.1.0"}
```

### Connect to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/session-start.mjs" }],
    "UserPromptSubmit": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/prompt-submit.mjs" }],
    "PostToolUse": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/post-tool-use.mjs" }],
    "Stop": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/stop.mjs" }],
    "SessionEnd": [{ "type": "command", "command": "node ~/agentmemory/dist/hooks/session-end.mjs" }]
  }
}
```

Or install as a [Claude Code plugin](#plugin-install) for automatic hook registration.

That's it. Start a Claude Code session and agentmemory begins capturing. Start another session and it injects context from all previous sessions.

## How It Works

### Observation Pipeline

Every tool use flows through this pipeline:

```
PostToolUse hook fires
  -> mem::privacy     Strip secrets, API keys, <private> tags
  -> mem::observe     Store raw observation, push to real-time stream
  -> mem::compress    LLM extracts: type, facts, narrative, concepts, files
                      (async -- never blocks your session)
```

### Context Injection

On `SessionStart`, agentmemory builds context from your history:

```
SessionStart hook fires
  -> mem::context     Load recent sessions for this project
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
| `PostToolUse` | Tool name, input, output (Read, Write, Edit, Bash, etc.) |
| `Stop` | Triggers end-of-session summary |
| `SessionEnd` | Marks session complete |

### Privacy

All data passes through `mem::privacy` before storage:
- `<private>...</private>` tags are stripped
- API keys (`sk-*`, `ghp_*`, `xoxb-*`, `AKIA*`), JWTs, and secrets are redacted

## Configuration

### LLM Providers

agentmemory needs an LLM for two things: compressing observations and generating session summaries.

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
| `GET` | `/agentmemory/health` | Health check (always public) |
| `POST` | `/agentmemory/session/start` | Start session + get context |
| `POST` | `/agentmemory/session/end` | Mark session complete |
| `POST` | `/agentmemory/observe` | Capture observation |
| `POST` | `/agentmemory/context` | Generate context |
| `POST` | `/agentmemory/search` | Search observations |
| `POST` | `/agentmemory/summarize` | Generate session summary |
| `GET` | `/agentmemory/sessions` | List all sessions |
| `GET` | `/agentmemory/observations?sessionId=X` | Session observations |
| `GET` | `/agentmemory/viewer` | Real-time web viewer |
| `POST` | `/agentmemory/migrate` | Import from SQLite |

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

# Search across all observations
curl -X POST http://localhost:3111/agentmemory/search \
  -H "Content-Type: application/json" \
  -d '{"query": "authentication middleware", "limit": 10}'

# Get context for a new session
curl -X POST http://localhost:3111/agentmemory/context \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "ses-2", "project": "/my/project"}'

# List sessions
curl http://localhost:3111/agentmemory/sessions
```

## Real-Time Viewer

Open [http://localhost:3111/agentmemory/viewer](http://localhost:3111/agentmemory/viewer) to watch observations flow in real-time.

Connects to iii-engine's WebSocket stream. Dark theme, timeline layout, session filtering, auto-scroll.

## Plugin Install

Install as a Claude Code plugin for zero-config hook registration:

```bash
# Symlink into Claude Code plugins
ln -s /path/to/agentmemory/plugin ~/.claude/plugins/agentmemory
```

All 5 hooks are registered automatically via `hooks.json`.

## Migration

Import from existing SQLite-based memory systems (e.g., claude-mem):

```bash
npm install better-sqlite3

curl -X POST http://localhost:3111/agentmemory/migrate \
  -H "Content-Type: application/json" \
  -d '{"dbPath": "~/.claude-mem/claude-mem.db"}'
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

**~30 source files. ~1,800 LOC. 37KB bundled.**

### Data Model

| Scope | Key | Stores |
|-------|-----|--------|
| `mem:sessions` | `{session_id}` | Session metadata, project, timestamps |
| `mem:obs:{session_id}` | `{obs_id}` | Compressed observations |
| `mem:summaries` | `{session_id}` | End-of-session summaries |

## Development

```bash
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # Unit tests (45 tests, ~250ms)
npm run test:integration  # API tests (requires running services)
```

### Prerequisites

- Node.js >= 18
- Docker

## License

[Apache-2.0](LICENSE)
