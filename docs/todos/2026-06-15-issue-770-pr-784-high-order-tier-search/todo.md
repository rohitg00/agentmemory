# Issue 770 / PR 784 Review

Scope: Review the upstream claim that smart search should index semantic facts, procedural skills, crystals, insights, and facets, then decide whether PR 784 should be imported into this fork.

## Sprint Contract

Goal: Determine whether the issue remains relevant in the current fork, inspect PR 784 as untrusted input, and either implement the smallest safe fork change or record a no-import decision.

Scope:
- Current smart-search, vector-indexing, embedding, backfill, and persistence paths.
- Security review for scope isolation, backfill safety, resource usage, malformed data handling, and cross-project leakage.
- Neutral local documentation using `PR 784`, `Issue 770`, and `Fork issue 467`.

Non-goals:
- No GitHub writes, pushes, labels, comments, or PR creation.
- No credentialed GitHub API reads or logged-in browser reads.
- No broad search/indexing redesign beyond what the issue proves necessary.

Acceptance criteria:
- Issue-first relevance is documented from current repo evidence.
- PR 784 diff is inspected as untrusted input.
- Decision is one of import, adapted import, reject, defer, already-fixed, or blocked.
- Targeted tests or evidence support the decision.
- Required security gates are run when code changes remain, or skipped with reason when no code changes remain.
- `$prep-merge-to-local-main` is run or its no-op/skip path is documented.

Intended verification:
- Focused source/test inspection for smart search, vector index, embedding provider, and tier stores.
- Targeted Vitest suites if behavior changes are implemented.
- Diff/security review gates according to the final changed surface.
- Final `git status -sb --untracked-files=all`.

Known boundaries:
- Public upstream metadata and diffs are allowed as read-only evidence.
- Credentialed GitHub reads and all remote writes require explicit current-turn approval and are out of scope for this task.
- Search/indexing touches persistence and possible remote embedding text egress; any import must preserve explicit embedding opt-in and project isolation.

Stop conditions:
- Correct behavior requires a schema/data migration, new service, or externally visible API boundary change without approval.
- PR evidence cannot be fetched through public read-only paths.
- Required review or security gates produce unresolved blocking findings.

## Feature / Verification Matrix

| Change / Decision Surface | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue 770 relevance | Inspect current tier stores and smart-search indexing paths | Done | Current `mem::smart-search` searches observation/memory hybrid results plus lesson recall. Semantic, procedural, crystal, insight, and facet stores exist, but are not unified into the smart-search candidate pool. |
| PR 784 fit | Inspect public diff as untrusted input | Done | PR 784 adds four-tier search and embedding backfill, but omits facets, is stale against current endpoint counts, and does not preserve current project/agent isolation expectations for all tiers. |
| Fork decision | Compare issue need, PR implementation, and local safety constraints | Done | Decision: defer. Issue remains relevant, but PR 784 should not be imported as-is or minimally adapted in this pass. |
| Implementation, if any | Targeted tests around affected behavior | Not applicable | No production code imported because the candidate is incomplete and security-sensitive. Existing targeted suites passed. |
| Security review | Manual security checklist plus required gates for any diff | Done | Manual review found no task-owned production diff. PR 784 itself has unresolved risks: partial project scoping, no facet coverage, broad embedding/backfill persistence changes, and background resource usage concerns. |
| Prep merge | `$prep-merge-to-local-main` workflow | Pending |  |

## Progress

- 2026-06-15: Worktree attached to `review/issue-770-pr-784-high-order-tier-search` from detached HEAD.
- 2026-06-15: Coordinator row found pending for `PR 784`, `Issue 770`, `Fork issue 467`.
- 2026-06-15: Public issue and PR metadata plus public PR diff fetched without credentials.
- 2026-06-15: Targeted verification passed with the main checkout's installed Vitest config: 7 files / 95 tests.

Verification command:

```bash
vitest run --config /Users/A1538552/_projects/_tools/agentmemory/vitest.config.ts --root /Users/A1538552/.codex/worktrees/6434/agentmemory --exclude test/integration.test.ts test/smart-search.test.ts test/agent-isolation-search.test.ts test/api-boundary-coverage.test.ts test/facets.test.ts test/reflect.test.ts test/crystallize.test.ts test/consolidation-pipeline.test.ts
```

## Review Notes

Decision: defer PR 784.

Issue-first finding:
- The issue is still relevant in the current fork. `mem::smart-search` returns compact observation/memory hits and optionally lesson recall results. The high-order tiers are readable through dedicated functions and REST surfaces, but semantic facts, procedural skills, crystals, insights, and facets are not part of the unified smart-search candidate pool or cross-tier `expandIds` behavior.

PR 784 inspection:
- The candidate implements a new high-order search helper, a background embedding backfill function, optional inline embeddings on semantic/procedural/crystal/insight writes, and a new REST backfill endpoint.
- It covers semantic, procedural, crystal, and insight rows, but does not index facets, so it does not satisfy the issue's claimed tier set.
- It is stale against current fork state. The current fork already has explicit text-embedding opt-in and different REST endpoint counts; the candidate's documentation/count changes would regress local consistency.
- It changes persistence schema shape by adding optional embedding fields to high-order records and adds a background backfill path. That needs a dedicated migration/backfill design, dimension validation, batching limits, and operator controls before import.

Security review:
- Auth/isolation: PR 784 skips high-order search when an agent filter is active, which avoids one cross-agent leak path, but it leaves project filtering incomplete. Semantic and procedural rows do not carry project fields locally, and the PR would include them even when a project filter is supplied. Facets also lack project and are omitted entirely.
- Data egress: Inline/backfill embeddings would send high-order memory text to the configured embedding provider. The current fork requires explicit `EMBEDDING_PROVIDER`, but the PR does not document or test that privacy invariant around the new high-order paths.
- Resource usage: First-search-triggered background backfill can scan all high-order stores and call `embedBatch` repeatedly. It has a fixed batch size but no concurrency guard, queueing, project scope, rate-limit handling, or operator-visible progress/cancel behavior.
- Malformed data/schema: The PR decodes stored base64 vectors and trusts `embedBatch` result positions without validating returned vector count or dimensions before writing embeddings back to state.
- Protocol/API handling: It adds a new REST endpoint and tool option, but the feature does not satisfy the repo's consistency requirements for endpoint count/docs in current fork state.

No import rationale:
- A minimal safe import would either be BM25-only high-order search or a carefully gated embedding/backfill subsystem. Both are product/API design choices beyond this PR review group, because the issue explicitly asks for tier unification, cross-tier expansion, scoping, confidence floor, vector coverage, model stamps, and backfill behavior.
- Importing only the PR's expand/search pieces would create an incomplete public behavior that misses facets and can leak unprojected semantic/procedural records into project-filtered smart-search responses.

Open risks:
- The dark-memory gap remains. A future implementation should start with a design for project/agent ownership on every high-order tier, including facets, before adding search results to `mem::smart-search`.
- Backfill should be explicit or queued with clear operator controls, dimension validation, provider/version stamps, and tests for malformed vectors and provider failures.
