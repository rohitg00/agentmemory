# Deploy agentmemory on ZopDay

This template runs agentmemory as a single [ZopDay](https://zop.dev/zopday)
service, either on ZopDay's managed ZopCloud or in your own AWS or GCP
account. The HMAC secret is generated on first boot and persisted to the
volume — you capture it from the deploy logs exactly once.

The Dockerfile and entrypoint are the same self-contained pair the other
templates use: `@agentmemory/agentmemory` from npm, the iii engine binary
copied in from `iiidev/iii`, no pre-built agentmemory image required.

## What you get

- A public HTTPS endpoint serving the agentmemory REST API on port 3111.
  TLS terminates upstream of the container either way, as the other
  templates assume: ZopCloud handles it with its Caddy-based TLS, and an
  own-cloud deploy terminates at the cluster ingress with a cert-manager
  certificate.
- The HMAC bearer secret generated on first boot inside the container and
  persisted to `/data/.hmac` (chmod 600); you copy it from the deploy logs
  once.
- The viewer on 3113 stays bound to the container's localhost. Only 3111
  is published.

## Before you start

**Attach a persistent volume mounted at `/data`.** agentmemory keeps its
memories, BM25 index, stream backlog and the generated HMAC secret there.
Without a volume the container still starts, but every redeploy issues a
new secret and drops the stored memories. This is the one step you must
configure yourself — it is not implied by the deploy link.

## Deploy

1. Open the deploy screen:
   <https://zop.dev/zopday/app/deploy?repo=https://github.com/rohitg00/agentmemory&port=3111&name=agentmemory>
2. Choose **ZopCloud** — a managed VM pool, no cloud account or cluster
   to connect — or connect an AWS or GCP account to deploy into your own
   cloud, where it lands as a standard Helm release on your cluster. The
   two differ in more than billing; see "Reach the viewer" below.
3. Set the Dockerfile path to `deploy/zopday/Dockerfile` and the build
   context to `deploy/zopday`. The repository root has no Dockerfile by
   design, so this step is required — the same reason the Render template
   documents a manual Blueprint path instead of a root-detected button.
4. Attach the `/data` volume described above.
5. Confirm the published port is **3111**.

To pin a specific `@agentmemory/agentmemory` release, set the
`AGENTMEMORY_VERSION` build arg before the deploy. Same for `III_VERSION`
and `III_SDK_VERSION`, which must be set to the same release.

## Capture the HMAC secret

After the first deploy succeeds, open the service logs and search for
`AGENTMEMORY_SECRET=`. You will see exactly one line of the form
`AGENTMEMORY_SECRET=<64 hex chars>`. Copy it into your client
environment. The secret is never printed again on subsequent boots.

## Verify the deployment

```bash
curl https://<your-zopday-url>/agentmemory/livez
# {"status":"ok"}
```

## Reach the viewer

The viewer on 3113 is deliberately not published, so reaching it depends
on the target you deployed to.

**Own cloud (Kubernetes).** Port-forward to the running pod, the same
pattern the other templates document for their platform:

```bash
kubectl port-forward deploy/agentmemory 3113:3113
# then open http://localhost:3113
```

**ZopCloud.** There is no cluster of yours to port-forward into —
ZopCloud is a managed VM pool ZopDev operates, and only 3111 is
published. The viewer is not reachable there. Deploy to your own cloud
if you need it.
