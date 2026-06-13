# AgentMemory — End-to-End Architecture

> **Version:** 0.9.27 | **Updated:** 2026-06-12

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Map](#2-component-map)
3. [End-to-End Flow](#3-end-to-end-flow)
   - 3.1 [Session Lifecycle](#31-session-lifecycle)
   - 3.2 [Observation Pipeline](#32-observation-pipeline)
   - 3.3 [Memory Retrieval Pipeline](#33-memory-retrieval-pipeline)
   - 3.4 [Memory Consolidation Pipeline](#34-memory-consolidation-pipeline)
4. [Component Deep-Dives](#4-component-deep-dives)
   - 4.1 [Hooks Layer](#41-hooks-layer)
   - 4.2 [REST / MCP Transport Layer](#42-rest--mcp-transport-layer)
   - 4.3 [Business Logic (Functions)](#43-business-logic-functions)
   - 4.4 [Storage Layer (StateKV)](#44-storage-layer-statekv)
   - 4.5 [Search Architecture](#45-search-architecture)
   - 4.6 [LLM Provider Abstraction](#46-llm-provider-abstraction)
   - 4.7 [Knowledge Graph](#47-knowledge-graph)
   - 4.8 [Orchestration Primitives](#48-orchestration-primitives)
5. [Data Model](#5-data-model)
6. [Configuration & Feature Flags](#6-configuration--feature-flags)
7. [Multi-Agent & Team Memory](#7-multi-agent--team-memory)
8. [Security Model](#8-security-model)
9. [Observability](#9-observability)
10. [Deployment Topology](#10-deployment-topology)

---

## 1. System Overview

AgentMemory is a **persistent, queryable memory layer** for AI coding agents. It attaches to agents (Claude Code, Cursor, GitHub Copilot, etc.) via lightweight hooks and gives them long-term memory across sessions.

**What it does:**

- Captures every tool call an agent makes (reads, writes, bash commands) as a *raw observation*.
- Compresses observations into structured summaries via LLM (title, facts, narrative, file references, importance score).
- Indexes all memories in a triple-stream search backend (BM25 keyword + dense vector + knowledge graph).
- Injects relevant context back into the agent at the start of each new session or tool call.
- Runs a nightly consolidation pipeline that distils session observations into long-lived *memories*.

**What it is NOT:**

- Not a vector database — it manages its own BM25 + vector indexes in-process.
- Not a cloud service — all state is local SQLite (via iii-engine), with optional team sync.
- Not a proxy — it hooks into agent lifecycle events, it does not intercept LLM calls.

---

## 2. Component Map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AI CODING AGENT                                │
│            (Claude Code / Cursor / GitHub Copilot / etc.)               │
└────────────┬────────────────────────────────────────────────────────────┘
             │  Lifecycle hooks (stdin/stdout JSON, fire-and-forget HTTP)
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          HOOKS LAYER  (src/hooks/)                      │
│  session-start · pre-tool-use · post-tool-use · post-tool-failure       │
│  stop · session-end · pre-compact · prompt-submit · notification        │
│  post-commit · subagent-start · subagent-stop                           │
└────────────┬────────────────────────────────────────────────────────────┘
             │  HTTP (fire-and-forget fetch, 800–1500 ms timeout)
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     TRANSPORT LAYER  (src/mcp/ + src/triggers/)         │
│                                                                         │
│   REST API (128 endpoints)          MCP Server (53 tools)               │
│   src/triggers/api.ts               src/mcp/server.ts                  │
│   Port: AGENTMEMORY_PORT            src/mcp/tools-registry.ts          │
│                                     src/mcp/transport.ts               │
└────────────┬────────────────────────────────────────────────────────────┘
             │  iii-sdk trigger() calls
             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER  (src/functions/)               │
│                                                                         │
│  Observation:   observe · compress · synthetic-compress                 │
│  Search:        search · smart-search · query-expansion · sliding-window│
│  Memory:        remember · patterns · lessons · crystallize             │
│  Consolidation: consolidate · consolidation-pipeline · reflect          │
│  Graph:         graph · graph-retrieval · graph-extract · relations     │
│  Orchestration: actions · frontier · leases · routines · signals        │
│                 checkpoints · mesh · sketches                           │
│  Management:    export-import · audit · snapshots · governance          │
└────────────┬────────────────────────────────────────────────────────────┘
             │
     ┌───────┴──────────┐
     ▼                  ▼
┌─────────────┐   ┌─────────────────────────────────────────────────────┐
│  LLM LAYER  │   │                  STORAGE LAYER                      │
│(src/providers│   │                  (src/state/)                       │
│             │   │                                                     │
│ anthropic   │   │  StateKV (iii-engine SQLite)  ←─── schema.ts       │
│ openai      │   │  BM25 Index (in-memory)       ←─── search-index.ts │
│ gemini      │   │  Vector Index (in-memory)     ←─── vector-index.ts │
│ openrouter  │   │  HybridSearch                 ←─── hybrid-search.ts│
│ minimax     │   │  Reranker                     ←─── reranker.ts     │
│ agent-sdk   │   │  IndexPersistence (disk)      ←─── index-persist.. │
│ noop        │   └─────────────────────────────────────────────────────┘
└─────────────┘

                    Background Timers (src/index.ts)
                    ├─ Auto-forget sweep       (hourly)
                    ├─ Lesson decay            (daily)
                    ├─ Consolidation pipeline  (every 2h)
                    └─ Recent-search TTL sweep (hourly)

                    Viewer Server (src/viewer/)
                    └─ Web UI on port N+2 (default 3113)
```

---

## 3. End-to-End Flow

### 3.1 Session Lifecycle

```
AGENT STARTS
     │
     ▼
[Hook: session-start.ts]
 POST /agentmemory/session/start
 Payload: { cwd, project, agentId, hookEventId }
     │
     ▼
[Function: mem::session-start]
 1. Create Session record  →  mem:sessions
 2. IF AGENTMEMORY_INJECT_CONTEXT=true:
    a. Run mem::smart-search for project context
    b. Fetch recent session summaries
    c. Build system-prompt injection string
 3. Return context to hook (written to stdout)
 4. Agent receives context via stdin
     │
     ▼
  ... agent runs tools ...
     │
     ▼
[Hook: stop.ts  OR  session-end.ts]
 POST /agentmemory/session/end
 Payload: { sessionId, reason }
     │
     ▼
[Function: mem::session-end]
 1. Mark Session as "completed"  →  mem:sessions
 2. IF AGENTMEMORY_REFLECT=true:
    Run mem::reflect  →  synthesize insights
 3. IF CONSOLIDATION_ENABLED=true:
    Run mem::consolidation-pipeline  →  create Memories
 4. IF GRAPH_EXTRACTION_ENABLED=true:
    Run mem::graph-extract  →  update graph nodes/edges
 5. Persist BM25 + vector indexes to disk

AGENT STOPS
```

---

### 3.2 Observation Pipeline

This is the hot path — runs after every tool call.

```
AGENT EXECUTES A TOOL
     │
     ▼
[Hook: post-tool-use.ts]  (or post-tool-failure.ts)
 POST /agentmemory/observe
 Payload: {
   sessionId, hookType, toolName,
   toolInput, toolOutput,
   durationMs, exitCode
 }
     │
     ▼
[Function: mem::observe]
 1. Deduplication check (DedupMap on toolInput hash + sessionId)
    └─ Discard if duplicate within 30s window
 2. Create RawObservation  →  mem:obs:{sessionId}
 3. Increment session.observationCount
     │
     ▼ (if AGENTMEMORY_AUTO_COMPRESS=true)
[Function: mem::compress]
 1. IF toolOutput.length > COMPRESS_THRESHOLD:
    a. Build prompt from raw observation
    b. Call LLM provider (anthropic / openai / ...)
    c. Parse response into CompressedObservation:
       { title, facts[], narrative, concepts[], files[], importance }
 2. ELSE (small output):
    Run mem::synthetic-compress (regex + heuristics, no LLM)
 3. Replace RawObservation with CompressedObservation
     │
     ├─── IF embedding provider configured:
     │    [mem::embed]
     │    1. Call provider.embed(narrative + facts)
     │    2. Store Float32Array  →  mem:embeddings:{obsId}
     │    3. Update VectorIndex  (in-memory)
     │
     ├─── Update BM25 index (always)
     │    SearchIndex.add(obsId, tokens)
     │
     └─── Broadcast via WebSocket (viewer + MCP stream subscribers)

OBSERVATION STORED & INDEXED
```

**Deduplication strategy:**
- Hash = SHA256(toolName + JSON.stringify(toolInput))
- DedupMap holds `hash → timestamp` with 30s TTL
- Prevents identical tool re-runs (e.g. repeated `cat file.ts`) from flooding storage

**Synthetic compression** (no LLM, ~1ms):
- Reads: extracts file path, line count
- Writes: extracts file path, diff stats
- Bash: extracts command, exit code, first 200 chars of output
- Importance heuristic: error keywords → 0.9, success → 0.5

---

### 3.3 Memory Retrieval Pipeline

Triggered by: MCP tool `memory_recall`, MCP tool `memory_smart_search`, or pre-tool-use hook.

```
AGENT INVOKES MEMORY TOOL
     │
     ▼
[Function: mem::smart-search]
 Input: { query, sessionId?, limit?, tokenBudget? }

 STEP 1 — Query Expansion (optional, 1 LLM call)
   IF query mentions time ("recently", "last week"):
     Rewrite with absolute timestamps
   IF query is vague ("the button"):
     Expand to related terms ("CSS button", "onClick handler")
   IF expansion fails → use original query

 STEP 2 — Triple-Stream Search
   ┌──────────────────────────────────────────────────────┐
   │  Stream A: BM25 Search                               │
   │  ├─ Tokenize + stem query                            │
   │  ├─ Lookup inverted index                            │
   │  └─ TF-IDF ranking → top-100 candidates             │
   │                                                      │
   │  Stream B: Vector Search (if embeddings enabled)     │
   │  ├─ Embed query → Float32Array                       │
   │  ├─ Cosine similarity against all stored vectors     │
   │  └─ Top-100 by similarity score                      │
   │                                                      │
   │  Stream C: Graph Search                              │
   │  ├─ Extract entities from query (regex + NER)        │
   │  ├─ Lookup graph nodes by name                       │
   │  ├─ Traverse edges (1-hop BFS)                       │
   │  └─ Degree-weighted ranking → top-100               │
   └──────────────────────────────────────────────────────┘

 STEP 3 — Reciprocal Rank Fusion (RRF)
   score(doc) = Σ 1/(k + rank_in_stream)   k=60
   Merge all three streams, deduplicate by id
   → Unified ranked list

 STEP 4 — Re-ranking (optional, if RERANK_ENABLED=true)
   ├─ Cross-encoder model scores (query, passage) pairs
   └─ Final score = 0.7 * rerank + 0.3 * rrf

 STEP 5 — Sliding-Window Context
   IF results span multiple sessions:
     Add ±N surrounding observations for context continuity

 STEP 6 — Token Budget Trimming
   While total_tokens > TOKEN_BUDGET:
     Drop lowest-score result
   Return remaining results

     │
     ▼
RESULTS RETURNED AS STRUCTURED CONTEXT
(title, facts, narrative, files, importance, session, timestamp)
```

---

### 3.4 Memory Consolidation Pipeline

Runs on session end (if enabled) and on the 2-hour background timer.

```
[Function: mem::consolidation-pipeline]
 Input: completed session observations

 PHASE 1 — Grouping
   ├─ Load all CompressedObservations for session
   ├─ Group by: file path, concept cluster, time window
   └─ Filter: importance >= CONSOLIDATION_THRESHOLD (default 0.4)

 PHASE 2 — Per-Group Summarization (LLM)
   FOR each group:
     Prompt: "Synthesize these N observations into a long-term memory"
     Extract: Memory { title, content, type, strength }
     Types: pattern | preference | architecture | bug | workflow | fact

 PHASE 3 — Deduplication Against Existing Memories
   ├─ Search existing memories (hybrid search)
   ├─ IF similarity > 0.85: merge (update existing)
   └─ IF similarity < 0.85: insert new Memory → mem:memories

 PHASE 4 — Crystallization (optional, AGENTMEMORY_CRYSTALLIZE=true)
   [Function: mem::crystallize]
   ├─ Scan all memories for reinforcement patterns
   ├─ Memories appearing 3+ times → increase strength
   └─ Weak memories (strength < 0.2) → schedule for deletion

 PHASE 5 — Graph Update (optional, GRAPH_EXTRACTION_ENABLED=true)
   [Function: mem::graph-extract]
   ├─ Extract entities (files, functions, concepts, people)
   ├─ Extract relations (uses, modifies, imports, fixes)
   ├─ Upsert GraphNode → mem:graph:nodes
   └─ Upsert GraphEdge → mem:graph:edges (with frequency bump)
```

---

## 4. Component Deep-Dives

### 4.1 Hooks Layer

**Location:** `src/hooks/`
**Runtime:** Standalone Node.js scripts, no iii-sdk dependency.
**Contract:** Read JSON from `stdin`, POST to REST API, optionally write context to `stdout`, exit within timeout.

| Hook | Trigger | Direction | Key Action |
|------|---------|-----------|------------|
| `session-start.ts` | Agent starts | Sync (reads stdout) | Create session, inject stored context |
| `pre-tool-use.ts` | Before each tool | Sync (reads stdout) | Inject relevant memories into prompt |
| `post-tool-use.ts` | After each tool | Fire-and-forget | Capture observation (observe + compress) |
| `post-tool-failure.ts` | Tool error | Fire-and-forget | Capture failure observation |
| `pre-compact.ts` | Before Claude context compress | Sync (reads stdout) | Inject summary to preserve across compression |
| `prompt-submit.ts` | User submits a prompt | Fire-and-forget | Telemetry + optional recall |
| `stop.ts` | Agent session ends | Fire-and-forget | Trigger session-end pipeline |
| `session-end.ts` | Full session end | Fire-and-forget | Consolidation + graph extraction |
| `notification.ts` | Agent sends notification | Fire-and-forget | Log notification event |
| `post-commit.ts` | Git commit made | Fire-and-forget | Capture commit context as observation |
| `subagent-start.ts` | Subagent spawned | Fire-and-forget | Register child agent in mesh |
| `subagent-stop.ts` | Subagent completes | Fire-and-forget | Merge subagent memories into parent |

**Timeout budget:** Hooks that return context to stdout (session-start, pre-tool-use, pre-compact) have a hard 1500ms timeout. Fire-and-forget hooks use 800ms. Both use `AbortSignal` on the fetch call.

---

### 4.2 REST / MCP Transport Layer

**REST API** — `src/triggers/api.ts`
- 128 endpoints registered via iii-engine's trigger system
- Auth: Bearer token (`AGENTMEMORY_SECRET`), timing-safe `crypto.timingSafeEqual` comparison
- No framework (Express/Fastify) — direct iii-engine HTTP handlers

Key endpoint groups:

| Group | Prefix | Endpoints |
|-------|--------|-----------|
| Session | `/session/` | start, end, list, get |
| Observations | `/observe`, `/observations/` | create, list, get, delete |
| Search | `/search`, `/smart-search` | keyword, hybrid, graph query |
| Memories | `/memories/` | list, get, save, delete |
| Patterns | `/patterns` | extract, list |
| Management | `/health`, `/export`, `/import`, `/cleanup` | admin ops |

**MCP Server** — `src/mcp/`
- 53 tools registered in `tools-registry.ts` (8 core + 45 advanced)
- Transport: WebSocket (`src/mcp/transport.ts`) + optional REST proxy (`src/mcp/rest-proxy.ts`)
- Standalone MCP shim mode: `agentmemory mcp` (no iii-engine needed)

Core MCP tools:

| Tool | Purpose |
|------|---------|
| `memory_recall` | Primary retrieval — hybrid search with context |
| `memory_save` | Explicitly save a memory |
| `memory_patterns` | Surface recurring patterns across sessions |
| `memory_sessions` | Browse session history |
| `memory_file_history` | All operations on a specific file |
| `memory_smart_search` | Progressive-disclosure search with expansion |
| `memory_compress_file` | Summarize a file's history |
| `memory_vision_search` | Search by screenshot/image description |

---

### 4.3 Business Logic (Functions)

**Location:** `src/functions/` — 67 TypeScript files, each a pure function registered on the iii-engine bus.

Function naming convention: `mem::{name}` (internal), `api::{name}` (REST handlers), `mcp::{name}` (MCP handlers), `middleware::{name}` (cross-cutting).

**Observation functions:**

| Function | Input | Output | LLM? |
|----------|-------|--------|------|
| `mem::observe` | Raw hook payload | `RawObservation` stored | No |
| `mem::compress` | `RawObservation` | `CompressedObservation` stored | Yes (optional) |
| `mem::synthetic-compress` | `RawObservation` | `CompressedObservation` stored | No |

**Search functions:**

| Function | Input | Output | LLM? |
|----------|-------|--------|------|
| `mem::search` | Query string + filters | `SearchResult[]` | No |
| `mem::smart-search` | Query + context | `SearchResult[]` + narrative | Yes (expansion) |
| `mem::query-expansion` | Raw query | Expanded queries | Yes |
| `mem::sliding-window` | Result list | Result list + context neighbors | No |

**Memory management functions:**

| Function | Input | Output | LLM? |
|----------|-------|--------|------|
| `mem::remember` | Session observations | `Memory[]` saved | Yes |
| `mem::consolidate` | Observation group | `Memory` | Yes |
| `mem::consolidation-pipeline` | Session ID | Memories created | Yes |
| `mem::crystallize` | All memories | Strength updates | Yes |
| `mem::reflect` | Session observations | Insight summary | Yes |
| `mem::patterns` | Query | Pattern list | Yes |

**Graph functions:**

| Function | Input | Output | LLM? |
|----------|-------|--------|------|
| `mem::graph-extract` | Observations | `GraphNode[]` + `GraphEdge[]` | Yes |
| `mem::graph-retrieval` | Entity names | Subgraph | No |
| `mem::relations` | Node ID | Related nodes + edges | No |

---

### 4.4 Storage Layer (StateKV)

**Location:** `src/state/`
**Engine:** iii-engine `StateModule` — file-based SQLite at `~/.agentmemory/state_store.db`

All reads/writes go through `src/state/kv.ts` (`StateKV` wrapper):
```typescript
kv.get<T>(scope: string, key: string): Promise<T | null>
kv.set<T>(scope: string, key: string, value: T): Promise<void>
kv.list<T>(scope: string, prefix?: string): Promise<T[]>
kv.delete(scope: string, key: string): Promise<void>
```

**Storage scopes** (from `src/state/schema.ts`):

| Scope Key | Contents | Access Pattern |
|-----------|----------|----------------|
| `mem:sessions` | `Session[]` | list by status, get by id |
| `mem:obs:{sessionId}` | `RawObservation | CompressedObservation[]` | list all for session |
| `mem:memories` | `Memory[]` | list all, get by id |
| `mem:embeddings:{obsId}` | `Float32Array` serialized | get by obs id |
| `mem:index:bm25` | BM25 inverted index snapshot | single key, loaded on boot |
| `mem:graph:nodes` | `GraphNode[]` | list all |
| `mem:graph:edges` | `GraphEdge[]` | list all |
| `mem:graph:name-index` | `{ name → nodeId }` | get by entity name |
| `mem:audit` | `AuditEntry[]` | append-only log |
| `mem:leases` | `Lease[]` | distributed lock primitives |
| `mem:routines` | `Routine[]` | recurring task definitions |
| `mem:signals` | `Signal[]` | inter-agent signals |
| `mem:checkpoints` | `Checkpoint[]` | save/restore points |
| `mem:slots` | `Slot[]` | pinned editable memory slots |
| `mem:global-slots` | `Slot[]` | cross-session global slots |
| `mem:team:{teamId}:shared` | `SharedMemory[]` | team memory pool |

**Concurrency safety:** All writes use keyed mutexes (`Map<string, Promise>`). Same-key writes queue up; different-key writes run in parallel.

**Index Persistence** (`src/state/index-persistence.ts`):
- BM25 and vector indexes live in-memory during runtime
- Debounced flush to disk every 5 seconds (configurable)
- On boot: load from disk, validate embedding dimensions, backfill any missing entries
- On SIGINT/SIGTERM: synchronous flush before exit

---

### 4.5 Search Architecture

**Location:** `src/state/hybrid-search.ts`, `search-index.ts`, `vector-index.ts`, `reranker.ts`

```
                     ┌──────────────────────┐
                     │   HybridSearch.query │
                     └──────────┬───────────┘
                                │
             ┌──────────────────┼──────────────────┐
             ▼                  ▼                  ▼
     ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
     │  BM25 Search  │  │ Vector Search │  │ Graph Search  │
     │               │  │               │  │               │
     │ SearchIndex   │  │ VectorIndex   │  │ GraphIndex    │
     │ (inverted)    │  │ (Float32Array │  │ (adjacency    │
     │               │  │  cosine sim)  │  │  list BFS)    │
     └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
             │                  │                  │
             └──────────────────┼──────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  RRF Score Fusion    │
                    │  score = Σ 1/(60+r)  │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Reranker (optional) │
                    │  cross-encoder model │
                    └───────────┬──────────┘
                                │
                    ┌───────────▼──────────┐
                    │  Token Budget Trim   │
                    │  top-K by score      │
                    └──────────────────────┘
```

**BM25 Details:**
- Tokenizer: whitespace split + lowercase + stemmer
- IDF weighting: `log((N - df + 0.5) / (df + 0.5) + 1)`
- TF saturation: `k1=1.2, b=0.75`
- Index size: grows linearly with observations (fully in-memory)

**Vector Details:**
- Dimensions: 768 (jina/voyage), 1536 (openai), 384 (local)
- Similarity: cosine (dot product of normalized vectors)
- Storage: `Float32Array` per observation, loaded fully into RAM
- Embedding providers: Jina AI, Voyage AI, OpenAI, local ONNX

**Graph Details:**
- Nodes: files, functions, concepts, people, errors
- Edges: `uses | modifies | imports | fixes | relates_to | caused_by`
- BFS traversal: max 2 hops, degree-weighted scoring
- Node score = `log(1 + occurrences) * edge_weight_sum`

**Reciprocal Rank Fusion:**
```
Combined score = Σ_stream  1 / (60 + rank_in_stream)
```
RRF is robust to score scale differences — BM25, vector, and graph scores are not on the same scale, but ranks are.

---

### 4.6 LLM Provider Abstraction

**Location:** `src/providers/`

All LLM calls go through the `MemoryProvider` interface:
```typescript
interface MemoryProvider {
  complete(prompt: string, options?: CompletionOptions): Promise<string>
  stream(prompt: string, options?: CompletionOptions): AsyncGenerator<string>
  embed(text: string): Promise<Float32Array>
  embedBatch(texts: string[]): Promise<Float32Array[]>
  describeImage(base64: string, prompt: string): Promise<string>
}
```

**Provider chain:**

```
ResilientProvider (circuit-breaker wrapper)
    └─ FallbackChainProvider (try A → B → C → noop)
           ├─ AnthropicProvider   (claude-haiku-4-5 / sonnet-4 by default)
           ├─ OpenAIProvider      (gpt-4o-mini / gpt-4o)
           ├─ GeminiProvider      (gemini-flash-2.0)
           ├─ OpenRouterProvider  (any model via openrouter.ai)
           ├─ MinimaxProvider     (minimax-text-01)
           ├─ AgentSDKProvider    (uses ambient agent's LLM)
           └─ NoopProvider        (returns empty, no LLM needed)
```

**Circuit Breaker:**
- Opens after 3 consecutive failures within 60s
- Half-open probe after 30s backoff
- Fail-open: falls through to next provider in chain, never blocks the observation pipeline

**Model selection by task:**
| Task | Preferred Model | Rationale |
|------|----------------|-----------|
| Compression | `claude-haiku-4-5` | Fast, cheap, good at summarization |
| Consolidation | `claude-sonnet-4-6` | Better reasoning for synthesis |
| Graph extraction | `claude-haiku-4-5` | Entity/relation extraction is structured |
| Smart search expansion | `claude-haiku-4-5` | Query rewrite is a simple task |
| Reflection | `claude-sonnet-4-6` | Nuanced insight generation |

---

### 4.7 Knowledge Graph

**Location:** `src/functions/graph.ts`, `graph-retrieval.ts`, `graph-extract.ts`

The knowledge graph is an **entity-relationship graph** extracted from session observations. It answers queries like "what files does `AuthService` touch?" or "what functions does `useAuth` call?"

**Schema:**
```typescript
GraphNode {
  id: string            // SHA256 of (type + name)
  type: "file" | "function" | "concept" | "person" | "error" | "package"
  name: string          // e.g. "src/auth/service.ts", "getUserById", "CORS"
  occurrences: number   // how many times seen across sessions
  lastSeen: string      // ISO timestamp
  metadata: Record<string, unknown>
}

GraphEdge {
  id: string            // SHA256 of (source + target + type)
  source: string        // GraphNode.id
  target: string        // GraphNode.id
  type: "uses" | "modifies" | "imports" | "fixes" | "relates_to" | "caused_by"
  weight: number        // 0–1, decays over time
  frequency: number     // raw occurrence count
  lastSeen: string
}
```

**Extraction flow (per session end):**
1. Concatenate all compressed narratives + facts for the session
2. LLM prompt: extract entities and relations as JSON
3. Upsert nodes (increment `occurrences`, update `lastSeen`)
4. Upsert edges (increment `frequency`, recalculate `weight`)
5. Rebuild `name-index` for O(1) entity lookup

**Graph search integration:**
- Query entities extracted via regex + optional NER
- Node lookup: `name-index[entity]` → `nodeId`
- BFS from matching nodes, accumulate neighbor node IDs
- Fetch CompressedObservations that mention those node IDs
- Score by degree: `log(1 + node.occurrences) * Σ(edge.weight)`

---

### 4.8 Orchestration Primitives

These are the system-level building blocks for multi-session and multi-agent workflows.

**Leases** (`src/functions/leases.ts`) — distributed locks
```
Lease { id, resource, holder, expiresAt, renewedAt }
Usage: prevent concurrent consolidation runs on same session
```

**Routines** (`src/functions/routines.ts`) — recurring tasks
```
Routine { id, name, intervalMs, lastRunAt, enabled, fn }
Registered routines: auto-forget, lesson-decay, consolidation, search-TTL-sweep
```

**Signals** (`src/functions/signals.ts`) — inter-agent messages
```
Signal { id, from, to, type, payload, sentAt, readAt }
Usage: subagent → parent communication, team coordination
```

**Checkpoints** (`src/functions/checkpoints.ts`) — save/restore state
```
Checkpoint { id, sessionId, name, state, createdAt }
Usage: long-running tasks that can be paused and resumed
```

**Mesh** (`src/functions/mesh.ts`) — multi-agent memory sharing
```
Mesh { agents: AgentRef[], syncStrategy: "broadcast" | "on-demand" }
Usage: multiple Claude Code instances sharing one memory pool
```

**Sketches** (`src/functions/sketches.ts`) — draft memories
```
Sketch { id, content, confidence, promotedAt }
Usage: tentative memory fragments that crystallize once reinforced
```

**Frontier** (`src/functions/frontier.ts`) — work queue
```
FrontierItem { id, type, priority, payload, claimedAt }
Usage: background processing queue for consolidation tasks
```

---

## 5. Data Model

### Session
```typescript
interface Session {
  id: string                              // UUID v4
  project: string                         // cwd-derived project identifier
  cwd: string                             // working directory
  agentId?: string                        // agent identifier (for multi-agent)
  startedAt: string                       // ISO timestamp
  endedAt?: string                        // ISO timestamp (when complete)
  status: "active" | "completed" | "abandoned"
  observationCount: number                // running total
  summary?: string                        // LLM-generated session summary
}
```

### RawObservation
```typescript
interface RawObservation {
  id: string                              // UUID v4
  sessionId: string
  timestamp: string                       // ISO
  hookType: "post-tool-use" | "post-tool-failure" | "post-commit" | ...
  toolName: string                        // e.g. "Read", "Bash", "Edit"
  toolInput: Record<string, unknown>      // raw tool arguments
  toolOutput: string                      // raw tool result
  durationMs?: number
  exitCode?: number
  raw: string                             // full JSON payload from hook
  compressed: false
}
```

### CompressedObservation
```typescript
interface CompressedObservation {
  id: string                              // same as RawObservation.id
  sessionId: string
  timestamp: string
  hookType: string
  toolName: string
  type: "code-read" | "code-write" | "bash" | "error" | "search" | "other"
  title: string                           // one-line summary
  facts: string[]                         // bullet-point facts
  narrative: string                       // prose summary (searchable)
  concepts: string[]                      // extracted topics/keywords
  files: string[]                         // file paths mentioned
  importance: number                      // 0.0–1.0
  compressedBy: "llm" | "synthetic"
  compressed: true
}
```

### Memory
```typescript
interface Memory {
  id: string                              // UUID v4
  type: "pattern" | "preference" | "architecture" | "bug" | "workflow" | "fact"
  title: string
  content: string                         // full memory prose
  sessionIds: string[]                    // source sessions
  strength: number                        // 0.0–1.0, decays over time
  isLatest: boolean                       // false if superseded
  forgetAfter?: string                    // ISO timestamp for TTL
  createdAt: string
  updatedAt: string
  tags: string[]
}
```

### GraphNode / GraphEdge
```typescript
// See Section 4.7 above
```

---

## 6. Configuration & Feature Flags

### Required environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| (one of) `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | LLM provider | — |

### Optional environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENTMEMORY_URL` | Server URL (hooks use this) | `http://localhost:3111` |
| `AGENTMEMORY_SECRET` | Bearer auth token | — (auth disabled) |
| `AGENTMEMORY_PORT` | HTTP server port | `3111` |
| `DATA_DIR` | Storage root | `~/.agentmemory` |
| `EMBEDDING_PROVIDER` | `jina \| voyage \| openai \| local` | `none` |
| `TOKEN_BUDGET` | Max tokens in recall response | `4096` |

### Feature flags

| Flag | Enables | Cost |
|------|---------|------|
| `AGENTMEMORY_AUTO_COMPRESS=true` | LLM compression of observations | ~1 LLM call / tool call |
| `AGENTMEMORY_INJECT_CONTEXT=true` | Inject memories at session start | ~1 search / session |
| `CONSOLIDATION_ENABLED=true` | Run consolidation pipeline on session end | ~N LLM calls / session |
| `GRAPH_EXTRACTION_ENABLED=true` | Extract knowledge graph from sessions | ~1 LLM call / session |
| `AGENTMEMORY_REFLECT=true` | Generate insight reflection on session end | ~1 LLM call / session |
| `AGENTMEMORY_CRYSTALLIZE=true` | Reinforce and prune memories over time | ~1 LLM call / day |
| `AGENTMEMORY_SLOTS=true` | Enable pinned editable memory slots | No LLM cost |
| `RERANK_ENABLED=true` | Cross-encoder reranking on search | ~1 model call / search |

**Minimal setup (no LLM compression, keyword search only):**
```env
ANTHROPIC_API_KEY=sk-ant-...
AGENTMEMORY_AUTO_COMPRESS=false
CONSOLIDATION_ENABLED=false
GRAPH_EXTRACTION_ENABLED=false
```

**Full setup (all features):**
```env
ANTHROPIC_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=jina
JINA_API_KEY=jina_...
AGENTMEMORY_AUTO_COMPRESS=true
CONSOLIDATION_ENABLED=true
GRAPH_EXTRACTION_ENABLED=true
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_REFLECT=true
AGENTMEMORY_CRYSTALLIZE=true
AGENTMEMORY_SLOTS=true
RERANK_ENABLED=true
```

---

## 7. Multi-Agent & Team Memory

### Subagent isolation

When Claude Code spawns a subagent (via `Agent` tool), agentmemory handles it transparently:

```
Parent Agent                    Subagent
     │                              │
     ├─ [subagent-start hook]       │
     │    Register subagent in mesh │
     │    Share relevant context → ─┤
     │                              │
     │         ... runs ...         │
     │                              │
     ├─ [subagent-stop hook]        │
     │    Merge subagent memories ←─┤
     └─    into parent session      │
```

Each subagent gets its own `Session` with `agentId` set, linked to the parent via `parentSessionId`.

### Team memory

When `TEAM_ID` and `TEAM_MODE` are set, memories can be shared across agents on the same team:

```
Agent A (writes)                  Agent B (reads)
     │                                 │
     ▼                                 ▼
mem:team:{teamId}:shared    ←→    mem:team:{teamId}:shared
```

Sync modes:
- `broadcast`: writes are immediately visible to all team members
- `on-demand`: explicit `memory_team_share` MCP call required

---

## 8. Security Model

| Concern | Mechanism |
|---------|-----------|
| Authentication | Bearer token in `Authorization: Bearer {AGENTMEMORY_SECRET}` header |
| Token comparison | `crypto.timingSafeEqual` (prevents timing attacks) |
| Hook input validation | Zod schema validation on all hook payloads |
| Content Security Policy | Viewer server sets strict CSP headers |
| Data isolation | All storage is local; no external calls except configured LLM providers |
| Secret scrubbing | Tool outputs are scanned for common secret patterns before storage |
| Abort signals | All outbound fetch() calls have AbortSignal (800–1500ms) |

---

## 9. Observability

### Health endpoint

`GET /health` returns:
```json
{
  "status": "ok",
  "version": "0.9.27",
  "sessions": { "active": 2, "completed": 1247 },
  "observations": { "total": 48210, "indexed": 48210 },
  "memories": { "total": 312 },
  "graph": { "nodes": 892, "edges": 2341 },
  "provider": "anthropic",
  "embedding": "jina",
  "uptime": 86400
}
```

### Audit log

Every state-changing operation appends to `mem:audit`:
```typescript
AuditEntry { ts, op, scope, key, actor, sessionId }
```
Query via `memory_audit` MCP tool or `GET /audit`.

### OpenTelemetry metrics (`src/telemetry/`)

| Metric | Type | Labels |
|--------|------|--------|
| `agentmemory.observations.total` | Counter | hookType, sessionId |
| `agentmemory.compress.duration_ms` | Histogram | compressedBy, toolName |
| `agentmemory.search.duration_ms` | Histogram | stream (bm25, vector, graph) |
| `agentmemory.llm.calls.total` | Counter | provider, task |
| `agentmemory.llm.errors.total` | Counter | provider, errorType |

### Web viewer (`src/viewer/`)

Visual memory browser running on port `AGENTMEMORY_PORT + 2` (default: 3113):
- Session list with observation counts and timelines
- Memory browser with search
- Graph visualization
- Slot editor
- Live observation stream (WebSocket)

---

## 10. Deployment Topology

### Local (default)

```
Agent (Claude Code)
    ↓ hooks (HTTP to localhost:3111)
agentmemory worker (Node.js process)
    ↓ reads/writes
~/.agentmemory/state_store.db   (SQLite)
~/.agentmemory/bm25.json        (BM25 index snapshot)
~/.agentmemory/vectors.json     (Vector index snapshot)
```

Start: `agentmemory start` (or `npx agentmemory start`)

### Docker

```yaml
# docker-compose.yml
services:
  agentmemory:
    image: agentmemory:latest
    ports:
      - "3111:3111"   # REST API + MCP
      - "3113:3113"   # Web viewer
    volumes:
      - ~/.agentmemory:/data
    env_file: .env
```

### Multi-machine (team mode)

```
Developer A (machine 1)         Developer B (machine 2)
  agentmemory worker              agentmemory worker
       │                               │
       └─────── TEAM_ID sync ──────────┘
                (via shared AGENTMEMORY_URL
                 pointing to a central instance)
```

One team member runs a central agentmemory instance. All others point their `AGENTMEMORY_URL` at it. The `mem:team:{teamId}:shared` scope is the shared pool.

### MCP standalone mode

When embedding into an MCP-capable host that manages the server lifecycle:

```
Claude.app / Cursor
    │ MCP protocol (stdio or SSE)
agentmemory MCP shim (agentmemory mcp)
    │ HTTP
agentmemory worker (separate process)
```

```json
// .claude/mcp_servers.json
{
  "agentmemory": {
    "command": "agentmemory",
    "args": ["mcp"],
    "env": { "AGENTMEMORY_URL": "http://localhost:3111" }
  }
}
```

---

*Document generated from codebase analysis of agentmemory v0.9.27.*
*Source: `src/index.ts`, `src/types.ts`, `src/state/schema.ts`, `src/hooks/`, `src/functions/`, `src/mcp/`, `src/providers/`*
