# Test case: "Who is the careful generator?"

A canonical regression test for agentmemory's lineage/recall capabilities.
This scenario is what motivated the `mem::lineage` design (v4-A) and
reveals the limits of smart-search + the residual gaps in v4-A itself.

## The question

> *"Who is the careful generator?"*

Trivial-sounding. The right answer is a one-line lookup. But it's
secretly testing several capabilities at once.

## What we know (out-of-band ground truth)

**Definition.** From `docs/architecture.md:308-309` and
`docs/configuration.md:176-177`:

```
analyse_manifest:  vast-qwen36-35b   # Tier 2 — careful generator
diff_complex:      vast-qwen36-35b
```

So **"careful generator" = Tier 2 = Qwen3.6-35B-A3B-FP8**, paired with:

- **Tier 1 = "premium reasoning" / colloquially "the judgement" = Qwen3.5-397B**
  via Together. Knows when to stop intrinsically; doesn't need bail-prompting.
- **Tier 2 = "careful generator" = Qwen3.6-35B-A3B-FP8**. Smaller, faster,
  but needs explicit prompting on when to stop.

**Provenance (user-supplied context, 2026-05-19).** The nicknames were
coined during a **benchmark session** where multiple models were pitted
against each other, qwen36 was the clear winner on the
generator-shaped tasks (`analyse_manifest`, `diff_complex`). The session
also coincided with the first exploration of serverless alternatives —
and the conclusion at the time was that nothing on serverless matched
what qwen36 offered on vast-pod hosting.

**Earliest written trace (corpus-confirmed).** The comments were
hardened into the codebase at `2026-04-26T11:39:45.123Z` in session
`05988a74-d1f1-42a1-9cd4-53b4db205ff3` — a config edit adding the
tier-routed pipeline comments. The conversation that produced those
edits is somewhere earlier (probably mid-to-late April).

## What this scenario tests

A working memory system should answer each of these:

| sub-question | shape | required capability |
|---|---|---|
| What does "careful generator" mean? | definition | direct retrieval against architecture.md memory |
| When did this term enter our vocabulary? | first-mention timestamp | chronological retrieval (lineage) |
| What was the surrounding context? | session metadata + adjacent turns | obs enrichment |
| Who's the companion concept? | related-entity traversal | graph-edge retrieval |
| Why did we pick qwen36 specifically? | rationale | summary/handoff retrieval over the benchmark session |
| Did we revisit this when serverless improved? | follow-up surface | cross-session temporal traversal |

## Observed behavior (as of 2026-05-19 evening)

### `mem::smart-search "who is the careful generator?"`

Returned **8 unrelated lessons** (top score 0.726 — session-handoffs
about May 1 work that mentioned "careful" in unrelated contexts). The
[Repo doc] memory of architecture.md did not appear in either channel.

**Diagnosis:** smart-search ranker favors the lesson channel and
crowds out memory hits. The vector channel doesn't pull a 19 KB doc
based on a single inline comment phrase.

### `mem::search` (BM25-only) `"careful generator"`

Returned correct hits with real signal — scores 7–14, observations
+ memories interleaved, the architecture.md memory surfaced. BM25
proves the data is in the corpus and the index has it.

### `mem::lineage` (v4-A initial implementation)

Returned a populated timeline of 30 items sorted ASC:

- **`firstMention`**: `2026-04-18T08:26:37Z`, project `observer-sessions`,
  session `2d7f99c4-...`
- **Hit distribution**: observation=23, memory=71, lesson=0, summary=0
  (top 30 returned)
- **adjacentTurns** attached on 14/23 obs hits
- **graphNeighbors**: `[]` (no graph node with `name` containing "careful"
  or "generator" — graph-extract was run over architecture.md content
  but didn't surface the inline comment phrase as a node name)
- **Architecture.md memory hit**: present, with correct sourceFile
  extracted

**Diagnosis:** v4-A works mechanically — sorted timeline, channel
totals, enrichment, all correct. But `firstMention` is wrong: the
`observer-sessions` synthetic project (agentmemory's own meta-observer
watching primary sessions) emits records containing tokens that BM25
matches. They time-sort to the top because they're earlier than the
actual conversations.

The **real** first mention — the benchmark conversation — likely lives
in observations from a non-observer session. The user's recollection
places it "around when we first looked at serverless" (probably
late March / early-mid April 2026 based on related context).

## Gaps surfaced

1. **`mem::lineage` doesn't filter observer/agent meta-sessions** by
   default — same gap that `scripts/rebuild-graph.sh` and
   `emit_observations` explicitly handle. Should default-exclude
   projects matching `^(observer|agent-)` with an opt-in
   `--include-observer` style override.

2. **BM25 sweep is bounded at `min(limit*4, 500)`** — the very long
   gitops-assistant session `05988a74-...` (10,704 observations) has
   "careful generator" references that didn't make the top 200 ranked.
   Either raise the cap when channel filtering is wide, or scan all
   obs in matched sessions to ensure no in-session reference is
   dropped.

3. **Graph-extraction over docs missed the inline comment phrases.**
   `parseGraphXml` extracted entities from architecture.md's prose
   sections, but the comment line
   `# Tier 2 — careful generator (Qwen3.6-35B-A3B-FP8 on vast pod)` was
   treated as code/config noise, not a concept-defining edge. No
   `GraphNode(name="careful generator")` exists, so `includeGraph: true`
   returns `[]`.

4. **The benchmark session itself is not findable as a structured
   record.** It happened (per the user) but the corpus doesn't seem to
   have a session summary or memory record about "we benchmarked
   qwen35-397b vs qwen36-35b vs X, qwen36 won on generator tasks". The
   nicknames stuck in code comments but the *reasoning behind picking
   the nickname* (the benchmark) was never crystallized as a memory.
   This is a memory-curation gap, not a retrieval gap.

## Validation criteria for future re-runs

Re-running this test case after improvements should validate:

```bash
# A. Lineage smoke (after observer-filter fix):
curl -fsS -X POST http://localhost:3111/agentmemory/lineage \
  -H 'content-type: application/json' \
  -d '{"query":"careful generator","limit":30,"order":"asc"}' \
  | jq '.firstMention'

# Pass criteria:
#   - .project NOT IN ["observer-sessions", "agent-*"]
#   - .timestamp ideally falls within the user-described benchmark
#     window (probably April 2026 mid-to-late, pre-config-edit on Apr 26)

# B. Graph traversal (after architecture-doc graph-extraction is
#    re-run with prompt tuning that surfaces comment phrases):
curl -fsS -X POST http://localhost:3111/agentmemory/lineage \
  -H 'content-type: application/json' \
  -d '{"query":"careful generator","includeGraph":true}' \
  | jq '.graphNeighbors'

# Pass criteria:
#   - non-empty
#   - At least one neighbor is "Qwen3.6-35B-A3B-FP8" or "vast-qwen36-35b"
#     with relation type "uses", "is", or "implements"

# C. Smart-search re-ranker:
curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'content-type: application/json' \
  -d '{"query":"who is the careful generator","limit":10}'

# Pass criteria:
#   - architecture.md or configuration.md memory in top 5 hits
#   - score > 0.3 on the relevant memory
```

## Follow-up work surfaced by this test case

In rough priority:

1. **v4-A patch**: default-exclude observer/agent projects in
   `mem::lineage`. ~5 lines. Highest leverage.
2. **Capture the benchmark session as a project memory**: a
   `project_qwen36_v_qwen35_benchmark.md` documenting what was tested,
   the results, why qwen36 won on generator tasks, and why serverless
   alternatives were rejected at the time. Pure curation — no code
   change. The user has the context; the corpus doesn't.
3. **Smart-search channel re-ranker** (v4-B): boost the memory channel
   for queries with named-concept patterns ("who is X", "what is X",
   "define X"). Smaller surface than v4-A's lineage primitive but
   targets a more common query shape.
4. **Comment-aware graph extraction** (v4-C): tune the graph-extraction
   prompt or post-processor to treat code comments like
   `# Tier 2 — careful generator (...)` as concept-defining
   declarations. Currently they're treated as code noise.

## Why this test case is durable

It's a real recall miss from a real workflow with verifiable ground
truth in the corpus. As long as `docs/architecture.md` retains the
"Tier 2 — careful generator" comment and the gitops-assistant session
history exists, this scenario is re-runnable across agentmemory
versions to track recall regressions and improvements. Any future
PR that touches lineage, smart-search ranking, or graph extraction
should be re-tested against this case.
