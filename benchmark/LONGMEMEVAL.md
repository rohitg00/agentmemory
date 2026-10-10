# LongMemEval-S Benchmark Results

[LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) is an academic benchmark for evaluating long-term memory in chat assistants. It tests 5 core abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.

## Setup

- **Dataset**: LongMemEval-S (500 questions, ~48 sessions per question, ~115K tokens)
- **Source**: [xiaowu0162/longmemeval-cleaned](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned)
- **Metric**: `recall_any@K` — does ANY gold session appear in top-K retrieved results?
- **Embedding model**: `all-MiniLM-L6-v2` (384 dimensions, local, no API key)
- **No LLM in the loop**: Pure retrieval evaluation, no answer generation or judge

## Results

| System | R@5 | R@10 | R@20 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| **agentmemory BM25+Vector** | **95.2%** | **98.6%** | **99.4%** | **87.9%** | **88.2%** |
| agentmemory BM25-only | 86.2% | 94.6% | 98.6% | 73.0% | 71.5% |
| MemPalace raw (vector-only) | 96.6% | ~97.6% | — | — | — |

### By Question Type (BM25+Vector)

| Type | R@5 | R@10 | Count |
|---|---|---|---|
| knowledge-update | 98.7% | 100.0% | 78 |
| multi-session | 97.7% | 100.0% | 133 |
| single-session-assistant | 96.4% | 98.2% | 56 |
| temporal-reasoning | 95.5% | 97.7% | 133 |
| single-session-user | 90.0% | 97.1% | 70 |
| single-session-preference | 83.3% | 96.7% | 30 |

### By Question Type (BM25-only)

| Type | R@5 | R@10 | Count |
|---|---|---|---|
| knowledge-update | 92.3% | 98.7% | 78 |
| single-session-user | 91.4% | 95.7% | 70 |
| temporal-reasoning | 88.0% | 94.7% | 133 |
| multi-session | 86.5% | 96.2% | 133 |
| single-session-assistant | 80.4% | 91.1% | 56 |
| single-session-preference | 60.0% | 80.0% | 30 |

## Analysis

1. **BM25+Vector (95.2%) nearly matches pure vector search (96.6%)** with only a 1.4pp gap. Both use the same embedding model (all-MiniLM-L6-v2).

2. **BM25 alone gets 86.2%** — keyword search with Porter stemming and synonym expansion is surprisingly effective on conversational data.

3. **Adding vectors to BM25 gives +9pp** (86.2% → 95.2%), the largest improvement from any single component.

4. **Preferences are the hardest category** for both BM25 (60%) and hybrid (83.3%). These require understanding implicit/indirect statements.

5. **Multi-session and knowledge-update are strongest** (97.7%+ hybrid). The hybrid approach excels when facts are distributed across sessions.

6. **R@10 reaches 98.6%** — nearly all gold sessions are found within the top 10 results.

## Important Notes on Methodology

- These are **retrieval recall** scores, not end-to-end QA accuracy. The official LongMemEval metric is QA accuracy (retrieve + generate answer + GPT-4o judge).
- Systems on the actual LongMemEval QA leaderboard score 60-95% depending on the LLM reader (Oracle GPT-4o gets ~82.4%).
- We do NOT claim these as "LongMemEval scores" — they are retrieval-only evaluations on the LongMemEval-S haystack.
- Each question builds a fresh index from its ~48 sessions, searches with the question text, and checks if gold session IDs appear in results.

## Reproducibility

```bash
# Download dataset (264 MB)
pip install huggingface_hub
python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='xiaowu0162/longmemeval-cleaned', filename='longmemeval_s_cleaned.json', repo_type='dataset', local_dir='benchmark/data')
"

# Run BM25-only
npx tsx benchmark/longmemeval-bench.ts bm25

# Run BM25+Vector hybrid (requires @huggingface/transformers)
npx tsx benchmark/longmemeval-bench.ts hybrid
```
