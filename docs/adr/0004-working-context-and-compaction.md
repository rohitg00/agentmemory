# 0004 Working Context Composition and Hybrid Compaction Watermarks

## Status
Accepted

## Context
Long-running sessions generate hundreds of episodic observations, which can overwhelm context windows and token budgets if injected raw. Conversely, purely summarized history loses immediate granular context (exact recent commands, file paths, and outputs). Hard caps previously led to mid-session amnesia by dropping observations past a fixed threshold.

## Decision
1. Ingestion is decoupled from prompt size: observations are accepted append-only without a hard cap.
2. Background micro-compaction triggers automatically via a hybrid watermark:
   - When uncompacted observations exceed 200 items, OR
   - When 30 seconds of conversational idle time elapses after at least 50 new observations.
   Compaction runs asynchronously via `mem::summarize` / `mem::compress` without blocking the agent.
3. Active prompt injection synthesizes a three-tier **Working Context**:
   - The latest **Session Checkpoint** (synthesized view of preceding work).
   - Top semantically recalled **Crystals, ADRs, and Lessons** matching the current turn.
   - A trailing sliding window of the last 25 **Episodic Observations** preserving immediate tactical execution state.

## Consequences
- Agents can run indefinitely long sessions without context overflow or memory loss.
- Background compaction ensures prompt payloads remain predictably bounded (under target token budget).
- Immediate command accuracy is preserved through the trailing observation window.
