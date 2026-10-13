# Graph search limits and freshness

Hybrid search loads graph nodes and edges once per search request, when a graph stream is needed. Entity search, vector-result expansion and query reformulations share that request's graph view and adjacency index. Setting `AGENTMEMORY_GRAPH_WEIGHT=0` skips graph reads entirely.

Normal recall and smart search can use graph evidence when embeddings are disabled or the vector index is empty. Graph-only observation hits resolve their owning session through the keyword index, preserving record loading and project, agent and layer filters.

A new request reads current state. There is no graph cache with a time-to-live, so completed imports, mesh updates, snapshot restores, deletions and resets are visible to the next search. Both graph lists are pinned to one generation: a reset during loading cannot combine old nodes with new edges. This pin does not provide a transactional snapshot of individual writes within the same generation.

Entity retrieval and chunk expansion each select at most 25 starting nodes. Entity selection prefers exact names, then uses a stable name and ID ordering. Chunk expansion uses stable node ID ordering. Each stream invocation shares a traversal budget across its starting nodes: at most 2,000 node discoveries and 10,000 examined adjacency entries. Stronger edges are examined first. These limits bound traversal work on hubs and dense graphs; broad queries can omit lower-priority paths. Temporal queries retain their existing complete history behavior.

The initial graph read still uses two complete `state::list` calls. Traversal limits do not bound the size of these responses, graph materialization, or the number of independent requests. Large stores can still exceed the engine's transport or memory budget. Bounding those reads requires engine-side pagination or a maintained query index; an in-process cache does not solve that limit.

The scale benchmark uses an in-memory state mock, deterministic embeddings and no graph stream. Its timings measure local retrieval work, not the latency of a REST request with an embedding service and engine transport.
