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
| PR issue tracker plan | Self-review and `/review-plan` | Done | `upstream-pr-issues-plan-r4` accepted by correctness, GitHub safety, and implementation/test review lanes. |
| Durable ADR decision | `adr list`, ADR content review | Pending | Planned via `adr new "Track upstream pull requests as fork issues"`. |
| Operator workflow docs | Markdown fence check and content review | Pending | Planned in `docs/recipes/upstream-pr-issue-tracking.md`. |
| Pure planner library | `npm test -- test/upstream-pr-issue-tracker.test.ts` | Pending | Tests planned for marker parsing, dedupe, body generation, decision preservation, and verification. |
| Dry-run CLI | Dry-run JSON report | Pending | Planned CLI defaults to dry-run and reports all planned writes. |
| Apply mode | Explicit confirmation plus GitHub API writes | Pending | Must not run without current-turn confirmation. |
| Verify mode | Verification JSON report | Pending | Must prove exactly one fork issue marker per upstream PR. |

## Progress Notes

- 2026-06-14: User asked to plan tracking every upstream PR as issues in the fork, using `writing-plans`, then `review-plan`.
- 2026-06-14: Current remotes already use the fork-first convention: `origin` is `https://github.com/wbugitlab1/agentmemory.git`, `upstream` is `https://github.com/rohitg00/agentmemory.git`.
- 2026-06-14: A parallel task exists for normal upstream issue mirroring: `docs/todos/2026-06-14-mirror-upstream-issues/`.
- 2026-06-14: Self-review before the second review round tightened the expected ADR path to `docs/adr/0002-track-upstream-pull-requests-as-fork-issues.md` and added the missing operator workflow docs matrix row.
- 2026-06-14: Review revision `upstream-pr-issues-plan-r4` expanded apply confirmation to include credentialed reads of upstream PRs, target issues, and target labels, and added pre-write JSON payload validation before `gh api --input`.

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

## Plan Review Acceptance

Revision accepted: `upstream-pr-issues-plan-r4`

Review lanes:
- Correctness and missed requirements: accepted.
- GitHub API approval gates, public-write safety, security, and remote state risk: accepted.
- Implementation feasibility, sequencing, tests, observability, and recovery: accepted.

Local sanity checks:
- `git diff --check`: passed.
- Length-aware Markdown fence check for `plan.md` and `todo.md`: passed.
- Placeholder/stale-term scan on `plan.md`: no actionable stale hits; remaining `--field body=...` and `-f body=...` references are explicit prohibitions.

Residual risks:
- Apply depends on live GitHub state still matching the reviewed dry-run at confirmation time; the plan mitigates this with `--from-report`, plan hash/action ID drift checks, and fail-before-write behavior.
- Runtime GitHub permissions and rate limits can still block apply; the plan requires fail-closed handling and safe report metadata.
- Implementation must keep action ID/hash normalization stable across public and credentialed readers.
- Payload validation must distinguish generated marker metadata from imported upstream PR body text so the required marker does not become a false positive.
- The adjacent normal-issue mirror task still contains stale remote terminology; this plan explicitly warns not to copy it without correcting `origin` = fork and `upstream` = original.
