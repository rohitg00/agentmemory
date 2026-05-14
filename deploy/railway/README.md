# Deploy agentmemory on Railway

This template runs agentmemory on a single Railway service with a
persistent volume mounted at `/data`. The HMAC secret is generated on
first boot and persisted to the volume — you read it once from the
deploy logs and copy it into your client.

## What you get

- A public HTTPS endpoint serving the agentmemory REST API on port 3111
- A persistent Railway Volume at `/data` for memories, BM25 index, and
  stream backlog
- Railway healthcheck against `/agentmemory/livez`
- The HMAC bearer secret is generated on first boot inside the
  container and persisted to `/data/.hmac` (chmod 600); the operator
  copies it from the deploy logs once.
- The deploy uses `requiredMountPath: /data` so Railway refuses to
  start the service if no volume is attached at that path — first
  deploy must create the volume from the dashboard.

## Deploy via Railway dashboard

1. Click **Deploy from GitHub** in the Railway dashboard and pick the
   `rohitg00/agentmemory` repo.
2. Set the **Config-as-Code Path** under the service Settings to
   `deploy/railway/railway.json`. Railway picks up the Dockerfile path
   from there.
3. Open the service's **Volumes** tab and add a volume mounted at
   `/data` (Railway volumes are configured in the dashboard or via
   `railway volume add`, not in `railway.json`).
4. Click **Deploy**.

## Deploy via Railway CLI

```bash
# Install: https://docs.railway.com/guides/cli
railway login
railway init                                            # link a new project
railway up --service agentmemory                        # builds + deploys
railway volume add --service agentmemory --mount /data  # attach persistent volume
railway redeploy                                        # restart with the volume
```

## Capture the HMAC secret

After the first deploy succeeds, open the service's **Deploy Logs**:

```bash
railway logs --service agentmemory | grep AGENTMEMORY_SECRET=
```

You will see exactly one line of the form `AGENTMEMORY_SECRET=<64 hex chars>`.
Copy it into your client environment. The secret is never printed again
on subsequent boots.

## Verify the deployment

```bash
curl https://<your-service>.up.railway.app/agentmemory/livez
# {"status":"ok"}
```

For an authenticated call, your client must send `Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal)

Railway only exposes the single public port from your service's
`PORT` env var (which we map to 3111). The viewer stays bound to
localhost inside the container. `railway ssh` is an interactive shell
only — it does not support `-L`-style port forwarding, so reach the
viewer with one of the following.

**Quick in-container check:**

```bash
railway ssh --service agentmemory
# inside the container:
curl http://localhost:3113
```

**Browser session — option A (TCP Proxy, recommended):** in the Railway
dashboard, open the service's *Settings → Networking* tab and add a
**TCP Proxy** for container port `3113`. Railway returns a public
host/port pair you can hit directly from your browser. Pair it with the
HMAC bearer-auth header so the viewer is not anonymously reachable.

**Browser session — option B (in-container sshd):** add an `openssh-server`
process to the image and start it from `entrypoint.sh` on a fixed port,
expose that port through a second Railway TCP Proxy, then use a native
`ssh -L 3113:localhost:3113 <proxy-host> -p <proxy-port>` from your laptop.
This is the heavier path; option A is what most users will want.

## Rotate the HMAC secret

```bash
railway ssh --service agentmemory
rm /data/.hmac
exit
railway redeploy --service agentmemory
railway logs --service agentmemory | grep AGENTMEMORY_SECRET=
```

Update every client with the new secret. Old tokens stop working
immediately.

## Back up `/data`

```bash
railway ssh --service agentmemory -- "tar czf - /data" > agentmemory-$(date +%Y%m%d).tar.gz
```

To restore on a fresh volume:

```bash
cat agentmemory-YYYYMMDD.tar.gz | railway ssh --service agentmemory -- "tar xzf - -C /"
railway redeploy --service agentmemory
```

## Cost floor and egress

- Hobby plan: $5/month flat, includes $5 of usage.
- agentmemory at idle plus a 1 GB volume typically uses $3–$6 of usage
  per month on the smallest instance, so most users stay near the $5
  floor.
- Egress: $0.10/GB after the bundled allowance.

See <https://railway.com/pricing> for the current rate card.

## Known caveats

- Railway volumes do not auto-snapshot. Take your own backups (above)
  or use the dashboard's manual snapshot feature.
- The Dockerfile builds on Railway's builder on every deploy. First
  deploy is ~2 minutes; cached layers make subsequent rebuilds quick.
  Pin `AGENTMEMORY_VERSION` / `III_VERSION` build args in the
  service's *Variables* tab to lock a specific release.
