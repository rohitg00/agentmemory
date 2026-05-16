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

- claims the `plugins.slots.memory = "agentmemory"` slot via `api.registerMemoryCapability({ promptBuilder })` so OpenClaw recognises it as the active memory plugin
- recalls relevant long-term memory before the agent starts (via the `before_agent_start` hook)
- captures completed conversation turns after the agent finishes (via the `agent_end` hook)
- shares the same backend with Claude Code, Codex CLI, Gemini CLI, Hermes, pi, and other agents

### Memory runtime (current scope)

The plugin currently registers a `promptBuilder` only — not a full `MemoryPluginRuntime` adapter. OpenClaw's `MemoryRuntimeBackendConfig` type today is `{ backend: "builtin" }` or `{ backend: "qmd" }`; both are openclaw-internal backends that don't fit agentmemory's external REST shape. The hook-driven recall + capture flow above is the working integration path. If you need OpenClaw's in-process memory-runtime APIs (e.g. `getMemorySearchManager`) backed by agentmemory, file an upstream request against `openclaw` for an `"external"` backend type and we'll wire `runtime` here once the contract supports it.

## Troubleshooting

**Plugin validates but does not load** — make sure the folder contains `package.json`, `openclaw.plugin.json`, and `plugin.mjs`, and that `plugins.slots.memory` is set to `agentmemory`.

**`plugins.slots.memory = "agentmemory"` reports `unavailable`** — upgrade to v0.9.11+. Older versions of this plugin registered hooks but never called `api.registerMemoryCapability(...)`, so the memory-slot machinery did not consider the slot claimed. The current plugin registers a memory capability (prompt builder) at startup, which is the documented OpenClaw API for occupying the slot.

**Connection refused on port 3111** — the agentmemory server is not running. Start it with `npx @agentmemory/agentmemory`.

**No memories returned** — open `http://localhost:3113` and verify observations are being captured.

## See also

- [agentmemory main README](../../README.md)
- [Hermes integration](../hermes/README.md)
- [pi integration](../pi/README.md)

## License

Apache-2.0 (same as agentmemory)
