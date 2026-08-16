# agentmemory for Cursor

Cursor-native plugin: **lifecycle hooks**, **MCP**, and shared **skills**.

The hooks are the canonical ones. `plugin/scripts/*.mjs` — compiled from
`src/hooks/*.ts` and shared with Claude Code, Codex and Copilot — do all the
work. Cursor gets a thin adapter in front of them, compiled from
`src/hooks/cursor/*.ts` through the same tsdown pipeline, and nothing else.

---

## Quick local install

Prereq: `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET`, in the environment or in
`~/.agentmemory/.env`.

```bash
npm run build
node integrations/cursor/install-local.mjs
node integrations/cursor/verify-flow.mjs
```

Then in Cursor:

1. **Settings → Plugins → Add marketplace** → select the **repo root**
   `<path-to-your-agentmemory-clone>`
   (must contain `.cursor-plugin/plugin.json`)
2. Enable plugin **agentmemory**
3. **Disable** any second agentmemory marketplace entry if both are on
4. **Developer: Reload Window**
5. Confirm the hooks log shows `plugin/scripts/cursor/run-hook.mjs` or `run-detached.mjs`

Only after plugin hooks are confirmed:

```bash
node integrations/cursor/install-local.mjs --clear-user-hooks
```

---

## Layout

```text
agentmemory/                        ← Cursor plugin root (git repo)
  .cursor-plugin/plugin.json        ← marketplace manifest (hooks + MCP + skills)
  plugin/
    cursor/hooks.json               ← Cursor camelCase events → adapter
    cursor/mcp.json
    scripts/cursor/                 ← built from src/hooks/cursor/
      run-hook.mjs                  ← the synchronous hooks
      run-detached.mjs              ← stop / sessionEnd
    scripts/*.mjs                   ← canonical hooks, shared with every agent
    skills/
  src/hooks/cursor/                 ← the only Cursor-specific source
    run-hook.ts, run-detached.ts    ← CLI entrypoints
    delegate.ts                     ← event -> canonical hook dispatch
    workspace.ts                    ← resolveWorkspace()
    cursor-db.ts                    ← reads Cursor's own SQLite storage
integrations/cursor/
  install-local.mjs                 ← local marketplace + MCP wiring
  verify-flow.mjs                   ← live smoke test against a daemon
  close-stale-am-sessions.mjs       ← dev utility
  _env.mjs                          ← shared config loading
```

`workspace.ts` and `delegate.ts` are not build entrypoints; they are inlined
into each CLI, so the emitted files are self-contained exactly like every
other hook artifact.

---

## What a hook call actually does

```text
Cursor
  │  reads plugin/cursor/hooks.json, spawns a process, writes JSON to stdin
  ▼
run-hook.mjs <event>                    run-detached.mjs stop|sessionEnd
  │                                       │  writes the payload to a temp file,
  │                                       │  spawns a detached worker, returns
  │                                       ▼
  │                                     (background worker)
  ▼
resolveWorkspace(payload) ──► { project, cwd }
  │
  │  AGENTMEMORY_PROJECT_NAME=<project> in the environment
  │  cwd=<cwd> merged into the payload
  ▼
node plugin/scripts/<canonical hook>.mjs      ← unmodified
  │
  ▼
POST $AGENTMEMORY_URL/agentmemory/...
```

`resolveProject()` in the canonical hooks reads `AGENTMEMORY_PROJECT_NAME`
before falling back to git or cwd. That one environment variable is the whole
delegation mechanism — it is how Cursor-specific knowledge reaches a hook that
knows nothing about Cursor.

### Differences from the Claude Code hooks

| | Claude Code | Cursor |
|---|---|---|
| Event names | `PostToolUse` | `postToolUse` |
| Config shape | `[{hooks:[{type,command}]}]` | `[{command}]` |
| Plugin root var | `${CLAUDE_PLUGIN_ROOT}` | `${CURSOR_PLUGIN_ROOT}` |
| `preToolUse` matcher | `Edit\|Write\|Read\|Glob\|Grep` | …`\|Shell` (Cursor has a Shell tool) |
| Session id field | `session_id` | `session_id` or `sessionId` |
| Working directory | reliable | **not reliable — see below** |

The extra process hop costs about 100ms per synchronous hook (one additional
Node startup plus resolution). The canonical hooks already spend ~500ms of
their own deliberately, waiting for their fire-and-forget POST to leave, so
this is roughly a 20% overhead on something the user does not wait for. It
buys zero duplicated hook logic, which was the explicit trade.

### Why `stop` and `sessionEnd` are detached

`sessionEnd` fans out to four daemon endpoints — session end, crystals,
consolidate pipeline, bridge sync. Cursor kills its hook process tree when the
window closes, so run inline that work is cut off halfway and the session's
memories are lost.

`run-detached.mjs` runs the same file twice in two roles. The parent reads
stdin, writes the payload to a `0600` temp file, spawns itself with
`detached: true`, `stdio: 'ignore'` and `AM_HOOK_WORKER=1`, then exits as soon
as the spawn is confirmed. The worker reads the file back, deletes it, and
delegates normally under a watchdog.

* Temp file, not a pipe, because `stdio: 'ignore'` is what keeps the parent
  from being held open by the child.
* `detached` puts the worker in its own process group, out of reach of
  Cursor's teardown.
* `unref()` stops the parent's event loop waiting on it.

Measured: the parent returns in **99ms** where an inline `stop` would hold
Cursor for about **1500ms**.

The eight synchronous hooks stay inline: they are fast, and some need to write
to stdout for Cursor to read (`sessionStart` can inject project context).

---

## Why there is a workspace resolver at all

Every hook has to answer one question: **which project is this?** For Claude
Code that is 20 lines — read `cwd`, run `git rev-parse --show-toplevel`, take
the basename.

Cursor does not give hooks a trustworthy working directory. In practice the
payload contains one of:

* `.cursor` — Cursor's own metadata directory, not the project;
* the **Cursor install directory**, leaked through `VSCODE_CWD`, which resolves
  to a project literally named `cursor`;
* nothing at all, just a `tool_input` holding a *file* path;
* a session id, with the workspace recorded somewhere else entirely.

Getting this wrong is not a crash. It silently files a user's memories under
the wrong project, or under `.cursor`, and nobody notices until the data is
already there. That is why the resolver is the largest piece of this
integration, and why every layer either verifies its answer against the
filesystem or refuses to answer.

### The chain

Layers are tried in order. `resolveWorkspace` caches the result under the
session id, so the whole chain runs at most **once per session** — every
later hook in that session is a single JSON read.

| # | Layer | Basis | Notes |
|---|---|---|---|
| 1 | Session cache | previous answer | `~/.cursor/hooks/.agentmemory-session-cache.json`, written under a lock |
| 2 | Payload paths | `workspace_roots`, `workspace_folder`, `cwd`, … | eight aliases because Cursor is inconsistent; `cwd` is deliberately ranked low |
| 3 | `tool_input` paths | any path-shaped string in the tool arguments | file paths resolve to their directory |
| 4 | **Cursor's database** | `composer.composerHeaders` | exact, no inference — see below |
| 5 | Transcript directory name | `~/.cursor/projects/<slug>/` | slug is the workspace path with separators flattened |
| 6 | Transcript contents | most-mentioned git root | a guess; needs ≥3 votes |
| 7 | Environment | `CURSOR_WORKSPACE_ROOT`, `PWD`, `VSCODE_CWD` | last, because `VSCODE_CWD` lies |
| 8 | `unknown-project` | — | the honest answer when nothing else is |

Every candidate then passes the same gate: not `.cursor`, not an IDE install
path, not an OS directory, not a bare drive root, and not another agent's
state directory.

That last one is narrower than it sounds. Sessions were landing under
`.codex`, but rejecting every dot-named directory would be wrong — plenty of
real projects are dot-named, from `~/.dotfiles` and `~/.emacs.d` to GitHub's
convention of a repository literally called `.github`. What separates those
from `~/.codex` or `~/.vscode` is not the name but that a human deliberately
version controls them, so the rule is **a dot-named directory that is not a
git repository**. No list of tool names to keep current as new agents ship.

Layers 4–6 additionally require the directory to **exist exactly**. Climbing to
whatever ancestor survives is right for a file path out of `tool_input`, but
wrong for a workspace path a source claims is authoritative: a project that
moved away from `D:/Andrew/Code/cc-router` otherwise resolves to the project
`Code`, and every session from that machine piles up under it.

Set **`AM_CURSOR_DEBUG=1`** to have the resolver print which layer answered.
Every layer returns the same shape, so a wrong project is otherwise
undiagnosable from the outside.

---

## How Cursor stores this (reverse engineered)

Layers 4–6 rely on Cursor's on-disk state. The layout, as of Cursor 3.x:

```text
<userdir>/                       %APPDATA%/Cursor/User      (Windows)
  │                              ~/Library/Application Support/Cursor/User  (macOS)
  │                              ~/.config/Cursor/User      (Linux)
  ├── globalStorage/state.vscdb          SQLite; all chat content + the 3.0 index
  └── workspaceStorage/<hash>/
        ├── workspace.json               {"folder":"file:///d%3A/repo"}
        └── state.vscdb                  SQLite; pre-3.0 per-workspace chat list

~/.cursor/projects/<slug>/agent-transcripts/<sessionId>/<sessionId>.jsonl
```

**A Cursor hook's `session_id` is the `composerId`.** That is what makes layer
4 possible: `composer.composerHeaders` in the global database maps a
`composerId` straight to `workspaceIdentifier.uri.fsPath`. One indexed read,
measured at 4–7ms even against a 3.6GB database, and cached for the rest of
the session.

Two caveats, both handled:

* **Cursor 3.0 (April 2026) centralised that index**, moving it out of the
  per-workspace databases, and migrates each workspace lazily — when it is next
  opened. Machines still on ≤2.6, or with workspaces untouched since the
  upgrade, keep the old per-workspace `allComposers` array. On one real machine
  55 of 124 workspaces were still in the old format. Both shapes are read; the
  legacy scan is ordered by recency and capped, because the workspace a live
  session belongs to was touched moments ago.
* **Reading SQLite needs a driver.** `node:sqlite` exists from Node 22.5 and
  this package supports Node ≥20; `better-sqlite3` is optional. With neither,
  every path in `cursor-db.ts` returns null and layers 5–6 take over. This
  layer is an accuracy upgrade, never a requirement.

### The slug encoding (layer 5)

`~/.cursor/projects/` names one directory per workspace after the workspace
path with every separator flattened to `-`:

```text
D:\Andrew\Code\Github\agentmemory   →   d-Andrew-Code-Github-agentmemory
```

The encoding is lossy in one direction: a directory name may itself contain
hyphens, so `d-Andrew-Code-cc-router` is `D:/Andrew/Code/cc-router` and, just
as validly on paper, `D:/Andrew/Code/cc/router`. The disambiguator is the
filesystem — try every grouping of consecutive segments, descend only into
groupings that exist. Pruning turns what looks like a 2ⁿ search into the
handful of real directories on the machine: 39 slugs decode in 29ms, with zero
ambiguous results.

### What layer 6 is for, and why it is last

The transcript scan answers "which git root is mentioned most in this
conversation". That is a guess, and it was originally asked *before* the slug —
so a session about agentmemory that was actually running elsewhere resolved to
agentmemory. It now runs last, only existing directories vote, they vote for
their git root, and a winner needs at least three votes. Without the git-root
rule the winner is whatever generic directory came up most: `/bin`, `C:/Users`.

It stays because it is the only layer that can place a **workspace-less
window** — a chat started from Cursor's welcome screen — that was nonetheless
editing real files.

### Measured behaviour

Over 300 real sessions on a Windows machine, resolving from **`session_id`
alone** (no payload at all — the worst case, which real hooks rarely hit
because layer 2 usually answers):

| Resolved by | Sessions |
|---|---|
| Cursor's database (layer 4) | 10 |
| Slug decode (layer 5) | 8 |
| `unknown-project` | 12 |

The twelve unknowns are deleted or moved projects and workspace-less windows —
cases where no correct answer exists. There were no wrong attributions. Before
this work both layers returned **zero** on Windows: the slug decoder bailed
unless the name started with `Users-`, and the transcript scan anchored its
regex on `$HOME`, which never matches a checkout on another drive.

---

## Known Cursor limitations

* `sessionEnd` on window close is unreliable in Cursor 3.13.x
  (`MainThreadShellExec not initialized`). `stop` is what the pipeline relies
  on; `verify-flow.mjs` treats `sessionEnd` as diagnostic only and needs
  `--with-session-end` to exercise it at all.
* The daemon drops observations while it is busy — a `stop` leaves
  `/summarize` running in the background, and observations posted into that
  window can vanish. `verify-flow.mjs` retries with a varied `tool_input`,
  because the dedup key is `(sessionId, tool_name, tool_input)` and a
  byte-identical retry would be discarded as a duplicate.

---

## Testing

```bash
npx vitest run test/cursor-adapter.test.ts test/cursor-workspace.test.ts   # no daemon
node integrations/cursor/verify-flow.mjs                                   # live daemon
node integrations/cursor/close-stale-am-sessions.mjs --dry-run             # dev utility
```

The unit tests are the authoritative check: they assert the delegation
contract against a local HTTP server and stand-in hooks, and cover the
resolver branches that were found misfiring on real sessions.

One trap worth knowing if you extend them: **do not use `spawnSync`**.
`spawnSync` blocks the caller's event loop, so an in-process HTTP server
cannot accept the connection the child is opening. The requests only arrive
after the child has exited, which looks exactly like "the hook sent nothing"
and costs an afternoon.
