# Deploy agentmemory on fly.io

This template runs agentmemory on a single fly.io machine with a 1 GB
persistent volume mounted at `/data`. The HMAC secret is generated on
first boot and persisted to the volume — you capture it from the deploy
logs exactly once.

## What you get

- A public HTTPS endpoint serving the agentmemory REST API on port 3111
- A 1 GB Fly Volume at `/data` for memories, BM25 index, and stream backlog
- `auto_stop_machines = "stop"` and `min_machines_running = 0` — the
  machine sleeps when idle, so cost floor approaches $0 for low traffic
- HTTP healthcheck at `/agentmemory/livez` every 30 s
- The HMAC bearer secret is generated on first boot inside the
  container and persisted to `/data/.hmac` (chmod 600); the operator
  copies it from the deploy logs once.

## One-time setup

Pick a unique Fly app name first — `agentmemory` itself is likely taken.
Every command below references `$APP`, so set it once and the rest of the
flow stays consistent:

```bash
# 1. Install flyctl: https://fly.io/docs/flyctl/install/
# 2. Pick your unique app name (and matching volume name):
export APP="agentmemory-$(whoami)"     # or any other globally-unique name
export VOLUME="${APP//-/_}_data"       # Fly volume names can't contain '-'

# 3. From this directory:
fly launch --copy-config --no-deploy --name "$APP"

# 4. Create the volume in the same region as the app:
fly volumes create "$VOLUME" --region iad --size 1

# 5. Deploy:
fly deploy --app "$APP"
```

If `fly launch` reports the name is taken, pick another value for `$APP`,
re-export, and re-run.

## Capture the HMAC secret

Right after the first deploy succeeds:

```bash
fly logs --app "$APP" | grep -A1 AGENTMEMORY_SECRET=
```

You will see exactly one line of the form `AGENTMEMORY_SECRET=<64 hex chars>`.
Copy it into your client environment (`~/.bashrc`, Claude Desktop config,
etc.). The secret is never printed again on subsequent boots.

## Verify the deployment

```bash
curl "https://$APP.fly.dev/agentmemory/livez"
# {"status":"ok"}
```

For an authenticated call, your client must send `Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal)

The viewer port is intentionally not exposed publicly. Tunnel to it:

```bash
fly proxy 3113:3113 --app "$APP"
# then open http://localhost:3113
```

`fly proxy` opens an mTLS WireGuard channel to the machine, so the
viewer's bearer token still has to ride a loopback connection on your
laptop — the v0.9.12 plaintext-bearer guard stays satisfied.

## Rotate the HMAC secret

```bash
fly ssh console --app "$APP"
rm /data/.hmac
exit
fly machine restart <machine-id>
fly logs --app "$APP" | grep AGENTMEMORY_SECRET=
```

Update every client with the new secret. Old tokens stop working
immediately.

## Back up `/data`

```bash
fly ssh console --app "$APP" -C "tar czf - /data" > "$APP-$(date +%Y%m%d).tar.gz"
```

To restore on a fresh machine:

```bash
cat "$APP-YYYYMMDD.tar.gz" | fly ssh console --app "$APP" -C "tar xzf - -C /"
fly machine restart <machine-id>
```

## Cost floor and egress

- Idle (machine stopped): the volume costs ~$0.15/GB/month. A 1 GB
  volume is roughly $0.15/month.
- Active (machine running on `shared-cpu-1x` with 512 MB): about
  $1.94/month if it ran 24/7; in practice `auto_stop_machines` keeps
  that well under $1.
- Outbound bandwidth: 100 GB/month free on the Hobby plan, then $0.02/GB
  in North America / Europe.

See <https://fly.io/docs/about/pricing/> for the up-to-date rate card.

## Known caveats

- The volume lives in one region. To survive a region outage, create a
  second volume in another region and update `primary_region` after the
  failover, or take snapshots with `fly volumes snapshots create`.
- The Dockerfile builds in the Fly Builder on every deploy — first
  build is ~30 seconds; cached layers shrink rebuilds to under 10
  seconds. Image is ~114 MB.
- First deploy lands on a **shared IPv4 + dedicated IPv6** by default
  (free). If you need a dedicated IPv4 for legacy clients without SNI,
  run `fly ips allocate-v4 --app "$APP"` — costs $2/month.
- Cold-start (from machine launch to passing `/agentmemory/livez`) is
  ~9 seconds measured. `grace_period = "30s"` on the health check
  gives a 3x safety margin.
- Bump `AGENTMEMORY_VERSION` or `III_VERSION` in the Dockerfile to
  upgrade. `fly deploy --build-arg AGENTMEMORY_VERSION=<x>` also works
  for a one-off without editing the file.
