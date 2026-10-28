# Fly.io

From the repository root, create the app and persistent volume, then deploy:

```bash
fly apps create <unique-app-name>
fly volumes create agentmemory_data --region iad --size 1 --app <unique-app-name>
fly deploy --config deploy/fly/fly.toml --app <unique-app-name>
```

The shared `deploy/Dockerfile` build runs iii 0.25.0 Worker Compose. `/data` persists engine configuration, state, secret, registry cache, and logs. REST is served over HTTPS on internal port `3111`; the authenticated viewer uses internal port `3113`, exposed only through the TLS listener on public port `8443`.

Set `VIEWER_ALLOWED_HOSTS` to `<app>.fly.dev:8443,localhost:3113` and `VIEWER_ALLOWED_ORIGINS` to `https://<app>.fly.dev:8443` before enabling the viewer. Keep `localhost:3113` for Fly's internal viewer healthcheck. Browse to `https://<app>.fly.dev:8443`; enter the bearer secret when prompted. The API/SSE proxy requires bearer auth. Never expose port `49134`.

Read the generated secret with `fly ssh console --app <app> -C 'cat /data/secret'`. Back up `/data` before changing deployments or rotating the secret. The Fly volume is regional; use snapshots or an off-region backup for disaster recovery.
