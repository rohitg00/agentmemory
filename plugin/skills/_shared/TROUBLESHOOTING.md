# Troubleshooting agentmemory skills

Shared recovery steps for all user-invocable agentmemory skills. Each skill's
Troubleshooting section points here instead of duplicating the block.

## "MCP tool not available"

Missing tools can mean a stopped MCP process, a disconnected daemon, or an
explicitly reduced tool surface. Walk these in order:

1. Run `/plugin list` in the host and confirm `agentmemory` shows as enabled.
2. Restart the host. The plugin's `.mcp.json` is only read on startup, so a
   freshly installed or re-enabled plugin will not register tools mid-session.
3. Check `/mcp` and confirm the `agentmemory` server shows a live connection.
4. Check `agentmemory status` and the daemon's `AGENTMEMORY_TOOLS` setting.
   Codex's bundled bridge lists the daemon's enabled tools. The standalone shim
   used by other hosts can fall back to seven basic tools with a separate store.
   Do not claim full daemon functionality based on those seven tools.
5. If `agentmemory connect codex` and the Codex plugin are both enabled, choose
   one MCP connection. Check `/hooks` before adding global hook fallbacks.

An outage or timeout is not an empty search result. Report the failure. A write
may have committed before the response was lost; inspect state before retrying.

## REST fallback

When the MCP tools stay unavailable but the daemon is running, call the REST
API directly:

1. Set `AGENTMEMORY_URL` to the daemon base URL (default `http://localhost:3111`).
2. The REST API requires a bearer credential by default. Use the host's explicit
   `AGENTMEMORY_SECRET`; for loopback URLs only, fall back to the secret in
   `~/.agentmemory/.env` and then `~/.agentmemory/secret`. Load the value locally
   without displaying it. Never send a local-file secret to a remote URL.
   Authenticated REST fallback requests require HTTPS for non-loopback
   URLs; HTTP is allowed for loopback URLs (`localhost`, `127.0.0.0/8`, or `[::1]`).
   Do not print or save the secret.

Endpoint map by skill:

| Skill           | REST call                                                        |
| --------------- | --------------------------------------------------------------- |
| remember        | `POST /agentmemory/remember`                                     |
| recall          | `POST /agentmemory/smart-search`                                 |
| recap           | `GET /agentmemory/sessions` + `POST /agentmemory/smart-search`   |
| handoff         | `GET /agentmemory/sessions` + `POST /agentmemory/smart-search`   |
| session-history | `GET /agentmemory/sessions`                                      |
| commit-context  | `GET /agentmemory/session/by-commit?sha=<sha>`                   |
| commit-history  | `GET /agentmemory/commits` (URL-encode every query param)       |

The MCP host reads the plugin MCP configuration. Restart the daemon after
changing its configuration, then restart or reconnect the host MCP process after
changing its URL or explicit secret. The local bridge reads the credential files
for each request; it does not inherit other daemon `.env` settings.
