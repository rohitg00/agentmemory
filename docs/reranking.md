# Optional local reranking

Set `RERANK_ENABLED=true` to rerank the first 20 hybrid-search candidates with the local `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder. The optional `@huggingface/transformers` dependency and model weights are required. The first search can download the model; subsequent searches reuse the loaded model.

The reranker uses the query and document as separate BERT segments. It limits each pair to 512 tokens using longest-first content truncation while preserving both segment separators. Long queries therefore retain document tokens. This is a token limit, not a character limit.

Result order reflects reranking within that candidate window. Candidates after the window keep their original order. The public search score remains the hybrid retrieval score; it is not a model probability. Internally, `rerankScore` records the cross-encoder's raw single logit, which may be negative, and `rerankPosition` records its position. Equal model scores retain their input order.

Expanded queries first merge their hybrid results, then rerank the merged window once against the original query. Model logits from different queries are not blended with hybrid retrieval scores.

If any candidate fails inference or returns an invalid score, the entire request keeps its original hybrid ordering and scores. A failed model load also preserves those results; a later search may retry loading after a one-minute cooldown. Concurrent searches share model loading. Reranking stays disabled unless explicitly enabled.
