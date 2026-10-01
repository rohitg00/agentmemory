ARG III_VERSION=0.11.2

ARG III_IMAGE_DIGEST=sha256:15f8d4ed16c0bec350b98f4e18ed04498b1fc5ccc50585e087b736717300cf26
FROM iiidev/iii:${III_VERSION}@${III_IMAGE_DIGEST} AS iii-image

FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

ARG AGENTMEMORY_VERSION=0.9.29
ARG III_VERSION=0.11.2
ARG III_SDK_VERSION=0.11.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii
RUN iii --version 2>&1 | grep -qF "${III_VERSION}" \
 || { echo "the iiidev/iii image pinned by III_IMAGE_DIGEST is not III_VERSION=${III_VERSION}: override III_IMAGE_DIGEST together with III_VERSION (docker buildx imagetools inspect iiidev/iii:${III_VERSION})" >&2; exit 1; }

# Install agentmemory into a dedicated prefix so the local package.json's
# `overrides` field pins iii-sdk to the exact engine release in this image
# (the worker speaks that engine's wire protocol, so the two must match).
# `npm install -g` ignores overrides, hence the local prefix.
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

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
