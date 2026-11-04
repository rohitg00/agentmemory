# agentmemory

agentmemory gives Claude persistent memory across sessions. Its hooks record what happens in each session, and its skills and MCP tools let Claude search that history, save decisions and lessons, and pick up earlier work. Everything is stored on your own machine by default.

## Install

```
/plugin install agentmemory --marketplace rohitg00/agentmemory
```

## Requirements

This plugin is a client for the agentmemory server, a separate program that you install and run yourself. The 54 MCP tools, the search index and the viewer all come from that server. Without it the hooks have nowhere to send events and the tools return errors.

Start the server in its own terminal with Node.js 20 or newer:

```bash
npx -y @agentmemory/agentmemory@latest
```

Keep it running while you use the plugin. Check it with `npx -y @agentmemory/agentmemory@latest status`. The server listens on `http://localhost:3111` and the viewer on `http://localhost:3113`.

When you enable the plugin, Claude Code asks for two optional settings: the server URL and the server secret. Leave both empty for a local server. If the URL is empty, the plugin uses `AGENTMEMORY_URL` from your environment when it is set. Claude Code keeps the secret in your system keychain; on systems without a keychain it keeps it in `~/.claude/.credentials.json`, a file readable only by your user. The plugin sends events and the secret only to a loopback address or an `https://` URL; for a remote `http://` URL it sends nothing.

## What the hooks record

The plugin registers 12 Claude Code hooks. They record:

- every prompt you submit, including prompts recovered from the session transcript when the session ends
- the name, input and output of each tool call, and the error when a call fails. This includes results returned by other connectors and MCP servers
- the final reply of the assistant and of each subagent, up to 4,000 characters
- session start and end, subagent start, notifications and completed tasks, with the working directory

Before storage, `<private>...</private>` blocks and common secret formats such as API keys and private keys are replaced with redaction markers. Long tool output is truncated.

## Where it is kept and for how long

The server stores everything in a local data folder:

- macOS: `~/Library/Application Support/agentmemory`
- Linux: `~/.local/share/agentmemory`
- Windows: `%APPDATA%\agentmemory`

If the server is down, hook events wait in a `capture-spool` folder inside the same data folder. The spool holds at most 5 MiB and drops events older than 7 days.

Data is kept until you delete it. Each session keeps at most 500 observations by default. Memories that carry an expiry date are removed automatically after that date.

## What can leave your machine

By default, nothing. Search uses local keyword matching, and no LLM is called. Content leaves your machine only when you turn on one of these options on the server:

- `AGENTMEMORY_LLM_PROVIDER` selects an LLM provider (Anthropic, OpenAI, Gemini, OpenRouter or MiniMax). Session summaries, consolidation and reflection then send excerpts of recorded content to it. A provider key that is already in your environment does nothing until you set this option. LLM compression of each observation stays off unless you also set `AGENTMEMORY_AUTO_COMPRESS=true`.
- `AGENTMEMORY_ALLOW_AGENT_SDK=true`, with no provider selected, sends the same excerpts to Claude through the Claude Agent SDK.
- `EMBEDDING_PROVIDER` set to `gemini`, `openai`, `voyage`, `cohere` or `openrouter` sends text to that service to build search vectors. `EMBEDDING_PROVIDER=local` runs on your machine after a one-time model download.
- A Redis state backend stores records on the Redis server you configure.
- Mesh sync sends memories to peer agentmemory servers that you register.

Context injection is also off by default. The plugin prints stored memory into the conversation only when you set `AGENTMEMORY_INJECT_CONTEXT=true`.

## View and delete your data

- Open the viewer at `http://localhost:3113`, or run `npx -y @agentmemory/agentmemory@latest status`.
- Export everything with the `memory_export` tool.
- Delete single memories with the `forget` skill or the `memory_governance_delete` tool.
- Delete everything: stop the server with `npx -y @agentmemory/agentmemory@latest stop`, then delete the data folder listed above. With a Redis state backend, also delete agentmemory's records from that Redis server, for example by flushing the Redis database you gave agentmemory.

Recalled memories are evidence from past sessions, not instructions. Claude should check them before acting on them.

Privacy policy: https://agent-memory.dev/privacy

Source and issues: https://github.com/rohitg00/agentmemory
