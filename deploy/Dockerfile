# Shared build for local Compose and every deployment platform.
# Update these four pins together when promoting the runtime.
ARG III_VERSION=0.25.1
ARG STATE_VERSION=0.22.22
ARG HTTP_VERSION=0.22.8

FROM node:24-slim AS agent-build
ARG III_VERSION
WORKDIR /opt/agentmemory
COPY package.json ./package.json
RUN npm install --no-fund --no-audit --package-lock=false
COPY . .
RUN npm run build \
 && npm prune --omit=dev --no-fund --no-audit \
 && node scripts/deploy/prune-onnx.mjs

FROM iiidev/iii:${III_VERSION} AS iii-engine

FROM node:24-slim
ARG III_VERSION
ARG STATE_VERSION
ARG HTTP_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates gosu tini \
 && apt-get clean \
 && find /var/lib/apt/lists -mindepth 1 -delete

COPY --from=iii-engine /app/iii /usr/local/bin/iii
RUN iii --version 2>&1 | tr -s " \t" "\n" | grep -qxF "${III_VERSION}" \
 || { echo "iiidev/iii:${III_VERSION} does not contain iii ${III_VERSION}" >&2; exit 1; }

WORKDIR /opt/agentmemory
RUN chown node:node /opt/agentmemory
COPY --from=agent-build --chown=node:node /opt/agentmemory/package.json ./package.json
COPY --from=agent-build --chown=node:node /opt/agentmemory/node_modules ./node_modules
# npm can silently skip failed optional installs; local embeddings must load in the final image.
RUN node --input-type=module -e "await import('@huggingface/transformers')"
COPY --from=agent-build --chown=node:node /opt/agentmemory/dist ./dist
COPY --chown=node:node --chmod=644 deploy/runtime/agentmemory.worker.yaml /opt/agentmemory/iii.worker.yaml
COPY --chown=node:node --chmod=644 deploy/runtime/worker-compose.yaml /opt/agentmemory/worker-compose.yaml
COPY --chmod=0755 deploy/runtime/entrypoint.sh /usr/local/bin/agentmemory-entrypoint

ENV III_VERSION=${III_VERSION} \
    STATE_VERSION=${STATE_VERSION} \
    HTTP_VERSION=${HTTP_VERSION} \
    AGENTMEMORY_DATA_DIR=/data \
    HOME=/data/home \
    III_COMPOSE_STATE_DIR=/data/compose-state \
    III_ENGINE_PORT=49134 \
    III_REST_PORT=3111 \
    III_VIEWER_PORT=3113 \
    III_TELEMETRY_ENABLED=false \
    MALLOC_ARENA_MAX=2

EXPOSE 3111 3113

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3111/agentmemory/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint"]
