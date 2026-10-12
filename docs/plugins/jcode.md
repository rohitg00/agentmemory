# agentmemory for jcode

[jcode](https://github.com/1jehuang/jcode) is a Rust-based coding-agent harness
that wires lifecycle capture through TOML array hooks in
`~/.jcode/config.toml`, in the same spirit as Claude Code's `hooks` settings
(its hook payload is field-compatible with Claude Code, so the bundled
`src/hooks/*.ts` scripts work through a thin env→JSON bridge).

## Install

```sh
agentmemory connect jcode --with-hooks
```

The adapter:

- registers the `@agentmemory/mcp` stdio server in `~/.jcode/mcp.json`
  (merging with any servers already there — it never clobbers the file)
- installs a small bridge script at
  `~/.jcode/plugins/agentmemory/agentmemory-bridge.mjs` that translates
  jcode's `JCODE_HOOK_*` environment variables into the Claude-style stdin
  JSON the bundled hooks read
- appends four entries to the `[hooks]` section of `~/.jcode/config.toml`:
  `session_start`, `post_tool`, `turn_end`, `session_end`. Existing entries
  are preserved: scalar keys are promoted to arrays with the original value
  first, and the merge is idempotent across re-runs.

jcode reloads its hook config without a restart, so capture starts on the
next turn of any running session.

## Coverage

| jcode hook | agentmemory hook | captured |
|---|---|---|
| `session_start` | `session-start.mjs` | session registration, project attribution from `JCODE_HOOK_CWD` |
| `post_tool` (ok) | `post-tool-use.mjs` | tool name, tool input (full JSON) |
| `post_tool` (error) | `post-tool-failure.mjs` | tool name, input, error text |
| `turn_end` | `stop.mjs` | model, token counts, final assistant text |
| `session_end` | `session-end.mjs` | session termination |

### Not capturable on jcode

jcode has no per-message or diff events, so these captures from the
OpenCode/Claude adapters have no equivalent:

- `prompt_submit` (raw user prompt text)
- `session_diff` (aggregate additions/deletions)
- full `assistant_message` bodies (only the last 4 KB of each turn's final
  text arrives via `JCODE_HOOK_LAST_ASSISTANT_TEXT`)
- `reasoning`, `subagent_start`, `permission` prompts, `llm_params`

Mitigation: jcode sessions can pair this adapter with the write-side
[oh-my-agentmemory](https://github.com/dev-hann/oh-my-agentmemory) overlay,
whose policy drives the agent to explicitly `memory_save` decisions — the
decision record survives even though the raw prompt text is not captured.

### Output-text limitation

jcode exports only `JCODE_HOOK_OUTPUT_BYTES` (the size of the tool output),
never the output text itself. The bridge writes
`"[N bytes output]"` as `tool_response`. Tool *inputs* arrive in full
(16 KB-capped JSON), which is what file-history and lesson extraction key
off of.

## Verify

```sh
jcode run "Test: remember the marker oh-am-verify-jcode"
curl -s localhost:3111/agentmemory/search -X POST \
  -H 'Content-Type: application/json' \
  -d '{"query":"oh-am-verify-jcode"}' | grep oh-am-verify-jcode
```

## Uninstall

Remove the four `plugins/agentmemory/agentmemory-bridge.mjs` entries from
`[hooks]` in `~/.jcode/config.toml`, the `agentmemory` server from
`~/.jcode/mcp.json`, and delete `~/.jcode/plugins/agentmemory/`.
