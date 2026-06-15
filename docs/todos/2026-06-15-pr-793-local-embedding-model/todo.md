# PR 793 Local Embedding Model Review

## Sprint Contract

Goal: Review Issue 725 and PR 793 issue-first, then import only a minimal local change if the fork still hardcodes an English-only local embedding model.

Scope:
- Inspect local embedding provider configuration and vector-dimension handling.
- Inspect PR 793 as untrusted public input.
- If still relevant, add focused tests before production changes and update user-facing configuration docs only where needed.
- Document the decision locally with neutral identifiers.

Non-goals:
- No GitHub writes, labels, comments, PR creation, pushes, deploys, migrations, or remote state changes.
- No broad embedding provider refactors.
- No changes to auth, persistence schema, MCP tool surface, REST endpoint surface, or package dependencies unless the issue cannot be solved without them.

Acceptance criteria:
- Issue 725 relevance is evaluated against current fork code.
- PR 793 diff is reviewed as untrusted input.
- Decision is one of import, adapted import, reject, defer, already-fixed, or blocked.
- If code changes are made, tests cover configurable local embedding model selection and the default.
- Security review considers provider configuration, model download/runtime behavior, vector-dimension compatibility, data egress, auth/isolation, path/filesystem, protocol/schema, prompt/LLM flow, DoS/performance, supply chain, hooks/tooling, and persistence.
- Final handoff reports verification and whether prep-merge-to-local-main succeeded.

Intended verification:
- Targeted vitest for local embedding provider behavior.
- Type/build or broader test only if touched surface requires it and command behavior is confirmed acceptable.
- Required security gates for code/config/doc changes where tools are available.
- Final prep-merge-to-local-main workflow.

Known boundaries:
- Remote GitHub reads are public/read-only.
- No credentialed API or logged-in browser reads without current-turn approval.
- No GitHub write actions.
- Preserve unrelated work.

Stop conditions:
- Any required change crosses auth/security/API/schema/migration/dependency/service/network boundary beyond configurable model selection.
- PR diff requires untrusted broad refactor or dependency churn.
- Required security tooling reports unresolved findings or is unavailable and cannot be reasonably substituted.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first relevance review | Inspect local provider code and docs | complete | Current fork still hardcoded `Xenova/all-MiniLM-L6-v2` in `src/providers/embedding/local.ts`; docs exposed no local model override. |
| PR 793 untrusted diff review | Public read/fetched diff inspection | complete | Public metadata shows Issue 725 and PR 793 open. Fetched PR ref contains one commit touching only `src/providers/embedding/local.ts` and `test/embedding-provider.test.ts`; full branch is stale, so only the idea was adapted. |
| Local embedding model configurability | Targeted test, then implementation if needed | complete | Red run via hosted Vitest: 2 new tests failed because the provider still passed `Xenova/all-MiniLM-L6-v2`; green run: `test/embedding-provider.test.ts` 22/22 passed. |
| Default local model behavior | Targeted test, docs inspection/update if needed | complete | Default changed to `Xenova/paraphrase-multilingual-MiniLM-L12-v2`; Hugging Face public config verified `hidden_size: 384`. |
| Security review | Manual review plus required scanners where applicable | complete | Semgrep default scan completed with 0 findings. Codex Security diff scan completed with no findings; reports under `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T213735Z/`. |
| Merge prep | prep-merge-to-local-main workflow | pending |  |

## Progress

- Branch: `review/issue-725-pr-793-local-embedding-model`
- Initial state: clean detached worktree at local main, then target branch created.
- Decision: adapted import. PR 793's full branch is stale against the fork, but its narrow provider change remains relevant.
- Implementation: minimal local provider default/override change, focused tests, `.env.example`, README.
- Dependency/tooling: no dependency files changed. Worktree lacks `node_modules`; initial `npm test -- test/embedding-provider.test.ts` failed before test execution because `vitest` was not installed. Dependency installation was not performed. Targeted Vitest was run through the existing main-checkout toolchain with this worktree as root.
- Security diff scan: completed. Deep-review worklist covered 1/1 source rows, no candidates. Goal usage: 35972 tokens, 151 seconds.
- Prep review chain before staging:
  - `$security-best-practices` passive TypeScript/Node review: no critical or major issue found on the changed surface.
  - `$simple-code`: no code cleanup applied; current diff is already minimal for default, override, tests, and docs.
  - `$requesting-code-review`: subagent dispatch skipped because current tool policy only allows subagents after an explicit subagent request; local focused review found no critical or important issue.
  - `$review-implementation`: local adversarial pass found no correctness, scope, boundary, verification, or maintainability blocker.
  - `codex-security:security-diff-scan`: completed with no findings.

## Security Notes

- Auth/isolation: no auth, tenancy, REST, MCP, or agent isolation behavior changed.
- Data egress: local embeddings remain explicit opt-in via `EMBEDDING_PROVIDER=local`; no new remote provider is enabled. The local transformer runtime may download the selected public model on first use, matching the existing local provider behavior.
- Model selection: `LOCAL_EMBEDDING_MODEL` changes only the model identifier passed to `@xenova/transformers` for feature extraction. Blank values fall back to the default.
- Vector dimensions/persistence: provider dimension remains `384`; the new default's public config reports `hidden_size: 384`, matching the prior model. Existing dimension guard still rejects mismatched vectors before index corruption.
- Path/filesystem: no new file path input or filesystem access added.
- Protocol/schema/API: no schema, REST, MCP, export/import, or persistence contracts changed.
- Prompt/LLM flows: no prompt construction or LLM provider path changed.
- DoS/performance: multilingual default is a larger 12-layer model than the previous 6-layer model, so first-use download and local inference may be heavier. This is documented as local 384-dim model selection; no automatic embedding enablement was added.
- Supply chain: no package dependency changes. Runtime model trust remains the existing Xenova/transformers.js model-download boundary.
- Hooks/tooling: no hook, CI, package-manager, or plugin tooling behavior changed.
