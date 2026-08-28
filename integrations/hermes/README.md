<p align="center">
  <img src="../../assets/banner.png" alt="agentmemory" width="640" />
</p>

<h1 align="center">
  <img src="https://github.com/NousResearch.png?size=80" alt="Hermes Agent" width="28" height="28" align="center" />
  &nbsp;agentmemory for Hermes Agent
</h1>

<p align="center">
  <strong>Your Hermes agent remembers everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — 95.2% retrieval accuracy on <a href="https://arxiv.org/abs/2410.10813">LongMemEval-S</a>. Cross-agent shared with Claude Code, Cursor, OpenCode, and more.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-54_tools-1f6feb?style=flat-square" alt="54 MCP tools" />
  <img src="https://img.shields.io/badge/Hooks-6_lifecycle-1f6feb?style=flat-square" alt="6 lifecycle hooks" />
  <img src="https://img.shields.io/badge/R@5-95.2%25-00875f?style=flat-square" alt="95.2% R@5" />
  <img src="https://img.shields.io/badge/Self--hosted-yes-00875f?style=flat-square" alt="Self-hosted" />
  <img src="https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square" alt="Apache 2.0" />
</p>

---

## Install it in 30 seconds

**Paste this prompt into Hermes** and it does the whole setup for you:

```text
Install agentmemory for Hermes. Run `npx @agentmemory/agentmemory` in a
separate terminal to start the memory server on localhost:3111. Then
run `agentmemory connect hermes` to render the profile-bound snippet and
add it to the active Hermes config: `$HERMES_HOME/config.yaml` when set,
`%LOCALAPPDATA%\hermes\config.yaml` on Windows, or
`~/.hermes/config.yaml` on macOS/Linux. Hermes can then use agentmemory
as an MCP server with the profile-scoped memory tools:

mcp_servers:
  agentmemory:
    command: npx
    args: ["-y", "@agentmemory/mcp"]
    env:
      AGENT_ID: "default" # use the exact owning Hermes profile id
      AGENTMEMORY_AGENT_SCOPE: "isolated"
    tools:
      include:
        - memory_save
        - memory_recall
        - memory_smart_search
        - memory_sessions

memory:
  provider: agentmemory

Verify it's working with
`curl http://localhost:3111/agentmemory/health` — it should return
{"status":"healthy"}. Open the real-time viewer at
http://localhost:3113 to watch memories being captured live.

If I want deeper integration — pre-LLM context injection, turn-level
capture, memory-write mirroring to MEMORY.md, and system prompt block
injection — copy `integrations/hermes` from the agentmemory repo to
the active Hermes home's `plugins/agentmemory` directory instead. That gives me the
6-hook memory provider plugin on top of the MCP server.
```

That's it. Hermes handles the rest.

## Quick setup

### Option 1: MCP server (zero code)

Run `agentmemory connect hermes` to derive the owning profile id, then add
its snippet to the active config. Use `$HERMES_HOME/config.yaml` when set;
otherwise use `%LOCALAPPDATA%\hermes\config.yaml` on Windows or
`~/.hermes/config.yaml` on macOS/Linux:

```yaml
mcp_servers:
  agentmemory:
    command: npx
    args: ["-y", "@agentmemory/mcp"]
    env:
      AGENT_ID: "default" # use the exact owning Hermes profile id
      AGENTMEMORY_AGENT_SCOPE: "isolated"
    tools:
      include:
        - memory_save
        - memory_recall
        - memory_smart_search
        - memory_sessions

memory:
  provider: agentmemory
```

This gives Hermes access to the four MCP operations currently verified to enforce per-agent scope and enables the agentmemory memory provider. Use `default` for the root Hermes profile; in a named profile use its exact id (for example `<profile-id>` for `.../profiles/<profile-id>`). `agentmemory connect hermes` renders the correctly bound snippet from the active `HERMES_HOME`. Start the server separately:

```bash
npx @agentmemory/agentmemory
```

### Option 2: Memory provider plugin (deeper integration)

Copy this folder to your Hermes plugins directory:

```bash
cp -r integrations/hermes "${HERMES_HOME:-$HOME/.hermes}/plugins/agentmemory"
```

On Windows without an explicit `HERMES_HOME`, the target is
`%LOCALAPPDATA%\hermes\plugins\agentmemory`.

Start the agentmemory server:

```bash
npx @agentmemory/agentmemory
```

The plugin auto-detects the running server and hooks into the Hermes agent loop. Make sure `memory.provider` is set to `agentmemory` in the active Hermes `config.yaml` described above:

- `prefetch()` injects relevant memories before each LLM call
- `sync_turn()` captures every conversation turn in the background
- `on_session_end()` marks sessions complete for summarization
- `on_pre_compress()` re-injects context before compaction
- `on_memory_write()` mirrors MEMORY.md writes to agentmemory
- `system_prompt_block()` injects project profile at session start

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTMEMORY_URL` | `http://localhost:3111` | agentmemory server URL |
| `AGENTMEMORY_SECRET` | (none) | Auth token for protected instances |
| `AGENT_ID` | (none) | Fixed caller identity for `@agentmemory/mcp`; set it to the exact Hermes profile id. Model-supplied `agentId` values cannot override it in isolated mode. |
| `AGENTMEMORY_AGENT_SCOPE` | `shared` | `isolated` adds the profile id to recall/search/session reads; `shared` tags writes but keeps cross-profile recall. |
| `AGENTMEMORY_REQUIRE_HTTPS` | (off) | When set to `1`, refuse to send the bearer token over plaintext HTTP to a non-loopback host. Sends only when `AGENTMEMORY_URL` is `https://...` or points at `localhost`/`127.0.0.1`/`::1`. With this off, the plugin warns once on stderr but still sends. |

The plugin reads `~/.agentmemory/.env` (or `$XDG_CONFIG_HOME/agentmemory/.env`) at import time and populates any missing values into the process environment via `os.environ.setdefault`. Anything you set in the shell takes precedence; the file is only used to fill gaps. This means `hermes memory status` reports the plugin as available even when the agentmemory service is launched by systemd or another process manager that loads `~/.agentmemory/.env` directly without exporting it to the Hermes CLI shell (#250).

The memory-provider plugin derives its `agentId` from the explicit `hermes_home` Hermes passes during initialization (`.../profiles/<id>` → `<id>`, root home → `default`). It always tags writes. In isolated mode it pins context, recall, and search reads to that profile; shared mode preserves cross-agent recall. Agent-scoped context omits project profiles, lessons, and pinned slots, and agent-scoped smart search omits lessons, because those records do not carry `agentId`. The stdio MCP process receives the same fixed id out of band from model tool arguments. Because an MCP `env` block applies only to that subprocess, the Hermes host process (or its process manager) and the agentmemory daemon must also receive `AGENTMEMORY_AGENT_SCOPE=isolated` for strict provider + MCP separation.

The `tools.include` allowlist is intentional. Scoped export and targeted governance delete enforce `agentId`, but audit, bulk governance, coordination, and several advanced tools still have global or tool-specific semantics. Remove the allowlist only when cross-profile visibility is intended; sending `agentId` alone does not make every one of the 54 tools an isolation boundary.

## What Hermes gets

- 95.2% retrieval accuracy (LongMemEval-S, ICLR 2025)
- Hybrid search: BM25 + vector + knowledge graph
- Memory versioning, decay, and auto-forget
- Cross-agent: memories from Claude Code, Cursor, Gemini CLI all accessible
- Real-time viewer at http://localhost:3113

## How it works

Hermes has two memory files (MEMORY.md, USER.md) and SQLite full-text search. agentmemory adds structured memory on top:

| Hermes built-in | agentmemory adds |
|---|---|
| MEMORY.md (flat text) | Structured observations with facts, concepts, files |
| USER.md (preferences) | Project profiles with top patterns and conventions |
| SQLite FTS5 (session search) | BM25 + vector + knowledge graph (95.2% R@5) |
| Skills (self-improving) | Skill extraction from completed sessions |
| Single agent | Cross-agent memory via MCP + REST |
