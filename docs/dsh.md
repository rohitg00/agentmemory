# DeepSeek Harness

Tested with DeepSeek Harness (`dsh`) 0.2.1-rc.2.

Start AgentMemory, then connect the MCP tools:

```bash
npx @agentmemory/agentmemory
# In another terminal:
npx @agentmemory/agentmemory connect dsh
```

The adapter writes the home-level `$DSH_HOME/cordis.patch.yml`, shared by all Harness profiles. `DSH_HOME` defaults to `~/.dsh`. Existing plugins are preserved. Use `--force` to refresh an existing AgentMemory entry after upgrading.

## Automatic capture

The hooks bridge is optional and is not included in the stock Harness installation. Install it and its protocol dependency in every profile you use before enabling hooks. For the tested `headless` profile:

```bash
dsh plugin --profile headless add @deepseek-ai/dsh-hooks-claude-code@0.2.1-rc.2
dsh plugin --profile headless add @deepseek-ai/dsh-hook-protocol@0.2.1-rc.2
npx @agentmemory/agentmemory connect dsh --with-hooks
```

Replace `headless` with your profile name. Restart Harness after setup. Without the bridge package, MCP tools can work while automatic capture remains inactive; inspect Harness startup logs for plugin-load errors.

The tested bridge removes secret environment variables before launching hook scripts. Local capture therefore needs the daemon's saved credentials in the same home directory, normally `~/.agentmemory/secret`. Remote capture with an environment-only bearer token is not supported by this bridge version; use the MCP tools for that setup.

The generated `$DSH_HOME/agentmemory.hooks.json` uses bundled AgentMemory hook scripts. Re-run `npx @agentmemory/agentmemory connect dsh --with-hooks --force` after upgrading AgentMemory to refresh their paths.

## Custom server and authentication

Set `AGENTMEMORY_URL` and, when needed, `AGENTMEMORY_SECRET` in the environment that launches Harness. The MCP entry evaluates these variables at Harness startup through its `!!js` configuration syntax. Credentials are not copied into the patch file.

Without an explicit URL, the server defaults to `http://localhost:3111`. Local MCP connections can discover the daemon's saved credentials. Remote servers need their matching bearer token in `AGENTMEMORY_SECRET`.

Ask the agent to save a distinct test fact and recall it in a new session. With hooks enabled, also confirm the session and prompt appear in the AgentMemory viewer; successful MCP calls alone do not verify automatic capture.
