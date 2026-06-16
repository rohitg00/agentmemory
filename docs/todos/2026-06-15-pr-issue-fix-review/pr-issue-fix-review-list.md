# PRs Claiming Fixes For Known Issues

This local review row preserves neutral identifiers only. It intentionally avoids GitHub URLs, hash-number issue references, and mentions.

## Worklist

| Review status | Fork decision | Upstream PR | Upstream state | Fork tracker | Claimed fixed issues | PR title | Author | Updated | Review notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reviewed | defer | PR 349 | open | Fork issue 724 | Issue 345 (open; close) - concept_edges table + BFS-depth-2 recall mode | feat: implement concept graph search with depth-2 BFS expansion | Tanmay-008 | 2026-05-17T09:42:42Z | Issue remains a plausible product request, but PR 349 was not imported. Patch is stale against the fork and does not apply. Direct import would add a second graph store, boot-time full-memory backfill, unbounded per-query concept-edge and memory enumeration, missing project/agent isolation, stale smart-search result mapping, and unrelated hook/viewer churn. Safe work should be deferred to a fork-native indexed, bounded, scoped concept-graph design. |
