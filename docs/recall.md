# Retrieving saved knowledge

Use `targetLayer: "memory"` when you want records created by `memory_save`,
including their latest versions. Captured tool activity remains available through
`targetLayer: "observation"`. Omitting the option, or passing `"all"`, keeps mixed
search. Both `memory_recall` and `memory_smart_search` accept the option.

```json
{
  "query": "authentication deployment decision",
  "project": "my-project",
  "targetLayer": "memory",
  "format": "narrative",
  "token_budget": 900
}
```

Send these arguments to `memory_recall`, or POST them to
`/agentmemory/search`. The layer filter runs before keyword and vector candidate
limits and graph ranking, so a large observation history cannot consume the
saved-memory candidate slots. Search results include a `layer` field. Layer
selection does not change the default mixed ranking or delete captured activity.

`memory_smart_search` uses the same layer selection at `/agentmemory/smart-search`.
Its optional lesson list accompanies mixed search only. Use `memory_lesson_recall`
for lessons and `memory_insight_list` for insights. Layer selection is separate
from `project` and `agentId`; preserve scope filters when expanding results.

## Budgeted recall

All three `memory_recall` formats (`full`, `compact`, `narrative`) return structured
JSON through both REST and MCP. Narrative output includes its readable `text`
field alongside results and budget metadata. Clients that previously consumed
raw narrative MCP text should parse the JSON and read `text`.

- `matched_count` counts scoped, ranked matches within the requested `limit`.
  It is not a corpus-wide count.
- `content_truncated: true` on a result marks a shortened preview. Its ID remains
  intact. Full previews can omit facts, concepts, files, and optional fields to
  fit the budget; available agent identity, confidence, and origin channel/time
  are retained. The stored record remains unchanged.
- `excluded_by_budget` counts matched records that were not returned.
- `excluded_results` contains up to ten recovery references with IDs, session
  IDs, and short titles. `excluded_results_truncated` indicates more omissions.
- `minimum_budget` appears when the budget cannot fit even the top result's
  smallest identity-bearing preview. Increase the budget or expand the reference.
- `truncated` covers either shortened content or omitted results.

The highest-ranked match is kept first, with a preview when necessary. Packing
preserves rank order; it does not replace a long top match with smaller,
lower-ranked records. `matched_count: 0` means no selected matches. Empty results
with a positive `matched_count` mean the budget prevented a preview.

`tokens_used` is a heuristic: the sum of each returned result's serialized JSON
length divided by three, rounded up. `token_budget` caps that estimate. It is not
an exact model-token count or a cap on the whole response. The JSON envelope,
recovery metadata, and narrative `text` copy add overhead outside that estimate.
Use compact recall followed by selective expansion when response size matters.

## Recover full content

Call `memory_smart_search` with a clipped result ID or an ID from
`excluded_results`. A query is not required for expansion:

```json
{
  "expandIds": "mem_example",
  "project": "my-project",
  "targetLayer": "memory"
}
```

Use a comma-separated string for MCP and an array of IDs for REST.
The response contains complete stored content for up to 20 accessible matching
records. The server examines at most 100 requested IDs per call and sets
`truncated` when a cap leaves requests unprocessed. Keep any `agentId` filter
from the original search.

The reduced local MCP fallback stores saved memories only. Memory-only recall
works there; observation-only recall returns no rows. It uses the same recall
budget response contract as the full server.

## Local regression evaluation

Run `npm run build` followed by `npm run eval:recall`. The evaluation creates a
fresh local iii instance, imports synthetic tool observations and saved memories,
and checks recall through REST and MCP without model calls or personal data.
See [evaluation setup](../eval/README.md) for engine and sandbox requirements.
