# 03 — Unbounded Observation Ingestion Pipeline

**What to build:** An append-only observation ingestion pipeline that eliminates the 500-observation session cap, replacing full scans with $O(1)$ writes and tracking session counts and uncompacted watermarks in metadata to avoid mid-task amnesia in long sessions.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Remove the hard cap error condition (`Session observation limit reached (500)`) in `src/functions/observe.ts`.
- [ ] Maintain an append-only observation record structure in `KV.observations(sessionId)`.
- [ ] Track total observation count and uncompacted counter incrementally in session metadata to eliminate $O(N)$ `kv.list` scans on ingest.
- [ ] Verify that long sessions with >500 observations write and persist subsequent observations with HTTP 200 success.
- [ ] Add unit tests simulating 600 sequential observations without dropping or erroring.
