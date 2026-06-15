# Track Upstream PRs As Fork Issues Task

Task id: `2026-06-14-track-upstream-prs-as-issues`

## Scope

Plan an idempotent workflow and tool for tracking every upstream pull request from `rohitg00/agentmemory` as a normal issue in the fork `wbugitlab1/agentmemory`.

## Sprint Contract

Goal: create a reviewed implementation plan for mirroring upstream PR metadata into fork issues so fork maintainers can triage, import, adopt, modify, reject, or mark upstream-merged PRs in their own backlog.

Scope:
- Track upstream PRs, not normal upstream issues.
- Source repository: `rohitg00/agentmemory`.
- Target repository: `wbugitlab1/agentmemory`.
- Use stable markers to make sync idempotent.
- Preserve enough PR metadata for triage: title, URL, author, state, draft flag, merge status, head repo/ref/SHA, base ref/SHA, labels, changed files summary, and linked branch/import fields.
- Use fork issues for workflow state and decisions.
- Record the durable workflow decision in `docs/adr/` with `adr-tools`.
- Document remote API approval gates and verification.

Non-goals:
- Do not mirror normal upstream issues; `docs/todos/2026-06-14-mirror-upstream-issues/` covers that adjacent work.
- Do not copy GitHub PR reviews, checks, reactions, projects, assignees, or native PR discussion threads losslessly.
- Do not create fork PRs, push branches, or import PR code as part of the tracker implementation.
- Do not write to GitHub without explicit current-turn confirmation.

Acceptance criteria:
- A reviewed plan exists for implementation.
- The plan includes an ADR step for the fork issue tracker decision.
- The planned tool defaults to dry-run and is idempotent by marker.
- The planned apply mode requires explicit confirmation for credentialed reads and target writes.
- The planned verify mode proves every upstream PR has exactly one target issue marker.
- The plan includes tests for dedupe, body generation, state labels, decision preservation, and write gating.

Intended verification:
- `npm test -- test/upstream-pr-issue-tracker.test.ts`
- Dry-run report from the planned CLI.
- Verify report from the planned CLI.
- `adr list` and `adr generate toc`
- `git diff --check`
- `gitleaks protect --staged --redact` before any commit

Known boundaries:
- GitHub API reads with credentials and all GitHub issue writes require explicit current-turn confirmation.
- Creating issues/comments/labels in the fork triggers remote state changes and notifications.
- Implementation must not modify or depend on the parallel normal-issue mirror task without re-checking current file state.
- If the normal-issue mirror implementation already created reusable GitHub helpers, implementation may reuse them only after inspecting them and avoiding behavior changes to that task.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| PR issue tracker plan | Self-review and `/review-plan` | Done | `upstream-pr-issues-plan-r8` accepted by correctness, GitHub safety, and implementation/test review lanes after consensus refinements from the issue mirror plan. |
| Durable ADR decision | `adr list`, ADR content review | Done | `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md` created with `adr-tools`; `adr list` shows ADR 0001 and 0002. |
| Operator workflow docs | Markdown fence check and content review | Done | `docs/recipes/upstream-pr-issue-tracking.md`; Markdown fence check printed `Markdown fences balanced`. |
| Pure planner library | `npm test -- test/upstream-pr-issue-tracker.test.ts` | Done | Red run failed on missing module, then implementation passed with 23 tests after adding create-missing-only resume coverage. |
| Dry-run CLI | Dry-run JSON report | Done | Public dry-run wrote `dry-run-report.json`: 536 source PRs, 378 target normal issues, 0 existing PR trackers, 11 create-label actions, 536 create-issue actions, 0 failures, `wroteRemote: false`. |
| Apply mode | Explicit confirmation plus GitHub API writes | Done | `apply-create-missing-neutral-prs.json` created the 36 remaining PR tracker issues with `--create-missing-only`; no failures or stop condition. |
| Verify mode | Verification JSON report | Done | `verify-after-create-missing-neutral-prs.json` reports 536 source PRs, 536 target PR tracker markers, and no failures. |

## Progress Notes

- 2026-06-14: User asked to plan tracking every upstream PR as issues in the fork, using `writing-plans`, then `review-plan`.
- 2026-06-14: Current remotes already use the fork-first convention: `origin` is `https://github.com/wbugitlab1/agentmemory.git`, `upstream` is `https://github.com/rohitg00/agentmemory.git`.
- 2026-06-14: A parallel task exists for normal upstream issue mirroring: `docs/todos/2026-06-14-mirror-upstream-issues/`.
- 2026-06-14: Self-review before the second review round tightened the expected ADR path to `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md` and added the missing operator workflow docs matrix row.
- 2026-06-14: Review revision `upstream-pr-issues-plan-r4` expanded apply confirmation to include credentialed reads of upstream PRs, target issues, and target labels, and added pre-write JSON payload validation before `gh api --input`.
- 2026-06-14: User asked to compare the normal issue mirror plan for reusable PR-tracker refinements. Subagents reached consensus to adopt public-read headers, PR-scoped apply checkpoint/rate-limit resilience, and aggregate sanitization telemetry for imported upstream PR body text only. The same consensus rejected importing comment mirroring, auto-close, arbitrary upstream label cloning, source `/issues` PR discovery, and overflow-to-comments behavior.
- 2026-06-14: Fresh `/review-plan` accepted `upstream-pr-issues-plan-r8` after fixes for workflow-section preservation, upstream-authored title/metadata sanitization, validation stop conditions, and malformed/missing section delimiter no-write behavior.
- 2026-06-15: Started implementation in the current `main` checkout after user asked to execute the plan. Baseline: `main...origin/main [ahead 3]`, `origin` points to `wbugitlab1/agentmemory`, `upstream` points to `rohitg00/agentmemory`, `.adr-dir` is `docs/adr`, `gh version 2.93.0`, Node `v22.22.3`.
- 2026-06-15: Created ADR 0002 with `adr-tools`, generated `docs/adr/README.md`, and added the operator recipe. ADR date uses the actual creation date, `2026-06-15`.
- 2026-06-15: Added PR tracker planner and CLI with test-first evidence. Initial test run failed because `scripts/github/upstream-pr-issue-tracker.js` was missing; after implementation `npm test -- test/upstream-pr-issue-tracker.test.ts` passed with 22 tests.
- 2026-06-15: Public dry-run completed without writes. Report summary: 536 source PRs, 378 target issue endpoint items, 378 target normal issues, 28 target labels, 0 existing PR tracker markers, 11 planned label creates, 536 planned issue creates, 0 failures, sanitization telemetry 182 mentions, 1044 references, 1248 closing keywords.
- 2026-06-15: First apply attempt stopped before writing because public dry-run and `gh api` reads rendered control characters differently in upstream PR bodies #652 and #502. A credentialed dry-run regenerated the same action counts with the same plan hash as apply.
- 2026-06-15: Apply created the 11 managed labels and 219 PR tracker issues before the interactive tool session was interrupted. Resume dry-run found 219 existing PR trackers and 317 remaining creates.
- 2026-06-15: Resume apply created another 281 PR tracker issues and stopped fail-closed at upstream PR #107 due to GitHub secondary content-creation rate limiting (`HTTP 403`, no Retry-After). Fresh resume dry-run now shows 500 existing PR trackers and 36 remaining creates.
- 2026-06-15: Added `--write-delay-ms` to the PR tracker CLI and documented slower resume after secondary content-creation limits. `npm test -- test/upstream-pr-issue-tracker.test.ts` passed with 22 tests after the change.
- 2026-06-15: After a 5 minute cooldown, a fresh dry-run still showed 36 remaining creates. Resume with `--write-delay-ms 10000` stopped immediately on the same GitHub secondary content-creation limit at upstream PR #107. No new writes occurred in that retry. Current verify is red only for 36 missing PR tracker markers.
- 2026-06-15 03:03 UTC: Fresh public verify still reports 500 target PR tracker markers and the same 36 missing upstream PRs. Because the last GitHub secondary-rate-limit failure was at 03:00:43 UTC, do not run a third immediate apply attempt.
- 2026-06-15 03:12 UTC: User asked to retry. Credentialed dry-run succeeded and still planned 36 create actions plus 500 skips. Apply with `--write-delay-ms 30000` stopped before any write on the same GitHub secondary content-creation limit at upstream PR #107 (`HTTP 403`, no Retry-After). Credentialed verify still reports 500 target PR tracker markers and 36 missing upstream PRs.
- 2026-06-15: Added `--create-missing-only` so a resume can create only missing PR tracker issues without refreshing existing tracker issue bodies. `npm test -- test/upstream-pr-issue-tracker.test.ts` passed with 23 tests after the change.
- 2026-06-15: User asked to create the remaining PR trackers without references. Credentialed dry-run `dry-run-create-missing-neutral-prs.json` planned exactly 36 `create-issue` actions and 0 updates. Apply `apply-create-missing-neutral-prs.json` created fork issues #879 through #914 for upstream PRs #107, #106, #105, #103, #102, #101, #99, #97, #95, #93, #83, #82, #81, #80, #79, #78, #77, #76, #74, #73, #72, #71, #70, #69, #68, #67, #10, #9, #8, #7, #6, #5, #4, #3, #2, and #1.
- 2026-06-15: Verify initially found full marker coverage but one title mismatch for upstream PR #858 on fork issue #417. Updated only that issue title to the current upstream title; did not run the 500 body refresh updates.
- 2026-06-15: Final PR tracker verify `verify-after-create-missing-neutral-prs.json` passed: 536 source PRs, 914 target normal issues, 536 target PR tracker markers, 0 failures.
- 2026-06-15: Cross-reference verify after creating the 36 PR tracker issues wrote `docs/todos/2026-06-15-neutralize-github-cross-references/verify-after-create-missing-prs.json`: 914 issues and 572 comments scanned, 0 active source references, no writes.
- 2026-06-15: Final local verification passed: targeted Vitest ran 3 files / 81 tests, `git diff --check` passed, and targeted Semgrep scanned 9 files with 0 findings.

## Current Remote State

- Source PRs: 536
- Fork PR tracker markers: 536
- Remaining missing upstream PRs: 0
- New fork issues from the final resume: #879 through #914
- Existing tracker issues needing full body refresh for exact generator parity: 500
- Refresh updates intentionally not applied in the final resume because the user asked only to create the outstanding PR trackers without references.

## Plan Review Ledger

| ID | Severity | Reviewer | Plan reference | Evidence | Failure mode | Recommended change | Verification needed | Status | Revision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RP-001 | Important | correctness | Current Evidence and adjacent task note | Plan said `main...upstream/main`, but current status is `main...origin/main`; adjacent normal-issue plan has stale remote naming. | Implementer could reason from false branch baseline or copy stale remote examples. | Correct baseline and warn not to copy stale adjacent remote examples. | Re-read `git status -sb`, `git remote -v`, and plan terminology. | accepted-fixed | upstream-pr-issues-plan-r2 |
| GH-APPROVAL-001 | Important | GitHub safety | Apply wording and write scope | Plan allowed optional comments but confirmation only named labels/issues. | Comment writes could trigger notifications without explicit approval. | Make comment writes out of scope for first implementation and state no comments are created. | CLI/report tests show no comment writes. | accepted-fixed | upstream-pr-issues-plan-r2 |
| GH-BODY-001 | Important | GitHub safety | `gh api` body handling | Plan did not require body payload files for public issue writes. | Generated body text could be passed through argv and violate public-write safety rules. | Require temporary JSON payload files with `gh api --input <file>` and no body text in argv. | Command-construction tests and `rg` check for `--field body`. | accepted-fixed | upstream-pr-issues-plan-r2 |
| GH-RATELIMIT-001 / PRPLAN-F2 | Important | GitHub safety; feasibility | Reader and pagination requirements | Plan named per-page endpoints but not Link traversal, `gh --paginate`, or fail-closed rate-limit handling. | Dry-run/verify could be incomplete or misleading. | Specify Link traversal, `gh api --paginate --slurp`, non-2xx fail-closed behavior, rate-limit report metadata, and no writes after incomplete reads. | Fake reader pagination and rate-limit tests. | accepted-fixed | upstream-pr-issues-plan-r2 |
| PRPLAN-F1 | Important | feasibility | Apply from dry-run | Apply command reran live planning without comparing to reviewed dry-run. | Unreviewed drift could be written. | Add `--from-report`, plan hash, stable action IDs, and pre-write drift check. | Offline test that apply refuses drift. | accepted-fixed | upstream-pr-issues-plan-r2 |
| PRPLAN-F3 | Important | feasibility | Target `/issues` ingestion | Target issue reader did not exclude native PR endpoint items. | Fork native PRs could count as tracker issues. | Add `pull_request?: unknown`, filter target PR items, report excluded counts. | Fixture test with mixed issue/PR endpoint items. | accepted-fixed | upstream-pr-issues-plan-r2 |
| PRPLAN-F4 | Important | feasibility | CLI tests | Parser tests did not prove mode-specific read/write behavior. | Runtime could write in dry-run/verify despite parser passing. | Split orchestration from adapters and add fake reader/writer tests. | Fake writer call-count tests. | accepted-fixed | upstream-pr-issues-plan-r2 |
| PRPLAN-F5 | Important | feasibility | Apply reports | Reports lacked per-action result status and partial-apply stop data. | Operators could not recover after partial apply. | Add stable action IDs, applied/skipped/failed action report fields, sequential writes, and stop on first write failure. | Fake writer mid-apply failure test. | accepted-fixed | upstream-pr-issues-plan-r2 |
| GH-APPROVAL-002 | Important | GitHub safety | Apply confirmation and credentialed reads | Apply recomputes the plan from credentialed upstream PR reads plus target issue and label reads, but the r3 prompt only named upstream PR reads. | Apply could perform credentialed target reads without explicit current-turn confirmation. | Revise the exact confirmation prompt and apply rules to authorize credentialed reads of upstream PRs, target issues, and target labels before issue/label writes. | Parser/orchestration test or task evidence showing apply cannot run without confirmation covering credentialed source and target reads plus remote writes. | accepted-fixed | upstream-pr-issues-plan-r4 |
| GH-BODY-002 | Important | GitHub safety | `gh api --input` payload handling | r3 required a temporary JSON payload file but only required safe summary logging before execution. | Generated body text could contain unsafe markdown, malformed JSON, or unsanitized imported text and still be written. | Require local JSON parse and pre-write payload validation for title, labels, body, expected marker count, and sanitized imported-body patterns before `gh api --input`. | Write-adapter tests parse/validate payload before execution and keep body text out of argv/logs. | accepted-fixed | upstream-pr-issues-plan-r4 |
| REFINE-A | Minor | consensus | Public GitHub reads | Issue mirror plan requires explicit `Accept`, `X-GitHub-Api-Version`, and non-secret `User-Agent` headers; PR plan only required pagination and fail-closed reads. | Public reads could rely on implicit defaults and be less reproducible. | Require public-read headers and explicitly omit `Authorization`; add fixture tests. | Fake public reader test checks headers and no auth header. | accepted-fixed | upstream-pr-issues-plan-r5 |
| REFINE-B | Important | consensus | Apply write resilience | Issue mirror plan requires report checkpointing, pacing, and explicit stop conditions; PR plan had sequential writes and stop-on-failure but not checkpoint/pacing detail. | Partial apply or GitHub rate limiting could leave weaker recovery evidence. | Add injected checkpoint report, one-second delay between successful writes, stop-condition metadata, and tests; keep scope to labels/issues only. | Fake writer stop-condition and checkpoint tests. | accepted-fixed | upstream-pr-issues-plan-r5 |
| REFINE-C | Minor | consensus | Sanitization observability | PR plan sanitizes imported body text but did not report aggregate neutralization counts. | Dry-run/apply reviewers could not see notification/cross-link risk before writes. | Add PR-body-only sanitization telemetry to helper, reports, jq inspections, final notes, and tests. | Planner/report tests assert counts and exclude generated metadata. | accepted-fixed | upstream-pr-issues-plan-r5 |
| PRPLAN-R5-F1 | Important | correctness | Body generation and updates | Plan promises to preserve manual issue notes, but r5 generated blank workflow fields and updated issue bodies without a merge rule. | Sync updates could overwrite fork-maintainer workflow fields, decision text, verification notes, or local branch/fork PR references. | Add managed/workflow section delimiters, `mergeTrackerIssueBody`, malformed-section failure behavior, and preservation tests. | Fixture update preserves existing fork workflow section exactly while refreshing upstream metadata. | accepted-fixed | upstream-pr-issues-plan-r6 |
| GH-NOTIFY-001 | Important | GitHub safety | Sanitization scope | r5 sanitization telemetry and validation were scoped to upstream PR body text, but target title/body metadata also contains upstream-authored title, author/ref/label strings. | Unsafe upstream title or metadata could trigger mentions, references, or closing keywords in fork issues. | Sanitize every upstream-authored rendered string in target issue title/body while keeping telemetry PR-body-only. | Tests with unsafe title and metadata prove final payload has no raw mention/reference/closing patterns. | accepted-fixed | upstream-pr-issues-plan-r6 |
| GH-STOP-001 | Important | GitHub safety | Stop-condition tests | r5 classified validation as a stop type but explicit test list omitted common validation responses such as `422`. | GitHub validation failures could have weaker checkpoint/recovery evidence or allow later writes. | Add `422` and validation text to explicit stop conditions and tests. | Fake writer/adapter test proves validation stop checkpoints report, sets `stopCondition.classification = "validation"`, and prevents later writes. | accepted-fixed | upstream-pr-issues-plan-r6 |
| PRPLAN-R6-F1 | Important | feasibility | Malformed section delimiter tests | r6 required malformed managed/workflow delimiters to block writes, but tests only covered successful workflow preservation. | Implementation could pass tests while overwriting fork-local notes when delimiters are missing, duplicated, or out of order. | Add malformed delimiter fixture tests proving structured failure, no update action, no apply writer call, and report evidence for maintainer repair. | `npm test -- test/upstream-pr-issue-tracker.test.ts` covers dry-run planning and apply write gating for malformed delimiters. | accepted-fixed | upstream-pr-issues-plan-r7 |
| PRPLAN-R7-F1 | Important | correctness; GitHub safety | Missing workflow section behavior | r7 test list required missing delimiters to block writes, but `mergeTrackerIssueBody` still allowed existing bodies with no workflow section to get blank workflow fields. | Existing tracker issues with unsectioned manual notes could be silently overwritten during update. | Treat existing tracker issues missing any required managed/workflow delimiter as `malformed-section` no-write failures; create blank workflow fields only for new issue bodies. | Missing managed/workflow section fixtures assert structured failure, no update action, and no apply writer call. | accepted-fixed | upstream-pr-issues-plan-r8 |

## Plan Review Acceptance

Revision accepted: `upstream-pr-issues-plan-r8`

Review lanes:
- Correctness and missed requirements: accepted.
- GitHub API approval gates, public-write safety, security, and remote state risk: accepted.
- Implementation feasibility, sequencing, tests, observability, and recovery: accepted.

Local sanity checks:
- `git diff --check`: passed.
- Length-aware Markdown fence check for `plan.md` and `todo.md`: passed.
- Placeholder/stale-term scan on `plan.md`: no actionable stale hits; remaining historical finding text in the ledger is retained as review evidence.

Residual risks:
- Apply depends on live GitHub state still matching the reviewed dry-run at confirmation time; the plan mitigates this with `--from-report`, plan hash/action ID drift checks, and fail-before-write behavior.
- Runtime GitHub permissions, disabled Issues, and rate limits can still block apply; the plan requires fail-closed handling, checkpoint reports, and safe stop-condition metadata.
- GitHub issue creation and source links can still create repository events and notifications even after sanitization; the apply confirmation must name that risk.
- Implementation must keep action ID/hash normalization stable across public and credentialed readers.
- Payload validation must distinguish generated marker metadata from imported upstream PR body text so the required marker does not become a false positive, while still sanitizing every upstream-authored rendered title/body string.
- Malformed-section recovery depends on clear report messages so maintainers can repair existing tracker issue bodies without overwriting notes.
- The adjacent normal-issue mirror task still contains stale remote terminology; this plan explicitly warns not to copy it without correcting `origin` = fork and `upstream` = original.
