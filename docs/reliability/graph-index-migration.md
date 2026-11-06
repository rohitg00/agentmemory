# Bounded graph indexes and legacy migration

Graph retrieval uses generation-scoped indexes maintained with canonical graph writes. Startup, graph search and graph-index status do not list legacy node, edge or history scopes. Any uninitialized store without an index, including a fresh installation, reports `needs-migration`; keyword search, vector search and capture remain available. Missing metadata cannot prove a store is empty without a scan, so the initialization command below is explicit for both fresh and existing stores.

Inspect the selected server without starting it or modifying graph data:

```sh
agentmemory graph-index status --json
```

To build indexes for existing graph data, schedule a maintenance window and explicitly authorize discovery:

```sh
agentmemory graph-index migrate --allow-legacy-scan --json
```

**Initial discovery is not bounded.** The pinned engine cannot paginate its state listings. Migration reads each complete legacy node, edge and history scope once, including full record values. Large stores can consume substantial memory and delay other requests during those reads. An HTTP timeout does not cancel an engine allocation already in progress. No ordinary search, status request or startup silently authorizes this scan.

The command returns a job ID after saving its intent. It runs in the background in an isolated index build within the current graph generation; canonical records are preserved. Capture, imports, mesh updates, temporal changes and snapshot restores maintain that build while migration runs. Status reports discovered and processed totals, readiness and partial coverage.

Discovery writes an ID manifest with at most 128 entries and 32 KiB per page, then seals it. The build rereads each current canonical record under the graph writer lock before updating its index, and saves progress after the index write. Replaying an interrupted cursor is idempotent. Writes made after discovery are also indexed, and records removed during migration are not resurrected.

After a restart, a sealed manifest resumes without listing a legacy scope or reading the old snapshot. If a pending legacy graph transaction needs snapshot recovery, the job pauses until you run an explicit resume. If that transaction has no recoverable journal, start a new `migrate --allow-legacy-scan` build. To resume immediately:

```sh
agentmemory graph-index resume --json
```

If discovery did not finish, startup does not resume it. After an unclean shutdown the saved state can still say `discovering`; the status action explains how to continue. Repeating discovery needs fresh, explicit consent:

```sh
agentmemory graph-index resume --allow-legacy-scan --json
```

A sealed build with a missing control cannot resume; it requires a new explicit migration so orphaned journals are never reused. A corrupt derived index control can be replaced by a new explicit `migrate --allow-legacy-scan` build. Storage failures do not authorize replacement. Missing or corrupt manifest pages stop the build before publication. Restore the saved manifest before resuming. A paused index caused by an unsupported canonical ID requires repairing the source record and starting `migrate --allow-legacy-scan` again. Graph reset or replacement supersedes an older migration; its late writes stay in the old generation. Reset deliberately clears the logical graph and is not a migration shortcut.

Progress and recovery journals use the configured state backend. An acknowledged state write is not a filesystem flush guarantee: the engine's persistence window still applies. Crash recovery tests wait for the sealed manifest to reach disk before terminating the worker and engine. They do not establish power-loss atomicity across separate state scopes.

Oversized source fields remain in canonical storage. Bounded projections record partial coverage when they cannot represent a field fully, and status exposes the affected record count. A ready index with partial coverage does not claim every graph fact is searchable. Search budgets and pagination can also truncate a request; callers should check its graph diagnostics.

Indexes add storage and write overhead. A replacement build isolates previous derived records by build ID; it does not reclaim their disk space. Repeated rebuilds and graph generations can therefore accumulate retained data. Bounded records and reads do not imply bounded total storage.

The CLI honors `AGENTMEMORY_URL`, local `--port` and `--instance` selection, and the existing credential resolution. Named instances sharing a home directory share its saved API credential by default. To use separate credentials, set a different `AGENTMEMORY_SECRET` for each instance and its clients, or use separate home directories. Equivalent authenticated endpoints are `GET /agentmemory/graph/index`, `POST /agentmemory/graph/index/migrate`, and `POST /agentmemory/graph/index/resume`. Mutation bodies accept only the boolean `allowLegacyScan` flag. Repeated start requests join the running job. Use one AgentMemory graph worker per state store; the writer lock coordinates operations within that worker.

The local packaged gate runs the installed CLI against the pinned native engine. It checks separate data directories for named instances sharing a home with explicit separate credentials, and generated credentials across separate homes:

```sh
npm run test:graph-index:packaged -- --tarball /path/to/agentmemory.tgz --engine /path/to/iii
```

It starts with 100 nodes and 300 edges. Use `--nodes 1000` for a larger run after checking the smaller run's timing and graph scope file sizes. `--dependencies /path/to/node_modules` explicitly reuses cached dependencies without modifying the archive or installed CLI. The report distinguishes that mode from a fresh dependency installation. It records native migration throughput, disk sizes, bounded read latency and wire requests, and tests sealed crash recovery, writer reconciliation, credential isolation and restart recall using synthetic memories with model calls disabled.
