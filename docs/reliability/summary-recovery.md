# Session summary recovery

Capture acknowledgement confirms that an observation was stored. Compression and session summarization can finish later. A completed session can therefore temporarily have a summary that does not include its latest processed observation.

Session close records durable summary work before dispatching background processing. The worker checks that work at startup and every 30 seconds, including when idle-session finalization is disabled. Recovery retries pending compression through the existing compression functions, then refreshes the summary. Provider failures retain the work for another attempt with bounded backoff. Missing source remains pending because the worker cannot reconstruct evidence that was never retained.

A new observation delivered after session completion schedules summary repair without requiring another session-end event. With idle finalization enabled, the session reopens until it becomes idle again; when disabled, it stays completed. Replaying an already stored capture ID leaves the observation and summary unchanged. Repair does not repeat graph extraction or consolidation.

Summary coverage includes the ordered observation contents and session identity. New observations with older or identical timestamps and changes to existing observations invalidate that coverage. Model work runs outside the observation lock; publication checks the source again under the lock. A stale result cannot replace a summary for observations or a session that changed while the model was running. Partial chunk output does not count as complete coverage.

Older summaries without coverage metadata are rebuilt on their next summarize request. The recovery worker processes recorded repair work; it does not automatically scan all historical sessions.

Recovery runs at most two sessions concurrently per worker. Completed, unchanged work does not make another model call. These limits and locks coordinate one worker; they are not distributed locks for multiple workers sharing a state store. Recovery can use the configured model and incur its normal usage costs.

## Packaged runtime check

```sh
npm run test:summary-recovery:packaged -- --out /tmp/summary-recovery-check
```

Use a new or empty output directory. The gate builds and packs the CLI, extracts the archive into an isolated home, and uses cached dependencies and a matching cached native iii engine. Supply `--engine /path/to/iii` when the engine is not in the release-gate cache. `--tarball` checks an existing archive; `--skip-build` packs an already built checkout.

The gate uses a deterministic model server on loopback. It checks interrupted compression, failed summaries, late replay, duplicate delivery, two daemon-and-engine restarts, and unchanged package contents. Recovery must succeed without another session-end, summarize, or retry request. Receipts include request traces, before/after exports, archive hashes, and port cleanup results. This is a packaged native-runtime test with cached dependencies, not a clean dependency installation or a live-model conversation test.

The process-loss scenarios allow the engine's ordinary state flush before termination. They verify recovery from persisted work; they do not establish power-loss durability for writes that have not reached storage.
