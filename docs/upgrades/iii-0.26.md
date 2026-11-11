# Upgrading the AgentMemory runtime to iii 0.26

This release pins the engine, `iii-sdk` and `@iii-dev/helpers` to 0.26.0. Worker Compose starts the `state@0.23.1` and `http@0.23.2` registry workers, the releases built for the 0.26 observer model. Coming from a release older than 0.25, read the [iii 0.25 upgrade guide](iii-0.25.md) first.

## Before upgrading

Stop the running instance with its currently installed CLI, then install and start the new one:

```sh
agentmemory stop
npm install -g @agentmemory/agentmemory@latest
agentmemory
agentmemory status
```

Use the same `--instance`, `--port` and `--data-dir` flags you used to start it. Data at `state_store.db` and in `~/.agentmemory` is kept as is; this upgrade does not convert or delete it. The engine and the state and http workers must move together: a 0.25 worker that binds with triggers gets no events from a 0.26 engine, so the CLI never mixes versions.

## What changed

- iii 0.26 removes triggers. Every HTTP route is an observer of `http::on-request` with the route as `args` (`method`, `path`, `middleware_function_ids`), and every state subscription is an observer of `state::on-changed` with filters on `input.scope` and `input.key`. Routes, paths and responses are unchanged.
- The trigger fallback is gone. `AGENTMEMORY_BINDINGS=trigger` is treated as `AGENTMEMORY_BINDINGS=inline` with a warning: routes and state subscriptions still use observers, and only the post-capture pipeline (compression, post-session graph, reflection and consolidation) runs inline.
- Observers use `capture` only. Background observers receive the `Observed` payload and read the event from its `input` or `output`; HTTP route handlers still receive the `HttpRequest`.
- Failure audit observers capture `["input", "error"]` with an `error` filter for thrown errors, and `["input", "output"]` with an `output.success == false` filter for soft failures.
- When the state or http worker has not registered within 30 seconds of boot, `agentmemory status` reports it as `pending` instead of falling back. Its observers attach as soon as the worker connects.

## Custom deployments

Custom Compose manifests must pin `state` 0.23.x and `http` 0.23.x with a 0.26 engine. An `iii-sandbox` entry under `engine.workers` or in `config.yaml` is refused by 0.26; see the [iii 0.26 migration guide](https://iii.dev/docs/upgrading/from-0-25-x).
