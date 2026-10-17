# Run agentmemory as a systemd service

Supervise agentmemory on a Linux box you own — a home server, a bare VPS,
or a workstation — without Docker `restart:` policies or a managed host.
This template ships a single `agentmemory.service` unit that runs the
agentmemory server under systemd, restarts it on failure, and brings it
back automatically after a reboot.

It fills a real gap: every other template under `deploy/` leans on Docker
or a platform supervisor to keep the process alive. On a plain Linux host
with a global `npm install -g @agentmemory/agentmemory`, nothing keeps the
server running across crashes and reboots. This unit does.

## What you get

- A boot-persistent **system service** running the bare `agentmemory`
  CLI as a dedicated unprivileged `agentmemory` user (mirrors the
  `gosu node:node` drop-privilege pattern the Docker templates use).
- **Automatic restart** on failure (`Restart=always`) and on reboot
  (`WantedBy=multi-user.target`) — the systemd equivalent of the compose
  templates' `restart: unless-stopped`.
- A **FHS-correct state directory** at `/var/lib/agentmemory`, created and
  owned by systemd via `StateDirectory=`. Because the CLI's data dir is
  hardcoded to `$HOME/.agentmemory`, the unit points `HOME` at the state
  directory, so memories, the BM25 index, and snapshots land under
  `/var/lib/agentmemory/.agentmemory`. The self-managed iii engine writes
  its KV and stream stores to `/var/lib/agentmemory/data`.
- Engine teardown on stop via `ExecStop=agentmemory stop`, which shuts
  down the iii engine this unit started (including a docker-compose
  engine); systemd then SIGTERMs the worker.
- The same health endpoint as every other template:
  `/agentmemory/livez`.

## One-time setup

```bash
# 1. Install the CLI globally so `agentmemory` is on PATH.
sudo npm install -g @agentmemory/agentmemory

# 2. Create the dedicated service user (home = the state dir).
sudo useradd --system --create-home --home-dir /var/lib/agentmemory \
  --shell /usr/sbin/nologin agentmemory

# 3. Install the unit and start it.
sudo install -m 644 agentmemory.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agentmemory
```

If `which agentmemory` reports a path outside `/usr/local/bin` (nvm,
Volta, asdf, or a custom npm `--prefix`), edit the `Environment=PATH=`
line in the unit to include that directory before reloading.

Operator configuration goes in an optional environment file at
`/etc/agentmemory/agentmemory.env` (one `KEY=value` per line, no
`export`). The CLI reads these the same way it reads
`~/.agentmemory/.env`:

```ini
# /etc/agentmemory/agentmemory.env
AGENTMEMORY_SECRET=<64 hex chars — see "Set the auth secret" below>
# Optional LLM / embedding provider keys (search works without them):
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# Override the pinned iii engine version only after migrating models:
# AGENTMEMORY_III_VERSION=0.11.2
```

```bash
sudo install -d -m 755 /etc/agentmemory
sudo install -m 600 -o root -g agentmemory /dev/null /etc/agentmemory/agentmemory.env
# then edit the file with your secret and any keys
sudo systemctl restart agentmemory
```

### Variants

**Variant A — self-managed engine (default).** The unit as shipped runs
`agentmemory`, which starts and supervises its own iii engine (a local
`iii` binary if present, otherwise Docker Compose). Nothing else to do.

**Variant B — engine in Docker, worker under systemd.** If you already
run the iii engine via the bundled `docker-compose.yml`
(`restart: unless-stopped`), have this unit manage only the worker and
connect to the running engine:

```ini
# in agentmemory.service
ExecStart=/usr/bin/env agentmemory --no-engine
```

Then uncomment the `After=docker.service` / `Wants=docker.service` lines
so the worker waits for Docker at boot, and add the service user to the
`docker` group (`sudo usermod -aG docker agentmemory`). `--no-engine`
skips spawning a second engine; the worker registers against the
existing one (default `ws://localhost:49134`) and serves the REST API on
`:3111`.

**Variant C — per-user service (no root).** To run it under your own
login instead of a system user, drop the file into
`~/.config/systemd/user/agentmemory.service` and remove the `User=`,
`Group=`, `StateDirectory=`, `WorkingDirectory=`, and
`Environment=HOME=` lines — a user unit already runs as you, with your
real `$HOME`, so the CLI's default `~/.agentmemory` data dir is exactly
what you want. Then:

```bash
systemctl --user enable --now agentmemory
sudo loginctl enable-linger "$USER"   # keep it running with no session
```

## Set the auth secret

`AGENTMEMORY_SECRET` is the bearer token that authenticates REST API and
viewer requests. Unlike the Docker `deploy/` templates — where the
container entrypoint generates it on first boot and prints it to the logs
— the bare CLI does **not** generate a secret. You set one yourself.

It is optional for a pure-localhost personal install (the server starts
without it), but **required** if you authenticate API calls or expose the
viewer on a non-loopback address. Generate one and put it in the
environment file:

```bash
openssl rand -hex 32
# paste the value as AGENTMEMORY_SECRET=... in
# /etc/agentmemory/agentmemory.env, then:
sudo systemctl restart agentmemory
```

Copy the same value into your client environment (Claude Desktop config,
the `AGENTMEMORY_SECRET` env of your MCP block). Treat the file as a
secret: `chmod 600`, owner-readable by the service user only.

## Verify the deployment

```bash
curl -s http://localhost:3111/agentmemory/livez   # {"status":"ok"}
systemctl status agentmemory                       # active (running)
journalctl -u agentmemory -f                        # follow the logs
```

For a richer health + memory-count summary, run the CLI as the service
user with the same `HOME` the unit uses:

```bash
sudo -u agentmemory env HOME=/var/lib/agentmemory agentmemory status
```

For an authenticated call, send `Authorization: Bearer <secret>`.

## Viewer access (port 3113 stays internal)

The viewer binds to loopback by default, so it never belongs on a public
interface. On the host itself, browse `http://localhost:3113` directly.
From another machine, tunnel over SSH rather than exposing the port:

```bash
ssh -L 3113:127.0.0.1:3113 <user>@<host>
# then open http://localhost:3113 on your laptop
```

If you deliberately bind the viewer to a non-loopback address with
`AGENTMEMORY_VIEWER_HOST`, the server refuses to start unless
`AGENTMEMORY_SECRET` is also set, so the viewer API can validate inbound
bearer tokens.

## Rotate the auth secret

```bash
openssl rand -hex 32
# replace AGENTMEMORY_SECRET=... in /etc/agentmemory/agentmemory.env
sudo systemctl restart agentmemory
# update the same value in every client that talks to this server
```

## Back up `/var/lib/agentmemory`

All durable state lives under the `StateDirectory`:
`./.agentmemory` (memories, BM25 index, snapshots) and `./data` (the
engine's KV and stream stores). Snapshot the whole directory with your
existing host tooling (Restic, Borg, `rsync`, BTRFS/ZFS snapshots). A
consistent copy is safest with the service stopped:

```bash
sudo systemctl stop agentmemory
sudo tar czf agentmemory-backup-$(date +%F).tar.gz -C /var/lib agentmemory
sudo systemctl start agentmemory
```

Restore by extracting back into `/var/lib` (preserving ownership) before
starting the service.

## Resources

Self-hosted, so the only cost is the host you already run. The worker is
a Node process and the self-managed iii engine adds a second process; a
small always-on VM (1 vCPU, 1 GB RAM) is a comfortable starting point for
a personal install. `StateDirectory` storage grows with your memory
corpus. Measure your own footprint with `systemctl status agentmemory`
(shows current memory) and `du -sh /var/lib/agentmemory` before sizing a
constrained host.

## Known caveats

- **`ExecStop` uses the `stop` subcommand.** If your installed CLI
  predates `agentmemory stop`, drop the `ExecStop=` line and let systemd
  send `SIGTERM` to the control group on shutdown.
- **`AGENTMEMORY_DATA_DIR` is not a CLI setting.** The data dir is
  hardcoded to `$HOME/.agentmemory`; this unit controls it by setting
  `HOME=/var/lib/agentmemory`. Don't expect an `AGENTMEMORY_DATA_DIR`
  env var to move it.
- **Hardening is tuned for Variant A.** The unit sets `NoNewPrivileges`,
  `PrivateTmp`, `ProtectSystem=full`, `ProtectControlGroups`, and
  `RestrictSUIDSGID`. These are safe for the self-managed-engine path. If
  you run the engine via Docker (Variant B) and hit permission errors
  talking to the Docker socket, relax `NoNewPrivileges` and confirm the
  service user is in the `docker` group.
- **PATH is environment-specific.** Node version managers install the
  global bin outside `/usr/local/bin`; update the `Environment=PATH=`
  line to match `which agentmemory`.
- **The iii engine version is pinned** (currently v0.11.2) in the
  self-managed path, same as the Docker templates. Override with
  `AGENTMEMORY_III_VERSION=` in the environment file only after migrating
  to a newer engine model.
