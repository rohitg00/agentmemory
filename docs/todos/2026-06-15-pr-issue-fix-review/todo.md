# PR Issue Fix Review Task

Task id: `2026-06-15-pr-issue-fix-review`

## Scope

Create a durable Markdown worklist of upstream pull requests that explicitly target known upstream issues, so each PR can be reviewed later against the issue it claims to fix.

## Sprint Contract

Goal: build an initial worklist mapping upstream PRs to concrete upstream issue numbers they explicitly fix, close, or resolve.

Scope:
- Source repository: `rohitg00/agentmemory`.
- Target fork context: `wbugitlab1/agentmemory`.
- Include only PRs whose title or body contains a closing keyword for a real upstream issue.
- Keep review status separate from the imported claim; this first pass does not decide whether a PR truly fixes the issue.
- Save the worklist as Markdown under this task directory.

Non-goals:
- Do not import, merge, or modify PR code.
- Do not change GitHub issue labels, comments, or tracker state.
- Do not claim fixes are valid before reviewing code and issue context.

Acceptance criteria:
- A Markdown list exists with PR number, PR title, upstream state, claimed fixed issue numbers, issue titles, fork tracker issue if known, and review status.
- The list distinguishes claim extraction from actual validation.
- Data collection uses read-only API access and records limitations.

Intended verification:
- Recompute counts from source data.
- Check the generated Markdown for stale placeholder text and malformed table rows.
- `git diff --check`

## Progress Notes

- 2026-06-15: User asked to start reviewing upstream PRs that target concrete known issues, beginning with a saved Markdown list of PRs and the issues they claim to fix.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Task state | File inspection | Done | This `todo.md` records scope, assumptions, non-goals, and verification. |
| PR-to-issue worklist | Generated from upstream PR and issue data | Done | `pr-issue-fix-review-list.md` generated from authenticated read-only GitHub API data: 538 PRs scanned, 379 normal upstream issues scanned, 538 fork tracker issues scanned, 193 PRs with claimed fixes for 191 unique known issues. |
| Verification | Count check and `git diff --check` | Done | List has 193 `pending` rows, no malformed table rows, no missing fork trackers, no URL/hash-reference/mention/closing-cross-reference matches, and `git diff --check` passed. |

## Verification Notes

- 2026-06-15: Public GitHub API reads were rate-limited. User-facing approval prompt was issued through the command approval flow, then authenticated read-only `gh api` calls were used. No GitHub writes were performed.
- 2026-06-15: Generated `pr-issue-fix-review-list.md` with neutral identifiers such as `PR 937`, `Issue 925`, and `Fork issue 915`; no GitHub URLs or hash-number references are intentionally present.
- 2026-06-15: Verification passed: 193 worklist rows, no malformed table rows, no missing fork trackers, no URL/hash-reference/mention/closing-cross-reference matches, and `git diff --check` passed.

## Completion Review

The initial inventory is complete. It identifies upstream PRs that claim to fix known upstream issues, but it does not validate those fixes. The next task is row-by-row review: reproduce or understand the issue, inspect the PR diff and tests, then update the list's review status and fork decision.

## Parallel Review Batches

### Batch 1: active duplicate issue groups

Started: 2026-06-15

Selection rationale: start with active issue groups that have multiple open non-draft PR candidates, because issue-group comparison prevents duplicate reproduction and avoids accepting a broader or riskier PR before checking competing fixes.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 303 | PR 314, PR 892, PR 528 | `review/issue-303-pr-314-engine-data-dir` | Worktree pending: `local:96cb98a8-9a47-460f-9949-5277cd9ab734` |
| Issue 787 | PR 869, PR 806 | `review/issue-787-pr-869-smart-search-project-scope` | Worktree pending: `local:05fa2088-afe5-4379-b190-034e40915d59` |
| Issue 809 | PR 856, PR 811 | `review/issue-809-pr-856-openrouter-embedding-dimensions` | Worktree pending: `local:26c0ea4e-ef98-4f7e-bd49-8e3006de8a0e` |
| Issue 483 | PR 673, PR 541 | `review/issue-483-pr-673-viewer-i18n` | Worktree pending: `local:3303ea93-112c-4fac-b34d-53bce1ee7a04` |
| Issue 505 | PR 538, PR 533 | `review/issue-505-pr-538-graph-build-endpoint` | Worktree pending: `local:fa2b7f9c-775b-466b-9e43-5e26c590d4b2` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 2: next active open issue groups

Started: 2026-06-15

Selection rationale: continue the active open non-draft queue in worklist order after excluding the already started duplicate issue groups from Batch 1.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 925 | PR 937 | `review/issue-925-pr-937-graph-search-session-filter` | Worktree pending: `local:7418a4a8-b585-4b50-94bd-506f8d86badf` |
| Issue 863 | PR 933 | `review/issue-863-pr-933-embedding-api-key` | Worktree pending: `local:08015243-46e7-4705-9641-c66ab05f4ef2` |
| Issue 527 | PR 592 | `review/issue-527-pr-592-codex-cli-provider` | Worktree pending: `local:001fa037-12a4-4b96-9e97-6e8ead72f88c` |
| Issue 733 | PR 738 | `review/issue-733-pr-738-stable-project-identity` | Worktree pending: `local:0c5059ca-506e-4ba2-b234-c9f084d918aa` |
| Issue 909 | PR 910 | `review/issue-909-pr-910-bounded-sdk-shutdown` | Worktree pending: `local:1b2723d1-0ebd-45c4-8d9d-9db2d2859e05` |

### Batch 3: next active open issue groups

Started: 2026-06-15

Selection rationale: continue the active open non-draft queue in worklist order. The final row is a single PR that claims two closely related doctor/engine-path issues, so it is assigned as one multi-issue review group.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 884 | PR 904 | `review/issue-884-pr-904-mcp-tool-descriptions` | Worktree pending: `local:09c3a9de-49a8-43af-b070-540bd58e80d8` |
| Issue 899 | PR 900 | `review/issue-899-pr-900-compress-model` | Worktree pending: `local:59f933b9-05e6-439b-b356-b797566dea73` |
| Issue 828 | PR 893 | `review/issue-828-pr-893-graph-side-indexes` | Worktree pending: `local:e2bea4dc-5151-451f-aa3c-d8bb5dfeb6b9` |
| Issue 888 | PR 894 | `review/issue-888-pr-894-slots-guard-errors` | Worktree pending: `local:fbca0abd-8eaf-44a3-947d-9ed64e45e819` |
| Issues 874 and 875 | PR 895 | `review/issues-874-875-pr-895-doctor-engine-checks` | Worktree pending: `local:c393175d-8ea6-43c1-8925-f7f574cf7ef7` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 4: next active open issue groups

Started: 2026-06-15

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-3. Issue 440 has a parked closed-unmerged candidate, but the active open PR remains the primary review target for this batch.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 866 | PR 867 | `review/issue-866-pr-867-mcp-proxy-timeout` | Worktree pending: `local:e8ef8177-8d61-4d16-871f-49e4feb4d867` |
| Issue 440 | PR 837 | `review/issue-440-pr-837-mcp-recall-format` | Worktree pending: `local:d2c7af33-a6ca-40dd-b541-6fe8a77eda94` |
| Issue 817 | PR 821 | `review/issue-817-pr-821-agent-id-search-isolation` | Worktree pending: `local:1e7f2bd5-0223-4cc0-ba79-4a1be218760a` |
| Issue 833 | PR 842 | `review/issue-833-pr-842-memory-forget-tool` | Worktree pending: `local:7915ed75-5530-4dfd-88d6-feafa0aff454` |
| Issue 754 | PR 812 | `review/issue-754-pr-812-consolidation-empty-states` | Worktree pending: `local:0bdcd0ee-facb-4b57-bb43-c487904abb59` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 5: next active open issue groups

Started: 2026-06-15

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-4.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 808 | PR 810 | `review/issue-808-pr-810-openrouter-reasoning` | Worktree pending: `local:bd2f0b6d-b53c-4070-92bc-355af86f699c` |
| Issue 691 | PR 803 | `review/issue-691-pr-803-viewer-graph-layout` | Worktree pending: `local:04e6ed56-97d6-42aa-8322-c9e4420daa6c` |
| Issue 712 | PR 801 | `review/issue-712-pr-801-iii-console-installer-bash` | Worktree pending: `local:61a66cc2-e0b1-45d0-9f15-0fda88c509a5` |
| Issue 715 | PR 800 | `review/issue-715-pr-800-randomuuid-node-compat` | Worktree pending: `local:8b7e3405-289f-4a95-aced-917cdb951719` |
| Issue 724 | PR 798 | `review/issue-724-pr-798-flat-rerank-scores` | Worktree pending: `local:8175f701-d33f-43ff-9af2-13055a522efc` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 6: next active open issue groups

Started: 2026-06-15

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-5. Issue 750 is upstream-closed, but PR 795 is still an open non-draft PR and remains in the active PR queue.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 750 | PR 795 | `review/issue-750-pr-795-runtime-ports` | Worktree pending: `local:bb3b8797-423e-4a48-ba17-1355f99b0e76` |
| Issue 739 | PR 794 | `review/issue-739-pr-794-memory-delete-endpoint` | Worktree pending: `local:a477d676-4eff-435e-9410-0205831b4a18` |
| Issue 730 | PR 740 | `review/issue-730-pr-740-nix-flake-devbox` | Worktree pending: `local:b298c39c-6813-4650-a98f-17e563a6d854` |
| Issue 725 | PR 793 | `review/issue-725-pr-793-local-embedding-model` | Worktree pending: `local:f93e90dd-23bb-4a65-9ac7-b00540c325a8` |
| Issue 770 | PR 784 | `review/issue-770-pr-784-high-order-tier-search` | Worktree pending: `local:de062385-79d7-40ef-9610-3afc7f5ae737` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 7: next active open issue groups

Started: 2026-06-16

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-6. Issue 483 appears in the worklist between the selected rows, but it was already assigned in Batch 1 and is intentionally skipped here.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 747 | PR 748 | `review/issue-747-pr-748-consolidation-dedup` | Worktree pending: `local:7a0ab316-bc02-40ec-a363-34924617db6e` |
| Issues 493 and 745 | PR 746 | `review/issues-493-745-pr-746-stop-hook-session-end` | Worktree pending: `local:4f941666-0cce-4fdd-ab19-35808c9a4f5b` |
| Issue 716 | PR 717 | `review/issue-716-pr-717-canonical-project-identity` | Worktree pending: `local:3f20d727-6de7-4b7c-b714-5e8d45991cea` |
| Issue 658 | PR 663 | `review/issue-658-pr-663-hermes-plugin-config` | Worktree pending: `local:ad132845-551f-416c-931f-55fac8bfe5ca` |
| Issue 507 | PR 532 | `review/issue-507-pr-532-mcp-recall-full-search` | Worktree pending: `local:fd5c9121-fef9-43b3-9ee1-ac85ffe7bbd8` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 8: next active open issue groups

Started: 2026-06-16

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-7. Issue 505 appears between the selected rows, but it was already assigned in Batch 1 and is intentionally skipped here.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issue 589 | PR 622 | `review/issue-589-pr-622-copilot-mcp-docs` | Worktree pending: `local:8e4597ed-6e19-47e6-9487-322be9a33120` |
| Issue 274 | PR 279 | `review/issue-274-pr-279-auto-create-lessons` | Worktree pending: `local:2370fc95-e85b-4797-8c85-124284ded768` |
| Issue 480 | PR 490 | `review/issue-480-pr-490-retention-evict-sweeps` | Worktree pending: `local:c8ca0ad7-3984-47b8-8ba2-5f799b1c3a4e` |
| Issue 565 | PR 566 | `review/issue-565-pr-566-mcp-tool-count-docs` | Worktree pending: `local:87654576-849c-4a23-b86d-54bc1c4c6e2c` |
| Issue 518 | PR 577 | `review/issue-518-pr-577-cli-auth-header` | Worktree pending: `local:1a105736-c244-4a79-99d3-8bd712789ea7` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 9: next active open issue groups

Started: 2026-06-16

Selection rationale: continue the active open non-draft queue in worklist order after excluding issue groups already started in Batches 1-8. Issues 483, 505, and 303 appear between the selected rows, but they were already assigned in Batch 1 and are intentionally skipped here.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issues 455 and 469 | PR 575 | `review/issues-455-469-pr-575-vector-dim-recovery` | Worktree pending: `local:15e6b025-e61b-4404-9c08-f79a9379f46d` |
| Issue 512 | PR 536 | `review/issue-512-pr-536-viewer-cjk-search` | Worktree pending: `local:40d8c674-b550-4e02-8cb7-ccb5855e44f2` |
| Issue 478 | PR 488 | `review/issue-478-pr-488-hermes-hook-manifest` | Worktree pending: `local:d75f493f-f609-46c9-a746-37561199311e` |
| Issue 392 | PR 414 | `review/issue-392-pr-414-time-range-filtering` | Worktree pending: `local:74d39656-14d0-4e8a-88ae-618045c4e7d9` |
| Issue 347 | PR 365 | `review/issue-347-pr-365-dashboard-partial-payloads` | Worktree pending: `local:9ee6593d-9714-4fee-a3fd-3f0f714f72f3` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

### Batch 10: final active open issue groups

Started: 2026-06-16

Selection rationale: final pass over active open non-draft claim groups after excluding issue groups already started in Batches 1-9. PR 893 is not started again because its only claimed fix group, Issue 828, is already in Batch 3; the mention of Issue 816 appears inside the Issue 828 title text, not as a separate claimed fix entry. PR 892 was already included in Batch 1 for Issue 303, but its additional claimed Issue 700 and Issue 844 groups were not listed there, so this batch starts a focused multi-issue worker for those remaining claims.

| Issue group | Candidate PRs | Requested branch | Worker status |
| --- | --- | --- | --- |
| Issues 700 and 844 | PR 892 | `review/issues-700-844-pr-892-engine-cwd-config` | Worktree pending: `local:428f5647-b138-49e2-8db5-f8637b03d453` |
| Issue 395 | PR 412 | `review/issue-395-pr-412-embedding-provider-aliases` | Worktree pending: `local:28de15e6-a071-44db-a306-a2692d40e378` |
| Issue 244 | PR 318 | `review/issue-244-pr-318-opencode-session-metadata` | Worktree pending: `local:4c56dc6b-def4-4417-88a2-34df0f689225` |
| Issue 345 | PR 349 | `review/issue-345-pr-349-concept-graph-depth2` | Worktree pending: `local:0d6b7a11-a054-492e-b8f9-7aed368909e1` |

Worker prompt constraints: each worker has a separate worktree from local `main`, must create a scoped review branch, must avoid push/PR/remote tracker writes, must request approval before credentialed GitHub reads, must apply hard security gates, must document decisions using neutral identifiers, and must run `$prep-merge-to-local-main` before handoff.

## Continuation Automation

Created: 2026-06-15

Automation: `agentmemory-pr-issue-batch-launcher`

Purpose: continue this coordinator thread every 90 minutes, starting exactly one additional active open non-draft review batch per run until all active batches are started, then pause or delete itself.

Guardrails: future runs must read this task log and the worklist, start no more than one batch per run, avoid duplicate issue groups, exclude open draft / closed unmerged / merged PR rows, keep worker prompts self-contained, avoid GitHub writes and pushes, require approval for credentialed GitHub reads, and require `$prep-merge-to-local-main` in each worker prompt.

Closeout: Batch 10 starts the final active open non-draft claim groups. The continuation automation was deleted after verification found no remaining active open non-draft claim groups.
