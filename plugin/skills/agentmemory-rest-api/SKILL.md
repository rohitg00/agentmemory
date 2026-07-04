---
name: agentmemory-rest-api
description: The agentmemory HTTP REST API surface, the primary protocol for talking to the memory server. Use when calling agentmemory over HTTP, when MCP is unavailable and you need a fallback, or when integrating a host that does not speak MCP.
user-invocable: false
---

REST is agentmemory's primary surface. MCP is a bridge on top of it. Every memory operation has an HTTP endpoint under `http://localhost:3111/agentmemory/*`.

## Quick start

```bash
# liveness
curl -fsS http://localhost:3111/agentmemory/livez

# save
curl -X POST http://localhost:3111/agentmemory/remember \
  -H "Content-Type: application/json" \
  -d '{"content":"chose JWT refresh rotation","concepts":["jwt-refresh-rotation"]}'

# recall
curl -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Content-Type: application/json" \
  -d '{"query":"auth token strategy","limit":5}'
```

## Auth

By default localhost is open and no auth is needed. When `AGENTMEMORY_SECRET` is set, every request needs `Authorization: Bearer $AGENTMEMORY_SECRET`. See agentmemory-config.

## Conventions

- Save returns `201`, reads return `200`, validation errors return `400`.
- Handlers whitelist body fields and drop unknown ones, so passing extra keys is safe but ignored.
- The port is configurable with `--port` or `--instance`; streams, viewer, and engine derive from it.

## See also

- agentmemory-mcp-tools for the MCP equivalents.
- agentmemory-config for the port quartet and the secret.

## Reference

The full endpoint list with methods lives in REFERENCE.md, generated from `src/triggers/api.ts`.
