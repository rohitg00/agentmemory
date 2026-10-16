# Source retention and vector recovery

Compressed observations retain sanitized source fields for replay and export. The source lives in the same observation row and follows its deletion lifecycle. Search, context expansion, observation listings, shared feeds, and compressed live updates continue to return summaries without the retained source.

## Storage and token bounds

Each serialized source is capped at 16 KiB, including its metadata. Oversized fields retain a prefix and set `truncated: true`; `originalBytes` records the source size before truncation. Previously discarded source cannot be reconstructed. Replay reports source availability and truncation separately for every observation.

Live compression and imports allocate new source from an 8 MiB session budget after subtracting already-retained source. Available response space can reduce that budget further. Existing source above the allowance is preserved, with no additional source allocated; it is not retroactively capped. Imports report `sourceTruncated` and `sourceOmitted`; omission preserves the summary when even source metadata will not fit. A batch that already fits keeps its source unchanged. Live writes and imports share the existing per-session write lock while checking the budget and writing observations. Model calls happen outside the compression write lock. JSONL observation writes run in sequential batches of 20.

These locks coordinate one worker process. They do not provide distributed transactions. JSONL imports commit one file at a time, so a rejected later file can leave earlier files imported. Raising the ordinary capture limit of 500 observations does not raise the retained-source allowance; summary data and temporary raw observations have separate storage and response-size requirements.

Failed opt-in model compression keeps a searchable synthetic observation and retryable status. See [compression recovery](compression-recovery.md) for scoped inspection and explicit retries of failed or legacy raw observations.

Retention adds storage and serialization work. It does not enable model compression, inject extra source into ordinary recall, or add a queue. Explicit replay and export responses can be larger and can consume agent context if an agent requests them.

## First checkpoint and crash window

A fresh vector index schedules its first checkpoint within five seconds of completed vector work, or sooner when the configured interval requires it. Subsequent checkpoints use the configured interval, which defaults to 600,000 ms. Saves write changed vector entries with bounded concurrency rather than rewriting the full index per observation.

Five seconds is a scheduling bound, not a disk-durability guarantee. Completion depends on the storage service, and its persistence window still applies. A crash before a completed, persisted checkpoint can lose vectors. Later unsaved vectors remain subject to the normal batching window. Failed writes stay pending for retry at the normal interval.

Status distinguishes active vector backfill from backfill waiting for explicit opt-in. Missing vectors do not silently trigger unlimited embedding calls. Keyword recovery remains independent of vector coverage.

## Resuming missing vector coverage

A full-store recovery marker stays in StateKV until the planned recovery is complete and its vector checkpoint succeeds. The checkpoint retains the active cutoff and widens its fallback to full recovery before completion, so a crash during marker deletion cannot lose a queued record whose timestamp moved backwards. Coverage is checked again after deletion, including snapshot replacements that keep old timestamps. Dimension resets and unreadable or wrong-dimension pending entries require full recovery. They no longer reuse the discarded checkpoint's timestamp as a cutoff.

Full recovery requires `AGENTMEMORY_VECTOR_BACKFILL=all` on each start. Each start processes at most `AGENTMEMORY_VECTOR_BACKFILL_MAX` missing records (default 500); remaining records stay pending and resume on the next start. Existing vectors are reused. After completion, the checkpoint conservatively retains full recovery intent until a later ordinary checkpoint clears it, including after incremental recovery. If the process restarts before then, newly missing historical vectors still require the full-recovery opt-in; already-covered records incur no embedding calls. Removing the opt-in pauses old-record embeddings, and keyword search remains available. Explicit all-mode also checks old missing records in checkpoints created before this recovery marker existed.

Incremental recovery plans only records after its saved cutoff and processes successive bounded batches without requiring full-recovery opt-in for that run. Before embeddings start, it saves full restart intent. If a queued record is replaced with an older timestamp, that ID stays in the active coverage check. An interrupted incremental run therefore requires full-recovery opt-in on the next start; this prevents historical replacements from disappearing behind the old cutoff. If the restart intent cannot be saved, background embeddings and vector checkpoints stay paused. Provider failures, incomplete source scans and failed vector checkpoints retain recovery intent. A failed recovery-marker read or write pauses vector checkpoints and backfill until restart, preserving the previous cutoff while keyword search and source capture stay available. Repair access to the state store and restart to retry. The marker uses the existing index state scope and accepts the previous incremental marker format.

Run `npm run test:vector-recovery:packaged -- --tarball /path/to/package.tgz --engine /path/to/iii` after building and packing. The gate installs the tarball in an isolated home, runs the pinned native engine and a deterministic local embedding endpoint, and checks full recovery across forced restarts, opt-in withdrawal, provider outage, dimension changes, an empty saved checkpoint, an absent marker with checkpoint recovery intent, writes during backfill, and keyword search plus capture during recovery quarantine. `--dependencies /path/to/node_modules` reuses cached dependencies for offline runs; it does not establish clean-install compatibility.

## Verification

Validation used main `ab3e4efd282659b87d31b36c8514c6bc6b871f0b` as the baseline and an installed package built from the fix branch. Synthetic records and a deterministic local embedding fixture exercised persistence, not semantic retrieval quality.

- The baseline lost long source tails and had zero recovered vectors before its first scheduled checkpoint. The fixed package retained all 20 source records and vectors after a completed checkpoint, a six-second storage-persistence opportunity, and forced worker/service termination.
- Embedding requests stayed at 21 across restart: 20 captures and one search. The ordinary search response stayed at 4,288 wire bytes on both builds; capture hooks emitted no context.
- A 1,000-record import remained readable with explicit truncation. Three subsequent live captures preserved their summaries, truncated one source to the remaining allowance, and omitted the other two sources. Two concurrent 600-record imports remained readable as a 1,200-record session, with source omissions reported for the exhausted budget.
- The full suite passed 2,099 tests with one skipped; build and skill validation passed. Type checking reported the same 29 existing diagnostics as the baseline, with none added.

The initial 20-record fixed fixture used 156,762 bytes of state files versus 41,682 bytes on the baseline. Combined worker/service RSS after restart was 181,488 KiB versus 180,032 KiB. These are point measurements, not capacity or CPU benchmarks; the disk difference includes both retained source and saved vectors.
