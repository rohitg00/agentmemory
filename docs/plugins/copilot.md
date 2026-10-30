# GitHub Copilot setup and capture

MCP exposes memory tools. Automatic observation capture requires hooks as well. A working tool list alone does not prove that Copilot activity is being saved.

## Start the persistent service

Install Agent Memory and run its setup in a separate terminal:

```sh
npm install -g @agentmemory/agentmemory@latest
agentmemory
```

Then check `agentmemory status`. The API normally listens on port 3111; the viewer uses port 3113. A missing LLM provider disables optional compression and summarization. Capture, explicit saves, and keyword recall still work without a provider key. A Copilot subscription does not configure an Agent Memory LLM provider.

For this unreleased branch, run `npm run build` and use `node dist/cli.mjs` instead of the published CLI. Do not assume npm's latest version includes release-branch fixes.

## Copilot CLI

Choose either the full plugin or MCP-only wiring:

```sh
# Full plugin: MCP, skills, and lifecycle capture
copilot plugin install rohitg00/agentmemory:plugin

# Alternatively, tools and usage instructions without automatic capture
agentmemory connect copilot-cli
```

For a checkout of this branch, use `copilot plugin install /absolute/path/to/agentmemory/plugin`. Restart Copilot after installation or `copilot plugin update agentmemory`. Direct installs work in Copilot CLI 1.0.92 but that client warns that future versions will require marketplace installs.

The full plugin runs the bundled Node.js MCP bridge. Copilot loads the shared `.mcp.json` ahead of the manifest's `.mcp.copilot.json` reference, so both configurations must use that bridge. It forwards to the same persistent daemon as the hooks, reads locally generated credentials, and reports connection failures without switching to an in-memory store. It requires Node.js on Copilot's PATH and a running Agent Memory daemon.

The bridge and hooks inherit `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET` from the host environment. Local credentials are also read from `~/.agentmemory/.env` or `~/.agentmemory/secret`. For remote servers, set the URL and secret explicitly; use HTTPS for authenticated remote MCP connections. Tool visibility is controlled by the daemon's `AGENTMEMORY_TOOLS` setting.

Capture runs by default. To also inject recalled context at session start, launch Copilot with `AGENTMEMORY_INJECT_CONTEXT=true` in its environment. Copilot CLI consumes JSON `additionalContext`; VS Code uses `hookSpecificOutput.additionalContext`.

## VS Code Copilot: local agent sessions

`agentmemory connect copilot-cli` configures the standalone CLI, not VS Code. VS Code currently requires manual MCP and hook configuration. These instructions target local agent sessions; remote Agent Host sessions have their own hook environment.

Find the global package directory with `npm root -g`. In the examples below, replace `/ABSOLUTE/PACKAGE` with that directory followed by `/@agentmemory/agentmemory`. For a source checkout, use the checkout directory after building it. On Windows, use forward slashes in JSON paths or escape backslashes.

Merge this entry into `.vscode/mcp.json`, preserving your existing servers. VS Code uses `servers` as the top-level key:

```json
{
  "servers": {
    "agentmemory": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PACKAGE/plugin/scripts/plugin-bridge.mjs"]
    }
  }
}
```

The bundled bridge is present in the 0.9.30 release branch. Before that release is published, use a built checkout for this setup.

For automatic capture, create `.github/hooks/agentmemory.json` in the workspace:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node \"/ABSOLUTE/PACKAGE/plugin/scripts/session-start.mjs\""
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node \"/ABSOLUTE/PACKAGE/plugin/scripts/prompt-submit.mjs\""
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "node \"/ABSOLUTE/PACKAGE/plugin/scripts/post-tool-use.mjs\""
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "node \"/ABSOLUTE/PACKAGE/plugin/scripts/stop.mjs\""
      }
    ]
  }
}
```

Enable `chat.useHooks` and trust the workspace, then start a new local agent session. This captures prompts and completed tool calls as they happen; it does not require deleting a chat or closing VS Code. `Stop` requests session summarization after an agent turn. To inject recalled context, add `"env": { "AGENTMEMORY_INJECT_CONTEXT": "true" }` to the SessionStart entry.

Keep machine-specific absolute paths local, or adjust them for each machine. The hooks must run where the package, daemon, and memory data directory are accessible. If the daemon uses a custom `AGENTMEMORY_DATA_DIR`, pass the same directory to the hooks so offline capture is recovered on restart.

## Verify data, not just connectivity

1. Ask Copilot to save a unique synthetic fact with `memory_save`, then recall it with `memory_smart_search` in a new session.
2. Ask Copilot to read a small project file. Check `memory_sessions` for that session and a nonzero observation count. MCP-only setups need explicit saves; they do not automatically capture reads.
3. Run `agentmemory capture --json` to inspect offline spool records and failed capture delivery. `agentmemory capture --drain` requests recovery once the service is running.
4. If an older MCP log says `falling back to local InMemoryKV`, check the running daemon and update the MCP configuration. That fallback does not provide durable cross-session memory.

References: [Copilot plugin configuration](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference), [Copilot hook payloads](https://docs.github.com/en/copilot/reference/hooks-reference), [VS Code local hooks](https://code.visualstudio.com/docs/agents/reference/hooks-reference), [VS Code hook configuration](https://code.visualstudio.com/docs/agent-customization/hooks).

## Maintainer checks

After building, `node scripts/plugins/test-copilot-native.mjs` runs the actual Copilot plugin installer and runtime against a local synthetic model and capture server. Set `AGENTMEMORY_TEST_COPILOT` to the client executable and `AGENTMEMORY_TEST_COPILOT_SDK` to that client's bundled `copilot-sdk/index.js`. It uses a temporary home and project, verifies the loaded MCP command and skills, then checks prompt/tool capture and context delivery. It does not require a Copilot account or send project data to a model provider.

To separately verify persistent storage and recovery with the pinned iii engine, build the Codex package with `node scripts/plugins/package-codex.mjs`, then set `AGENTMEMORY_TEST_III` to the engine executable and run `node node_modules/vitest/vitest.mjs run test/codex-live-daemon.test.ts`. That suite exercises both Codex and Copilot configurations.
