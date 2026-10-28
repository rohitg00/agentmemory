# Agent Memory for Antigravity

Start the Agent Memory daemon, then configure the surface you use:

```sh
agentmemory connect antigravity-cli --with-hooks
# Antigravity IDE or 2.0:
agentmemory connect antigravity --with-hooks
```

Current Antigravity surfaces share `~/.gemini/config/mcp_config.json` and
`~/.gemini/config/hooks.json`. Workspace overrides live in `.agents/`. Restart the
host after installation. In the CLI, `agy mcp list` lists configured servers and
`/hooks` shows active hooks. This integration uses the MCP connector and bundled
hook scripts; the repository does not yet ship an Antigravity plugin bundle.

Older Agent Memory connectors wrote the IDE config into its application-support
directory and used shell-style environment defaults that Antigravity does not
expand. After upgrading, inspect your agentmemory MCP settings, then rerun the
appropriate command with `--force` to refresh that entry. Other servers and hook
bundles are preserved. Custom values on the agentmemory entry must be reapplied.

Launch the host with `AGENTMEMORY_URL` for a custom daemon endpoint and
`AGENTMEMORY_SECRET` when remote authentication requires it. The generated entry
inherits the process environment. Local clients also read the daemon-generated
credential. Do not paste secrets into committed configuration.

## Capture behavior

- The first model invocation opens the session. With
  `AGENTMEMORY_INJECT_CONTEXT=true`, recalled context is passed back through
  Antigravity's `injectSteps` response.
- Tool names, inputs, and reported failures are captured. Native PostToolUse
  payloads currently omit successful tool output, so full output replay is not
  available through this hook alone.
- Explicit user prompts are backfilled from the host transcript when execution
  becomes fully idle. Repeated backfills and tool deliveries use stable event IDs.
- Idle Stop closes the session once. Stops with pending background work do not
  close it.

Keep the installed package path free of spaces for Antigravity hook command
compatibility. The installer warns and skips hooks when that condition is not met.
MCP can still be configured. Re-run `connect ... --with-hooks` after moving or
upgrading the package so absolute script paths stay current.

## Repeat the native CLI test

```sh
npm run build
AGENTMEMORY_TEST_ANTIGRAVITY=/absolute/path/to/agy node scripts/plugins/test-antigravity-native.mjs
```

Verified with Antigravity CLI 1.3.0. The test uses a temporary profile, a synthetic
local Gemini endpoint, and a generated sample file. It checks connector discovery,
inherited MCP environment, recalled context reaching the model, native tool capture,
transcript prompt backfill, and one session lifecycle. It launches the bundled MCP
bridge from the checkout because the release-prep runtime is not yet published.
No Google account credentials or paid model calls are used.

The live daemon suite also exercises this bridge with the pinned iii engine,
including authentication, shared memory, offline capture recovery, and restart
persistence. IDE UI dispatch, native Windows execution, and an Antigravity plugin
bundle remain unverified or unimplemented.

Contract references checked October 6, 2026:

- [MCP configuration](https://antigravity.google/docs/mcp)
- [Hook events and payloads](https://antigravity.google/docs/hooks)
- [CLI model endpoint configuration](https://antigravity.google/docs/cli/install/)
