# Deploy agentmemory on Render

This template runs agentmemory on a single Render Web Service with a
persistent disk mounted at `/data`. The HMAC secret is generated on
first boot and persisted to the disk — you capture it from the deploy
logs exactly once.

## What you get

- A public HTTPS endpoint serving the agentmemory REST API on port 3111
  (Render injects `PORT` defaulting to 10000; we override it to 3111
  via `envVars` so the published port matches the container's bind)
- A 1 GB persistent disk at `/data` for memories, BM25 index, and
  stream backlog
- Render healthcheck against `/agentmemory/livez`
- The HMAC bearer secret is generated on first boot inside the
  container and persisted to `/data/.hmac` (chmod 600); the operator
  copies it from the deploy logs once.

## Deploy via Render Blueprint

Render's one-click deploy button only auto-detects `render.yaml` at the
repository root, which the agentmemory repo keeps clean. Use the
dashboard's manual Blueprint flow instead:

1. Push the `deploy/render/` directory to a Git provider Render can
   reach (a fork of `rohitg00/agentmemory` works).
2. In the Render dashboard, click **New +** → **Blueprint**.
3. Point Render at the repo and the path `deploy/render/render.yaml`.
4. Render reads the Blueprint, provisions the disk, builds the
   Dockerfile, and starts the service. The whole flow takes 3–5
   minutes on the first run.

## Deploy via Render Deploy Hook (one-click)

Once the Blueprint exists in your account, generate a Deploy Hook URL
in the service settings. Future deploys are a single curl call:

```bash
curl "https://api.render.com/deploy/srv-XXYYZZ?key=AABBCC"
```

To pin a specific `@agentmemory/agentmemory` release, set the
`AGENTMEMORY_VERSION` build arg in the service's *Environment* tab
before the next deploy. Same for `III_VERSION`.

## Capture the HMAC secret

After the first deploy succeeds, open the service's **Logs** tab and
search for `AGENTMEMORY_SECRET=`. You will see exactly one line of the
form `AGENTMEMORY_SECRET=<64 hex chars>`. Copy it into your client
environment. The secret is never printed again on subsequent boots.

## Verify the deployment

```bash
curl https://agentmemory.onrender.com/agentmemory/livez
# {"status":"ok"}
```

For an authenticated call, your client must send `Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal)

Render only exposes one public port per service, and we use it for
3111. The viewer port stays bound to localhost inside the container.
Reach it via Render's SSH:

```bash
# Settings → SSH → enable for your service, copy the connection command
ssh srv-XXYYZZ@ssh.<region>.render.com -L 3113:localhost:3113
# now http://localhost:3113 in your browser hits the in-container viewer
```

## Rotate the HMAC secret

```bash
ssh srv-XXYYZZ@ssh.<region>.render.com
rm /data/.hmac
exit
# trigger a redeploy from the Render dashboard or via the Deploy Hook
```

After the redeploy, grab the new secret from the logs and update every
client. Old tokens stop working immediately.

## Back up `/data`

```bash
ssh srv-XXYYZZ@ssh.<region>.render.com "tar czf - /data" > agentmemory-$(date +%Y%m%d).tar.gz
```

Render also takes daily snapshots of persistent disks automatically on
paid plans — the SSH tarball is a belt-and-braces option you can ship
off-platform.

## Cost floor and egress

- Starter plan web service: $7/month (0.5 CPU, 512 MB RAM).
- 1 GB persistent disk: $0.25/GB/month, so $0.25/month for the default.
- Bandwidth: 100 GB outbound included, then $0.10/GB.

See <https://render.com/pricing> for the current rate card.

## Known caveats

- Render Free tier does not support persistent disks. The Starter plan
  ($7/month) is the minimum.
- Render restarts the service on every deploy. The HMAC secret survives
  because it lives on the disk, but expect a 10–30 s gap of 502s
  during rollouts.
- Render runs amd64 only for web services. The Dockerfile selects the
  matching iii binary automatically via `uname -m`.
