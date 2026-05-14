# Deploy agentmemory on Coolify

[Coolify](https://coolify.io/self-hosted) is an open-source, self-hosted
Heroku/Render alternative that you run on your own VPS. This template
deploys agentmemory as a Coolify *Application* backed by a Docker
Compose stack — Coolify handles TLS termination, persistent volume
provisioning, log aggregation, and the deploy webhook for you.

## What you get

- A public HTTPS endpoint serving the agentmemory REST API behind
  Coolify's built-in Traefik/Caddy proxy. The container port (`3111`)
  is exposed to the proxy network only — never bound to the host — so
  TLS termination and domain routing stay under proxy control.
- A persistent Docker volume backing `/data` for memories, BM25 index,
  and stream backlog. Coolify auto-prefixes the volume name with the
  application's UUID so the data survives redeploys.
- An HTTP health-check at `/agentmemory/livez` declared in the
  Dockerfile (`HEALTHCHECK` directive). Coolify reuses it for
  rolling-deploy decisions.

## One-time setup

1. **Open your Coolify dashboard** and click **+ New → Application**.
2. **Source**: pick *Public Repository*. Paste:
   ```
   https://github.com/rohitg00/agentmemory
   ```
   Branch: `main`.
3. **Build Pack**: select *Docker Compose*.
4. **Base Directory**: `deploy/coolify`
5. **Compose Path**: `docker-compose.yml`
6. Click **Save**, then on the application settings screen set a
   **Domain** in the form `https://<your-fqdn>:3111` (the `:3111`
   suffix tells Coolify's proxy which container port to forward to;
   it still serves over 443/80 publicly).
7. Click **Deploy**.

That's it. Coolify clones the repo, builds the Dockerfile under
`deploy/coolify/`, provisions the `agentmemory-data` named volume on
the host, attaches Traefik (or Caddy) for the public domain, and starts
the service. The container is reachable only through the proxy — there
is no published host port.

## Capture the HMAC secret

Once the deploy logs show the service is up, open the application's
**Logs** tab in Coolify and search for `AGENTMEMORY_SECRET=`. You will
see exactly one line of the form `AGENTMEMORY_SECRET=<64 hex chars>`.
Copy it into your client environment (`~/.bashrc`, Claude Desktop
config, etc.). The secret is never printed again on subsequent boots.

## Verify the deployment

```bash
curl "https://<your-coolify-domain>/agentmemory/livez"
# {"status":"ok"}
```

For an authenticated call, your client must send
`Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal)

The viewer port is not exposed by the compose file on purpose — it
holds the unauthenticated admin surface in older releases and the
proxied surface in current ones, neither of which belongs on the open
internet. Two paths to reach it:

**Option A — SSH tunnel from the Coolify host.** Coolify gives you SSH
access to the underlying VPS. From your laptop:

```bash
ssh -L 3113:127.0.0.1:3113 <user>@<coolify-host>
# inside the SSH session, find the container:
docker ps --filter name=agentmemory --format "{{.Names}}"
# tunnel into the container's port from the host:
docker exec -it <container-name> sh -c "curl http://localhost:3113"
```

Cleaner version: bind the container's 3113 to the host's loopback by
adding `- "127.0.0.1:3113:3113"` to the `ports:` block in
`docker-compose.yml`, redeploy, then `ssh -L 3113:127.0.0.1:3113
<user>@<host>` is enough.

**Option B — expose 3113 as a second Coolify domain protected by HTTP
basic auth.** Coolify's per-service routing supports adding a second
public endpoint with basic-auth middleware. Useful if you want to
share the viewer with a teammate without giving them SSH.

## Rotate the HMAC secret

```bash
ssh <user>@<coolify-host>
docker exec -it <container-name> sh -c "rm /data/.hmac"
exit
```

Then click **Redeploy** in the Coolify dashboard. The next boot prints
a fresh secret to the logs.

## Back up `/data`

Coolify exposes the named volume on the host filesystem under
`/var/lib/docker/volumes/<project-id>_agentmemory-data/_data`. Back it
up with your existing host-level snapshot tooling (Restic, Borg,
`rsync`, BTRFS snapshots, etc.) or via Coolify's built-in *Backups*
feature for Docker volumes.

## Cost floor and resources

- **Hardware**: the agentmemory container idles at ~150 MB RSS, climbs
  to ~400 MB under steady traffic. The bundled iii engine adds another
  ~80 MB. A 1 vCPU / 1 GB VPS is comfortably enough for a personal
  install.
- **VPS providers commonly paired with Coolify**: Hetzner CX22
  (~€3.79/month), DigitalOcean Basic Droplet ($6/month), Vultr Cloud
  Compute ($6/month). Coolify itself is free.
- **Volume storage**: tied to whatever block storage the VPS provides;
  typically pennies per GB-month.

## Known caveats

- The Dockerfile builds on the Coolify host on every deploy. First
  deploy takes ~2 minutes; cached layers shrink subsequent rebuilds to
  under 30 seconds. Pin `AGENTMEMORY_VERSION` and `III_VERSION` in
  `docker-compose.yml`'s `build.args` block to lock a specific release.
- Coolify's *Persistent Storage* tab will show `agentmemory-data` as a
  managed volume — do not delete it from the dashboard if you want
  your memories to survive a redeploy.
- arm64 hosts work — the iii binary selection in the Dockerfile uses
  `uname -m` and downloads the matching tarball.
