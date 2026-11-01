# Docker deployments

agentmemory runs on iii 0.25.0 with the `state` 0.22.20 and `http` 0.22.7 registry workers. All image builds use one [`Dockerfile`](Dockerfile), with engine and registry worker pins declared once. Update those build arguments together when promoting a release. Workers are fetched from the iii registry at startup; the `worker-compose.yaml` uses the same Worker Compose format as the CLI.

The container runs `iii compose --up`: Compose owns the engine and supervises `state`, `http`, and the local `agentmemory` worker. There is no legacy embedded engine config, standalone stream, pubsub, or queue worker. The registry worker artifacts are pinned in the compose manifest. Engine and worker state, agentmemory state, generated secret, Compose cache, and logs live on the persistent `/data` volume. For Docker Compose, the volume key is `iii-data`, normally stored as `<compose-project>_iii-data`; set `AGENTMEMORY_DATA_DIR` to a host path to use a bind mount instead. The state worker continues to use `/data/state_store.db`, so the existing 0.22.1 file-based store is read in place without conversion or deletion.

## Ports

| Container port | Service | Use |
|---|---|---|
| `3111` | HTTP worker | REST API and authenticated SSE at `/agentmemory/viewer/events` |
| `3113` | agentmemory viewer | Browser UI and its authenticated REST proxy |
| `49134` | iii engine | Internal worker WebSocket; never publish it |

There is no stream/WebSocket viewer port. REST CORS defaults to `http://localhost` and `http://127.0.0.1` on both the REST and viewer ports; set `REST_ALLOWED_ORIGINS` to a comma-separated list of exact origins when a trusted browser origin needs access. Keep the viewer behind TLS and set `VIEWER_ALLOWED_HOSTS` to the exact inbound `Host` values (with port where present) and `VIEWER_ALLOWED_ORIGINS` to its browser origins. It requires `AGENTMEMORY_SECRET` for API proxy calls; the viewer prompts for the bearer and keeps it in session storage. The engine worker manager listens only on `127.0.0.1:49134` inside the container; do not expose the engine port.

`III_VERSION`, `STATE_VERSION`, and `HTTP_VERSION` are Docker build arguments; Compose passes their shell or `.env` values through to the shared Dockerfile. `AGENTMEMORY_VERSION` does not select a package version: the application code is built from the checked-out repository, so choose an agentmemory release by checking out its tag/commit and rebuilding. Platform deployments use the code revision selected for that service.

Local Compose binds REST and viewer to loopback. Example with test ports:

```bash
AGENTMEMORY_REST_PORT=3611 AGENTMEMORY_VIEWER_PORT=3613 docker compose up --build -d
```

Open `http://127.0.0.1:3613`, use the persisted secret in `docker compose exec agentmemory cat /data/secret`, and stop with `docker compose down`. `docker compose down -v` deletes the memories and secret. Set `AGENTMEMORY_SECRET` to provide an explicit REST bearer. To use Redis for state, set `AGENTMEMORY_STATE_BACKEND=redis` and `AGENTMEMORY_REDIS_URL=redis://...`; otherwise the persistent file-backed store is used.

## Platform templates

- [Fly.io](fly/README.md) — separate HTTPS listeners for REST (`3111`) and the bearer-protected viewer (`8443` externally → `3113` internally); a 1 GB persistent volume.
- [Railway](railway/README.md) — REST is the default public HTTP service; add a TCP proxy for viewer port `3113` if needed.
- [Render](render/README.md) — REST Web Service with a persistent disk; viewer is reachable only from an SSH tunnel unless you add a separately protected proxy.
- [Coolify](coolify/README.md) — both container ports are exposed only to the proxy network; use the Coolify domain with TLS and bearer authorization.

For any public viewer host, configure the allowed host/origin values to the actual domain. Do not publish a bearer-protected viewer over plain HTTP on an untrusted network. The viewer page itself is public; data/API proxy requests require the bearer.

## Updating and backing up

Change the pins in `deploy/Dockerfile`, rebuild and redeploy, and keep the platform's `/data` volume attached. Back up `/data` before upgrades and before any `down -v`, volume deletion, or secret rotation. The worker cache and engine configuration persist alongside state so restarts do not lose data.

### Migrating from the legacy CLI Docker mode

The current CLI does not start or manage Docker deployments. When a current CLI encounters a legacy Docker lifecycle record, it preserves that record and prints the exact `docker stop ...` command; execute the printed command to stop the old container, then leave the preserved metadata intact. Do not start the new container against the data volume while the old engine still has it mounted.

Keep the old deployment's persistent data volume (normally `iii-data`) or copy the old `/data` contents to a backed-up bind mount. The state worker reads the existing `/data/state_store.db` tree in place; no database export/import is needed. The previous runtime initialized the full volume as UID/GID `65532:65532`; this image performs a one-time recursive ownership migration to `node:node` (UID/GID 1000) and writes `/data/.ownership-migrated-node-v1`. Do not run the old image against the volume after that migration. Back up the whole volume before starting the new image.

The previous platform entrypoints persisted the generated bearer secret at `/data/.hmac`. If no explicit secret or current secret file exists, the entrypoint copies that legacy value to `/data/secret` with mode `0600`; the server then initializes the canonical client credential from it. An explicitly configured `AGENTMEMORY_SECRET` takes precedence and is not written to disk.

Reuse the old Compose project name with `docker compose -p <old-project> up --build -d`. If the old volume has a different name, first inspect it with `docker volume ls` and `docker volume inspect <existing-volume>`, then create `compose.existing-volume.yaml`:

```yaml
volumes:
  iii-data:
    external: true
    name: <existing-volume>
```

With `AGENTMEMORY_DATA_DIR` unset so the service uses the named volume, run `docker compose -f docker-compose.yml -f compose.existing-volume.yaml config` and confirm the resolved volume name before starting with the same `-f` arguments and `up --build -d`. The external declaration fails if that volume is missing rather than creating an empty replacement. Check `/agentmemory/livez`, confirm the old and new memories, and use the same project and file arguments with `down` to stop it. Avoid `down -v` unless deleting that data is intended.
