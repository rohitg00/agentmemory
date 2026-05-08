<p align="center">
  <img src="../../assets/banner.png" alt="agentmemory" width="640" />
</p>

<h1 align="center">
  <img src="https://github.com/openclaw.png?size=80" alt="OpenClaw" width="28" height="28" align="center" />
  &nbsp;agentmemory for OpenClaw
</h1>

<p align="center">
  <strong>Your OpenClaw agents remember everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — 95.2% retrieval accuracy on <a href="https://arxiv.org/abs/2410.10813">LongMemEval-S</a>.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-43_tools-1f6feb?style=flat-square" alt="43 MCP tools" />
  <img src="https://img.shields.io/badge/Plugin-memory_slot-1f6feb?style=flat-square" alt="OpenClaw memory plugin" />
  <img src="https://img.shields.io/badge/R@5-95.2%25-00875f?style=flat-square" alt="95.2% R@5" />
  <img src="https://img.shields.io/badge/Self--hosted-yes-00875f?style=flat-square" alt="Self-hosted" />
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square" alt="Apache 2.0" />
</p>

---

## Install it in 30 seconds

**Paste this prompt into OpenClaw** and it does the whole setup for you:

```text
Install agentmemory for OpenClaw. Run `npx @agentmemory/agentmemory` in a separate terminal to start the memory server on localhost:3111.

For zero-code setup, add this MCP server so OpenClaw gets all 43 memory tools:

{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"]
    }
  }
}

For deeper memory integration, copy `integrations/openclaw` from the agentmemory repo to `~/.openclaw/extensions/agentmemory`, then enable it in `~/.openclaw/openclaw.json`:

{
  "plugins": {
    "slots": {
      "memory": "agentmemory"
    },
    "entries": {
      "agentmemory": {
        "enabled": true,
        "config": {
          "base_url": "http://localhost:3111",
          "token_budget": 2000,
          "min_confidence": 0.5,
          "fallback_on_error": true,
          "timeout_ms": 5000
        }
      }
    }
  }
}

Restart OpenClaw. Verify with `curl http://localhost:3111/agentmemory/health`. Open http://localhost:3113 for the real-time viewer.
```

That's it. OpenClaw handles the rest.

## Option 1: MCP server (zero code)

Start the agentmemory server in a separate terminal:

```bash
npx @agentmemory/agentmemory
```

Then add to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"]
    }
  }
}
```

OpenClaw now has access to all 43 MCP tools including `memory_recall`, `memory_save`, `memory_smart_search`, `memory_timeline`, `memory_profile`, and more.

## Option 2: OpenClaw memory plugin (deeper integration)

Copy this folder into OpenClaw's extension directory:

```bash
mkdir -p ~/.openclaw/extensions
cp -r integrations/openclaw ~/.openclaw/extensions/agentmemory
```

Then enable it in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "agentmemory"
    },
    "entries": {
      "agentmemory": {
        "enabled": true,
        "config": {
          "base_url": "http://localhost:3111",
          "token_budget": 2000,
          "min_confidence": 0.5,
          "fallback_on_error": true,
          "timeout_ms": 5000
        }
      }
    }
  }
}
```

What the plugin does:

- recalls relevant long-term memory before the agent starts
- captures completed conversation turns after the agent finishes
- shares the same backend with Claude Code, Codex CLI, Gemini CLI, Hermes, pi, and other agents

## Troubleshooting

**Plugin validates but does not load** — make sure the folder contains `package.json`, `openclaw.plugin.json`, and `plugin.mjs`, and that `plugins.slots.memory` is set to `agentmemory`.

**Connection refused on port 3111** — the agentmemory server is not running. Start it with `npx @agentmemory/agentmemory`.

**No memories returned** — open `http://localhost:3113` and verify observations are being captured.

## See also

- [agentmemory main README](../../README.md)
- [Hermes integration](../hermes/README.md)
- [pi integration](../pi/README.md)

## License

Apache-2.0 (same as agentmemory)
