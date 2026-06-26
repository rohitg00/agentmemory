# Deploy agentmemory on plain self-hosted Docker

For running agentmemory on infrastructure you already control and aren't
asking a PaaS to manage — a NAS, a homelab server, a Windows machine running
Docker Desktop, or any other Docker host with no built-in reverse proxy or
TLS termination. Same Dockerfile/entrypoint pattern as the
[Coolify template](../coolify/README.md), with the platform-specific bits
(`SERVICE_FQDN_*`, Coolify's managed Traefik/Caddy proxy) removed and replaced
with plain `ports:` publishing you control directly.

## What you get

- A Docker Compose stack exposing the agentmemory REST/MCP API on port
  `3111`, published directly to whatever network your Docker host is on (no
  proxy required, but nothing stops you from putting one in front).
- A persistent named volume (`agentmemory-data`) backing `/data` — memories,
  BM25 index, and stream backlog survive container recreation.
- An HMAC secret generated on first boot and persisted to the volume (see
  below) — never baked into the image or a committed config file.
- The viewer (port `3113`) stays loopback-only inside the container by
  default, matching the npm package's own safe default. Reaching it from
  another machine is opt-in (see "Viewer access" below).

## One-time setup

```bash
git clone https://github.com/rohitg00/agentmemory
cd agentmemory/deploy/docker
docker compose up -d --build
```

Watch the first-boot logs for the generated secret:

```bash
docker compose logs -f agentmemory
# look for a line: AGENTMEMORY_SECRET=<64 hex chars>
```

Copy it into your MCP client's environment (see the main repo README's
Claude Code / Cursor / etc. integration sections). It is not printed again on
subsequent boots — to rotate it, see "Rotate the HMAC secret" below.

## Verify the deployment

```bash
curl http://<your-host-ip>:3111/agentmemory/livez
# {"status":"ok"}
```

For an authenticated call, send `Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal by default)

Two options, in order of how much you trust the network this host is on:

**Option A — SSH/local tunnel (recommended for anything beyond a fully
trusted LAN).**

```bash
ssh -L 3113:127.0.0.1:3113 <user>@<docker-host>
# then open http://localhost:3113 on your own machine
```

**Option B — expose it directly on your LAN.** Reasonable if this Docker
host already lives on a trusted home/office network (e.g. a NAS). Three
things have to change together — doing only one or two of them will not
work, and the failure modes are confusing enough that they're worth listing
explicitly:

1. Uncomment the `3113:3113` line in `docker-compose.yml`'s `ports:` block.
2. Uncomment and set `AGENTMEMORY_VIEWER_HOST` and `VIEWER_ALLOWED_HOSTS` in
   the same file's `environment:` block. `VIEWER_ALLOWED_HOSTS` must be the
   *exact* `host:port` your browser will send as the `Host` header (e.g.
   `192.168.1.50:3113`) — the viewer rejects anything not on this allowlist
   with a `403 forbidden host`, by design (it's a DNS-rebinding guard, not a
   bug).
3. **If you put your own reverse proxy in front of this** (nginx, Caddy,
   Traefik, etc. — common on a NAS that already runs one for other
   services): make sure it forwards the Host header with the port intact.
   nginx's `$host` variable *strips the port* (it's meant for server-name
   matching, not header passthrough) — use `proxy_set_header Host $http_host;`
   instead of `$host`, or step 2's allowlist will never match and every
   request 403s even though the configuration looks correct. This is the
   single most confusing failure mode in this whole setup if you hit it
   blind; it's called out here so you don't have to rediscover it.

Then `docker compose up -d` to apply, and confirm with:

```bash
curl -H "Host: <your-host-ip>:3113" http://<your-host-ip>:3113/
```

## Rotate the HMAC secret

```bash
docker compose exec agentmemory rm /data/.hmac
docker compose restart agentmemory
docker compose logs agentmemory | grep AGENTMEMORY_SECRET
```

## Back up `/data`

```bash
docker run --rm -v agentmemory-data:/data -v "$(pwd)":/backup alpine \
  tar czf /backup/agentmemory-backup.tar.gz -C /data .
```

Restore by extracting that tarball back into the same named volume.

## Windows / Docker Desktop notes

This template builds and runs on Docker Desktop's WSL2 backend the same as
any Linux Docker host — there's nothing Windows-specific in the
Dockerfile/compose file itself. Two things that are easy to trip on:

- Run `docker compose` from a WSL2 shell or a terminal where Docker Desktop's
  context is active, not a plain PowerShell session without Docker Desktop's
  CLI integration enabled.
- If you bind-mount `/data` to a Windows path instead of using the named
  volume this template defaults to, file ownership (`chown` in
  `entrypoint.sh`) behaves differently across the Windows/WSL2 filesystem
  boundary — stick with the named volume (`agentmemory-data:`) unless you
  have a specific reason not to.

## Known caveats

- The image builds locally on `docker compose up --build` — first build
  pulls `node:22-slim` and `iiidev/iii`, subsequent builds are cache-fast
  unless you bump `AGENTMEMORY_VERSION`/`III_VERSION` in the compose file's
  `build.args`.
- No TLS termination is included — this template assumes either a fully
  trusted local network or that you're fronting it with your own reverse
  proxy (see the Host-header caution above if you do).
- arm64 hosts work — the `iiidev/iii` base image and the iii binary
  selection both resolve per-architecture automatically.
