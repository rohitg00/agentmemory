# agentmemory v0.6.0 — Search Quality Evaluation

**Date:** 2026-03-18T07:44:43.397Z
**Dataset:** 240 observations across 30 sessions (realistic coding project)
**Queries:** 20 labeled queries with ground-truth relevance
**Metric definitions:** Recall@K (fraction of relevant docs in top K), Precision@K (fraction of top K that are relevant), NDCG@10 (ranking quality), MRR (position of first relevant result)

## Head-to-Head Comparison

| System | Recall@5 | Recall@10 | Precision@5 | NDCG@10 | MRR | Latency | Tokens/query |
|--------|----------|-----------|-------------|---------|-----|---------|--------------|
| Built-in (CLAUDE.md / grep) | 37.0% | 55.8% | 78.0% | 80.3% | 82.5% | 0.50ms | 22,610 |
| Built-in (200-line MEMORY.md) | 27.4% | 37.8% | 63.0% | 56.4% | 65.5% | 0.16ms | 7,938 |
| BM25-only | 43.8% | 55.9% | 95.0% | 82.7% | 95.5% | 0.17ms | 3,142 |
| Dual-stream (BM25+Vector) | 42.4% | 58.6% | 90.0% | 84.7% | 95.4% | 0.71ms | 3,142 |
| Triple-stream (BM25+Vector+Graph) | 36.8% | 58.0% | 87.0% | 81.7% | 87.9% | 1.02ms | 3,142 |

## Why This Matters

**Recall improvement:** agentmemory triple-stream finds 58.0% of relevant memories at K=10 vs 55.8% for keyword grep (+4%)
**Token savings:** agentmemory returns only the top 10 results (3,142 tokens) vs loading everything into context (22,610 tokens) — 86% reduction
**200-line cap:** Claude Code's MEMORY.md is capped at 200 lines. With 240 observations, 37.8% recall at K=10 — memories from later sessions are simply invisible.

## Per-Query Breakdown (Triple-Stream)

| Query | Category | Recall@10 | NDCG@10 | MRR | Relevant | Latency |
|-------|----------|-----------|---------|-----|----------|---------|
| How did we set up authentication? | semantic | 50.0% | 100.0% | 100.0% | 20 | 1.7ms |
| JWT token validation middleware | exact | 50.0% | 64.9% | 100.0% | 10 | 1.2ms |
| PostgreSQL connection issues | semantic | 33.3% | 100.0% | 100.0% | 30 | 1.0ms |
| Playwright test configuration | exact | 100.0% | 100.0% | 100.0% | 10 | 1.1ms |
| Why did the production deployment fail? | cross-session | 33.3% | 100.0% | 100.0% | 30 | 0.8ms |
| rate limiting implementation | exact | 80.0% | 64.1% | 33.3% | 10 | 0.7ms |
| What security measures did we add? | semantic | 33.3% | 100.0% | 100.0% | 30 | 0.7ms |
| database performance optimization | semantic | 0.0% | 0.0% | 7.1% | 25 | 0.8ms |
| Kubernetes pod crash debugging | entity | 100.0% | 96.7% | 100.0% | 5 | 1.2ms |
| Docker containerization setup | entity | 100.0% | 100.0% | 100.0% | 10 | 0.9ms |
| How does caching work in the app? | semantic | 25.0% | 64.9% | 100.0% | 20 | 0.8ms |
| test infrastructure and factories | exact | 50.0% | 64.9% | 100.0% | 10 | 0.7ms |
| What happened with the OAuth callback error? | cross-session | 100.0% | 54.1% | 16.7% | 5 | 1.1ms |
| monitoring and observability setup | semantic | 66.7% | 100.0% | 100.0% | 15 | 0.8ms |
| Prisma ORM configuration | entity | 25.7% | 93.6% | 100.0% | 35 | 1.8ms |
| CI/CD pipeline configuration | exact | 20.0% | 64.9% | 100.0% | 25 | 1.0ms |
| memory leak debugging | cross-session | 100.0% | 100.0% | 100.0% | 5 | 0.7ms |
| API design decisions | semantic | 25.0% | 64.9% | 100.0% | 20 | 1.4ms |
| zod validation schemas | entity | 66.7% | 100.0% | 100.0% | 15 | 0.7ms |
| infrastructure as code Terraform | entity | 100.0% | 100.0% | 100.0% | 5 | 1.5ms |

## By Query Category

| Category | Avg Recall@10 | Avg NDCG@10 | Avg MRR | Queries |
|----------|---------------|-------------|---------|---------|
| exact | 60.0% | 71.8% | 86.7% | 5 |
| semantic | 33.3% | 75.7% | 86.7% | 7 |
| cross-session | 77.8% | 84.7% | 72.2% | 3 |
| entity | 78.5% | 98.1% | 100.0% | 5 |

## Context Window Analysis

The fundamental problem with built-in agent memory:

| Observations | MEMORY.md tokens | agentmemory tokens (top 10) | Savings | MEMORY.md reachable |
|-------------|-----------------|---------------------------|---------|-------------------|
| 240 | 12,000 | 3,142 | 74% | 83% |
| 500 | 25,000 | 3,142 | 87% | 40% |
| 1,000 | 50,000 | 3,142 | 94% | 20% |
| 5,000 | 250,000 | 3,142 | 99% | 4% |

At 240 observations (our dataset), MEMORY.md already hits its 200-line cap and loses access to the most recent 40 observations. At 1,000 observations, 80% of memories are invisible. agentmemory always searches the full corpus.

---

*100 evaluations across 5 systems. Ground-truth labels assigned by concept matching against observation metadata.*