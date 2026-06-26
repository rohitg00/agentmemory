#!/bin/sh
# agentmemory first-boot entrypoint.
#
# Runs as root so it can:
#   1. Overwrite the npm-bundled iii-config.yaml (which binds 127.0.0.1
#      and uses relative ./data paths) with a deploy-tuned version that
#      binds 0.0.0.0 and uses absolute /data paths.
#   2. chown the host-mounted /data volume to the runtime user (a fresh
#      bind mount or named volume is root-owned by default).
#   3. Generate the HMAC secret on first boot and persist it to
#      /data/.hmac (chmod 600) so the secret survives restarts.
#
# Then it execs the agentmemory CLI under gosu as the unprivileged
# `node` user.

set -eu

DATA_DIR="${AGENTMEMORY_DATA_DIR:-/data}"
HMAC_FILE="${AGENTMEMORY_HMAC_FILE:-/data/.hmac}"
RUN_AS="node:node"
III_CONFIG="/opt/agentmemory/node_modules/@agentmemory/agentmemory/dist/iii-config.yaml"

mkdir -p "$DATA_DIR"
# Skip the recursive walk once /data is already node-owned (a freshly created
# bind mount or named volume is root-owned; subsequent boots aren't) — avoids
# adding restart latency proportional to volume size on every boot.
if [ "$(stat -c '%U' "$DATA_DIR")" != "node" ]; then
  chown -R "$RUN_AS" "$DATA_DIR"
fi

cat > "$III_CONFIG" <<'EOF'
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
          file_path: /data/state_store.db
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
          file_path: /data/stream_store
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
chown "$RUN_AS" "$III_CONFIG"

if [ ! -s "$HMAC_FILE" ]; then
  SECRET="$(openssl rand -hex 32)"
  umask 077
  printf '%s\n' "$SECRET" > "$HMAC_FILE"
  chmod 600 "$HMAC_FILE"
  chown "$RUN_AS" "$HMAC_FILE"
  echo "================================================================"
  echo "agentmemory: generated HMAC secret on first boot"
  echo "AGENTMEMORY_SECRET=$SECRET"
  echo "Copy this value now. It will not be printed again."
  echo "Stored at: $HMAC_FILE (chmod 600)"
  echo "To rotate: delete $HMAC_FILE on the persistent volume and restart."
  echo "================================================================"
fi

AGENTMEMORY_SECRET="$(cat "$HMAC_FILE")"
export AGENTMEMORY_SECRET

# Unlike the managed-platform templates (which detect their own platform env
# vars to decide this automatically), a generic self-hosted box has no such
# signal — so this is opt-in only, never auto-detected. The viewer stays
# safe-by-default (127.0.0.1-only, per the npm package's own default) unless
# the operator explicitly sets AGENTMEMORY_VIEWER_HOST themselves (e.g. in
# docker-compose.yml's `environment:` block) to reach it from another host on
# the LAN or through a reverse proxy. If you do this, VIEWER_ALLOWED_HOSTS is
# mandatory too (the viewer refuses non-loopback binds without an explicit
# Host-header allowlist) — see this template's README for the exact gotcha
# you'll hit if a reverse proxy sits in front (nginx's $host variable strips
# the port, which breaks the allowlist match; use $http_host instead).
if [ -n "${AGENTMEMORY_VIEWER_HOST:-}" ]; then
  export AGENTMEMORY_VIEWER_HOST
  export VIEWER_ALLOWED_HOSTS="${VIEWER_ALLOWED_HOSTS:-}"
fi

exec gosu "$RUN_AS" agentmemory "$@"
