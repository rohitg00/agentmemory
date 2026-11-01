# Coolify

Create a Docker Compose application from `rohitg00/agentmemory`, with base directory `.` and Compose path `deploy/coolify/docker-compose.yml`. The Compose manifest builds the shared `deploy/Dockerfile` from the repository root. Set the public REST domain to container port `3111`. The service attaches a persistent `agentmemory-data` volume at `/data`; its health check is `/agentmemory/livez`.

For browser access, add a second Coolify domain to container port `3113`, enable TLS, and set `VIEWER_ALLOWED_HOSTS` and `VIEWER_ALLOWED_ORIGINS` to the exact domain, origin, and proxy Host header port (for a standard HTTPS domain, use the public host as the `Host` and `https://` origin). The viewer page is public, but viewer API proxy requests require the bearer secret, entered in the viewer prompt. Do not route the iii engine WebSocket (`49134`) publicly.

Read the generated secret from the persistent volume (the value persists across container restarts):

```bash
docker compose exec agentmemory cat /data/secret
```

Back up the `/data` volume before redeploys or secret rotation. `docker compose down -v` deletes all agentmemory data. Version pins are build arguments in the shared [`deploy/Dockerfile`](../Dockerfile); override them in the Compose build args only when upgrading the runtime as a set.
