ARG III_VERSION=0.11.2

FROM iiidev/iii:${III_VERSION} AS iii-image

FROM node:22-slim

ARG AGENTMEMORY_VERSION=0.9.29
ARG III_VERSION=0.11.2
ARG III_SDK_VERSION=0.11.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii

WORKDIR /opt/agentmemory
RUN [ "${III_VERSION}" = "${III_SDK_VERSION}" ] \
 || { echo "III_VERSION=${III_VERSION} and III_SDK_VERSION=${III_SDK_VERSION} must be the same release: the agentmemory worker speaks the wire protocol of the engine it was built against, so override both together" >&2; exit 1; }
RUN printf '{"name":"agentmemory-deploy","version":"1.0.0","private":true,"overrides":{"iii-sdk":"%s"}}\n' "${III_SDK_VERSION}" > package.json \
 && npm install "@agentmemory/agentmemory@${AGENTMEMORY_VERSION}" --omit=optional --no-fund --no-audit \
 && ln -s /opt/agentmemory/node_modules/.bin/agentmemory /usr/local/bin/agentmemory

ENV AGENTMEMORY_III_VERSION=${III_VERSION} \
    TINI_SUBREAPER=1

COPY --chmod=0755 entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3111/agentmemory/livez || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
