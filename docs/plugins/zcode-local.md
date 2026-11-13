# ZCode

Start the Agent Memory daemon separately, then choose one capture route.

## Native user configuration

```sh
agentmemory connect zcode
agentmemory connect zcode --with-hooks
```

The first command adds stdio MCP under `mcp.servers.agentmemory` in `~/.zcode/cli/config.json`. The second also enables `hooks.events`. Existing MCP servers, user hooks, provider settings and permissions are preserved. MCP inherits the host's `AGENTMEMORY_*` environment; no credential or shell interpolation placeholder is written into this config.

Use `--dry-run` to preview without writes or backups. Repeating the command is idempotent. Changes to an existing file are backed up under `~/.agentmemory/backups`. Malformed configuration is left unchanged. A conflicting MCP entry or explicitly disabled hook runner requires `--force` before replacement or enabling.

## Local plugin directory

From a source checkout, run `npm run plugin:pack:zcode`. Install the resulting `dist/plugins/agentmemory-zcode` directory with ZCode's plugin manager. It contains the existing bundled scripts and skills, a local MCP bridge to the daemon, and only the ZCode hook manifest at `hooks/hooks.json`.

Use the dedicated directory for ZCode. Loading the generic `plugin/` directory still registers Claude Code's twelve events. Pointing a manifest at a second hooks file does not replace that conventional file: ZCode merges both. Choose the dedicated plugin or `connect zcode --with-hooks` for capture; do not enable both, or keep a generic Agent Memory capture plugin enabled alongside config hooks. The connector does not change your installed plugins or their trust settings.

## Lifecycle coverage

Six existing handlers apply: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure and Stop. PreToolUse uses case-sensitive `Bash|Read|Write|Edit|Grep|Glob`; native ApplyPatch aliases also match Write/Edit. ZCode's seventh event, PermissionRequest, has no Agent Memory capture handler and is left to your existing permission hooks.

Notification, PreCompact, SubagentStart, SubagentStop, TaskCompleted and SessionEnd have no ZCode event. Stop sends the existing best-effort session-end request and captures the current assistant reply. ZCode supplies a temporary one-message transcript, not a complete session history, so this integration does not provide SessionEnd transcript backfill or final-session summaries.

Target: ZCode 3.18.2. Restart ZCode after installation and confirm capture in your daemon.
