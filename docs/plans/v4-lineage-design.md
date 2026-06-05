# v4-A: `mem::lineage` — concept-lineage retrieval primitive

## Problem

Smart-search ranks the **lesson** channel over the **memory** and **observation**
channels, so queries that target a single inline phrase in a large doc
(or a turn from a specific past session) are silently dropped from the
top-K. The data is in the corpus; the *retrieval shape* is missing.

Concrete miss we hit:
- Query: *"who is the careful generator?"*
- Truth: `docs/architecture.md:308` defines it as Tier-2 = Qwen3.6-35B-A3B-FP8,
  and the term was first written into `config/config.yaml` at
  `2026-04-26T11:39:45` in session `05988a74-...`.
- Smart-search returned 8 unrelated session-handoff lessons (top score 0.726).
- Plain `/agentmemory/search` (BM25-only) found the right hits cleanly
  (score 11–14) — proving the data is there and BM25 indexes it.

The gap is a missing **conceptual-lineage** primitive: *"when did this term
enter our shared vocabulary, where, and what surrounded it?"*. That's a
different query shape from relevance-ranked retrieval — it wants
**chronological order** + **session context** + **adjacent turns**.

## Function: `mem::lineage`

### Request

```json
POST /agentmemory/lineage
{
  "query": "careful generator",
  "limit": 50,
  "since": "2026-04-01T00:00:00Z",
  "until": "2026-05-20T00:00:00Z",
  "channels": ["observation", "memory", "lesson", "summary"],
  "includeAdjacentTurns": true,
  "includeGraph": false,
  "order": "asc"
}
```

Field semantics:

| field | type | default | meaning |
|---|---|---|---|
| `query` | string (required) | — | phrase/terms to find. Case-insensitive substring match for lessons/summaries; existing BM25 index handles observations/memories. |
| `limit` | int | 50 | max items in the returned timeline (after merge + sort) |
| `since` / `until` | ISO 8601 | unbounded | filter on `createdAt` / `timestamp` |
| `channels` | array | all four | which content types to search |
| `includeAdjacentTurns` | bool | `true` | for observation hits, attach the previous user prompt + previous assistant turn from the same session |
| `includeGraph` | bool | `false` | attach immediate graph-edge neighbors of nodes whose `name` matches the query |
| `order` | `"asc"` \| `"desc"` | `"asc"` | chronological direction (asc = oldest first, lineage-style) |

### Response

```json
{
  "query": "careful generator",
  "firstMention": {
    "timestamp": "2026-04-26T11:39:45.123Z",
    "channel": "observation",
    "sessionId": "05988a74-d1f1-42a1-9cd4-53b4db205ff3",
    "project": "gitops-assistant"
  },
  "timeline": [
    {
      "timestamp": "2026-04-26T11:39:45.123Z",
      "channel": "observation",
      "id": "obs_mp...",
      "sessionId": "05988a74-d1f1-42a1-9cd4-53b4db205ff3",
      "project": "gitops-assistant",
      "title": "post_tool_use",
      "type": "other",
      "snippet": "...Tier 2 — careful generator (Qwen3.6-35B-A3B-FP8 on vast pod)\n  analyse_manifest:  vast-qwen...",
      "score": 12.4,
      "session": {
        "id": "05988a74-...",
        "project": "gitops-assistant",
        "startedAt": "2026-04-26T09:06:36.534Z",
        "firstPrompt": "I need an implementation plan for wiring..."
      },
      "adjacentTurns": {
        "previousUserPrompt": "...",
        "previousAssistantSummary": "..."
      }
    },
    {
      "timestamp": "2026-05-19T00:36:09.232Z",
      "channel": "memory",
      "id": "mem_mp...",
      "title": "[Repo doc] gitops-assistant: docs/architecture.md (chunk 1/1...)",
      "snippet": "...# Tier 2 — careful generator\nanalyse_manifest:  vast-qwen36-35b...",
      "score": 7.1,
      "sourceFile": "docs/architecture.md",
      "memoryType": "architecture"
    }
  ],
  "totalsByChannel": {
    "observation": 12,
    "memory": 3,
    "lesson": 0,
    "summary": 1
  },
  "graphNeighbors": [
    {
      "name": "careful generator",
      "type": "concept",
      "edges": [
        { "kind": "uses", "neighbor": "vast-qwen36-35b", "neighborType": "library" },
        { "kind": "related_to", "neighbor": "analyse_manifest", "neighborType": "function" }
      ]
    }
  ]
}
```

Notes:
- `firstMention` is the earliest item in the timeline (after filtering),
  surfaced separately for convenience.
- `graphNeighbors` only present when `includeGraph: true`.
- `adjacentTurns` only present when `includeAdjacentTurns: true` AND the
  channel is `observation` AND a prior turn exists in the same session.

## Algorithm

```
1. Match by channel (parallel):
   a) observation & memory:
      - reuse the existing BM25 index from src/functions/search.ts.
        Call getSearchIndex().search(query, max=200) or equivalent.
        Filter by `channels` setting.
      - existing index already returns timestamp + sessionId for
        observations; memory entries carry createdAt + id.
   b) lesson:
      - kv.list<Lesson>(KV.lessons)
      - filter: !lesson.deleted && lesson.content.toLowerCase().includes(qLower)
      - ~4500 lessons; substring scan is ~10ms
   c) summary:
      - kv.list<SessionSummary>(KV.summaries)
      - filter on .narrative substring
      - ~60 records; trivial

2. For each hit, build a TimelineItem with:
     timestamp, channel, id, score (BM25 if available, else 0),
     snippet (300-char window centered on first match position;
     clip at content boundaries; "..." prefix/suffix elision).

3. Apply since/until filters.

4. Merge channels, sort by timestamp (asc by default), trim to limit.

5. Enrichment pass:
   a) Session lookup cache (Map<sessionId, Session>) — populate lazily
      on first obs hit needing it.
   b) If includeAdjacentTurns: for each observation hit, scan
      KV.observations(obs.sessionId) for the last observation with
      timestamp < obs.timestamp that is type=="conversation" AND has a
      userPrompt field; same for the latest assistant-side observation.
      Cache per-session so multiple hits in one session share a single
      KV.list call.
   c) For memory hits: parse the source line from the content header
      if it starts with "[Repo doc] " or "[Session handoff] ".
      Regex: /^\[Repo doc\] [^:]+: ([^\s(]+)/

6. If includeGraph:
   - kv.list<GraphNode>(KV.graphNodes), filter by name.toLowerCase()
     includes(qLower) OR exact-match of any tokenized phrase.
   - For each matched node, kv.list<GraphEdge>(KV.graphEdges) filtered
     by source/target == node.id; resolve neighbor node names + types.
   - Attach to the top-level response, NOT per timeline item.

7. Build firstMention from timeline[0] (after sort).

8. Audit the call (kv recordAudit).
```

## Files to modify

| file | change |
|---|---|
| `src/types.ts` | add `TimelineItem`, `LineageResult` interfaces |
| `src/functions/lineage.ts` | **new** — implements `mem::lineage` per the algorithm above |
| `src/index.ts` | register the lineage function (find where other `register*Function(sdk, kv)` calls live and add `registerLineageFunction(sdk, kv)`) |
| `src/triggers/api.ts` | add `api::lineage` HTTP wrapper + trigger registration for `POST /agentmemory/lineage` (mirror the pattern of `api::search` or `api::smart-search`) |
| `src/mcp/tools-registry.ts` | add `memory_lineage` tool entry so the MCP layer exposes it (mirror `memory_smart_search`) |

No new env vars. No new KV namespaces. Reuses existing indexes.

## Implementation notes & gotchas

1. **BM25 index reuse**: `src/functions/search.ts` exports `getSearchIndex()`.
   Confirm what types of entries the index holds before calling — observation
   indexing happens at write time in observe.ts and remember.ts; lessons
   may or may not be indexed (probably not). Either way, lesson/summary
   substring-scan path handles those channels independently.

2. **Adjacent-turn lookup**: `KV.observations(sessionId)` is a per-session
   namespace. The fetch is O(n) in the session's observation count, but
   we only do it once per unique sessionId in the hit set, and cache
   the result. For a query that hits one big session 50 times, it's a
   single list call.

3. **Memory createdAt vs observation timestamp**: both exist as ISO strings.
   Treat them uniformly for sort. CompressedObservation has `.timestamp`,
   Memory has `.createdAt`. Lesson has `.createdAt`. SessionSummary has
   `.createdAt`. Normalize on read.

4. **Empty query** → return 400 with `error: "query is required"`.

5. **No-match query** → return 200 with empty timeline, all zeros in
   totalsByChannel, `firstMention: null`.

6. **Snippet generation**: find first match position via
   `content.toLowerCase().indexOf(qLower)`, take [pos-150 .. pos+150]
   clipped at 0/length, prepend/append "…" if clipped. If the BM25
   index already returned a snippet, prefer that.

7. **Tokenization for graph node match**: the query may be a phrase
   ("careful generator") that doesn't appear as a single graph-node
   `name`. Fallback: split query on whitespace, match nodes whose name
   contains ANY token. This is best-effort; if the user wants strict
   matching they should query the graph directly.

8. **Sort stability**: when two items share a timestamp (rare but
   possible), break ties by `(channel, id)` lexicographic.

## Validation criteria

After implementation, the subagent must verify:

```bash
# 1. Build dist
npm run build

# 2. Rebuild container image
docker compose -f docker/docker-compose.yml up -d --build

# 3. Wait for /livez
curl -fsS http://localhost:3111/agentmemory/livez

# 4. The smoke test that motivated this work:
curl -fsS -X POST http://localhost:3111/agentmemory/lineage \
  -H 'content-type: application/json' \
  -d '{"query":"careful generator","limit":30,"includeAdjacentTurns":true,"includeGraph":true}' \
  | jq

# Expected:
#   - firstMention.timestamp ≈ 2026-04-19T18:19:57Z (earliest observation hit)
#     OR 2026-04-26T11:39:45Z (the config-edit observation we grep-confirmed).
#   - timeline.length > 0, sorted asc by timestamp
#   - At least one observation hit from session 05988a74-...
#   - At least one memory hit with sourceFile == "docs/architecture.md"
#   - totalsByChannel.observation >= 5
#   - totalsByChannel.memory >= 1
#   - graphNeighbors is non-null (V3-C extracted nodes from architecture.md)

# 5. Empty-query rejection:
curl -fsS -X POST http://localhost:3111/agentmemory/lineage \
  -H 'content-type: application/json' -d '{"query":""}' -i | head -3
# Expected: HTTP 400

# 6. No-match query:
curl -fsS -X POST http://localhost:3111/agentmemory/lineage \
  -H 'content-type: application/json' \
  -d '{"query":"zzz_no_such_concept_zzz"}' | jq
# Expected: timeline=[], totalsByChannel all 0, firstMention=null
```

## Out of scope (filed for later)

- **Smart-search ranker tuning** (don't crowd lessons over memories). Separate
  ~10-line change to `src/functions/search.ts`. Not in v4-A.
- **Graph-traversal retrieval** (find via graph edges, not text match). Bigger
  design; v4-B if there's appetite.
- **Cross-session entity merging** (handoff for "careful generator" in session
  A links to its first mention in session B). Requires entity-resolution
  logic; v4-C+.
