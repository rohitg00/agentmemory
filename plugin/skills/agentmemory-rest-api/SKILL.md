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

# For this fixed loopback URL only. Do not print the value or enable shell tracing.
agentmemory_secret="${AGENTMEMORY_SECRET:-$(cat "$HOME/.agentmemory/secret")}"
test -n "$agentmemory_secret" || exit 1

# save
curl -fsS -X POST http://localhost:3111/agentmemory/remember \
  -H "Authorization: Bearer $agentmemory_secret" \
  -H "Content-Type: application/json" \
  -d '{"content":"chose JWT refresh rotation","concepts":["jwt-refresh-rotation"]}'

# recall
curl -fsS -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Authorization: Bearer $agentmemory_secret" \
  -H "Content-Type: application/json" \
  -d '{"query":"auth token strategy","limit":5}'
```

## Auth

Protected endpoints require bearer authentication by default, including localhost. Liveness is public. The example uses an explicit environment secret or the generated local secret file; if the daemon uses a secret from its `.env`, load that value locally without displaying it. For a remote daemon, require an explicit credential for that endpoint and HTTPS. Never forward a local-file secret or follow an authenticated redirect to another host. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Conventions

- Save returns `201`, reads return `200`, validation errors return `400`.
- Use documented fields only. A successful response does not prove an unsupported field was applied.
- The REST port defaults to `3111` and is configurable with `--port` or `--instance`. The viewer defaults to `3113`; the internal engine WebSocket defaults to `49134`.

## See also

- agentmemory-mcp-tools for the MCP equivalents.
- agentmemory-config for local configuration and the secret.

## Reference

The full endpoint list with methods lives in REFERENCE.md, generated from `src/triggers/api.ts`.
