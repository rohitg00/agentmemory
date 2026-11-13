# agentmemory for Orca

A sidebar panel for [Orca](https://orca.dev) that shows the memories your coding agents keep in agentmemory. Tested with Orca 1.4.258.

The panel:

- shows whether the agentmemory server is running;
- lists the latest memories of the workspace you have open, or of all projects;
- searches memories and observations with agentmemory's smart search;
- saves a memory you type to the workspace's project;
- opens the agentmemory viewer.

The panel does not capture what your agents do. Capture comes from each agent's own hooks and MCP server. Orca launches Claude Code, Codex and the other agents with their normal configuration, so connect each agent once:

```bash
agentmemory
agentmemory connect claude-code
agentmemory connect codex
```

Orca plans `hooks` and `mcpServers` contributions for plugins. When they ship, this plugin can add capture for the agents Orca launches.

## Install

Start agentmemory, then install the plugin in Orca from this folder of the repository:

```bash
npx @agentmemory/agentmemory
orca plugin install https://github.com/rohitg00/agentmemory/tree/main/integrations/orca
```

Orca shows what the plugin is allowed to do and asks you to approve it. Then the agentmemory panel shows in the right sidebar. To install from a checkout of this repository instead:

```bash
orca plugin dev load integrations/orca
```

## What the plugin can do

The plugin uses the `trusted-worker` execution profile. Its worker runs in Node.js with your user account's access, because the panel frame has no network access and the worker must call the agentmemory REST API. It asks for two capabilities:

- `settings:own`: read its Server URL and Viewer URL settings.
- `workspace:read`: read the focused workspace and the workspace list, to find the project name.

The worker sends requests only to the Server URL. It reads the bearer secret from `AGENTMEMORY_SECRET`, then `~/.agentmemory/.env`, then `~/.agentmemory/secret`. It reads the local files only when the Server URL is a loopback address, and it refuses to send a secret over plain HTTP to a remote host. Set `AGENTMEMORY_CREDENTIAL_MODE=explicit` to turn off the local file lookup.

## Project scope

agentmemory names a project after its Git repository, so all worktrees of a repository share one project. The worker finds the focused workspace's folder with `workspace.list` and resolves the name the same way the agentmemory hooks do. `AGENTMEMORY_PROJECT_NAME` overrides it. Remote (SSH) workspaces have no local folder, so the panel falls back to all projects for them.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| Server URL | `http://localhost:3111` | The agentmemory REST server |
| Viewer URL | `http://localhost:3113` | Opened by the Open viewer link |

## Develop

```bash
cd integrations/orca
orca plugin types .
orca plugin validate .
orca plugin test .
orca plugin check .
orca plugin dev watch .
```

`orca plugin test` runs the worker against a stand-in agentmemory server and the panel against a stand-in worker. `orca plugin check` renders the panel with the real worker.
