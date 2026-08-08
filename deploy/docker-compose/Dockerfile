# Build stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

# Final stage
FROM iiidev/iii:0.11.2 AS iii-image

FROM node:22-slim
WORKDIR /opt/agentmemory
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=iii-image /app/iii /usr/local/bin/iii
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Symlink so `agentmemory` works globally
RUN ln -s /opt/agentmemory/dist/cli.mjs /usr/local/bin/agentmemory \
 && chmod +x /opt/agentmemory/dist/cli.mjs

ENV AGENTMEMORY_III_VERSION=0.11.2 \
    TINI_SUBREAPER=1

COPY deploy/docker-compose/entrypoint.sh /usr/local/bin/agentmemory-entrypoint.sh
RUN chmod 0755 /usr/local/bin/agentmemory-entrypoint.sh

EXPOSE 3111

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3111/agentmemory/livez || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/agentmemory-entrypoint.sh"]
