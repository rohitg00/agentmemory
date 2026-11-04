# DeepSeek Harness

Tested with DeepSeek Harness (`dsh`) 0.2.1-rc.2.

Start AgentMemory, then connect the MCP tools:

```bash
npx @agentmemory/agentmemory
# In another terminal:
npx @agentmemory/agentmemory connect dsh
```

The adapter writes the home-level `$DSH_HOME/cordis.patch.yml`, shared by all Harness profiles. `DSH_HOME` defaults to `~/.dsh`. Existing plugins are preserved. Use `--force` to refresh an existing AgentMemory entry after upgrading.

Setup also adds memory tool guidance to `$DSH_HOME/AGENTS.md`, preserving existing instructions. Harness loads it on the first request. Pass `--no-guidelines` to skip this file.

## Automatic capture

Install AgentMemory in a stable location, then enable its bundled native DSH plugin:

```bash
npm install -g @agentmemory/agentmemory
agentmemory connect dsh --with-hooks
```

Restart Harness after setup. The plugin captures user prompts, assistant replies, tool results and failures, permission prompts, and compaction summaries. It starts and ends memory sessions and supplies saved context as reference data before the first model request. Images and synthetic user messages are excluded from capture. Tool capture honors `AGENTMEMORY_CAPTURE_ALLOW`, `AGENTMEMORY_CAPTURE_DENY`, and `AGENTMEMORY_CAPTURE_OUTPUT_MAX` (8,000 characters by default). Failed observation deliveries use AgentMemory's bounded local capture spool and retry while Harness runs or when it next starts.

The patch points to `dist/integrations/dsh.mjs` inside your AgentMemory installation. Keep that installation available; after upgrading or moving it, run `agentmemory connect dsh --with-hooks` to repair the path while preserving custom MCP settings, other plugins and operation placement.

If setup detects the old Claude Code bridge, it asks you to run `agentmemory connect dsh --with-hooks --force` to replace it with the native plugin. This also refreshes the AgentMemory MCP entry; existing hook manifest files are left untouched. No separate DSH plugin package is required.

## Custom server and authentication

Set `AGENTMEMORY_URL` and, when needed, `AGENTMEMORY_SECRET` in the environment that launches Harness. The MCP entry evaluates these variables at Harness startup through its `!!js` configuration syntax. Credentials are not copied into the patch file.

Without an explicit URL, the server defaults to `http://localhost:3111`. Local MCP connections can discover the daemon's saved credentials. Remote servers need HTTPS and their matching bearer token in `AGENTMEMORY_SECRET`. The native capture plugin reads these settings directly and can also discover saved local credentials.

Ask the agent to save a distinct test fact and recall it in a new session. With hooks enabled, also confirm the session and prompt appear in the AgentMemory viewer; successful MCP calls alone do not verify automatic capture.
