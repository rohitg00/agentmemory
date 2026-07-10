# Continuity Schema Note

P1 keeps continuity out of the runtime path on purpose.

## Scope in P1

- archived sessions may produce `durableCandidates[]`
- only explicit promote writes `Memory`
- backfill defaults to `dryRun`
- archive processing does not promote or recall

## Candidate -> Memory lifecycle

1. session summary stores `durableCandidates[]`
2. operator or tool lists candidates from `KV.summaries`
3. explicit promote writes `Memory`
4. promoted memory stores:
   - `title`
   - `content`
   - `type`
   - `concepts`
   - `files`
   - `sourceObservationIds`
   - `sessionIds`
   - `sourceCandidateId`
   - `confidence`
   - `strength`

## Continuity follow-up for P2+

Potential continuity rows should remain a separate schema from `Memory` so they can model:

- open loops or pending threads
- expected next actions
- handoff-specific state
- freshness / expiry
- recall priority separate from durable importance

That design note is intentionally deferred until after P1 proves:

- candidates can be generated from archived sessions
- promote is idempotent
- backfill can preview and then write candidates without auto-promoting
