# ZCode

Start the Agent Memory daemon separately, then choose one capture route.

## Native user configuration

```sh
agentmemory connect zcode
agentmemory connect zcode --with-hooks
```

The first command adds stdio MCP under `mcp.servers.agentmemory` in `~/.zcode/cli/config.json`. The second also enables `hooks.events`. Existing MCP servers, user hooks, provider settings and permissions are preserved. MCP inherits the host's `AGENTMEMORY_*` environment; no credential or shell interpolation placeholder is written into this config.

Use `--dry-run` to preview without writes or backups. Repeating the command is idempotent. Changes to an existing file are backed up under `~/.agentmemory/backups`. On POSIX, existing file ownership and permissions are preserved; new configs and backups are private. If ownership cannot be retained, the existing config is left unchanged. Malformed configuration is left unchanged. A conflicting or disabled MCP entry, including the legacy `enable: false` setting, or an explicitly disabled hook runner requires `--force` before replacement or enabling.

The connector marks its handlers with `agentmemoryOwner: "agentmemory:zcode:v1"`. Reconnecting after moving the installation updates their script paths while preserving handler options and mixed user hooks. Unmarked capture commands from a different installation cannot be assigned ownership safely, so the connector leaves the config unchanged. Remove only the old Agent Memory capture hooks you recognize before retrying. `--force` does not override this ownership check.

Reconnects share ZCode's native configuration lock so a concurrent save retains its settings. If the lock remains unavailable for eight seconds, the connector skips the change and leaves the lock untouched. Retry after the native writer finishes. `--force` does not bypass this guard, and dry-run creates no lock or directories.

If a crashed writer left an abandoned lock, close ZCode and stop any `agentmemory connect zcode` commands using this configuration. Confirm that no writer is running, including any owner PID recorded inside `~/.zcode/cli/config.json.lock`. Only then remove its abandoned `owner-*.json` files, remove the empty lock directory non-recursively, and retry. Leave any other contents or a live owner's lock untouched; the connector does not remove abandoned locks automatically.

Updating an existing config on Linux requires `getfacl` and `setfacl` from the `acl` package to retain its complete access ACL. macOS uses its system `chmod` and `cp` utilities inside a private staging directory. If metadata preparation fails or warns, the original config is left unchanged.

## Local plugin directory

From a source checkout, run `npm run plugin:pack:zcode`. Install the resulting `dist/plugins/agentmemory-zcode` directory with ZCode's plugin manager. It contains the existing bundled scripts and skills, a local MCP bridge to the daemon, and only the ZCode hook manifest at `hooks/hooks.json`.

Use the dedicated directory for ZCode. Loading the generic `plugin/` directory still registers Claude Code's twelve events. Pointing a manifest at a second hooks file does not replace that conventional file: ZCode merges both. Choose the dedicated plugin or `connect zcode --with-hooks` for capture; do not enable both, or keep a generic Agent Memory capture plugin enabled alongside config hooks. The connector does not change your installed plugins or their trust settings.

## Lifecycle coverage

Six existing handlers apply: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure and Stop. PreToolUse uses case-sensitive `Bash|Read|Write|Edit|Grep|Glob`; native ApplyPatch aliases also match Write/Edit. ZCode's seventh event, PermissionRequest, has no Agent Memory capture handler and is left to your existing permission hooks.

Notification, PreCompact, SubagentStart, SubagentStop, TaskCompleted and SessionEnd have no ZCode event. Stop sends the existing best-effort session-end request and captures the current assistant reply. ZCode supplies a temporary one-message transcript, not a complete session history, so this integration does not provide SessionEnd transcript backfill or final-session summaries.

Target: ZCode 3.18.2. Restart ZCode after installation and confirm capture in your daemon.
