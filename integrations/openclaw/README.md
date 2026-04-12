# agentmemory for OpenClaw

Persistent cross-session memory for [OpenClaw](https://github.com/openclaw/openclaw) via agentmemory. Gives every OpenClaw agent a searchable long-term memory with 95.2% retrieval accuracy on [LongMemEval-S](https://arxiv.org/abs/2410.10813).

## Why you want this

OpenClaw agents restart fresh every session. You waste tokens re-explaining architecture, re-discovering bugs, re-teaching preferences. agentmemory captures every tool use automatically and injects relevant context when the next session starts.

- **92% fewer tokens** per session vs full-context pasting
- **12 auto-capture hooks** — zero manual `memory.add()` calls
- **MCP-native** — same server works for Claude Code, Cursor, Gemini CLI, Hermes, and OpenClaw at the same time
- **Self-hosted** — no external database, no cloud, no API key needed for embeddings

## Quick setup

### Option 1: MCP server (zero code)

Start the agentmemory server in a separate terminal:

```bash
npx @agentmemory/agentmemory
```

Then add to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["agentmemory-mcp"]
    }
  }
}
```

OpenClaw now has access to all 43 MCP tools including `memory_recall`, `memory_save`, `memory_smart_search`, `memory_timeline`, `memory_profile`, and more.

### Option 2: Gateway plugin (deeper integration)

If you're running an OpenClaw gateway, drop this folder into your gateway's plugins directory:

```bash
cp -r integrations/openclaw ~/.openclaw/plugins/memory/agentmemory
```

Start the agentmemory server:

```bash
npx @agentmemory/agentmemory
```

The plugin auto-detects the running server and hooks into the OpenClaw agent loop:

- `onSessionStart` starts a new session on the agentmemory server and injects any returned context
- `onPreLlmCall` injects token-budgeted memories before each LLM call (BM25 + vector + graph fusion)
- `onPostToolUse` records every tool use, error, and decision after execution
- `onSessionEnd` marks the session complete so raw observations can be compressed into structured memory

Configure via `~/.openclaw/plugins/memory/agentmemory/config.yaml`:

```yaml
enabled: true
base_url: http://localhost:3111
token_budget: 2000
min_confidence: 0.5
```

## What your agent gets

### Automatic context injection

When a session starts, agentmemory injects ~1,900 tokens of the most relevant past context:

```text
Project profile:
  - Auth uses JWT middleware in src/middleware/auth.ts (jose, not jsonwebtoken)
  - Tests in test/auth.test.ts cover token validation
  - Database uses Prisma with include{} to avoid N+1 queries
  - Rate limiting: 100 req/min default, Redis for prod

Recent decisions:
  - Chose jose over jsonwebtoken for Edge compatibility (2026-03-15)
  - N+1 fix dropped query time 450ms → 28ms (2026-03-20)
```

### Semantic search across sessions

Ask "what was that fix for slow user queries?" and the agent finds the Prisma include{} decision from three weeks ago. BM25 + vector + knowledge graph fusion.

### Privacy filtering

Every captured observation is scanned for API keys, secrets, bearer tokens, and `<private>` tags. These are stripped before storage. Modern token formats supported: `sk-`, `sk-proj-`, `ghp_/ghs_/ghu_`, AWS keys, and more.

### Multi-agent coordination

If you're running multiple OpenClaw agents on the same codebase:

- **Leases** give one agent exclusive claim on an action so they don't stomp each other
- **Signals** let agents send threaded messages to each other with read receipts
- **Mesh sync** shares memory between agentmemory instances (requires `AGENTMEMORY_SECRET`)

## Troubleshooting

**"Connection refused on port 3111"** — The agentmemory server isn't running. Start it with `npx @agentmemory/agentmemory` in a separate terminal.

**"No memories returned"** — Check `http://localhost:3113` (the real-time viewer). If there are no observations, the hooks aren't firing. Make sure your OpenClaw plugin is loaded and enabled.

**"Search returns irrelevant results"** — Install local embeddings: `npm install @xenova/transformers`. This enables vector search for +8pp recall over BM25-only.

**"I want to see what agentmemory is learning"** — Open `http://localhost:3113` in a browser. Live observation stream, session explorer, memory graph, and health dashboard.

## See also

- [agentmemory main README](../../README.md)
- [Benchmark results](../../benchmark/LONGMEMEVAL.md) — 95.2% R@5 on LongMemEval-S
- [Competitor comparison](../../benchmark/COMPARISON.md) — vs mem0, Letta, Khoj, claude-mem, Hippo
- [Hermes integration](../hermes/README.md) — same server also works with Hermes Agent

## License

Apache-2.0 (same as agentmemory)
