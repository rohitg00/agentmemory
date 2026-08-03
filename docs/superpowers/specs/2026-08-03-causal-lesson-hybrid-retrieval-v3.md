# Causal Lesson Hybrid Retrieval v3

Date: 2026-08-03

Status: implementation contract

## Goal

Generation-time memory asks one narrow question: have we effectively tried
something like this before? The answer should come from distilled causal
lessons, not raw backtests, observation-table dumps, or a graph walk.

PR3 upgrades the existing lesson-recall surfaces:

- internal function `mem::lesson-recall`;
- REST `POST /agentmemory/lessons/search`;
- MCP `memory_lesson_recall`.

It does not add a competing search tool or endpoint. `KV.lessons` remains the
authoritative source. Observation BM25/vector indexes and graph retrieval are
not used.

## Request contract

Required:

- `query`, a non-empty string of at most 2,048 characters.

Optional:

- `project`;
- `minConfidence` in `[0, 1]`;
- `limit` from 1 through 50;
- `retrievalMode`, `lexical` or `hybrid`;
- `compact`;
- `mechanismId`;
- `claimType`;
- `evidenceVerdicts`;
- `structuredFacets`;
- `tags`;
- `scopeRing`;
- `sensitivity`.

Unknown boundary fields are ignored. In particular, caller-supplied access
contexts, candidate IDs, lifecycle overrides, and hidden-row flags cannot
change server-resolved authorization or the candidate corpus.

Facet dimensions are ANDed. Values within one dimension are ORed. Tags are
ANDed. Matches are exact after case and whitespace normalization; substring
matches do not satisfy structured filters.

Schema v1 facets are string-valued, so PR3 supports exact categorical outcome
buckets but not numeric range predicates. Typed outcome metrics and range
filters require a separate schema revision rather than string parsing inside
the retriever.

## Ordered retrieval pipeline

The order is a security invariant:

1. enumerate and normalize authoritative lesson rows;
2. keep active, non-deleted lessons only;
3. apply the server-resolved read policy;
4. apply confidence, project, mechanism, verdict, scope, sensitivity, tag, and
   facet filters;
5. rank only the surviving candidates;
6. project only the returned rows;
7. audit returned lesson IDs and a one-way query fingerprint.

Unauthorized lesson text, IDs, corpus counts, and provider diagnostics never
enter embedding calls or public retrieval diagnostics. Adding an otherwise
valid unauthorized row must leave the response, provider inputs, and
diagnostics unchanged. Malformed authoritative lesson state fails closed with
a bounded `lesson_state_unavailable` error and no provider call.

## Lexical compatibility

Direct recall defaults to `lexical`. It preserves the preceding
confidence-times-relevance-times-recency scorer and output rounding. Stable
lesson-ID ordering resolves exact score ties. Lexical mode performs no
embedding work.

Smart-search explicitly requests `hybrid` and `compact` for its lesson branch.
Observation results remain independent; a lesson-recall failure produces an
empty lesson list without changing observation results.

## Hybrid ranking

The embedding document contains the distilled claim and content, mechanism and
aliases, claim type and verdict, applicability/non-applicability/falsification
conditions, structured facets, and tags. Raw lesson context, evidence
references, and source rows are excluded.

Hybrid mode:

1. computes lexical ranks for every authorized, filtered candidate;
2. computes semantic ranks for embedding-eligible candidates;
3. excludes non-finite vectors, dimension mismatches, and cosine similarity
   below `0.2`;
4. combines lexical weight `0.4` and semantic weight `0.6` with reciprocal-rank
   fusion using `k = 60`;
5. applies a bounded confidence weight and stable lesson-ID tie break.

A semantic match may be returned with zero lexical overlap. The graph is not a
third ranking channel.

## Egress policy

Local providers may embed every authorized candidate.

Remote providers require the server-owned opt-in
`AGENTMEMORY_LESSON_REMOTE_EMBEDDINGS=true`. The query is part of that explicit
egress decision. Candidate text is additionally bounded by
`AGENTMEMORY_LESSON_EMBED_MAX_SENSITIVITY`, which defaults to `public`.

Rows above the configured ceiling remain lexical candidates but are not sent
to the remote provider. Mixed requests return the fixed notice
`embedding_sensitivity_filtered`; they do not expose excluded counts or IDs.
If no candidate is embedding-eligible, retrieval falls back entirely with
`embedding_sensitivity_blocked`. An invalid ceiling fails closed.

## Bounded degradation

Hybrid work is limited to 256 authorized, filtered candidates, batches of 32,
and a five-second wall-clock semantic budget. The deadline stops new batches
and prevents late results from mutating the cache. The provider interface does
not currently accept an abort signal, so an already-running provider call may
finish after the response; no subsequent batch is scheduled.

Fixed lexical fallback codes are:

- `embedding_provider_unavailable`;
- `remote_embedding_disabled`;
- `embedding_policy_invalid`;
- `embedding_sensitivity_blocked`;
- `semantic_candidate_limit_exceeded`;
- `embedding_failed`;
- `semantic_no_signal`.

Provider error text is never returned.

## Cache

PR3 uses a lazy, process-local public cache scoped to the provider object. Keys
include the lesson ID and an exact fingerprint of the complete embedding
document. Changed retrieval text therefore invalidates the entry. Cold
concurrent public misses are serialized and rechecked under one keyed lock.
Public candidate embeddings are bounded to 4,096 entries with oldest-entry
eviction.

Internal, confidential, and restricted embeddings remain request-local and
never enter the shared cache or its lock. A privileged protected retrieval
therefore cannot change a lower-privileged caller's cache hits, provider calls,
or lock timing.

The cache is not persisted or exported. A durable vector index is deferred
because the current provider interface exposes name and dimensions but not a
stable model/version identity adequate for a safe persistent cache key.

## Compact projection

`compact: true` omits evidence references, source IDs, raw context, and other
large provenance rows. It caps:

- content at 400 characters;
- claim at 300;
- each condition family at two 160-character entries;
- facets at six sorted dimensions and three 64-character values each;
- tags at eight 64-character entries.

The projection retains lesson ID, mechanism, claim type, verdict,
contradiction state, confidence, score, scope, sensitivity, project, and
timestamps. One maximally populated projection must remain at or below 6,000
UTF-8 bytes.

## Rollout boundary

Merging PR3 does not rebuild the globally installed package, change the
revision lock, restart `agentmemory.service`, enable remote egress, or activate
hybrid retrieval in the live daemon. Publication, deployment, and activation
remain separate operator decisions.
