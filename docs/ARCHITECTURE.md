# AgentMemory — Architecture & Component Guide

> A developer's map of the codebase: how it's built, what each component does, and **when to use which piece**. Pairs with `AGENTS.md` (contributor rules) and `DESIGN.md` (website styling, unrelated to the engine).

AgentMemory (`@agentmemory/agentmemory`, v0.9.27) is a **persistent memory server for AI coding agents**. It runs locally, captures what an agent does, compresses and consolidates those events into durable memories, indexes them for hybrid retrieval, and serves them back over **REST + MCP** so any agent (Claude Code, Copilot, Cursor, Gemini, …) can recall prior context.

---

## 1. The Mental Model

Everything is built on **iii-engine's three primitives**. There is no bespoke plugin framework — new capability is always *a new function + a trigger*.

| Primitive | What it is | In this repo |
|---|---|---|
| **Worker** | The process that registers everything and connects to the engine | `src/index.ts` boots it via `registerWorker` (iii-sdk) |
| **Function** | A named, callable unit of logic (`mem::*`) | `src/functions/*.ts`, invoked via `sdk.trigger({ function_id, payload })` |
| **Trigger** | An entry point that routes external calls to functions (`api::*`, hooks, cron) | `src/triggers/*.ts` |
| **State** | Durable key-value store, file-backed SQLite | `src/state/kv.ts` over `./data/state_store.db` |

**Golden rule (from `AGENTS.md`):** never bypass iii-engine with standalone SQLite or in-process shortcuts. Read/write state through `StateKV`, do work in `mem::*` functions, expose it through triggers.

```
External caller (agent / hook / HTTP / MCP)
        │
        ▼
   Trigger  (api::*  or  MCP server  or  hook script)
        │  sdk.trigger({ function_id, payload })
        ▼
   Function (mem::*)  ──reads/writes──►  StateKV (SQLite KV scopes)
        │                                     ▲
        ├── Providers (LLM + embeddings) ─────┘
        └── returns JSON result
```

---

## 2. The Data Lifecycle — the heart of the system

This is the single most important flow to internalize. A raw agent action travels through four stages, each producing a richer artifact:

```
Session → RawObservation → CompressedObservation → Memory
         (capture)         (compress)              (consolidate)         → (forget)
```

| Stage | Function(s) | Produces | When it runs |
|---|---|---|---|
| **1. Capture** | `mem::observe` ([observe.ts](../src/functions/observe.ts)) | `RawObservation` (tool call + I/O, **secrets-scrubbed** via `privacy.ts`) | On every tool-use hook fire |
| **2. Compress** | `mem::compress` ([compress.ts](../src/functions/compress.ts)), synthetic fallback ([compress-synthetic.ts](../src/functions/compress-synthetic.ts)) | `CompressedObservation` (title, facts[], narrative, importance 0–1, concepts, files) | Auto after capture (LLM or synthetic) |
| **3. Consolidate** | `mem::consolidate` / `mem::consolidate-pipeline` ([consolidation-pipeline.ts](../src/functions/consolidation-pipeline.ts)) | `Memory` (durable, typed, scored, linked) | Session-end |
| **4. Forget** | `mem::evict`, `mem::auto-forget`, `mem::retention` | TTL expiry + decay eviction | Background / on `forgetAfter` |

**The four core data types** (in [src/types.ts](../src/types.ts)):
- `RawObservation` — raw, scrubbed tool I/O tied to a session.
- `CompressedObservation` — the LLM/synthetic summary; carries `importance`, `concepts`, `facts[]`.
- `Memory` — the long-term unit: `type` (pattern | preference | architecture | bug | workflow | fact), `strength` (1–10), `concepts[]`, `files[]`, `supersedes[]`, `isLatest`, `forgetAfter`, `project`.
- `Session` — groups observations: project, cwd, status, model, agentId, optional commit links.

**When you care:** if you're changing *what gets remembered*, you're touching stage 1–3. If you're changing *what survives over time*, you're in stage 4 (decay/retention).

---

## 3. Retrieval — how recall works

Recall is **hybrid search** = three streams fused, in [src/state/hybrid-search.ts](../src/state/hybrid-search.ts):

1. **BM25** keyword search (`search-index.ts`, no API key needed)
2. **Vector** similarity (`vector-index.ts` + an embedding provider; on-device by default)
3. **Graph** expansion over linked concepts (`graph-retrieval.ts`)

The three result lists are merged with **Reciprocal Rank Fusion** (`RRF_K = 60`). Default weights: `bm25 = 0.4`, `vector = 0.6`, `graph = 0.3` (override with `BM25_WEIGHT` etc.). Optional **temporal decay** down-ranks stale results (`DEFAULT_TEMPORAL_DECAY`), and an optional **reranker** (`reranker.ts`, `RERANK_ENABLED=true`) reorders the top set.

**The key insight:** the default install needs **no API key** — BM25 needs none and embeddings run on-device (`providers/embedding/local.ts`). An LLM provider only adds richer compression/summaries and auto-injection, both opt-in.

| You want to… | Use |
|---|---|
| Plain keyword/vector recall | `mem::search` ([search.ts](../src/functions/search.ts)) |
| Best-quality recall (query expansion + fusion + rerank) | `mem::smart-search` ([smart-search.ts](../src/functions/smart-search.ts)) |
| Recall over the concept graph | `mem::graph-query`, `mem::get-related` |
| Time-ordered recall | `mem::timeline` |

---

## 4. Component Map — directory by directory

### `src/functions/` (65 files) — the verbs of the system
Each file registers one or more `mem::*` functions. Grouped by purpose:

- **Lifecycle:** `observe`, `compress`, `compress-synthetic`, `consolidate`, `consolidation-pipeline`, `remember`, `summarize`.
- **Retrieval:** `search`, `smart-search`, `query-expansion`, `graph-retrieval`, `graph`, `relations`, `timeline`, `context` (context injection), `facets`, `frontier`.
- **Forgetting / hygiene:** `evict`, `auto-forget`, `retention`, `temporal-decay`, `dedup`, `disk-size-manager`, `cascade`, `recent-searches-sweep`.
- **Higher-order memory:** `crystallize` (distill stable knowledge), `lessons`, `reflect`, `skill-extract`, `patterns`, `insights` (via `signals`), `sketches`.
- **Knowledge graph:** `graph`, `temporal-graph`, `graph-retrieval`, `mesh` (peer sync).
- **Org / collaboration:** `team`, `governance` (delete/redact policy), `leases`, `routines`, `checkpoints`, `branch-aware`.
- **Safety / privacy:** `privacy` (15-pattern secrets scrubbing), `audit`, `sentinels`, `verify`.
- **I/O & portability:** `export-import`, `obsidian-export`, `snapshot`, `profile`, `enrich`.
- **Media:** `image-refs`, `vision-search`, `image-quota-cleanup`, `compress-file`.

> **When to add a function vs. extend one:** if the new behavior is a distinct verb callers will invoke, add a `mem::new-thing` function + REST endpoint + (optionally) MCP tool. If it's a tweak to existing logic, extend in place. Either way, follow the multi-file consistency checklist in `AGENTS.md`.

### `src/state/` (12 files) — durability + indexing
- `kv.ts` — `StateKV`, the only sanctioned door to persistence. All scopes are enumerated in `schema.ts` (`mem:sessions`, `mem:memories`, `mem:graph:nodes`, `mem:slots`, `mem:audit`, …).
- `hybrid-search.ts` — the fusion engine (§3).
- `search-index.ts` / `stemmer.ts` / `synonyms.ts` / `cjk-segmenter.ts` — BM25 + tokenization (incl. CJK).
- `vector-index.ts` / `reranker.ts` — embedding ANN + reranking.
- `index-persistence.ts` — keeps indexes on disk and rebuilds on boot.
- `keyed-mutex.ts` — per-key locking for safe concurrent writes.

> **When you touch state:** adding a new KV scope means updating both `schema.ts` and a matching interface in `types.ts` (consistency rule).

### `src/providers/` (20 files) — pluggable LLM + embeddings
- LLM: `anthropic`, `openai`, `openrouter`, `minimax`, `agent-sdk` (Claude Agent SDK), `noop`.
- Embeddings (`providers/embedding/`): `local` (on-device, default), `openai`, `gemini`, `cohere`, `voyage`, `openrouter`, `clip` (images).
- Resilience: `resilient.ts`, `circuit-breaker.ts`, `fallback-chain.ts` — wrap providers so a failing primary falls back without crashing recall.

> **When to use which:** default = on-device embeddings + `noop`/no LLM (zero-config, private). Add an LLM provider only when you want richer compression or auto-injected summaries. Configure a fallback chain for production reliability.

### `src/hooks/` (15 files) — automatic capture
Standalone Node scripts (no iii-sdk import) that read JSON from stdin and HTTP-call the REST API. Two patterns (see `AGENTS.md`):
- **Context-injecting** (`session-start`, `pre-tool-use`, `pre-compact`) — *await* the response and write recalled context to stdout for the agent to inject.
- **Telemetry-only** (`post-tool-use`, `post-tool-failure`, `prompt-submit`, `stop`, `session-end`, `notification`, `subagent-*`, `task-completed`, `post-commit`) — fire-and-forget, force-exit after flush.

> **When to use:** hooks are how memory gets captured/recalled *without manual calls*. Wire them via the plugin/connect adapters. Touch them only to change automatic behavior.

### `src/mcp/` (6 files) — the MCP surface
- `tools-registry.ts` — all 53 MCP tool definitions (8 visible by default; `AGENTMEMORY_TOOLS=all` exposes all).
- `server.ts` — the `mcp::tools::call` dispatch switch.
- `transport.ts` / `standalone.ts` / `rest-proxy.ts` / `in-memory-kv.ts` — transports and a REST-backed proxy mode.

### `src/triggers/` (2 files) — the HTTP surface
- `api.ts` — registers **128 REST endpoints** (`/agentmemory/*`). Each auth-checks, whitelists body fields, then `sdk.trigger()`s a `mem::*` function.
- `events.ts` — event/stream triggers.

### `src/cli/` (28 files) — operator surface
`connect/` (adapters that install AgentMemory into ~16 host agents), `onboarding.ts`, `doctor-diagnostics.ts`, `preferences.ts`, `splash.ts`, `remove-plan.ts`. Entry: `src/cli.ts` → `agentmemory` bin.

### Supporting dirs
`src/config.ts` (all env flags + ports), `src/auth.ts`, `src/telemetry/` (OpenTelemetry), `src/health/`, `src/prompts/` (LLM prompt templates), `src/replay/`, `src/viewer/` (real-time web UI), `src/eval/` + top-level `eval/` (LongMemEval, coding-life benchmarks).

---

## 5. Ports & Runtime

REST is the anchor; the rest are offsets. `--instance N` shifts the whole block by `N*100`.

| Service | Port | Notes |
|---|---|---|
| REST API | **3111** | Primary surface, all hooks talk here |
| Streams | 3112 | N+1 |
| Web viewer | **3113** | `http://localhost:3113` — watch memory build live |
| iii engine | 49134 | N+46023, WebSocket |

Storage: file-backed SQLite at `./data/state_store.db` (docs sometimes call it `~/.agentmemory/state_store.db`). Build: TypeScript → ESM via `tsdown` into `dist/`. Tests: `vitest` (`npm test` = 950+ unit tests, excludes integration).

---

## 6. "When do I use which surface?" — decision guide

| Situation | Reach for |
|---|---|
| An agent should auto-remember & auto-recall | **Hooks** (via plugin/connect) — zero manual calls |
| Calling from an MCP-speaking host (Claude Code, etc.) | **MCP tools** (`memory_*`) |
| Calling from any HTTP client / non-MCP host / debugging | **REST API** (`/agentmemory/*` on :3111) |
| Adding new memory capability | **New `mem::*` function** + trigger (never standalone state) |
| Quick keyword/vector recall | `mem::search` |
| Highest-quality recall | `mem::smart-search` |
| Save a fact explicitly | `mem::remember` (MCP `memory_save`) |
| Pin always-available context | **Slots** (`mem:slots` / `mem:slots:global`) |
| Distill durable, reusable knowledge | `crystallize` / `lessons` |
| Share across a team | `team` + `governance` |
| Confirm capture is working / demo | **Web viewer** :3113 |
| Move data in/out | `export-import`, `obsidian-export`, `snapshot` |

---

## 7. Extending Safely — the checklist

Because one capability spans many files, `AGENTS.md` defines hard consistency rules. The short version:

- **New MCP tool** → update `tools-registry.ts`, `server.ts`, `api.ts`, `index.ts`, `test/mcp-standalone.test.ts`, `README.md`, and the plugin manifests.
- **New REST endpoint** → `api.ts`, `index.ts` (log count), `README.md`.
- **New KV scope** → `state/schema.ts` + `types.ts` interface.
- **Version bump** → `package.json`, `version.ts`, `types.ts`, `export-import.ts`, tests, plugin manifests.
- **State-changing op** → always call `recordAudit()`.
- **REST handlers** → auth-check + whitelist fields; never pass raw body to `sdk.trigger()`.

See [ENHANCEMENTS.md](../ENHANCEMENTS.md) for 11 concrete, verified improvement opportunities (temporal decay on `Memory`, semantic dedup, conflict detection, closing secrets-scrub bypass paths, etc.) — a good source of "what to build next" with file-level pointers.

---

## 8. Where to start reading the code

1. `AGENTS.md` — the rules and patterns (read first).
2. `src/index.ts` — see everything get wired up (the worker boot).
3. `src/types.ts` — the data model (especially `RawObservation`, `CompressedObservation`, `Memory`, `Session`).
4. `src/functions/observe.ts` → `compress.ts` → `consolidation-pipeline.ts` — follow one observation end to end.
5. `src/state/hybrid-search.ts` — follow one query end to end.
6. `src/triggers/api.ts` + `src/mcp/server.ts` — see how the outside calls in.
