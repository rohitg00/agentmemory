<h1 align="center">
  <img src="https://github.com/moonshotai.png?size=80" alt="Kimi Code" width="28" height="28" align="center" />
  &nbsp;agentmemory for Kimi Code CLI
</h1>

<p align="center">
  <strong>Your Kimi agent remembers everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — 95.2% retrieval accuracy on <a href="https://arxiv.org/abs/2410.10813">LongMemEval-S</a>.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-53_tools-1f6feb?style=flat-square" alt="53 MCP tools" />
  <img src="https://img.shields.io/badge/Skill-auto_save-1f6feb?style=flat-square" alt="Auto-save skill" />
  <img src="https://img.shields.io/badge/R@5-95.2%25-00875f?style=flat-square" alt="95.2% R@5" />
</p>

---

## Overview

Kimi Code CLI connects to agentmemory via **MCP** (Model Context Protocol). This integration provides 53 memory tools for manual save/recall/search operations.

> **Important:** Kimi Code CLI does **not** currently expose a native hook/plugin API (like Claude Code's `hooks.json` or OpenCode's plugin SDK). Therefore **auto-capture of live sessions is not available** — memories must be saved manually or via the auto-save skill instructions.

### What's available now

| Feature | Status | How |
|---------|--------|-----|
| 53 MCP tools | ✅ | Via `mcp.json` — `memory_save`, `memory_smart_search`, `memory_recall`, etc. |
| Semantic search | ✅ | `memory_smart_search` — BM25 + vector + graph |
| Real-time viewer | ✅ | `http://localhost:3113` |
| Auto-save skill | ✅ | `SKILL.md` instructs Kimi to save key decisions automatically |
| Native hooks (auto-capture) | ❌ | Requires hook API support from Kimi CLI team |

---

## Quick start

### 1. Start the agentmemory server

```bash
npx @agentmemory/agentmemory
# or if installed globally:
agentmemory
```

The server starts on `http://localhost:3111`.

### 2. Configure the MCP server

Add to `~/.kimi-code/mcp.json` (merge into existing `mcpServers`):

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}
```

### 3. Configure LLM provider (optional but recommended)

Create `~/.agentmemory/.env`:

```bash
# OpenRouter (cost-efficient, recommended)
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=deepseek/deepseek-v4-pro

# Local embeddings (free, offline)
EMBEDDING_PROVIDER=local

# Enable full feature set
GRAPH_EXTRACTION_ENABLED=true
CONSOLIDATION_ENABLED=true
AGENTMEMORY_AUTO_COMPRESS=true
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_TOOLS=all
```

### 4. Install the skill

Copy this directory's `SKILL.md` into Kimi's skills folder:

```bash
mkdir -p ~/.kimi-code/skills/agentmemory-kimi
# Copy SKILL.md from this directory
cp plugin/kimi-code/SKILL.md ~/.kimi-code/skills/agentmemory-kimi/
```

Restart Kimi Code CLI or start a new session for the skill to take effect.

### 5. Verify

In a new Kimi session, ask:

> "Show me my agentmemory status"

Kimi should call `memory_sessions` or `memory_smart_search` and return results.

---

## How memory flows

### Manual mode (current — no native hooks)

```
User: "Remember that I prefer TypeScript strict mode"
  → Kimi calls memory_save
  → Stored in agentmemory SQLite
  → Available in future sessions via memory_smart_search
```

### Skill-assisted auto-save

The included `SKILL.md` instructs Kimi to automatically call `memory_save` after:

- Architecture decisions (tech stack, patterns, conventions)
- Setup/configuration changes (env vars, dependencies, infra)
- Bug fixes with root cause analysis
- Important project discoveries (workarounds, gotchas)
- User preference statements (language, style, workflow)

### Context injection

At the start of a new session, Kimi can call `memory_smart_search` with the project path to retrieve relevant memories and inject them into the conversation context.

---

## Available MCP tools

### Core (always available)

| Tool | Purpose |
|------|---------|
| `memory_save` | Store a fact, decision, or pattern |
| `memory_recall` | Search past observations |
| `memory_smart_search` | Hybrid semantic + keyword search |
| `memory_sessions` | List recent sessions |
| `memory_file_history` | Past observations about specific files |
| `memory_profile` | Project profile (concepts, files, patterns) |
| `memory_timeline` | Chronological observations |

### Extended (53 total)

| Tool | Purpose |
|------|---------|
| `memory_graph_query` | Knowledge graph traversal |
| `memory_consolidate` | Run 4-tier memory consolidation |
| `memory_claude_bridge_sync` | Sync with MEMORY.md |
| `memory_action_create` | Create work items with dependencies |
| `memory_signal_send` | Inter-agent messaging |
| `memory_snapshot_create` | Git-versioned snapshot |
| `memory_diagnose` | Health checks |
| `memory_heal` | Auto-fix stuck state |

Full list: `curl http://localhost:3111/agentmemory/mcp/tools`

---

## What's not covered (vs Claude Code plugin)

| Claude feature | Status in Kimi | Reason |
|---------------|----------------|--------|
| SessionStart hook | ❌ | Kimi CLI has no hook API |
| PostToolUse hook | ❌ | Kimi CLI has no hook API |
| PreCompact hook | ❌ | Kimi CLI has no hook API |
| Stop/SessionEnd hook | ❌ | Kimi CLI has no hook API |
| Auto-capture (zero manual) | ❌ | Requires hook API |
| Manual save via MCP | ✅ | Works today |
| Skill-assisted auto-save | ✅ | Via included SKILL.md |
| Semantic search | ✅ | Works today |
| Context injection | ✅ | Via memory_smart_search |

---

## Requesting native hook support

For full auto-capture (like Claude Code), Kimi Code CLI needs a hook/plugin API. 

Please upvote or comment on:
- **Kimi Code CLI issue:** [Feature request: Plugin/hook API for session lifecycle events](https://github.com/MoonshotAI/kimi-code/issues)

Once Kimi CLI supports hooks (SessionStart, PostToolUse, PreCompact, SessionEnd), this integration can be upgraded to full auto-capture with zero manual effort.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| MCP tools not appearing | Ensure `~/.kimi-code/mcp.json` is correct and restart Kimi CLI completely (not session reload) |
| `memory_save` not found | Start agentmemory server: `npx @agentmemory/agentmemory` |
| Empty search results | Memories need time for LLM compression. Wait 5-10s after save before searching. |
| Viewer shows 0 active sessions | Normal — Kimi CLI does not send session events. Only manual saves appear. |
| High API costs | Use `OPENROUTER_MODEL=deepseek/deepseek-chat` (~$0.40/35h) or local Ollama |

---

## See also

- [agentmemory main docs](https://github.com/rohitg00/agentmemory)
- [Claude Code plugin](../.claude-plugin/)
- [OpenCode plugin](../opencode/)
- [Codex CLI plugin](../.codex-plugin/)
