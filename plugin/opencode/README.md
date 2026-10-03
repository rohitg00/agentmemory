<h1 align="center">
  <img src="https://github.com/opencode-ai.png?size=80" alt="OpenCode" width="28" height="28" align="center" />
  &nbsp;agentmemory for OpenCode
</h1>

<p align="center">
  <strong>Your OpenCode agents remember everything. No more re-explaining.</strong><br/>
  <sub>Persistent cross-session memory via <a href="https://github.com/rohitg00/agentmemory">agentmemory</a> — 95.2% retrieval accuracy on <a href="https://arxiv.org/abs/2410.10813">LongMemEval-S</a>.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-54_tools-1f6feb?style=flat-square" alt="54 MCP tools" />
  <img src="https://img.shields.io/badge/Plugin-22_hooks-1f6feb?style=flat-square" alt="22 hooks" />
  <img src="https://img.shields.io/badge/OpenCode-1.x_%2B_2.x-1f6feb?style=flat-square" alt="OpenCode 1.x and 2.x" />
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

Copy the plugin file:

```bash
mkdir -p ~/.config/opencode/plugins
cp plugin/opencode/agentmemory-capture.ts ~/.config/opencode/plugins/
```

That is the whole install. OpenCode loads every plugin file in
`~/.config/opencode/plugins/` automatically, so there is nothing to register.

> **Do not also add it to `opencode.json`.** Listing the file under
> `"plugins"` on top of leaving it in the auto-loaded directory registers the
> same plugin twice, and it then captures every event twice. If you see doubled
> observations, remove the `"plugins"` entry and keep the file where it is.
>
> If you would rather keep plugins outside that directory, install the file
> somewhere else and point the config key at it:
>
> ```json
> {
>   "plugins": ["./my-plugins/agentmemory-capture.ts"]
> }
> ```
>
> Either location works. The two must not both be in effect at once.

**OpenCode 1.x** — the same file works, using the V1 key instead:

```json
{
  "plugin": ["./my-plugins/agentmemory-capture.ts"]
}
```

See [OpenCode 1.x and 2.x](#opencode-1x-and-2x) below.

### 4. Add the slash commands

Copy the commands into your project or global `.opencode/commands/` directory:

```bash
mkdir -p ~/.config/opencode/commands
cp plugin/opencode/commands/recall.md ~/.config/opencode/commands/
cp plugin/opencode/commands/remember.md ~/.config/opencode/commands/
```

Restart OpenCode or open a new session. The plugin auto-captures everything.

## OpenCode 1.x and 2.x

`agentmemory-capture.ts` supports both plugin APIs from a single file.

OpenCode 2 replaced the V1 `Hooks`-object plugin shape: the default export must
carry an `id` plus a `setup(ctx)`, and hooks are registered on the domain that
owns the operation. The plugin therefore default-exports both:

```ts
export default {
  id: "agentmemory-capture",
  setup: v2Setup,    // OpenCode 2.x
  server: v1Hooks,   // OpenCode 1.x (1.18.29+)
}
```

- **OpenCode 2.x** reads `id` and `setup()` and ignores `server()`.
- **OpenCode 1.x** calls `server()` and uses the returned hooks.
- The two implementations are separate on purpose. Sharing an export does not
  translate V1 hooks into V2 hooks, and the payloads differ enough that a shared
  core would overstate V2 coverage.

Validated against **OpenCode v2.0.22** by running the plugin inside a live
session and logging the objects as they arrive, not by reading the generated
SDK types. That distinction matters: `@opencode-ai/sdk` 1.4.10 declares
`event.properties` and the V1 event names, and it is stale relative to the
runtime. Where this README says a payload was observed, it was read off a
running server.

### What the V2 runtime actually does

- **The payload is in `event.data`, not `event.properties`.** The envelope is
  `created, data, id, location, type`. Reading `properties` yields `{}`.
- **The V1 event names are gone.** They were not renamed one-for-one; the
  stream is organised differently. `location` on the envelope is
  process-level, so session identity comes from `data.sessionID`.
- **`list()` returns `{ data, location }`.** `ctx.agent.list()`,
  `ctx.provider.list()` and `ctx.mcp.list()` all resolve to that shape.
- **`ctx.model.default()` is a promise.** Unawaited it is `{}`.
- **`session.created` exists.** It carries `sessionID`, `projectID`,
  `location`, `title`, `version`, `subpath` and `slug`, so a session normally
  registers on creation with its title and directory in hand. The fallback to
  "first event carrying an ID" remains for sessions that predate the plugin
  load, which never emit the event. An earlier revision of this plugin claimed
  `session.created` did not exist; that came from observing an already-open
  session and never creating one, which is absence in a sample rather than
  absence in the API.
- **`ctx.session.hook("compaction")` registers a handler that is never
  invoked.** Confirmed by calling `ctx.session.compact()` directly and watching
  the callback stay silent while a compaction message was returned. Compaction
  is captured from `session.compaction.started` and
  `session.compaction.failed` instead. A registered hook is not evidence that
  it fires: the loader validates hook names at registration only.
- **`session.execution.succeeded` is observed but not recorded.** It carries
  only `{ sessionID }`, which every other observation in the session already
  carries, and `session.step.ended` covers the meaningful signal.
- **`parentID` is accepted by `ctx.session.create` but appears in no event
  payload.** The `parentID` sent to `/session/start` is therefore always null;
  the field is kept in case a future version populates it.

### Hook mapping

| V1 | V2 | Status |
|---|---|---|
| `event` | `ctx.event.subscribe()` | ported |
| `tool.execute.before` | `ctx.tool.hook("execute.before")` | ported |
| tool results (`message.part.updated`) | `ctx.tool.hook("execute.after")` | ported |
| `chat.message` | `ctx.session.hook("prompt")` | ported |
| `experimental.chat.system.transform` | `ctx.session.hook("context")` | ported |
| `experimental.session.compacting` | *(no working hook)* | **V2: observed via events, not injectable** |
| `config` | *(no hook)* | snapshot at `setup`, refreshed on `*.updated` |
| `chat.params` | *(no equivalent)* | not captured |

`output.system` (a string array) became `event.system` (`SystemPart[]`), so
injection pushes part objects rather than strings.

### Event mapping

| V1 event | V2 |
|---|---|
| `session.created` | `session.created` (or first event carrying `data.sessionID`) |
| `session.deleted` | `session.deleted` |
| `session.status`, `session.idle` | `session.step.started` / `session.step.ended` |
| `message.updated` | `session.text.*`, `session.reasoning.*` |
| `message.part.updated` | `ctx.tool.hook("execute.after")` |
| `command.executed` | `shell.created` (result from `shell.exited`) |
| `session.error` | `session.execution.failed` |
| `file.edited` | `file.watcher.updated` |
| `session.compacted` | `session.compaction.started` / `.failed` |
| `permission.updated` | `permission.asked` (payload is a `PermissionRequest`) |
| `todo.updated`, `session.diff` | *no V2 equivalent observed* |

`permission.asked` and `permission.replied` were not seen firing during
development. They are handled against the documented shape, reading both the
V2 field names and the V1 fallbacks, and are not covered by the observed
columns in the table below.

### Injection happens on every call

`ctx.session.hook("context")` fires on every model call, so recalled memory is
injected every time. The previous implementation injected once per session,
which meant only the first prompt of a session carried memory.

The `compaction` hook is **not** wired, because it does not work: it registers
without error and never invokes, confirmed by forcing a compaction in a running
v2.0.22. Compaction is observed through
`session.compaction.started` and `session.compaction.failed` instead. Recalled
memory still cannot be attached to the compaction prompt, since no compaction
event exposes a `system` array to inject into.

### What V2 cannot do

- **`chat.params`** — V2's `context` hook exposes `options` with `maxTokens`
  only; temperature and `topP` are absent, and `model` carries only
  `id` / `providerID` / `variant`. Recorded `llm_params` would be wrong rather
  than partial, so they are not recorded. The `model` on the hook is captured
  in `step_start` instead, where it is real.

### Why `ctx` is typed `any`

The V2 setup signature is `async function v2Setup(ctx: any)`. That is
deliberate, and worth explaining because it looks like a shortcut.

Typing it properly would mean importing types from `@opencode-ai/plugin`. The
generated types shipped for that package are **stale for V2**: SDK 1.4.10
declares `EventSessionCreated = { type, properties: { sessionID, info } }` and
enumerates the V1 event names, none of which the v2.0.22 runtime emits. A
type-only import would therefore make the compiler reject correct code while
accepting the shape that caused the original bug. Silence was the safer of the
two failure modes, so `any` is used and the correctness burden moved to runtime
verification.

The known cost, stated plainly:

- The compiler will not catch V2 payload drift. A renamed field becomes a
  `undefined` at runtime instead of a type error.
- Nothing checks that the event names in `handleEvent` are real. This branch
  shipped a handler for fifteen V1 event names, none of which fire.
- There is no compile-time guarantee that `ctx.session.hook(...)` takes a name
  that exists. The loader accepts any string, so a typo registers nothing and
  fails silently.

That is why the verification suite drives the plugin with payloads captured
from a live server instead of hand-built objects, and why the
[Verification](#verification) section distinguishes observed from inferred. If a
future release ships correct V2 types, this signature should be tightened and
these three risks retired with it.

### Verification

- `test/opencode-plugin-v2.test.ts` — 33 cases driving the V2 path with payloads
  captured from v2.0.22. It runs under the repo's existing vitest, so:

  ```bash
  npx vitest run test/opencode-plugin-v2.test.ts
  ```

  It covers session lifecycle, the tool hooks, memory injection on every model
  call, compaction, the event switch, and the regression where an early
  `return` ended the event subscription. Each case added with the compaction
  change was checked against the previous commit: the three compaction cases
  fail on it and pass here.
- In a live session the plugin produced real observations for
  `post_tool_use`, `config_loaded`, `step_start`, `step_finish`,
  `assistant_message`, `command_executed`, `reasoning`, `text_started`,
  `text_ended` and `notification`. `session.compaction.started` and
  `session.compaction.failed` were confirmed by forcing a compaction in a
  running v2.0.22.

Earlier in this branch the V2 path loaded cleanly and captured almost nothing,
because it was verified against a hand-built context object that agreed with
its own assumptions. Verifying that the plugin loads is not verifying that it
works, and the suite exists so that the next person does not have to learn that
twice.

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

| Event | V1 hook | V2 hook | agentmemory API |
|---|---|---|---|
| User prompt (rich) | `chat.message` | `ctx.session.hook("prompt")` | POST /observe |
| User prompt metadata | `message.updated` (user) | `message.updated` (user) | POST /observe |
| Assistant response | `message.updated` (assistant) | `message.updated` (assistant) | POST /observe |
| Message removed (undo) | `message.removed` | `message.removed` | POST /observe |

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

| Event | V1 hook | V2 hook | agentmemory API |
|---|---|---|---|
| File tool params | `tool.execute.before` → stash paths | `ctx.tool.hook("execute.before")` | - |
| File edited | `file.edited` → stash paths | `file.edited` | - |
| File part attached | `message.part.updated` (file) → stash paths | `message.part.updated` (file) | - |
| Enrichment inject | `experimental.chat.system.transform` | `ctx.session.hook("context")` | POST /enrich → system prompt |
| Memory context inject | `experimental.chat.system.transform` | `ctx.session.hook("context")` | POST /context → system prompt |

On V1 the two injects land in `output.system[]`. On V2 they are pushed as
`SystemPart` objects onto `event.system`.

### Permissions

| Event | V1 hook | V2 hook | agentmemory API |
|---|---|---|---|
| Permission prompt | `permission.updated` | `permission.asked` | POST /observe |
| Permission reply | `permission.replied` | `permission.replied` | POST /observe |

### Tasks & commands

| Event | Hook | agentmemory API |
|---|---|---|
| Task tracking (w/ priority) | `todo.updated` | POST /observe |
| Command executed | `command.executed` | POST /observe |

### Model & config

| Event | V1 hook | V2 | agentmemory API |
|---|---|---|---|
| LLM parameters | `chat.params` | not captured | POST /observe (V1 only) |
| Config loaded | `config` | snapshot at setup | POST /observe |
| Compaction context | *(no working V2 hook)* | not injectable | observed via `session.compaction.*` |

These three are the only differences between the V1 and V2 paths. Everything
else in this document is captured identically on both. See
[What V2 cannot do](#what-v2-cannot-do).

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
