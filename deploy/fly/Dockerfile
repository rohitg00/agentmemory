ARG III_VERSION=0.11.2

FROM iiidev/iii:${III_VERSION} AS iii-image

# Builder stage: packs this branch's checked-out source into an npm
# tarball at image-build time. The Dockerfile previously installed the
# published `@agentmemory/agentmemory@${AGENTMEMORY_VERSION}` npm package,
# which can't ship a fork patch until it's released upstream; an interim
# local workaround (a manually-built, untracked tarball) covered that gap
# but had no build-time check that it matched the checked-out source — a
# fresh checkout with no local tarball would break, and a source change
# with no tarball rebuild would silently ship stale code. Build context is
# the repo root (see deploy/fly/README.md), so this stage sees the same
# source tree `npm run build` would use locally.
FROM node:22-slim AS builder
WORKDIR /build
# deploy/fly/package-lock.json is a lockfile scoped ONLY to this build
# context, committed despite the repo-wide no-lockfile policy (see the
# .gitignore exception) so this stage gets a reproducible dependency tree
# instead of re-resolving semver ranges on every build. Regenerate it
# deliberately (npm install --package-lock-only against the root
# package.json) whenever a dependency is intentionally bumped.
COPY package.json deploy/fly/package-lock.json ./
RUN npm ci
COPY tsconfig.json tsdown.config.ts ./
COPY src/ ./src/
COPY plugin/ ./plugin/
COPY iii-config.yaml iii-config.docker.yaml docker-compose.yml .env.example LICENSE README.md AGENTS.md ./
RUN npm run build && mkdir -p /build/out && npm pack --pack-destination /build/out

FROM node:22-slim

ARG III_VERSION=0.11.2
ARG III_SDK_VERSION=0.11.2

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii

# Install agentmemory into a dedicated prefix so the local package.json's
# `overrides` field pins iii-sdk down to match the engine (agentmemory's
# caret range `^0.11.2` otherwise resolves to 0.11.6, the version that
# requires the new sandbox-everything worker model the agentmemory CLI
# is not refactored for yet). `npm install -g` ignores overrides, hence
# the local prefix.
WORKDIR /opt/agentmemory
COPY --from=builder /build/out/*.tgz /opt/agentmemory/agentmemory.tgz
RUN printf '{"name":"agentmemory-deploy","version":"1.0.0","private":true,"overrides":{"iii-sdk":"%s"}}\n' "${III_SDK_VERSION}" > package.json \
 && npm install ./agentmemory.tgz --omit=optional --no-fund --no-audit \
 && ln -s /opt/agentmemory/node_modules/.bin/agentmemory /usr/local/bin/agentmemory

ENV AGENTMEMORY_III_VERSION=${III_VERSION} \
    TINI_SUBREAPER=1

COPY --chmod=0755 deploy/fly/entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
