# Pairings

Open-source projects shipping the rest of the AI coding agent context layer. agentmemory ships persistent session memory. The projects below ship code-graph indexing, multi-agent build pipelines with dashboards, and broader knowledge graphs across non-code assets. Stack them and your agent gets a fuller picture in fewer tool calls.

## [codegraph](https://github.com/colbymchenry/codegraph) — pre-indexed code knowledge graph (MCP)

What it does: builds a SQLite-backed code knowledge graph (symbols, call edges, route handlers, full-text search) and exposes it through an MCP server with 8 tools (`codegraph_search`, `codegraph_context`, `codegraph_callers`, `codegraph_callees`, `codegraph_impact`, `codegraph_node`, `codegraph_status`, `codegraph_files`). File watcher keeps the index fresh. Their published benchmark (across VS Code, Django, Tokio, OkHttp, Gin, Alamofire, Excalidraw) shows agents finishing the same architecture question in **~35% less cost, ~70% fewer tool calls** when codegraph is wired in.

Recipe with agentmemory — both as MCP servers on the same agent:

```jsonc
// ~/.claude.json or your agent's MCP config
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    },
    "agentmemory": {
      "type": "stdio",
      "command": "npx",
      "args": ["@agentmemory/mcp"]
    }
  }
}
```

Question routing that falls out:

| Question | Tool the agent reaches for |
|---|---|
| "What does `shipctl helm install` call?" | `codegraph_callees` |
| "Where is `auth_check` defined?" | `codegraph_node` |
| "Which routes hit the user controller?" | `codegraph_callers` on the controller node |
| "What did we decide last week about retries?" | `memory_smart_search` |
| "Why did we pick async-std?" | `memory_recall` |
| "Fix the auth bug from the post-mortem" | `memory_smart_search` → post-mortem session, then `codegraph_node` → current `auth.rs` |

## [Understand Anything](https://github.com/Lum1104/Understand-Anything) — multi-agent code-graph pipeline + dashboard

What it does: a Claude Code plugin (also installable on 13+ other agents) runs a multi-agent pipeline over a project and produces an interactive web dashboard at `understand-anything.com`. Architecture layers, business-flow domain view, guided tours, persona-adaptive UI, diff impact analysis, framework-aware routes across 14 frameworks. The graph commits to `.understand-anything/knowledge-graph.json` so teammates skip the pipeline.

Slash commands:
- `/understand` — build the graph (incremental on re-run)
- `/understand-dashboard` — open the interactive web dashboard
- `/understand-chat` — ask anything about the codebase
- `/understand-diff` — analyze impact of current changes
- `/understand-explain` — deep-dive a file or function
- `/understand-onboard` — generate an onboarding guide
- `/understand-domain` — extract business domains, flows, steps
- `/understand-knowledge` — analyze an LLM wiki knowledge base

Recipe with agentmemory:

```bash
# Day 1 — new team member joins
/understand                                     # builds the graph
/understand-dashboard                           # opens the visual map
/understand-onboard                             # generates onboarding guide

# Week 2 — same engineer hits a bug
/understand-explain src/auth.rs                 # architecture context
# agentmemory MCP surfaces the post-mortem and the past 3 fixes touching auth.rs
```

The graph teaches you the codebase. agentmemory remembers what you and the agent already did inside it. The two planes don't overlap.

## [Graphify](https://github.com/safishamsi/graphify) — broader knowledge graph across code, docs, PDFs, images, videos

What it does: a single slash command (`/graphify .`) maps a whole project — application code, SQL schemas, R scripts, shell scripts, docs, PDFs, papers, images, videos — into one queryable knowledge graph. Output is three files: an interactive `graph.html`, a markdown `GRAPH_REPORT.md` with highlights and suggested questions, and the full `graph.json`. Also ships `graphify export callflow-html` for Mermaid call-flow architecture pages.

Runs as a skill on Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Copilot CLI, VS Code Copilot Chat, Aider, OpenClaw, Factory Droid, Trae, Hermes, Kimi Code, Kiro, Pi, and Google Antigravity.

Recipe with agentmemory:

```bash
/graphify .                                     # one graph: code + docs + PDFs + images
```

This is the broadest sweep across artifacts that live alongside the code. agentmemory then captures everything the agent does while exploring that graph — the questions you asked, the conclusions, the decisions — so the next session opens with both the graph and the conversation history available.

## How the four projects line up

Four planes, four consumers, four update models. None of them try to do what the others do.

| Project | Plane | Surface | Consumer | Update model |
|---|---|---|---|---|
| [agentmemory](https://github.com/rohitg00/agentmemory) | session history (observations, decisions, preferences) | MCP + REST + hooks | agent | live (observations stream) |
| [codegraph](https://github.com/colbymchenry/codegraph) | code structure (symbols, call edges, routes) | MCP server | agent | live (FS watcher) |
| [Understand Anything](https://github.com/Lum1104/Understand-Anything) | code structure + business domain + architecture | plugin (slash commands) + web dashboard | **human** + agent | on-demand `/understand` |
| [Graphify](https://github.com/safishamsi/graphify) | code + docs + PDFs + images + videos | skill (slash command) | human + agent | on-demand `/graphify` |

## Question types each project handles best

| Question shape | Best tool |
|---|---|
| "What's the architecture of this repo?" | Understand-Anything dashboard or Graphify `graph.html` |
| "Where is symbol X defined? Who calls it?" | codegraph (`codegraph_node`, `codegraph_callers`) |
| "What does this PDF spec say about the rate limit?" | Graphify |
| "Why did we pick X over Y three sessions ago?" | agentmemory (`memory_smart_search`) |
| "What did we ship on April 8?" | agentmemory (`memory_timeline`) |
| "How does the payment flow work in this codebase?" | Understand-Anything (`/understand-chat`) |
| "Trace impact of changing `Foo::bar`" | codegraph (`codegraph_impact`) or Understand-Anything (`/understand-diff`) |
| "What preferences has the team locked in?" | agentmemory |

## Suggested install order for a brand-new project

1. **agentmemory** — observe and persist from day one, even before the codebase has structure. Run `npx @agentmemory/agentmemory connect` and pick your agent.
2. **codegraph** — once code lands, agent queries answer from the index instead of grepping. Run `npx @colbymchenry/codegraph`.
3. **Understand Anything** *or* **Graphify** — when the codebase passes a few thousand LOC or starts shipping docs and PDFs alongside code, generate the graph for visual exploration and onboarding. Run `/plugin install understand-anything` or `uv tool install graphifyy && graphify install`.

All four are local-first (no data leaves the machine for code-graph workloads). Stacking them costs nothing extra at the network boundary.

## Cross-project benchmark idea

`eval/runner/adapters/` accepts new adapters against the same coding-agent-life-v1 corpus and the published LongMemEval `_s` benchmark. A `codegraph` adapter or an `understand-anything` adapter or a `graphify` adapter would let us publish a side-by-side scorecard showing which project owns which question class. The win for the ecosystem is precise framing: each project gets credit for what it does best, with reproducible numbers from a shared harness.

If you build any of those adapters, open a PR against `agentmemory` with the adapter file under `eval/runner/adapters/` and a scorecard under `docs/benchmarks/`. The scaffold and contract live in [`eval/README.md`](../../eval/README.md).
