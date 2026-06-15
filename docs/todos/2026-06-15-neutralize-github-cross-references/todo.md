# Neutralize GitHub Cross References Task

Task id: `2026-06-15-neutralize-github-cross-references`

## Scope

Repair the GitHub mirror tooling and existing fork backlog items so public mirror issues in `wbugitlab1/agentmemory` do not create active cross-reference links back to `rohitg00/agentmemory`.

## Sprint Contract

Goal: stop future upstream cross-reference creation and remove active cross-reference source strings from existing fork issue bodies and comments.

Scope:
- Update normal issue mirror markers, PR tracker markers, source metadata, overflow markers, comment markers, and comment-source metadata to neutral non-autolinking forms.
- Preserve parsing compatibility for previously created old marker forms so existing mirrors remain discoverable.
- Add a dedicated repair CLI that reads existing fork issues/comments, detects source-repo autolinks, rewrites only changed bodies/comments, supports dry-run/apply/verify, writes JSON reports, and stops fail-closed on GitHub errors.
- Apply the repair to existing `wbugitlab1/agentmemory` issues/comments after the user explicitly approved remote edits.

Non-goals:
- Do not delete fork issues or upstream timeline entries.
- Do not create the 36 missing PR tracker issues while repairing references.
- Do not change repository visibility; GitHub rejected public fork to private with `HTTP 422`.
- Do not post comments to upstream.

Acceptance criteria:
- Tests fail first for old autolinking marker/source behavior.
- Future mirror issue bodies/comments contain no direct `https://github.com/rohitg00/agentmemory/...` URLs and no `rohitg00/agentmemory#N` references.
- Existing old marker forms remain parseable.
- Repair dry-run reports all issue/comment updates without writes.
- Repair apply edits only existing target issue bodies/comments and writes checkpoint reports.
- Repair verify reports zero active source-repo autolink matches in fork issue bodies/comments that it can read.

Intended verification:
- `npm test -- test/issue-mirror.test.ts test/upstream-pr-issue-tracker.test.ts test/github-cross-reference-neutralizer.test.ts`
- `git diff --check`
- Targeted Semgrep for changed GitHub scripts/tests
- Repair dry-run/apply/verify reports
- `gitleaks protect --staged --redact` before any commit

Known boundaries:
- Editing existing GitHub issues/comments is a remote state change and may trigger notifications/events; the user gave current-turn approval with "ja tu das".
- GitHub may retain historical upstream timeline cross-reference events even after source issue bodies/comments are neutralized.
- Large batches of GitHub PATCH requests can hit secondary rate limits; the repair CLI must checkpoint and be resumable.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Durable ADR | `adr list`, ADR review | Done | `docs/adr/0004-avoid-github-cross-references-in-mirrored-backlog-items.md`; `adr list` shows ADR 0001 through 0004. |
| Neutral marker generation | Unit tests | Done | `npm test -- test/issue-mirror.test.ts test/upstream-pr-issue-tracker.test.ts test/github-cross-reference-neutralizer.test.ts` passed with 80 tests. |
| Backward-compatible marker parsing | Unit tests | Done | Tests cover old issue/PR markers and new neutral markers. |
| Repair CLI | Unit tests and dry-run report | Done | Dry-run scanned 878 issues and 572 comments; planned 877 issue updates and 572 comment updates; projected active references from 2727 to 0 with no writes. |
| Remote repair apply | GitHub PATCH reports | Done | Apply patched 877 issue bodies and 572 comments; no failed update and no errors. |
| Final verify | Repair verify report | Done | Verify scanned 878 issues and 572 comments; active source references before/after are both 0; `wroteRemote: false`. |
| Local verification | Targeted tests, whitespace check, targeted Semgrep | Done | 80 targeted tests passed; `git diff --check` passed; Semgrep scanned 9 changed files with 0 findings. |

## Progress Notes

- 2026-06-15: User approved the repair with "ja tu das. nie wieder cross referenzen und entferne die aktiven referezen".
- 2026-06-15: Created ADR 0004 and generated `docs/adr/README.md`.
- 2026-06-15: Added failing tests for neutral issue markers, neutral PR markers, old-marker compatibility, and a dedicated cross-reference neutralizer.
- 2026-06-15: Implemented neutral marker generation and old-marker parsers for issue mirror and PR tracker tooling.
- 2026-06-15: Added `scripts/github/neutralize-github-cross-references.ts` for target-only dry-run/apply/verify repair.
- 2026-06-15: Repair dry-run wrote `dry-run-report.json`: 878 issues scanned, 572 comments scanned, 877 issue updates planned, 572 comment updates planned, 2727 active source references before and 0 after, `wroteRemote: false`.
- 2026-06-15: Repair apply wrote `apply-report.json`: 877 issue bodies and 572 comments patched, no failed update, no errors.
- 2026-06-15: Repair verify wrote `verify-report.json`: 878 issues scanned, 572 comments scanned, 0 issue updates, 0 comment updates, 0 active source references, `wroteRemote: false`.
- 2026-06-15: Fresh local verification passed after the Semgrep-driven regex hardening patch: 3 targeted Vitest files / 80 tests passed; `git diff --check` passed; targeted Semgrep reported 0 findings across 9 changed files.
- 2026-06-15: Upstream PR `rohitg00/agentmemory#904` still reports the historical `cross-referenced` timeline event from `wbugitlab1/agentmemory#393`; active fork references are removed, but GitHub still retains the historical upstream timeline event.
- 2026-06-15: After creating the 36 remaining PR tracker issues, `verify-after-create-missing-prs.json` scanned 914 issues and 572 comments with 0 active source references and no writes.

## Final Review Notes

- Future generated mirror markers no longer use `rohitg00/agentmemory#N`.
- Future generated source metadata omits direct GitHub source URLs from public mirror issues/comments.
- Existing old marker formats remain parseable for migration and verification.
- Existing readable fork issue bodies/comments no longer contain active source-repo autolinks according to the repair verifier.
- The local repair tooling passed targeted Vitest, whitespace, and Semgrep verification.
- Residual risk: GitHub may continue showing historical upstream cross-reference timeline events that were created before this repair.
