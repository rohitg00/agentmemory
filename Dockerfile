# syntax=docker/dockerfile:1
ARG NODE_VERSION=22-slim
ARG III_VERSION=0.11.2

FROM iiidev/iii:${III_VERSION} AS iii-image

FROM node:${NODE_VERSION} AS builder
WORKDIR /build

COPY package.json tsdown.config.ts tsconfig.json ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY src/ src/
COPY iii-config.yaml iii-config.docker.yaml ./
RUN npm run build

FROM node:${NODE_VERSION}
ARG III_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl openssl tini tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii

WORKDIR /opt/agentmemory
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/iii-config.yaml /build/iii-config.docker.yaml ./
COPY --from=builder /build/package.json ./

# iii-sdk caret range would otherwise resolve newer than the pinned engine.
RUN node -e "const p=require('./package.json'); p.overrides=Object.assign({},p.overrides,{'iii-sdk':process.env.III_VERSION}); require('fs').writeFileSync('package.json',JSON.stringify(p,null,2));" \
 && III_VERSION="${III_VERSION}" npm install --omit=dev --legacy-peer-deps --no-audit --no-fund \
 && ln -s /opt/agentmemory/dist/cli.mjs /usr/local/bin/agentmemory \
 && mkdir -p /data \
 && chown -R node:node /data /opt/agentmemory

ENV AGENTMEMORY_III_VERSION=${III_VERSION} \
    AGENTMEMORY_DATA_DIR=/data \
    AGENTMEMORY_HMAC_FILE=/data/.hmac \
    AGENTMEMORY_VIEWER_HOST=0.0.0.0 \
    NODE_ENV=production \
    TINI_SUBREAPER=1

COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111 3112 3113
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3111/agentmemory/livez || exit 1

USER node:node

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
