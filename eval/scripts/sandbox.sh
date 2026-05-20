#!/usr/bin/env bash
# Boot a sandboxed agentmemory + iii-engine on alt ports with a clean data dir,
# so eval runs aren't polluted by (and don't pollute) your real ~/.agentmemory.
# Source it: `source eval/scripts/sandbox.sh` then run eval scripts;
# the sandbox is torn down on EXIT.

set -euo pipefail

SANDBOX_ROOT="${SANDBOX_ROOT:-/tmp/agentmemory-eval-sandbox}"
SANDBOX_PORT="${SANDBOX_PORT:-3411}"
SANDBOX_STREAM_PORT="${SANDBOX_STREAM_PORT:-3412}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! command -v iii >/dev/null 2>&1; then
  echo "iii binary not on PATH. Install pinned version:"
  echo "  curl -fsSL https://github.com/iii-hq/iii/releases/download/iii/v0.11.2/iii-aarch64-apple-darwin.tar.gz | tar -xz -C ~/.local/bin"
  exit 1
fi

iii_ver=$(iii --version 2>&1 | head -1)
if [[ "$iii_ver" != "0.11.2" ]]; then
  echo "warning: iii version on PATH is $iii_ver; agentmemory pins 0.11.2"
fi

if [[ ! -f "$REPO_ROOT/dist/index.mjs" ]]; then
  echo "dist/ missing. Run: npm run build" >&2
  exit 1
fi

if [[ -z "${SANDBOX_ROOT:-}" || "$SANDBOX_ROOT" == "/" || "$SANDBOX_ROOT" != /tmp/* ]]; then
  echo "refusing to wipe SANDBOX_ROOT='$SANDBOX_ROOT' — must be non-empty and under /tmp/" >&2
  exit 1
fi
rm -rf "$SANDBOX_ROOT"
mkdir -p "$SANDBOX_ROOT/data" "$SANDBOX_ROOT/.agentmemory"

cat > "$SANDBOX_ROOT/iii-config.yaml" <<EOF
workers:
  - name: iii-http
    config:
      port: $SANDBOX_PORT
      host: 127.0.0.1
      default_timeout: 180000
      cors:
        allowed_origins: ["http://localhost:$SANDBOX_PORT", "http://127.0.0.1:$SANDBOX_PORT"]
        allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]
  - name: iii-state
    config:
      adapter:
        name: kv
        config:
          store_method: file_based
          file_path: $SANDBOX_ROOT/data/state_store.db
  - name: iii-queue
    config:
      adapter:
        name: builtin
  - name: iii-pubsub
    config:
      adapter:
        name: local
  - name: iii-cron
    config:
      adapter:
        name: kv
  - name: iii-stream
    config:
      port: $SANDBOX_STREAM_PORT
      host: 127.0.0.1
      adapter:
        name: kv
        config:
          store_method: file_based
          file_path: $SANDBOX_ROOT/data/stream_store
  - name: iii-observability
    config:
      enabled: true
      service_name: agentmemory-eval
      exporter: memory
      sampling_ratio: 1.0
      metrics_enabled: true
      logs_enabled: false
      logs_console_output: false
  - name: iii-exec
    config:
      exec:
        - node $REPO_ROOT/dist/index.mjs
EOF

cd "$SANDBOX_ROOT"
HOME="$SANDBOX_ROOT" iii --config "$SANDBOX_ROOT/iii-config.yaml" > "$SANDBOX_ROOT/iii.log" 2>&1 &
SANDBOX_PID=$!

cleanup() {
  echo "tearing down sandbox (pid $SANDBOX_PID)"
  kill "$SANDBOX_PID" 2>/dev/null || true
  sleep 1
  kill -9 "$SANDBOX_PID" 2>/dev/null || true
}
trap cleanup EXIT

# wait for livez
for i in $(seq 1 30); do
  if curl -sS --max-time 1 "http://localhost:$SANDBOX_PORT/agentmemory/livez" 2>/dev/null | grep -q '"status":"ok"'; then
    export AGENTMEMORY_BASE_URL="http://localhost:$SANDBOX_PORT"
    echo "sandbox ready: $AGENTMEMORY_BASE_URL"
    echo "  state: $SANDBOX_ROOT/data/"
    echo "  logs:  $SANDBOX_ROOT/iii.log"
    return 0 2>/dev/null || exit 0
  fi
  sleep 1
done

echo "sandbox failed to come up within 30s. last log lines:" >&2
tail -10 "$SANDBOX_ROOT/iii.log" >&2
exit 1
