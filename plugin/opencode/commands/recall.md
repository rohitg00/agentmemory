Search past session observations and lessons for relevant context. Wrap the `memory_smart_search` and `memory_lesson_recall` MCP tools.

## Usage

```
/recall [query]
```

## Instructions

1. Call `memory_smart_search` with the query and `limit: 10` (hybrid BM25 + vector + graph search).
2. Call `memory_lesson_recall` with the same query and `limit: 5` (lesson search).
3. Combine results and present to the user:
   - Group by session
   - Show type, title, and narrative for each observation
   - Highlight high-importance (>= 7) observations
   - Show lessons separately with confidence scores
4. If no results, suggest 2-3 alternative search terms.
5. **Never hallucinate results.** Only present what the MCP tools actually return.
