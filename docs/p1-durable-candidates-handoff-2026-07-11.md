# P1 Durable Candidates Handoff (2026-07-11)

## Code baseline

- Repo: `C:\Users\86185\dev\agentmemory-src`
- Branch: `feature/p1-durable-candidates`
- HEAD: `ecb2487` (`feat(memory): add durable candidates MVP`)
- Tag: `p1-durable-candidates-mvp`

Related plugin/runtime baseline outside this repo:

- Plugin repo: `C:\Users\86185\plugins\agentmemory`
- Tag: `p1-plugin-surface`

## What landed in P1

- `DurableCandidate` MVP schema is present, including `title`,
  `promotionReason`, `confidence`, `sourceObservationIds`, and promote
  bookkeeping.
- `/agentmemory/archive/process` generates `durableCandidates[]` only.
  It does not promote and does not recall.
- Promote is explicit and idempotent. It checks existing
  `Memory.sourceCandidateId` and backfills `promotedMemoryId` when needed.
- Backfill supports `dryRun`, `limit`, and candidates-only writes.
- Continuity remains doc-only in P1. See
  `docs/continuity-schema-note.md`.

## Read-only archive inventory snapshot

Inventory target:

- `C:\Users\86185\.codex\archived_sessions`

Inventory guardrails:

- no `/archive/process`
- no KV writes
- no promote

Snapshot taken at:

- `2026-07-11T05:33:32.191Z`

Results:

- Archive files: `44`
- Parseable files: `44`
- Bad files: `0`
- Unique session ids: `44`
- Duplicate session ids: `0`
- Observations: `1057`
- Observation counting rule:
  `event_msg:user_message + event_msg:task_complete`
- Diagnostic `response_item` total: `14334`

Expected baseline:

- Expected: `29 sessions / 965 observations`
- Observed: `44 sessions / 1057 observations`
- Delta: `+15 sessions / +92 observations`

Conclusion:

- The current archive corpus snapshot does not reproduce the expected
  `29 / 965` baseline.

## Current live-store comparison

Live-store snapshot captured during the same inventory run:

- `12 sessions / 367 observations / 1 memory`

Archive-vs-live session-id overlap:

- Already present in live store: `0`
- Missing from live store: `44`
- Live-only sessions: `12`

Note:

- A nearby `agentmemory status` check reported `12 / 365 / 1`. The live store
  is drifting slightly between snapshots, but in both cases it is clearly not
  the expected `29 / 965` corpus.

## What this means

- P1 code surface is in place.
- The blocking question is now corpus alignment, not runtime feature coverage.
- We should not run real backfill or promote on the archive corpus until the
  `29 / 965` expectation is either reproduced or explicitly revised.

## Recommended next steps

1. Confirm which archive subset is supposed to define the `29 / 965` baseline.
2. Confirm which live data directory/runtime should contain that baseline.
3. Re-run the read-only archive inventory until the gap is explained.
4. Only after that, run `POST /agentmemory/durable-candidates/backfill` with
   `{"dryRun": true}`.
5. If the dry-run looks sane, run a limited real backfill with `limit=1`.
6. Promote exactly one high-confidence candidate and verify repeated promote
   skips correctly.

## Do not do yet

- Do not run `/archive/process` on the raw archive corpus.
- Do not run full real backfill.
- Do not auto-promote.
- Do not connect continuity/handoff state into runtime for P1.

## Repro commands

```powershell
agentmemory status
node C:\Users\86185\dev\agentmemory\scripts\archive-corpus-inventory.mjs
```
