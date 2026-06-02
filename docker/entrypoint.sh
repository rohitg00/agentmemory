#!/bin/sh
set -eu

# Subcommands that don't need /data — bypass setup.
case "${1:-}" in
  mcp|status|doctor|demo|import-jsonl|help|--help|-h|--version|-V)
    HMAC_FILE="${AGENTMEMORY_HMAC_FILE:-${AGENTMEMORY_DATA_DIR:-/data}/.hmac}"
    if [ -z "${AGENTMEMORY_SECRET:-}" ] && [ -s "$HMAC_FILE" ]; then
      AGENTMEMORY_SECRET="$(cat "$HMAC_FILE")"
      export AGENTMEMORY_SECRET
    fi
    exec agentmemory "$@"
    ;;
esac

DATA_DIR="${AGENTMEMORY_DATA_DIR:-/data}"
HMAC_FILE="${AGENTMEMORY_HMAC_FILE:-${DATA_DIR}/.hmac}"
III_CONFIG="/opt/agentmemory/dist/iii-config.yaml"

mkdir -p "$DATA_DIR" 2>/dev/null || true
if [ ! -w "$DATA_DIR" ]; then
  echo "$DATA_DIR not writable by uid $(id -u). Set fsGroup: 1000 (K8s) or chown the volume to 1000:1000." >&2
  exit 1
fi

cat > "$III_CONFIG" <<EOF
workers:
  - name: iii-http
    config:
      port: 3111
      host: 0.0.0.0
      default_timeout: 180000
      cors:
        allowed_origins:
          - "http://localhost:3111"
          - "http://localhost:3113"
          - "http://127.0.0.1:3111"
          - "http://127.0.0.1:3113"
        allowed_methods: [GET, POST, PUT, DELETE, OPTIONS]
  - name: iii-state
    config:
      adapter:
        name: kv
        config:
          store_method: file_based
          file_path: ${DATA_DIR}/state_store.db
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
      port: 3112
      host: 0.0.0.0
      adapter:
        name: kv
        config:
          store_method: file_based
          file_path: ${DATA_DIR}/stream_store
  - name: iii-observability
    config:
      enabled: true
      service_name: agentmemory
      exporter: memory
      sampling_ratio: 1.0
      metrics_enabled: true
      logs_enabled: true
      logs_console_output: true
EOF

if [ ! -s "$HMAC_FILE" ] && [ -z "${AGENTMEMORY_SECRET:-}" ]; then
  umask 077
  openssl rand -hex 32 > "$HMAC_FILE"
  chmod 600 "$HMAC_FILE"
  echo "agentmemory: generated HMAC secret at $HMAC_FILE (chmod 600). Delete and restart to rotate." >&2
fi

if [ -z "${AGENTMEMORY_SECRET:-}" ] && [ -s "$HMAC_FILE" ]; then
  AGENTMEMORY_SECRET="$(cat "$HMAC_FILE")"
  export AGENTMEMORY_SECRET
fi

exec agentmemory "$@"
