<p align="center">
  <img src="assets/banner.png" alt="agentmemory — Persistent memory for AI coding agents" width="720" />
</p>

<p align="center">
  <strong>Persistent memory for AI coding agents.</strong><br/>
  Powered by <a href="https://iii.dev">iii-engine</a>.
</p>

<p align="center">
  <a href="#why-agentmemory">Why</a> &bull;
  <a href="#supported-agents">Agents</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#search">Search</a> &bull;
  <a href="#memory-evolution">Memory Evolution</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#api">API</a>
</p>

---

## Why agentmemory

AI coding agents forget everything between sessions. You explain the same architecture, re-discover the same patterns, and re-learn the same preferences every time. agentmemory fixes that.

```
Session 1: "Add auth to the API"
  Agent writes code, runs tests, fixes bugs
  agentmemory silently captures every tool use
  Session ends -> observations compressed into structured memory

Session 2: "Now add rate limiting"
  agentmemory injects context from Session 1:
    - Auth uses JWT middleware in src/middleware/auth.ts
    - Tests in test/auth.test.ts cover token validation
    - Decision: chose jose over jsonwebtoken for Edge compatibility
  Agent starts with full project awareness
```

No manual notes. No copy-pasting. The agent just *knows*.

### What it gives you

| Capability | What it does |
|---|---|
| **Automatic capture** | Every tool use, file edit, test run, and error is silently recorded via hooks |
| **LLM compression** | Raw observations are compressed into structured facts, concepts, and narratives |
| **Context injection** | Past knowledge is injected at session start within a configurable token budget |
| **Semantic search** | Hybrid BM25 + vector search finds relevant memories even with different wording |
| **Memory evolution** | Memories version over time, supersede each other, and form relationship graphs |
| **Project profiles** | Aggregated per-project intelligence: top concepts, files, conventions, common errors |
| **Auto-forgetting** | TTL expiry, contradiction detection, and importance-based eviction keep memory clean |
| **Privacy first** | API keys, secrets, and `<private>` tags are stripped before anything is stored |
| **Self-healing** | Circuit breaker, provider fallback chain, self-correcting LLM output, health monitoring |

### How it compares

| | CLAUDE.md | agentmemory |
|---|---|---|
| Storage | Flat file | iii-engine KV (persistent, distributed) |
| Capture | Manual | All 12 hook types |
| Search | Text find | Hybrid BM25 + vector (6 embedding providers) |
| Intelligence | None | LLM compression, quality scoring, self-correction |
| Memory model | Append-only | Versioned with relationships and evolution |
| Forgetting | Manual delete | Auto-forget (TTL, contradictions, importance) |
| Multi-agent | One file | Shared KV with project-scoped profiles |
| Observability | None | Health monitor, circuit breaker, OTEL telemetry |
| Integration | Built-in | Plugin + MCP server + REST API + slash commands |

## Supported Agents

agentmemory works with any agent that supports hooks, MCP, or via its REST API.

### Native hook support (zero config)

These agents support hooks natively. agentmemory captures tool usage automatically via its 12 hooks.

| Agent | Integration | Setup |
|---|---|---|
| **Claude Code** | 12 hooks (all types) | `/plugin install agentmemory` or manual hook config |
| **Claude Code SDK** | Agent SDK provider | Built-in `AgentSDKProvider` uses your Claude subscription |

### MCP support (any MCP-compatible agent)

Any agent that connects to MCP servers can use agentmemory's 10 tools. The agent actively queries and saves memory through MCP calls.

| Agent | How to connect |
|---|---|
| **Claude Desktop** | Add to `claude_desktop_config.json` MCP servers |
| **Cursor** | Add MCP server in settings |
| **Windsurf** | MCP server configuration |
| **Cline / Continue** | MCP server configuration |
| **Any MCP client** | Point to `http://localhost:3111/agentmemory/mcp/*` |

### REST API (any agent, any language)

Agents without hooks or MCP can integrate via the 28 REST endpoints directly. This works with any agent, language, or framework.

```bash
POST /agentmemory/observe       # Capture what the agent did
POST /agentmemory/smart-search  # Find relevant memories
POST /agentmemory/context       # Get context for injection
POST /agentmemory/remember      # Save long-term memory
GET  /agentmemory/profile       # Get project intelligence
```

### Choosing an integration method

| Your situation | Use |
|---|---|
| Claude Code user | Plugin install (hooks + MCP + skills) |
| Building a custom agent with Claude SDK | AgentSDKProvider (zero config) |
| Using Cursor, Windsurf, or any MCP client | MCP server (10 tools) |
| Building your own agent framework | REST API (28 endpoints) |
| Sharing memory across multiple agents | All agents point to the same iii-engine instance |

## Quick Start

### 1. Install the Plugin (Claude Code)

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

All 12 hooks, 4 skills, and MCP server are registered automatically.

### 2. Start the Worker

```bash
git clone https://github.com/rohitg00/agentmemory.git
cd agentmemory

docker compose up -d       # Start iii-engine
npm install && npm run build && npm start
```

### 3. Verify

```bash
curl http://localhost:3111/agentmemory/health
```

```json
{
  "status": "healthy",
  "service": "agentmemory",
  "version": "0.3.0",
  "health": {
    "memory": { "heapUsed": 42000000, "heapTotal": 67000000 },
    "cpu": { "percent": 2.1 },
    "eventLoopLagMs": 1.2,
    "status": "healthy"
  },
  "circuitBreaker": { "state": "closed", "failures": 0 }
}
```

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

```
PostToolUse hook fires
  -> Dedup check      SHA-256 hash (5min window, no duplicates)
  -> mem::privacy     Strip secrets, API keys, <private> tags
  -> mem::observe     Store raw observation, push to real-time stream
  -> mem::compress    LLM extracts: type, facts, narrative, concepts, files
                      Validates with Zod, scores quality (0-100)
                      Self-corrects on validation failure (1 retry)
                      Generates vector embedding for semantic search
```

### Context Injection

```
SessionStart hook fires
  -> mem::context     Load recent sessions for this project
                      Hybrid search (BM25 + vector) across observations
                      Inject project profile (top concepts, files, patterns)
                      Apply token budget (default: 2000 tokens)
  -> stdout           Agent receives context in the conversation
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
| `SubagentStart/Stop` | Sub-agent lifecycle events |
| `Notification` | System notifications |
| `TaskCompleted` | Task completion events |
| `Stop` | Triggers end-of-session summary |
| `SessionEnd` | Marks session complete |

## Search

agentmemory v0.3.0 supports hybrid search combining keyword matching with semantic understanding.

### How search works

| Mode | When | How |
|---|---|---|
| **BM25 only** | No embedding API key configured | Keyword matching with BM25 (k1=1.2, b=0.75) |
| **Hybrid** | Any embedding key configured | BM25 + vector cosine similarity fused with Reciprocal Rank Fusion (k=60) |

Hybrid search means "authentication middleware" finds results even if the stored text says "auth layer" or "JWT validation". BM25-only mode still works well for exact keyword matches.

### Embedding providers

agentmemory auto-detects which provider to use from your environment variables. No embedding key? It falls back to BM25-only mode with zero degradation.

| Provider | Model | Dimensions | Env Var | Notes |
|---|---|---|---|---|
| Gemini | `text-embedding-004` | 768 | `GEMINI_API_KEY` | Free tier (1500 RPM) |
| OpenAI | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` | $0.02/1M tokens |
| Voyage AI | `voyage-code-3` | 1024 | `VOYAGE_API_KEY` | Optimized for code |
| Cohere | `embed-english-v3.0` | 1024 | `COHERE_API_KEY` | Free trial available |
| OpenRouter | Any embedding model | varies | `OPENROUTER_API_KEY` | Multi-model proxy |
| Local | `all-MiniLM-L6-v2` | 384 | (none) | Offline, optional `@xenova/transformers` |

Override auto-detection with `EMBEDDING_PROVIDER=voyage` in your `.env`.

### Progressive disclosure

Smart search returns compact results first (title, type, score, timestamp) to save tokens. Expand specific IDs to get full observation details.

```bash
# Compact results (50-100 tokens each)
curl -X POST http://localhost:3111/agentmemory/smart-search \
  -d '{"query": "database migration"}'

# Expand specific results (500-1000 tokens each)
curl -X POST http://localhost:3111/agentmemory/smart-search \
  -d '{"expandIds": ["obs_abc123", "obs_def456"]}'
```

## Memory Evolution

Memories in agentmemory are not static. They version, evolve, and form relationships.

### Versioning

When you save a memory that's similar to an existing one (Jaccard > 0.7), the old memory is superseded:

```
v1: "Use Express for API routes"
v2: "Use Fastify instead of Express for API routes" (supersedes v1)
v3: "Use Hono instead of Fastify for Edge API routes" (supersedes v2)
```

Only the latest version is returned in search results. The full chain is preserved for audit.

### Relationships

Memories can be linked: `supersedes`, `extends`, `derives`, `contradicts`, `related`. Traversal follows these links up to N hops.

### Auto-forget

agentmemory automatically cleans itself:

| Mechanism | What it does |
|---|---|
| **TTL expiry** | Memories with `forgetAfter` date are deleted when expired |
| **Contradiction detection** | Near-duplicate memories (Jaccard > 0.9) — older one is demoted |
| **Low-value eviction** | Observations older than 90 days with importance < 3 are removed |
| **Per-project cap** | Projects are capped at 10,000 observations (lowest importance evicted first) |

Run `POST /agentmemory/auto-forget?dryRun=true` to preview what would be cleaned.

### Project profiles

agentmemory aggregates observations into per-project intelligence:

```bash
curl "http://localhost:3111/agentmemory/profile?project=/my/project"
```

Returns top concepts, most-touched files, coding conventions, common errors, and a session count. This profile is automatically injected into session context.

### Timeline

Navigate observations chronologically around any anchor point:

```bash
curl -X POST http://localhost:3111/agentmemory/timeline \
  -d '{"anchor": "2026-02-15", "before": 5, "after": 5}'
```

### Export / Import

Full data portability:

```bash
# Export everything
curl http://localhost:3111/agentmemory/export > backup.json

# Import with merge strategy
curl -X POST http://localhost:3111/agentmemory/import \
  -d '{"exportData": ..., "strategy": "merge"}'
```

Strategies: `merge` (combine), `replace` (overwrite), `skip` (ignore duplicates).

## Self-Evaluation

agentmemory monitors its own health and validates its own output.

### Quality scoring

Every LLM compression is scored 0-100 based on structured facts, narrative quality, concept extraction, title quality, and importance range. Scores are tracked per-function and exposed via `/health`.

### Self-correction

When LLM output fails Zod validation, agentmemory retries with a stricter prompt explaining the exact errors. This recovers from malformed JSON, missing fields, and out-of-range values.

### Circuit breaker + fallback chain

```
Primary provider fails
  -> Circuit breaker opens (3 failures in 60s)
  -> Falls back to next provider in FALLBACK_PROVIDERS chain
  -> 30s cooldown -> half-open -> test call -> recovery
```

Configure with `FALLBACK_PROVIDERS=anthropic,gemini,openrouter`. When all providers are down, observations are stored raw without compression. No data is lost.

### Health monitor

Collects every 30 seconds: heap usage, CPU percentage (delta sampling), event loop lag, connection state. Alerts at warning (80% CPU, 100ms lag) and critical (90% CPU, 500ms lag) thresholds. `GET /agentmemory/health` returns HTTP 503 when critical.

## MCP Server

10 tools for any MCP-compatible client:

| Tool | Description |
|------|-------------|
| `memory_recall` | Search past observations by keyword |
| `memory_save` | Save an insight, decision, or pattern |
| `memory_file_history` | Get past observations about specific files |
| `memory_patterns` | Detect recurring patterns across sessions |
| `memory_sessions` | List recent sessions with status |
| `memory_smart_search` | Hybrid semantic + keyword search with progressive disclosure |
| `memory_timeline` | Chronological observations around an anchor point |
| `memory_profile` | Project profile with top concepts, files, patterns |
| `memory_export` | Export all memory data as JSON |
| `memory_relations` | Query memory relationship graph |

### MCP Endpoints

```
GET  /agentmemory/mcp/tools   — List available tools
POST /agentmemory/mcp/call    — Execute a tool
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

agentmemory needs an LLM for compressing observations and generating summaries. It auto-detects from your environment.

| Provider | Config | Notes |
|----------|--------|-------|
| **Claude subscription** (default) | No config needed | Uses `@anthropic-ai/claude-agent-sdk`. Zero cost beyond your Max/Pro plan |
| **Anthropic API** | `ANTHROPIC_API_KEY` | Direct API access, per-token billing |
| **Gemini** | `GEMINI_API_KEY` | Also enables Gemini embeddings (free tier) |
| **OpenRouter** | `OPENROUTER_API_KEY` | Access any model through one API |

No API key? agentmemory uses your Claude subscription automatically. Zero config.

### Environment Variables

Create `~/.agentmemory/.env`:

```env
# LLM provider (pick one, or leave empty for Claude subscription)
ANTHROPIC_API_KEY=sk-ant-...
# GEMINI_API_KEY=...
# OPENROUTER_API_KEY=...

# Embedding provider (auto-detected from LLM keys, or override)
# EMBEDDING_PROVIDER=voyage
# VOYAGE_API_KEY=...
# OPENAI_API_KEY=...
# COHERE_API_KEY=...

# Hybrid search weights (default: 0.4 BM25 + 0.6 vector)
# BM25_WEIGHT=0.4
# VECTOR_WEIGHT=0.6

# Provider fallback chain (comma-separated, tried in order)
# FALLBACK_PROVIDERS=anthropic,gemini,openrouter

# Bearer token for API auth
# AGENTMEMORY_SECRET=your-secret-here

# Engine connection
# III_ENGINE_URL=ws://localhost:49134
# III_REST_PORT=3111
# III_STREAMS_PORT=3112

# Memory tuning
# TOKEN_BUDGET=2000
# MAX_OBS_PER_SESSION=500
```

## API

28 endpoints on port `3111`. Protected endpoints require `Authorization: Bearer <secret>` when `AGENTMEMORY_SECRET` is set.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check with metrics (always public) |
| `POST` | `/agentmemory/session/start` | Start session + get context |
| `POST` | `/agentmemory/session/end` | Mark session complete |
| `POST` | `/agentmemory/observe` | Capture observation |
| `POST` | `/agentmemory/context` | Generate context |
| `POST` | `/agentmemory/search` | Search observations (BM25) |
| `POST` | `/agentmemory/smart-search` | Hybrid search with progressive disclosure |
| `POST` | `/agentmemory/summarize` | Generate session summary |
| `POST` | `/agentmemory/remember` | Save to long-term memory |
| `POST` | `/agentmemory/forget` | Delete observations/sessions |
| `POST` | `/agentmemory/consolidate` | Merge duplicate observations |
| `POST` | `/agentmemory/patterns` | Detect recurring patterns |
| `POST` | `/agentmemory/generate-rules` | Generate CLAUDE.md rules from patterns |
| `POST` | `/agentmemory/file-context` | Get file-specific history |
| `POST` | `/agentmemory/evict` | Evict stale memories (`?dryRun=true`) |
| `POST` | `/agentmemory/migrate` | Import from SQLite |
| `POST` | `/agentmemory/timeline` | Chronological observations around anchor |
| `POST` | `/agentmemory/relations` | Create memory relationship |
| `POST` | `/agentmemory/evolve` | Evolve memory (new version) |
| `POST` | `/agentmemory/auto-forget` | Run auto-forget (`?dryRun=true`) |
| `POST` | `/agentmemory/import` | Import data from JSON |
| `GET` | `/agentmemory/profile` | Project profile (`?project=/path`) |
| `GET` | `/agentmemory/export` | Export all data as JSON |
| `GET` | `/agentmemory/sessions` | List all sessions |
| `GET` | `/agentmemory/observations` | Session observations (`?sessionId=X`) |
| `GET` | `/agentmemory/viewer` | Real-time web viewer |
| `GET` | `/agentmemory/mcp/tools` | List MCP tools |
| `POST` | `/agentmemory/mcp/call` | Execute MCP tool |

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

## Architecture

agentmemory is built on iii-engine's three primitives:

| What you'd normally need | What agentmemory uses |
|---|---|
| Express.js / Fastify | iii HTTP Triggers |
| SQLite / Postgres + pgvector | iii KV State + in-memory vector index |
| SSE / Socket.io | iii Streams (WebSocket) |
| pm2 / systemd | iii-engine worker management |
| Prometheus / Grafana | iii OTEL + built-in health monitor |
| Redis (circuit breaker) | In-process circuit breaker + fallback chain |

**69 source files. ~5,600 LOC. 144 tests. 126KB bundled.**

### Functions (21)

| Function | Purpose |
|----------|---------|
| `mem::observe` | Store raw observation with dedup check |
| `mem::compress` | LLM compression with validation + quality scoring + embedding |
| `mem::search` | BM25-ranked full-text search |
| `mem::smart-search` | Hybrid search with progressive disclosure |
| `mem::context` | Build session context within token budget |
| `mem::summarize` | Generate validated session summaries |
| `mem::remember` | Save to long-term memory (auto-supersedes similar) |
| `mem::forget` | Delete observations, sessions, or memories |
| `mem::file-index` | File-specific observation lookup |
| `mem::consolidate` | Merge duplicate observations |
| `mem::patterns` | Detect recurring patterns |
| `mem::generate-rules` | Generate CLAUDE.md rules from patterns |
| `mem::migrate` | Import from SQLite |
| `mem::evict` | Age + importance + cap-based memory eviction |
| `mem::relate` | Create relationship between memories |
| `mem::evolve` | Create new version of a memory |
| `mem::get-related` | Traverse memory relationship graph |
| `mem::timeline` | Chronological observations around anchor |
| `mem::profile` | Aggregate project profile |
| `mem::auto-forget` | TTL expiry + contradiction detection |
| `mem::export` / `mem::import` | Full JSON round-trip |

### Data Model

| Scope | Stores |
|-------|--------|
| `mem:sessions` | Session metadata, project, timestamps |
| `mem:obs:{session_id}` | Compressed observations with embeddings |
| `mem:summaries` | End-of-session summaries |
| `mem:memories` | Long-term memories (versioned, with relationships) |
| `mem:relations` | Memory relationship graph |
| `mem:profiles` | Aggregated project profiles |
| `mem:emb:{obs_id}` | Vector embeddings |
| `mem:index:bm25` | Persisted BM25 index |
| `mem:metrics` | Per-function metrics |
| `mem:health` | Health snapshots |
| `mem:config` | Runtime configuration overrides |

## Development

```bash
npm run dev               # Hot reload
npm run build             # Production build (126KB)
npm test                  # Unit tests (144 tests, ~700ms)
npm run test:integration  # API tests (requires running services)
```

### Prerequisites

- Node.js >= 18
- Docker

## License

[Apache-2.0](LICENSE)
