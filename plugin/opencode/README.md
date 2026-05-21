<h1 align="center">
  <img src="https://github.com/opencode-ai.png?size=80" alt="OpenCode" width="28" height="28" align="center" />
  &nbsp;agentmemory for OpenCode
</h1>

<p align="center">
  <strong>Your OpenCode agents remember everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — 95.2% retrieval accuracy on <a href="https://arxiv.org/abs/2410.10813">LongMemEval-S</a>.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-53_tools-1f6feb?style=flat-square" alt="53 MCP tools" />
  <img src="https://img.shields.io/badge/Plugin-22_hooks-1f6feb?style=flat-square" alt="22 hooks" />
  <img src="https://img.shields.io/badge/Commands-2_slash-1f6feb?style=flat-square" alt="2 slash commands" />
  <img src="https://img.shields.io/badge/R@5-95.2%25-00875f?style=flat-square" alt="95.2% R@5" />
</p>

---

## Quick start

### 1. Start the agentmemory server

```bash
npx @agentmemory/agentmemory
```

The server starts on `http://localhost:3111`.

### 2. Configure the MCP server

Add to `~/.config/opencode/opencode.json` or your project's `.opencode/opencode.json`:

```json
{
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": ["npx", "-y", "@agentmemory/mcp"],
      "enabled": true
    }
  }
}
```

### 3. Install the plugin

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["./plugins/agentmemory-capture.ts"]
}
```

Copy the plugin file from this repo:

```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
```

### 4. Add the slash commands

Copy the commands into your project or global `.opencode/commands/` directory:

```bash
mkdir -p ~/.config/opencode/commands
cp plugin/opencode/commands/recall.md ~/.config/opencode/commands/
cp plugin/opencode/commands/remember.md ~/.config/opencode/commands/
```

Restart OpenCode or open a new session. The plugin auto-captures everything.

## What gets captured

### Session lifecycle

| Event | Hook | agentmemory API |
|---|---|---|
| Session start | `session.created` | POST /session/start |
| Idle → summarize | `session.idle` + `session.status` (idle) | POST /summarize |
| Status transitions | `session.status` (idle/busy/retry) | POST /observe |
| Compaction | `session.compacted` | POST /summarize + POST /observe |
| Metadata updates | `session.updated` | POST /observe |
| Code change tracking | `session.diff` | POST /observe |
| Session delete | `session.deleted` | POST /session/end |
| Session error | `session.error` | POST /observe |

### Messages & prompts

| Event | Hook | agentmemory API |
|---|---|---|
| User prompt (rich) | `chat.message` | POST /observe |
| User prompt metadata | `message.updated` (user) | POST /observe |
| Assistant response | `message.updated` (assistant) | POST /observe |
| Message removed (undo) | `message.removed` | POST /observe |

### Parts & steps

| Event | Hook | agentmemory API |
|---|---|---|
| Subagent start | `message.part.updated` (subtask) | POST /observe |
| Tool completed | `message.part.updated` (tool completed) | POST /observe |
| Tool error | `message.part.updated` (tool error) | POST /observe |
| Step finish (cost/tokens) | `message.part.updated` (step-finish) | POST /observe |
| Reasoning trace | `message.part.updated` (reasoning) | POST /observe |
| Patch applied | `message.part.updated` (patch) | POST /observe |
| Auto/manual compaction | `message.part.updated` (compaction) | POST /observe |
| Agent selection | `message.part.updated` (agent) | POST /observe |
| API retry | `message.part.updated` (retry) | POST /observe |

### File enrichment pipeline

| Event | Hook | agentmemory API |
|---|---|---|
| File tool params | `tool.execute.before` → stash paths | — |
| File edited | `file.edited` → stash paths | — |
| File part attached | `message.part.updated` (file) → stash paths | — |
| Enrichment inject | `experimental.chat.system.transform` | POST /enrich → `output.system[]` |
| Memory context inject | `experimental.chat.system.transform` | POST /context → `output.system[]` |

### Permissions

| Event | Hook | agentmemory API |
|---|---|---|
| Permission prompt | `permission.updated` | POST /observe |
| Permission reply | `permission.replied` | POST /observe |

### Tasks & commands

| Event | Hook | agentmemory API |
|---|---|---|
| Task tracking (w/ priority) | `todo.updated` | POST /observe |
| Command executed | `command.executed` | POST /observe |

### Model & config

| Event | Hook | agentmemory API |
|---|---|---|
| LLM parameters | `chat.params` | POST /observe |
| Config loaded | `config` | POST /observe |
| Compaction (WIP) | `experimental.session.compacting` | POST /context → `output.context[]` |

### File enrichment + memory injection (two-layer pipeline)

`experimental.chat.system.transform` fires before every LLM call and injects two layers of context:

1. **Memory context** (once per session): calls `/agentmemory/context` and injects project profile, recent session summaries, and important past observations into the system prompt. This is the OpenCode equivalent of Claude's MEMORY.md bridge — instead of syncing to a markdown file, context is injected directly into the system prompt.

2. **File enrichment** (every turn with stashed files): calls `/agentmemory/enrich` with files stashed by `tool.execute.before`, `file.edited`, and `message.part.updated` (file parts). File-specific context (past observations, related bugs, semantic search) is injected into the system prompt.

```text
System prompt = [OpenCode instructions] + [memory context] + [file enrichment] + [user message]
                                        ^                 ^
                               first turn only         every file-touching turn
```

**Differences from Claude's PreToolUse:**

| Dimension | Claude (PreToolUse) | OpenCode (two-hop pipeline) |
|---|---|---|
| Injection mechanism | stdout → context window | `output.system[]` → system prompt |
| Timing | Same turn (parallel with tool) | Next turn (before next LLM call) |
| File set | Per-tool (immediate) | Batched (all files since last enrichment) |
| Coverage | Edit/Write/Read/Glob/Grep only | Edit/Write/Read/Glob/Grep only |
| What gets injected | `<agentmemory-file-context>` + bug memories | Identical `/enrich` response |

## MEMORY.md vs AGENTS.md: how context flows

Claude Code and OpenCode take fundamentally different approaches to injecting memory context into the agent's system prompt.

### Claude Code: file-backed bridge (two-hop)

```
agentmemory  ──write──▶  MEMORY.md  ──read──▶  Claude system prompt
```

- The `claude-bridge/sync` endpoint serializes agentmemory observations into a `MEMORY.md` file in the project root
- Claude Code reads `MEMORY.md` on session start and prepends it to the system prompt
- **Sync is periodic** — sessions only get fresh context when the bridge last ran (session end, pre-compact)
- **Coupling**: memory data lives in a git-trackable file, visible to CI, team members, and other tools

### OpenCode: direct injection (one-hop)

```
agentmemory  ──push──▶  OpenCode system prompt
```

- `experimental.chat.system.transform` calls `/context` at runtime and pushes the response directly into `output.system[]`
- **Always current** — context is fetched at session start (once) and before file-touching turns (per-batch)
- **No file intermediary** — no stale copies, no merge conflicts, no disk I/O
- `AGENTS.md` is a static instruction file for project conventions, coding standards, and tool guidance — agentmemory does not read or write it

### Tradeoffs

| Dimension | Claude (MEMORY.md bridge) | OpenCode (direct injection) |
|---|---|---|
| Freshness | Stale between syncs | Always current (fetched at call time) |
| Visibility | Human-readable file in repo | In-memory injection only |
| Simplicity | Two moving parts (bridge + file) | One step (API → system prompt) |
| Team sharing | File is git-trackable, CI-friendly | Memory shared via agentmemory server API |
| Integration | Any tool can read MEMORY.md | Requires OpenCode plugin SDK |

### Why OpenCode goes direct

agentmemory already persists everything in SQLite (`data/state_store.db`). Adding an intermediate MEMORY.md file would duplicate data, introduce sync lag, and require the model to re-parse structured context from markdown. Direct injection delivers the same data with lower latency and zero staleness — the agent always sees what agentmemory knows right now.

## Slash commands

- `/recall <query>` — Search past observations and lessons
- `/remember <text>` — Save an insight to long-term memory

## Session instruction injection

Agentmemory usage instructions are injected into the system prompt on the first turn of every session via `experimental.chat.system.transform` (alongside memory context from `/context`). This is functionally equivalent to Claude Code's skills mechanism — the agent learns which `agentmemory_memory_*` tools to use and when, without needing separate skill invocations.

## What's not covered (vs Claude Code plugin)

| Claude feature | Reason |
|---|---|
| SubagentStop | OpenCode's `SubtaskPart` type has no completion/result fields; subtask lifecycle ends are not exposed as distinct events in the OpenCode SDK |
| TaskCompleted | No team/teammate concept in OpenCode; `todo.updated` captures task state changes as a partial equivalent |
| Stop | `session.compacted` event handler exists; `experimental.session.compacting` injection hook defined in SDK but Go binary (v1.14.41) doesn't wire it — will auto-activate when upstream implements it |
| Skills (remember/recall/forget/session-history) | Covered by injected system instructions via `experimental.chat.system.transform` — agent receives usage guidance on first turn |
| Consolidation pipeline (crystals/auto + consolidate-pipeline) | Now called on `session.deleted` — mirrors Claude's `CONSOLIDATION_ENABLED=true` behavior |
| Claude MEMORY.md bridge | OpenCode-specific; OpenCode uses its own AGENTS.md mechanism, not Claude's MEMORY.md |

All other Claude Code hooks have direct or pipeline equivalents in this plugin. 12 of 12 Claude hook types covered.
