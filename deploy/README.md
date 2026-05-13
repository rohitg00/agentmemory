# One-click deploy templates

Stand up agentmemory on managed infrastructure without rolling your own
Docker host. Each template ships a self-contained Dockerfile that pulls
`@agentmemory/agentmemory` from npm at build time and bundles the
`iii-engine` binary alongside it — no pre-published image required.
Storage mounts at `/data`, an HMAC secret is generated on first boot,
and `AGENTMEMORY_REQUIRE_HTTPS=1` is baked in so the v0.9.12
plaintext-bearer guard fires loud on any non-loopback misconfiguration.

| Platform | Pitch | Cost floor |
|----------|-------|------------|
| [fly.io](./fly/README.md) | Single machine with auto-stop. Cheapest idle cost; cold-start on first request after sleep. | ~$0.15/month at full idle |
| [Railway](./railway/README.md) | Push from GitHub, volume in the dashboard. Easiest dashboard flow. | $5/month (Hobby plan flat fee) |
| [Render](./render/README.md) | Blueprint-driven; persistent disk attaches automatically. Most "set it and forget it." | $7.25/month (Starter web + 1 GB disk) |

## What every template guarantees

- **Volume mounted at `/data`.** Matches the path the engine has used
  since v0.9.10.
- **HMAC secret generated on first boot** via `openssl rand -hex 32`,
  written to `/data/.hmac` with `chmod 600`, and printed to stdout
  exactly once so the operator can capture it from the deploy logs.
  Subsequent boots load the secret from the file. The secret is never
  committed to a config file or set as a platform env var.
- **Only port 3111 is exposed publicly.** The viewer on port 3113
  stays bound to the container's localhost. Reach it via SSH tunnel
  (see each platform's README).
- **`AGENTMEMORY_REQUIRE_HTTPS=1`** baked in. Integration plugins will
  refuse to send a bearer token over plaintext HTTP to a non-loopback
  host — if a TLS termination upstream gets misconfigured, the client
  fails loud instead of silently leaking the secret.

## Pick a platform

- Pick **fly.io** if you want the lowest idle cost and don't mind a
  cold-start latency hit on the first request after sleep.
- Pick **Railway** if you want a clicky dashboard flow and a flat
  monthly bill.
- Pick **Render** if you want the most "set it and forget it"
  Blueprint flow with automatic disk snapshots on paid plans.

All three give you the same agentmemory API at the same port (3111)
with the same auth model. Migrating between them later is a `tar` of
`/data` and a re-import — see each platform's README for the exact
commands.
