# 0002 Tiered Observation Lifecycle and Micro-Compaction

## Status
Accepted

## Context
Sessions in complex coding workflows can easily exceed 500 tool invocations. The historical hard limit of 500 observations caused `mem::observe` to drop subsequent observations, leading to mid-task amnesia where the agent lost context of ongoing work. Conversely, storing unbounded raw observations in memory and serializing all of them on each `kv.list` call introduces V8 heap pressure and slow queries.

## Decision
We replace the hard 500-observation ingestion cap with a Two-Tier Observation Lifecycle:
1. **Unbounded Storage Tier**: Raw episodic observations are written append-only without hard limits, using $O(1)$ writes.
2. **Periodic Micro-Compaction Tier**: When uncompacted observations cross a watermark (e.g., every 200 observations), a background worker synthesizes them into an intermediate **Session Checkpoint**.
3. **Bounded Working Context Tier**: Active memory retrieval and prompt enrichment queries do not ingest the entire raw history. Instead, they combine the latest Session Checkpoint, top-importance observations, and a sliding window of the most recent observations.

## Consequences
- Prevents mid-session amnesia and allows agents to run indefinitely long coding sessions.
- Decouples storage capacity from runtime LLM prompt size and token costs.
- Requires a background compaction trigger and checkpoint schema in `src/functions/`.
