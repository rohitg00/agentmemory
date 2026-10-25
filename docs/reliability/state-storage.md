# State storage

AgentMemory stores sessions, observations, memories and related records in a file-backed key-value store by default. Redis is an optional backend. `agentmemory status` and the viewer's Health page report the active backend and whether it responds, without exposing its connection URL.

## File storage

The default store holds records in memory and periodically writes them to `state_store.db` under the selected data directory. CLI and Docker deployments use a two-second save interval. `AGENTMEMORY_STATE_SAVE_INTERVAL_MS` changes that interval, from 100 to 3,600,000 milliseconds.

An accepted write is not necessarily on disk yet. Capture clients retain acknowledged events for the configured save interval plus a safety margin and replay them after a restart when needed. This does not establish power-loss durability for every API write. Stop AgentMemory cleanly before taking a filesystem backup, and preserve the entire data directory.

## Redis

For a CLI installation, add these settings to `~/.agentmemory/.env`, then restart AgentMemory:

```env
AGENTMEMORY_STATE_BACKEND=redis
AGENTMEMORY_REDIS_URL=redis://localhost:6379/0
```

`AGENTMEMORY_STATE_BACKEND` accepts `file` or `redis`; an unknown value stops startup. Redis requires a connection URL. See the [deployment guide](../../deploy/README.md) for Docker configuration.

- **Transport:** the pinned state worker supports plain `redis://`, not `rediss://`. Use a local/private network or an encrypted tunnel for a TLS-only service. Percent-encode reserved characters in URL credentials.
- **Isolation:** give each AgentMemory instance its own Redis database or server. Application locks coordinate one process, not multiple instances sharing a database.
- **Persistence:** configure Redis persistence for the loss window you can tolerate. Enable AOF with `appendonly yes` when snapshot-only persistence is insufficient. Acknowledging a write does not guarantee it has been flushed to disk.
- **Retention:** use `maxmemory-policy noeviction`. Eviction policies can silently discard memories when Redis reaches its memory limit.
- **Credentials:** use a restricted Redis ACL user. The data directory and generated worker configuration can contain the URL, including credentials; restrict their permissions and do not commit or share them.

Redis stores each scope as a hash. Listing a scope reads the whole hash, so Redis does not make large scope reads bounded or a single worker connection parallel. AgentMemory orders Redis results by record creation time, with timestamp and ID fallbacks. Supported partial updates use a local per-key lock to preserve values such as `tags: []`. Legacy audit migration reads Redis records instead of inspecting files.

Viewer updates use the AgentMemory SSE endpoint. They do not use Redis pub/sub. A Redis outage affects state reads and writes; status reports an unavailable state store.

## Moving between backends

Changing `AGENTMEMORY_STATE_BACKEND` selects the target backend's existing data. It does not copy or delete the old backend. A new target starts empty.

Pause capture and other writes during migration. Keep a backup of the original backend until you have checked the destination. Export/import transfers the supported memory and session collections; it is not a replacement for a full backup of credentials and operational state.

Run the following commands in a new private directory. They require `curl` and `jq` and work in bash or zsh. They use the local daemon on port 3111 and read its generated secret from `~/.agentmemory/secret`. If you configured an explicit secret, set `AGENTMEMORY_SECRET` in the shell to the same value. Do not enable shell tracing while running them.

While the old backend is still running, export and validate the backup:

```sh
(
  set -eu
  umask 077
  agentmemory_secret=${AGENTMEMORY_SECRET:-$(cat "$HOME/.agentmemory/secret")}
  test -n "$agentmemory_secret"
  curl -fsS -H "Authorization: Bearer $agentmemory_secret" \
    http://127.0.0.1:3111/agentmemory/export > backup.json
  jq -e '
    (.version | type == "string") and
    (.exportedAt | type == "string") and
    (.sessions | type == "array") and
    (.memories | type == "array") and
    (.summaries | type == "array") and
    (.observations | type == "object") and
    (.pagination == null) and (.collectionPagination == null)
  ' backup.json > /dev/null
)
```

Continue only after that block exits successfully. Stop AgentMemory, update the backend settings, and start it again. Import into the new backend:

```sh
(
  set -eu
  umask 077
  agentmemory_secret=${AGENTMEMORY_SECRET:-$(cat "$HOME/.agentmemory/secret")}
  test -n "$agentmemory_secret"
  jq -n --slurpfile data backup.json \
    '{exportData: $data[0], strategy: "merge"}' > import.json
  curl -fsS -H "Authorization: Bearer $agentmemory_secret" \
    -H 'Content-Type: application/json' \
    --data-binary @import.json \
    http://127.0.0.1:3111/agentmemory/import > import-result.json
  jq -e '.success == true' import-result.json > /dev/null
)
```

Check `import-result.json`, confirm representative old memories are recalled, and allow the configured persistence window before testing a restart. Keep the export private: it contains memory contents. Once verified, resume capture and writes.

For larger stores, `/agentmemory/export` accepts `maxSessions` and `offset` for sessions; `collectionLimit` and `collectionOffset` for other collections; and `collections` for a named subset. Collect every page before switching backends and import each with `merge`. The single-export validation above deliberately rejects paginated or selected exports. Import also supports `skip` and `replace`; `replace` requires a complete export and deletes destination records.
