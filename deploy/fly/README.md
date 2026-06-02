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
the viewer unlock prompt, etc.). The secret is never printed again on
subsequent boots.

If the first-boot log line is no longer available, read the persisted
secret from the mounted volume:

```bash
fly ssh console --app "$APP" -C "sh -lc 'cat /data/.hmac'"
```

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

The entrypoint sets `AGENTMEMORY_VIEWER_HOST=::` **only when it detects
Fly's runtime variables** (`FLY_APP_NAME` / `FLY_ALLOC_ID`). That makes
the viewer listen on the machine's `fly-local-6pn` WireGuard interface
as well as loopback so `fly proxy` can reach it. The same branch
pre-seeds `VIEWER_ALLOWED_HOSTS=localhost:3113,127.0.0.1:3113,[::1]:3113`,
which are the Host headers `fly proxy 3113:3113` actually emits on
your laptop.

When `AGENTMEMORY_VIEWER_HOST` is non-loopback the viewer enforces two
extra guards: it refuses to start unless `VIEWER_ALLOWED_HOSTS` is
explicitly set, and every request to `/agentmemory/*` must present
`Authorization: Bearer $AGENTMEMORY_SECRET`. Static HTML and the
favicon are still served unauthenticated. If a proxied viewer request
gets a 401, the browser UI prompts for `AGENTMEMORY_SECRET` and stores
it in session storage so subsequent viewer API calls include the bearer.
Use the value printed in the first-boot logs or read `/data/.hmac`
inside the machine.

> **Security warning.** Setting `AGENTMEMORY_VIEWER_HOST=0.0.0.0` or
> `::` turns the viewer into a network-reachable proxy that signs every
> upstream call with `AGENTMEMORY_SECRET`. Never enable that outside a
> network you trust (Fly's WireGuard mesh in this template), and never
> set it in a plain `docker run -p 3113:3113 …` on a shared host — the
> entrypoint deliberately skips the override when Fly env vars are
> absent so a plain Docker pull stays loopback-only.

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
