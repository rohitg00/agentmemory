# PRs Claiming Fixes For Known Issues

This local review list preserves neutral identifiers only. It intentionally avoids GitHub URLs, hash-number issue references, and mentions.

## Worklist

| Review status | Fork decision | Upstream PR | Upstream state | Fork tracker | Claimed fixed issues | PR title | Author | Updated | Review notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reviewed | adapt | PR 318 | reviewed | Fork issue 244 | Issue 244 - OpenCode session metadata | opencode session metadata | not recorded | not recorded | Preserved optional session-start label metadata with bounded string parsing; targeted API/OpenCode tests, lint, diff check, and diff-scoped security scan passed. |
| reviewed | defer | PR 349 | open | Fork issue 724 | Issue 345 (open; close) - concept_edges table plus BFS-depth-2 recall mode | feat: implement concept graph search with depth-2 BFS expansion | Tanmay-008 | 2026-05-17T09:42:42Z | Issue remains a plausible product request, but PR 349 was not imported. Patch is stale against the fork and does not apply. Direct import would add a second graph store, boot-time full-memory backfill, unbounded per-query concept-edge and memory enumeration, missing project/agent isolation, stale smart-search result mapping, and unrelated hook/viewer churn. Safe work should be deferred to a fork-native indexed, bounded, scoped concept-graph design. |
| reviewed | adapt | PR 412 | reviewed | Fork tracker 672 | Issue 395 - embedding provider aliases | embedding provider aliases | not recorded | not recorded | Added explicit `AGENTMEMORY_EMBEDDING_PROVIDER` support and local aliases while preserving the explicit remote embedding opt-in boundary; regenerated the config skill reference and verified the focused provider tests plus full suite on the branch. |
| reviewed | adapt | PR 892 | open | Fork issue 401 | Issue 700 - engine state store pollutes caller data directory<br>Issue 844 - global npm install uses unresolvable relative worker supervision paths | fix(cli): anchor engine cwd and rewrite bundled config with absolute paths | rohitg00 | 2026-06-10T22:59:45Z | Relevant locally for Issue 700 and Issue 844. Adapted runtime config generation and native engine cwd anchoring; did not import automatic caller-data copy because it can cross project data ownership boundaries. Issue 303 claim remains owned by a separate batch. |
