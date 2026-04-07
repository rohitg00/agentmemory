<p align="center">
  <img src="assets/banner.png" alt="agentmemory — Persistent memory for AI coding agents" width="720" />
</p>

<p align="center">
  <strong>Persistent memory for AI coding agents.</strong><br/>
  Powered by <a href="https://iii.dev">iii-engine</a>.
</p>

<p align="center">
  <img src="assets/demo.gif" alt="agentmemory demo" width="720" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#why-agentmemory">Why</a> &bull;
  <a href="#supported-agents">Agents</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#search">Search</a> &bull;
  <a href="#memory-evolution">Memory Evolution</a> &bull;
  <a href="#mcp-server">MCP</a> &bull;
  <a href="#real-time-viewer">Viewer</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#api">API</a>
</p>

---

Every AI coding agent has the same blind spot. Session ends, memory vanishes. You re-explain architecture. You re-discover bugs. You re-teach preferences. Built-in memory files like CLAUDE.md and .cursorrules are 200-line sticky notes that overflow and go stale. agentmemory replaces that with a searchable, versioned, cross-agent database — 43 MCP tools, triple-stream retrieval (BM25 + vector + knowledge graph), 4-tier memory consolidation, provenance-tracked citations, and cascading staleness so retired facts never pollute your context again. One instance serves Claude Code, Cursor, Codex, Windsurf, and any MCP client simultaneously. 627 tests. Zero external DB dependencies.

The result is measurable. On 240 real observations across 30 sessions, agentmemory hits 64% Recall@10 and perfect MRR while using 92% fewer tokens than dumping everything into context. When an agent searches "database performance optimization," it finds the N+1 fix you made three weeks ago — something keyword grep literally cannot do. Memories version automatically, supersede each other, propagate staleness to related graph nodes, and sync across agent instances via P2P mesh. Your agents stop repeating mistakes. Your context stays clean. Your sessions start fast.

```bash
npx @agentmemory/agentmemory   # installs iii-engine if missing, starts everything
```

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
| **Claude Code bridge** | Bi-directional sync with `~/.claude/projects/*/memory/MEMORY.md` |
| **Cross-agent MCP** | Standalone MCP server for Cursor, Codex, Gemini CLI, Windsurf, any MCP client |
| **Citation provenance** | JIT verification traces any memory back to source observations and sessions |
| **Cascading staleness** | Superseded memories auto-flag related graph nodes, edges, and siblings as stale |
| **Knowledge graph** | Entity extraction + BFS traversal across files, functions, concepts, errors |
| **4-tier memory** | Working → episodic → semantic → procedural consolidation with strength decay |
| **Team memory** | Namespaced shared + private memory across team members |
| **Governance** | Edit, delete, bulk-delete, and audit trail for all memory operations |
| **Git snapshots** | Version, rollback, and diff memory state via git commits |

### How it compares to built-in agent memory

Every AI coding agent now ships with built-in memory — Claude Code has `MEMORY.md`, Cursor has notepads, Windsurf has Cascade memories, Cline has memory bank. These work like sticky notes: fast, always-on, but fundamentally limited.

agentmemory is the searchable database behind the sticky notes.

| | Built-in (CLAUDE.md, .cursorrules) | agentmemory |
|---|---|---|
| Scale | 200-line cap (MEMORY.md) | Unlimited |
| Search | Loads everything into context | BM25 + vector + graph (returns top-K only) |
| Token cost | 22K+ tokens at 240 observations | ~1,900 tokens (92% less) |
| At 1K observations | 80% of memories invisible | 100% searchable |
| At 5K observations | Exceeds context window | Still ~2K tokens |
| Cross-session recall | Only within line cap | Full corpus search |
| Cross-agent | Per-agent files (no sharing) | MCP + REST API (any agent) |
| Multi-agent coordination | Impossible | Leases, signals, actions, routines |
| Cross-agent sync | No | P2P mesh (7 scopes: memories, actions, semantic, procedural, relations, graph) |
| Memory trust | No verification | Citation chain back to source observations with confidence scores |
| Semantic search | No (keyword grep) | Yes (Recall@10: 64% vs 56% for grep) |
| Memory lifecycle | Manual pruning | Ebbinghaus decay + tiered eviction |
| Knowledge graph | No | Entity extraction + temporal versioning |
| Observability | Read files manually | Real-time viewer on :3113 |

### Benchmarks (measured, not projected)

Evaluated on 240 real-world coding observations across 30 sessions with 20 labeled queries:

| System | Recall@10 | NDCG@10 | MRR | Tokens/query |
|---|---|---|---|---|
| Built-in (grep all into context) | 55.8% | 80.3% | 82.5% | 19,462 |
| agentmemory BM25 (stemmed + synonyms) | 55.9% | 82.7% | 95.5% | 1,571 |
| agentmemory + Xenova embeddings | **64.1%** | **94.9%** | **100.0%** | **1,571** |

With real embeddings, agentmemory finds "N+1 query fix" when you search "database performance optimization" — something keyword matching literally cannot do.

Full benchmark reports: [`benchmark/QUALITY.md`](benchmark/QUALITY.md), [`benchmark/SCALE.md`](benchmark/SCALE.md), [`benchmark/REAL-EMBEDDINGS.md`](benchmark/REAL-EMBEDDINGS.md)

## Supported Agents

agentmemory works with any agent that supports hooks, MCP, or via its REST API.

### Native hook support (zero config)

These agents support hooks natively. agentmemory captures tool usage automatically via its 12 hooks.

| Agent | Integration | Setup |
|---|---|---|
| **Claude Code** | 12 hooks (all types) | `/plugin install agentmemory` or manual hook config |
| **Claude Code SDK** | Agent SDK provider | Built-in `AgentSDKProvider` uses your Claude subscription |

### MCP support (any MCP-compatible agent)

Any agent that connects to MCP servers can use agentmemory's 43 tools, 6 resources, and 3 prompts. The agent actively queries and saves memory through MCP calls.

| Agent | How to connect |
|---|---|
| **Claude Desktop** | Add to `claude_desktop_config.json` MCP servers |
| **Cursor** | Add MCP server in settings |
| **Windsurf** | MCP server configuration |
| **Cline / Continue** | MCP server configuration |
| **Any MCP client** | Point to `http://localhost:3111/agentmemory/mcp/*` |

### REST API (any agent, any language)

Agents without hooks or MCP can integrate via 103 REST endpoints directly. This works with any agent, language, or framework.

```bash
POST /agentmemory/observe       # Capture what the agent did
POST /agentmemory/smart-search  # Find relevant memories
POST /agentmemory/context       # Get context for injection
POST /agentmemory/enrich        # Get enriched context (files + memories + bugs)
POST /agentmemory/remember      # Save long-term memory
GET  /agentmemory/profile       # Get project intelligence
```

### Choosing an integration method

| Your situation | Use |
|---|---|
| Claude Code user | Plugin install (hooks + MCP + skills) |
| Building a custom agent with Claude SDK | AgentSDKProvider (zero config) |
| Using Cursor, Windsurf, or any MCP client | MCP server (41 tools + 6 resources + 3 prompts) |
| Building your own agent framework | REST API (103 endpoints) |
| Sharing memory across multiple agents | All agents point to the same iii-engine instance |

## Quick Start

### 1. Install the Plugin (Claude Code)

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

All 12 hooks, 4 skills, and MCP server are registered automatically.

### 2. Start agentmemory

```bash
npx @agentmemory/agentmemory
```

This auto-installs iii-engine if missing, starts it, and runs the worker. One command.

Or from source:

```bash
git clone https://github.com/rohitg00/agentmemory.git && cd agentmemory
npm install && npm run build && npm start
```

### 3. Verify

```bash
curl http://localhost:3111/agentmemory/health

# Real-time viewer (auto-starts on port 3113)
open http://localhost:3113
```

```json
{
  "status": "healthy",
  "service": "agentmemory",
  "version": "0.7.4",
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
| `PreToolUse` | File access patterns + enriched context injection (Read, Write, Edit, Glob, Grep) |
| `PostToolUse` | Tool name, input, output |
| `PostToolUseFailure` | Failed tool invocations with error context |
| `PreCompact` | Re-injects memory context before context compaction |
| `SubagentStart/Stop` | Sub-agent lifecycle events |
| `Notification` | System notifications |
| `TaskCompleted` | Task completion events |
| `Stop` | Triggers end-of-session summary |
| `SessionEnd` | Marks session complete |

## Search

agentmemory uses triple-stream retrieval combining three signals for maximum recall.

### How search works

| Stream | What it does | When |
|---|---|---|
| **BM25** | Stemmed keyword matching with synonym expansion and binary-search prefix matching | Always on |
| **Vector** | Cosine similarity over dense embeddings (Xenova, OpenAI, Gemini, Voyage, Cohere, OpenRouter) | Any embedding provider configured |
| **Graph** | Knowledge graph traversal via entity matching and co-occurrence edges | Entities detected in query |

All three streams are fused with Reciprocal Rank Fusion (RRF, k=60) and session-diversified (max 3 results per session) to maximize coverage.

**BM25 enhancements (v0.6.0):** Porter stemmer normalizes word forms ("authentication" ↔ "authenticating"), coding-domain synonyms expand queries ("db" ↔ "database", "perf" ↔ "performance"), and binary-search prefix matching replaces O(n) scans.

### Embedding providers

agentmemory auto-detects which provider to use. For best results, install local embeddings (no API key needed):

```bash
npm install @xenova/transformers
```

| Provider | Model | Dimensions | Env Var | Notes |
|---|---|---|---|---|
| **Local (recommended)** | `all-MiniLM-L6-v2` | 384 | `EMBEDDING_PROVIDER=local` | Free, offline, +8pp recall over BM25-only |
| Gemini | `text-embedding-004` | 768 | `GEMINI_API_KEY` | Free tier (1500 RPM) |
| OpenAI | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` | $0.02/1M tokens |
| Voyage AI | `voyage-code-3` | 1024 | `VOYAGE_API_KEY` | Optimized for code |
| Cohere | `embed-english-v3.0` | 1024 | `COHERE_API_KEY` | Free trial available |
| OpenRouter | Any embedding model | varies | `OPENROUTER_API_KEY` | Multi-model proxy |

No embedding provider? BM25-only mode with stemming and synonyms still outperforms built-in memory.

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

Memories can be linked: `supersedes`, `extends`, `derives`, `contradicts`, `related`. Each relationship carries a confidence score (0-1) computed from co-occurrence, recency, and relation type. Traversal follows these links up to N hops, with optional `minConfidence` filtering.

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

### Tools (38)

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
| `memory_relations` | Query memory relationship graph (with confidence filtering) |
| `memory_claude_bridge_sync` | Sync memory to/from Claude Code's native MEMORY.md |
| `memory_graph_query` | Query the knowledge graph for entities and relationships |
| `memory_consolidate` | Run 4-tier memory consolidation pipeline |
| `memory_team_share` | Share a memory or observation with team members |
| `memory_team_feed` | Get recent shared items from all team members |
| `memory_audit` | View the audit trail of memory operations |
| `memory_governance_delete` | Delete specific memories with audit trail |
| `memory_snapshot_create` | Create a git-versioned snapshot of memory state |
| `memory_action_create` | Create actionable work items with typed dependencies |
| `memory_action_update` | Update action status, priority, or details |
| `memory_frontier` | Get unblocked actions ranked by priority and urgency |
| `memory_next` | Get the single most important next action |
| `memory_lease` | Acquire, release, or renew exclusive action leases |
| `memory_routine_run` | Instantiate a frozen workflow routine into action chains |
| `memory_signal_send` | Send threaded messages between agents |
| `memory_signal_read` | Read messages for an agent with read receipts |
| `memory_checkpoint` | Create or resolve external condition gates (CI, approval, deploy) |
| `memory_mesh_sync` | Sync memories and actions with peer instances |
| `memory_sentinel_create` | Create event-driven condition watchers |
| `memory_sentinel_trigger` | Externally fire a sentinel to unblock gated actions |
| `memory_sketch_create` | Create ephemeral action graphs for exploratory work |
| `memory_sketch_promote` | Promote sketch actions to permanent actions |
| `memory_crystallize` | LLM-powered compaction of completed action chains |
| `memory_diagnose` | Health checks across all subsystems |
| `memory_heal` | Auto-fix stuck, orphaned, and inconsistent state |
| `memory_facet_tag` | Attach structured dimension:value tags to targets |
| `memory_facet_query` | Query targets by facet tags with AND/OR logic |
| `memory_verify` | Trace a memory's provenance back to source observations and sessions |

### Resources (6)

| URI | Description |
|-----|-------------|
| `agentmemory://status` | Session count, memory count, health status |
| `agentmemory://project/{name}/profile` | Per-project intelligence (concepts, files, conventions) |
| `agentmemory://project/{name}/recent` | Last 5 session summaries for a project |
| `agentmemory://memories/latest` | Latest 10 active memories (id, title, type, strength) |
| `agentmemory://graph/stats` | Knowledge graph node and edge counts by type |
| `agentmemory://team/{id}/profile` | Team memory profile with shared concepts and patterns |

### Prompts (3)

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `recall_context` | `task_description` | Searches observations + memories, returns context messages |
| `session_handoff` | `session_id` | Returns session data + summary for handoff between agents |
| `detect_patterns` | `project` (optional) | Analyzes recurring patterns across sessions |

### Standalone MCP Server

Run agentmemory as a standalone MCP server for any MCP-compatible agent (Cursor, Codex, Gemini CLI, Windsurf):

```bash
npx agentmemory-mcp
```

Or add to your agent's MCP config:

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["agentmemory-mcp"]
    }
  }
}
```

The standalone server uses in-memory KV with optional JSON persistence (`STANDALONE_PERSIST_PATH`).

### MCP Endpoints (embedded mode)

```http
GET  /agentmemory/mcp/tools          — List available tools
POST /agentmemory/mcp/call           — Execute a tool
GET  /agentmemory/mcp/resources      — List available resources
POST /agentmemory/mcp/resources/read — Read a resource by URI
GET  /agentmemory/mcp/prompts        — List available prompts
POST /agentmemory/mcp/prompts/get    — Get a prompt with arguments
```

## Skills

Four slash commands for interacting with memory:

| Skill | Usage |
|-------|-------|
| `/recall` | Search memory for past context (`/recall auth middleware`) |
| `/remember` | Save something to long-term memory (`/remember always use jose for JWT`) |
| `/session-history` | Show recent session summaries |
| `/forget` | Delete specific observations or entire sessions |

## Real-Time Viewer

agentmemory includes a real-time web dashboard that auto-starts on port `3113` (configurable via `III_REST_PORT + 2`).

- Live observation stream via WebSocket
- Session explorer with observation details
- Memory browser with search and filtering
- Knowledge graph visualization
- Health and metrics dashboard

Access at `http://localhost:3113` or via `GET /agentmemory/viewer` on the API port. Protected by `AGENTMEMORY_SECRET` when set. CSP headers applied to all HTML responses.

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
# Viewer runs on III_REST_PORT + 2 (default: 3113)

# Memory tuning
# TOKEN_BUDGET=2000
# MAX_OBS_PER_SESSION=500

# Claude Code Memory Bridge (v0.5.0)
# CLAUDE_MEMORY_BRIDGE=false
# CLAUDE_MEMORY_LINE_BUDGET=200

# Standalone MCP Server (v0.5.0)
# STANDALONE_MCP=false
# STANDALONE_PERSIST_PATH=~/.agentmemory/standalone.json

# Knowledge Graph (v0.5.0)
# GRAPH_EXTRACTION_ENABLED=false
# GRAPH_EXTRACTION_BATCH_SIZE=10

# Consolidation Pipeline (v0.5.0)
# CONSOLIDATION_ENABLED=true
# CONSOLIDATION_DECAY_DAYS=30

# Lesson Decay (v0.7.0)
# LESSON_DECAY_ENABLED=true

# Obsidian Export (v0.7.0)
# OBSIDIAN_AUTO_EXPORT=false

# MCP Tool Visibility (v0.7.0) — "core" (7 tools) or "all" (41 tools)
# AGENTMEMORY_TOOLS=core

# Team Memory (v0.5.0)
# TEAM_ID=
# USER_ID=
# TEAM_MODE=private

# Git Snapshots (v0.5.0)
# SNAPSHOT_ENABLED=false
# SNAPSHOT_INTERVAL=3600
# SNAPSHOT_DIR=~/.agentmemory/snapshots
```

## API

109 endpoints on port `3111` (103 core + 6 MCP protocol). Protected endpoints require `Authorization: Bearer <secret>` when `AGENTMEMORY_SECRET` is set. The table below shows a representative subset; see `src/triggers/api.ts` for the full endpoint list.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agentmemory/health` | Health check with metrics (always public) |
| `GET` | `/agentmemory/livez` | Liveness probe (always public) |
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
| `POST` | `/agentmemory/enrich` | Unified enrichment (file context + memories + bugs) |
| `POST` | `/agentmemory/evict` | Evict stale memories (`?dryRun=true`) |
| `POST` | `/agentmemory/migrate` | Import from SQLite |
| `POST` | `/agentmemory/timeline` | Chronological observations around anchor |
| `POST` | `/agentmemory/relations` | Create memory relationship (with confidence) |
| `POST` | `/agentmemory/evolve` | Evolve memory (new version) |
| `POST` | `/agentmemory/auto-forget` | Run auto-forget (`?dryRun=true`) |
| `POST` | `/agentmemory/import` | Import data from JSON |
| `GET` | `/agentmemory/profile` | Project profile (`?project=/path`) |
| `GET` | `/agentmemory/export` | Export all data as JSON |
| `GET` | `/agentmemory/sessions` | List all sessions |
| `GET` | `/agentmemory/observations` | Session observations (`?sessionId=X`) |
| `GET` | `/agentmemory/viewer` | Real-time web viewer (also at `http://localhost:3113`) |
| `GET` | `/agentmemory/claude-bridge/read` | Read Claude Code native MEMORY.md |
| `POST` | `/agentmemory/claude-bridge/sync` | Sync memories to MEMORY.md |
| `POST` | `/agentmemory/graph/query` | Query knowledge graph (BFS traversal) |
| `GET` | `/agentmemory/graph/stats` | Knowledge graph node/edge counts |
| `POST` | `/agentmemory/graph/extract` | Extract entities from observations |
| `POST` | `/agentmemory/consolidate-pipeline` | Run 4-tier consolidation pipeline |
| `POST` | `/agentmemory/team/share` | Share memory with team members |
| `GET` | `/agentmemory/team/feed` | Recent shared items from team |
| `GET` | `/agentmemory/team/profile` | Aggregated team memory profile |
| `GET` | `/agentmemory/audit` | Query audit trail (`?operation=X&limit=N`) |
| `DELETE` | `/agentmemory/governance/memories` | Delete specific memories with audit |
| `POST` | `/agentmemory/governance/bulk-delete` | Bulk delete by type/date/quality |
| `GET` | `/agentmemory/snapshots` | List git snapshots |
| `POST` | `/agentmemory/snapshot/create` | Create git-versioned snapshot |
| `POST` | `/agentmemory/snapshot/restore` | Restore from snapshot commit |
| `POST` | `/agentmemory/lessons` | Save a lesson (returns 201 if created, 200 if strengthened) |
| `GET` | `/agentmemory/lessons` | List lessons (`?project=X&minConfidence=0.5`) |
| `POST` | `/agentmemory/lessons/search` | Search lessons by query |
| `POST` | `/agentmemory/lessons/strengthen` | Reinforce a lesson's confidence |
| `POST` | `/agentmemory/obsidian/export` | Export vault as Obsidian Markdown |
| `GET` | `/agentmemory/mcp/tools` | List MCP tools |
| `POST` | `/agentmemory/mcp/call` | Execute MCP tool |
| `GET` | `/agentmemory/mcp/resources` | List MCP resources |
| `POST` | `/agentmemory/mcp/resources/read` | Read MCP resource by URI |
| `GET` | `/agentmemory/mcp/prompts` | List MCP prompts |
| `POST` | `/agentmemory/mcp/prompts/get` | Get MCP prompt with arguments |

## Plugin Install

### From Marketplace (recommended)

```bash
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory
```

Restart Claude Code. All 12 hooks, 4 skills, and 43 MCP tools are registered automatically.

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

**113 source files. ~20,000 LOC. 627 tests. Zero external DB dependencies.**

### Functions (89 mem:: functions)

| Category | Functions | Purpose |
|----------|-----------|---------|
| **Core Memory** | `observe`, `compress`, `search`, `smart-search` | Capture, compress, and search observations |
| | `context`, `summarize`, `remember`, `forget` | Build context, generate summaries, save/delete memories |
| | `file-context`, `enrich`, `patterns`, `generate-rules` | File history, enrichment, pattern detection, rule generation |
| | `migrate`, `export`, `import` | SQLite migration, JSON round-trip (v0.3.0–v0.7.2) |
| **Search** | `expand-query`, `sliding-window`, `graph-retrieval` | Query reformulations, context enrichment, entity-based retrieval |
| | `retention-score`, `retention-evict` | Ebbinghaus decay with tiered storage (hot/warm/cold) |
| **Memory Evolution** | `evolve`, `auto-forget`, `evict` | Version memories, TTL expiry, importance-based eviction |
| | `consolidate`, `consolidate-pipeline` | Merge duplicates, 4-tier consolidation (working→episodic→semantic→procedural) |
| | `verify`, `cascade-update` | Citation chain provenance, staleness propagation |
| **Knowledge Graph** | `graph-extract`, `graph-query`, `graph-stats` | LLM entity extraction, BFS traversal, statistics |
| | `temporal-graph-extract`, `temporal-query` | Temporal knowledge extraction + point-in-time queries |
| **Relationships** | `relate`, `get-related`, `timeline`, `profile` | Memory relations, chronological view, project profiles |
| **Claude Bridge** | `claude-bridge-read`, `claude-bridge-sync` | Bi-directional sync with MEMORY.md |
| **Actions** | `action-create`, `action-update`, `action-get`, `action-list` | Dependency-aware work items with typed edges |
| | `action-edge-create` | Create typed edges between actions (requires, unlocks, gated_by) |
| | `frontier`, `next` | Priority-ranked unblocked action queue |
| **Leases** | `lease-acquire`, `lease-release`, `lease-renew`, `lease-cleanup` | TTL-based atomic agent claims with auto-cleanup |
| **Routines** | `routine-create`, `routine-freeze`, `routine-list`, `routine-run`, `routine-status` | Frozen workflow templates instantiated into action chains |
| **Signals** | `signal-send`, `signal-read`, `signal-threads`, `signal-cleanup` | Threaded inter-agent messaging with read receipts |
| **Checkpoints** | `checkpoint-create`, `checkpoint-resolve`, `checkpoint-list`, `checkpoint-expire` | External condition gates (CI, approval, deploy) |
| **Mesh** | `mesh-register`, `mesh-sync`, `mesh-receive`, `mesh-list`, `mesh-remove` | P2P sync between agentmemory instances |
| **Sentinels** | `sentinel-create`, `sentinel-trigger`, `sentinel-check`, `sentinel-cancel`, `sentinel-list`, `sentinel-expire` | Event-driven condition watchers |
| **Sketches** | `sketch-create`, `sketch-add`, `sketch-promote`, `sketch-discard`, `sketch-list`, `sketch-gc` | Ephemeral action graphs with auto-expiry |
| **Crystals** | `crystallize`, `auto-crystallize`, `crystal-list`, `crystal-get` | LLM-powered compaction of action chains into digests |
| **Lessons** | `lesson-save`, `lesson-recall`, `lesson-list`, `lesson-strengthen`, `lesson-decay-sweep` | Confidence-scored lessons with dedup, reinforcement, and decay |
| **Facets** | `facet-tag`, `facet-untag`, `facet-query`, `facet-get`, `facet-stats`, `facet-dimensions` | Multi-dimensional tagging with AND/OR queries |
| **Diagnostics** | `diagnose`, `heal` | Self-diagnosis across 8 categories with auto-fix |
| **Flow** | `flow-compress` | LLM summarization of completed action chains |
| **Branch** | `detect-worktree`, `list-worktrees`, `branch-sessions` | Git worktree detection for shared memory |
| **Team** | `team-share`, `team-feed`, `team-profile` | Namespaced shared + private team memory |
| **Governance** | `governance-delete`, `governance-bulk`, `audit-query` | Delete with audit trail, bulk operations |
| **Snapshots** | `snapshot-create`, `snapshot-list`, `snapshot-restore` | Git-versioned memory state |
| **Export** | `obsidian-export` | Obsidian-compatible Markdown with YAML frontmatter + wikilinks |

### Data Model (34 KV scopes)

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
| `mem:confidence` | Confidence scores for memories |
| `mem:claude-bridge` | Claude Code MEMORY.md bridge state |
| `mem:graph:nodes` | Knowledge graph entities |
| `mem:graph:edges` | Knowledge graph relationships |
| `mem:semantic` | Semantic memories (consolidated facts) |
| `mem:procedural` | Procedural memories (extracted workflows) |
| `mem:team:{id}:shared` | Team shared items |
| `mem:team:{id}:users:{uid}` | Per-user team state |
| `mem:team:{id}:profile` | Aggregated team profile |
| `mem:audit` | Audit trail for all operations |
| `mem:actions` | Dependency-aware work items |
| `mem:action-edges` | Typed edges (requires, unlocks, gated_by, etc.) |
| `mem:leases` | TTL-based agent work claims |
| `mem:routines` | Frozen workflow templates |
| `mem:routine-runs` | Instantiated routine execution tracking |
| `mem:signals` | Inter-agent messages with threading |
| `mem:checkpoints` | External condition gates |
| `mem:mesh` | Registered P2P sync peers |
| `mem:sentinels` | Event-driven condition watchers |
| `mem:sketches` | Ephemeral action graphs |
| `mem:crystals` | Compacted action chain digests |
| `mem:facets` | Multi-dimensional tags |
| `mem:lessons` | Confidence-scored lessons with decay |

## Development

```bash
npm run dev               # Hot reload
npm run build             # Production build (~425KB)
npm test                  # Unit tests (627 tests, ~1.5s)
npm run test:integration  # API tests (requires running services)
```

### Prerequisites

- Node.js >= 20
- [iii-engine](https://iii.dev/docs) (`curl -fsSL https://install.iii.dev/iii/main/install.sh | sh`)

## License

[Apache-2.0](LICENSE)
