FROM node:22-slim

ARG AGENTMEMORY_VERSION=0.9.12
ARG III_VERSION=0.11.2

ENV AGENTMEMORY_REQUIRE_HTTPS=1 \
    AGENTMEMORY_HMAC_FILE=/data/.hmac \
    AGENTMEMORY_DATA_DIR=/data

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(uname -m) \
 && case "$ARCH" in \
      x86_64)  III_TAR=iii-x86_64-unknown-linux-gnu.tar.gz ;; \
      aarch64) III_TAR=iii-aarch64-unknown-linux-gnu.tar.gz ;; \
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/iii-hq/iii/releases/download/iii/v${III_VERSION}/${III_TAR}" \
    | tar -xz -C /usr/local/bin/ \
 && chmod +x /usr/local/bin/iii

RUN npm install -g "@agentmemory/agentmemory@${AGENTMEMORY_VERSION}" --omit=optional --no-fund --no-audit

RUN mkdir -p /data && chown -R node:node /data

COPY --chmod=0755 --chown=node:node entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

USER node:node

EXPOSE 3111

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3111/agentmemory/livez || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
