# Agent Memory for local Codex

The plugin connects Codex to your running Agent Memory daemon through a bundled
stdio MCP bridge. It uses the same store as your configured Claude Code client.
It includes 17 shared skills, the daemon's enabled tools, three fixed resources,
three resource templates, and three prompts. The default daemon exposes 54 tools;
features such as embeddings, reflection, and team operations still need their
normal runtime configuration. Six optional hooks provide automatic capture on
Codex versions that support and trust them.

## Build and try the current source

Use Node.js 20+ and the system `zip` utility on macOS or Linux. From the repository:

```sh
npm install --legacy-peer-deps --no-audit --no-fund
npm run plugin:pack:codex
node dist/cli.mjs
```

The final command starts Agent Memory and may offer to install its pinned iii
engine. Keep the daemon running. In another terminal, use `node dist/cli.mjs status`
to check it. Use the built runtime when testing unreleased main; the published npm
package can lag the checkout.

Packaging creates `dist/plugins/agentmemory-codex-local/` and a versioned ZIP.
The archive has `.codex-plugin/plugin.json` and `.mcp.json` at its root, and
contains the bundled bridge, shared skills, icon, and supported hook scripts.
It excludes the Claude and Copilot manifests so their defaults cannot override
Codex configuration. `build-info.json` records the base revision and archive hashes;
uncommitted changes are included in the build, so it is not a release attestation.

Install the built folder through its generated local marketplace:

`agentmemory-local-preview` names this local test marketplace. It is not an npm
package or a public directory listing.

```sh
codex plugin marketplace add ./dist/plugins
codex plugin add agentmemory@agentmemory-local-preview
```

Restart Codex, inspect its MCP connection, and run the onboarding starter prompt.
Local installation copies the plugin into Codex's cache. After changing source,
rebuild and refresh or reinstall the preview; editing the source folder alone
does not update an installed copy.

After the feature is released in the repository, marketplace installation is:

```sh
codex plugin marketplace add rohitg00/agentmemory
codex plugin add agentmemory@agentmemory
```

Those marketplace commands track published repository content. They do not install
unpublished changes from your working tree. Restart Codex after installation.

## Connection and capture

The bridge runs with `node scripts/plugin-bridge.mjs` from the installed plugin
directory. Codex resolves its relative `cwd` to that directory, including paths
with spaces. No npm download occurs when the bridge starts.

Default daemon URL: `http://localhost:3111`. Local authentication works without
copying a secret into Codex: the bridge uses `AGENTMEMORY_SECRET` from the host
environment, then the secret in `~/.agentmemory/.env`, then the daemon-generated
`~/.agentmemory/secret`. It rereads credentials for each request so a daemon
started after the bridge can connect without reinstalling the plugin.

For a custom port, supply `AGENTMEMORY_URL` to the MCP host and reconnect MCP.
Local credential files are read only for loopback URLs. A remote daemon requires
an explicit host `AGENTMEMORY_SECRET` and HTTPS when authenticated. Never put
credential values in a plugin manifest or archive.

`agentmemory connect codex` remains the alternative for MCP-only setup. If that
connection already exists, choose either it or the plugin's MCP connection to
avoid duplicate tools. Do not overwrite unrelated Codex configuration.

Check `/hooks` and trust the plugin hooks before expecting automatic capture.
Some Codex versions require `agentmemory connect codex --with-hooks` for global
hooks. Inspect the existing configuration first: enabling both native plugin
hooks and global copies can duplicate capture. Validate one captured event in
your host. On uninstall, remove any separately installed global hook entries or
MCP entry you no longer want; deleting the plugin does not remove your memories.

The bridge returns a visible failure if the daemon is stopped or authentication
fails. It does not save into the standalone fallback store. It does not retry
mutations automatically; a timeout can happen after a write committed, so inspect
state before retrying. Reconnect after changing the daemon's enabled tool surface.

Capture hooks ship with their shared `_capture.mjs` dependency. During an outage,
supported hooks retain observations in the runtime's bounded local spool. Inspect
it with `agentmemory capture --json`. The daemon recovers its spool at startup;
use `agentmemory capture --drain` to request recovery while it is running. Use the same port
and data-directory settings as the hooks. This recovery applies to captured
observations; failed MCP tool writes are not queued automatically.

## Verify before distributing

After packaging, run the live smoke test with an already installed binary matching
`III_PINNED_VERSION` in `src/version.ts`:

```sh
AGENTMEMORY_TEST_III=/absolute/path/to/iii npm run test:plugin:live
```

It starts a real engine and worker on temporary loopback ports, with a temporary
store and no model credentials. It checks daemon-generated authentication,
packaged hook capture and offline recovery, both MCP entry points sharing
memories, resources, prompts, lessons, deletion, outage failures, and persistence
across an engine restart. It launches hook scripts directly;
desktop hook dispatch and host trust UI still require a manual host test. The
normal test suite skips this check unless the engine path is explicitly set.

To exercise native plugin discovery and hook dispatch with an installed Codex CLI:

```sh
npm run plugin:pack:codex
AGENTMEMORY_TEST_CODEX=/absolute/path/to/codex node scripts/plugins/test-codex-native.mjs
```

The test uses a temporary home and a synthetic local Responses API to make Codex
read one generated file. It checks MCP startup, session context reaching the model,
prompt/tool capture, and session completion. It trusts only the built test plugin
for that invocation through Codex's automation flag. No account credentials or
paid model calls are used. Verified with Codex CLI 0.150.1; desktop trust UI and
PreCompact dispatch are separate checks.

The current `connect codex --with-hooks` path skips hook installation if MCP is
already wired. The native plugin path above works. For global hooks, inspect your
agentmemory MCP settings before using `--force`, which rewrites that MCP entry.

After publishing the selected runtime and shim versions, run:

```sh
npm run plugin:verify:published
```

This read-only registry check rejects mismatched runtime, shim, and engine SDK
versions, including a reused version whose published engine dependencies differ
from source. It requires an exact shim-to-runtime dependency. Building a ZIP does
not publish the matching daemon; do not distribute it as a release until this
check passes. The check does not establish OpenAI directory eligibility.

## Data and costs

Basic keyword recall requires no model key. Storage remains in the configured
daemon's local state. Local embeddings need an optional model download and local
compute. Compression, reflection, and external embeddings can use model tokens
and send selected content to the configured provider. Context injection consumes
the coding agent's context budget. Enable these features deliberately.

Memory results are evidence, not instructions. Respect user rules about saving,
verify changing facts against current code, and avoid saving secrets. Project
metadata is a retrieval aid, not an account or tenant authorization boundary.

## Public directory submission

The generated `agentmemory-codex-review` ZIP has MCP and skills but no lifecycle
hooks. It is a preparation artifact, not a submission-ready claim. OpenAI's
standard public flow currently expects a production HTTPS MCP server. Its guide
directs authors who need local MCP to contact OpenAI for support. Confirm local
stdio eligibility and the supported test environment before submitting this
archive. Removing hooks does not remove that requirement.

Once eligibility is confirmed: select a verified developer identity in the
[plugin dashboard](https://platform.openai.com/plugins), upload the complete MCP
package, resolve validation findings, supply five positive and three negative
tested scenarios plus an accessible demo, and submit for review. Publish after
approval. Privacy, terms, support details, and any required review access must be
real and accessible; this build does not invent those URLs or credentials.

See the repository's `docs/plugins/codex-submission.md` for the local-support brief
and proposed reviewer scenarios. Rebuild against the final release commit after
pending PRs merge, align runtime and manifest versions, and repeat artifact tests.

Sources checked October 1, 2026:

- [Packaging and local runtime](https://developers.openai.com/plugins/build/plugins)
- [Submission requirements](https://developers.openai.com/plugins/deploy/submission)
- [Local MCP eligibility](https://developers.openai.com/plugins/guides/submit-claude-plugin)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
