# AI Agent Memory: Benchmark Comparison

How agentmemory compares against other persistent memory solutions for AI coding agents.

All numbers here come from published benchmarks or public repositories. We link to primary sources wherever possible so you can reproduce.

---

## Retrieval Accuracy (LongMemEval)

[LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) measures long-term memory retrieval across ~48 sessions per question on the S variant (500 questions, ~115K tokens each).

| System | Benchmark | R@5 | Notes |
|---|---|---|---|
| **agentmemory** (BM25 + Vector) | LongMemEval-S | **95.2%** | `all-MiniLM-L6-v2` embeddings, no API key |
| agentmemory (BM25-only) | LongMemEval-S | 86.2% | Fallback when no embedding provider available |
| MemPalace | LongMemEval-S | ~96.6% | Vector-only, bigger embedding model |
| Letta / MemGPT | LoCoMo | 83.2% | Different benchmark (LoCoMo, not LongMemEval) |
| Mem0 | LoCoMo | 68.5% | Different benchmark (LoCoMo, not LongMemEval) |

**⚠️ Apples vs oranges caveat:** agentmemory and MemPalace are measured on LongMemEval-S. Letta and Mem0 publish on [LoCoMo](https://snap-stanford.github.io/LoCoMo/), a different benchmark. We're showing both so you can see the ballpark. We'd love to run all four on the same dataset — if any maintainer wants to collaborate, open an issue.

Full agentmemory methodology: [`LONGMEMEVAL.md`](LONGMEMEVAL.md)

---

## Feature Matrix

| Feature | agentmemory | mem0 | Letta/MemGPT | Khoj | claude-mem | Hippo |
|---|---|---|---|---|---|---|
| **GitHub stars** | Growing | 53K+ | 22K+ | 34K+ | 46K+ | Trending |
| **Type** | Memory engine + MCP server | Memory layer API | Full agent runtime | Personal AI | MCP server | Memory system |
| **Auto-capture via hooks** | ✅ 12 lifecycle hooks | ❌ Manual `add()` | ❌ Agent self-edits | ❌ Manual | ✅ Limited | ❌ Manual |
| **Search strategy** | BM25 + Vector + Graph | Vector + Graph | Vector (archival) | Semantic | FTS5 | Decay-weighted |
| **Multi-agent coordination** | ✅ Leases + signals + mesh | ❌ | Runtime-internal only | ❌ | ❌ | Multi-agent shared |
| **Framework lock-in** | None | None | High | Standalone | Claude Code | None |
| **External deps** | None | Qdrant/pgvector | Postgres + vector | Multiple | None (SQLite) | None |
| **Self-hostable** | ✅ default | Optional | Optional | ✅ | ✅ | ✅ |
| **Knowledge graph** | ✅ Entity extraction + BFS | ✅ Mem0g variant | ❌ | Doc links | ❌ | ❌ |
| **Memory decay** | ✅ Ebbinghaus + tiered | ❌ | ❌ | ❌ | ❌ | ✅ Half-lives |
| **4-tier consolidation** | ✅ Working → episodic → semantic → procedural | ❌ | OS-inspired tiers | ❌ | ❌ | Episodic + semantic |
| **Version / supersession** | ✅ Jaccard-based | Passive | ❌ | ❌ | ❌ | ❌ |
| **Real-time viewer** | ✅ Port 3113 | Cloud dashboard | Cloud dashboard | Web UI | ❌ | ❌ |
| **Privacy filtering** | ✅ Strips secrets pre-store | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Obsidian export** | ✅ Built-in | ❌ | ❌ | Native format | ❌ | ❌ |
| **Cross-agent** | ✅ MCP + REST | API calls | Within runtime | Standalone | Claude-only | Multi-agent shared |
| **Audit trail** | ✅ All mutations logged | ❌ | Limited | ❌ | ❌ | ❌ |
| **Language SDKs** | Any (REST + MCP) | Python + TS | Python only | API | Any (MCP) | Node |

---

## Token Efficiency

The main reason to use persistent memory at all: token cost. Here's what one year of heavy agent use looks like across approaches.

| Approach | Tokens / year | Cost / year | Notes |
|---|---|---|---|
| Paste full history into context | 19.5M+ | Impossible | Exceeds context window after ~200 observations |
| LLM-summarized memory (extraction-based) | ~650K | ~$500 | Lossy — summarization drops detail |
| **agentmemory (API embeddings)** | **~170K** | **~$10** | Token-budgeted, only relevant memories injected |
| **agentmemory (local embeddings)** | **~170K** | **$0** | `all-MiniLM-L6-v2` runs in-process |
| claude-mem | Reports ~10x savings | — | SQLite + FTS5 + 3-layer filter |
| Mem0 | Varies by integration | — | Extraction-based, no token budget |

**agentmemory ships with a built-in token savings calculator.** Run `npx @agentmemory/agentmemory status` after a few sessions and you'll see exactly how many tokens you've saved vs. pasting the full history.

---

## What Each Tool Is Best At

This isn't a "agentmemory wins everything" page. Different tools solve different problems.

**Choose agentmemory if you want:**
- Automatic capture with zero manual `add()` calls
- MCP server that works across Claude Code, Cursor, Codex, Gemini CLI, etc.
- Hybrid BM25 + vector + graph search
- Real-time viewer to see what your agent is learning
- Self-hostable with zero external databases
- Privacy filtering on API keys and secrets
- Multi-agent coordination (leases, signals, routines)

**Choose Mem0 if you want:**
- Framework-agnostic API to bolt onto an existing agent
- Managed cloud option with a dashboard
- Python + TypeScript SDKs for direct integration
- Entity/relationship extraction as the primary abstraction

**Choose Letta/MemGPT if you want:**
- A full agent runtime, not just memory
- OS-inspired memory tiers (core/archival/recall)
- Agents that self-edit their memory via function calls
- Long-running conversational agents (weeks/months)

**Choose Khoj if you want:**
- A personal AI second brain, not agent infrastructure
- Document-first search over your files and the web
- Obsidian/Notion/Emacs integrations
- Scheduled automations and research tasks

**Choose claude-mem if you want:**
- Claude Code-specific tooling with SQLite + FTS5
- Minimal install footprint
- Token compression via LLM

**Choose Hippo if you want:**
- Biologically-inspired memory model (decay, consolidation, sleep)
- Multi-agent shared memory as a primary feature
- "Forget by default, earn persistence through use" philosophy

---

## Running Your Own Benchmarks

We encourage you to measure this yourself rather than trust any README. Here's how:

```bash
# Clone the repo
git clone https://github.com/rohitg00/agentmemory.git
cd agentmemory && npm install

# Run LongMemEval-S
npm run bench:longmemeval

# Run quality benchmark (240 observations, 20 queries)
npm run bench:quality

# Run scale benchmark
npm run bench:scale

# Run real embeddings benchmark
npm run bench:real-embeddings
```

Results land in `benchmark/results/`. All scripts, datasets, and results are committed for reproducibility.

---

## Corrections Welcome

If you maintain one of these tools and we got a number wrong, please open an issue or PR. We'd rather have accurate numbers than convenient ones.

If you want to add your tool to this comparison, open a PR with:
1. A link to your benchmark methodology
2. The metric and dataset you're measuring on
3. A commit hash / version so we can reproduce

**Sources:**
- Mem0 LoCoMo benchmark: [mem0.ai blog](https://mem0.ai)
- Letta LoCoMo benchmark: [letta.com/blog/benchmarking-ai-agent-memory](https://letta.com/blog/benchmarking-ai-agent-memory)
- LongMemEval paper: [arxiv.org/abs/2410.10813](https://arxiv.org/abs/2410.10813)
- LoCoMo paper: [snap-stanford.github.io/LoCoMo](https://snap-stanford.github.io/LoCoMo/)
