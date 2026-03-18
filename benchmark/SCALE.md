# agentmemory v0.6.0 — Scale & Cross-Session Evaluation

**Date:** 2026-03-18T07:45:03.529Z
**Platform:** darwin arm64, Node v20.20.0

## 1. Scale: agentmemory vs Built-in Memory

Every built-in agent memory (CLAUDE.md, .cursorrules, Cline's memory-bank) loads ALL memory into context every session. agentmemory searches and returns only relevant results.

| Observations | Sessions | Index Build | BM25 Search | Hybrid Search | Heap | Context Tokens (built-in) | Context Tokens (agentmemory) | Savings | Built-in Unreachable |
|-------------|----------|------------|-------------|---------------|------|--------------------------|-----------------------------|---------|--------------------|
| 240 | 30 | 177ms | 0.112ms | 0.63ms | 9MB | 10,504 | 1,924 | 82% | 17% |
| 1,000 | 125 | 155ms | 0.317ms | 1.709ms | 6MB | 43,834 | 1,969 | 96% | 80% |
| 5,000 | 625 | 810ms | 1.496ms | 8.58ms | 25MB | 220,335 | 1,972 | 99% | 96% |
| 10,000 | 1250 | 1657ms | 3.195ms | 17.49ms | 1MB | 440,973 | 1,974 | 100% | 98% |
| 50,000 | 6250 | 9182ms | 22.827ms | 108.722ms | 316MB | 2,216,173 | 1,981 | 100% | 100% |

### What the numbers mean

**Context Tokens (built-in):** How many tokens Claude Code/Cursor/Cline would consume loading ALL memory into the context window. At 5,000 observations, this is ~250K tokens — exceeding most context windows entirely.

**Context Tokens (agentmemory):** How many tokens the top-10 search results consume. Stays constant regardless of corpus size.

**Built-in Unreachable:** Percentage of memories that built-in systems CANNOT access because they exceed the 200-line MEMORY.md cap or context window limits. At 1,000 observations, 80% of your project history is invisible.

### Storage Costs

| Observations | BM25 Index | Vector Index (d=384) | Total Storage |
|-------------|-----------|---------------------|---------------|
| 240 | 395 KB | 494 KB | 0.9 MB |
| 1,000 | 1,599 KB | 2,060 KB | 3.6 MB |
| 5,000 | 8,006 KB | 10,298 KB | 17.9 MB |
| 10,000 | 16,005 KB | 20,596 KB | 35.7 MB |
| 50,000 | 80,126 KB | 102,979 KB | 178.8 MB |

## 2. Cross-Session Retrieval

Can the system find relevant information from past sessions? This is impossible for built-in memory once observations exceed the line/context cap.

| Query | Target Session | Gap | BM25 Found | BM25 Rank | Hybrid Found | Hybrid Rank | Built-in Visible |
|-------|---------------|-----|-----------|-----------|-------------|-------------|-----------------|
| How did we set up OAuth providers? | ses_005-009 | 24 | Yes | #1 | Yes | #1 | Yes |
| What was the N+1 query fix? | ses_010-014 | 18 | Yes | #1 | Yes | #2 | Yes |
| PostgreSQL full-text search setup | ses_010-014 | 17 | Yes | #1 | Yes | #1 | Yes |
| bcrypt password hashing configuration | ses_005-009 | 20 | Yes | #1 | Yes | #1 | Yes |
| Vitest unit testing setup | ses_020-024 | 9 | Yes | #1 | Yes | #1 | Yes |
| webhook retry exponential backoff | ses_015-019 | 14 | Yes | #1 | Yes | #1 | Yes |
| ESLint flat config migration | ses_000-004 | 29 | Yes | #1 | Yes | #1 | Yes |
| Kubernetes HPA autoscaling configuration | ses_025-029 | 4 | Yes | #1 | Yes | #1 | No |
| Prisma database seed script | ses_010-014 | 16 | Yes | #1 | Yes | #1 | Yes |
| API cursor-based pagination | ses_015-019 | 14 | Yes | #1 | Yes | #1 | Yes |
| CSRF protection double-submit cookie | ses_005-009 | 24 | Yes | #1 | Yes | #1 | Yes |
| blue-green deployment rollback | ses_025-029 | 4 | Yes | #1 | Yes | #1 | No |

**Summary:** agentmemory BM25 found 12/12 cross-session queries. Hybrid found 12/12. Built-in memory (200-line cap) could only reach 10/12.

## 3. The Context Window Problem

```
Agent context window: ~200K tokens
System prompt + tools:  ~20K tokens
User conversation:      ~30K tokens
Available for memory:  ~150K tokens

At 50 tokens/observation:
  200 observations  =  10,000 tokens  (fits, but 200-line cap hits first)
  1,000 observations =  50,000 tokens  (33% of available budget)
  5,000 observations = 250,000 tokens  (EXCEEDS total context window)

agentmemory top-10 results:
  Any corpus size     =  ~1,924 tokens  (0.3% of budget)
```

## 4. What Built-in Memory Cannot Do

| Capability | Built-in (CLAUDE.md) | agentmemory |
|-----------|---------------------|-------------|
| Semantic search | No (keyword grep only) | BM25 + vector + graph |
| Scale beyond 200 lines | No (hard cap) | Unlimited |
| Cross-session recall | Only if in 200-line window | Full corpus search |
| Cross-agent sharing | No (per-agent files) | MCP + REST API |
| Multi-agent coordination | No | Leases, signals, actions |
| Temporal queries | No | Point-in-time graph |
| Memory lifecycle | No (manual pruning) | Ebbinghaus decay + eviction |
| Knowledge graph | No | Entity extraction + traversal |
| Query expansion | No | LLM-generated reformulations |
| Retention scoring | No | Time-frequency decay model |
| Real-time dashboard | No (read files manually) | Viewer on :3113 |
| Concurrent access | No (file lock) | Keyed mutex + KV store |

## 5. When to Use What

**Use built-in memory (CLAUDE.md) when:**
- You have < 200 items to remember
- Single agent, single project
- Preferences and quick facts only
- Zero setup is the priority

**Use agentmemory when:**
- Project history exceeds 200 observations
- You need to recall specific incidents from weeks ago
- Multiple agents work on the same codebase
- You want semantic search ("how does auth work?") not just keyword matching
- You need to track memory quality, decay, and lifecycle
- You want a shared memory layer across Claude Code, Cursor, Windsurf, etc.

Built-in memory is your sticky notes. agentmemory is the searchable database behind them.

---
*Scale tests: 5 corpus sizes. Cross-session tests: 12 queries targeting specific past sessions.*