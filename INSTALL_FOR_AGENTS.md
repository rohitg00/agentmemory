# Install agentmemory (agent runbook)

You are a coding agent. Follow these steps in order to install agentmemory, wire it into yourself, and verify that persistent memory works. Run each command, check the result, then move to the next step. Stop and report if any step fails.

## 1. Install globally

```bash
npm install -g @agentmemory/agentmemory
```

If you hit `EACCES` on a system Node install (macOS/Linux), retry with `sudo npm install -g @agentmemory/agentmemory`.

No-install alternative (skips step 1, run the server with npx in step 2):

```bash
npx -y @agentmemory/agentmemory@latest
```

## 2. Start the server

Start the memory server. It listens on port 3111. Run it in the background or in a separate terminal so the rest of the steps can talk to it.

```bash
agentmemory
```

If you installed via npx in step 1, run `npx -y @agentmemory/agentmemory@latest` here instead.

## 3. Prove it works

```bash
agentmemory demo --serve
```

This boots the server, seeds sample sessions, proves recall, and tears down in one command. No second terminal needed.

## 4. Wire MCP into the calling agent

Detect which agent is running this runbook, then wire its MCP config:

```bash
agentmemory connect <agent>
```

Supported agent names: `claude-code`, `copilot-cli`, `codex`, `cursor`, `gemini-cli`, `opencode`, `cline`, `continue`, `droid`, `hermes`, `openclaw`, `openhuman`, `pi`, `qwen`, `warp`, `zed`, `antigravity`, `kiro`.

If you cannot tell which agent you are, default to `claude-code`. Restart the agent (or run its MCP reload command) after wiring so it picks up the server.

## 5. Install native skills

```bash
npx skills add rohitg00/agentmemory -y
```

This installs the native skills so the agent knows when to call the memory functions.

## 6. Verify a save and recall round-trip

First confirm the server is healthy:

```bash
curl http://localhost:3111/agentmemory/health
```

Expect a JSON body with an ok status. Then run a save and recall round-trip. If MCP is wired, call the `memory_save` function followed by `memory_smart_search`. Otherwise use REST directly:

```bash
curl -X POST http://localhost:3111/agentmemory/memory_save \
  -H "Content-Type: application/json" \
  -d '{"content":"agentmemory install verification probe","tags":["install-check"]}'

curl -X POST http://localhost:3111/agentmemory/memory_smart_search \
  -H "Content-Type: application/json" \
  -d '{"query":"install verification probe"}'
```

The search response should contain the memory you just saved.

## 7. Report success

Report back to the user:

- agentmemory installed and the server is running on port 3111
- which agent was wired via `agentmemory connect`
- the save and recall round-trip returned the probe memory
- the viewer is available at http://localhost:3113

If any step failed, report which step, the exact command, and the error output.
