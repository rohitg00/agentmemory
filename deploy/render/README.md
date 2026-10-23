# Render

Create a Blueprint from `deploy/render/render.yaml`. Render builds the shared `deploy/Dockerfile` and provisions a persistent `/data` disk. The web service exposes REST on `3111` and uses `/agentmemory/livez` for health checks. The runtime is iii 0.24.6 Worker Compose with registry workers pinned in `deploy/Dockerfile` and `deploy/runtime/worker-compose.yaml`.

The viewer listens on container port `3113`. Render's web service exposes only the primary HTTP port; reach the viewer through an SSH tunnel or a separately configured TLS proxy. For a public proxy, set `VIEWER_ALLOWED_HOSTS` and `VIEWER_ALLOWED_ORIGINS` to exact values. Viewer API/SSE routes require the bearer secret. Read it over SSH with `cat /data/secret`. Do not expose the engine WebSocket on `49134`.

Keep the disk attached on every deploy and back up `/data` before upgrades. Render Free does not support persistent disks.
