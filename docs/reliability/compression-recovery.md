# Recovering failed observation compression

LLM compression is optional. With `AGENTMEMORY_AUTO_COMPRESS=true`, capture first stores a searchable synthetic observation with privacy-filtered source. A provider error, invalid response or interrupted worker leaves that observation available for search and records a pending or failed compression state. Capture acknowledgement means the observation was stored; it does not mean model compression succeeded.

Inspect a session before retrying:

```sh
agentmemory compression --session SESSION_ID --json
agentmemory compression --project PROJECT --agent-id AGENT_ID --limit 10
```

Inspection makes no model calls. `--retry` explicitly sends the retained source to the configured model and may incur model usage costs:

```sh
agentmemory compression --session SESSION_ID --retry --json
```

The command uses the running service selected by `AGENTMEMORY_URL`, `--port` or `--instance`, with the same authentication as other CLI requests. It fails if that service is unavailable and does not start a server. Separately, the running worker automatically retries pending compression needed by a persisted [session summary repair](summary-recovery.md), including after restart.

Choose a session or project; a global unscoped retry is rejected. Combining `--session`, `--project` and `--agent-id` narrows the selection. `--limit` defaults to 10 and accepts 1 through 100. Each page scans at most 20 sessions and 1,000 observations. Use the returned `nextCursor` with `--cursor` and the same scope to continue. A page can contain no candidates and still have a cursor.

Unusually long imported identifiers use compact cursor bookmarks. If that bookmark's session or observation is removed, or its session moves out of the selected project before the next page, the result reports `cursor_stale`. Restart without `--cursor`; already recovered observations remain skipped. Cursors track scan positions, not a snapshot of which rows match the agent filter.

Retries run sequentially and stop after the first model failure. A batch stops starting work after 30 seconds; an in-flight attempt can finish within its 60-second deadline, so a batch can take about 90 seconds. Run the command again without a cursor to revisit failed observations. Concurrent requests within one worker for the same observation share the existing attempt; completed observations are skipped on subsequent retries. These locks do not provide distributed coordination between multiple workers writing one state store.

Legacy raw observations are eligible. A failed attempt preserves their original stored payload and adds retry metadata; unavailable source leaves the row unchanged. They remain available to the recovery workflow across restarts and enter search only after successful compression. This differs from new captures, whose sanitized synthetic fallback is already searchable. Success preserves observation IDs, timestamps and session counts, replacing the legacy raw row with a compressed observation and bounded, privacy-filtered source. Recovery never overwrites an observation deleted or changed during the model call, and checks the scope again before committing. The keyword index updates with the stored result; asynchronous vector results also verify the current observation revision.

Model input and source retained after success are bounded to 16 KiB per observation and an 8 MiB source allowance per session, subject to transport headroom. `truncated: true` means the model used only the bounded portion of the evidence. Missing source is reported as `source_unavailable` and is never counted as recovered. A legacy raw row blocked by a full source allowance can be retried after space is freed. Recovery cannot reconstruct evidence already omitted from stored source. Default synthetic observations without a pending or failed compression state are left alone.

The authenticated REST equivalents are:

- `GET /agentmemory/compression?sessionId=SESSION_ID&limit=10`
- `POST /agentmemory/compression/retry` with `{"sessionId":"SESSION_ID","limit":10}`

Both accept `project`, `agentId`, `limit` and `cursor`; at least `sessionId` or `project` is required. Results contain identifiers, status, safe error codes and counts. They do not return retained source or raw provider errors. A retry result with `success: false` exits the CLI with status 1. Inspect `recovered`, `items[].outcome` and `items[].retryable` for each batch; source-unavailable or concurrently changed rows are not model successes.

Responses also obey the engine's 15 MiB payload allowance. If unusually large imported identifiers exceed it, REST returns HTTP 413 with a small error. Lower `--limit` or select one session. Already completed retries are not repeated when you inspect again.
