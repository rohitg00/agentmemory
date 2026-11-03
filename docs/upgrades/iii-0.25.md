# Upgrading the AgentMemory runtime to iii 0.25

This release pins the engine, `iii-sdk` and `@iii-dev/helpers` to 0.25.0. Worker Compose starts the existing `state@0.22.20` and `http@0.22.7` registry workers with AgentMemory. Their versions are independent of the engine version.

## Before upgrading

Stop the running instance with its currently installed CLI before replacing the package:

```sh
agentmemory stop
npm install -g @agentmemory/agentmemory@latest
agentmemory
agentmemory status
```

Use the same `--instance`, `--port` and `--data-dir` flags you used to start it. Preserve the data directory and `~/.agentmemory`, including its secret. The new CLI will not adopt a running engine with a different version or overwrite a user-managed global iii binary. On macOS and Linux it installs the verified engine under `~/.agentmemory/bin`; native Windows still requires manual installation of the pinned binary.

Existing file state remains at `state_store.db`; this upgrade does not convert or delete it. Docker deployments keep their persistent `/data` volume and use the shared `deploy/Dockerfile`. `AGENTMEMORY_USE_DOCKER` is no longer a CLI startup mode. Stop a legacy Docker-managed runtime using the command printed by the CLI, then follow the [deployment guide](../../deploy/README.md). Keep `AGENTMEMORY_STATE_BACKEND=redis` and `AGENTMEMORY_REDIS_URL` together when using Redis.

## Capabilities and compatibility

- MCP tools, HTTP routes, capture, recall, search, export/import and the AgentMemory viewer keep their existing interfaces.
- The viewer remains on port 3113 by default. Live updates use authenticated SSE at `/agentmemory/viewer/events` on the REST port. Port 3112 is no longer used.
- `/agentmemory/status` reports the configured engine pin as `service.enginePinnedVersion`, replacing the old `engineVersion` field. This is the supported version, not a probe of an arbitrary remote engine.
- `registerTrigger` and `registerTriggerType` remain supported by iii 0.25, with deprecation warnings. HTTP and state providers still use these APIs; their warnings do not mean route registration failed.
- iii 0.25 can dispatch calls to a worker's own functions locally. Engine-side spans differ for those calls; SDK tracing and state-worker persistence still apply.

## Retired engine console

iii 0.25 removes the bundled console. `agentmemory console` prints migration guidance and the selected viewer URL; it does not install or launch an engine console. `--console-port` and forwarded console flags no longer launch a service. The AgentMemory viewer and `agentmemory status` remain available. See the [upstream console guidance](https://github.com/iii-hq/iii/blob/iii/v0.25.0/docs/using-iii/console.mdx) for the separate ADE console. ADE also defaults to port 3113, so give it a different port if you add it to a custom deployment alongside the AgentMemory viewer.

Custom `iii-config.yaml` files and `AGENTMEMORY_III_CONFIG` are no longer used by the CLI. It generates an isolated Worker Compose project in the chosen data directory. The old `iii worker add` command is also gone. Declare extra workers under `containers` in a custom Compose manifest; changes to the CLI-generated manifest are overwritten on the next start. Keep custom deployments separate and consult the [iii 0.25 migration guide](https://github.com/iii-hq/iii/blob/iii/v0.25.0/docs/upgrading/from-0-24-x.mdx).
