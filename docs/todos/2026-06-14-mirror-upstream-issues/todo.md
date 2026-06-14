# Mirror Upstream Issues Task

Task id: `2026-06-14-mirror-upstream-issues`

## Scope

Mirror every non-PR issue from `rohitg00/agentmemory` into `wbugitlab1/agentmemory` so the fork has its own issue backlog.

## Sprint Contract

Goal: create a verified, idempotent issue mirror from the original repository into the fork, then apply it so every upstream non-PR issue has a corresponding fork issue.

Scope:
- Source repository: `rohitg00/agentmemory`.
- Target repository: `wbugitlab1/agentmemory`.
- Mirror all upstream non-PR issues with `state=all`.
- Preserve title, original body, original state, labels used by issues, and comments as imported mirror comments.
- Create missing target labels used by mirrored issues.
- Detect existing mirrors by stable marker to avoid duplicates.
- Produce dry-run and apply reports under this task directory.

Non-goals:
- Do not mirror pull requests as issues.
- Do not preserve GitHub-native author identity, timestamps, reactions, assignees, projects, or notifications; record original metadata in mirror text instead.
- Do not create pull requests, push branches, change repository settings, or alter existing upstream issues.
- Do not force any remote action after authentication, permission, rate limit, or validation failures.

Acceptance criteria:
- Read-only inventory proves the upstream non-PR issue count and the fork pre-existing mirror count.
- The mirror tool has unit coverage for PR exclusion, marker-based deduplication, body generation, label planning, comment chunking, and state synchronization decisions.
- Dry-run reports the exact create/update/skip/close/comment/label actions before any write and uses public unauthenticated reads unless credentialed reads are explicitly approved.
- Apply mode runs only after explicit current-turn confirmation for GitHub credentialed API reads and target writes.
- Final verification proves every upstream non-PR issue has exactly one fork issue containing the marker `<!-- upstream-issue: rohitg00/agentmemory#N -->`, matching labels, matching open/closed state, and expected imported comment markers.

Known inventory evidence:
- Public read-only inventory on 2026-06-14 found 377 upstream non-PR issues: 145 open and 232 closed.
- The same inventory excluded 536 PR-like issue endpoint items.
- The fork had 0 non-PR issues and 0 existing upstream mirror markers.
- Upstream issues use 23 labels; 20 used labels are currently missing in the fork.
- Upstream issues have no milestones.
- 210 upstream issues have comments, with 365 comments total.

Intended verification:
- `npm test -- test/issue-mirror.test.ts`
- `npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --dry-run --public-read --report docs/todos/2026-06-14-mirror-upstream-issues/dry-run-report.json`
- `npx tsx scripts/github/mirror-upstream-issues.ts --source rohitg00/agentmemory --target wbugitlab1/agentmemory --state all --verify --read-with-gh --confirm-credentialed-reads --report docs/todos/2026-06-14-mirror-upstream-issues/verify-report.json`
- `git diff --check`
- `gitleaks protect --staged --redact` before any commit

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue mirror plan | Plan review via `review-and-implement` | Complete | Phase 1 review accepted revision `mirror-plan-r2`; all High/Medium findings are recorded below as accepted-fixed. |
| Mirror planner library | `npm test -- test/issue-mirror.test.ts` | Complete | `npm test -- test/issue-mirror.test.ts` passed locally with 24 tests in 205 ms; final spec compliance and code-quality reviews accepted Task 2. |
| Mirror CLI dry-run | Dry-run report | Complete | Public unauthenticated dry-run passed after fixes: 913 source endpoint items, 536 PR excluded, 377 non-PR issues, 19 labels, 377 create-issue, 232 close-issue, 365 planned imported comments, no errors. |
| Remote apply | GitHub issue/label/comment/state API writes | Pending | Requires explicit current-turn confirmation before writes. |
| Final verification | Verify mode and fork API inventory | Pending | Must prove every upstream issue number has exactly one target marker plus matching state, labels, body marker, and comment import markers. |

## Progress Notes

- 2026-06-14: User asked for an issue-mirroring plan, then `review-and-implement`, and completion only after all issues are mirrored.
- 2026-06-14: Read `review-and-implement` and `writing-plans` skills.
- 2026-06-14: Current worktree is clean on `main`, 41 commits ahead of `origin/main`; remotes still show `origin` as the original and `fork` as the fork.
- 2026-06-14: `gh` 2.93.0 and `jq` 1.8.1 are available locally.
- 2026-06-14: After parallel fork-workflow implementation, remotes now show `origin` as `https://github.com/wbugitlab1/agentmemory.git` and `upstream` as `https://github.com/rohitg00/agentmemory.git`; issue mirror commands use explicit repository names, so this does not change the mirror target.
- 2026-06-14: `subagent-driven-development` read for Phase 2 execution. Worker `019ec71d-f656-7d63-b272-f1552d627448` owns `scripts/github/issue-mirror.ts` and `test/issue-mirror.test.ts`.
- 2026-06-14: Planner tests passed locally after review fixes: `npm test -- test/issue-mirror.test.ts` -> 24 tests, exit 0, 205 ms. Final Task 2 spec compliance accepted the planner after fixes through `IMPL-T2-009`; code-quality review accepted after fixes through `IMPL-T2-011`.
- 2026-06-14: CLI/unit tests passed locally after Task 3 fixes: `npm test -- test/issue-mirror.test.ts` -> 45 tests, exit 0, 362 ms. Task 3 spec compliance accepted after fixes through `IMPL-T3-006`; code-quality review accepted after fixes through `IMPL-T3-009`.
- 2026-06-14: Public unauthenticated dry-run initially wrote `dry-run-report.json` with 913 source issue endpoint items, 536 PR items excluded, 377 non-PR issues, 0 target issues, 19 missing labels, and 377 create-issue actions. The report exposed a blocking gap: no close actions were planned for the 232 closed upstream issues.
- 2026-06-14: After `IMPL-DRYRUN-001`, public unauthenticated dry-run passed with 913 source endpoint items, 536 PR items excluded, 377 non-PR issues, 0 target issues, 19 missing labels, 377 create-issue actions, 232 close-issue actions, 365 planned imported comments, no rate-limit stop, and no errors.
- 2026-06-14: Final targeted review accepted fixes for planned action execution order, mutable fake-client apply verification, and apply-time rate-limit coverage. `npm test -- test/issue-mirror.test.ts` passed locally with 51 tests.
- 2026-06-14: Public unauthenticated dry-run with `--include-comments` was attempted and stopped by GitHub public API rate limiting at `GET /repos/rohitg00/agentmemory/issues/871/comments?per_page=100`. No `gh api` or remote writes were run.
- 2026-06-14: Retried public unauthenticated dry-run with `--include-comments`; GitHub public API rate limit stopped the run at `GET /repos/wbugitlab1/agentmemory/issues?state=all&per_page=100`. Completion now requires explicit current-turn approval for credentialed `gh api` reads and target writes.

## Plan Review Ledger

| ID | Severity | Reviewer | Evidence | Recommended change | Status | Revision |
| --- | --- | --- | --- | --- | --- | --- |
| F1 / RISK-001 / ARCH-001 | High | requirements; risk; architecture | Dry-run/verify could use `gh api` credentialed reads before approval. | Default pre-approval dry-run to public unauthenticated reads, add credentialed-read flag and confirmation gate, and expand approval question. | accepted-fixed | mirror-plan-r2 |
| F2 | High | requirements | Plan omitted `review-and-implement` final review and `verification-before-completion`. | Add final review lanes and completion verification step before handoff. | accepted-fixed | mirror-plan-r2 |
| F3 / VFY-001 | Medium/High | requirements; verification | Verify did not prove labels, body markers, or comments. | Extend verify/report/tests to cover labels, body/title marker, target labels, comment markers, and count mismatches. | accepted-fixed | mirror-plan-r2 |
| F4 | Medium | requirements | Final evidence did not require PR endpoint exclusion counts. | Require `sourceIssueEndpointItems`, `sourcePullRequestItemsExcluded`, and `sourceNonPrIssues` in reports/final notes. | accepted-fixed | mirror-plan-r2 |
| VFY-002 | High | verification | No CLI fixture tests proved verify failure modes. | Add fake adapter/CLI tests for missing, duplicate, state, PR exclusion, and count mismatch cases. | accepted-fixed | mirror-plan-r2 |
| VFY-003 | High | verification | No CLI safety tests proved dry-run/apply gates. | Add fake adapter/CLI tests for no writes in dry-run, apply gate failures, and read-only verify. | accepted-fixed | mirror-plan-r2 |
| VFY-004 | Medium | verification | Marker invariants did not reject multiple markers in one target issue. | Require exactly one upstream marker per target issue and exactly one target issue per upstream number. | accepted-fixed | mirror-plan-r2 |
| RISK-002 | High | risk | Imported Markdown could trigger mentions, cross-refs, or closing keywords. | Add sanitization requirements and tests plus dry-run counts. | accepted-fixed | mirror-plan-r2 |
| RISK-003 | Medium | risk | Approval question did not authorize existing mirror updates. | Expand approval to create or update labels/issues/comments/state. | accepted-fixed | mirror-plan-r2 |
| RISK-004 | Medium | risk | No explicit rate-limit or partial-apply recovery plan. | Add sequential writes, delay, Retry-After/secondary-limit stop behavior, and resumable reports. | accepted-fixed | mirror-plan-r2 |
| ARCH-002 | Medium | architecture | Comment import completion marker alone could duplicate comments after partial failure. | Add per-source-comment chunk markers and retry planning. | accepted-fixed | mirror-plan-r2 |
| ARCH-003 | Medium | architecture | Oversized issue bodies could exceed GitHub limits. | Add bounded issue-body builder and overflow imported comments while preserving marker. | accepted-fixed | mirror-plan-r2 |
| IMPL-T2-001 | Important | spec compliance | `parseExistingMirrorMarkers()` treated target PR endpoint items with markers as valid mirrors. | Exclude target issue endpoint items with `pull_request` before marker parsing. | accepted-fixed | task-2-review |
| IMPL-T2-002 | Important | spec compliance | Multiple valid upstream markers in one target body were reported invalid but only the first was indexed, allowing creates for the other marker numbers. | Treat multi-marker target issues as invalid mirrors for all contained upstream numbers and block duplicate creates. | accepted-fixed | task-2-review |
| IMPL-T2-003 | Important | spec compliance | Oversized issue-body overflow comments had no stable marker and were planned repeatedly for existing mirrors. | Add stable overflow markers and skip already imported overflow chunks. | accepted-fixed | task-2-review |
| IMPL-T2-004 | Important | spec compliance re-review | Overflow idempotence test timed out because the imported Markdown sanitizer used a slow cross-repo reference regex on large plain text. | Replace the sanitizer with linear-time handling and add a large-input regression test. | accepted-fixed | task-2-rereview |
| IMPL-T2-005 | Important | spec compliance re-review | A multi-marker target with one valid and one malformed source marker blocked only the valid upstream number, so it could still create a duplicate for the malformed marker's contained number. | Extract source issue numbers from all raw upstream issue markers in multi-marker bodies when possible and block those upstream numbers. | accepted-fixed | task-2-rereview |
| IMPL-T2-006 | Important | spec compliance re-review | `planVerification()` could pass an oversized source issue even when required overflow comment markers were missing. | Verify required `upstream-overflow` markers for oversized issue bodies and fail on missing chunks or count mismatch. | accepted-fixed | task-2-rereview |
| IMPL-T2-007 | Important | spec compliance final review | Malformed multi-marker extraction only detected `rohitg00/agentmemory#N` immediately after `upstream-issue:`, missing markers that contained the source repo later in the marker body. | Extract all source repo issue references from raw upstream marker bodies and block those upstream numbers. | accepted-fixed | task-2-final-review |
| IMPL-T2-008 | Important | spec compliance final review | `planVerification()` deduplicated overflow markers before comparing counts, so duplicate identical overflow comments could pass verification. | Compare overflow marker occurrence count and expected marker set so duplicate same-marker comments fail. | accepted-fixed | task-2-final-review |
| IMPL-T2-009 | Important | spec compliance final review | Single malformed upstream marker bodies containing `rohitg00/agentmemory#N` were invalid but did not block creates for that contained upstream number. | Extract contained source issue refs from every invalid raw marker, including single malformed marker bodies. | accepted-fixed | task-2-final-review |
| IMPL-T2-010 | Important | code quality | `planIssueActions()` detected title drift but `update-issue` actions could not carry the corrected title payload. | Add `title` to the update action contract and assert it in tests. | accepted-fixed | task-2-quality-review |
| IMPL-T2-011 | Important | code quality re-review | `chunkTextWithHeader()` used per-chunk body-room offsets, so marker-length changes could skip or duplicate source text across chunks. | Switch to cursor-based chunking and add reconstruction tests for imported comments and overflow chunks. | accepted-fixed | task-2-quality-review |
| IMPL-T3-001 | Important | spec compliance | `GhGitHubClient` used `gh api --paginate` without `--slurp`, so multi-page credentialed reads could misparse concatenated page JSON. | Use `--slurp` for paginated `gh api` reads and flatten the page array. | accepted-fixed | task-3-review |
| IMPL-T3-002 | Important | spec compliance | CLI reports hardcoded `sanitizationCountsAvailable: false` and zero counts, so dry-run/apply evidence lacked requested sanitization counts. | Add report-side sanitization counting and tests with nonzero counts. | accepted-fixed | task-3-review |
| IMPL-T3-003 | Minor | spec compliance | Tests did not assert `--read-with-gh` fails before gh usage without `--confirm-credentialed-reads`. | Add a fake-client gate test for unconfirmed `--read-with-gh`. | accepted-fixed | task-3-review |
| IMPL-T3-004 | Important | spec compliance re-review | JSON reports had only aggregate counts, so dry-run could not audit exact planned issue/label/comment/close/update actions before writes. | Add bounded planned action detail to reports with identifiers and body hashes/previews. | accepted-fixed | task-3-rereview |
| IMPL-T3-005 | Important | spec compliance re-review | Apply wrote reports only after the loop and did not persist applied/failed action evidence after each write batch for partial-apply recovery. | Record applied/failed action detail and write the report after successful writes and before failures return. | accepted-fixed | task-3-rereview |
| IMPL-T3-006 | Important | spec compliance re-review | Imported comment summary marker `<!-- upstream-comments-imported: ... count=M -->` was not planned or verified. | Implement idempotent summary marker planning and verification. | accepted-fixed | task-3-rereview |
| IMPL-T3-007 | Important | code quality | `gh api --field` was used with source-derived strings, allowing `@file` magic reads by the GitHub CLI during apply. | Use `--raw-field` or equivalent safe argv construction and add tests for `@...`, numeric-looking labels, and multiline bodies. | accepted-fixed | task-3-quality-review |
| IMPL-T3-008 | Minor | code quality | Tests did not cover actual `createGhGitHubClient` argv construction for edge-case strings. | Expose/test narrow argv builders without executing `gh`. | accepted-fixed | task-3-quality-review |
| IMPL-T3-009 | Important | code quality re-review | `buildGhUpdateIssueArgs()` omitted labels when `labels: []`, so apply could not clear stale target labels. | Explicitly encode empty label arrays for update payloads and test the generated args/payload. | accepted-fixed | task-3-quality-review |
| IMPL-DRYRUN-001 | Important | live dry-run | Public dry-run planned creates for 377 missing mirrors but no close actions for the 232 upstream issues that are already closed. | Plan `close-issue` with `targetNumber: null` for missing closed upstream issues and verify apply ordering. | accepted-fixed | dry-run-review |
| FINAL-MAINT-001 | Important | maintainability final review | Dry-run report `plannedActions` used unsorted planner order while apply executes sorted action order, making the approval report misleading for apply/resume. | Report planned actions in shared apply execution order and add ordering tests. | accepted-fixed | final-review |
| FINAL-COV-001 | Important | test coverage final review | Successful apply was not tested end-to-end through post-apply verification with a mutable fake client. | Add mutable fake-client apply success test asserting `exitCode === 0` and `verification.ok === true`. | accepted-fixed | final-review |
| FINAL-COV-002 | Important | test coverage final review | Apply-time `RateLimitStopError` after partial writes lacked direct coverage for exit code 2 and persisted action evidence. | Add apply rate-limit test after one successful write. | accepted-fixed | final-review |
